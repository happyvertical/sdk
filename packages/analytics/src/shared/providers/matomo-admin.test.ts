import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalyticsError, AuthenticationError } from '../types';
import {
  MatomoAdmin,
  MatomoAdminTransport,
  normalizeMatomoBaseUrl,
} from './matomo-admin';

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: URLSearchParams;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function setFetchMock(
  fn: (call: RecordedCall) => Response | Promise<Response>,
): {
  mock: ReturnType<typeof vi.fn>;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = new Headers(init.headers);
      h.forEach((value, key) => {
        headers[key] = value;
      });
    }
    const bodyText =
      typeof init?.body === 'string'
        ? init.body
        : init?.body instanceof URLSearchParams
          ? init.body.toString()
          : '';
    const recorded: RecordedCall = {
      url,
      method: init?.method ?? 'GET',
      headers,
      body: new URLSearchParams(bodyText),
    };
    calls.push(recorded);
    return fn(recorded);
  });

  vi.stubGlobal('fetch', mock);
  return { mock, calls };
}

describe('normalizeMatomoBaseUrl', () => {
  it('strips trailing slashes and a trailing /index.php', () => {
    expect(normalizeMatomoBaseUrl('https://m.example.com/')).toBe(
      'https://m.example.com',
    );
    expect(normalizeMatomoBaseUrl('https://m.example.com/index.php')).toBe(
      'https://m.example.com',
    );
    expect(normalizeMatomoBaseUrl('https://m.example.com/index.php/')).toBe(
      'https://m.example.com',
    );
  });

  it('throws when the value is empty', () => {
    expect(() => normalizeMatomoBaseUrl('   ')).toThrow(AnalyticsError);
  });
});

