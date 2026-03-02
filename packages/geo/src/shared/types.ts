/**
 * Core types and interfaces for the Geo library
 */

/**
 * Standardized location data structure
 */
export interface Location {
  /**
   * Unique identifier for the location (from provider)
   */
  id: string;

  /**
   * Type of location
   */
  type:
    | 'country'
    | 'region'
    | 'city'
    | 'address'
    | 'point_of_interest'
    | 'unknown';

  /**
   * Full formatted name/address of the location
   */
  name: string;

  /**
   * Latitude coordinate
   */
  latitude: number;

  /**
   * Longitude coordinate
   */
  longitude: number;

  /**
   * Address components (all optional)
   */
  addressComponents: {
    streetNumber?: string;
    streetName?: string;
    city?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  };

  /**
   * ISO 3166-1 alpha-2 country code
   */
  countryCode: string;

  /**
   * Timezone identifier (optional, populated when provider returns it)
   */
  timezone?: string;

  /**
   * Raw response from the provider (for debugging or provider-specific data)
   */
  raw: any;
}

/**
 * Geo provider interface - all providers must implement this
 */
export interface GeoProvider {
  /**
   * Look up locations based on a query string
   * @param query - Search string (address, city, country, POI, etc.)
   * @returns Promise resolving to array of matching Location objects
   */
  lookup(query: string): Promise<Location[]>;

  /**
   * Reverse geocode from coordinates to location
   * @param latitude - Latitude coordinate
   * @param longitude - Longitude coordinate
   * @returns Promise resolving to array of matching Location objects
   */
  reverseGeocode(latitude: number, longitude: number): Promise<Location[]>;
}

/**
 * Geo adapter interface (structurally identical to GeoProvider)
 */
export interface GeoAdapter {
  /**
   * Look up locations based on a query string
   * @param query - Search string (address, city, country, POI, etc.)
   * @returns Promise resolving to array of matching Location objects
   */
  lookup(query: string): Promise<Location[]>;

  /**
   * Reverse geocode from coordinates to location
   * @param latitude - Latitude coordinate
   * @param longitude - Longitude coordinate
   * @returns Promise resolving to array of matching Location objects
   */
  reverseGeocode(latitude: number, longitude: number): Promise<Location[]>;
}

/**
 * Base configuration options for all providers
 */
export interface BaseGeoOptions {
  /**
   * Request timeout in milliseconds
   */
  timeout?: number;

  /**
   * Maximum number of results to return
   */
  maxResults?: number;
}

/**
 * Google Maps provider options
 */
export interface GoogleMapsOptions extends BaseGeoOptions {
  provider: 'google';
  /**
   * Google Maps API key
   */
  apiKey: string;
}

/**
 * OpenStreetMap provider options
 */
export interface OpenStreetMapOptions extends BaseGeoOptions {
  provider: 'openstreetmap';
  /**
   * Custom User-Agent for OSM requests (optional, defaults to package name)
   */
  userAgent?: string;
  /**
   * Rate limit delay in milliseconds (default: 1000ms for 1 req/sec)
   */
  rateLimitDelay?: number;
}

/**
 * Union type for all provider options
 */
export type GeoAdapterOptions = GoogleMapsOptions | OpenStreetMapOptions;

/**
 * Base error class for geo operations.
 * All geo-specific errors extend this class and include a machine-readable `code`
 * and the `provider` name that produced the error.
 */
export class GeoError extends Error {
  /**
   * @param message - Human-readable error description
   * @param code - Machine-readable error code (e.g. 'RATE_LIMIT', 'AUTH_ERROR')
   * @param provider - Provider that raised the error ('google' | 'openstreetmap')
   */
  constructor(
    message: string,
    public code: string,
    public provider?: string,
  ) {
    super(message);
    this.name = 'GeoError';
  }
}

/**
 * Thrown when the provider's rate limit has been exceeded.
 */
export class RateLimitError extends GeoError {
  /**
   * @param provider - Provider that raised the error
   * @param retryAfter - Seconds to wait before retrying (if known)
   */
  constructor(provider?: string, retryAfter?: number) {
    super(
      `Rate limit exceeded${retryAfter ? `, retry after ${retryAfter}s` : ''}`,
      'RATE_LIMIT',
      provider,
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Thrown when the geocoding query is empty or malformed.
 */
export class InvalidQueryError extends GeoError {
  /**
   * @param query - The invalid query string
   * @param provider - Provider that raised the error
   */
  constructor(query: string, provider?: string) {
    super(`Invalid query: ${query}`, 'INVALID_QUERY', provider);
    this.name = 'InvalidQueryError';
  }
}

/**
 * Thrown when the provider rejects the API key or credentials.
 */
export class AuthenticationError extends GeoError {
  /**
   * @param provider - Provider that raised the error
   */
  constructor(provider?: string) {
    super('Authentication failed', 'AUTH_ERROR', provider);
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown when a geocoding query returns zero results.
 */
export class NoResultsError extends GeoError {
  /**
   * @param query - The query that produced no results
   * @param provider - Provider that raised the error
   */
  constructor(query: string, provider?: string) {
    super(`No results found for query: ${query}`, 'NO_RESULTS', provider);
    this.name = 'NoResultsError';
  }
}
