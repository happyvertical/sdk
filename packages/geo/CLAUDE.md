# @have/geo: Geographical Information Package

## Purpose and Responsibilities

The `@have/geo` package provides a standardized interface for geographical information services, abstracting away provider-specific implementations. It is designed to:

- **Unify Geo Provider APIs**: Provide a consistent interface across Google Maps and OpenStreetMap
- **Simplify Provider Switching**: Enable seamless switching between geo providers without code changes
- **Handle Location Lookups**: Search for locations by query string (addresses, cities, POIs)
- **Support Reverse Geocoding**: Convert coordinates to location information
- **Manage Provider Configuration**: Handle authentication, timeouts, and provider-specific options
- **Provide Error Handling**: Standardize error handling across different geo provider APIs
- **Optimize for Performance**: Rate limiting, request timeouts, and result limiting
- **Enable Location Standardization**: Consistent `Location` objects across all providers

This package serves as the geographical information layer for building location-aware applications that can work with multiple geo providers seamlessly.

## Architecture Overview

The package follows the same architecture pattern as `@have/ai`:

### Core Components

1. **Factory Function** (`index.ts`)
   - `getGeoAdapter()` - Factory for creating provider instances with explicit type
   - Type guards for provider options validation
   - Dynamic provider loading

2. **Provider Implementations** (`providers/`)
   - Each provider implements the `IGeoProvider` interface
   - `google.ts` - Google Maps Geocoding API integration
   - `openstreetmap.ts` - OpenStreetMap Nominatim API integration
   - All providers map results to standardized `Location` format

3. **Type Definitions** (`shared/types.ts`)
   - `IGeoProvider` - Core interface all providers must implement
   - `IGeoAdapter` - Public adapter interface (identical to IGeoProvider)
   - `Location` - Standardized location data structure
   - `GeoAdapterOptions` - Discriminated union of provider options
   - Error classes: `GeoError`, `RateLimitError`, `InvalidQueryError`, etc.

4. **Utilities** (`shared/utils.ts`)
   - Provider type mapping functions
   - Coordinate validation
   - Country code normalization

### Key Design Patterns

**Provider Pattern**: Each geo service has its own provider class implementing `IGeoProvider`
```typescript
export class GoogleMapsProvider implements IGeoProvider {
  async lookup(query: string): Promise<Location[]>
  async reverseGeocode(latitude: number, longitude: number): Promise<Location[]>
}
```

**Factory Pattern**: Dynamic provider loading using dynamic imports
```typescript
const adapter = await getGeoAdapter({ provider: 'google', apiKey: '...' });
```

**Error Mapping**: Each provider maps native API errors to standardized types
```typescript
private handleError(error: unknown): GeoError {
  // Maps provider-specific errors to GeoError, RateLimitError, etc.
}
```

## Key APIs

### Creating a Geo Adapter

```typescript
import { getGeoAdapter } from '@have/geo';

// Create Google Maps adapter with explicit options
const googleGeo = await getGeoAdapter({
  provider: 'google',
  apiKey: process.env.GOOGLE_MAPS_API_KEY!,
  timeout: 10000,
  maxResults: 10
});

// Create OpenStreetMap adapter with explicit options
const osmGeo = await getGeoAdapter({
  provider: 'openstreetmap',
  rateLimitDelay: 1000,
  userAgent: 'MyApp/1.0',
  timeout: 10000,
  maxResults: 10
});

// Create adapter using environment variables
// HAVE_GEO_PROVIDER=google
// GOOGLE_MAPS_API_KEY=your-api-key
const geoFromEnv = await getGeoAdapter();

// Mix environment variables with explicit options
// (explicit options take precedence)
const mixed = await getGeoAdapter({
  maxResults: 20  // Overrides HAVE_GEO_MAX_RESULTS if set
});
```

### Environment Variable Configuration

The package supports configuration via environment variables using the `loadEnvConfig()` utility from `@have/utils`. This enables zero-configuration setup when environment variables are properly configured.

**Supported Environment Variables:**

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `HAVE_GEO_PROVIDER` | string | Provider to use | `google` or `openstreetmap` |
| `GOOGLE_MAPS_API_KEY` | string | Google Maps API key | `AIza...` |
| `HAVE_GEO_TIMEOUT` | number | Request timeout (ms) | `15000` |
| `HAVE_GEO_MAX_RESULTS` | number | Max results to return | `5` |
| `HAVE_GEO_RATE_LIMIT_DELAY` | number | OSM rate limit delay (ms) | `2000` |
| `HAVE_GEO_USER_AGENT` | string | Custom User-Agent for OSM | `MyApp/1.0` |

**Configuration Precedence:**

1. User-provided options (highest priority)
2. Environment variables
3. Default values (lowest priority)

**Example Usage:**

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

// Override specific values
const customAdapter = await getGeoAdapter({
  timeout: 30000  // Overrides HAVE_GEO_TIMEOUT
});
```

### Location Lookup

```typescript
// Search by query
const results = await adapter.lookup('Eiffel Tower, Paris');

