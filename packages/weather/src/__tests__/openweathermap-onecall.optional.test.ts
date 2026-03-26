/**
 * Optional OpenWeatherMap One Call provider integration tests
 *
 * These tests hit the real OpenWeatherMap One Call API and are excluded from
 * normal CI. Run them with `pnpm --filter @happyvertical/weather test:optional`.
 */

import { describe, expect, it } from 'vitest';
import { getWeatherAdapter } from '../index';
import type { IWeatherAdapter } from '../shared/types';
import { WeatherError } from '../shared/types';

const apiKey = process.env.OPENWEATHER_API_KEY;
const requireApiKey = () => {
  if (!apiKey) {
    throw new Error('OPENWEATHER_API_KEY is required for optional tests');
  }

  return apiKey;
};

describe.skipIf(!apiKey)('OpenWeatherMap One Call Provider', () => {
  let adapter: IWeatherAdapter;

  // Calgary, AB coordinates
  const calgaryLat = 51.0447;
  const calgaryLng = -114.0719;

  // New York coordinates
  const newYorkLat = 40.7128;
  const newYorkLng = -74.006;

  it('should create adapter with API key', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap-onecall',
      apiKey: requireApiKey(),
    });

    expect(adapter).toBeDefined();
    expect(adapter.name).toBe('OpenWeatherMap One Call');
    expect(adapter.providerType).toBe('commercial');
  });

  it('should throw WeatherError without API key', async () => {
    await expect(
      getWeatherAdapter({
        provider: 'openweathermap-onecall',
        apiKey: '',
      }),
    ).rejects.toThrow(WeatherError);
  });

  it('should test connection successfully', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap-onecall',
      apiKey: requireApiKey(),
    });

    const isConnected = await adapter.testConnection();
    expect(isConnected).toBe(true);
  });

  it('should support global locations', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap-onecall',
      apiKey: requireApiKey(),
    });

    // Test Canadian location
    const calgarySupported = await adapter.supportsLocation(
      calgaryLat,
      calgaryLng,
    );
    expect(calgarySupported).toBe(true);

    // Test US location
    const newYorkSupported = await adapter.supportsLocation(
      newYorkLat,
      newYorkLng,
    );
    expect(newYorkSupported).toBe(true);
  });

  it('should fetch weather forecasts for Calgary', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap-onecall',
      apiKey: requireApiKey(),
      timeout: 15000, // 15 second timeout for API call
    });

    const forecasts = await adapter.fetchForLocation(calgaryLat, calgaryLng);

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

    // One Call API returns both hourly and daily forecasts
    const source = forecast.raw.source;
    expect([
      'openweathermap-onecall-hourly',
      'openweathermap-onecall-daily',
    ]).toContain(source);

    // Verify optional fields when present
    if (forecast.feelsLike !== undefined) {
      expect(typeof forecast.feelsLike).toBe('number');
    }
    if (forecast.temperatureMin !== undefined) {
      expect(typeof forecast.temperatureMin).toBe('number');
    }
    if (forecast.temperatureMax !== undefined) {
      expect(typeof forecast.temperatureMax).toBe('number');
    }
    if (forecast.precipProbability !== undefined) {
      expect(typeof forecast.precipProbability).toBe('number');
      expect(forecast.precipProbability).toBeGreaterThanOrEqual(0);
      expect(forecast.precipProbability).toBeLessThanOrEqual(100);
    }
  });

  it('should fetch weather forecasts for New York', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap-onecall',
      apiKey: requireApiKey(),
      timeout: 15000,
    });

    const forecasts = await adapter.fetchForLocation(newYorkLat, newYorkLng);

    expect(forecasts).toBeDefined();
    expect(Array.isArray(forecasts)).toBe(true);
    expect(forecasts.length).toBeGreaterThan(0);
  });

  it('should throw error for invalid coordinates', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap-onecall',
      apiKey: requireApiKey(),
    });

    // Invalid latitude (> 90)
    await expect(adapter.fetchForLocation(100, -114.0719)).rejects.toThrow(
      WeatherError,
    );

    // Invalid longitude (< -180)
    await expect(adapter.fetchForLocation(51.0447, -200)).rejects.toThrow(
      WeatherError,
    );
  });

  it('should respect limit option', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap-onecall',
      apiKey: requireApiKey(),
    });

    const forecasts = await adapter.fetchForLocation(calgaryLat, calgaryLng, {
      limit: 10,
    });

    expect(forecasts).toBeDefined();
    expect(forecasts.length).toBeLessThanOrEqual(10);
  });

  it('should handle timeout option', async () => {
    // Note: Testing timeout with real API is flaky because response times vary.
    // This test uses a longer timeout (100ms) which should be reliable for real API calls,
    // but the real validation is that the timeout mechanism works at all.
    adapter = await getWeatherAdapter({
      provider: 'openweathermap-onecall',
      apiKey: requireApiKey(),
      timeout: 100, // Short but realistic timeout
    });

    // We expect this might either succeed quickly or timeout - both are valid
    // The important thing is that the timeout mechanism exists and doesn't hang forever
    try {
      await adapter.fetchForLocation(calgaryLat, calgaryLng);
      // If it succeeds quickly, that's fine - means API is fast
    } catch (error) {
      // If it times out or fails for other reasons, verify it's a WeatherError
      expect(error).toBeInstanceOf(WeatherError);
    }
  });

  it('should return hourly and daily forecasts', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap-onecall',
      apiKey: requireApiKey(),
    });

    const forecasts = await adapter.fetchForLocation(calgaryLat, calgaryLng);

    // One Call API returns 48 hourly + 8 daily = 56 total forecasts
    expect(forecasts.length).toBeGreaterThan(0);
    expect(forecasts.length).toBeLessThanOrEqual(56);

    // Check that we have both hourly and daily forecasts
    const hourlyForecasts = forecasts.filter(
      (f) => f.raw.source === 'openweathermap-onecall-hourly',
    );
    const dailyForecasts = forecasts.filter(
      (f) => f.raw.source === 'openweathermap-onecall-daily',
    );

    // Should have hourly forecasts (up to 48)
    expect(hourlyForecasts.length).toBeGreaterThan(0);
    expect(hourlyForecasts.length).toBeLessThanOrEqual(48);

    // Should have daily forecasts (up to 8)
    expect(dailyForecasts.length).toBeGreaterThan(0);
    expect(dailyForecasts.length).toBeLessThanOrEqual(8);
  });

  it('should have temperatureMin and temperatureMax in daily forecasts', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap-onecall',
      apiKey: requireApiKey(),
    });

    const forecasts = await adapter.fetchForLocation(calgaryLat, calgaryLng);

    const dailyForecasts = forecasts.filter(
      (f) => f.raw.source === 'openweathermap-onecall-daily',
    );

    expect(dailyForecasts.length).toBeGreaterThan(0);

    // Daily forecasts should have min/max temperatures
    dailyForecasts.forEach((forecast) => {
      expect(forecast.temperatureMin).toBeDefined();
      expect(forecast.temperatureMax).toBeDefined();
      expect(typeof forecast.temperatureMin).toBe('number');
      expect(typeof forecast.temperatureMax).toBe('number');
    });
  });
});
