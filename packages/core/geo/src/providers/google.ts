/**
 * Google Maps provider implementation
 */

import { Client } from '@googlemaps/google-maps-services-js';
import { getCache } from '@have/cache';
import type { ICacheAdapter } from '@have/cache';
import type {
  GoogleMapsOptions,
  IGeoProvider,
  Location,
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
export class GoogleMapsProvider implements IGeoProvider {
  private client: Client;
  private apiKey: string;
  private timeout: number;
  private maxResults: number;
  private cache: ICacheAdapter | null = null;

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
