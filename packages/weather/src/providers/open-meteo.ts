/**
 * OpenMeteoProvider - Fetch weather data from Open-Meteo APIs
 *
 * Uses Open-Meteo forecast and historical archive endpoints. The archive
 * endpoint provides long-range hourly weather backfill without an API key.
 * Archive data is published with a 5-7 day lag, so very recent windows are
 * rejected with a descriptive range error instead of a generic no-results error.
 */

import {
  filterHistoricalWindow,
  formatUtcDate,
  normalizeHistoricalWindow,
} from '../shared/historical';
import type {
  FetchOptions,
  HistoricalFetchOptions,
  IWeatherProvider,
  WeatherForecast,
} from '../shared/types';
import { NoResultsError, RateLimitError, WeatherError } from '../shared/types';
import {
  ensureValidCoordinates,
  metersToKilometers,
  roundToInt,
} from '../shared/utils';

const ARCHIVE_PUBLISHING_LAG_MS = 5 * 24 * 60 * 60 * 1000;

interface OpenMeteoHourlyData {
  time: string[];
  temperature_2m?: Array<number | null>;
  relative_humidity_2m?: Array<number | null>;
  precipitation?: Array<number | null>;
  weather_code?: Array<number | null>;
  cloud_cover?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  wind_direction_10m?: Array<number | null>;
  wind_gusts_10m?: Array<number | null>;
  visibility?: Array<number | null>;
}

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone?: string;
  hourly?: OpenMeteoHourlyData;
  hourly_units?: Record<string, string>;
  reason?: string;
  error?: boolean;
}

export class OpenMeteoProvider implements IWeatherProvider {
  readonly name = 'Open-Meteo';
  readonly providerType = 'community' as const;

  private readonly forecastApiBase = 'https://api.open-meteo.com/v1/forecast';
  private readonly archiveApiBase =
    'https://archive-api.open-meteo.com/v1/archive';
  private readonly timeout: number;

  constructor(options: { timeout?: number } = {}) {
    this.timeout = options.timeout || 10000;
  }

  async fetchForLocation(
    latitude: number,
    longitude: number,
    options?: FetchOptions,
  ): Promise<WeatherForecast[]> {
    ensureValidCoordinates(this.name, latitude, longitude);

    const params = this.buildBaseParams(latitude, longitude);
    params.set('forecast_days', '7');

    const data = await this.fetchJson(
      `${this.forecastApiBase}?${params.toString()}`,
      options?.timeout,
    );
    const forecasts = this.transformHourlyData(data, 'open-meteo-forecast');

    if (forecasts.length === 0) {
      throw new NoResultsError(this.name, latitude, longitude);
    }

    if (options?.limit && options.limit > 0) {
      return forecasts.slice(0, options.limit);
    }

    return forecasts;
  }

