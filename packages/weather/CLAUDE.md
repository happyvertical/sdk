# @happyvertical/weather: Weather Data Provider Package

## Purpose and Responsibilities

The `@happyvertical/weather` package provides a standardized interface for weather data retrieval, abstracting away provider-specific implementations. It is designed to:

- **Unify Weather Provider APIs**: Provide a consistent interface across Environment Canada, OpenWeatherMap, and Google Weather
- **Simplify Provider Switching**: Enable seamless switching between weather providers without code changes
- **Handle Forecast Retrieval**: Fetch weather forecasts for any global location (provider-dependent)
- **Manage Provider Configuration**: Handle authentication, timeouts, and provider-specific options
- **Provide Error Handling**: Standardize error handling across different weather provider APIs
- **Optimize for Performance**: Request timeouts, result limiting, and proper error recovery
- **Enable Data Standardization**: Consistent `WeatherForecast` objects across all providers

This package serves as the weather data layer for building location-aware applications that can work with multiple weather providers seamlessly.

## Architecture Overview

The package follows the same architecture pattern as `@happyvertical/ai`, `@happyvertical/files`, and `@happyvertical/geo`:

### Core Components

1. **Factory Function** (`index.ts`)
   - `getWeatherAdapter()` - Factory for creating provider instances
   - Environment variable configuration support
   - Dynamic provider loading

2. **Provider Implementations** (`providers/`)
   - Each provider implements the `IWeatherProvider` interface
   - `environment-canada.ts` - Environment Canada weather service integration (Canada only, free)
   - `openweathermap.ts` - OpenWeatherMap 5-day/3-hour forecast API (global, free tier)
   - `openweathermap-onecall.ts` - OpenWeatherMap One Call API 3.0 (global, paid tier)
   - `google-weather.ts` - Google Weather API (global, paid, 240h hourly + 10 day daily + alerts + history)
   - All providers map results to standardized `WeatherForecast` format

3. **Type Definitions** (`shared/types.ts`)
   - `IWeatherProvider` - Core interface all providers must implement
   - `IWeatherAdapter` - Public adapter interface (identical to IWeatherProvider)
   - `WeatherForecast` - Standardized weather forecast data structure
   - `WeatherAdapterOptions` - Discriminated union of provider options
   - Error classes: `WeatherError`, `RateLimitError`, `AuthenticationError`, etc.

4. **Utilities** (`shared/utils.ts`)
   - Coordinate validation
   - Unit conversion (temperature, wind speed, visibility)
   - Distance calculations
   - Geographic utilities (isInCanada check)

### Key Design Patterns

**Provider Pattern**: Each weather service has its own provider class implementing `IWeatherProvider`
```typescript
export class OpenWeatherMapProvider implements IWeatherProvider {
  async fetchForLocation(lat: number, lng: number): Promise<WeatherForecast[]>
  async testConnection(): Promise<boolean>
  async supportsLocation(lat: number, lng: number): Promise<boolean>
}
```

**Factory Pattern**: Dynamic provider loading with environment variable support
```typescript
const adapter = await getWeatherAdapter({ provider: 'openweathermap', apiKey: '...' });
```

**Error Mapping**: Each provider maps native API errors to standardized types
```typescript
private handleError(error: unknown): WeatherError {
  // Maps provider-specific errors to WeatherError, RateLimitError, etc.
}
```

## Key APIs

### Creating a Weather Adapter

```typescript
import { getWeatherAdapter } from '@happyvertical/weather';

// Create Environment Canada adapter (free, Canada only)
const ecWeather = await getWeatherAdapter({
  provider: 'environment-canada',
  timeout: 10000
});

// Create OpenWeatherMap adapter (free tier, global)
const owmWeather = await getWeatherAdapter({
  provider: 'openweathermap',
  apiKey: process.env.OPENWEATHER_API_KEY
});

// Create OpenWeatherMap One Call adapter (paid tier, global)
const owmOneCallWeather = await getWeatherAdapter({
  provider: 'openweathermap-onecall',
  apiKey: process.env.OPENWEATHER_API_KEY
});

// Create Google Weather adapter (paid, global)
const googleWeather = await getWeatherAdapter({
  provider: 'google-weather',
  apiKey: process.env.GOOGLE_API_KEY
});

// Create adapter using environment variables
// HAVE_WEATHER_PROVIDER=openweathermap
// OPENWEATHER_API_KEY=your-api-key
const weatherFromEnv = await getWeatherAdapter();

// Mix environment variables with explicit options
// (explicit options take precedence)
const mixed = await getWeatherAdapter({
  timeout: 20000  // Overrides HAVE_WEATHER_TIMEOUT if set
});
```

