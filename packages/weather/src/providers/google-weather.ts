/**
 * GoogleWeatherProvider - Fetch weather data from Google Weather API
 *
 * Uses the Google Weather API for comprehensive weather data.
 * API Documentation: https://developers.google.com/maps/documentation/weather
 *
 * Google Weather API features:
 * - Current weather conditions
 * - Hourly forecast for up to 240 hours
 * - Daily forecast for up to 10 days
 * - Hourly historical data for 24 hours
 * - Weather alerts
 *
 * Coverage: Global
 * API Key: Required (paid)
 * Data Format: JSON
 */

import {
  filterHistoricalWindow,
  hoursBetween,
  normalizeHistoricalWindow,
} from '../shared/historical';
import type {
  FetchOptions,
  HistoricalFetchOptions,
  IWeatherProvider,
  WeatherAlert,
  WeatherForecast,
} from '../shared/types';
import {
  AuthenticationError,
  NoResultsError,
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

// Google Weather API response types

interface GoogleTemperature {
  degrees: number;
  unit: string;
}

interface GoogleWindSpeed {
  value: number;
  unit: string;
}

interface GoogleWindDirection {
  degrees: number;
  cardinal: string;
}

interface GoogleWind {
  direction: GoogleWindDirection;
  speed: GoogleWindSpeed;
  gust?: GoogleWindSpeed;
}

interface GoogleWeatherCondition {
  iconBaseUri: string;
  description: {
    text: string;
    languageCode: string;
  };
  type: string;
}

interface GooglePrecipitation {
  probability?: {
    percent: number;
    type: string;
  };
  qpf?: {
    quantity: number;
    unit: string;
  };
  type?: string;
}

interface GoogleVisibility {
  distance: number;
  unit: string;
}

interface GoogleAirPressure {
  meanSeaLevelMillibars: number;
}

interface GoogleCurrentConditionsResponse {
  currentTime: string;
  timeZone: {
    id: string;
  };
  isDaytime: boolean;
  weatherCondition: GoogleWeatherCondition;
  temperature: GoogleTemperature;
  feelsLikeTemperature: GoogleTemperature;
  dewPoint?: GoogleTemperature;
  heatIndex?: GoogleTemperature;
  windChill?: GoogleTemperature;
  relativeHumidity: number;
  uvIndex?: number;
  precipitation?: GooglePrecipitation;
  thunderstormProbability?: number;
  airPressure?: GoogleAirPressure;
  wind: GoogleWind;
  visibility?: GoogleVisibility;
  cloudCover?: number;
}

interface GoogleHourlyForecast {
  interval: {
    startTime: string;
    endTime: string;
  };
  displayDateTime: {
    year: number;
    month: number;
    day: number;
    hours: number;
    utcOffset: string;
  };
  isDaytime: boolean;
  weatherCondition: GoogleWeatherCondition;
  temperature: GoogleTemperature;
  feelsLikeTemperature?: GoogleTemperature;
  dewPoint?: GoogleTemperature;
  heatIndex?: GoogleTemperature;
  windChill?: GoogleTemperature;
  wetBulbTemperature?: GoogleTemperature;
  relativeHumidity: number;
  uvIndex?: number;
  precipitation?: GooglePrecipitation;
  thunderstormProbability?: number;
  airPressure?: GoogleAirPressure;
  wind: GoogleWind;
  visibility?: GoogleVisibility;
  cloudCover?: number;
  iceThickness?: number;
}

interface GoogleHourlyForecastResponse {
  forecastHours: GoogleHourlyForecast[];
  timeZone: {
    id: string;
  };
  nextPageToken?: string;
}

interface GoogleDayForecast {
  daytimeForecast?: GoogleHourlyForecast;
  nighttimeForecast?: GoogleHourlyForecast;
  maxTemperature?: GoogleTemperature;
  minTemperature?: GoogleTemperature;
}

interface GoogleDailyForecast {
  interval: {
    startTime: string;
    endTime: string;
  };
  displayDate: {
    year: number;
    month: number;
    day: number;
  };
  daytimeForecast?: GoogleHourlyForecast;
  nighttimeForecast?: GoogleHourlyForecast;
  maxTemperature?: GoogleTemperature;
  minTemperature?: GoogleTemperature;
  feelsLikeMaxTemperature?: GoogleTemperature;
  feelsLikeMinTemperature?: GoogleTemperature;
}

interface GoogleDailyForecastResponse {
  forecastDays: GoogleDailyForecast[];
  timeZone: {
    id: string;
  };
  nextPageToken?: string;
}

interface GoogleHistoryResponse {
  historyHours: GoogleHourlyForecast[];
  timeZone: {
    id: string;
  };
}

interface GoogleAlert {
  alertId: string;
  headline?: string;
  description?: string;
  severity?: string;
  effective?: string;
  expires?: string;
}

interface GoogleAlertsResponse {
  alerts?: GoogleAlert[];
}

/**
 * Detect a Google Weather invalid-API-key error body.
 *
 * Google returns HTTP 400 (not 401/403) with an `API_KEY_INVALID` reason and an
 * "API key not valid" message when the key is malformed or restricted.
 */
function isInvalidApiKeyError(errorText: string): boolean {
  const normalized = errorText.toLowerCase();
  return (
    normalized.includes('api_key_invalid') ||
    normalized.includes('api key not valid')
  );
}

export class GoogleWeatherProvider implements IWeatherProvider {
  readonly name = 'Google Weather';
  readonly providerType = 'commercial' as const;

  private readonly apiBase = 'https://weather.googleapis.com/v1';
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(options: { apiKey: string; timeout?: number }) {
    if (!options.apiKey) {
      throw new AuthenticationError('Google Weather', 'API key is required');
    }
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 10000;
  }

  /**
   * Fetch weather forecasts for a location
   * Returns combined hourly (240h) and daily (10 days) forecasts
   */
  async fetchForLocation(
    latitude: number,
    longitude: number,
    options?: FetchOptions,
  ): Promise<WeatherForecast[]> {
    ensureValidCoordinates(this.name, latitude, longitude);

    try {
      // Fetch hourly and daily forecasts in parallel
      const [hourlyForecasts, dailyForecasts] = await Promise.all([
        this.fetchHourlyForecast(latitude, longitude, options),
        this.fetchDailyForecast(latitude, longitude, options),
      ]);

      // Combine forecasts
      const forecasts = [...hourlyForecasts, ...dailyForecasts];

      // Apply limit if specified
      if (options?.limit && options.limit > 0) {
        return forecasts.slice(0, options.limit);
      }

      return forecasts;
    } catch (error) {
      if (error instanceof WeatherError) {
        throw error;
      }
      throw new WeatherError(
        `Failed to fetch weather data: ${(error as Error).message}`,
        this.name,
        'FETCH_ERROR',
      );
    }
  }

  /**
   * Fetch current weather conditions
   */
  async fetchCurrentConditions(
    latitude: number,
    longitude: number,
    options?: FetchOptions,
  ): Promise<WeatherForecast> {
    ensureValidCoordinates(this.name, latitude, longitude);

    const url = this.buildUrl('/currentConditions:lookup', latitude, longitude);
    const data = await this.fetchWithTimeout<GoogleCurrentConditionsResponse>(
      url,
      options?.timeout,
    );

    return this.transformCurrentConditions(data);
  }

  /**
   * Fetch hourly forecast (up to 240 hours)
   *
   * Google Weather API paginates hourly results (24 hours per page).
   * This method automatically fetches all pages to get the full forecast.
   */
  async fetchHourlyForecast(
    latitude: number,
    longitude: number,
    options?: FetchOptions & { hours?: number },
  ): Promise<WeatherForecast[]> {
    ensureValidCoordinates(this.name, latitude, longitude);

    const hours = options?.hours || 240;
    const allForecasts: GoogleHourlyForecast[] = [];
    let pageToken: string | undefined;

    do {
      let url = this.buildUrl(
        '/forecast/hours:lookup',
        latitude,
        longitude,
        `&hours=${hours}`,
      );
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const data = await this.fetchWithTimeout<GoogleHourlyForecastResponse>(
        url,
        options?.timeout,
      );

      if (data.forecastHours) {
        allForecasts.push(...data.forecastHours);
      }

      pageToken = data.nextPageToken;
    } while (pageToken && allForecasts.length < hours);

    if (allForecasts.length === 0) {
      throw new NoResultsError(this.name, latitude, longitude);
    }

    return allForecasts
      .slice(0, hours)
      .map((hour) => this.transformHourlyForecast(hour, 'hourly'));
  }

  /**
   * Fetch daily forecast (up to 10 days)
   *
   * Google Weather API paginates daily results (5 days per page).
   * This method automatically fetches all pages to get the full forecast.
   */
  async fetchDailyForecast(
    latitude: number,
    longitude: number,
    options?: FetchOptions & { days?: number },
  ): Promise<WeatherForecast[]> {
    ensureValidCoordinates(this.name, latitude, longitude);

    const days = options?.days || 10;
    const allForecasts: GoogleDailyForecast[] = [];
    let pageToken: string | undefined;

    do {
      let url = this.buildUrl(
        '/forecast/days:lookup',
        latitude,
        longitude,
        `&days=${days}`,
      );
      if (pageToken) {
        url += `&pageToken=${encodeURIComponent(pageToken)}`;
      }

      const data = await this.fetchWithTimeout<GoogleDailyForecastResponse>(
        url,
        options?.timeout,
      );

      if (data.forecastDays) {
        allForecasts.push(...data.forecastDays);
      }

      pageToken = data.nextPageToken;
    } while (pageToken && allForecasts.length < days);

    if (allForecasts.length === 0) {
      throw new NoResultsError(this.name, latitude, longitude);
    }

    return allForecasts
      .slice(0, days)
      .map((day) => this.transformDailyForecast(day));
  }

  /**
   * Fetch hourly history (up to 24 hours)
   */
  async fetchHourlyHistory(
    latitude: number,
    longitude: number,
    options?: FetchOptions & { hours?: number },
  ): Promise<WeatherForecast[]> {
    ensureValidCoordinates(this.name, latitude, longitude);

    const hours = options?.hours || 24;
    const url = this.buildUrl(
      '/history/hours:lookup',
      latitude,
      longitude,
      `&hours=${hours}`,
    );
    const data = await this.fetchWithTimeout<GoogleHistoryResponse>(
      url,
      options?.timeout,
    );

    if (!data.historyHours || data.historyHours.length === 0) {
      throw new NoResultsError(this.name, latitude, longitude);
    }

    return data.historyHours.map((hour) =>
      this.transformHourlyForecast(hour, 'history'),
    );
  }

  async fetchHistoricalForLocation(
    latitude: number,
    longitude: number,
    options: HistoricalFetchOptions,
  ): Promise<WeatherForecast[]> {
    ensureValidCoordinates(this.name, latitude, longitude);

    const window = normalizeHistoricalWindow(this.name, options);
    const now = new Date();
    const oldestSupported = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    if (window.end.getTime() > now.getTime()) {
      throw new WeatherError(
        'Google Weather historical lookup cannot end in the future',
        this.name,
        'INVALID_DATE_RANGE',
      );
    }

    if (window.start.getTime() < oldestSupported.getTime()) {
      throw new UnsupportedWeatherCapabilityError(
        this.name,
        'historical-weather',
        'Google Weather hourly history is limited to the previous 24 hours.',
      );
    }

    const hours = Math.min(24, hoursBetween(window.start, now));
    const history = await this.fetchHourlyHistory(latitude, longitude, {
      ...options,
      hours,
    });

    const forecasts = filterHistoricalWindow(history, window, options.limit);
    if (forecasts.length === 0) {
      throw new NoResultsError(this.name, latitude, longitude);
    }

    return forecasts;
  }

  /**
   * Fetch weather alerts
   */
  async fetchAlerts(
    latitude: number,
    longitude: number,
    options?: FetchOptions,
  ): Promise<WeatherAlert[]> {
    ensureValidCoordinates(this.name, latitude, longitude);

    const url = this.buildUrl('/publicAlerts:lookup', latitude, longitude);
    const data = await this.fetchWithTimeout<GoogleAlertsResponse>(
      url,
      options?.timeout,
    );

    if (!data.alerts || data.alerts.length === 0) {
      return [];
    }

    return data.alerts.map((alert) => this.transformAlert(alert));
  }

  /**
   * Test connection to Google Weather API
   */
  async testConnection(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // Probe the daily forecast endpoint (Mountain View, CA - Google HQ).
      //
      // This probes the forecast surface the provider actually serves, rather
      // than /currentConditions:lookup. Google Weather access can be restricted
      // per endpoint, so probing current conditions let the health check
      // disagree with the forecast calls this provider makes: a key with
      // current-conditions but no forecast access reported healthy while every
      // forecast fetch failed, and a key with only forecast access reported
      // unhealthy while the provider worked.
      //
      // Scope note: this covers fetchDailyForecast only. fetchForLocation also
      // awaits fetchHourlyForecast (/forecast/hours:lookup), so a key permitted
      // for daily but not hourly forecasts still passes this probe and then
      // fails fetchForLocation. Probing both endpoints would double the cost of
      // every health check against a paid API; see issue #1233.
      //
      // Only one day is requested to keep the probe within a single page.
      const url = this.buildUrl(
        '/forecast/days:lookup',
        37.422,
        -122.084,
        '&days=1',
      );

      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        return false;
      }

      // A 2xx alone is not enough: an empty forecastDays array would still make
      // fetchDailyForecast throw NoResultsError, so require usable payload.
      //
      // The abort timer stays armed across this read: a peer that returns
      // headers and then stalls the body would otherwise hang the health check
      // forever, and this method must always settle rather than block provider
      // selection. An abort here surfaces as a rejection and fails closed.
      const data = (await response.json()) as GoogleDailyForecastResponse;
      return Array.isArray(data?.forecastDays) && data.forecastDays.length > 0;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if location is supported (Google Weather is global)
   */
  async supportsLocation(
    latitude: number,
    longitude: number,
  ): Promise<boolean> {
    const valid =
      !Number.isNaN(latitude) &&
      !Number.isNaN(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;

    return valid;
  }

  /**
   * Build API URL with location and API key
   */
  private buildUrl(
    endpoint: string,
    lat: number,
    lon: number,
    extraParams?: string,
  ): string {
    const params = new URLSearchParams({
      key: this.apiKey,
      'location.latitude': lat.toString(),
      'location.longitude': lon.toString(),
    });

    let url = `${this.apiBase}${endpoint}?${params.toString()}`;
    if (extraParams) {
      url += extraParams;
    }
    return url;
  }

  /**
   * Fetch with timeout and error handling
   */
  private async fetchWithTimeout<T>(url: string, timeout?: number): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeout || this.timeout,
    );

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleHttpError(response);
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);

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

  /**
   * Handle HTTP error responses
   */
  private async handleHttpError(response: Response): Promise<never> {
    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(this.name, 'Invalid API key');
    }

    if (response.status === 429) {
      throw new RateLimitError(this.name);
    }

    const errorText = await response.text();

    // Google Weather reports a malformed or restricted key as HTTP 400 with an
    // API_KEY_INVALID reason rather than 401/403. Without this mapping callers
    // that branch on AuthenticationError to stop retrying would keep retrying a
    // credential that can never succeed.
    if (response.status === 400 && isInvalidApiKeyError(errorText)) {
      throw new AuthenticationError(this.name, 'Invalid API key');
    }

    throw new WeatherError(
      `API request failed: ${response.statusText} - ${errorText}`,
      this.name,
      `HTTP_${response.status}`,
    );
  }

  /**
   * Transform current conditions to WeatherForecast
   */
  private transformCurrentConditions(
    data: GoogleCurrentConditionsResponse,
  ): WeatherForecast {
    return {
      timestamp: new Date(data.currentTime),
      temperature: roundToInt(data.temperature.degrees),
      feelsLike: data.feelsLikeTemperature
        ? roundToInt(data.feelsLikeTemperature.degrees)
        : undefined,
      conditions: data.weatherCondition.description.text,
      humidity: roundToInt(data.relativeHumidity),
      windSpeed: roundToInt(metersPerSecondToKmPerHour(data.wind.speed.value)),
      windDirection: data.wind.direction.degrees,
      windGust: data.wind.gust
        ? roundToInt(metersPerSecondToKmPerHour(data.wind.gust.value))
        : undefined,
      pressure: data.airPressure
        ? roundToInt(data.airPressure.meanSeaLevelMillibars)
        : undefined,
      cloudCover: data.cloudCover,
      visibility: data.visibility
        ? roundToInt(metersToKilometers(data.visibility.distance))
        : undefined,
      precipProbability: data.precipitation?.probability?.percent,
      precipAmount: data.precipitation?.qpf?.quantity,
      confidence: 95,
      raw: {
        source: 'google-weather-current',
        isDaytime: data.isDaytime,
        uvIndex: data.uvIndex,
        thunderstormProbability: data.thunderstormProbability,
        timeZone: data.timeZone.id,
      },
    };
  }

  /**
   * Transform hourly forecast to WeatherForecast
   */
  private transformHourlyForecast(
    data: GoogleHourlyForecast,
    source: 'hourly' | 'history',
  ): WeatherForecast {
    return {
      timestamp: new Date(data.interval.startTime),
      temperature: roundToInt(data.temperature.degrees),
      feelsLike: data.feelsLikeTemperature
        ? roundToInt(data.feelsLikeTemperature.degrees)
        : undefined,
      conditions: data.weatherCondition.description.text,
      humidity: roundToInt(data.relativeHumidity),
      windSpeed: roundToInt(metersPerSecondToKmPerHour(data.wind.speed.value)),
      windDirection: data.wind.direction.degrees,
      windGust: data.wind.gust
        ? roundToInt(metersPerSecondToKmPerHour(data.wind.gust.value))
        : undefined,
      pressure: data.airPressure
        ? roundToInt(data.airPressure.meanSeaLevelMillibars)
        : undefined,
      cloudCover: data.cloudCover,
      visibility: data.visibility
        ? roundToInt(metersToKilometers(data.visibility.distance))
        : undefined,
      precipProbability: data.precipitation?.probability?.percent,
      precipAmount: data.precipitation?.qpf?.quantity,
      confidence: source === 'history' ? 100 : 95,
      raw: {
        source: `google-weather-${source}`,
        isDaytime: data.isDaytime,
        uvIndex: data.uvIndex,
        thunderstormProbability: data.thunderstormProbability,
        displayDateTime: data.displayDateTime,
      },
    };
  }

  /**
   * Transform daily forecast to WeatherForecast
   */
  private transformDailyForecast(data: GoogleDailyForecast): WeatherForecast {
    // Use daytime forecast as primary, fall back to nighttime
    const primaryForecast = data.daytimeForecast || data.nighttimeForecast;

    if (!primaryForecast) {
      throw new WeatherError(
        'Daily forecast missing both daytime and nighttime data',
        this.name,
        'INVALID_DATA',
      );
    }

    return {
      timestamp: new Date(data.interval.startTime),
      temperature: data.maxTemperature
        ? roundToInt(data.maxTemperature.degrees)
        : roundToInt(primaryForecast.temperature.degrees),
      temperatureMax: data.maxTemperature
        ? roundToInt(data.maxTemperature.degrees)
        : undefined,
      temperatureMin: data.minTemperature
        ? roundToInt(data.minTemperature.degrees)
        : undefined,
      feelsLike: data.feelsLikeMaxTemperature
        ? roundToInt(data.feelsLikeMaxTemperature.degrees)
        : primaryForecast.feelsLikeTemperature
          ? roundToInt(primaryForecast.feelsLikeTemperature.degrees)
          : undefined,
      conditions: primaryForecast.weatherCondition.description.text,
      humidity: roundToInt(primaryForecast.relativeHumidity),
      windSpeed: roundToInt(
        metersPerSecondToKmPerHour(primaryForecast.wind.speed.value),
      ),
      windDirection: primaryForecast.wind.direction.degrees,
      windGust: primaryForecast.wind.gust
        ? roundToInt(
            metersPerSecondToKmPerHour(primaryForecast.wind.gust.value),
          )
        : undefined,
      pressure: primaryForecast.airPressure
        ? roundToInt(primaryForecast.airPressure.meanSeaLevelMillibars)
        : undefined,
      cloudCover: primaryForecast.cloudCover,
      visibility: primaryForecast.visibility
        ? roundToInt(metersToKilometers(primaryForecast.visibility.distance))
        : undefined,
      precipProbability: primaryForecast.precipitation?.probability?.percent,
      precipAmount: primaryForecast.precipitation?.qpf?.quantity,
      confidence: 90,
      raw: {
        source: 'google-weather-daily',
        displayDate: data.displayDate,
        daytimeForecast: data.daytimeForecast,
        nighttimeForecast: data.nighttimeForecast,
      },
    };
  }

  /**
   * Transform alert to WeatherAlert
   */
  private transformAlert(data: GoogleAlert): WeatherAlert {
    return {
      id: data.alertId,
      headline: data.headline || 'Weather Alert',
      description: data.description || '',
      severity: data.severity || 'unknown',
      startTime: data.effective ? new Date(data.effective) : new Date(),
      endTime: data.expires ? new Date(data.expires) : new Date(),
      raw: data,
    };
  }
}
