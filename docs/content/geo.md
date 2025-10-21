---
id: geo
title: "@have/geo: Geographical Information"
sidebar_label: "@have/geo"
sidebar_position: 5
---

# @have/geo

Standardized geographical information interface supporting multiple providers (Google Maps, OpenStreetMap).

## Features

- 🗺️ **Multi-Provider Support**: Google Maps and OpenStreetMap with a unified API
- 🎯 **Type-Safe**: Full TypeScript support with comprehensive type definitions
- 🔍 **Location Lookup**: Search for places by name, address, or point of interest
- 📍 **Reverse Geocoding**: Convert coordinates to location information
- 🌍 **Standardized Output**: Consistent `Location` objects regardless of provider
- ⚡ **Smart Rate Limiting**: Built-in rate limiting for OpenStreetMap
- 🎨 **Factory Pattern**: Clean provider initialization with type guards

## Installation

```bash
npm install @have/geo
# or
pnpm add @have/geo
# or
yarn add @have/geo
```

## Quick Start

### Google Maps

```typescript
import { getGeoAdapter } from '@have/geo';

const adapter = await getGeoAdapter({
  provider: 'google',
  apiKey: process.env.GOOGLE_MAPS_API_KEY!
});

// Look up a location
const results = await adapter.lookup('Eiffel Tower, Paris');
console.log(results[0]);
// {
//   id: 'ChIJLU7jZClu5kcR4PcOOO6p3I0',
//   type: 'point_of_interest',
//   name: 'Eiffel Tower, Champ de Mars, 5 Av. Anatole France, 75007 Paris, France',
//   latitude: 48.8583701,
//   longitude: 2.2944813,
//   addressComponents: { ... },
//   countryCode: 'FR',
//   raw: { ... }
// }

// Reverse geocode coordinates
const locations = await adapter.reverseGeocode(48.8584, 2.2945);
console.log(locations[0].name);
```

### OpenStreetMap

```typescript
import { getGeoAdapter } from '@have/geo';

const adapter = await getGeoAdapter({
  provider: 'openstreetmap',
  rateLimitDelay: 1000 // 1 second between requests (default)
});

// Look up a location
const results = await adapter.lookup('Big Ben, London');
console.log(results[0]);

// Reverse geocode
const locations = await adapter.reverseGeocode(51.5007, -0.1246);
console.log(locations[0]);
```

### Using Environment Variables

The package supports configuration via environment variables using the `HAVE_GEO_*` pattern:

```bash
# Set up environment variables
export HAVE_GEO_PROVIDER=google
export GOOGLE_MAPS_API_KEY=your-api-key-here
export HAVE_GEO_TIMEOUT=15000
export HAVE_GEO_MAX_RESULTS=5
```

```typescript
import { getGeoAdapter } from '@have/geo';

// Create adapter using environment variables
const adapter = await getGeoAdapter();
// Uses HAVE_GEO_PROVIDER=google and GOOGLE_MAPS_API_KEY from environment

// Or override specific options while using env vars for others
const customAdapter = await getGeoAdapter({
  maxResults: 20  // Override env var HAVE_GEO_MAX_RESULTS
});
```

## API Reference

### `getGeoAdapter(options?)`

Factory function to create a geo adapter instance.

**Options:** (all optional when using environment variables)

```typescript
// Google Maps
{
  provider: 'google';
  apiKey: string;
  timeout?: number;        // Request timeout (default: 10000ms)
  maxResults?: number;     // Max results to return (default: 10)
}

// OpenStreetMap
{
  provider: 'openstreetmap';
  userAgent?: string;      // Custom User-Agent (optional)
  rateLimitDelay?: number; // Delay between requests (default: 1000ms)
  timeout?: number;        // Request timeout (default: 10000ms)
  maxResults?: number;     // Max results to return (default: 10)
}
```

### Environment Variables

The package supports configuration via environment variables. User-provided options always take precedence over environment variables.

| Environment Variable | Type | Description | Example |
|---------------------|------|-------------|---------|
| `HAVE_GEO_PROVIDER` | string | Provider to use ('google' or 'openstreetmap') | `google` |
| `GOOGLE_MAPS_API_KEY` | string | Google Maps API key (for Google provider) | `AIza...` |
| `HAVE_GEO_TIMEOUT` | number | Request timeout in milliseconds | `15000` |
| `HAVE_GEO_MAX_RESULTS` | number | Maximum number of results to return | `5` |
| `HAVE_GEO_RATE_LIMIT_DELAY` | number | Delay between requests for OpenStreetMap (ms) | `2000` |
| `HAVE_GEO_USER_AGENT` | string | Custom User-Agent for OpenStreetMap | `MyApp/1.0` |

