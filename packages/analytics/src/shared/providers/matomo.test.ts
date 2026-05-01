import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotSupportedError, PropertyNotFoundError } from '../types';
import { MatomoProvider } from './matomo';

function buildProvider() {
  return new MatomoProvider({
    type: 'matomo',
    baseUrl: 'https://m.example.com',
    tokenAuth: 'tok',
  });
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

interface RecordedCall {
  body: URLSearchParams;
}

function setFetchMock(
  fn: (call: RecordedCall) => Response | Promise<Response>,
): RecordedCall[] {
  const calls: RecordedCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const bodyText =
        typeof init?.body === 'string'
          ? init.body
          : init?.body instanceof URLSearchParams
            ? init.body.toString()
            : '';
      const call = { body: new URLSearchParams(bodyText) };
      calls.push(call);
      return fn(call);
    }),
  );
  return calls;
}

describe('MatomoProvider.generateTrackingSnippet', () => {
  it('emits a Matomo _paq snippet with trackPageView and enableLinkTracking', () => {
    const snippet = buildProvider().generateTrackingSnippet('7');

    expect(snippet.html).toContain('var _paq');
    expect(snippet.html).toContain("_paq.push(['trackPageView']);");
    expect(snippet.html).toContain("_paq.push(['enableLinkTracking']);");
    expect(snippet.html).toContain('_paq.push([\'setSiteId\', "7"]);');
    expect(snippet.html).toContain(
      "_paq.push(['setTrackerUrl', u+'matomo.php']);",
    );
    expect(snippet.scripts).toEqual(['https://m.example.com/matomo.js']);
  });

  it('omits trackPageView when sendPageView is false', () => {
    const snippet = buildProvider().generateTrackingSnippet('7', {
      sendPageView: false,
    });
    expect(snippet.html).not.toContain('trackPageView');
  });

  it('does NOT emit setDoNotTrack when anonymizeIp is true (server-side concern in Matomo)', () => {
    const snippet = buildProvider().generateTrackingSnippet('7', {
      anonymizeIp: true,
    });
    // setDoNotTrack respects the browser's DNT signal, NOT IP anonymization.
    // Matomo IP anonymization is handled server-side by PrivacyManager.
    expect(snippet.html).not.toContain('setDoNotTrack');
    // The caller's flag is still preserved on the returned config so that
    // higher layers know the operator opted in.
    expect(snippet.config.anonymizeIp).toBe(true);
  });

  it('queues custom _paq directives in customConfig', () => {
    const snippet = buildProvider().generateTrackingSnippet('7', {
      customConfig: { setSecureCookie: true },
    });
    expect(snippet.html).toContain('_paq.push(["setSecureCookie", true]);');
  });
});

describe('MatomoProvider.generateConfig', () => {
  it('returns a flat config object suitable for embed/programmatic use', () => {
    const config = buildProvider().generateConfig('7', { anonymizeIp: true });
    expect(config).toMatchObject({
      trackerUrl: 'https://m.example.com/matomo.php',
      scriptUrl: 'https://m.example.com/matomo.js',
      siteId: '7',
      anonymizeIp: true,
      sendPageView: true,
    });
  });
});

describe('MatomoProvider.getProperty', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws PropertyNotFoundError when the site does not exist', async () => {
    // Matomo signals a missing site with `result=error, "...website was found
    // in the request..."`. The provider must surface that as
    // PropertyNotFoundError so callers can `instanceof`-check it the same way
    // they do for GA4 and Plausible.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          result: 'error',
          message:
            "An unexpected website was found in the request: website id was set to '999' .",
        }),
      ),
    );
    await expect(buildProvider().getProperty('999')).rejects.toBeInstanceOf(
      PropertyNotFoundError,
    );
  });
});

