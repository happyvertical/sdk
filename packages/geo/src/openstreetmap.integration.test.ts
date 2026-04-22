/**
 * Integration tests for OpenStreetMap provider
 * Uses public Nominatim API with rate limiting
 *
 * These tests hit external APIs and may timeout in CI environments.
 * Skip by default - run with RUN_INTEGRATION_TESTS=true
 */

import { describe, expect, it } from 'vitest';
import { getGeoAdapter } from './index';
import type { Location } from './shared/types';
import { InvalidQueryError } from './shared/types';

// Skip in CI unless explicitly enabled
const SKIP_INTEGRATION = !process.env.RUN_INTEGRATION_TESTS;

describe.skipIf(SKIP_INTEGRATION)('OpenStreetMap Provider Integration', () => {
  describe('lookup', () => {
    it('should find Eiffel Tower', async () => {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        rateLimitDelay: 1000,
      });

      const results = await adapter.lookup('Eiffel Tower, Paris');

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      const location = results[0];
      expect(location.id).toBeDefined();
      expect(location.name).toContain('Paris');
      expect(location.latitude).toBeCloseTo(48.858, 1);
      expect(location.longitude).toBeCloseTo(2.294, 1);
      expect(location.countryCode).toBe('FR');
    }, 15000);

    it('should find city by name', async () => {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        rateLimitDelay: 1000,
      });

      const results = await adapter.lookup('Tokyo, Japan');

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      const location = results[0];
      // OSM may return name in local language (東京都) or English (Tokyo)
      expect(location.name).toBeDefined();
      expect(location.countryCode).toBe('JP');
    }, 15000);

    it('should find address', async () => {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        rateLimitDelay: 1000,
      });

      const results = await adapter.lookup('10 Downing Street, London');

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      const location = results[0];
      expect(location.name).toContain('London');
      expect(location.countryCode).toBe('GB');
    }, 15000);

    it('should return empty array for invalid query', async () => {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        rateLimitDelay: 1000,
      });

      const results = await adapter.lookup('xyznonexistentlocation12345abc');

      expect(results).toEqual([]);
    }, 15000);

    it('should throw error for empty query', async () => {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
      });

      await expect(adapter.lookup('')).rejects.toThrow(InvalidQueryError);
    });
  });

  describe('reverseGeocode', () => {
    it('should reverse geocode Eiffel Tower coordinates', async () => {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        rateLimitDelay: 1000,
      });

      const results = await adapter.reverseGeocode(48.8584, 2.2945);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      const location = results[0];
      expect(location.name).toContain('Paris');
      expect(location.countryCode).toBe('FR');
      expect(location.latitude).toBeCloseTo(48.8584, 2);
      expect(location.longitude).toBeCloseTo(2.2945, 2);
    }, 15000);

    it('should reverse geocode city center', async () => {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        rateLimitDelay: 1000,
      });

      // London coordinates
      const results = await adapter.reverseGeocode(51.5074, -0.1278);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      const location = results[0];
      expect(location.countryCode).toBe('GB');
      expect(location.name).toContain('London');
    }, 15000);

    it('should throw error for invalid coordinates', async () => {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
      });

      await expect(adapter.reverseGeocode(91, 0)).rejects.toThrow(
        InvalidQueryError,
      );
      await expect(adapter.reverseGeocode(0, 181)).rejects.toThrow(
        InvalidQueryError,
      );
    });
  });

  describe('Location structure', () => {
    it('should return properly structured Location objects', async () => {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        rateLimitDelay: 1000,
      });

      const results = await adapter.lookup('Berlin, Germany');

      expect(results.length).toBeGreaterThan(0);
      const location = results[0];

      // Required fields
      expect(location.id).toBeDefined();
      expect(location.name).toBeDefined();
      expect(location.latitude).toBeDefined();
      expect(location.longitude).toBeDefined();
      expect(location.countryCode).toBeDefined();
      expect(location.type).toBeDefined();
      expect(location.addressComponents).toBeDefined();
      expect(location.raw).toBeDefined();

      // Type should be one of the valid types
      expect([
        'country',
        'region',
        'city',
        'address',
        'point_of_interest',
        'unknown',
      ]).toContain(location.type);
    }, 15000);
  });

  describe('Rate limiting', () => {
    it('should enforce rate limiting between requests', async () => {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        rateLimitDelay: 1000,
      });

      const startTime = Date.now();

      await adapter.lookup('Paris');
      await adapter.lookup('London');

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take at least 1 second between requests
      expect(duration).toBeGreaterThanOrEqual(1000);
    }, 20000);
  });

  describe('findPoisNear (Overpass)', () => {
    it('should return POIs near downtown Edmonton', async () => {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        rateLimitDelay: 1000,
      });
      expect(typeof adapter.findPoisNear).toBe('function');

      const results = await adapter.findPoisNear!(53.5461, -113.4938, 250, {
        limit: 10,
      });
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      const poi = results[0];
      expect(poi.type).toBe('point_of_interest');
      expect(typeof poi.name).toBe('string');
      expect(poi.latitude).toBeGreaterThan(53);
      expect(poi.latitude).toBeLessThan(54);
      expect(poi.longitude).toBeGreaterThan(-114);
      expect(poi.longitude).toBeLessThan(-113);
      // Overpass ids are stable enough to assert the prefix shape.
      expect(poi.id.startsWith('osm-')).toBe(true);
    }, 30000);

    it('should filter by type when provided', async () => {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        rateLimitDelay: 1000,
      });

      // Query specifically for cafes; expect at least one result in Paris.
      const results = await adapter.findPoisNear!(48.8566, 2.3522, 500, {
        types: ['cafe'],
        limit: 5,
      });
      expect(results.length).toBeGreaterThan(0);
      // Every returned element's raw tags should mention "cafe" somewhere in
      // the amenity/shop/tourism/craft space — we just check that our
      // filter was respected, not that Overpass categorizes perfectly.
      for (const result of results) {
        const tags =
          (result.raw as { tags?: Record<string, string> })?.tags ?? {};
        const values = Object.values(tags).join('|').toLowerCase();
        expect(values.includes('cafe')).toBe(true);
      }
    }, 30000);

    it('should reject invalid coordinates', async () => {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        rateLimitDelay: 1000,
      });

      await expect(adapter.findPoisNear!(999, 0, 100)).rejects.toThrow(
        InvalidQueryError,
      );
    });

    it('should reject non-positive limits', async () => {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        rateLimitDelay: 1000,
      });

      await expect(
        adapter.findPoisNear!(53.5461, -113.4938, 100, { limit: 0 }),
      ).rejects.toThrow(InvalidQueryError);
      await expect(
        adapter.findPoisNear!(53.5461, -113.4938, 100, { limit: -5 }),
      ).rejects.toThrow(InvalidQueryError);
    });

    it('should treat keyword metacharacters literally, not as regex', async () => {
      // Keyword with characters that are regex-meaningful in Overpass ERE.
      // Pre-fix this blew up the query; post-fix the escape helper treats
      // them as literals and the query returns cleanly (0 or more results
      // — we just assert it doesn't throw).
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        rateLimitDelay: 1000,
      });

      await expect(
        adapter.findPoisNear!(53.5461, -113.4938, 200, {
          keyword: 'C++ [coffee] (bar).',
          limit: 3,
        }),
      ).resolves.toBeDefined();
    }, 30000);
  });
});