  async fetchHistoricalForLocation(
    latitude: number,
    longitude: number,
    options: HistoricalFetchOptions,
  ): Promise<WeatherForecast[]> {
    ensureValidCoordinates(this.name, latitude, longitude);

    const window = normalizeHistoricalWindow(this.name, options);
    const latestArchiveEnd = new Date(Date.now() - ARCHIVE_PUBLISHING_LAG_MS);

    if (window.end.getTime() > latestArchiveEnd.getTime()) {
      throw new WeatherError(
        'Open-Meteo archive data is published with a 5-7 day lag',
        this.name,
        'INVALID_DATE_RANGE',
        {
          requestedEnd: window.end.toISOString(),
          latestSupportedEnd: latestArchiveEnd.toISOString(),
        },
      );
    }

    const params = this.buildBaseParams(latitude, longitude);
    params.set('start_date', formatUtcDate(window.start));
    params.set('end_date', formatUtcDate(window.end));

    const data = await this.fetchJson(
      `${this.archiveApiBase}?${params.toString()}`,
      options.timeout,
    );
    const forecasts = filterHistoricalWindow(
      this.transformHourlyData(data, 'open-meteo-archive'),
      window,
      options.limit,
    );

    if (forecasts.length === 0) {
      throw new NoResultsError(this.name, latitude, longitude);
    }

    return forecasts;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.forecastApiBase}?latitude=51.0447&longitude=-114.0719&hourly=temperature_2m&forecast_days=1&timezone=UTC`,
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async supportsLocation(
    latitude: number,
    longitude: number,
  ): Promise<boolean> {
    return (
      !Number.isNaN(latitude) &&
      !Number.isNaN(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }

  private buildBaseParams(
    latitude: number,
    longitude: number,
  ): URLSearchParams {
    return new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      hourly: [
        'temperature_2m',
        'relative_humidity_2m',
        'precipitation',
        'weather_code',
        'cloud_cover',
        'wind_speed_10m',
        'wind_direction_10m',
        'wind_gusts_10m',
        'visibility',
      ].join(','),
      temperature_unit: 'celsius',
      wind_speed_unit: 'kmh',
      precipitation_unit: 'mm',
      timezone: 'UTC',
    });
  }

  private async fetchJson(
    url: string,
    timeout?: number,
  ): Promise<OpenMeteoResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeout || this.timeout,
    );

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (response.status === 429) {
        throw new RateLimitError(this.name);
      }

      if (!response.ok) {
        throw new WeatherError(
          `API request failed: ${response.statusText}`,
          this.name,
          `HTTP_${response.status}`,
        );
      }

      const data = (await response.json()) as OpenMeteoResponse;

      if (data.error) {
        throw new WeatherError(
          data.reason || 'Open-Meteo API returned an error',
          this.name,
          'API_ERROR',
          data,
        );
      }

      return data;
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
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private transformHourlyData(
    data: OpenMeteoResponse,
    source: string,
  ): WeatherForecast[] {
    const hourly = data.hourly;
    if (!hourly?.time?.length) {
      return [];
    }

    const forecasts: WeatherForecast[] = [];

    for (let index = 0; index < hourly.time.length; index++) {
      const timestamp = parseOpenMeteoTimestamp(hourly.time[index]);
      const temperature = hourly.temperature_2m?.[index];
      const humidity = valueOrUndefined(hourly.relative_humidity_2m?.[index]);
      const windSpeed = valueOrUndefined(hourly.wind_speed_10m?.[index]);

      if (
        Number.isNaN(timestamp.getTime()) ||
        typeof temperature !== 'number' ||
        humidity === undefined ||
        windSpeed === undefined
      ) {
        continue;
      }

      const weatherCode = hourly.weather_code?.[index];

      forecasts.push({
        timestamp,
        temperature: roundToInt(temperature),
        humidity: roundToInt(humidity),
        windSpeed: roundToInt(windSpeed),
        windDirection: valueOrUndefined(hourly.wind_direction_10m?.[index]),
        windGust:
          typeof hourly.wind_gusts_10m?.[index] === 'number'
            ? roundToInt(hourly.wind_gusts_10m[index]!)
            : undefined,
        conditions: describeOpenMeteoCode(weatherCode),
        cloudCover: valueOrUndefined(hourly.cloud_cover?.[index]),
        visibility:
          typeof hourly.visibility?.[index] === 'number'
            ? roundToInt(metersToKilometers(hourly.visibility[index]!))
            : undefined,
        precipAmount: valueOrUndefined(hourly.precipitation?.[index]),
        confidence: source === 'open-meteo-archive' ? 100 : 90,
        raw: {
          source,
          weatherCode,
          latitude: data.latitude,
          longitude: data.longitude,
          timezone: data.timezone,
          units: data.hourly_units,
        },
      });
    }

    return forecasts.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }
}

function valueOrUndefined(
  value: number | null | undefined,
): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function parseOpenMeteoTimestamp(value: string): Date {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}

function describeOpenMeteoCode(code: number | null | undefined): string {
  switch (code) {
    case 0:
      return 'Clear sky';
    case 1:
      return 'Mainly clear';
    case 2:
      return 'Partly cloudy';
    case 3:
      return 'Overcast';
    case 45:
    case 48:
      return 'Fog';
    case 51:
    case 53:
    case 55:
      return 'Drizzle';
    case 56:
    case 57:
      return 'Freezing drizzle';
    case 61:
    case 63:
    case 65:
      return 'Rain';
    case 66:
    case 67:
      return 'Freezing rain';
    case 71:
    case 73:
    case 75:
      return 'Snow';
    case 77:
      return 'Snow grains';
    case 80:
    case 81:
    case 82:
      return 'Rain showers';
    case 85:
    case 86:
      return 'Snow showers';
    case 95:
      return 'Thunderstorm';
    case 96:
    case 99:
      return 'Thunderstorm with hail';
    default:
      return 'Unknown';
  }
}
