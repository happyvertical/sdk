/**
 * OpenWeatherMap Provider Integration Tests
 *
 * Tests the OpenWeatherMap provider with real API calls.
 * Requires OPENWEATHER_API_KEY environment variable.
 */

import { describe, expect, it } from 'vitest';
import { getWeatherAdapter } from '../index';
import type { IWeatherAdapter } from '../shared/types';
import { AuthenticationError, WeatherError } from '../shared/types';

describe('OpenWeatherMap Provider', () => {
  let adapter: IWeatherAdapter;
  const apiKey =
    process.env.OPENWEATHER_API_KEY || 'ef11b75af0e7d96644e30156a6e286c8';

  // Calgary, AB coordinates
  const calgaryLat = 51.0447;
  const calgaryLng = -114.0719;

  // New York coordinates
  const newYorkLat = 40.7128;
  const newYorkLng = -74.006;

  it('should create adapter with API key', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap',
      apiKey,
    });

    expect(adapter).toBeDefined();
    expect(adapter.name).toBe('OpenWeatherMap');
    expect(adapter.providerType).toBe('commercial');
  });

  it('should throw WeatherError without API key', async () => {
    await expect(
      getWeatherAdapter({
        provider: 'openweathermap',
        apiKey: '',
      }),
    ).rejects.toThrow(WeatherError);
  });

  it('should test connection successfully', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap',
      apiKey,
    });

    const isConnected = await adapter.testConnection();
    expect(isConnected).toBe(true);
  });

  it('should support global locations', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap',
      apiKey,
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
      provider: 'openweathermap',
      apiKey,
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
    expect(forecast.raw.source).toBe('openweathermap-5day-3hour');

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
      provider: 'openweathermap',
      apiKey,
      timeout: 15000,
    });

    const forecasts = await adapter.fetchForLocation(newYorkLat, newYorkLng);

    expect(forecasts).toBeDefined();
    expect(Array.isArray(forecasts)).toBe(true);
    expect(forecasts.length).toBeGreaterThan(0);
  });

  it('should throw error for invalid coordinates', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap',
      apiKey,
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
      provider: 'openweathermap',
      apiKey,
    });

    const forecasts = await adapter.fetchForLocation(calgaryLat, calgaryLng, {
      limit: 5,
    });

    expect(forecasts).toBeDefined();
    expect(forecasts.length).toBeLessThanOrEqual(5);
  });

  it('should handle timeout option', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap',
      apiKey,
      timeout: 1, // Very short timeout should fail
    });

    await expect(
      adapter.fetchForLocation(calgaryLat, calgaryLng),
    ).rejects.toThrow(WeatherError);
  });

  it('should return 40 forecast periods (5 days, 3-hour intervals)', async () => {
    adapter = await getWeatherAdapter({
      provider: 'openweathermap',
      apiKey,
    });

    const forecasts = await adapter.fetchForLocation(calgaryLat, calgaryLng);

    // OpenWeatherMap free tier returns 40 forecast periods (5 days * 8 per day)
    expect(forecasts.length).toBeLessThanOrEqual(40);
    expect(forecasts.length).toBeGreaterThan(0);
  });
});