### Environment Variable Configuration

The package supports configuration via environment variables using the `loadEnvConfig()` utility from `@happyvertical/utils`. This enables zero-configuration setup when environment variables are properly configured.

**Supported Environment Variables:**

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `HAVE_WEATHER_PROVIDER` | string | Provider to use | `environment-canada`, `openweathermap`, `openweathermap-onecall`, or `google-weather` |
| `OPENWEATHER_API_KEY` | string | OpenWeatherMap API key | `your-api-key-here` |
| `GOOGLE_API_KEY` | string | Google API key | `your-google-api-key` |
| `HAVE_WEATHER_TIMEOUT` | number | Request timeout (ms) | `15000` |

**Configuration Precedence:**

1. User-provided options (highest priority)
2. Environment variables
3. Default values (lowest priority)

**Example Usage:**

```bash
# .env file
HAVE_WEATHER_PROVIDER=openweathermap
OPENWEATHER_API_KEY=your-api-key
HAVE_WEATHER_TIMEOUT=20000
```

```typescript
// No options needed - uses environment variables
const adapter = await getWeatherAdapter();

// Override specific values
const customAdapter = await getWeatherAdapter({
  timeout: 30000  // Overrides HAVE_WEATHER_TIMEOUT
});
```

### Fetching Weather Forecasts

```typescript
// Fetch forecasts for a location (latitude, longitude)
const forecasts = await adapter.fetchForLocation(51.0447, -114.0719);

// Returns array of WeatherForecast objects
forecasts.forEach(forecast => {
  console.log(`${forecast.timestamp}: ${forecast.temperature}°C`);
  console.log(`Conditions: ${forecast.conditions}`);
  console.log(`Wind: ${forecast.windSpeed} km/h`);
});

// Fetch with options
const forecasts = await adapter.fetchForLocation(51.0447, -114.0719, {
  timeout: 15000,   // Override default timeout
  limit: 10,        // Limit to 10 forecasts
  forceRefresh: true // Force refresh even if cached
});
```

### Testing Connection

```typescript
// Test connection to weather API
const isConnected = await adapter.testConnection();
if (!isConnected) {
  console.error('Failed to connect to weather service');
}
```

### Checking Location Support

```typescript
// Check if provider supports a location
const isSupported = await adapter.supportsLocation(51.0447, -114.0719);

// Environment Canada only supports Canadian locations
const canadaAdapter = await getWeatherAdapter({ provider: 'environment-canada' });
await canadaAdapter.supportsLocation(51.0447, -114.0719); // true (Calgary)
await canadaAdapter.supportsLocation(40.7128, -74.0060); // false (New York)

// OpenWeatherMap supports global locations
const globalAdapter = await getWeatherAdapter({
  provider: 'openweathermap',
  apiKey: '...'
});
await globalAdapter.supportsLocation(40.7128, -74.0060); // true (global coverage)
```

## Important Implementation Details

### Provider-Specific Capabilities

**Environment Canada**:
- **Coverage**: Canada only
- **API Key**: Not required (free, public API)
- **Update Frequency**: Hourly
- **Forecast Periods**: Day/night periods (variable)
- **Data Points**: Current conditions + forecast periods
- **Rate Limits**: Not explicitly enforced
- **Coordinate Validation**: Checks if location is within Canada's bounds

**OpenWeatherMap (Free Tier)**:
- **Coverage**: Global
- **API Key**: Required (free tier available)
- **Update Frequency**: Every 3 hours
- **Forecast Periods**: 3-hour intervals for 5 days (40 data points)
- **Data Points**: Temperature, humidity, wind, precipitation probability, etc.
- **Rate Limits**: 60 calls/minute, 1,000,000 calls/month
- **Features**: Detailed 3-hour forecasts

