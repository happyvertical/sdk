/**
 * OpenWeatherMapOneCallProvider - Fetch weather data from OpenWeatherMap One Call API 3.0
 *
 * Uses the One Call API 3.0 (paid tier) for extended forecast data.
 * API Documentation: https://openweathermap.org/api/one-call-3
 *
 * One Call API 3.0 features:
 * - Current weather
 * - Minute forecast for 1 hour
 * - Hourly forecast for 48 hours
 * - Daily forecast for 8 days
 * - National weather alerts
 * - Historical weather data for 5 previous days
 *
 * Coverage: Global
 * API Key: Required (paid tier)
 * Update Frequency: Hourly
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

interface OWMOneCallData {
  lat: number;
  lon: number;
  timezone: string;
  timezone_offset: number;
  current?: {
    dt: number;
    temp: number;
    feels_like: number;
    pressure: number;
    humidity: number;
    clouds: number;
    visibility: number;
    wind_speed: number;
    wind_deg: number;
    wind_gust?: number;
    weather: Array<{
      id: number;
      main: string;
      description: string;
      icon: string;
    }>;
  };
  hourly?: Array<{
    dt: number;
    temp: number;
    feels_like: number;
    pressure: number;
    humidity: number;
    clouds: number;
    visibility: number;
    wind_speed: number;
    wind_deg: number;
    wind_gust?: number;
    pop: number; // Probability of precipitation
    rain?: {
      '1h': number;
    };
    snow?: {
      '1h': number;
    };
    weather: Array<{
      id: number;
      main: string;
      description: string;
      icon: string;
    }>;
  }>;
  daily?: Array<{
    dt: number;
    sunrise: number;
    sunset: number;
    temp: {
      day: number;
      min: number;
      max: number;
      night: number;
      eve: number;
      morn: number;
    };
    feels_like: {
      day: number;
      night: number;
      eve: number;
      morn: number;
    };
    pressure: number;
    humidity: number;
    wind_speed: number;
    wind_deg: number;
    wind_gust?: number;
    clouds: number;
    pop: number;
    rain?: number;
    snow?: number;
    weather: Array<{
      id: number;
      main: string;
      description: string;
      icon: string;
    }>;
    uvi: number;
  }>;
}

export class OpenWeatherMapOneCallProvider implements IWeatherProvider {
  readonly name = 'OpenWeatherMap One Call';
  readonly providerType = 'commercial' as const;

  private readonly apiBase = 'https://api.openweathermap.org/data/3.0/onecall';
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(options: { apiKey: string; timeout?: number }) {
    if (!options.apiKey) {
      throw new AuthenticationError(
        'OpenWeatherMap One Call',
        'API key is required',
      );
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

        const errorText = await response.text();
        throw new WeatherError(
          `API request failed: ${response.statusText} - ${errorText}`,
          this.name,
          `HTTP_${response.status}`,
        );
      }

      const data = (await response.json()) as OWMOneCallData;

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
      'OpenWeatherMap One Call historical data is not exposed through the standardized adapter yet.',
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
      exclude: 'minutely,alerts', // We only want current, hourly, and daily
    });

    return `${this.apiBase}?${params.toString()}`;
  }

  /**
   * Transform OpenWeatherMap One Call API data to WeatherForecast objects
   */
  private transformForecasts(data: OWMOneCallData): WeatherForecast[] {
    const forecasts: WeatherForecast[] = [];

    // Process hourly forecasts (48 hours)
    if (data.hourly) {
      for (const item of data.hourly) {
        const forecastTime = new Date(item.dt * 1000);

        forecasts.push({
          timestamp: forecastTime,
          temperature: roundToInt(item.temp),
          feelsLike: roundToInt(item.feels_like),
          pressure: roundToInt(item.pressure),
          humidity: roundToInt(item.humidity),
          windSpeed: roundToInt(metersPerSecondToKmPerHour(item.wind_speed)),
          windDirection: item.wind_deg,
          windGust: item.wind_gust
            ? roundToInt(metersPerSecondToKmPerHour(item.wind_gust))
            : undefined,
          conditions: item.weather[0]?.description || 'Unknown',
          cloudCover: item.clouds,
          visibility: item.visibility
            ? roundToInt(metersToKilometers(item.visibility))
            : undefined,
          precipProbability: roundToInt(item.pop * 100),
          precipAmount: item.rain?.['1h'] || item.snow?.['1h'] || 0,
          confidence: 95,
          raw: {
            source: 'openweathermap-onecall-hourly',
            timestamp: item.dt,
            weather: item.weather,
          },
        });
      }
    }

    // Process daily forecasts (8 days)
    if (data.daily) {
      for (const item of data.daily) {
        const forecastTime = new Date(item.dt * 1000);

        forecasts.push({
          timestamp: forecastTime,
          temperature: roundToInt(item.temp.day),
          temperatureMax: roundToInt(item.temp.max),
          temperatureMin: roundToInt(item.temp.min),
          feelsLike: roundToInt(item.feels_like.day),
          pressure: roundToInt(item.pressure),
          humidity: roundToInt(item.humidity),
          windSpeed: roundToInt(metersPerSecondToKmPerHour(item.wind_speed)),
          windDirection: item.wind_deg,
          windGust: item.wind_gust
            ? roundToInt(metersPerSecondToKmPerHour(item.wind_gust))
            : undefined,
          conditions: item.weather[0]?.description || 'Unknown',
          cloudCover: item.clouds,
          precipProbability: roundToInt(item.pop * 100),
          precipAmount: item.rain || item.snow || 0,
          confidence: 95,
          raw: {
            source: 'openweathermap-onecall-daily',
            timestamp: item.dt,
            weather: item.weather,
            sunrise: item.sunrise,
            sunset: item.sunset,
            uvi: item.uvi,
          },
        });
      }
    }

    return forecasts;
  }

  /**
   * Test connection to OpenWeatherMap One Call API
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
   * Check if location is supported (One Call API is global)
   */
  async supportsLocation(
    latitude: number,
    longitude: number,
  ): Promise<boolean> {
    // One Call API supports global locations
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
