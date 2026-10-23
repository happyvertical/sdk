import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntervalReportOptions, IntervalReportResult } from '../index.js';
import { validateIntervalReport } from './interval-report.js';
import { GA4Provider } from './providers/ga4.js';
import { MatomoProvider } from './providers/matomo.js';
import { PlausibleProvider } from './providers/plausible.js';

const options: IntervalReportOptions = {
  interval: {
    startTime: '2026-10-01T00:00:00Z',
    endTime: '2027-01-01T00:00:00Z',
    timeZone: 'UTC',
  },
  metrics: [{ name: 'screenPageViews' }],
};
const matomo = () =>
  new MatomoProvider({
    type: 'matomo',
    baseUrl: 'https://matomo.example',
    tokenAuth: 'test',
  });
beforeEach(() =>
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2027-01-02T00:00:00Z')),
);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockMatomo(timeZone: string | undefined, response: unknown) {
  const provider = matomo();
  vi.spyOn(provider, 'getProperty').mockResolvedValue({
    id: '1',
    name: 'site',
    displayName: 'Site',
    createTime: '',
    timeZone,
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return { provider, fetchMock };
}

describe('exact interval aggregates', () => {
  it.each([
    0,
    123,
    '456',
  ])('returns measured value %s and exact inclusive provider dates', async (value) => {
    const { provider, fetchMock } = mockMatomo('UTC', { nb_pageviews: value });
    expect(
      (await provider.getCapabilities()).timestampIntervalReporting,
    ).toEqual({ precision: 'utc-calendar-days', metrics: ['screenPageViews'] });
    expect(await provider.runIntervalReport('1', options)).toEqual({
      status: 'available',
      interval: options.interval,
      metrics: [{ name: 'screenPageViews', value: String(value) }],
    });
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get('method')).toBe('Actions.get');
    expect(body.get('period')).toBe('range');
    expect(body.get('date')).toBe('2026-10-01,2026-12-31');
  });
  it('maps a single half-open UTC day to one inclusive provider date', async () => {
    const { provider, fetchMock } = mockMatomo('UTC', { nb_pageviews: 7 });
    await provider.runIntervalReport('1', {
      ...options,
      interval: { ...options.interval, endTime: '2026-10-02T00:00:00Z' },
    });
    expect(
      new URLSearchParams(fetchMock.mock.calls[0][1].body).get('date'),
    ).toBe('2026-10-01,2026-10-01');
  });
  it.each([
    {},
    [],
    null,
    { nb_pageviews: null },
    { nb_pageviews: '' },
    { nb_pageviews: 'NaN' },
    { nb_pageviews: -1 },
    { nb_pageviews: 1.1 },
  ])('does not invent zero from %j', async (response) => {
    const { provider } = mockMatomo('UTC', response);
    expect((await provider.runIntervalReport('1', options)).status).toBe(
      'unavailable',
    );
  });
  it.each([
    'America/Edmonton',
    'Europe/Berlin',
  ])('refuses non-UTC property %s', async (zone) => {
    const { provider, fetchMock } = mockMatomo(zone, { nb_pageviews: 0 });
    expect((await provider.runIntervalReport('1', options)).status).toBe(
      'unsupported',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    'invalid/zone',
  ])('reports unknown property zone %s unavailable', async (zone) => {
    const { provider, fetchMock } = mockMatomo(zone, {});
    expect((await provider.runIntervalReport('1', options)).status).toBe(
      'unavailable',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    ['2026-03-08T00:00:00-07:00', '2026-03-09T00:00:00-06:00'],
    ['2026-11-01T00:00:00-06:00', '2026-11-02T00:00:00-07:00'],
    ['2026-10-01T00:00:00.001Z', '2026-10-02T00:00:00Z'],
  ])('refuses DST/partial-day boundaries %s', async (startTime, endTime) => {
    const provider = matomo();
    const getProperty = vi.spyOn(provider, 'getProperty');
    const interval = { startTime, endTime, timeZone: 'America/Edmonton' };
    expect(
      await provider.runIntervalReport('1', { ...options, interval }),
    ).toEqual({
      status: 'unsupported',
      interval,
      reason: 'timestamp-precision',
    });
    expect(getProperty).not.toHaveBeenCalled();
  });
  it('accepts explicit offsets representing UTC midnights', async () => {
    const { provider } = mockMatomo('Etc/UTC', { nb_pageviews: 1 });
    expect(
      (
        await provider.runIntervalReport('1', {
          ...options,
          interval: {
            startTime: '2026-10-01T02:00:00+02:00',
            endTime: '2026-10-02T02:00:00+02:00',
            timeZone: 'Europe/Berlin',
          },
        })
      ).status,
    ).toBe('available');
  });
  it('does not substitute sessions for unsupported metrics', async () => {
    const provider = matomo();
    expect(
      (
        await provider.runIntervalReport('1', {
          ...options,
          metrics: [{ name: 'unknownMetric' }],
        })
      ).status,
    ).toBe('unsupported');
  });
  it.each([
    '2026-09-30T12:00:00Z',
    '2026-10-23T12:00:00Z',
    '2026-12-31T23:59:59Z',
  ])('refuses unfinished measurement at %s', async (now) => {
    vi.mocked(Date.now).mockReturnValue(Date.parse(now));
    const { provider, fetchMock } = mockMatomo('UTC', { nb_pageviews: 0 });
    expect(await provider.runIntervalReport('1', options)).toEqual({
      status: 'unavailable',
      interval: options.interval,
      reason: 'interval-incomplete',
    });
    expect(provider.getProperty).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('accepts an interval exactly at its completed exclusive end', async () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse(options.interval.endTime));
    const { provider } = mockMatomo('UTC', { nb_pageviews: 0 });
    expect((await provider.runIntervalReport('1', options)).status).toBe(
      'available',
    );
  });
  it('propagates upstream failure', async () => {
    const { provider, fetchMock } = mockMatomo('UTC', {});
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(provider.runIntervalReport('1', options)).rejects.toThrow();
  });
  it.each([
    new GA4Provider({ type: 'ga4' }),
    new PlausibleProvider({ type: 'plausible', apiKey: 'test' }),
  ])('other adapters refuse without a provider request', async (provider) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await provider.getCapabilities()).timestampIntervalReporting).toBe(
      false,
    );
    expect((await provider.runIntervalReport('site', options)).status).toBe(
      'unsupported',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('represents unavailable separately from available zero in public types', () => {
    const report: IntervalReportResult = {
      status: 'available',
      interval: options.interval,
      metrics: [{ name: 'screenPageViews', value: '0' }],
    };
    expect(report.metrics[0].value).toBe('0');
  });
});

describe('interval input validation', () => {
  it.each([
    '2026-02-30T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-10-01',
    '2026-10-01T00:00:00',
    '2026-10-01T00:00:60Z',
    '2026-10-01T24:00:00Z',
    '2026-10-01T00:00:00.0001Z',
    '2026-10-01T00:00:00-00:00',
    'nonsense',
  ])('rejects malformed start %s before network', async (startTime) => {
    await expect(
      matomo().runIntervalReport('1', {
        ...options,
        interval: { ...options.interval, startTime },
      }),
    ).rejects.toBeInstanceOf(RangeError);
  });
  it.each([
    '2026-10-01T00:00:00Z',
    '2026-09-30T00:00:00Z',
  ])('rejects empty/reversed interval', (endTime) => {
    expect(() =>
      validateIntervalReport({
        ...options,
        interval: { ...options.interval, endTime },
      }),
    ).toThrow(RangeError);
  });
  it.each([
    '',
    'invalid/zone',
    '+01:00',
  ])('rejects missing/unknown zone', (timeZone) => {
    expect(() =>
      validateIntervalReport({
        ...options,
        interval: { ...options.interval, timeZone },
      }),
    ).toThrow(RangeError);
  });
  it.each([
    [],
    [{ name: '' }],
    [{ name: 'x' }, { name: 'x' }],
  ])('rejects missing/invalid metrics', (metrics) => {
    expect(() => validateIntervalReport({ ...options, metrics })).toThrow(
      RangeError,
    );
  });
});
