/**
 * Geo package entry point
 * Provides standardized geographical information interface
 */

import type {
  GeoAdapter,
  GeoAdapterOptions,
  GoogleMapsOptions,
  OpenStreetMapOptions,
} from './shared/types';

// Export all types
export * from './shared/types';
export * from './shared/utils';

/**
 * Type guard for Google Maps options
 */
function isGoogleMapsOptions(
  options: GeoAdapterOptions,
): options is GoogleMapsOptions {
  return options.provider === 'google';
}

/**
 * Type guard for OpenStreetMap options
 */
function isOpenStreetMapOptions(
  options: GeoAdapterOptions,
): options is OpenStreetMapOptions {
  return options.provider === 'openstreetmap';
}

/**
 * Factory function to create a geo adapter instance
 *
 * @param options - Configuration options for the geo provider
 * @returns Promise resolving to a geo adapter that implements GeoAdapter
 *
 * @example
 * ```typescript
 * // Create Google Maps adapter
 * const googleGeo = await getGeoAdapter({
 *   provider: 'google',
 *   apiKey: process.env.GOOGLE_MAPS_API_KEY!
 * });
 *
 * // Create OpenStreetMap adapter
 * const osmGeo = await getGeoAdapter({
 *   provider: 'openstreetmap'
 * });
 *
 * // Use the adapter
 * const locations = await googleGeo.lookup('Eiffel Tower');
 * const coords = await osmGeo.reverseGeocode(48.8584, 2.2945);
 * ```
 */
export async function getGeoAdapter(
  options: GeoAdapterOptions,
): Promise<GeoAdapter> {
  if (isGoogleMapsOptions(options)) {
    const { GoogleMapsProvider } = await import('./providers/google.js');
    return new GoogleMapsProvider(options);
  }

  if (isOpenStreetMapOptions(options)) {
    const { OpenStreetMapProvider } = await import(
      './providers/openstreetmap.js'
    );
    return new OpenStreetMapProvider(options);
  }

  // This should never happen due to TypeScript's discriminated union
  throw new Error(`Unsupported provider: ${(options as any).provider}`);
}
