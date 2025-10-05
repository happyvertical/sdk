/**
 * Integration tests for Google Maps provider
 * Requires GOOGLE_MAPS_API_KEY environment variable
 */

import { describe, expect, it } from 'vitest';
import { getGeoAdapter } from './index';
import type { Location } from './shared/types';
import { AuthenticationError, InvalidQueryError } from './shared/types';

const apiKey = process.env.GOOGLE_MAPS_API_KEY;

describe('Google Maps Provider Integration', () => {
  if (!apiKey) {
    it.skip('GOOGLE_MAPS_API_KEY not set, skipping integration tests', () => {
      expect(true).toBe(true);
    });
    return;
  }

  describe('lookup', () => {
    it('should find Eiffel Tower', async () => {
      const adapter = await getGeoAdapter({
        provider: 'google',
        apiKey: apiKey!,
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
      expect(location.type).toBe('point_of_interest');
    }, 10000);

    it('should find city by name', async () => {
      const adapter = await getGeoAdapter({
        provider: 'google',
        apiKey: apiKey!,
      });

      const results = await adapter.lookup('Tokyo, Japan');

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      const location = results[0];
      expect(location.name).toContain('Tokyo');
      expect(location.countryCode).toBe('JP');
      expect(location.type).toBe('city');
      expect(location.addressComponents.city).toBeDefined();
    }, 10000);

    it('should find address', async () => {
      const adapter = await getGeoAdapter({
        provider: 'google',
        apiKey: apiKey!,
      });

      const results = await adapter.lookup(
        '1600 Amphitheatre Parkway, Mountain View, CA',
      );

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      const location = results[0];
      expect(location.type).toBe('address');
      expect(location.addressComponents.streetNumber).toBe('1600');
      expect(location.addressComponents.streetName).toContain('Amphitheatre');
      expect(location.addressComponents.city).toBe('Mountain View');
      expect(location.addressComponents.region).toBe('California');
      expect(location.countryCode).toBe('US');
    }, 10000);

    it('should return empty array for invalid query', async () => {
      const adapter = await getGeoAdapter({
        provider: 'google',
        apiKey: apiKey!,
      });

      const results = await adapter.lookup('xyznonexistentlocation12345');

      expect(results).toEqual([]);
    }, 10000);

    it('should throw error for empty query', async () => {
      const adapter = await getGeoAdapter({
        provider: 'google',
        apiKey: apiKey!,
      });

      await expect(adapter.lookup('')).rejects.toThrow(InvalidQueryError);
    });

    it('should throw error for invalid API key', async () => {
      const adapter = await getGeoAdapter({
        provider: 'google',
        apiKey: 'invalid-api-key',
      });

      await expect(adapter.lookup('Paris')).rejects.toThrow(
        AuthenticationError,
      );
    }, 10000);
  });

  describe('reverseGeocode', () => {
    it('should reverse geocode Eiffel Tower coordinates', async () => {
      const adapter = await getGeoAdapter({
        provider: 'google',
        apiKey: apiKey!,
      });

      const results = await adapter.reverseGeocode(48.8584, 2.2945);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      const location = results[0];
      expect(location.name).toContain('Paris');
      expect(location.countryCode).toBe('FR');
      expect(location.latitude).toBeCloseTo(48.8584, 2);
      expect(location.longitude).toBeCloseTo(2.2945, 2);
    }, 10000);

    it('should reverse geocode city center', async () => {
      const adapter = await getGeoAdapter({
        provider: 'google',
        apiKey: apiKey!,
      });

      // NYC coordinates
      const results = await adapter.reverseGeocode(40.7128, -74.006);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      const location = results[0];
      expect(location.countryCode).toBe('US');
      expect(location.addressComponents.city).toBeDefined();
    }, 10000);

    it('should throw error for invalid coordinates', async () => {
      const adapter = await getGeoAdapter({
        provider: 'google',
        apiKey: apiKey!,
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
        provider: 'google',
        apiKey: apiKey!,
      });

      const results = await adapter.lookup('London, UK');

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
    }, 10000);
  });
});