**OpenWeatherMap One Call (Paid Tier)**:
- **Coverage**: Global
- **API Key**: Required (paid subscription)
- **Update Frequency**: Hourly
- **Forecast Periods**: Hourly (48 hours) + Daily (8 days)
- **Data Points**: Extended data including UV index, sunrise/sunset, etc.
- **Rate Limits**: Higher limits than free tier
- **Features**: Best data coverage and frequency

**Google Weather**:
- **Coverage**: Global
- **API Key**: Required (paid, uses `GOOGLE_API_KEY`)
- **Update Frequency**: Hourly
- **Forecast Periods**: Hourly (up to 240 hours) + Daily (up to 10 days)
- **Data Points**: Temperature, humidity, wind, precipitation, UV index, visibility, etc.
- **Additional Features**:
  - Current conditions
  - Hourly history (24 hours)
  - Weather alerts
- **Pagination**: API paginates results (24 hours/page for hourly, 5 days/page for daily). The provider automatically follows `nextPageToken` to fetch all available data.
  - Full 240-hour hourly forecast requires ~10 API calls
  - Full 10-day daily forecast requires 2 API calls
- **Rate Limits**: Plan-dependent
- **Cost**: Paid (no free tier). Consider API call costs when requesting full forecast range.
- **API Base**: `https://weather.googleapis.com`

### Coordinate Validation

All providers validate coordinates before making API calls:

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

Providers also check location support:
- Environment Canada: Verifies coordinates are within Canada's bounds
- OpenWeatherMap providers: Accept any valid global coordinates
- Google Weather: Accept any valid global coordinates

### Error Handling Strategy

Each provider maps native errors to standardized types:
- HTTP 401/403 → `AuthenticationError`
- HTTP 429 → `RateLimitError`
- Empty results → `NoResultsError`
- Invalid coordinates → `InvalidLocationError`
- Timeout → `WeatherError` with code 'TIMEOUT'
- Everything else → `WeatherError` with provider and code

```typescript
try {
  const forecasts = await adapter.fetchForLocation(lat, lng);
} catch (error) {
  if (error instanceof RateLimitError) {
    // Handle rate limiting
  } else if (error instanceof AuthenticationError) {
    // Handle auth failures
  } else if (error instanceof InvalidLocationError) {
    // Handle invalid location
  } else if (error instanceof NoResultsError) {
    // Handle no results
  }
}
```

### WeatherForecast Structure

All providers return the same `WeatherForecast` structure:

```typescript
{
  timestamp: Date,              // Forecast timestamp
  temperature: number,          // °C
  feelsLike?: number,           // °C (optional)
  temperatureMin?: number,      // °C (optional)
  temperatureMax?: number,      // °C (optional)
  conditions: string,           // Human-readable description
  humidity: number,             // Percentage 0-100
  windSpeed: number,            // km/h
  windDirection?: number,       // Degrees 0-360 (optional)
  windGust?: number,            // km/h (optional)
  pressure?: number,            // hPa (optional)
  cloudCover?: number,          // Percentage 0-100 (optional)
  visibility?: number,          // km (optional)
  precipProbability?: number,   // Percentage 0-100 (optional)
  precipAmount?: number,        // mm (optional)
  confidence?: number,          // Provider's confidence 0-100 (optional)
  raw: any,                     // Original provider response
}
```

### Unit Standardization

All measurements are standardized across providers:
- **Temperature**: Celsius (°C)
- **Wind Speed**: Kilometers per hour (km/h)
- **Visibility**: Kilometers (km)
- **Pressure**: Hectopascals (hPa)
- **Precipitation**: Millimeters (mm)
- **Direction**: Degrees (0-360, where 0 is North)

Conversion utilities are provided:
```typescript
import {
  kelvinToCelsius,
  fahrenheitToCelsius,
  metersPerSecondToKmPerHour,
  milesPerHourToKmPerHour,
  metersToKilometers,
  milesToKilometers,
} from '@happyvertical/weather';
```

### Request Timeouts

