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
 * Options for POI (point-of-interest) searches.
 *
 * `types` and `keyword` are both forwarded to the backing provider but each
 * provider interprets them slightly differently:
 *
 * - **Google**: `types[0]` becomes the request's `type` filter (Places API
 *   accepts a single type per request; additional entries are ignored).
 *   `keyword` is a free-text match across name/type/address/reviews.
 * - **OpenStreetMap (Overpass)**: `types` are matched against
 *   `amenity`, `shop`, and `tourism` tag values (e.g. `'cafe'`,
 *   `'supermarket'`, `'museum'`). When omitted, the provider searches across
 *   a broad set of POI-ish tag keys (`amenity`, `shop`, `tourism`,
 *   `leisure`, `office`, `historic`). `keyword` is appended as a substring
 *   filter on the `name` tag.
 */
export interface PoiSearchOptions {
  /** Filter results to POIs matching these category values. See notes above. */
  types?: string[];
  /** Free-text keyword to narrow the search. */
  keyword?: string;
  /** Max results to return. Default 20. */
  limit?: number;
  /** Preferred language for place names (Google only). */
  language?: string;
}

/**
 * Geo provider interface - all providers must implement lookup and
 * reverseGeocode. `findPoisNear` is optional — providers implement it when
 * they support POI discovery beyond reverse geocoding. Callers that need to
 * know whether a given instance supports POI search should feature-detect:
 *
 * ```ts
 * if (typeof adapter.findPoisNear === 'function') { ... }
 * ```
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

  /**
   * Find POIs (point-of-interest places — businesses, landmarks, amenities)
   * within a radius of a coordinate. Returns locations with
   * `type: 'point_of_interest'` whose coords lie inside the requested
   * radius, sorted by the provider's relevance ranking.
   *
   * @param latitude - Center latitude
   * @param longitude - Center longitude
   * @param radiusMeters - Search radius in meters
   * @param options - Optional filters
   * @returns Promise resolving to array of matching Location objects
   */
  findPoisNear?(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    options?: PoiSearchOptions,
  ): Promise<Location[]>;
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

  /**
   * Find POIs near a coordinate. Optional — see `GeoProvider.findPoisNear`.
   */
  findPoisNear?(
    latitude: number,
    longitude: number,
    radiusMeters: number,
    options?: PoiSearchOptions,
  ): Promise<Location[]>;
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
