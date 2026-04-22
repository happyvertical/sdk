/**
 * OpenStreetMap (Nominatim) provider implementation
 */

import type { CacheAdapter } from '@happyvertical/cache';
import { getCache } from '@happyvertical/cache';
import type {
  GeoProvider,
  Location,
  OpenStreetMapOptions,
  PoiSearchOptions,
} from '../shared/types';
import { GeoError, InvalidQueryError, RateLimitError } from '../shared/types';
import {
  mapOSMPlaceType,
  normalizeCountryCode,
  validateCoordinates,
} from '../shared/utils';

/**
 * OpenStreetMap Nominatim API response structure
 */
interface NominatimResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    country?: string;
    postcode?: string;
    country_code?: string;
  };
  type?: string;
  addresstype?: string;
  boundingbox?: string[];
  [key: string]: any;
}

/**
 * Overpass API response element (node or way within the result set).
 */
interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * Escape a literal string for safe interpolation into an Overpass
 * `name~"..."` regex match. Overpass uses POSIX extended regular
 * expressions; we escape the ERE metacharacters plus the enclosing
 * double-quote and backslash so callers can pass arbitrary user-entered
 * keywords without worrying about regex injection or accidental pattern
 * matching.
 */
function escapeOverpassRegex(value: string): string {
  return value.replace(/["\\.*+?^${}()|[\]]/g, '\\$&');
}

/**
 * Tag keys Overpass treats as POI-like. Used when the caller doesn't
 * specify `types` — broad enough to cover businesses, landmarks, and
 * amenities without pulling back every single residential address.
 */
const POI_TAG_KEYS = [
  'amenity',
  'shop',
  'tourism',
  'leisure',
  'office',
  'historic',
  'craft',
];

/**
 * OpenStreetMap provider using Nominatim API with in-memory caching
 */
export class OpenStreetMapProvider implements GeoProvider {
  private baseUrl = 'https://nominatim.openstreetmap.org';
  /**
   * Overpass endpoint for POI search. The public instance has a community
   * use-policy similar to Nominatim's — be polite, cache aggressively, and
   * consider a self-hosted instance if you'd hit it hard.
   */
  private overpassUrl = 'https://overpass-api.de/api/interpreter';
  private userAgent: string;
  private rateLimitDelay: number;
  private lastRequestTime = 0;
  private timeout: number;
  private maxResults: number;
  private cache: CacheAdapter | null = null;

  constructor(options: OpenStreetMapOptions) {
    this.userAgent = options.userAgent || '@happyvertical/geo (Node.js)';
    this.rateLimitDelay = options.rateLimitDelay || 1000; // 1 second default
    this.timeout = options.timeout || 10000;
    this.maxResults = options.maxResults || 10;

    // Initialize memory cache asynchronously
    this.initCache();
  }

  /**
   * Initializes the memory cache for geocoding results
   */
  private async initCache(): Promise<void> {
    try {
      this.cache = await getCache({
        provider: 'memory',
        namespace: 'geo:osm',
        defaultTTL: 86400, // 24 hour cache for location data
        maxSize: 20 * 1024 * 1024, // 20MB
        maxEntries: 5000,
        evictionPolicy: 'lru',
      });
    } catch (error) {
      // Cache initialization failure shouldn't break the provider
      console.warn('Failed to initialize geo cache:', error);
    }
  }

  /**
   * Generates a cache key for geocoding requests
   */
  private getCacheKey(type: string, ...parts: string[]): string {
    return `${type}:${parts.join(':')}`;
  }

  /**
   * Enforce rate limiting by waiting if necessary
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Make HTTP request to Nominatim API
   */
  private async fetchNominatim(
    endpoint: string,
    params: Record<string, string>,
  ): Promise<NominatimResult[]> {
    await this.enforceRateLimit();

    const queryParams = new URLSearchParams({
      ...params,
      format: 'json',
      addressdetails: '1',
      limit: this.maxResults.toString(),
    });

    const url = `${this.baseUrl}/${endpoint}?${queryParams.toString()}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        throw new RateLimitError('openstreetmap');
      }

      if (!response.ok) {
        throw new GeoError(
          `Nominatim API error: ${response.status} ${response.statusText}`,
          'API_ERROR',
          'openstreetmap',
        );
      }

      const data = await response.json();
      // Nominatim search returns array, reverse returns single object
      if (Array.isArray(data)) {
        return data;
      }
      return data ? [data as NominatimResult] : [];
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof GeoError) {
        throw error;
      }

      if ((error as Error).name === 'AbortError') {
        throw new GeoError('Request timeout', 'TIMEOUT', 'openstreetmap');
      }

      throw new GeoError(
        `Failed to fetch from Nominatim: ${(error as Error).message}`,
        'FETCH_FAILED',
        'openstreetmap',
      );
    }
  }

  /**
   * Look up locations based on a query string
   */
  async lookup(query: string): Promise<Location[]> {
    if (!query || query.trim().length === 0) {
      throw new InvalidQueryError(query, 'openstreetmap');
    }

    // Check cache first
    const cacheKey = this.getCacheKey('lookup', query, String(this.maxResults));
    if (this.cache) {
      const cached = await this.cache.get<Location[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const results = await this.fetchNominatim('search', { q: query });
      const locations = results.map((result) =>
        this.mapNominatimResultToLocation(result),
      );

      // Cache the result
      if (this.cache) {
        await this.cache.set(cacheKey, locations);
      }

      return locations;
    } catch (error) {
      if (error instanceof GeoError) {
        throw error;
      }

      throw new GeoError(
        `Failed to lookup location: ${(error as Error).message}`,
        'LOOKUP_FAILED',
        'openstreetmap',
      );
    }
  }

  /**
   * Reverse geocode from coordinates to location
   */
  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<Location[]> {
    const validation = validateCoordinates(latitude, longitude);
    if (!validation.valid) {
      throw new InvalidQueryError(
        `${latitude}, ${longitude}: ${validation.error}`,
        'openstreetmap',
      );
    }

    // Check cache first
    const cacheKey = this.getCacheKey(
      'reverse',
      String(latitude),
      String(longitude),
      String(this.maxResults),
    );
    if (this.cache) {
      const cached = await this.cache.get<Location[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    try {
      const results = await this.fetchNominatim('reverse', {
        lat: latitude.toString(),
        lon: longitude.toString(),
      });

      // Nominatim reverse endpoint returns a single result or empty
      const locations = results.map((result) =>
        this.mapNominatimResultToLocation(result),
      );

      // Cache the result
      if (this.cache) {
        await this.cache.set(cacheKey, locations);
      }

      return locations;
    } catch (error) {
      if (error instanceof GeoError) {
        throw error;
      }

      throw new GeoError(
        `Failed to reverse geocode: ${(error as Error).message}`,
        'REVERSE_GEOCODE_FAILED',
        'openstreetmap',
      );
    }
  }

  /**
   * Find POIs near a coordinate using the public Overpass API. Nominatim
   * only does address-level reverse geocoding — Overpass is the right tool
   * when you want "every café within 200m" kind of queries.
   */
  async findPoisNear(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    options: PoiSearchOptions = {},
  ): Promise<Location[]> {
    const validation = validateCoordinates(latitude, longitude);
    if (!validation.valid) {
      throw new InvalidQueryError(
        `${latitude}, ${longitude}: ${validation.error}`,
        'openstreetmap',
      );
    }
    if (!(radiusMeters > 0)) {
      throw new InvalidQueryError(
        `radius ${radiusMeters}m must be > 0`,
        'openstreetmap',
      );
    }

    const limit = options.limit ?? this.maxResults;
    if (!Number.isInteger(limit) || limit < 1) {
      throw new InvalidQueryError(
        `limit ${limit} must be a positive integer`,
        'openstreetmap',
      );
    }
    const cacheKey = this.getCacheKey(
      'pois',
      String(latitude),
      String(longitude),
      String(radiusMeters),
      (options.types ?? []).join(','),
      options.keyword ?? '',
      String(limit),
    );
    if (this.cache) {
      const cached = await this.cache.get<Location[]>(cacheKey);
      if (cached) return cached;
    }

    await this.enforceRateLimit();

    const query = this.buildOverpassQuery(
      latitude,
      longitude,
      radiusMeters,
      options,
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.overpassUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.status === 429) {
        throw new RateLimitError('openstreetmap');
      }
      if (!response.ok) {
        throw new GeoError(
          `Overpass API error: ${response.status} ${response.statusText}`,
          'API_ERROR',
          'openstreetmap',
        );
      }

      const data = (await response.json()) as { elements?: OverpassElement[] };
      const elements = Array.isArray(data.elements) ? data.elements : [];

      // Overpass returns each POI once per matched tag key, but when we
      // union multiple keys in the query elements can repeat — dedupe by
      // `(type, id)` so "node/42" only appears once regardless of how many
      // tag clauses matched.
      const seen = new Set<string>();
      const locations: Location[] = [];
      for (const element of elements) {
        const key = `${element.type}/${element.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const location = this.mapOverpassElementToLocation(element);
        if (!location) continue;
        locations.push(location);
        if (locations.length >= limit) break;
      }

      if (this.cache) await this.cache.set(cacheKey, locations);
      return locations;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof GeoError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new GeoError('Request timeout', 'TIMEOUT', 'openstreetmap');
      }
      throw new GeoError(
        `Failed to find POIs: ${(error as Error).message}`,
        'POI_SEARCH_FAILED',
        'openstreetmap',
      );
    }
  }

  /**
   * Build an Overpass QL query that collects nodes + ways with POI-shaped
   * tags within `radiusMeters` of the center point. `out center tags`
   * coerces ways/relations into point geometries so downstream mapping
   * doesn't have to deal with geometry types.
   */
  private buildOverpassQuery(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    options: PoiSearchOptions,
  ): string {
    const around = `around:${radiusMeters},${latitude},${longitude}`;
    // `keyword` is documented as a free-text substring filter, but Overpass
    // interprets the right-hand side of `name~"..."` as a POSIX ERE. Escape
    // regex metacharacters so inputs like `C++`, `A.*`, or `Joes [Bar]`
    // match literally instead of silently changing the regex semantics or
    // producing an invalid query.
    const keywordFilter = options.keyword
      ? `[name~"${escapeOverpassRegex(options.keyword)}",i]`
      : '';
    const clauses: string[] = [];

    if (options.types && options.types.length > 0) {
      // Types filter: try each value against each POI tag key. We don't know
      // which key the caller intends (e.g. 'cafe' is an amenity; 'bakery'
      // could be either amenity or shop) so we fan out conservatively.
      for (const value of options.types) {
        const safe = value.replace(/"/g, '\\"');
        for (const key of POI_TAG_KEYS) {
          clauses.push(
            `  node(${around})["${key}"="${safe}"]${keywordFilter};`,
          );
          clauses.push(`  way(${around})["${key}"="${safe}"]${keywordFilter};`);
        }
      }
    } else {
      for (const key of POI_TAG_KEYS) {
        clauses.push(`  node(${around})["${key}"]${keywordFilter};`);
        clauses.push(`  way(${around})["${key}"]${keywordFilter};`);
      }
    }

    return `[out:json][timeout:25];\n(\n${clauses.join('\n')}\n);\nout center tags;`;
  }

  /**
   * Map an Overpass element to a standardized Location. Returns null for
   * tagless elements or ways without a `center` (which can happen when the
   * server falls back to geometry-less output under load).
   */
  private mapOverpassElementToLocation(
    element: OverpassElement,
  ): Location | null {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (lat == null || lon == null) return null;

    const tags = element.tags ?? {};
    const name =
      tags.name ||
      tags['name:en'] ||
      tags.brand ||
      tags.operator ||
      this.derivePoiLabelFromTags(tags) ||
      'Unnamed place';

    return {
      id: `osm-${element.type}-${element.id}`,
      type: 'point_of_interest',
      name,
      latitude: lat,
      longitude: lon,
      addressComponents: {
        streetNumber: tags['addr:housenumber'],
        streetName: tags['addr:street'],
        city: tags['addr:city'],
        region: tags['addr:state'] || tags['addr:province'],
        country: tags['addr:country'],
        postalCode: tags['addr:postcode'],
      },
      countryCode: normalizeCountryCode(tags['addr:country']),
      raw: element,
    };
  }

  /**
   * Produce a readable label from a tag-only element (e.g. a shop with no
   * `name`). Picks the first POI-shaped tag value as a fallback so the
   * caller still gets something meaningful to show operators.
   */
  private derivePoiLabelFromTags(tags: Record<string, string>): string | null {
    for (const key of POI_TAG_KEYS) {
      const value = tags[key];
      if (value) return value.replace(/_/g, ' ');
    }
    return null;
  }

  /**
   * Map Nominatim result to standardized Location
   */
  private mapNominatimResultToLocation(result: NominatimResult): Location {
    const address = result.address || {};

    // Build address components
    const addressComponents: Location['addressComponents'] = {};

    if (address.house_number) {
      addressComponents.streetNumber = address.house_number;
    }
    if (address.road) {
      addressComponents.streetName = address.road;
    }
    if (address.city || address.town || address.village) {
      addressComponents.city = address.city || address.town || address.village;
    }
    if (address.state) {
      addressComponents.region = address.state;
    }
    if (address.country) {
      addressComponents.country = address.country;
    }
    if (address.postcode) {
      addressComponents.postalCode = address.postcode;
    }

    // Determine location type
    const type = mapOSMPlaceType(result.type || '', result.addresstype);

    // Parse coordinates
    const latitude = parseFloat(result.lat);
    const longitude = parseFloat(result.lon);

    return {
      id: `osm-${result.place_id}`,
      type,
      name: result.display_name,
      latitude,
      longitude,
      addressComponents,
      countryCode: normalizeCountryCode(address.country_code),
      raw: result,
    };
  }
}