All providers support timeout configuration:
- Default timeout: 10,000ms (10 seconds)
- Configurable via options or environment variable
- Throws `WeatherError` with code 'TIMEOUT' on timeout

```typescript
const weather = await getWeatherAdapter({
  provider: 'openweathermap',
  apiKey: '...',
  timeout: 20000  // 20 second timeout
});

// Or per-request
const forecasts = await weather.fetchForLocation(lat, lng, {
  timeout: 15000  // 15 second timeout for this request
});
```

## Dependencies

### Internal Dependencies
- `@happyvertical/utils`: For utility functions, error handling, and environment config

### External Dependencies
None - the package uses native Fetch API for HTTP requests

### Development Dependencies
- `@types/node` (^24.0.0): TypeScript definitions for Node.js
- `typescript` (^5.8.3): TypeScript compiler
- `vite` (^7.1.3): Build tool
- `vite-plugin-dts` (4.3.0): TypeScript declaration file generation
- `vitest` (^3.2.4): Testing framework for unit and integration tests
- `typedoc` (^0.28.3): API documentation generation
- `typedoc-plugin-markdown` (^4.5.0): Markdown output for TypeDoc

## Development Guidelines

### Adding New Providers

To add support for a new weather provider:

1. **Create Provider Implementation**: Implement `IWeatherProvider` in `src/providers/`
2. **Add Type Definitions**: Add provider options to `types.ts`
3. **Update Factory**: Add provider case to factory function in `index.ts`
4. **Add Unit Conversion**: Add any provider-specific unit conversion utilities
5. **Implement Tests**: Create integration tests in `src/`
6. **Update Documentation**: Add provider examples to README and this file

Example provider structure:
```typescript
export class NewProvider implements IWeatherProvider {
  constructor(private options: NewProviderOptions) {}

  async fetchForLocation(lat: number, lng: number): Promise<WeatherForecast[]> {
    // Implementation
  }

  async testConnection(): Promise<boolean> {
    // Implementation
  }

  async supportsLocation(lat: number, lng: number): Promise<boolean> {
    // Implementation
  }

  private transformResponse(response: any): WeatherForecast[] {
    // Map provider response to WeatherForecast
  }
}
```

### Testing Strategy

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run optional tests (requires API keys)
npm run test:optional

