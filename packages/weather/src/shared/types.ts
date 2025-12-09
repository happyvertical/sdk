/**
 * Weather package type definitions
 *
 * Provides standardized interfaces for weather data providers
 */

/**
 * Standard weather forecast data structure
 * All providers must return this format
 */
export interface WeatherForecast {
  /** Forecast timestamp */
  timestamp: Date;

  /** Temperature in Celsius */
  temperature: number;

  /** Feels-like temperature in Celsius (optional) */
  feelsLike?: number;

  /** Minimum temperature in Celsius (optional) */
  temperatureMin?: number;

  /** Maximum temperature in Celsius (optional) */
  temperatureMax?: number;

  /** Human-readable conditions description */
  conditions: string;

  /** Humidity percentage (0-100) */
  humidity: number;

  /** Wind speed in km/h */
  windSpeed: number;

  /** Wind direction in degrees (0-360, optional) */
  windDirection?: number;

  /** Wind gust speed in km/h (optional) */
  windGust?: number;

  /** Atmospheric pressure in hPa (optional) */
  pressure?: number;

  /** Cloud cover percentage (0-100, optional) */
  cloudCover?: number;

  /** Visibility in kilometers (optional) */
  visibility?: number;

  /** Precipitation probability percentage (0-100, optional) */
  precipProbability?: number;

  /** Precipitation amount in mm (optional) */
  precipAmount?: number;

  /** Provider's confidence in forecast (0-100, optional) */
  confidence?: number;

  /** Raw provider-specific data */
  raw: any;
}

/**
 * Fetch options for weather data
 */
export interface FetchOptions {
  /** Request timeout in milliseconds */
  timeout?: number;

  /** Maximum number of forecast periods to return */
  limit?: number;

  /** Force refresh even if cached data exists */
  forceRefresh?: boolean;
}

/**
 * Core weather provider interface
 * All weather providers must implement this interface
 */
export interface IWeatherProvider {
  /** Provider name for logging and identification */
  readonly name: string;

  /** Provider type */
  readonly providerType: 'government' | 'community' | 'commercial';

  /**
   * Fetch weather forecasts for a location
   *
   * @param latitude - Location latitude (-90 to 90)
   * @param longitude - Location longitude (-180 to 180)
   * @param options - Fetch options
   * @returns Array of weather forecasts
   */
  fetchForLocation(
    latitude: number,
    longitude: number,
    options?: FetchOptions,
  ): Promise<WeatherForecast[]>;

  /**
   * Test connection to the weather API
   *
   * @returns true if connection successful, false otherwise
   */
  testConnection(): Promise<boolean>;

  /**
   * Check if provider supports a specific location
   *
   * @param latitude - Location latitude
   * @param longitude - Location longitude
   * @returns true if location is supported
   */
  supportsLocation(latitude: number, longitude: number): Promise<boolean>;
}

/**
 * Public weather adapter interface (identical to IWeatherProvider)
 * This is the interface returned by getWeatherAdapter()
 */
export type IWeatherAdapter = IWeatherProvider;

/**
 * Environment Canada provider options
 */
export interface EnvironmentCanadaOptions {
  provider: 'environment-canada';
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * OpenWeatherMap provider options (free tier)
 */
export interface OpenWeatherMapOptions {
  provider: 'openweathermap';
  /** OpenWeatherMap API key (required) */
  apiKey: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * OpenWeatherMap One Call API provider options (paid tier)
 */
export interface OpenWeatherMapOneCallOptions {
  provider: 'openweathermap-onecall';
  /** OpenWeatherMap API key (required) */
  apiKey: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * Google Weather API provider options
 */
export interface GoogleWeatherOptions {
  provider: 'google-weather';
  /** Google API key (required) */
  apiKey: string;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * Weather alert from Google Weather API
 */
export interface WeatherAlert {
  /** Alert identifier */
  id: string;
  /** Alert headline */
  headline: string;
  /** Detailed description */
  description: string;
  /** Severity level */
  severity: string;
  /** Alert start time */
  startTime: Date;
  /** Alert end time */
  endTime: Date;
  /** Raw API response */
  raw: any;
}

/**
 * Discriminated union of all provider options
 */
export type WeatherAdapterOptions =
  | EnvironmentCanadaOptions
  | OpenWeatherMapOptions
  | OpenWeatherMapOneCallOptions
  | GoogleWeatherOptions;

/**
 * Partial provider options for environment variable configuration
 */
export type PartialWeatherAdapterOptions = Partial<
  Omit<EnvironmentCanadaOptions, 'provider'>
> &
  Partial<Omit<OpenWeatherMapOptions, 'provider'>> &
  Partial<Omit<OpenWeatherMapOneCallOptions, 'provider'>> &
  Partial<Omit<GoogleWeatherOptions, 'provider'>> & {
    provider?:
      | 'environment-canada'
      | 'openweathermap'
      | 'openweathermap-onecall'
      | 'google-weather';
  };

/**
 * Weather error - base class for weather-related errors
 */
export class WeatherError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly code?: string,
    public readonly details?: any,
  ) {
    super(message);
    this.name = 'WeatherError';
  }
}

/**
 * Rate limit error - thrown when API rate limit is exceeded
 */
export class RateLimitError extends WeatherError {
  constructor(provider: string, retryAfter?: number) {
    super(
      `Rate limit exceeded for ${provider}${retryAfter ? `. Retry after ${retryAfter}s` : ''}`,
      provider,
      'RATE_LIMIT',
    );
    this.name = 'RateLimitError';
  }
}

/**
 * Authentication error - thrown when API key is invalid or missing
 */
export class AuthenticationError extends WeatherError {
  constructor(provider: string, message?: string) {
    super(
      message || `Authentication failed for ${provider}`,
      provider,
      'AUTH_ERROR',
    );
    this.name = 'AuthenticationError';
  }
}

/**
 * Invalid location error - thrown when location is invalid or unsupported
 */
export class InvalidLocationError extends WeatherError {
  constructor(
    provider: string,
    latitude: number,
    longitude: number,
    message?: string,
  ) {
    super(
      message ||
        `Location (${latitude}, ${longitude}) is invalid or unsupported`,
      provider,
      'INVALID_LOCATION',
      { latitude, longitude },
    );
    this.name = 'InvalidLocationError';
  }
}

/**
 * No results error - thrown when provider returns no forecast data
 */
export class NoResultsError extends WeatherError {
  constructor(provider: string, latitude: number, longitude: number) {
    super(
      `No forecast data available for location (${latitude}, ${longitude})`,
      provider,
      'NO_RESULTS',
      { latitude, longitude },
    );
    this.name = 'NoResultsError';
  }
}
