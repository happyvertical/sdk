/**
 * Shared utilities for weather providers
 */

import { InvalidLocationError } from './types';

/**
 * Validate coordinates
 *
 * @param latitude - Latitude to validate (-90 to 90)
 * @param longitude - Longitude to validate (-180 to 180)
 * @returns Validation result with optional error message
 */
export function validateCoordinates(
  latitude: number,
  longitude: number,
): { valid: boolean; error?: string } {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return { valid: false, error: 'Coordinates must be numbers' };
  }

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return { valid: false, error: 'Coordinates cannot be NaN' };
  }

  if (latitude < -90 || latitude > 90) {
    return {
      valid: false,
      error: `Invalid latitude: ${latitude} (must be between -90 and 90)`,
    };
  }

  if (longitude < -180 || longitude > 180) {
    return {
      valid: false,
      error: `Invalid longitude: ${longitude} (must be between -180 and 180)`,
    };
  }

  return { valid: true };
}

/**
 * Ensure coordinates are valid, throw error if not
 *
 * @param provider - Provider name for error messages
 * @param latitude - Latitude to validate
 * @param longitude - Longitude to validate
 * @throws InvalidLocationError if coordinates are invalid
 */
export function ensureValidCoordinates(
  provider: string,
  latitude: number,
  longitude: number,
): void {
  const validation = validateCoordinates(latitude, longitude);
  if (!validation.valid) {
    throw new InvalidLocationError(
      provider,
      latitude,
      longitude,
      validation.error,
    );
  }
}

/**
 * Convert temperature from Kelvin to Celsius
 *
 * @param kelvin - Temperature in Kelvin
 * @returns Temperature in Celsius
 */
export function kelvinToCelsius(kelvin: number): number {
  return kelvin - 273.15;
}

/**
 * Convert temperature from Fahrenheit to Celsius
 *
 * @param fahrenheit - Temperature in Fahrenheit
 * @returns Temperature in Celsius
 */
export function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

/**
 * Convert wind speed from m/s to km/h
 *
 * @param metersPerSecond - Wind speed in m/s
 * @returns Wind speed in km/h
 */
export function metersPerSecondToKmPerHour(metersPerSecond: number): number {
  return metersPerSecond * 3.6;
}

/**
 * Convert wind speed from mph to km/h
 *
 * @param milesPerHour - Wind speed in mph
 * @returns Wind speed in km/h
 */
export function milesPerHourToKmPerHour(milesPerHour: number): number {
  return milesPerHour * 1.60934;
}

/**
 * Convert visibility from meters to kilometers
 *
 * @param meters - Visibility in meters
 * @returns Visibility in kilometers
 */
export function metersToKilometers(meters: number): number {
  return meters / 1000;
}

/**
 * Convert visibility from miles to kilometers
 *
 * @param miles - Visibility in miles
 * @returns Visibility in kilometers
 */
export function milesToKilometers(miles: number): number {
  return miles * 1.60934;
}

/**
 * Round to nearest integer
 *
 * @param value - Value to round
 * @returns Rounded integer
 */
export function roundToInt(value: number): number {
  return Math.round(value);
}

/**
 * Clamp value between min and max
 *
 * @param value - Value to clamp
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Check if location is in Canada (very rough approximation)
 * Based on latitude/longitude bounding box
 *
 * @param latitude - Location latitude
 * @param longitude - Location longitude
 * @returns true if location appears to be in Canada
 */
export function isInCanada(latitude: number, longitude: number): boolean {
  // Canada approximate bounding box
  // Latitude: 41.7°N to 83.1°N
  // Longitude: -141.0°W to -52.6°W
  return (
    latitude >= 41.7 &&
    latitude <= 83.1 &&
    longitude >= -141.0 &&
    longitude <= -52.6
  );
}

/**
 * Calculate distance between two coordinates using Haversine formula
 *
 * @param lat1 - First latitude
 * @param lon1 - First longitude
 * @param lat2 - Second latitude
 * @param lon2 - Second longitude
 * @returns Distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert degrees to radians
 *
 * @param degrees - Angle in degrees
 * @returns Angle in radians
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
