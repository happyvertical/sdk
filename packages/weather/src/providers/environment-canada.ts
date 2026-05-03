/**
 * EnvironmentCanadaProvider - Fetch weather data from Environment Canada API
 *
 * Uses the MSC Geomet API to fetch weather forecasts for Canadian locations.
 * API Documentation: https://eccc-msc.github.io/open-data/msc-geomet/web-services_en/
 *
 * Coverage: Canada only
 * API Key: Not required
 * Update Frequency: Hourly
 * Data Format: JSON via OGC API Features
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
import {
  InvalidLocationError,
  NoResultsError,
  WeatherError,
} from '../shared/types';
import {
  calculateDistance,
  ensureValidCoordinates,
  isInCanada,
  roundToInt,
} from '../shared/utils';

interface ECForecastData {
  type: string;
  features: Array<{
    type: string;
    properties: {
      identifier: string;
      name: { en: string; fr: string };
      region: { en: string; fr: string };
      url: { en: string; fr: string };
      lastUpdated: string;
      currentConditions?: {
        timestamp?: { en: string; fr: string };
        temperature?: { value?: { en: number; fr: number } };
        relativeHumidity?: { value?: { en: number; fr: number } };
        wind?: {
          speed?: { value?: { en: number; fr: number } };
          direction?: { value?: { en: string; fr: string } };
          bearing?: { value?: { en: number; fr: number } };
        };
        pressure?: { value?: { en: number; fr: number } };
        condition?: { en: string; fr: string };
      };
      forecastGroup?: {
        timestamp?: { en: string; fr: string };
        forecasts?: Array<{
          period?: {
            textForecastName?: { en: string; fr: string };
            value?: { en: string; fr: string };
          };
          temperatures?: {
            temperature?: Array<{
              class?: { en: string; fr: string };
              value?: { en: number; fr: number };
            }>;
          };
          relativeHumidity?: { value?: { en: number; fr: number } };
          winds?: {
            periods?: Array<{
              speed?: { value?: { en: number; fr: number } };
              direction?: { en: string; fr: string };
              bearing?: { value?: { en: number; fr: number } };
            }>;
          };
          cloudPrecip?: { en: string; fr: string };
          textSummary?: { en: string; fr: string };
          precipitation?: {
            accumulation?: {
              amount?: { value?: { en: number; fr: number } };
            };
          };
        }>;
      };
    };
  }>;
}

interface ECClimateHourlyData {
  type: string;
  links?: Array<{
    rel?: string;
    href?: string;
    type?: string;
    title?: string;
  }>;
  features: Array<{
    id: string;
    type: string;
    geometry?: {
      type: 'Point';
      coordinates: [number, number];
    };
    properties: {
      STATION_NAME?: string | null;
      CLIMATE_IDENTIFIER?: string | null;
      ID?: string | null;
      LOCAL_DATE?: string | null;
      UTC_DATE?: string | null;
      TEMP?: number | null;
      DEW_POINT_TEMP?: number | null;
      HUMIDEX?: number | null;
      PRECIP_AMOUNT?: number | null;
      RELATIVE_HUMIDITY?: number | null;
      STATION_PRESSURE?: number | null;
      VISIBILITY?: number | null;
      WEATHER_ENG_DESC?: string | null;
      WINDCHILL?: number | null;
      WIND_DIRECTION?: number | null;
      WIND_SPEED?: number | null;
      STN_ID?: string | number | null;
      LONGITUDE_DECIMAL_DEGREES?: number | null;
      LATITUDE_DECIMAL_DEGREES?: number | null;
    };
  }>;
}

export class EnvironmentCanadaProvider implements IWeatherProvider {
  readonly name = 'Environment Canada';
  readonly providerType = 'government' as const;

  private readonly apiBase =
    'https://api.weather.gc.ca/collections/citypageweather-realtime/items';
  private readonly climateHourlyApiBase =
    'https://api.weather.gc.ca/collections/climate-hourly/items';
  private readonly timeout: number;

  constructor(options: { timeout?: number } = {}) {
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

    // Verify location is in Canada
    if (!isInCanada(latitude, longitude)) {
      throw new InvalidLocationError(
        this.name,
        latitude,
        longitude,
        'Environment Canada only supports Canadian locations',
      );
    }

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
        throw new WeatherError(
          `API request failed: ${response.statusText}`,
          this.name,
          `HTTP_${response.status}`,
        );
      }

      const data = (await response.json()) as ECForecastData;

      // Transform data to standardized WeatherForecast objects
      const forecasts = this.transformForecasts(data, latitude, longitude);

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
    options: HistoricalFetchOptions,
  ): Promise<WeatherForecast[]> {
    ensureValidCoordinates(this.name, latitude, longitude);

    if (!isInCanada(latitude, longitude)) {
      throw new InvalidLocationError(
        this.name,
        latitude,
        longitude,
        'Environment Canada historical climate observations only support Canadian locations',
      );
    }

    const window = normalizeHistoricalWindow(this.name, options);

    try {
      const url = this.buildClimateHourlyUrl(latitude, longitude, window);
      const data = await this.fetchClimateHourlyPages(url, options.timeout);
      const stationForecasts = this.transformClimateHourly(
        data,
        latitude,
        longitude,
        window,
      );
      const forecasts =
        options.limit && options.limit > 0
          ? stationForecasts.slice(0, options.limit)
          : stationForecasts;

      if (forecasts.length === 0) {
        throw new NoResultsError(this.name, latitude, longitude);
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
        `Failed to fetch historical weather data: ${(error as Error).message}`,
        this.name,
        'FETCH_ERROR',
      );
    }
  }

  /**
   * Build Environment Canada API URL for given coordinates
   */
  private buildApiUrl(lat: number, lng: number): string {
    // Search within 1 degree radius (roughly 100km)
    const params = new URLSearchParams({
      f: 'json',
      bbox: `${lng - 1},${lat - 1},${lng + 1},${lat + 1}`,
      limit: '1', // Get closest city only
    });

    return `${this.apiBase}?${params.toString()}`;
  }

  private buildClimateHourlyUrl(
    lat: number,
    lng: number,
    window: { start: Date; end: Date },
  ): string {
    const queryStart = new Date(window.start.getTime() - 24 * 60 * 60 * 1000);
    const queryEnd = new Date(window.end.getTime() + 24 * 60 * 60 * 1000);
    const bboxPadding = 1;
    const params = new URLSearchParams({
      f: 'json',
      bbox: `${lng - bboxPadding},${lat - bboxPadding},${lng + bboxPadding},${lat + bboxPadding}`,
      datetime: `${formatUtcDate(queryStart)}/${formatUtcDate(queryEnd)}`,
      limit: '2000',
    });

    return `${this.climateHourlyApiBase}?${params.toString()}`;
  }

  private async fetchClimateHourlyPages(
    initialUrl: string,
    timeout?: number,
  ): Promise<ECClimateHourlyData> {
    const features: ECClimateHourlyData['features'] = [];
    const visited = new Set<string>();
    let nextUrl: string | undefined = initialUrl;
    let pageCount = 0;

    while (nextUrl) {
      if (visited.has(nextUrl)) {
        throw new WeatherError(
          'Environment Canada climate pagination loop detected',
          this.name,
          'PAGINATION_LOOP',
        );
      }

      visited.add(nextUrl);
      pageCount += 1;

      if (pageCount > 50) {
        throw new WeatherError(
          'Environment Canada climate pagination exceeded safety limit',
          this.name,
          'PAGINATION_LIMIT',
        );
      }

      const page = await this.fetchClimateHourlyPage(nextUrl, timeout);
      features.push(...(page.features || []));
      nextUrl = page.links?.find(
        (link) => link.rel === 'next' && link.href,
      )?.href;
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  }

  private async fetchClimateHourlyPage(
    url: string,
    timeout?: number,
  ): Promise<ECClimateHourlyData> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      timeout || this.timeout,
    );

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new WeatherError(
          `API request failed: ${response.statusText}`,
          this.name,
          `HTTP_${response.status}`,
        );
      }

      return (await response.json()) as ECClimateHourlyData;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Transform Environment Canada data into WeatherForecast objects
   */
  private transformForecasts(
    data: ECForecastData,
    latitude: number,
    longitude: number,
  ): WeatherForecast[] {
    if (!data.features || data.features.length === 0) {
      throw new NoResultsError(this.name, latitude, longitude);
    }

    const forecasts: WeatherForecast[] = [];
    const feature = data.features[0]; // We requested limit=1
    const props = feature.properties;

    // Add current conditions as first forecast
    const currentConditions = props.currentConditions;
    if (currentConditions) {
      forecasts.push({
        timestamp: new Date(currentConditions.timestamp?.en || new Date()),
        temperature: currentConditions.temperature?.value?.en || 0,
        humidity: currentConditions.relativeHumidity?.value?.en || 0,
        windSpeed: Number(currentConditions.wind?.speed?.value?.en) || 0,
        windDirection: currentConditions.wind?.bearing?.value?.en,
        pressure: (currentConditions.pressure?.value?.en || 0) * 10, // Convert kPa to hPa
        conditions: currentConditions.condition?.en || 'Unknown',
        confidence: 100, // Current conditions are observed
        raw: {
          source: 'environment-canada-citypage',
          currentConditions,
        },
      });
    }

    // Add forecast periods
    const forecastGroup = props.forecastGroup;
    if (forecastGroup && forecastGroup.forecasts) {
      let forecastDate = new Date();

      for (const periodForecast of forecastGroup.forecasts) {
        const period = periodForecast.period;
        const temps = periodForecast.temperatures?.temperature || [];
        const highTemp = temps.find((t: any) => t.class?.en === 'high');
        const lowTemp = temps.find((t: any) => t.class?.en === 'low');

        // Determine forecast start date based on period name
        if (period?.textForecastName?.en?.toLowerCase() === 'tonight') {
          forecastDate.setHours(18, 0, 0, 0);
        } else if (period?.value?.en?.toLowerCase().includes('night')) {
          forecastDate.setHours(18, 0, 0, 0);
        } else {
          forecastDate.setHours(6, 0, 0, 0);
        }

        forecasts.push({
          timestamp: new Date(forecastDate),
          temperature: highTemp?.value?.en || lowTemp?.value?.en || 0,
          temperatureMax: highTemp?.value?.en,
          temperatureMin: lowTemp?.value?.en,
          humidity: periodForecast.relativeHumidity?.value?.en || 0,
          windSpeed:
            Number(periodForecast.winds?.periods?.[0]?.speed?.value?.en) || 0,
          windDirection: periodForecast.winds?.periods?.[0]?.bearing?.value?.en,
          conditions:
            periodForecast.cloudPrecip?.en ||
            periodForecast.textSummary?.en ||
            'Unknown',
          precipAmount:
            periodForecast.precipitation?.accumulation?.amount?.value?.en,
          confidence: 90,
          raw: {
            source: 'environment-canada-citypage',
            periodName: period?.textForecastName?.en || period?.value?.en,
            period: periodForecast,
          },
        });

        // Advance date for next period
        if (period?.textForecastName?.en?.toLowerCase().includes('night')) {
          forecastDate = new Date(forecastDate.getTime() + 12 * 60 * 60 * 1000); // +12 hours
        } else {
          forecastDate = new Date(forecastDate.getTime() + 24 * 60 * 60 * 1000); // +24 hours
        }
      }
    }

    return forecasts;
  }

  private transformClimateHourly(
    data: ECClimateHourlyData,
    latitude: number,
    longitude: number,
    window?: { start: Date; end: Date },
  ): WeatherForecast[] {
    if (!data.features || data.features.length === 0) {
      throw new NoResultsError(this.name, latitude, longitude);
    }

    const byStation = new Map<
      string,
      { distance: number; forecasts: WeatherForecast[] }
    >();

    for (const feature of data.features) {
      const props = feature.properties;
      const timestamp = props.UTC_DATE
        ? parseEnvironmentCanadaUtcDate(props.UTC_DATE)
        : null;

      if (!timestamp || Number.isNaN(timestamp.getTime())) {
        continue;
      }

      const stationLatitude =
        props.LATITUDE_DECIMAL_DEGREES || feature.geometry?.coordinates[1];
      const stationLongitude =
        props.LONGITUDE_DECIMAL_DEGREES || feature.geometry?.coordinates[0];

      if (
        typeof stationLatitude !== 'number' ||
        typeof stationLongitude !== 'number'
      ) {
        continue;
      }

      const temperature =
        typeof props.TEMP === 'number' ? props.TEMP : undefined;
      if (temperature === undefined) {
        continue;
      }

      const stationId = String(
        props.CLIMATE_IDENTIFIER ||
          props.STN_ID ||
          props.STATION_NAME ||
          'nearby',
      );
      const distance = calculateDistance(
        latitude,
        longitude,
        stationLatitude,
        stationLongitude,
      );
      const weatherDescription = props.WEATHER_ENG_DESC || 'Unknown';
      const windDirection =
        typeof props.WIND_DIRECTION === 'number'
          ? props.WIND_DIRECTION <= 36
            ? props.WIND_DIRECTION * 10
            : props.WIND_DIRECTION
          : undefined;

      const forecast: WeatherForecast = {
        timestamp,
        temperature: roundToInt(temperature),
        feelsLike:
          typeof props.WINDCHILL === 'number'
            ? roundToInt(props.WINDCHILL)
            : typeof props.HUMIDEX === 'number'
              ? roundToInt(props.HUMIDEX)
              : undefined,
        humidity: roundToInt(props.RELATIVE_HUMIDITY || 0),
        windSpeed: roundToInt(props.WIND_SPEED || 0),
        windDirection,
        pressure:
          typeof props.STATION_PRESSURE === 'number'
            ? roundToInt(props.STATION_PRESSURE * 10)
            : undefined,
        conditions:
          weatherDescription.toUpperCase() === 'NA'
            ? 'Unknown'
            : weatherDescription,
        visibility:
          typeof props.VISIBILITY === 'number' ? props.VISIBILITY : undefined,
        precipAmount:
          typeof props.PRECIP_AMOUNT === 'number'
            ? props.PRECIP_AMOUNT
            : undefined,
        confidence: 100,
        raw: {
          source: 'environment-canada-climate-hourly',
          stationId,
          stationName: props.STATION_NAME,
          stationLatitude,
          stationLongitude,
          stationDistanceKm: distance,
          observation: props,
        },
      };

      const group = byStation.get(stationId);
      if (group) {
        group.forecasts.push(forecast);
      } else {
        byStation.set(stationId, { distance, forecasts: [forecast] });
      }
    }

    const nearest = [...byStation.values()]
      .map((group) => ({
        distance: group.distance,
        forecasts: window
          ? filterHistoricalWindow(group.forecasts, window)
          : group.forecasts.sort(
              (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
            ),
      }))
      .filter((group) => group.forecasts.length > 0)
      .sort((a, b) => a.distance - b.distance)[0];

    if (!nearest) {
      throw new NoResultsError(this.name, latitude, longitude);
    }

    return nearest.forecasts.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );
  }

  /**
   * Test connection to Environment Canada API
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
   * Check if location is in Canada (Environment Canada coverage area)
   */
  async supportsLocation(
    latitude: number,
    longitude: number,
  ): Promise<boolean> {
    // Validate coordinates first
    const validation = {
      valid:
        !Number.isNaN(latitude) &&
        !Number.isNaN(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180,
    };

    if (!validation.valid) {
      return false;
    }

    // Check if coordinates are within Canada's bounds
    return isInCanada(latitude, longitude);
  }
}

function parseEnvironmentCanadaUtcDate(value: string): Date {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return new Date(hasTimezone ? value : `${value}Z`);
}
