/**
 * Google Maps provider implementation
 */

import { Client } from '@googlemaps/google-maps-services-js';
import type { CacheAdapter } from '@happyvertical/cache';
import { getCache } from '@happyvertical/cache';
import type {
  GeoProvider,
  GoogleMapsOptions,
  Location,
  PoiSearchOptions,
} from '../shared/types';
import {
  AuthenticationError,
  GeoError,
  InvalidQueryError,
  RateLimitError,
} from '../shared/types';
import {
  mapGooglePlaceType,
  normalizeCountryCode,
  validateCoordinates,
} from '../shared/utils';

/**
 * Google Maps provider implementation with in-memory caching
 */
export class GoogleMapsProvider implements GeoProvider {
  private client: Client;
  private apiKey: string;
  private timeout: number;
  private maxResults: number;
  private cache: CacheAdapter | null = null;

  constructor(options: GoogleMapsOptions) {
    this.client = new Client({});
    this.apiKey = options.apiKey;
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
        namespace: 'geo:google',
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
   * Look up locations based on a query string
   */
  async lookup(query: string): Promise<Location[]> {
    if (!query || query.trim().length === 0) {
      throw new InvalidQueryError(query, 'google');
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
      const response = await this.client.geocode({
        params: {
          address: query,
          key: this.apiKey,
        },
        timeout: this.timeout,
      });

      if (response.data.status === 'ZERO_RESULTS') {
        return [];
      }

      if (response.data.status === 'REQUEST_DENIED') {
        throw new AuthenticationError('google');
      }

      if (response.data.status === 'OVER_QUERY_LIMIT') {
        throw new RateLimitError('google');
      }

      if (response.data.status !== 'OK') {
        throw new GeoError(
          `Google Maps API error: ${response.data.status}`,
          'API_ERROR',
          'google',
        );
      }

      const results = response.data.results.slice(0, this.maxResults);
      const locations = results.map((result) =>
        this.mapGoogleResultToLocation(result),
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
        'google',
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
        'google',
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
      const response = await this.client.reverseGeocode({
        params: {
          latlng: { lat: latitude, lng: longitude },
          key: this.apiKey,
        },
        timeout: this.timeout,
      });

      if (response.data.status === 'ZERO_RESULTS') {
        return [];
      }

      if (response.data.status === 'REQUEST_DENIED') {
        throw new AuthenticationError('google');
      }

      if (response.data.status === 'OVER_QUERY_LIMIT') {
        throw new RateLimitError('google');
      }

      if (response.data.status !== 'OK') {
        throw new GeoError(
          `Google Maps API error: ${response.data.status}`,
          'API_ERROR',
          'google',
        );
      }

      const results = response.data.results.slice(0, this.maxResults);
      const locations = results.map((result) =>
        this.mapGoogleResultToLocation(result),
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
        'google',
      );
    }
  }

  /**
   * Find POIs near a coordinate using the Places API Nearby Search endpoint.
   *
   * Maps to `placesNearby` on the Google Maps Services SDK. Note that Places
   * Nearby Search is a separate product line from Geocoding: it requires the
   * Places API to be enabled for the supplied API key and is billed per
   * request. Results are deduped across multi-type requests by `place_id`.
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
        'google',
      );
    }
    if (!(radiusMeters > 0) || radiusMeters > 50_000) {
      throw new InvalidQueryError(
        `radius ${radiusMeters}m must be in (0, 50000]`,
        'google',
      );
    }

    const limit = options.limit ?? this.maxResults;
    const types =
      options.types && options.types.length > 0 ? options.types : [undefined];

    const cacheKey = this.getCacheKey(
      'pois',
      String(latitude),
      String(longitude),
      String(radiusMeters),
      (options.types ?? []).join(','),
      options.keyword ?? '',
      options.language ?? '',
      String(limit),
    );
    if (this.cache) {
      const cached = await this.cache.get<Location[]>(cacheKey);
      if (cached) return cached;
    }

    try {
      const merged = new Map<string, Location>();
      for (const type of types) {
        const response = await this.client.placesNearby({
          params: {
            location: { lat: latitude, lng: longitude },
            radius: radiusMeters,
            ...(type ? { type } : {}),
            ...(options.keyword ? { keyword: options.keyword } : {}),
            ...(options.language ? { language: options.language as any } : {}),
            key: this.apiKey,
          },
          timeout: this.timeout,
        });

        if (response.data.status === 'ZERO_RESULTS') continue;
        if (response.data.status === 'REQUEST_DENIED') {
          throw new AuthenticationError('google');
        }
        if (response.data.status === 'OVER_QUERY_LIMIT') {
          throw new RateLimitError('google');
        }
        if (response.data.status !== 'OK') {
          throw new GeoError(
            `Google Places API error: ${response.data.status}`,
            'API_ERROR',
            'google',
          );
        }

        for (const result of response.data.results) {
          const location = this.mapGooglePoiToLocation(result);
          if (!merged.has(location.id)) {
            merged.set(location.id, location);
          }
          if (merged.size >= limit) break;
        }
        if (merged.size >= limit) break;
      }

      const locations = [...merged.values()];
      if (this.cache) await this.cache.set(cacheKey, locations);
      return locations;
    } catch (error) {
      if (error instanceof GeoError) throw error;
      throw new GeoError(
        `Failed to find POIs: ${(error as Error).message}`,
        'POI_SEARCH_FAILED',
        'google',
      );
    }
  }

  /**
   * Map Google Places Nearby Search result to standardized Location. The
   * Places schema is a superset of Geocoding (adds `name`, `vicinity`,
   * `types[]` semantics slightly different from geocoding `types`) so this
   * is a separate mapper from `mapGoogleResultToLocation`.
   */
  private mapGooglePoiToLocation(result: any): Location {
    const loc = result.geometry?.location;
    const latitude = loc?.lat ?? 0;
    const longitude = loc?.lng ?? 0;
    const name = result.name
      ? result.vicinity
        ? `${result.name}, ${result.vicinity}`
        : result.name
      : result.vicinity || 'Unknown place';

    return {
      id: result.place_id,
      type: 'point_of_interest',
      name,
      latitude,
      longitude,
      addressComponents: {},
      countryCode: 'XX',
      raw: result,
    };
  }

  /**
   * Map Google Geocoding API result to standardized Location
   */
  private mapGoogleResultToLocation(result: any): Location {
    // Extract address components
    const addressComponents: Location['addressComponents'] = {};
    let countryCode = 'XX';

    for (const component of result.address_components || []) {
      const types = component.types;

      if (types.includes('street_number')) {
        addressComponents.streetNumber = component.long_name;
      }
      if (types.includes('route')) {
        addressComponents.streetName = component.long_name;
      }
      if (types.includes('locality')) {
        addressComponents.city = component.long_name;
      }
      if (types.includes('administrative_area_level_1')) {
        addressComponents.region = component.long_name;
      }
      if (types.includes('country')) {
        addressComponents.country = component.long_name;
        countryCode = component.short_name;
      }
      if (types.includes('postal_code')) {
        addressComponents.postalCode = component.long_name;
      }
    }

    // Extract coordinates
    const location = result.geometry?.location;
    const latitude = location?.lat ?? 0;
    const longitude = location?.lng ?? 0;

    // Determine location type
    const type = mapGooglePlaceType(result.types || []);

    return {
      id: result.place_id,
      type,
      name: result.formatted_address,
      latitude,
      longitude,
      addressComponents,
      countryCode: normalizeCountryCode(countryCode),
      raw: result,
    };
  }
}
