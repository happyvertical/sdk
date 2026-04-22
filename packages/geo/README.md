---
id: geo
title: "@happyvertical/geo: Geographical Information"
sidebar_label: "@happyvertical/geo"
sidebar_position: 5
---

# @happyvertical/geo

Geocoding, reverse geocoding, and static map generation with a unified adapter interface. Supports Google Maps and OpenStreetMap (Nominatim) for geocoding, and Mapbox and Google Maps for static map images. Results are cached in memory automatically.

## Installation

```bash
# GitHub Packages registry
pnpm add @happyvertical/geo
```

Peer dependencies: `@happyvertical/cache`, `@happyvertical/utils`.

## Usage

### Geocoding

```typescript
import { getGeoAdapter } from '@happyvertical/geo';

const adapter = await getGeoAdapter({
  provider: 'google',
  apiKey: process.env.GOOGLE_MAPS_API_KEY!,
});

const results = await adapter.lookup('Eiffel Tower, Paris');
console.log(results[0].name);       // Formatted address
console.log(results[0].latitude);   // 48.8583701
console.log(results[0].countryCode); // FR

const locations = await adapter.reverseGeocode(48.8584, 2.2945);
```

### OpenStreetMap (no API key required)

```typescript
const adapter = await getGeoAdapter({
  provider: 'openstreetmap',
  rateLimitDelay: 1000, // ms between requests (default)
});

const results = await adapter.lookup('Big Ben, London');
```

### POI (Point-of-Interest) search

Both providers implement `findPoisNear(lat, lon, radiusMeters, options?)`
for discovering businesses, landmarks, and amenities around a coordinate.
It's an optional method on the adapter — feature-detect before calling:

```typescript
if (typeof adapter.findPoisNear === 'function') {
  const cafes = await adapter.findPoisNear(48.8566, 2.3522, 300, {
    types: ['cafe'],
    limit: 10,
  });
  for (const cafe of cafes) {
    console.log(cafe.name, '@', cafe.latitude, cafe.longitude);
  }
}
```

**Google** routes the request through the Places API (Nearby Search) so the
API key needs the Places API enabled in Google Cloud in addition to
Geocoding. The first entry of `options.types` becomes the request's `type`
filter; additional entries fan out across separate requests and the results
are deduped by `place_id`. Max radius 50 000 m per Places API.

**OpenStreetMap** uses the public [Overpass API][overpass]. No key, but
the same community use-policy as Nominatim applies — cache aggressively
and reuse a `rateLimitDelay` that matches your traffic. When `types` is
omitted, the query looks across `amenity`, `shop`, `tourism`, `leisure`,
`office`, `historic`, and `craft` tag keys. When supplied, values are
matched against each of those keys so you can pass `['cafe']` or
`['supermarket']` without knowing the exact tag.

[overpass]: https://wiki.openstreetmap.org/wiki/Overpass_API

### Environment Variable Configuration

Set `HAVE_GEO_PROVIDER`, `HAVE_GEO_TIMEOUT`, `HAVE_GEO_MAX_RESULTS`, `HAVE_GEO_RATE_LIMIT_DELAY`, `HAVE_GEO_USER_AGENT`, and `GOOGLE_MAPS_API_KEY` to configure without passing options:

```typescript
const adapter = await getGeoAdapter(); // reads from env
```

User-provided options always take precedence over environment variables.

### Static Maps

Generate static map URLs or fetch map images for embedding:

```typescript
import { getStaticMapUrl, fetchStaticMap, getOGMapUrl } from '@happyvertical/geo';

// Mapbox URL (default provider)
const url = getStaticMapUrl(53.5461, -113.4938, {
  provider: 'mapbox',
  zoom: 14,
  width: 1200,
  height: 630,
});

// Google Maps URL
const googleUrl = getStaticMapUrl(53.5461, -113.4938, {
  provider: 'google',
  googleMapType: 'roadmap',
});

// Fetch image as Buffer
const result = await fetchStaticMap(53.5461, -113.4938, { provider: 'mapbox' });
await fs.writeFile('map.png', result.buffer);

// OG-sized map (1200x630) convenience function
const ogUrl = getOGMapUrl(53.5461, -113.4938);
```

## API

### `getGeoAdapter(options?): Promise<GeoAdapter>`

Factory function returning a geocoding adapter. Options are a discriminated union on `provider`:

| Option | Google | OSM | Description |
|--------|--------|-----|-------------|
| `provider` | `'google'` | `'openstreetmap'` | Required (or set `HAVE_GEO_PROVIDER`) |
| `apiKey` | required | — | Google Maps API key |
| `timeout` | optional | optional | Request timeout ms (default: 10000) |
| `maxResults` | optional | optional | Max results (default: 10) |
| `userAgent` | — | optional | Custom User-Agent for Nominatim |
| `rateLimitDelay` | — | optional | Delay between requests ms (default: 1000) |

### `GeoAdapter` Interface

```typescript
interface GeoAdapter {
  lookup(query: string): Promise<Location[]>;
  reverseGeocode(latitude: number, longitude: number): Promise<Location[]>;
}
```

### `Location`

```typescript
interface Location {
  id: string;
  type: 'country' | 'region' | 'city' | 'address' | 'point_of_interest' | 'unknown';
  name: string;
  latitude: number;
  longitude: number;
  addressComponents: {
    streetNumber?: string; streetName?: string; city?: string;
    region?: string; country?: string; postalCode?: string;
  };
  countryCode: string;
  timezone?: string;
  raw: any;
}
```

### Static Map Functions

- `getStaticMapUrl(lat, lng, options?): string` — Generate a Mapbox or Google static map URL.
- `fetchStaticMap(lat, lng, options?): Promise<StaticMapResult>` — Fetch the map image as a Buffer.
- `getOGMapUrl(lat, lng, options?): string` — Convenience for 1200x630 Open Graph maps.

`StaticMapOptions` supports `provider` (`'mapbox'` | `'google'`), `width`, `height`, `zoom`, `markerColor`, `showMarker`, `mapboxToken`/`googleApiKey`, `mapboxStyle`, `googleMapType`, `scale`, and `markers`.

### Error Classes

All extend `GeoError`:

- `GeoError` — Base error with `code` and `provider` fields
- `InvalidQueryError` — Empty or malformed query
- `RateLimitError` — Provider rate limit exceeded
- `AuthenticationError` — Invalid API key
- `NoResultsError` — No results for query

### Utility Functions

- `validateCoordinates(lat, lng)` — Returns `{ valid, error? }`
- `isValidLatitude(lat)` / `isValidLongitude(lng)` — Bounds check
- `normalizeCountryCode(code)` — Normalize to ISO 3166-1 alpha-2
- `mapGooglePlaceType(types)` / `mapOSMPlaceType(type, addressType?)` — Map provider types to `Location['type']`

## License

ISC
