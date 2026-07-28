/**
 * Optional Environment Canada provider integration tests
 *
 * These tests hit the real Environment Canada MSC Geomet API and are excluded
 * from normal CI. The service needs no API key, so there is no key-shaped gate
 * to fall back on: opt in explicitly with `ENVIRONMENT_CANADA_INTEGRATION=1`.
 *
 *   ENVIRONMENT_CANADA_INTEGRATION=1 \
 *     pnpm --filter @happyvertical/weather test:optional
 *
 * Run these after re-recording `./fixtures/environment-canada-citypage-*.json`
 * to confirm the live payload still matches the shape the offline suite in
 * `environment-canada.spec.ts` asserts against.
 */

import { describe, expect, it } from 'vitest';
import { getWeatherAdapter } from '../index';
import type { IWeatherAdapter } from '../shared/types';
import { InvalidLocationError } from '../shared/types';

const optedIn = process.env.ENVIRONMENT_CANADA_INTEGRATION === '1';

// Calgary, AB coordinates
const calgaryLat = 51.0447;
const calgaryLng = -114.0719;

// New York coordinates (not in Canada)
const newYorkLat = 40.7128;
const newYorkLng = -74.006;

describe.skipIf(!optedIn)('Environment Canada Provider (live API)', () => {
  let adapter: IWeatherAdapter;

  it('reaches the live service', async () => {
    adapter = await getWeatherAdapter({
      provider: 'environment-canada',
      timeout: 15000,
    });

    await expect(adapter.testConnection()).resolves.toBe(true);
  });

  it('returns forecasts for Calgary in the recorded shape', async () => {
    adapter = await getWeatherAdapter({
      provider: 'environment-canada',
      timeout: 15000,
    });

    const forecasts = await adapter.fetchForLocation(calgaryLat, calgaryLng);

    expect(Array.isArray(forecasts)).toBe(true);
    expect(forecasts.length).toBeGreaterThan(0);

    const forecast = forecasts[0];
    expect(forecast.timestamp).toBeInstanceOf(Date);
    expect(typeof forecast.temperature).toBe('number');
    expect(typeof forecast.humidity).toBe('number');
    expect(typeof forecast.windSpeed).toBe('number');
    expect(typeof forecast.conditions).toBe('string');
    expect(forecast.raw).toBeDefined();
    expect(forecast.raw.source).toBe('environment-canada-citypage');
  }, 30000);

  it('respects the limit option against live data', async () => {
    adapter = await getWeatherAdapter({
      provider: 'environment-canada',
      timeout: 15000,
    });

    const forecasts = await adapter.fetchForLocation(calgaryLat, calgaryLng, {
      limit: 3,
    });

    expect(forecasts.length).toBeLessThanOrEqual(3);
  }, 30000);

  it('rejects non-Canadian coordinates before calling the service', async () => {
    adapter = await getWeatherAdapter({ provider: 'environment-canada' });

    await expect(
      adapter.fetchForLocation(newYorkLat, newYorkLng),
    ).rejects.toThrow(InvalidLocationError);
  });
});
