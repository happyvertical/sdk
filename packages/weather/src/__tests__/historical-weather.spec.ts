import { afterEach, describe, expect, it, vi } from 'vitest';
import { getWeatherAdapter } from '../index';
import { EnvironmentCanadaProvider } from '../providers/environment-canada';
import { GoogleWeatherProvider } from '../providers/google-weather';
import { OpenMeteoProvider } from '../providers/open-meteo';
import { OpenWeatherMapProvider } from '../providers/openweathermap';
import { OpenWeatherMapOneCallProvider } from '../providers/openweathermap-onecall';
import type { IWeatherProvider, WeatherForecast } from '../shared/types';
import { UnsupportedWeatherCapabilityError } from '../shared/types';

describe('standardized historical weather adapters', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exposes fetchHistoricalForLocation on every provider', () => {
    const providers: IWeatherProvider[] = [
      new EnvironmentCanadaProvider(),
      new OpenWeatherMapProvider({ apiKey: 'test-key' }),
      new OpenWeatherMapOneCallProvider({ apiKey: 'test-key' }),
      new GoogleWeatherProvider({ apiKey: 'test-key' }),
      new OpenMeteoProvider(),
    ];

    for (const provider of providers) {
      expect(typeof provider.fetchHistoricalForLocation).toBe('function');
    }
  });

  it('throws typed unsupported-capability errors for unsupported adapters', async () => {
    const provider = new OpenWeatherMapProvider({ apiKey: 'test-key' });

    await expect(
      provider.fetchHistoricalForLocation(51.0447, -114.0719, {
        start: '2025-01-01T00:00:00Z',
        end: '2025-01-01T01:00:00Z',
      }),
    ).rejects.toBeInstanceOf(UnsupportedWeatherCapabilityError);
  });

  it('delegates Google historical requests to hourly history within the supported range', async () => {
    const provider = new GoogleWeatherProvider({ apiKey: 'test-key' });
    const now = new Date('2026-01-15T12:00:00Z');
    vi.setSystemTime(now);
    const forecast: WeatherForecast = {
      timestamp: new Date('2026-01-15T11:00:00Z'),
      temperature: -3,
      humidity: 70,
      windSpeed: 10,
      conditions: 'Cloudy',
      raw: { source: 'google-weather-history' },
    };
    const historySpy = vi
      .spyOn(provider, 'fetchHourlyHistory')
      .mockResolvedValue([forecast]);

    const result = await provider.fetchHistoricalForLocation(
      51.0447,
      -114.0719,
      {
        start: '2026-01-15T10:00:00Z',
        end: '2026-01-15T12:00:00Z',
      },
    );

    expect(historySpy).toHaveBeenCalledWith(
      51.0447,
      -114.0719,
      expect.objectContaining({ hours: 3 }),
    );
    expect(result).toEqual([forecast]);
  });

  it('transforms Open-Meteo archive rows into standard forecasts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          latitude: 52.268,
          longitude: -114.093,
          timezone: 'UTC',
          hourly_units: { visibility: 'm' },
          hourly: {
            time: ['2026-01-15T18:00', '2026-01-15T19:00:00Z'],
            temperature_2m: [-4.2, -3.8],
            relative_humidity_2m: [76, 74],
            precipitation: [0, 0.2],
            weather_code: [3, 61],
            cloud_cover: [100, 96],
            wind_speed_10m: [18.4, 20.1],
            wind_direction_10m: [270, 275],
            wind_gusts_10m: [28, 31],
            visibility: [12000, 10000],
          },
        }),
      })),
    );

    const provider = new OpenMeteoProvider();
    const forecasts = await provider.fetchHistoricalForLocation(
      52.268,
      -114.093,
      {
        start: '2026-01-15T18:00:00Z',
        end: '2026-01-15T19:00:00Z',
      },
    );

    expect(forecasts).toHaveLength(2);
    expect(forecasts[0]).toMatchObject({
      temperature: -4,
      humidity: 76,
      windSpeed: 18,
      conditions: 'Overcast',
      visibility: 12,
      raw: expect.objectContaining({ source: 'open-meteo-archive' }),
    });
    expect(forecasts[1].conditions).toBe('Rain');
  });

  it('uses Environment Canada climate-hourly observations for Canadian historical requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          type: 'FeatureCollection',
          features: [
            {
              id: '3025484.2026.1.15.12',
              type: 'Feature',
              geometry: {
                type: 'Point',
                coordinates: [-113.8944, 52.1822],
              },
              properties: {
                STATION_NAME: 'RED DEER REGIONAL A',
                CLIMATE_IDENTIFIER: '3025484',
                UTC_DATE: '2026-01-15T19:00:00',
                TEMP: -2.6,
                RELATIVE_HUMIDITY: 82,
                PRECIP_AMOUNT: 0,
                STATION_PRESSURE: 91.33,
                VISIBILITY: 16.1,
                WEATHER_ENG_DESC: 'Mostly Cloudy',
                WIND_DIRECTION: 27,
                WIND_SPEED: 13,
                LONGITUDE_DECIMAL_DEGREES: -113.8944,
                LATITUDE_DECIMAL_DEGREES: 52.1822,
              },
            },
          ],
        }),
      })),
    );

    const provider = new EnvironmentCanadaProvider();
    const forecasts = await provider.fetchHistoricalForLocation(
      52.268,
      -114.093,
      {
        start: '2026-01-15T19:00:00Z',
        end: '2026-01-15T19:00:00Z',
      },
    );

    expect(forecasts).toHaveLength(1);
    expect(forecasts[0]).toMatchObject({
      temperature: -3,
      humidity: 82,
      windDirection: 270,
      raw: expect.objectContaining({
        source: 'environment-canada-climate-hourly',
        stationName: 'RED DEER REGIONAL A',
      }),
    });
  });

  it('creates an Open-Meteo adapter through getWeatherAdapter', async () => {
    const adapter = await getWeatherAdapter({ provider: 'open-meteo' });
    expect(adapter).toBeInstanceOf(OpenMeteoProvider);
  });
});