**Example:**

```bash
# .env file
HAVE_GEO_PROVIDER=google
GOOGLE_MAPS_API_KEY=your-api-key
HAVE_GEO_TIMEOUT=20000
HAVE_GEO_MAX_RESULTS=10
```

```typescript
// No options needed - uses environment variables
const adapter = await getGeoAdapter();

// Mix environment variables with explicit options
// (explicit options take precedence)
const customAdapter = await getGeoAdapter({
  timeout: 30000  // Overrides HAVE_GEO_TIMEOUT
});
```

### `IGeoAdapter` Interface

```typescript
interface IGeoAdapter {
  lookup(query: string): Promise<Location[]>;
  reverseGeocode(latitude: number, longitude: number): Promise<Location[]>;
}
```

### `Location` Object

```typescript
interface Location {
  id: string;                    // Provider-specific unique identifier
  type: 'country' | 'region' | 'city' | 'address' | 'point_of_interest' | 'unknown';
  name: string;                  // Formatted address/name
  latitude: number;              // Latitude coordinate
  longitude: number;             // Longitude coordinate
  addressComponents: {           // Address broken into components
    streetNumber?: string;
    streetName?: string;
    city?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  };
  countryCode: string;           // ISO 3166-1 alpha-2 code
  timezone?: string;             // Timezone (when available)
  raw: any;                      // Original provider response
}
```

## Error Handling

The package provides typed errors for common failure scenarios:

```typescript
import {
  GeoError,
  InvalidQueryError,
  RateLimitError,
  AuthenticationError,
  NoResultsError
} from '@have/geo';

try {
  const results = await adapter.lookup('Paris, France');
} catch (error) {
  if (error instanceof InvalidQueryError) {
    console.error('Invalid query:', error.message);
  } else if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded, try again later');
  } else if (error instanceof AuthenticationError) {
    console.error('API authentication failed');
  } else if (error instanceof GeoError) {
    console.error('Geo operation failed:', error.message);
  }
}
```

## Usage Examples

### Finding Multiple Locations

```typescript
const adapter = await getGeoAdapter({
  provider: 'google',
  apiKey: process.env.GOOGLE_MAPS_API_KEY!,
  maxResults: 5
});

const results = await adapter.lookup('Springfield');
// Returns up to 5 locations named Springfield
results.forEach(location => {
  console.log(`${location.name} - ${location.countryCode}`);
});
```

### Reverse Geocoding with Validation

```typescript
import { validateCoordinates } from '@have/geo';

const lat = 40.7128;
const lng = -74.0060;

const validation = validateCoordinates(lat, lng);
if (validation.valid) {
  const results = await adapter.reverseGeocode(lat, lng);
  console.log(results[0].name);
} else {
  console.error(validation.error);
}
```

### Working with Address Components

```typescript
const results = await adapter.lookup('1600 Amphitheatre Parkway, Mountain View');
const location = results[0];

console.log(location.addressComponents);
// {
//   streetNumber: '1600',
//   streetName: 'Amphitheatre Parkway',
//   city: 'Mountain View',
//   region: 'California',
//   country: 'United States',
//   postalCode: '94043'
// }
```

### Accessing Raw Provider Data

```typescript
const results = await adapter.lookup('Tokyo Tower');
const location = results[0];

// Access provider-specific data
console.log(location.raw); // Full Google Maps or OSM response
```

## Provider Comparison

| Feature | Google Maps | OpenStreetMap |
|---------|-------------|---------------|
| API Key Required | ✅ Yes | ❌ No |
| Rate Limiting | Generous quota | 1 req/sec (free) |
| Data Quality | Excellent | Very Good |
| Coverage | Global | Global |
| Cost | Paid (with free tier) | Free |
| Timezone Data | Sometimes | Rarely |

## Best Practices

### Google Maps

- Store API key securely in environment variables
- Monitor usage to avoid unexpected costs
- Use appropriate quota limits in production

### OpenStreetMap

- Always use a descriptive User-Agent
- Respect rate limits (1 request per second for free tier)
- Consider caching results to reduce API calls
- Read the [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)

## Testing

```bash
# Run tests (requires GOOGLE_MAPS_API_KEY for Google tests)
npm test

# Run only OpenStreetMap tests (no API key needed)
npm test openstreetmap.integration.test.ts
```

## License

ISC

## Contributing

Contributions welcome! Please ensure:
- Code passes TypeScript compilation
- Tests are included for new features
- Follow existing code style (2 spaces, single quotes)
- Respect rate limits in tests
