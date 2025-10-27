/**
 * Environment Canada Provider Integration Tests
 *
 * Tests the Environment Canada provider with real API calls.
 * No API key required - this is a public government service.
 */

import { describe, expect, it } from 'vitest';
import { getWeatherAdapter } from '../index';
import type { IWeatherAdapter } from '../shared/types';
import {
  InvalidLocationError,
  NoResultsError,
  WeatherError,
} from '../shared/types';

describe('Environment Canada Provider', () => {
  let adapter: IWeatherAdapter;

  // Calgary, AB coordinates
  const calgaryLat = 51.0447;
  const calgaryLng = -114.0719;

  // New York coordinates (not in Canada)
  const newYorkLat = 40.7128;
  const newYorkLng = -74.006;

  it('should create adapter with default config', async () => {
    adapter = await getWeatherAdapter({
      provider: 'environment-canada',
    });

    expect(adapter).toBeDefined();
    expect(adapter.name).toBe('Environment Canada');
    expect(adapter.providerType).toBe('government');
  });

  it('should test connection successfully', async () => {
    adapter = await getWeatherAdapter({
      provider: 'environment-canada',
    });

    const isConnected = await adapter.testConnection();
    expect(isConnected).toBe(true);
  });

  it('should support Canadian locations', async () => {
    adapter = await getWeatherAdapter({
      provider: 'environment-canada',
    });

    const isSupported = await adapter.supportsLocation(calgaryLat, calgaryLng);
    expect(isSupported).toBe(true);
  });

  it('should not support non-Canadian locations', async () => {
    adapter = await getWeatherAdapter({
      provider: 'environment-canada',
    });

    const isSupported = await adapter.supportsLocation(newYorkLat, newYorkLng);
    expect(isSupported).toBe(false);
  });

  it('should fetch weather forecasts for Calgary', async () => {
    adapter = await getWeatherAdapter({
      provider: 'environment-canada',
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
    expect(forecast.raw.source).toBe('environment-canada-citypage');
  });

  it('should throw InvalidLocationError for non-Canadian location', async () => {
    adapter = await getWeatherAdapter({
      provider: 'environment-canada',
    });

    await expect(
      adapter.fetchForLocation(newYorkLat, newYorkLng),
    ).rejects.toThrow(InvalidLocationError);
  });

  it('should throw InvalidLocationError for invalid coordinates', async () => {
    adapter = await getWeatherAdapter({
      provider: 'environment-canada',
    });

    // Invalid latitude (> 90)
    await expect(adapter.fetchForLocation(100, -114.0719)).rejects.toThrow(
      InvalidLocationError,
    );

    // Invalid longitude (< -180)
    await expect(adapter.fetchForLocation(51.0447, -200)).rejects.toThrow(
      InvalidLocationError,
    );
  });

  it('should respect limit option', async () => {
    adapter = await getWeatherAdapter({
      provider: 'environment-canada',
    });

    const forecasts = await adapter.fetchForLocation(calgaryLat, calgaryLng, {
      limit: 3,
    });

    expect(forecasts).toBeDefined();
    expect(forecasts.length).toBeLessThanOrEqual(3);
  });

  it('should handle timeout option', async () => {
    adapter = await getWeatherAdapter({
      provider: 'environment-canada',
      timeout: 1, // Very short timeout should fail
    });

    await expect(
      adapter.fetchForLocation(calgaryLat, calgaryLng),
    ).rejects.toThrow(WeatherError);
  });
});
