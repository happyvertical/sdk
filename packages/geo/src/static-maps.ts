/**
 * Static Map Generation
 *
 * Generates static map URLs and fetches map images for location-based content.
 * Supports Mapbox and Google Maps providers.
 *
 * @example
 * ```typescript
 * import { getStaticMapUrl, fetchStaticMap } from '@happyvertical/geo';
 *
 * // Get URL for embedding
 * const url = getStaticMapUrl(53.5461, -113.4938, {
 *   provider: 'mapbox',
 *   zoom: 14,
 *   width: 1200,
 *   height: 630
 * });
 *
 * // Fetch the actual image
 * const buffer = await fetchStaticMap(53.5461, -113.4938, {
 *   provider: 'mapbox'
 * });
 * await writeFile('map.png', buffer);
 * ```
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Static map provider
 */
export type StaticMapProvider = 'mapbox' | 'google';

/**
 * Mapbox map styles
 * @see https://docs.mapbox.com/api/maps/styles/
 */
export type MapboxStyle =
  | 'streets-v12'
  | 'outdoors-v12'
  | 'light-v11'
  | 'dark-v11'
  | 'satellite-v9'
  | 'satellite-streets-v12';

/**
 * Google Maps map types
 * @see https://developers.google.com/maps/documentation/maps-static/start
 */
export type GoogleMapType = 'roadmap' | 'satellite' | 'terrain' | 'hybrid';

/**
 * Marker definition for the map
 */
export interface StaticMapMarker {
  /** Latitude */
  latitude: number;
  /** Longitude */
  longitude: number;
  /** Marker color (hex or named color) */
  color?: string;
  /** Marker label (single character for Google, any for Mapbox) */
  label?: string;
  /** Marker size ('small' | 'medium' | 'large') */
  size?: 'small' | 'medium' | 'large';
}

/**
 * Options for static map generation
 */
export interface StaticMapOptions {
  /**
   * Map provider
   * @default 'mapbox'
   */
  provider?: StaticMapProvider;

  /**
   * Image width in pixels
   * @default 1200
   */
  width?: number;

  /**
   * Image height in pixels
   * @default 630
   */
  height?: number;

  /**
   * Zoom level (1-20)
   * @default 14
   */
  zoom?: number;

  /**
   * Marker color (hex without # or named color)
   * @default 'e74c3c' (red)
   */
  markerColor?: string;

  /**
   * Show a marker at the center point
   * @default true
   */
  showMarker?: boolean;

  /**
   * Mapbox access token (required for Mapbox provider)
   * Falls back to MAPBOX_ACCESS_TOKEN env var
   */
  mapboxToken?: string;

  /**
   * Google Maps API key (required for Google provider)
   * Falls back to GOOGLE_MAPS_API_KEY env var
   */
  googleApiKey?: string;

  /**
   * Mapbox style
   * @default 'streets-v12'
   */
  mapboxStyle?: MapboxStyle;

  /**
   * Google map type
   * @default 'roadmap'
   */
  googleMapType?: GoogleMapType;

  /**
   * Pixel density (1 or 2 for retina)
   * @default 1
   */
  scale?: 1 | 2;

  /**
   * Additional markers to display
   */
  markers?: StaticMapMarker[];
}

/**
 * Result from fetching a static map
 */
export interface StaticMapResult {
  /** PNG image buffer */
  buffer: Buffer;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** MIME type */
  mimeType: 'image/png';
  /** The URL that was fetched */
  url: string;
}

// ============================================================================
// URL Generators
// ============================================================================

/**
 * Generate Mapbox static map URL
 */
function getMapboxUrl(
  latitude: number,
  longitude: number,
  options: StaticMapOptions,
): string {
  const token =
    options.mapboxToken ??
    process.env.MAPBOX_ACCESS_TOKEN ??
    process.env.MAPBOX_TOKEN;
  if (!token) {
    throw new Error(
      'Mapbox access token required. Provide via options.mapboxToken or MAPBOX_ACCESS_TOKEN env var.',
    );
  }

  const width = options.width ?? 1200;
  const height = options.height ?? 630;
  const zoom = options.zoom ?? 14;
  const style = options.mapboxStyle ?? 'streets-v12';
  const scale = options.scale ?? 1;
  const showMarker = options.showMarker ?? true;

  // Build overlay for marker
  let overlay = '';
  if (showMarker) {
    const color = (options.markerColor ?? 'e74c3c').replace('#', '');
    // Mapbox marker format: pin-{size}-{label}+{color}({lon},{lat})
    overlay = `pin-l+${color}(${longitude},${latitude})/`;
  }

  // Add additional markers
  if (options.markers?.length) {
    const markerOverlays = options.markers.map((m) => {
      const color = (m.color ?? 'e74c3c').replace('#', '');
      const size = m.size === 'small' ? 's' : m.size === 'large' ? 'l' : 'm';
      const label = m.label ? `-${m.label}` : '';
      return `pin-${size}${label}+${color}(${m.longitude},${m.latitude})`;
    });
    overlay = markerOverlays.join(',') + '/';
  }

  const retinaStr = scale === 2 ? '@2x' : '';

  return `https://api.mapbox.com/styles/v1/mapbox/${style}/static/${overlay}${longitude},${latitude},${zoom}/${width}x${height}${retinaStr}?access_token=${token}`;
}

