/**
 * Environment Canada Provider Tests
 *
 * These tests are offline and deterministic: every request is served from the
 * recorded fixtures in `./fixtures`, so the suite never depends on runner
 * egress or on the upstream service's rate limits.
 *
 * Coverage against the real API lives in `environment-canada.optional.test.ts`
 * and is opt-in via `ENVIRONMENT_CANADA_INTEGRATION`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWeatherAdapter } from '../index';
import type { IWeatherAdapter } from '../shared/types';
import {
  InvalidLocationError,
  NoResultsError,
  WeatherError,
} from '../shared/types';
import citypageCalgary from './fixtures/environment-canada-citypage-calgary.json';

// Calgary, AB coordinates
const calgaryLat = 51.0447;
const calgaryLng = -114.0719;

// New York coordinates (not in Canada)
const newYorkLat = 40.7128;
const newYorkLng = -74.006;

type FetchMock = ReturnType<typeof stubFetch>;

/**
 * Stub `fetch` with a fixed response and return the mock so tests can assert on
 * the request the provider built.
 */
function stubFetch(response: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  body?: unknown;
}) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    statusText: response.statusText ?? 'OK',
    json: async () => response.body,
  }));

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

function stubCitypageFetch(): FetchMock {
  return stubFetch({ body: citypageCalgary });
}

async function createAdapter(
  options: { timeout?: number } = {},
): Promise<IWeatherAdapter> {
  return getWeatherAdapter({ provider: 'environment-canada', ...options });
}

/** Resolve to the rejection reason so its type and fields can both be checked. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected the call to reject');
    },
    (error) => error,
  );
}

describe('Environment Canada Provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('should create adapter with default config', async () => {
    const adapter = await createAdapter();

    expect(adapter).toBeDefined();
    expect(adapter.name).toBe('Environment Canada');
    expect(adapter.providerType).toBe('government');
  });

  it('should test connection successfully', async () => {
    const fetchMock = stubCitypageFetch();
    const adapter = await createAdapter();

    await expect(adapter.testConnection()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should report a failed connection without throwing', async () => {
    stubFetch({ ok: false, status: 403, statusText: 'Forbidden', body: {} });
    const adapter = await createAdapter();

    await expect(adapter.testConnection()).resolves.toBe(false);
  });

  it('should report a failed connection when the request itself errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const adapter = await createAdapter();

    await expect(adapter.testConnection()).resolves.toBe(false);
  });

  it('should support Canadian locations', async () => {
    const adapter = await createAdapter();

    await expect(
      adapter.supportsLocation(calgaryLat, calgaryLng),
    ).resolves.toBe(true);
  });

  it('should not support non-Canadian locations', async () => {
    const adapter = await createAdapter();

    await expect(
      adapter.supportsLocation(newYorkLat, newYorkLng),
    ).resolves.toBe(false);
  });

  it('should query the citypage collection for the requested bounding box', async () => {
    const fetchMock = stubCitypageFetch();
    const adapter = await createAdapter();

    await adapter.fetchForLocation(calgaryLat, calgaryLng);

    const requested = new URL(fetchMock.mock.calls[0][0]);
    expect(`${requested.origin}${requested.pathname}`).toBe(
      'https://api.weather.gc.ca/collections/citypageweather-realtime/items',
    );
    expect(requested.searchParams.get('f')).toBe('json');
    expect(requested.searchParams.get('limit')).toBe('1');
    expect(requested.searchParams.get('bbox')).toBe(
      `${calgaryLng - 1},${calgaryLat - 1},${calgaryLng + 1},${calgaryLat + 1}`,
    );
  });

  it('should fetch weather forecasts for Calgary', async () => {
    stubCitypageFetch();
    const adapter = await createAdapter();

    const forecasts = await adapter.fetchForLocation(calgaryLat, calgaryLng);

    expect(Array.isArray(forecasts)).toBe(true);
    // One entry for current conditions plus one per recorded forecast period.
    expect(forecasts).toHaveLength(14);

    const forecast = forecasts[0];
    expect(forecast.timestamp).toBeInstanceOf(Date);
    expect(typeof forecast.temperature).toBe('number');
    expect(typeof forecast.humidity).toBe('number');
    expect(typeof forecast.windSpeed).toBe('number');
    expect(typeof forecast.conditions).toBe('string');
    expect(forecast.raw).toBeDefined();
    expect(forecast.raw.source).toBe('environment-canada-citypage');
  });

  it('should map recorded current conditions onto the standard shape', async () => {
    stubCitypageFetch();
    const adapter = await createAdapter();

    const [current] = await adapter.fetchForLocation(calgaryLat, calgaryLng);

    expect(current).toMatchObject({
      timestamp: new Date('2026-07-28T12:00:00Z'),
      temperature: 10.7,
      humidity: 94,
      // 101.4 kPa in the payload, hPa on the standard shape.
      pressure: 1014,
      confidence: 100,
    });
  });

  it('should coerce a non-numeric wind speed to zero', async () => {
    // The recording reports the string "calm" rather than a number.
    stubCitypageFetch();
    const adapter = await createAdapter();

    const [current] = await adapter.fetchForLocation(calgaryLat, calgaryLng);

    expect(current.windSpeed).toBe(0);
  });

  it('should fall back to Unknown when current conditions omit the condition', async () => {
    stubCitypageFetch();
    const adapter = await createAdapter();

    const [current] = await adapter.fetchForLocation(calgaryLat, calgaryLng);

    expect(current.conditions).toBe('Unknown');
  });

  it('should throw InvalidLocationError for non-Canadian location', async () => {
    const fetchMock = stubCitypageFetch();
    const adapter = await createAdapter();

    await expect(
      adapter.fetchForLocation(newYorkLat, newYorkLng),
    ).rejects.toThrow(InvalidLocationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should throw InvalidLocationError for invalid coordinates', async () => {
    const fetchMock = stubCitypageFetch();
    const adapter = await createAdapter();

    // Invalid latitude (> 90)
    await expect(adapter.fetchForLocation(100, -114.0719)).rejects.toThrow(
      InvalidLocationError,
    );

    // Invalid longitude (< -180)
    await expect(adapter.fetchForLocation(51.0447, -200)).rejects.toThrow(
      InvalidLocationError,
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should respect limit option', async () => {
    stubCitypageFetch();
    const adapter = await createAdapter();

    const forecasts = await adapter.fetchForLocation(calgaryLat, calgaryLng, {
      limit: 3,
    });

    expect(forecasts).toHaveLength(3);
  });

  it('should surface a non-ok response as a WeatherError', async () => {
    stubFetch({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      body: {},
    });
    const adapter = await createAdapter();

    const error = await rejection(
      adapter.fetchForLocation(calgaryLat, calgaryLng),
    );

    expect(error).toBeInstanceOf(WeatherError);
    expect((error as WeatherError).code).toBe('HTTP_503');
  });

  it('should throw NoResultsError when the bounding box matches no city', async () => {
    stubFetch({ body: { type: 'FeatureCollection', features: [] } });
    const adapter = await createAdapter();

    await expect(
      adapter.fetchForLocation(calgaryLat, calgaryLng),
    ).rejects.toThrow(NoResultsError);
  });

  it('should handle timeout option', async () => {
    // Never settles on its own; only the provider's abort signal ends it.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const abortError = new Error('The operation was aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          }),
      ),
    );

    const adapter = await createAdapter({ timeout: 1 });

    const error = await rejection(
      adapter.fetchForLocation(calgaryLat, calgaryLng),
    );

    expect(error).toBeInstanceOf(WeatherError);
    expect((error as WeatherError).code).toBe('TIMEOUT');
  });
});
