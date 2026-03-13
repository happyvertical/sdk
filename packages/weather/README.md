# @happyvertical/weather

Weather data provider abstraction for the HAppyVertical SDK.

## Overview

The `@happyvertical/weather` package provides a unified interface for fetching weather forecasts from multiple providers. It follows the same architectural pattern as `@happyvertical/ai`, `@happyvertical/files`, and `@happyvertical/sql`.

## Supported Providers

- **Environment Canada** - Government weather service for Canadian locations (free)
- **OpenWeatherMap** - Global weather data with free and paid tiers
  - Standard API: 5-day/3-hour forecasts (free tier)
  - One Call API 3.0: 48hr hourly + 8-day daily forecasts (paid tier)

## Installation

```bash
pnpm add @happyvertical/weather
```

## Claude Code Context

Install Claude Code context files for AI-assisted development:

```bash
npx have-weather-context
```

This copies the package's `AGENT.md` documentation and `metadata.json` metadata to your project's `.claude/` directory, enabling Claude to provide better assistance when working with this package.

## Usage

### Basic Example

```typescript
import { getWeatherAdapter } from '@happyvertical/weather';

// Create adapter for Environment Canada
const weather = await getWeatherAdapter({
  provider: 'environment-canada'
});

// Fetch forecast for a location (latitude, longitude)
const forecasts = await weather.fetchForLocation(51.0447, -114.0719);

forecasts.forEach(forecast => {
  console.log(`${forecast.timestamp}: ${forecast.temperature}°C - ${forecast.conditions}`);
});
```

### OpenWeatherMap (Free Tier)

```typescript
const weather = await getWeatherAdapter({
  provider: 'openweathermap',
  apiKey: process.env.OPENWEATHER_API_KEY
});

const forecasts = await weather.fetchForLocation(51.0447, -114.0719);
```

### OpenWeatherMap One Call (Paid Tier)

```typescript
const weather = await getWeatherAdapter({
  provider: 'openweathermap-onecall',
  apiKey: process.env.OPENWEATHER_API_KEY
});

const forecasts = await weather.fetchForLocation(51.0447, -114.0719);
```

### Environment Variable Configuration

```bash
# .env
HAVE_WEATHER_PROVIDER=openweathermap
OPENWEATHER_API_KEY=your-api-key-here
HAVE_WEATHER_TIMEOUT=15000
```

```typescript
// Automatically uses environment variables
const weather = await getWeatherAdapter();
const forecasts = await weather.fetchForLocation(51.0447, -114.0719);
```

## API Reference

### `getWeatherAdapter(options?): Promise<IWeatherAdapter>`

Factory function for creating weather adapters.

**Options:**
- `provider`: `'environment-canada' | 'openweathermap' | 'openweathermap-onecall'`
- `apiKey`: API key (required for OpenWeatherMap providers)
- `timeout`: Request timeout in milliseconds (default: 10000)

### `IWeatherAdapter`

```typescript
interface IWeatherAdapter {
  fetchForLocation(
    latitude: number,
    longitude: number,
    options?: FetchOptions
  ): Promise<WeatherForecast[]>

  testConnection(): Promise<boolean>

  supportsLocation(latitude: number, longitude: number): Promise<boolean>
}
```

### `WeatherForecast`

```typescript
interface WeatherForecast {
  timestamp: Date
  temperature: number      // °C
  feelsLike?: number       // °C
  temperatureMin?: number  // °C
  temperatureMax?: number  // °C
  conditions: string       // Human-readable description
  humidity: number         // Percentage 0-100
  windSpeed: number        // km/h
  windDirection?: number   // Degrees 0-360
  windGust?: number        // km/h
  pressure?: number        // hPa
  cloudCover?: number      // Percentage 0-100
  visibility?: number      // km
  precipProbability?: number  // Percentage 0-100
  precipAmount?: number    // mm
  confidence?: number      // Provider's confidence 0-100
  raw: any                 // Provider-specific raw data
}
```

## Environment Variables

| Variable | Type | Description |
|----------|------|-------------|
| `HAVE_WEATHER_PROVIDER` | string | Provider name |
| `OPENWEATHER_API_KEY` | string | OpenWeatherMap API key |
| `HAVE_WEATHER_TIMEOUT` | number | Request timeout (ms) |

## Provider Comparison

| Feature | Environment Canada | OpenWeatherMap | OWM One Call |
|---------|-------------------|----------------|--------------|
| **Cost** | Free | Free tier available | Paid |
| **Coverage** | Canada only | Global | Global |
| **Forecast** | Day/night | 3-hour for 5 days | Hourly + daily |
| **API Key** | Not required | Required | Required |
| **Update Frequency** | ~hourly | 3 hours | hourly |

## License

MIT