describe('MatomoAdminTransport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('requires a tokenAuth value', () => {
    expect(
      () =>
        new MatomoAdminTransport({
          baseUrl: 'https://m.example.com',
          tokenAuth: '',
        }),
    ).toThrow(AnalyticsError);
  });

  it('posts module=API form-encoded with token_auth and format=json', async () => {
    const { calls } = setFetchMock(() => jsonResponse({ value: '5.9.0' }));

    const transport = new MatomoAdminTransport({
      baseUrl: 'https://m.example.com/',
      tokenAuth: 'tok-1',
    });

    await transport.call('API.getMatomoVersion', {});

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call.method).toBe('POST');
    expect(call.url).toBe('https://m.example.com/index.php');
    expect(call.headers['content-type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(call.body.get('module')).toBe('API');
    expect(call.body.get('method')).toBe('API.getMatomoVersion');
    expect(call.body.get('format')).toBe('json');
    expect(call.body.get('token_auth')).toBe('tok-1');
  });

  it('encodes array params as key[]=v', async () => {
    const { calls } = setFetchMock(() => jsonResponse({ value: 'ok' }));
    const transport = new MatomoAdminTransport({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });

    await transport.call('UsersManager.setUserAccess', {
      userLogin: 'tenant-bma',
      access: 'view',
      idSites: ['1', '2'],
    });

    const body = calls[0].body;
    expect(body.getAll('idSites[]')).toEqual(['1', '2']);
    expect(body.get('userLogin')).toBe('tenant-bma');
    expect(body.get('access')).toBe('view');
  });

  it('maps Matomo error payload (HTTP 200, result=error) to AnalyticsError', async () => {
    setFetchMock(() =>
      jsonResponse({ result: 'error', message: 'Some bad input' }),
    );
    const transport = new MatomoAdminTransport({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });

    await expect(transport.call('SitesManager.addSite', {})).rejects.toThrow(
      'Some bad input',
    );
  });

  it('maps "requires view access" to AuthenticationError', async () => {
    setFetchMock(() =>
      jsonResponse({
        result: 'error',
        message:
          "You can't access this resource as it requires view access for at least one website.",
      }),
    );
    const transport = new MatomoAdminTransport({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });

    await expect(
      transport.call('API.getMatomoVersion', {}),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('maps HTTP 401 to AuthenticationError', async () => {
    setFetchMock(
      () =>
        new Response('not authorized', {
          status: 401,
          headers: { 'content-type': 'text/plain' },
        }),
    );
    const transport = new MatomoAdminTransport({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });

    await expect(
      transport.call('API.getMatomoVersion', {}),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('maps HTTP 500 to AnalyticsError with code MATOMO_HTTP_500', async () => {
    setFetchMock(
      () =>
        new Response('boom', {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        }),
    );
    const transport = new MatomoAdminTransport({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });

    await expect(transport.call('API.getMatomoVersion', {})).rejects.toThrow(
      /HTTP 500|boom/,
    );
  });
});

describe('MatomoAdmin.createSite', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls SitesManager.addSite then SitesManager.getSiteFromId', async () => {
    const responses = [
      jsonResponse({ value: 7 }),
      jsonResponse({
        idsite: '7',
        name: 'Bentley Alberta',
        main_url: 'https://bentleyalberta.com',
        timezone: 'America/Edmonton',
        currency: 'CAD',
      }),
    ];
    const { calls } = setFetchMock(() => responses.shift()!);

    const admin = new MatomoAdmin({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });

    const site = await admin.createSite({
      name: 'Bentley Alberta',
      urls: ['https://bentleyalberta.com'],
      timezone: 'America/Edmonton',
      currency: 'CAD',
      tenantId: 'bentleyalberta',
    });

    expect(site.id).toBe('7');
    expect(site.name).toBe('Bentley Alberta');
    expect(site.url).toBe('https://bentleyalberta.com');
    expect(site.tenantId).toBe('bentleyalberta');
    expect(site.timezone).toBe('America/Edmonton');
    expect(site.currency).toBe('CAD');
    expect(site.provider).toBe('matomo');

    expect(calls[0].body.get('method')).toBe('SitesManager.addSite');
    expect(calls[0].body.get('siteName')).toBe('Bentley Alberta');
    expect(calls[0].body.getAll('urls[]')).toEqual([
      'https://bentleyalberta.com',
    ]);
    expect(calls[1].body.get('method')).toBe('SitesManager.getSiteFromId');
    expect(calls[1].body.get('idSite')).toBe('7');
  });

  it('throws when no urls are provided', async () => {
    setFetchMock(() => jsonResponse({}));
    const admin = new MatomoAdmin({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });
    await expect(admin.createSite({ name: 'x', urls: [] })).rejects.toThrow(
      /at least one URL/,
    );
  });
});

describe('MatomoAdmin.listSites / getSite', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('listSites maps an array of rows', async () => {
    setFetchMock(() =>
      jsonResponse([
        {
          idsite: '1',
          name: 'a',
          main_url: 'https://a.example.com',
          timezone: 'UTC',
          currency: 'USD',
        },
        {
          idsite: '2',
          name: 'b',
          main_url: 'https://b.example.com',
        },
      ]),
    );
    const admin = new MatomoAdmin({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });
    const sites = await admin.listSites();
    expect(sites.map((s) => s.id)).toEqual(['1', '2']);
    expect(sites[0].url).toBe('https://a.example.com');
    expect(sites[1].timezone).toBeUndefined();
  });

  it('getSite returns undefined for an empty-array response', async () => {
    setFetchMock(() => jsonResponse([]));
    const admin = new MatomoAdmin({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });
    expect(await admin.getSite('999')).toBeUndefined();
  });

  it('getSite returns undefined for the "unexpected website" application error', async () => {
    setFetchMock(() =>
      jsonResponse({
        result: 'error',
        message:
          "An unexpected website was found in the request: website id was set to '999' .",
      }),
    );
    const admin = new MatomoAdmin({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });
    expect(await admin.getSite('999')).toBeUndefined();
  });
});

describe('MatomoAdmin.user lifecycle', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('createUser requires a password', async () => {
    setFetchMock(() => jsonResponse({}));
    const admin = new MatomoAdmin({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });
    await expect(
      admin.createUser({ login: 'tenant-bma', email: 'x@y.com' }),
    ).rejects.toThrow(/password/);
  });

  it('createUser POSTs UsersManager.addUser then reads the user back', async () => {
    const responses = [
      jsonResponse({ result: 'success', message: 'ok' }),
      jsonResponse({
        login: 'tenant-bma',
        email: 'x@y.com',
        superuser_access: '0',
      }),
    ];
    const { calls } = setFetchMock(() => responses.shift()!);
    const admin = new MatomoAdmin({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });

    const user = await admin.createUser({
      login: 'tenant-bma',
      email: 'x@y.com',
      password: 'long-random-password',
      tenantId: 'bma',
    });

    expect(user.login).toBe('tenant-bma');
    expect(user.email).toBe('x@y.com');
    expect(user.isSuperUser).toBe(false);

    expect(calls[0].body.get('method')).toBe('UsersManager.addUser');
    expect(calls[0].body.get('userLogin')).toBe('tenant-bma');
    expect(calls[0].body.get('password')).toBe('long-random-password');
    expect(calls[1].body.get('method')).toBe('UsersManager.getUser');
  });

  it('setUserAccess validates role and posts idSites[]', async () => {
    const { calls } = setFetchMock(() =>
      jsonResponse({ result: 'success', message: 'ok' }),
    );
    const admin = new MatomoAdmin({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });
    await admin.setUserAccess({
      login: 'tenant-bma',
      access: 'view',
      siteIds: ['7'],
    });
    expect(calls[0].body.get('method')).toBe('UsersManager.setUserAccess');
    expect(calls[0].body.get('access')).toBe('view');
    expect(calls[0].body.getAll('idSites[]')).toEqual(['7']);

    await expect(
      admin.setUserAccess({
        login: 'tenant-bma',
        // @ts-expect-error invalid role test
        access: 'editor',
        siteIds: ['7'],
      }),
    ).rejects.toThrow(/Invalid Matomo access role/);
  });

  it('mintUserToken forwards the per-call passwordConfirmation', async () => {
    const { calls } = setFetchMock(() =>
      jsonResponse({ value: 'mint-token-abc' }),
    );
    const admin = new MatomoAdmin({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });
    const minted = await admin.mintUserToken({
      login: 'tenant-bma',
      passwordConfirmation: 'tenant-bma-password',
    });
    expect(minted.token).toBe('mint-token-abc');
    expect(minted.login).toBe('tenant-bma');
    // Matomo confirms the *target* user's password, not the caller's.
    expect(calls[0].body.get('passwordConfirmation')).toBe(
      'tenant-bma-password',
    );
    expect(calls[0].body.get('userLogin')).toBe('tenant-bma');
  });

  it('mintUserToken refuses without a passwordConfirmation', async () => {
    setFetchMock(() => jsonResponse({ value: 'never-minted' }));
    const admin = new MatomoAdmin({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });
    await expect(admin.mintUserToken({ login: 'tenant-bma' })).rejects.toThrow(
      /passwordConfirmation/,
    );
  });

  it('getUser returns undefined for "doesn\'t exist" error', async () => {
    setFetchMock(() =>
      jsonResponse({
        result: 'error',
        message: "User 'who-dis' doesn't exist.",
      }),
    );
    const admin = new MatomoAdmin({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });
    expect(await admin.getUser('who-dis')).toBeUndefined();
  });
});

describe('MatomoAdmin.health', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns ok=true with a version when API.getMatomoVersion responds', async () => {
    setFetchMock(() => jsonResponse({ value: '5.9.0' }));
    const admin = new MatomoAdmin({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });
    const result = await admin.health();
    expect(result.ok).toBe(true);
    expect(result.version).toBe('5.9.0');
  });

  it('returns ok=false on transport error', async () => {
    setFetchMock(
      () =>
        new Response('nope', {
          status: 500,
          headers: { 'content-type': 'text/plain' },
        }),
    );
    const admin = new MatomoAdmin({
      baseUrl: 'https://m.example.com',
      tokenAuth: 'tok',
    });
    const result = await admin.health();
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