/**
 * Generate Google Maps static map URL
 */
function getGoogleUrl(
  latitude: number,
  longitude: number,
  options: StaticMapOptions,
): string {
  const apiKey =
    options.googleApiKey ??
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Google Maps API key required. Provide via options.googleApiKey or GOOGLE_MAPS_API_KEY env var.',
    );
  }

  const width = options.width ?? 1200;
  const height = options.height ?? 630;
  const zoom = options.zoom ?? 14;
  const mapType = options.googleMapType ?? 'roadmap';
  const scale = options.scale ?? 1;
  const showMarker = options.showMarker ?? true;

  const params = new URLSearchParams({
    center: `${latitude},${longitude}`,
    zoom: zoom.toString(),
    size: `${width}x${height}`,
    maptype: mapType,
    scale: scale.toString(),
    key: apiKey,
  });

  // Add center marker
  if (showMarker) {
    const color = (options.markerColor ?? 'red').replace('#', '0x');
    params.append('markers', `color:${color}|${latitude},${longitude}`);
  }

  // Add additional markers
  if (options.markers?.length) {
    for (const m of options.markers) {
      const color = (m.color ?? 'red').replace('#', '0x');
      const size = m.size ?? 'medium';
      const label = m.label ? `|label:${m.label.charAt(0).toUpperCase()}` : '';
      params.append(
        'markers',
        `color:${color}|size:${size}${label}|${m.latitude},${m.longitude}`,
      );
    }
  }

  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Generate a static map URL
 *
 * Returns a URL that can be used directly in <img> tags or fetched for processing.
 *
 * @param latitude - Center latitude
 * @param longitude - Center longitude
 * @param options - Map options
 * @returns URL string for the static map
 *
 * @example Mapbox (default)
 * ```typescript
 * const url = getStaticMapUrl(53.5461, -113.4938, {
 *   provider: 'mapbox',
 *   zoom: 14,
 *   mapboxStyle: 'streets-v12'
 * });
 * ```
 *
 * @example Google Maps
 * ```typescript
 * const url = getStaticMapUrl(53.5461, -113.4938, {
 *   provider: 'google',
 *   zoom: 14,
 *   googleMapType: 'roadmap'
 * });
 * ```
 *
 * @example With custom markers
 * ```typescript
 * const url = getStaticMapUrl(53.5461, -113.4938, {
 *   showMarker: false,  // Hide center marker
 *   markers: [
 *     { latitude: 53.5461, longitude: -113.4938, color: 'blue', label: 'A' },
 *     { latitude: 53.5500, longitude: -113.4900, color: 'green', label: 'B' }
 *   ]
 * });
 * ```
 */
export function getStaticMapUrl(
  latitude: number,
  longitude: number,
  options: StaticMapOptions = {},
): string {
  const provider = options.provider ?? 'mapbox';

  switch (provider) {
    case 'google':
      return getGoogleUrl(latitude, longitude, options);
    case 'mapbox':
    default:
      return getMapboxUrl(latitude, longitude, options);
  }
}

/**
 * Fetch a static map image
 *
 * Downloads the map image and returns it as a Buffer.
 *
 * @param latitude - Center latitude
 * @param longitude - Center longitude
 * @param options - Map options
 * @returns Promise resolving to the map image result
 *
 * @example
 * ```typescript
 * const result = await fetchStaticMap(53.5461, -113.4938, {
 *   provider: 'mapbox',
 *   width: 1200,
 *   height: 630
 * });
 *
 * await fs.writeFile('map.png', result.buffer);
 * console.log(`Fetched ${result.width}x${result.height} map`);
 * ```
 */
export async function fetchStaticMap(
  latitude: number,
  longitude: number,
  options: StaticMapOptions = {},
): Promise<StaticMapResult> {
  const width = options.width ?? 1200;
  const height = options.height ?? 630;
  const url = getStaticMapUrl(latitude, longitude, options);

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch static map: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    width,
    height,
    mimeType: 'image/png',
    url,
  };
}

/**
 * Generate OG-sized static map URL (1200x630)
 *
 * Convenience function for generating Open Graph / social media sized maps.
 *
 * @param latitude - Center latitude
 * @param longitude - Center longitude
 * @param options - Map options (width/height ignored, set to 1200x630)
 * @returns URL string for the static map
 *
 * @example
 * ```typescript
 * const url = getOGMapUrl(53.5461, -113.4938);
 * // Returns 1200x630 map URL
 * ```
 */
export function getOGMapUrl(
  latitude: number,
  longitude: number,
  options: Omit<StaticMapOptions, 'width' | 'height'> = {},
): string {
  return getStaticMapUrl(latitude, longitude, {
    ...options,
    width: 1200,
    height: 630,
  });
}
