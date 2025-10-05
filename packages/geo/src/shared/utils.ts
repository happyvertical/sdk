/**
 * Utility functions for geo operations
 */

import type { Location } from './types';

/**
 * Map Google Maps place types to standardized location types
 */
export function mapGooglePlaceType(types: string[]): Location['type'] {
  if (!types || types.length === 0) return 'unknown';

  // Check in priority order
  if (types.includes('street_address') || types.includes('premise')) {
    return 'address';
  }
  if (types.includes('locality') || types.includes('postal_town')) {
    return 'city';
  }
  if (
    types.includes('administrative_area_level_1') ||
    types.includes('administrative_area_level_2')
  ) {
    return 'region';
  }
  if (types.includes('country')) {
    return 'country';
  }
  if (types.includes('point_of_interest') || types.includes('establishment')) {
    return 'point_of_interest';
  }

  return 'unknown';
}

/**
 * Map OpenStreetMap place types to standardized location types
 */
export function mapOSMPlaceType(
  type: string,
  addressType?: string,
): Location['type'] {
  // OSM uses different classification - check both type and addresstype
  const checkType = (type || '').toLowerCase();
  const checkAddressType = (addressType || '').toLowerCase();

  if (
    checkType === 'house' ||
    checkType === 'building' ||
    checkAddressType === 'house'
  ) {
    return 'address';
  }

  if (
    checkType === 'city' ||
    checkType === 'town' ||
    checkType === 'village' ||
    checkType === 'hamlet' ||
    checkAddressType === 'city' ||
    checkAddressType === 'town' ||
    checkAddressType === 'village'
  ) {
    return 'city';
  }

  if (
    checkType === 'state' ||
    checkType === 'province' ||
    checkType === 'region' ||
    checkAddressType === 'state'
  ) {
    return 'region';
  }

  if (checkType === 'country' || checkAddressType === 'country') {
    return 'country';
  }

  if (
    checkType === 'attraction' ||
    checkType === 'tourism' ||
    checkType === 'amenity'
  ) {
    return 'point_of_interest';
  }

  return 'unknown';
}

/**
 * Extract country code from various formats
 * Normalizes to ISO 3166-1 alpha-2 format
 */
export function normalizeCountryCode(code: string | undefined): string {
  if (!code) return 'XX'; // Unknown country code

  // Already uppercase 2-letter code
  const normalized = code.toUpperCase().trim();

  // If it's already 2 letters, return it
  if (normalized.length === 2) {
    return normalized;
  }

  // If it's 3 letters (alpha-3), we would need a mapping table
  // For now, return as-is or 'XX' for unknown
  return normalized.length === 3 ? normalized : 'XX';
}

/**
 * Validate latitude is within valid range
 */
export function isValidLatitude(lat: number): boolean {
  return typeof lat === 'number' && lat >= -90 && lat <= 90;
}

/**
 * Validate longitude is within valid range
 */
export function isValidLongitude(lng: number): boolean {
  return typeof lng === 'number' && lng >= -180 && lng <= 180;
}

/**
 * Validate coordinates are within valid ranges
 */
export function validateCoordinates(
  latitude: number,
  longitude: number,
): { valid: boolean; error?: string } {
  if (!isValidLatitude(latitude)) {
    return {
      valid: false,
      error: `Invalid latitude: ${latitude}. Must be between -90 and 90.`,
    };
  }

  if (!isValidLongitude(longitude)) {
    return {
      valid: false,
      error: `Invalid longitude: ${longitude}. Must be between -180 and 180.`,
    };
  }

  return { valid: true };
}
