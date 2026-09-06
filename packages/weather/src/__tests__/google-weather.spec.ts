/**
 * Google Weather Provider Tests
 *
 * The `Offline behavior` block is deterministic: `fetch` is stubbed, so it runs
 * on every CI run and needs no credentials.
 *
 * The remaining blocks exercise the real API and require GOOGLE_API_KEY; they
 * skip when it is unset.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWeatherAdapter } from '../index';
import { GoogleWeatherProvider } from '../providers/google-weather';
import type { IWeatherAdapter, WeatherAlert } from '../shared/types';
import {
  AuthenticationError,
  RateLimitError,
  WeatherError,
} from '../shared/types';

/**
 * Stub `fetch` with a fixed response and return the mock so tests can assert on
 * the request URL the provider built.
 */
function stubFetch(response: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  body?: unknown;
  text?: string;
}) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    statusText: response.statusText ?? 'OK',
    json: async () => {
      if (response.body === undefined) {
        throw new SyntaxError('Unexpected end of JSON input');
      }
      return response.body;
    },
    text: async () => response.text ?? '',
  }));

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

describe('Google Weather Provider', () => {
  let adapter: IWeatherAdapter;
  const apiKey = process.env.GOOGLE_API_KEY;

  // Skip tests if no API key is provided
  const describeWithKey = apiKey ? describe : describe.skip;

  // Mountain View, CA coordinates (Google HQ)
  const mountainViewLat = 37.422;
  const mountainViewLng = -122.084;

  // Calgary, AB coordinates
  const calgaryLat = 51.0447;
  const calgaryLng = -114.0719;

  // Tokyo coordinates (for global coverage test)
  const tokyoLat = 35.6762;
  const tokyoLng = 139.6503;

  it('should throw WeatherError without API key', async () => {
    await expect(
      getWeatherAdapter({
        provider: 'google-weather',
        apiKey: '',
      }),
    ).rejects.toThrow(WeatherError);
  });

  describe('Offline behavior', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    describe('testConnection', () => {
      it('probes the same forecast endpoint the fetch path uses', async () => {
        const fetchMock = stubFetch({
          body: { forecastDays: [{ displayDate: { year: 2026 } }] },
        });

        const provider = new GoogleWeatherProvider({ apiKey: 'test-key' });

        await expect(provider.testConnection()).resolves.toBe(true);

        const requestedUrl = fetchMock.mock.calls[0][0] as string;
        expect(requestedUrl).toContain('/forecast/days:lookup');
        // Regression guard: the health check must not probe an endpoint the
        // production fetch path never calls, or the two can disagree whenever
        // Google restricts access per endpoint.
        expect(requestedUrl).not.toContain('/currentConditions:lookup');
      });

      it('returns false when the response carries no forecast days', async () => {
        stubFetch({ body: { forecastDays: [] } });

        const provider = new GoogleWeatherProvider({ apiKey: 'test-key' });

        // A 200 with an empty array would still make fetchDailyForecast throw
        // NoResultsError, so it must not be reported as healthy.
        await expect(provider.testConnection()).resolves.toBe(false);
      });

      it('returns false when forecastDays is missing entirely', async () => {
        stubFetch({ body: { timeZone: { id: 'America/Los_Angeles' } } });

        const provider = new GoogleWeatherProvider({ apiKey: 'test-key' });

        await expect(provider.testConnection()).resolves.toBe(false);
      });

      it('returns false on a non-ok response', async () => {
        stubFetch({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          body: {},
        });

        const provider = new GoogleWeatherProvider({ apiKey: 'test-key' });

        await expect(provider.testConnection()).resolves.toBe(false);
      });

      it('returns false when the body is not valid JSON', async () => {
        stubFetch({ body: undefined });

        const provider = new GoogleWeatherProvider({ apiKey: 'test-key' });

        await expect(provider.testConnection()).resolves.toBe(false);
      });
    });

    describe('HTTP error mapping', () => {
      const lat = 37.422;
      const lng = -122.084;

      it('maps a 400 with an API_KEY_INVALID reason to AuthenticationError', async () => {
        stubFetch({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: JSON.stringify({
            error: {
              code: 400,
              message: 'API key not valid. Please pass a valid API key.',
              status: 'INVALID_ARGUMENT',
              details: [{ reason: 'API_KEY_INVALID' }],
            },
          }),
        });

        const provider = new GoogleWeatherProvider({ apiKey: 'bad-key' });

        await expect(provider.fetchCurrentConditions(lat, lng)).rejects.toThrow(
          AuthenticationError,
        );
      });

      it('maps a 400 whose body only carries the "API key not valid" message', async () => {
        stubFetch({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: 'API key not valid. Please pass a valid API key.',
        });

        const provider = new GoogleWeatherProvider({ apiKey: 'bad-key' });

        await expect(provider.fetchCurrentConditions(lat, lng)).rejects.toThrow(
          AuthenticationError,
        );
      });

      it('leaves an unrelated 400 as a generic WeatherError', async () => {
        stubFetch({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: JSON.stringify({
            error: {
              code: 400,
              message: 'Request contains an invalid argument.',
              status: 'INVALID_ARGUMENT',
            },
          }),
        });

        const provider = new GoogleWeatherProvider({ apiKey: 'test-key' });

        const error = await provider
          .fetchCurrentConditions(lat, lng)
          .catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(WeatherError);
        expect(error).not.toBeInstanceOf(AuthenticationError);
        expect((error as WeatherError).code).toBe('HTTP_400');
      });

      it('still maps 401 to AuthenticationError', async () => {
        stubFetch({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          text: 'unauthorized',
        });

        const provider = new GoogleWeatherProvider({ apiKey: 'test-key' });

        await expect(provider.fetchCurrentConditions(lat, lng)).rejects.toThrow(
          AuthenticationError,
        );
      });

      it('still maps 429 to RateLimitError', async () => {
        stubFetch({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          text: 'rate limited',
        });

        const provider = new GoogleWeatherProvider({ apiKey: 'test-key' });

        await expect(provider.fetchCurrentConditions(lat, lng)).rejects.toThrow(
          RateLimitError,
        );
      });
    });
  });

  describeWithKey('with API key', () => {
    it('should create adapter with API key', async () => {
      adapter = await getWeatherAdapter({
        provider: 'google-weather',
        apiKey: apiKey!,
      });

      expect(adapter).toBeDefined();
      expect(adapter.name).toBe('Google Weather');
      expect(adapter.providerType).toBe('commercial');
    });

    it('should test connection successfully', async () => {
      adapter = await getWeatherAdapter({
        provider: 'google-weather',
        apiKey: apiKey!,
      });

      const isConnected = await adapter.testConnection();
      expect(isConnected).toBe(true);
    }, 30000);

    it('should support global locations', async () => {
      adapter = await getWeatherAdapter({
        provider: 'google-weather',
        apiKey: apiKey!,
      });

      // Test US location
      const mountainViewSupported = await adapter.supportsLocation(
        mountainViewLat,
        mountainViewLng,
      );
      expect(mountainViewSupported).toBe(true);

      // Test Canadian location
      const calgarySupported = await adapter.supportsLocation(
        calgaryLat,
        calgaryLng,
      );
      expect(calgarySupported).toBe(true);

      // Test Japanese location
      const tokyoSupported = await adapter.supportsLocation(tokyoLat, tokyoLng);
      expect(tokyoSupported).toBe(true);
    });

    it('should fetch weather forecasts for Mountain View', async () => {
      adapter = await getWeatherAdapter({
        provider: 'google-weather',
        apiKey: apiKey!,
        timeout: 30000,
      });

      const forecasts = await adapter.fetchForLocation(
        mountainViewLat,
        mountainViewLng,
      );

      expect(forecasts).toBeDefined();
      expect(Array.isArray(forecasts)).toBe(true);
      expect(forecasts.length).toBeGreaterThan(0);

      // Check first forecast structure
      const forecast = forecasts[0];
      expect(forecast).toBeDefined();
      expect(forecast.timestamp).toBeInstanceOf(Date);
      expect(typeof forecast.temperature).toBe('number');
      expect(typeof forecast.humidity).toBe('number');
      expect(typeof forecast.windSpeed).toBe('number');
      expect(typeof forecast.conditions).toBe('string');
      expect(forecast.raw).toBeDefined();

      // Google Weather API returns hourly and daily forecasts
      const source = forecast.raw.source;
      expect(['google-weather-hourly', 'google-weather-daily']).toContain(
        source,
      );

      // Verify optional fields when present
      if (forecast.feelsLike !== undefined) {
        expect(typeof forecast.feelsLike).toBe('number');
      }
      if (forecast.precipProbability !== undefined) {
        expect(typeof forecast.precipProbability).toBe('number');
        expect(forecast.precipProbability).toBeGreaterThanOrEqual(0);
        expect(forecast.precipProbability).toBeLessThanOrEqual(100);
      }
    }, 30000);

    it('should fetch weather forecasts for Calgary', async () => {
      adapter = await getWeatherAdapter({
        provider: 'google-weather',
        apiKey: apiKey!,
        timeout: 30000,
      });

      const forecasts = await adapter.fetchForLocation(calgaryLat, calgaryLng);

      expect(forecasts).toBeDefined();
      expect(Array.isArray(forecasts)).toBe(true);
      expect(forecasts.length).toBeGreaterThan(0);
    }, 30000);

    it('should fetch weather forecasts for Tokyo', async () => {
      adapter = await getWeatherAdapter({
        provider: 'google-weather',
        apiKey: apiKey!,
        timeout: 30000,
      });

      const forecasts = await adapter.fetchForLocation(tokyoLat, tokyoLng);

      expect(forecasts).toBeDefined();
      expect(Array.isArray(forecasts)).toBe(true);
      expect(forecasts.length).toBeGreaterThan(0);
    }, 30000);

    it('should throw error for invalid coordinates', async () => {
      adapter = await getWeatherAdapter({
        provider: 'google-weather',
        apiKey: apiKey!,
      });

      // Invalid latitude (> 90)
      await expect(
        adapter.fetchForLocation(100, mountainViewLng),
      ).rejects.toThrow(WeatherError);

      // Invalid longitude (< -180)
      await expect(
        adapter.fetchForLocation(mountainViewLat, -200),
      ).rejects.toThrow(WeatherError);
    });

    it('should respect limit option', async () => {
      adapter = await getWeatherAdapter({
        provider: 'google-weather',
        apiKey: apiKey!,
        timeout: 30000,
      });

      const forecasts = await adapter.fetchForLocation(
        mountainViewLat,
        mountainViewLng,
        {
          limit: 10,
        },
      );

      expect(forecasts).toBeDefined();
      expect(forecasts.length).toBeLessThanOrEqual(10);
    }, 30000);

    it('should return hourly and daily forecasts', async () => {
      adapter = await getWeatherAdapter({
        provider: 'google-weather',
        apiKey: apiKey!,
        timeout: 30000,
      });

      const forecasts = await adapter.fetchForLocation(
        mountainViewLat,
        mountainViewLng,
      );

      // Google Weather returns up to 240 hourly + 10 daily = 250 total forecasts
      expect(forecasts.length).toBeGreaterThan(0);

      // Check that we have both hourly and daily forecasts
      const hourlyForecasts = forecasts.filter(
        (f) => f.raw.source === 'google-weather-hourly',
      );
      const dailyForecasts = forecasts.filter(
        (f) => f.raw.source === 'google-weather-daily',
      );

      // Should have hourly forecasts (up to 240)
      expect(hourlyForecasts.length).toBeGreaterThan(0);

      // Should have daily forecasts (up to 10)
      expect(dailyForecasts.length).toBeGreaterThan(0);
    }, 30000);

    it('should have temperatureMin and temperatureMax in daily forecasts', async () => {
      adapter = await getWeatherAdapter({
        provider: 'google-weather',
        apiKey: apiKey!,
        timeout: 30000,
      });

      const forecasts = await adapter.fetchForLocation(
        mountainViewLat,
        mountainViewLng,
      );

      const dailyForecasts = forecasts.filter(
        (f) => f.raw.source === 'google-weather-daily',
      );

      expect(dailyForecasts.length).toBeGreaterThan(0);

      // Daily forecasts should have min/max temperatures
      dailyForecasts.forEach((forecast) => {
        // temperatureMin and temperatureMax may be undefined if Google doesn't provide them
        // but if present, they should be numbers
        if (forecast.temperatureMin !== undefined) {
          expect(typeof forecast.temperatureMin).toBe('number');
        }
        if (forecast.temperatureMax !== undefined) {
          expect(typeof forecast.temperatureMax).toBe('number');
        }
      });
    }, 30000);

    describe('Current Conditions', () => {
      it('should fetch current conditions', async () => {
        const provider = new GoogleWeatherProvider({
          apiKey: apiKey!,
          timeout: 30000,
        });

        const current = await provider.fetchCurrentConditions(
          mountainViewLat,
          mountainViewLng,
        );

        expect(current).toBeDefined();
        expect(current.timestamp).toBeInstanceOf(Date);
        expect(typeof current.temperature).toBe('number');
        expect(typeof current.humidity).toBe('number');
        expect(typeof current.windSpeed).toBe('number');
        expect(typeof current.conditions).toBe('string');
        expect(current.raw.source).toBe('google-weather-current');
      }, 30000);
    });

    describe('Hourly Forecast', () => {
      it('should fetch hourly forecast with custom hours', async () => {
        const provider = new GoogleWeatherProvider({
          apiKey: apiKey!,
          timeout: 30000,
        });

        const forecasts = await provider.fetchHourlyForecast(
          mountainViewLat,
          mountainViewLng,
          { hours: 24 },
        );

        expect(forecasts).toBeDefined();
        expect(Array.isArray(forecasts)).toBe(true);
        expect(forecasts.length).toBeLessThanOrEqual(24);

        forecasts.forEach((forecast) => {
          expect(forecast.raw.source).toBe('google-weather-hourly');
        });
      }, 30000);

      it('should paginate to fetch more than 24 hours (one page)', async () => {
        const provider = new GoogleWeatherProvider({
          apiKey: apiKey!,
          timeout: 60000, // Longer timeout for multiple API calls
        });

        // Request 48 hours which requires 2 pages (24 hours per page)
        const forecasts = await provider.fetchHourlyForecast(
          mountainViewLat,
          mountainViewLng,
          { hours: 48 },
        );

        expect(forecasts).toBeDefined();
        expect(Array.isArray(forecasts)).toBe(true);
        // Should have more than 24 results (pagination working)
        expect(forecasts.length).toBeGreaterThan(24);
        expect(forecasts.length).toBeLessThanOrEqual(48);

        forecasts.forEach((forecast) => {
          expect(forecast.raw.source).toBe('google-weather-hourly');
        });
      }, 60000);

      it('should fetch full 240 hours with pagination', async () => {
        const provider = new GoogleWeatherProvider({
          apiKey: apiKey!,
          timeout: 120000, // Longer timeout for 10 API calls
        });

        // Request full 240 hours (requires 10 pages at 24 hours per page)
        const forecasts = await provider.fetchHourlyForecast(
          mountainViewLat,
          mountainViewLng,
          { hours: 240 },
        );

        expect(forecasts).toBeDefined();
        expect(Array.isArray(forecasts)).toBe(true);
        // Should have significantly more than 24 hours
        expect(forecasts.length).toBeGreaterThan(100);
        // May not get exactly 240 depending on API data availability
        expect(forecasts.length).toBeLessThanOrEqual(240);

        forecasts.forEach((forecast) => {
          expect(forecast.raw.source).toBe('google-weather-hourly');
        });
      }, 120000);
    });

    describe('Daily Forecast', () => {
      it('should fetch daily forecast with custom days', async () => {
        const provider = new GoogleWeatherProvider({
          apiKey: apiKey!,
          timeout: 30000,
        });

        const forecasts = await provider.fetchDailyForecast(
          mountainViewLat,
          mountainViewLng,
          { days: 5 },
        );

        expect(forecasts).toBeDefined();
        expect(Array.isArray(forecasts)).toBe(true);
        expect(forecasts.length).toBeLessThanOrEqual(5);

        forecasts.forEach((forecast) => {
          expect(forecast.raw.source).toBe('google-weather-daily');
        });
      }, 30000);

      it('should paginate to fetch more than 5 days (one page)', async () => {
        const provider = new GoogleWeatherProvider({
          apiKey: apiKey!,
          timeout: 60000, // Longer timeout for multiple API calls
        });

        // Request 10 days which requires 2 pages (5 days per page)
        const forecasts = await provider.fetchDailyForecast(
          mountainViewLat,
          mountainViewLng,
          { days: 10 },
        );

        expect(forecasts).toBeDefined();
        expect(Array.isArray(forecasts)).toBe(true);
        // Should have more than 5 results (pagination working)
        expect(forecasts.length).toBeGreaterThan(5);
        expect(forecasts.length).toBeLessThanOrEqual(10);

        forecasts.forEach((forecast) => {
          expect(forecast.raw.source).toBe('google-weather-daily');
        });
      }, 60000);
    });

    describe('Hourly History', () => {
      it('should fetch hourly history', async () => {
        const provider = new GoogleWeatherProvider({
          apiKey: apiKey!,
          timeout: 30000,
        });

        const history = await provider.fetchHourlyHistory(
          mountainViewLat,
          mountainViewLng,
          { hours: 12 },
        );

        expect(history).toBeDefined();
        expect(Array.isArray(history)).toBe(true);

        history.forEach((forecast) => {
          expect(forecast.raw.source).toBe('google-weather-history');
          expect(forecast.confidence).toBe(100); // Historical data is 100% confident
        });
      }, 30000);
    });

    describe('Weather Alerts', () => {
      it('should fetch weather alerts (may be empty)', async () => {
        const provider = new GoogleWeatherProvider({
          apiKey: apiKey!,
          timeout: 30000,
        });

        const alerts: WeatherAlert[] = await provider.fetchAlerts(
          mountainViewLat,
          mountainViewLng,
        );

        expect(alerts).toBeDefined();
        expect(Array.isArray(alerts)).toBe(true);

        // Alerts may be empty if no active alerts
        if (alerts.length > 0) {
          const alert = alerts[0];
          expect(typeof alert.id).toBe('string');
          expect(typeof alert.headline).toBe('string');
          expect(typeof alert.severity).toBe('string');
          expect(alert.startTime).toBeInstanceOf(Date);
          expect(alert.endTime).toBeInstanceOf(Date);
        }
      }, 30000);
    });

    describe('Error Handling', () => {
      it('should handle invalid API key', async () => {
        const provider = new GoogleWeatherProvider({
          apiKey: 'invalid-api-key',
          timeout: 10000,
        });

        await expect(
          provider.fetchForLocation(mountainViewLat, mountainViewLng),
        ).rejects.toThrow(AuthenticationError);
      }, 30000);

      it('should handle timeout option', async () => {
        const provider = new GoogleWeatherProvider({
          apiKey: apiKey!,
          timeout: 1, // Very short timeout
        });

        // We expect this to timeout
        await expect(
          provider.fetchForLocation(mountainViewLat, mountainViewLng),
        ).rejects.toThrow(WeatherError);
      }, 30000);
    });
  });
});
