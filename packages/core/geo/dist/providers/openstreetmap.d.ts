import { IGeoProvider, Location, OpenStreetMapOptions } from '../shared/types';
/**
 * OpenStreetMap provider using Nominatim API with in-memory caching
 */
export declare class OpenStreetMapProvider implements IGeoProvider {
    private baseUrl;
    private userAgent;
    private rateLimitDelay;
    private lastRequestTime;
    private timeout;
    private maxResults;
    private cache;
    constructor(options: OpenStreetMapOptions);
    /**
     * Initializes the memory cache for geocoding results
     */
    private initCache;
    /**
     * Generates a cache key for geocoding requests
     */
    private getCacheKey;
    /**
     * Enforce rate limiting by waiting if necessary
     */
    private enforceRateLimit;
    /**
     * Make HTTP request to Nominatim API
     */
    private fetchNominatim;
    /**
     * Look up locations based on a query string
     */
    lookup(query: string): Promise<Location[]>;
    /**
     * Reverse geocode from coordinates to location
     */
    reverseGeocode(latitude: number, longitude: number): Promise<Location[]>;
    /**
     * Map Nominatim result to standardized Location
     */
    private mapNominatimResultToLocation;
}
//# sourceMappingURL=openstreetmap.d.ts.map