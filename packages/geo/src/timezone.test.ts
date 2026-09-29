/**
 * Unit tests for Location.timezone resolution (offline table + providers).
 * Network calls are mocked; no API keys required.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const googleClient = {
  geocode: vi.fn(),
  reverseGeocode: vi.fn(),
  placesNearby: vi.fn(),
  timezone: vi.fn(),
};

vi.mock('@googlemaps/google-maps-services-js', () => ({
  Client: vi.fn(function client() {
    return googleClient;
  }),
}));

const { getGeoAdapter, timezoneForCoordinates, withOfflineTimezones } =
  await import('./index');

describe('timezoneForCoordinates', () => {
  it.each([
    ['Edmonton', 53.5461, -113.4938, 'America/Edmonton'],
    ['Regina', 50.4452, -104.6189, 'America/Regina'],
    ['St. John’s', 47.5615, -52.7126, 'America/St_Johns'],
    ['Phoenix', 33.4484, -112.074, 'America/Phoenix'],
    ['Paris', 48.8584, 2.2945, 'Europe/Paris'],
    ['Sydney', -33.8688, 151.2093, 'Australia/Sydney'],
  ])('resolves %s', (_name, lat, lng, expected) => {
    expect(timezoneForCoordinates(lat, lng)).toBe(expected);
  });

  it('returns undefined for invalid coordinates', () => {
    expect(timezoneForCoordinates(91, 0)).toBeUndefined();
    expect(timezoneForCoordinates(0, 181)).toBeUndefined();
    expect(timezoneForCoordinates(Number.NaN, 0)).toBeUndefined();
  });

  it('keeps a timezone a provider already set', () => {
    const [location] = withOfflineTimezones([
      {
        id: 'x',
        type: 'city',
        name: 'Edmonton',
        latitude: 53.5461,
        longitude: -113.4938,
        addressComponents: {},
        countryCode: 'CA',
        timezone: 'America/Denver',
        raw: null,
      },
    ]);
    expect(location.timezone).toBe('America/Denver');
  });
});

describe('OpenStreetMap provider timezone', () => {
  const nominatimEdmonton = {
    place_id: 1,
    licence: '',
    osm_type: 'relation',
    osm_id: 1,
    lat: '53.5461',
    lon: '-113.4938',
    display_name: 'Edmonton, Alberta, Canada',
    address: { city: 'Edmonton', state: 'Alberta', country_code: 'ca' },
    type: 'city',
    addresstype: 'city',
  };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([nominatimEdmonton]))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fills timezone on lookup results', async () => {
    const adapter = await getGeoAdapter({
      provider: 'openstreetmap',
      rateLimitDelay: 1,
    });
    const [location] = await adapter.lookup('Edmonton tz-osm-1');
    expect(location.timezone).toBe('America/Edmonton');
  });

  it('fills timezone on reverse geocode results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(nominatimEdmonton))),
    );
    const adapter = await getGeoAdapter({
      provider: 'openstreetmap',
      rateLimitDelay: 1,
    });
    const [location] = await adapter.reverseGeocode(53.5461, -113.4938);
    expect(location.timezone).toBe('America/Edmonton');
  });

  it('fills timezone on POI results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              elements: [
                {
                  type: 'node',
                  id: 7,
                  lat: 48.8584,
                  lon: 2.2945,
                  tags: { name: 'Café', amenity: 'cafe' },
                },
              ],
            }),
          ),
      ),
    );
    const adapter = await getGeoAdapter({
      provider: 'openstreetmap',
      rateLimitDelay: 1,
    });
    const [poi] = (await adapter.findPoisNear?.(48.8584, 2.2945, 100)) ?? [];
    expect(poi.timezone).toBe('Europe/Paris');
  });

  it("leaves timezone unset with timezoneLookup: 'none'", async () => {
    const adapter = await getGeoAdapter({
      provider: 'openstreetmap',
      rateLimitDelay: 1,
      timezoneLookup: 'none',
    });
    const [location] = await adapter.lookup('Edmonton tz-osm-2');
    expect(location.timezone).toBeUndefined();
  });

  it('reads the mode from HAVE_GEO_TIMEZONE_LOOKUP', async () => {
    vi.stubEnv('HAVE_GEO_TIMEZONE_LOOKUP', 'none');
    try {
      const adapter = await getGeoAdapter({
        provider: 'openstreetmap',
        rateLimitDelay: 1,
      });
      const [location] = await adapter.lookup('Edmonton tz-osm-3');
      expect(location.timezone).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('Google provider timezone', () => {
  const geocodeEdmonton = {
    data: {
      status: 'OK',
      results: [
        {
          place_id: 'g-edm',
          formatted_address: 'Edmonton, AB, Canada',
          types: ['locality'],
          geometry: { location: { lat: 53.5461, lng: -113.4938 } },
          address_components: [
            { long_name: 'Canada', short_name: 'CA', types: ['country'] },
          ],
        },
      ],
    },
  };

  beforeEach(() => {
    for (const fn of Object.values(googleClient)) fn.mockReset();
    googleClient.geocode.mockResolvedValue(geocodeEdmonton);
    googleClient.reverseGeocode.mockResolvedValue(geocodeEdmonton);
  });

  it('uses the offline table by default without calling the Time Zone API', async () => {
    const adapter = await getGeoAdapter({ provider: 'google', apiKey: 'k' });
    const [location] = await adapter.lookup('Edmonton tz-g-1');
    expect(location.timezone).toBe('America/Edmonton');
    expect(googleClient.timezone).not.toHaveBeenCalled();
  });

  it("uses the Time Zone API with timezoneLookup: 'api'", async () => {
    googleClient.timezone.mockResolvedValue({
      data: { status: 'OK', timeZoneId: 'America/Edmonton' },
    });
    const adapter = await getGeoAdapter({
      provider: 'google',
      apiKey: 'k',
      timezoneLookup: 'api',
    });
    const [location] = await adapter.reverseGeocode(53.5461, -113.4938);
    expect(location.timezone).toBe('America/Edmonton');
    expect(googleClient.timezone).toHaveBeenCalledTimes(1);
    expect(googleClient.timezone.mock.calls[0][0].params.location).toEqual({
      lat: 53.5461,
      lng: -113.4938,
    });
  });

  it('falls back to the offline table when the Time Zone API is denied', async () => {
    googleClient.timezone.mockResolvedValue({
      data: { status: 'REQUEST_DENIED' },
    });
    const adapter = await getGeoAdapter({
      provider: 'google',
      apiKey: 'k',
      timezoneLookup: 'api',
    });
    const [location] = await adapter.lookup('Edmonton tz-g-2');
    expect(location.timezone).toBe('America/Edmonton');
  });

  it('falls back to the offline table when the Time Zone API throws', async () => {
    googleClient.timezone.mockRejectedValue(new Error('network down'));
    const adapter = await getGeoAdapter({
      provider: 'google',
      apiKey: 'k',
      timezoneLookup: 'api',
    });
    const [location] = await adapter.lookup('Edmonton tz-g-3');
    expect(location.timezone).toBe('America/Edmonton');
  });

  it("leaves timezone unset with timezoneLookup: 'none'", async () => {
    const adapter = await getGeoAdapter({
      provider: 'google',
      apiKey: 'k',
      timezoneLookup: 'none',
    });
    const [location] = await adapter.lookup('Edmonton tz-g-4');
    expect(location.timezone).toBeUndefined();
  });
});
