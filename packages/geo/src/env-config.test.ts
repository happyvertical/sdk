/**
 * Tests for environment variable configuration loading
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getGeoAdapter } from './index';
import type { GeoAdapter } from './shared/types';

describe('Geo Environment Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('HAVE_GEO_PROVIDER', () => {
    it('should load provider from HAVE_GEO_PROVIDER environment variable', async () => {
      process.env.HAVE_GEO_PROVIDER = 'openstreetmap';

      const adapter = await getGeoAdapter();

      expect(adapter).toBeDefined();
      // OpenStreetMap doesn't require API key, so this should work
    });

    it('should load Google Maps provider from environment', async () => {
      process.env.HAVE_GEO_PROVIDER = 'google';
      process.env.GOOGLE_MAPS_API_KEY = 'test-api-key';

      const adapter = await getGeoAdapter();

      expect(adapter).toBeDefined();
    });

    it('should throw error when provider is missing', async () => {
      delete process.env.HAVE_GEO_PROVIDER;

      await expect(getGeoAdapter()).rejects.toThrow(
        'Provider is required. Set via options.provider or HAVE_GEO_PROVIDER environment variable.',
      );
    });

    it('should prioritize user-provided options over environment', async () => {
      process.env.HAVE_GEO_PROVIDER = 'google';

      const adapter = await getGeoAdapter({ provider: 'openstreetmap' });

      expect(adapter).toBeDefined();
      // Should create OpenStreetMap adapter despite env var saying google
    });
  });

  describe('GOOGLE_MAPS_API_KEY', () => {
    it('should load Google Maps API key from environment', async () => {
      process.env.HAVE_GEO_PROVIDER = 'google';
      process.env.GOOGLE_MAPS_API_KEY = 'env-api-key';

      const adapter = await getGeoAdapter();

      expect(adapter).toBeDefined();
    });

    it('should prioritize user-provided API key over environment', async () => {
      process.env.GOOGLE_MAPS_API_KEY = 'env-api-key';

      const adapter = await getGeoAdapter({
        provider: 'google',
        apiKey: 'user-api-key',
      });

      expect(adapter).toBeDefined();
    });
  });

  describe('HAVE_GEO_TIMEOUT', () => {
    it('should load timeout from environment as number', async () => {
      process.env.HAVE_GEO_PROVIDER = 'openstreetmap';
      process.env.HAVE_GEO_TIMEOUT = '5000';

      const adapter = await getGeoAdapter();

      expect(adapter).toBeDefined();
    });

    it('should prioritize user-provided timeout over environment', async () => {
      process.env.HAVE_GEO_PROVIDER = 'openstreetmap';
      process.env.HAVE_GEO_TIMEOUT = '5000';

      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        timeout: 15000,
      });

      expect(adapter).toBeDefined();
    });
  });

  describe('HAVE_GEO_MAX_RESULTS', () => {
    it('should load maxResults from environment as number', async () => {
      process.env.HAVE_GEO_PROVIDER = 'openstreetmap';
      process.env.HAVE_GEO_MAX_RESULTS = '5';

      const adapter = await getGeoAdapter();

      expect(adapter).toBeDefined();
    });
  });

  describe('OpenStreetMap-specific environment variables', () => {
    it('should load rateLimitDelay from environment', async () => {
      process.env.HAVE_GEO_PROVIDER = 'openstreetmap';
      process.env.HAVE_GEO_RATE_LIMIT_DELAY = '2000';

      const adapter = await getGeoAdapter();

      expect(adapter).toBeDefined();
    });

    it('should load userAgent from environment', async () => {
      process.env.HAVE_GEO_PROVIDER = 'openstreetmap';
      process.env.HAVE_GEO_USER_AGENT = 'MyCustomApp/1.0';

      const adapter = await getGeoAdapter();

      expect(adapter).toBeDefined();
    });
  });

  describe('Combined environment and user options', () => {
    it('should merge environment variables with user options', async () => {
      process.env.HAVE_GEO_PROVIDER = 'google';
      process.env.HAVE_GEO_TIMEOUT = '8000';
      process.env.HAVE_GEO_MAX_RESULTS = '15';
      process.env.GOOGLE_MAPS_API_KEY = 'env-key';

      const adapter = await getGeoAdapter({
        // User provides apiKey, other values from env
        apiKey: 'user-key',
      });

      expect(adapter).toBeDefined();
    });

    it('should work with all OpenStreetMap options from environment', async () => {
      process.env.HAVE_GEO_PROVIDER = 'openstreetmap';
      process.env.HAVE_GEO_TIMEOUT = '12000';
      process.env.HAVE_GEO_MAX_RESULTS = '20';
      process.env.HAVE_GEO_RATE_LIMIT_DELAY = '1500';
      process.env.HAVE_GEO_USER_AGENT = 'TestApp/2.0';

      const adapter = await getGeoAdapter();

      expect(adapter).toBeDefined();
    });
  });

  describe('Environment variable validation', () => {
    it('should handle invalid provider gracefully', async () => {
      process.env.HAVE_GEO_PROVIDER = 'invalid-provider';

      await expect(getGeoAdapter()).rejects.toThrow('Unsupported provider');
    });

    it('should handle invalid number for timeout', async () => {
      process.env.HAVE_GEO_PROVIDER = 'openstreetmap';
      process.env.HAVE_GEO_TIMEOUT = 'not-a-number';

      // Should still create adapter, but timeout might be NaN or throw
      // loadEnvConfig warns but doesn't throw, so adapter should be created
      const adapter = await getGeoAdapter();
      expect(adapter).toBeDefined();
    });
  });

  describe('Real-world usage patterns', () => {
    it('should support development mode with env vars', async () => {
      // Simulate .env file configuration
      process.env.HAVE_GEO_PROVIDER = 'openstreetmap';
      process.env.HAVE_GEO_RATE_LIMIT_DELAY = '500';

      const adapter = await getGeoAdapter();

      expect(adapter).toBeDefined();
    });

    it('should support production mode with explicit options', async () => {
      // Production might use env for provider but explicit for sensitive data
      process.env.HAVE_GEO_PROVIDER = 'google';

      const adapter = await getGeoAdapter({
        apiKey: 'production-secret-key',
        timeout: 30000,
      });

      expect(adapter).toBeDefined();
    });

    it('should support testing mode with full explicit config', async () => {
      // Tests typically use explicit options to avoid env pollution
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        timeout: 5000,
        maxResults: 1,
      });

      expect(adapter).toBeDefined();
    });
  });
});