describe('MatomoProvider.runReport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps date-dimension reports through VisitsSummary.get', async () => {
    const calls = setFetchMock(() =>
      jsonResponse({
        '2026-04-28': {
          nb_uniq_visitors: 12,
          nb_visits: 14,
          bounce_rate: '50%',
          avg_time_on_site: '00:01:30',
        },
      }),
    );

    const result = await buildProvider().runReport('7', {
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
    });

    expect(calls[0].body.get('method')).toBe('VisitsSummary.get');
    expect(calls[0].body.get('idSite')).toBe('7');
    expect(calls[0].body.get('date')).toBe('last30');
    expect(result.rows).toEqual([
      {
        dimensionValues: [{ value: '2026-04-28' }],
        metricValues: [
          { value: '12' },
          { value: '14' },
          { value: '50' },
          { value: '90' },
        ],
      },
    ]);
  });

  it('maps page reports through Actions.getPageUrls', async () => {
    const calls = setFetchMock(() =>
      jsonResponse([
        {
          label: '/news',
          url: 'https://example.com/news',
          nb_hits: 9,
          nb_uniq_visitors: 4,
        },
      ]),
    );

    const result = await buildProvider().runReport('7', {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
      limit: 5,
    });

    expect(calls[0].body.get('method')).toBe('Actions.getPageUrls');
    expect(calls[0].body.get('flat')).toBe('1');
    expect(calls[0].body.get('filter_limit')).toBe('5');
    expect(result.rows[0]).toEqual({
      dimensionValues: [{ value: 'https://example.com/news' }],
      metricValues: [{ value: '9' }, { value: '4' }],
    });
  });

  it('maps referrer reports through Referrers.getAll', async () => {
    const calls = setFetchMock(() =>
      jsonResponse([
        {
          label: 'Google',
          referer_type: 'search',
          nb_visits: 12,
          nb_uniq_visitors: 7,
        },
      ]),
    );

    const result = await buildProvider().runReport('7', {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      limit: 10,
    });

    expect(calls[0].body.get('method')).toBe('Referrers.getAll');
    expect(calls[0].body.get('idSite')).toBe('7');
    expect(calls[0].body.get('date')).toBe('last7');
    expect(calls[0].body.get('filter_limit')).toBe('10');
    expect(result.rows[0]).toEqual({
      dimensionValues: [{ value: 'Google' }, { value: 'search' }],
      metricValues: [{ value: '12' }, { value: '7' }],
    });
  });

  it('rejects unsupported dimension sets instead of calling API.get', async () => {
    const calls = setFetchMock(() => jsonResponse({}));

    await expect(
      buildProvider().runReport('7', {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'activeUsers' }],
      }),
    ).rejects.toBeInstanceOf(NotSupportedError);

    expect(calls).toHaveLength(0);
  });
});

describe('MatomoProvider.runRealtimeReport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps aggregate realtime counters through Live.getCounters', async () => {
    const calls = setFetchMock(() =>
      jsonResponse([{ visitors: 3, visits: 5, actions: 8 }]),
    );

    const result = await buildProvider().runRealtimeReport('7', {
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
    });

    expect(calls[0].body.get('method')).toBe('Live.getCounters');
    expect(calls[0].body.get('lastMinutes')).toBe('30');
    expect(result.rows).toEqual([
      {
        dimensionValues: [],
        metricValues: [{ value: '3' }, { value: '5' }],
      },
    ]);
  });

  it('maps realtime page dimensions through Live.getLastVisitsDetails', async () => {
    const calls = setFetchMock(() =>
      jsonResponse([
        {
          visitorId: 'a',
          actionDetails: [
            { pageTitle: 'News', url: '/news' },
            { pageTitle: 'News', url: '/news' },
          ],
        },
        {
          visitorId: 'b',
          actionDetails: [{ pageTitle: 'News', url: '/news' }],
        },
      ]),
    );

    const result = await buildProvider().runRealtimeReport('7', {
      dimensions: [{ name: 'unifiedScreenName' }],
      metrics: [{ name: 'activeUsers' }],
      limit: 10,
    });

    expect(calls[0].body.get('method')).toBe('Live.getLastVisitsDetails');
    expect(result.rows).toEqual([
      {
        dimensionValues: [{ value: 'News' }],
        metricValues: [{ value: '2' }],
      },
    ]);
  });
});
