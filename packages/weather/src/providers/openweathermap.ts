/**
 * OpenWeatherMapProvider - Fetch weather data from OpenWeatherMap API
 *
 * Uses the 5-day/3-hour forecast API (free tier) to fetch detailed weather forecasts.
 * API Documentation: https://openweathermap.org/forecast5
 *
 * Free tier limits:
 * - 1,000,000 calls per month
 * - 60 calls per minute
 * - Forecasts every 3 hours for 5 days (40 data points)
 *
 * Coverage: Global
 * API Key: Required (free tier available)
 * Update Frequency: Every 3 hours
 * Data Format: JSON
 */

import type {
  FetchOptions,
  HistoricalFetchOptions,
  IWeatherProvider,
  WeatherForecast,
} from '../shared/types';
import {
  AuthenticationError,
  RateLimitError,
  UnsupportedWeatherCapabilityError,
  WeatherError,
} from '../shared/types';
import {
  ensureValidCoordinates,
  metersPerSecondToKmPerHour,
  metersToKilometers,
  roundToInt,
} from '../shared/utils';

interface OWMForecastData {
  cod: string;
  cnt: number;
  list: Array<{
    dt: number; // Unix timestamp
    main: {
      temp: number;
      feels_like: number;
      temp_min: number;
      temp_max: number;
      pressure: number;
      sea_level?: number;
      grnd_level?: number;
      humidity: number;
      temp_kf?: number;
    };
    weather: Array<{
      id: number;
      main: string;
      description: string;
      icon: string;
    }>;
    clouds: {
      all: number; // Cloudiness percentage
    };
    wind: {
      speed: number;
      deg: number;
      gust?: number;
    };
    visibility?: number;
    pop: number; // Probability of precipitation (0-1)
    rain?: {
      '3h': number; // Rain volume for last 3 hours (mm)
    };
    snow?: {
      '3h': number; // Snow volume for last 3 hours (mm)
    };
    sys: {
      pod: 'd' | 'n'; // Part of day (day/night)
    };
    dt_txt: string; // Timestamp as text
  }>;
  city: {
    id: number;
    name: string;
    coord: {
      lat: number;
      lon: number;
    };
    country: string;
    population?: number;
    timezone: number; // Seconds shift from UTC
    sunrise: number; // Unix timestamp
    sunset: number; // Unix timestamp
  };
}

export class OpenWeatherMapProvider implements IWeatherProvider {
  readonly name = 'OpenWeatherMap';
  readonly providerType = 'commercial' as const;

  private readonly apiBase = 'https://api.openweathermap.org/data/2.5/forecast';
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(options: { apiKey: string; timeout?: number }) {
    if (!options.apiKey) {
      throw new AuthenticationError('OpenWeatherMap', 'API key is required');
    }
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 10000;
  }

  /**
   * Fetch weather forecasts for a location
   */
  async fetchForLocation(
    latitude: number,
    longitude: number,
    options?: FetchOptions,
  ): Promise<WeatherForecast[]> {
    // Validate coordinates
    ensureValidCoordinates(this.name, latitude, longitude);

    try {
      // Build API URL and fetch data
      const url = this.buildApiUrl(latitude, longitude);
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        options?.timeout || this.timeout,
      );

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        // Handle specific error codes
        if (response.status === 401 || response.status === 403) {
          throw new AuthenticationError(this.name, 'Invalid API key');
        }

        if (response.status === 429) {
          throw new RateLimitError(this.name);
        }

        throw new WeatherError(
          `API request failed: ${response.statusText}`,
          this.name,
          `HTTP_${response.status}`,
        );
      }

      const data = (await response.json()) as OWMForecastData;

      // Transform data to standardized WeatherForecast objects
      const forecasts = this.transformForecasts(data);

      // Apply limit if specified
      if (options?.limit && options.limit > 0) {
        return forecasts.slice(0, options.limit);
      }

      return forecasts;
    } catch (error) {
      if (error instanceof WeatherError) {
        throw error;
      }

      if ((error as any).name === 'AbortError') {
        throw new WeatherError('Request timeout', this.name, 'TIMEOUT');
      }

      throw new WeatherError(
        `Failed to fetch weather data: ${(error as Error).message}`,
        this.name,
        'FETCH_ERROR',
      );
    }
  }

  async fetchHistoricalForLocation(
    latitude: number,
    longitude: number,
    _options: HistoricalFetchOptions,
  ): Promise<WeatherForecast[]> {
    ensureValidCoordinates(this.name, latitude, longitude);
    throw new UnsupportedWeatherCapabilityError(
      this.name,
      'historical-weather',
      'OpenWeatherMap forecast API does not support standardized historical weather backfill.',
    );
  }

  /**
   * Build the API URL with coordinates and API key
   */
  private buildApiUrl(lat: number, lon: number): string {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lon: lon.toString(),
      appid: this.apiKey,
      units: 'metric', // Celsius
      cnt: '40', // Get all 40 forecast periods (5 days)
    });

    return `${this.apiBase}?${params.toString()}`;
  }

  /**
   * Transform OpenWeatherMap API data to WeatherForecast objects
   */
  private transformForecasts(data: OWMForecastData): WeatherForecast[] {
    const forecasts: WeatherForecast[] = [];

    for (const item of data.list) {
      const forecastTime = new Date(item.dt * 1000);

      forecasts.push({
        timestamp: forecastTime,
        temperature: roundToInt(item.main.temp),
        feelsLike: roundToInt(item.main.feels_like),
        temperatureMin: roundToInt(item.main.temp_min),
        temperatureMax: roundToInt(item.main.temp_max),
        pressure: roundToInt(item.main.pressure),
        humidity: roundToInt(item.main.humidity),
        windSpeed: roundToInt(metersPerSecondToKmPerHour(item.wind.speed)),
        windDirection: item.wind.deg,
        windGust: item.wind.gust
          ? roundToInt(metersPerSecondToKmPerHour(item.wind.gust))
          : undefined,
        conditions: item.weather[0]?.description || 'Unknown',
        cloudCover: item.clouds.all,
        visibility: item.visibility
          ? roundToInt(metersToKilometers(item.visibility))
          : undefined,
        precipProbability: roundToInt(item.pop * 100),
        precipAmount: item.rain?.['3h'] || item.snow?.['3h'] || 0,
        confidence: 95,
        raw: {
          source: 'openweathermap-5day-3hour',
          timestamp: item.dt,
          weather: item.weather,
          partOfDay: item.sys.pod,
          cityData: {
            name: data.city.name,
            country: data.city.country,
            timezone: data.city.timezone,
          },
        },
      });
    }

    return forecasts;
  }

  /**
   * Test connection to OpenWeatherMap API
   */
  async testConnection(): Promise<boolean> {
    try {
      // Test with a known location (Calgary, AB)
      const testUrl = this.buildApiUrl(51.0447, -114.0719);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(testUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if location is supported (OpenWeatherMap is global)
   */
  async supportsLocation(
    latitude: number,
    longitude: number,
  ): Promise<boolean> {
    // OpenWeatherMap supports global locations
    // Just validate coordinates
    const validation = {
      valid:
        !Number.isNaN(latitude) &&
        !Number.isNaN(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180,
    };

    return validation.valid;
  }
}
