import { Location } from './types';
/**
 * Map Google Maps place types to standardized location types
 */
export declare function mapGooglePlaceType(types: string[]): Location['type'];
/**
 * Map OpenStreetMap place types to standardized location types
 */
export declare function mapOSMPlaceType(type: string, addressType?: string): Location['type'];
/**
 * Extract country code from various formats
 * Normalizes to ISO 3166-1 alpha-2 format
 */
export declare function normalizeCountryCode(code: string | undefined): string;
/**
 * Validate latitude is within valid range
 */
export declare function isValidLatitude(lat: number): boolean;
/**
 * Validate longitude is within valid range
 */
export declare function isValidLongitude(lng: number): boolean;
/**
 * Validate coordinates are within valid ranges
 */
export declare function validateCoordinates(latitude: number, longitude: number): {
    valid: boolean;
    error?: string;
};
//# sourceMappingURL=utils.d.ts.map