// Returns array of Location objects
results.forEach(location => {
  console.log(location.name);
  console.log(location.latitude, location.longitude);
  console.log(location.type); // 'point_of_interest', 'city', etc.
});
```

### Reverse Geocoding

```typescript
// Convert coordinates to location
const locations = await adapter.reverseGeocode(48.8584, 2.2945);

console.log(locations[0].name); // "Eiffel Tower, Paris..."
console.log(locations[0].addressComponents);
```

## Important Implementation Details

### Provider-Specific Type Mapping

Each provider uses different type classifications:

**Google Maps Types**:
- `street_address`, `premise` → `address`
- `locality`, `postal_town` → `city`
- `administrative_area_level_1` → `region`
- `country` → `country`
- `point_of_interest`, `establishment` → `point_of_interest`

**OpenStreetMap Types**:
- `house`, `building` → `address`
- `city`, `town`, `village` → `city`
- `state`, `province`, `region` → `region`
- `country` → `country`
- `attraction`, `tourism`, `amenity` → `point_of_interest`

Mapping functions: `mapGooglePlaceType()` and `mapOSMPlaceType()` in `shared/utils.ts`

### Rate Limiting (OpenStreetMap)

OpenStreetMap Nominatim has strict usage policies requiring rate limiting:

```typescript
private async enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - this.lastRequestTime;

  if (timeSinceLastRequest < this.rateLimitDelay) {
    const waitTime = this.rateLimitDelay - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  this.lastRequestTime = Date.now();
}
```

Default: 1 request per second (1000ms delay)

### Coordinate Validation

Both providers validate coordinates before making API calls:

```typescript
export function validateCoordinates(latitude: number, longitude: number) {
  if (latitude < -90 || latitude > 90) {
    return { valid: false, error: 'Invalid latitude' };
  }
  if (longitude < -180 || longitude > 180) {
    return { valid: false, error: 'Invalid longitude' };
  }
  return { valid: true };
}
```

### Error Handling Strategy

Each provider maps native errors to standardized types:
- HTTP 401/403 → `AuthenticationError`
- HTTP 429 → `RateLimitError`
- Empty results → Returns empty array (not an error)
- Invalid query/coordinates → `InvalidQueryError`
- Everything else → `GeoError` with provider and code

```typescript
try {
  const results = await adapter.lookup(query);
} catch (error) {
  if (error instanceof RateLimitError) {
    // Handle rate limiting consistently across all providers
  } else if (error instanceof AuthenticationError) {
    // Handle auth failures
  }
}
```

### Location Structure

All providers return the same `Location` structure:

```typescript
{
  id: string;              // Provider-specific unique ID
  type: LocationType;      // Standardized type
  name: string;            // Formatted address/name
  latitude: number;
  longitude: number;
  addressComponents: {     // All optional
    streetNumber?: string;
    streetName?: string;
    city?: string;
    region?: string;
    country?: string;
    postalCode?: string;
  };
  countryCode: string;     // ISO 3166-1 alpha-2
  timezone?: string;       // Optional, when provider returns it
  raw: any;                // Original provider response
}
```

### Google Maps API Details

Uses `@googlemaps/google-maps-services-js` package:
- **Geocoding API**: For `lookup()` method
- **Reverse Geocoding API**: For `reverseGeocode()` method
- Returns `place_id` as location ID
- Extracts address components from `address_components` array
- Timezone data not included by default (would require separate API call)

### OpenStreetMap API Details

Uses direct HTTP requests to Nominatim:
- **Search endpoint**: `/search` for `lookup()`
- **Reverse endpoint**: `/reverse` for `reverseGeocode()`
- Returns `place_id` as location ID (prefixed with `osm-`)
- Requires User-Agent header (OSM policy)
- Free tier limited to 1 request/second
- Response format: JSON with `addressdetails=1`

## Dependencies

### Internal Dependencies
- `@have/utils`: For utility functions and error handling

### External Dependencies
- `@googlemaps/google-maps-services-js` (^3.4.0): Official Google Maps Services client

### Development Dependencies
- `@types/node` (^24.0.0): TypeScript definitions for Node.js
- `typescript` (^5.7.3): TypeScript compiler
- `vite` (7.1.3): Build tool
- `vite-plugin-dts` (4.3.0): TypeScript declaration file generation
- `vitest` (^3.2.4): Testing framework

## Development Guidelines

### Adding New Providers

To add support for a new geo provider:

1. **Create Provider Implementation**: Implement `IGeoProvider` in `src/providers/`
2. **Add Type Definitions**: Add provider options to `types.ts`
3. **Update Factory**: Add type guards and factory logic in `index.ts`
4. **Create Type Mapping**: Add provider type → Location type mapping utility
5. **Implement Tests**: Create integration tests in `src/`
6. **Update Documentation**: Add provider examples to README and this file

Example provider structure:
```typescript
export class NewProvider implements IGeoProvider {
  constructor(private options: NewProviderOptions) {}

  async lookup(query: string): Promise<Location[]> {
    // Implementation
  }