# Run specific provider tests
OPENWEATHER_API_KEY=xxx npm test openweathermap
```

**Testing Guidelines:**
- Integration tests use real API calls (marked as `.optional.test.ts`)
- Unit tests mock API responses
- OpenWeatherMap tests require API key in environment
- Google Weather tests require `GOOGLE_API_KEY` in environment
- Environment Canada tests don't require API key
- Tests validate WeatherForecast structure compliance
- Test error conditions (invalid coords, timeouts, auth failures)

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
- **Validate API key presence** before making requests (OpenWeatherMap only)
- **Monitor API usage** to avoid unexpected costs
- **Rotate keys** periodically for security

#### Rate Limiting
- **Always respect provider limits** - especially for free tiers
- **Implement backoff** for rate limit errors
- **Consider caching** frequently requested forecasts
- **Document rate limits** in provider-specific code

#### Error Handling
- **Catch and normalize errors** to standardized types
- **Provide meaningful error messages** with context
- **Log errors** with provider information for debugging
- **Handle timeouts** gracefully with AbortController

#### Performance Optimization
- **Limit result counts** with `limit` option
- **Set reasonable timeouts** to prevent hanging requests
- **Use appropriate provider** for coverage area (e.g., Environment Canada for Canadian locations)
- **Cache forecast data** when appropriate

## Common Patterns and Conventions

### Exports and Module Structure

```typescript
// Public API - use these
export { getWeatherAdapter } from './index';
export type {
  IWeatherAdapter,
  IWeatherProvider,
  WeatherForecast,
  WeatherAlert,
  WeatherAdapterOptions,
  EnvironmentCanadaOptions,
  OpenWeatherMapOptions,
  OpenWeatherMapOneCallOptions,
  GoogleWeatherOptions,
  FetchOptions,
} from './shared/types';
export {
  WeatherError,
  RateLimitError,
  AuthenticationError,
  InvalidLocationError,
  NoResultsError,
} from './shared/types';
export {
  validateCoordinates,
  ensureValidCoordinates,
  isInCanada,
  kelvinToCelsius,
  fahrenheitToCelsius,
  metersPerSecondToKmPerHour,
  milesPerHourToKmPerHour,
  metersToKilometers,
  milesToKilometers,
  calculateDistance,
} from './shared/utils';
```

Provider implementations are not directly exported (use factory function).

### Type-Safe Provider Options

Use discriminated unions for type-safe provider selection:
```typescript
const adapter = await getWeatherAdapter({
  provider: 'openweathermap',  // TypeScript narrows to OpenWeatherMapOptions
  apiKey: '...',              // Type-checked as required for OpenWeatherMap
});
```

### Response Format Standardization

All providers return consistent `WeatherForecast[]` structure:
- Array of forecast objects
- Results sorted by timestamp (ascending)
- Maximum results limited by `limit` option
- All units standardized (see Unit Standardization section)

### Async Pattern

All operations are async to support:
- HTTP requests to weather APIs
- Timeout handling via AbortController
- Error recovery and retry logic

### Naming Conventions

- **Interfaces**: PascalCase with `I` prefix for provider interfaces
- **Types**: PascalCase (`WeatherForecast`, `WeatherAdapterOptions`)
- **Classes**: PascalCase with `Provider` suffix (`OpenWeatherMapProvider`)
- **Functions**: camelCase (`getWeatherAdapter`, `validateCoordinates`)
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

### Environment Canada
- **Strengths**: Free, no API key required, official government data for Canada
- **Weaknesses**: Canada only, day/night periods (less granular than hourly)
- **Best For**: Canadian applications, government/public sector projects
- **Rate Limits**: Not explicitly enforced
- **Cost**: Free

### OpenWeatherMap (Free Tier)
- **Strengths**: Global coverage, 3-hour granularity, free tier available
- **Weaknesses**: Requires API key, rate limits on free tier
- **Best For**: Global applications, 3-hour forecast needs, development/testing
- **Rate Limits**: 60 calls/minute, 1,000,000 calls/month (free tier)
- **Cost**: Free tier available, paid plans for higher limits

### OpenWeatherMap One Call (Paid Tier)
- **Strengths**: Best data coverage (hourly + daily), global, extended forecasts
- **Weaknesses**: Paid subscription required, higher cost for high-volume usage
- **Best For**: Production applications needing hourly data, commercial projects
- **Rate Limits**: Higher limits than free tier (plan-dependent)
- **Cost**: Paid subscription required

### Google Weather
- **Strengths**: Extensive forecast range (240 hours hourly, 10 days daily), weather alerts, historical data, global coverage
- **Weaknesses**: No free tier, requires Google Cloud billing, pagination increases API call count
- **Best For**: Production applications needing long-range forecasts, weather alerts, or historical data
- **Rate Limits**: Plan-dependent
- **Cost**: Paid (no free tier). Full forecasts require multiple API calls due to pagination:
  - 240-hour hourly: ~10 API calls (24 hours per page)
  - 10-day daily: 2 API calls (5 days per page)
- **Unique Features**:
  - Up to 240 hours (10 days) of hourly forecasts (automatically paginated)
  - Weather alerts via `fetchAlerts()`
  - 24-hour historical data via `fetchHourlyHistory()`
  - Current conditions via `fetchCurrentConditions()`

## Future Enhancements

Potential additions to the package:

1. **Additional Providers**
   - Weather.gov (USA)
   - Met Office (UK)
   - Weatherbit
   - Dark Sky API (if available)

2. **Advanced Features**
   - Historical weather data retrieval
   - Weather alerts and warnings
   - Radar and satellite imagery
   - Extended forecast range

3. **Performance**
   - Response caching layer
   - Request deduplication
   - Batch location queries

4. **Data Enrichment**
   - Air quality index
   - Pollen count
   - UV index (already in One Call API)
   - Sunrise/sunset times (already in One Call API)

This package provides a robust foundation for weather data retrieval in the HAVE SDK, designed to be lightweight yet powerful enough for weather-aware applications.
