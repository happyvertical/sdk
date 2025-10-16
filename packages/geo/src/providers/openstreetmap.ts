/**
 * OpenStreetMap (Nominatim) provider implementation
 */

import { getCache } from '@have/cache';
import type { ICacheAdapter } from '@have/cache';
import type {
  IGeoProvider,
  Location,
  OpenStreetMapOptions,
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
 * OpenStreetMap provider using Nominatim API with in-memory caching
 */
export class OpenStreetMapProvider implements IGeoProvider {
  private baseUrl = 'https://nominatim.openstreetmap.org';
  private userAgent: string;
  private rateLimitDelay: number;
  private lastRequestTime = 0;
  private timeout: number;
  private maxResults: number;
  private cache: ICacheAdapter | null = null;

  constructor(options: OpenStreetMapOptions) {
    this.userAgent = options.userAgent || '@have/geo (Node.js)';
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
