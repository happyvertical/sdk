import { GoogleMapsOptions, IGeoProvider, Location } from '../shared/types';
/**
 * Google Maps provider implementation with in-memory caching
 */
export declare class GoogleMapsProvider implements IGeoProvider {
    private client;
    private apiKey;
    private timeout;
    private maxResults;
    private cache;
    constructor(options: GoogleMapsOptions);
    /**
     * Initializes the memory cache for geocoding results
     */
    private initCache;
    /**
     * Generates a cache key for geocoding requests
     */
    private getCacheKey;
    /**
     * Look up locations based on a query string
     */
    lookup(query: string): Promise<Location[]>;
    /**
     * Reverse geocode from coordinates to location
     */
    reverseGeocode(latitude: number, longitude: number): Promise<Location[]>;
    /**
     * Map Google Geocoding API result to standardized Location
     */
    private mapGoogleResultToLocation;
}
//# sourceMappingURL=google.d.ts.map