  async reverseGeocode(lat: number, lng: number): Promise<Location[]> {
    // Implementation
  }

  private mapResultToLocation(result: any): Location {
    // Map provider response to Location
  }
}
```

### Testing Strategy

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run Google Maps tests (requires GOOGLE_MAPS_API_KEY)
GOOGLE_MAPS_API_KEY=xxx npm test google

# Run OpenStreetMap tests (no API key needed)
npm test openstreetmap
```

**Testing Guidelines:**
- Integration tests use real API calls
- Google Maps tests require API key in environment
- OpenStreetMap tests respect rate limits (1 req/sec)
- Tests validate Location structure compliance
- Test error conditions (invalid queries, coordinates)

### Building and Distribution

```bash
# Build package
npm run build

# Build in watch mode
npm run build:watch

# Generate documentation
npm run docs

# Clean build artifacts
npm run clean

# Development mode (build + test watch)
npm run dev
```

### Best Practices

#### API Key Management
- **Never commit API keys** - use environment variables
- **Validate API key presence** before making requests
- **Monitor API usage** to avoid unexpected costs (Google Maps)
- **Rotate keys** periodically for security

#### Rate Limiting
- **Always respect provider limits** - especially for free tiers
- **Implement backoff** for rate limit errors
- **Consider caching** frequently requested locations
- **Document rate limits** in provider-specific code

#### Error Handling
- **Catch and normalize errors** to standardized types
- **Provide meaningful error messages** with context
- **Log errors** with provider information for debugging
- **Handle empty results** gracefully (return empty array, not error)

#### Performance Optimization
- **Limit result counts** with `maxResults` option
- **Set reasonable timeouts** to prevent hanging requests
- **Use connection pooling** when available
- **Cache location lookups** when appropriate

## Common Patterns and Conventions

### Exports and Module Structure

```typescript
// Public API - use these
export { getGeoAdapter } from './index';
export type {
  IGeoAdapter,
  Location,
  GeoAdapterOptions,
  GoogleMapsOptions,
  OpenStreetMapOptions
} from './shared/types';
export {
  GeoError,
  RateLimitError,
  InvalidQueryError,
  AuthenticationError,
  NoResultsError
} from './shared/types';
export {
  validateCoordinates,
  normalizeCountryCode
} from './shared/utils';
```

Provider implementations are not directly exported (use factory function).

### Type-Safe Provider Options

Use discriminated unions for type-safe provider selection:
```typescript
const adapter = await getGeoAdapter({
  provider: 'google',  // TypeScript narrows to GoogleMapsOptions
  apiKey: '...',      // Type-checked as required for Google
});
```

### Response Format Standardization

All providers return consistent `Location[]` structure:
- Empty array for no results (not an error)
- Results sorted by relevance (provider-dependent)
- Maximum results limited by `maxResults` option

### Async Pattern

All operations are async to support:
- HTTP requests to geo APIs
- Rate limiting delays (OpenStreetMap)
- Timeout handling

### Naming Conventions

- **Interfaces**: PascalCase with `I` prefix for provider interfaces
- **Types**: PascalCase (`Location`, `GeoAdapterOptions`)
- **Classes**: PascalCase with `Provider` suffix (`GoogleMapsProvider`)
- **Functions**: camelCase (`getGeoAdapter`, `mapGooglePlaceType`)
- **Private methods**: camelCase with descriptive names

## API Documentation

Auto-generated API documentation using TypeDoc:

```bash
# Generate documentation
npm run docs

# Generate and watch
npm run docs:watch

# View in browser
npm run dev  # Serves at http://localhost:3030
```

Documentation is generated in both HTML and markdown formats:
- `docs/` - HTML documentation
- Package-specific markdown in TypeDoc format

## Provider Comparison

### Google Maps
- **Strengths**: Excellent data quality, comprehensive coverage, rich POI data
- **Weaknesses**: Requires API key, paid service (with free tier), usage limits
- **Best For**: Production applications, POI search, high-quality geocoding
- **Rate Limits**: Generous quota (depends on plan)
- **Cost**: Pay-per-use after free tier

### OpenStreetMap (Nominatim)
- **Strengths**: Free, open data, good global coverage, no API key required
- **Weaknesses**: Strict rate limits (free tier), less POI data than Google
- **Best For**: Development, non-commercial use, open-source projects
- **Rate Limits**: 1 request/second (free tier)
- **Cost**: Free (donations encouraged)

## Future Enhancements

Potential additions to the package:

1. **Additional Providers**
   - Mapbox Geocoding API
   - HERE Geocoding API
   - Azure Maps

2. **Advanced Features**
   - Geocoding batch operations
   - Distance calculations between locations
   - Bounding box queries
   - Language/region preferences

3. **Performance**
   - Response caching layer
   - Request deduplication
   - Connection pooling

4. **Data Enrichment**
   - Timezone lookup service integration
   - Elevation data
   - Demographic information

This package provides a robust foundation for geographical information retrieval in the HAVE SDK, designed to be lightweight yet powerful enough for location-aware applications.
