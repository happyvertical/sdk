import { afterEach, describe, expect, it, vi } from 'vitest';

import { PropertyNotFoundError } from '../types';
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
