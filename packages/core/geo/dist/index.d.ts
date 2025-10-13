import { GeoAdapterOptions, IGeoAdapter } from './shared/types';
export * from './shared/types';
export * from './shared/utils';
/**
 * Factory function to create a geo adapter instance
 *
 * @param options - Configuration options for the geo provider
 * @returns Promise resolving to a geo adapter that implements IGeoAdapter
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
export declare function getGeoAdapter(options: GeoAdapterOptions): Promise<IGeoAdapter>;
//# sourceMappingURL=index.d.ts.map