import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { LocalChatGPTSessionManager } from './local';

const record = {
  hostId: 'urn:uuid:host',
  sessions: [
    {
      subject: 'sub',
      email: 'a@example.test',
      clientId: 'oaiapp_test',
      hostId: 'urn:uuid:host',
      idToken: 'id-secret',
      accessToken: 'access-secret',
      refreshToken: 'refresh-secret',
      scopes: ['openid', 'chatgpt.tokens.use.direct'],
      expiresAt: 0,
    },
  ],
};
describe('LocalChatGPTSessionManager', () => {
  it('serializes refreshes, rotates credentials, and redacts sessions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
    const path = join(dir, 'session.json');
    await writeFile(path, JSON.stringify(record), { mode: 0o600 });
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'next-access',
          refresh_token: 'next-refresh',
          expires_in: 3600,
        }),
        { status: 200 },
      ),
    );
    const manager = new LocalChatGPTSessionManager({
      appName: 'test',
      path,
      fetch: fetcher,
      now: () => 1,
    });
    const [one, two] = await Promise.all([
      manager.accessToken('oaiapp_test'),
      manager.accessToken('oaiapp_test'),
    ]);
    expect([one, two]).toEqual(['next-access', 'next-access']);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await manager.sessions()).toEqual([
      {
        subject: 'sub',
        email: 'a@example.test',
        clientId: 'oaiapp_test',
        hostId: 'urn:uuid:host',
        scopes: ['openid', 'chatgpt.tokens.use.direct'],
        expiresAt: 3600001,
      },
    ]);
  });
  it('serializes rotating refreshes across manager instances', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
    const path = join(dir, 'session.json');
    await writeFile(path, JSON.stringify(record), { mode: 0o600 });
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const refreshTokens: string[] = [];
    const fetcher = vi.fn(async (_input: any, init?: RequestInit) => {
      const body = init?.body as URLSearchParams;
      refreshTokens.push(body.get('refresh_token')!);
      const sequence = refreshTokens.length;
      if (sequence === 1) {
        firstStarted();
        await release;
      }
      return new Response(
        JSON.stringify({
          access_token: `access-${sequence}`,
          refresh_token: `refresh-${sequence}`,
          expires_in: 3600,
        }),
      );
    });
    const one = new LocalChatGPTSessionManager({
      appName: 'test',
      path,
      fetch: fetcher,
    });
    const two = new LocalChatGPTSessionManager({
      appName: 'test',
      path,
      fetch: fetcher,
    });
    const first = one.refresh('oaiapp_test');
    await started;
    const second = two.refresh('oaiapp_test');
    releaseFirst();
    await expect(first).resolves.toMatchObject({ refreshToken: 'refresh-1' });
    await expect(second).resolves.toMatchObject({ refreshToken: 'refresh-2' });
    expect(refreshTokens).toEqual(['refresh-secret', 'refresh-1']);
  });
  it('preserves concurrent refreshes for different registrations', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
    const path = join(dir, 'session.json');
    const second = {
      ...record.sessions[0],
      clientId: 'oaiapp_second',
      accessToken: 'second-access',
      refreshToken: 'second-refresh',
    };
    await writeFile(
      path,
      JSON.stringify({ ...record, sessions: [...record.sessions, second] }),
      { mode: 0o600 },
    );
    const fetcher = vi.fn(async (_input: any, init?: RequestInit) => {
      const body = init?.body as URLSearchParams;
      const clientId = body.get('client_id')!;
      return new Response(
        JSON.stringify({
          access_token: `${clientId}-next-access`,
          refresh_token: `${clientId}-next-refresh`,
          expires_in: 3600,
        }),
      );
    });
    const one = new LocalChatGPTSessionManager({
      appName: 'test',
      path,
      fetch: fetcher,
    });
    const two = new LocalChatGPTSessionManager({
      appName: 'test',
      path,
      fetch: fetcher,
    });
    await Promise.all([
      one.refresh('oaiapp_test'),
      two.refresh('oaiapp_second'),
    ]);
    await expect(one.sessions()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          clientId: 'oaiapp_test',
          expiresAt: expect.any(Number),
        }),
        expect.objectContaining({
          clientId: 'oaiapp_second',
          expiresAt: expect.any(Number),
        }),
      ]),
    );
  });
  it('does not restore credentials when refresh overlaps logout', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
    const path = join(dir, 'session.json');
    await writeFile(path, JSON.stringify(record), { mode: 0o600 });
    let releaseRefresh!: () => void;
    let refreshStarted!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    const started = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });
    const fetcher = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes('/oauth/token')) {
        refreshStarted();
        await release;
        return new Response(
          JSON.stringify({
            access_token: 'rotated-access',
            refresh_token: 'rotated-refresh',
            expires_in: 3600,
          }),
        );
      }
      if (url.includes('openid-configuration'))
        return new Response(
          JSON.stringify({ revocation_endpoint: 'https://issuer.test/revoke' }),
        );
      return new Response('', { status: 200 });
    });
    const refresher = new LocalChatGPTSessionManager({
      appName: 'test',
      path,
      fetch: fetcher,
    });
    const loggerOut = new LocalChatGPTSessionManager({
      appName: 'test',
      path,
      fetch: fetcher,
    });
    const refresh = refresher.refresh('oaiapp_test');
    await started;
    const logout = loggerOut.logout('oaiapp_test');
    releaseRefresh();
    await expect(refresh).resolves.toMatchObject({
      refreshToken: 'rotated-refresh',
    });
    await expect(logout).resolves.toEqual({
      remoteRevocationConfirmed: true,
    });
    expect(await refresher.sessions()).toEqual([]);
  });
  it('clears an unusable refresh token', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
    const path = join(dir, 'session.json');
    await writeFile(path, JSON.stringify(record), { mode: 0o600 });
    const manager = new LocalChatGPTSessionManager({
      appName: 'test',
      path,
      fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 400 })),
    });
    await expect(manager.accessToken('oaiapp_test')).rejects.toMatchObject({
      code: 'refresh_invalid',
    });
    expect(await manager.sessions()).toEqual([]);
  });
  it('keeps registrations isolated and rejects an unknown selected account', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
    const path = join(dir, 'session.json');
    await writeFile(path, JSON.stringify(record), { mode: 0o600 });
    const manager = new LocalChatGPTSessionManager({
      appName: 'test',
      path,
      fetch: vi.fn(),
    });
    await expect(manager.accessToken('other-client')).rejects.toMatchObject({
      code: 'unknown_account',
    });
    await expect(manager.begin('other-client')).rejects.toMatchObject({
      code: 'unknown_account',
    });
    expect(await manager.sessions()).toHaveLength(1);
  });
  it('clears local credentials whether remote revocation succeeds or fails', async () => {
    for (const status of [200, 503]) {
      const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
      const path = join(dir, 'session.json');
      await writeFile(path, JSON.stringify(record), { mode: 0o600 });
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              revocation_endpoint: 'https://issuer.test/revoke',
            }),
          ),
        )
        .mockResolvedValueOnce(new Response('', { status }));
      const manager = new LocalChatGPTSessionManager({
        appName: 'test',
        path,
        fetch: fetcher,
      });
      await expect(manager.logout('oaiapp_test')).resolves.toEqual({
        remoteRevocationConfirmed: status === 200,
      });
      expect(await manager.sessions()).toEqual([]);
    }
  });
  it('clears local credentials when revocation errors, is unavailable, or stalls', async () => {
    const fetchers = [
      vi.fn().mockRejectedValue(new Error('offline')),
      vi.fn().mockResolvedValue(new Response('{}')),
      vi.fn(() => new Promise<Response>(() => undefined)),
    ];
    for (const fetcher of fetchers) {
      const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
      const path = join(dir, 'session.json');
      await writeFile(path, JSON.stringify(record), { mode: 0o600 });
      const manager = new LocalChatGPTSessionManager({
        appName: 'test',
        path,
        fetch: fetcher,
      });
      (manager as any).remoteRevocationTimeoutMs = 5;
      await expect(manager.logout('oaiapp_test')).resolves.toEqual({
        remoteRevocationConfirmed: false,
      });
      expect(await manager.sessions()).toEqual([]);
    }
  });
  it('completes only a state-bound loopback callback with a verified identity', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
    const path = join(dir, 'session.json');
    let authorization = '';
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    (jwk as any).kid = 'test';
    let releaseExchange!: () => void;
    let exchangeStarted!: () => void;
    const exchangeRelease = new Promise<void>((resolve) => {
      releaseExchange = resolve;
    });
    const exchangeStart = new Promise<void>((resolve) => {
      exchangeStarted = resolve;
    });
    const fetcher = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes('openid-configuration'))
        return new Response(
          JSON.stringify({ jwks_uri: 'https://issuer.test/jwks' }),
        );
      if (url.includes('/jwks'))
        return new Response(JSON.stringify({ keys: [jwk] }));
      if (url.includes('/oauth/token')) {
        exchangeStarted();
        await exchangeRelease;
        const nonce = new URL(authorization).searchParams.get('nonce')!;
        const clientId =
          new URL(authorization).searchParams.get('client_id') ===
          'dynamic_agent_client'
            ? 'oaiapp_test'
            : new URL(authorization).searchParams.get('client_id')!;
        const id = await new SignJWT({
          nonce,
          sub: 'subject',
          email: 'a@example.test',
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'test' })
          .setIssuer('https://auth.openai.com')
          .setAudience(clientId)
          .setIssuedAt()
          .setExpirationTime('1h')
          .sign(privateKey);
        return new Response(
          JSON.stringify({
            id_token: id,
            access_token: 'access',
            refresh_token: 'refresh',
            scope:
              'openid offline_access resource.invoke chatgpt.tokens.use.direct',
            expires_in: 3600,
          }),
        );
      }
      throw new Error(url);
    });
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: any, init?: any) =>
      String(input).includes('issuer.test')
        ? fetcher(input, init)
        : originalFetch(input, init),
    );
    try {
      const manager = new LocalChatGPTSessionManager({
        appName: 'test',
        path,
        fetch: fetcher as any,
        openBrowser: (url) => {
          authorization = url;
        },
      });
      const attempt = await manager.begin();
      const rejected = attempt.callback.catch((error) => error);
      const callback = new URL(authorization);
      const redirect = new URL(callback.searchParams.get('redirect_uri')!);
      redirect.searchParams.set('state', callback.searchParams.get('state')!);
      redirect.searchParams.set('code', 'one-time-code');
      redirect.searchParams.set('client_id', 'oaiapp_test');
      const firstRequest = originalFetch(redirect);
      await exchangeStart;
      const duplicate = await originalFetch(redirect);
      expect(duplicate.status).toBe(400);
      let callbackSettled = false;
      void attempt.callback.then(
        () => {
          callbackSettled = true;
        },
        () => {
          callbackSettled = true;
        },
      );
      await Promise.resolve();
      expect(callbackSettled).toBe(false);
      releaseExchange();
      const result = await firstRequest;
      expect(result.status).toBe(200);
      const session = await attempt.callback;
      expect(session).toMatchObject({
        subject: 'subject',
        clientId: 'oaiapp_test',
      });
      const hostId = callback.searchParams.get('ext_agent_host_id');
      expect(session.hostId).toBe(hostId);
      expect((await manager.sessions())[0]?.hostId).toBe(hostId);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      await expect(originalFetch(redirect)).rejects.toThrow();
      expect(
        fetcher.mock.calls.filter(([input]) =>
          String(input).includes('/oauth/token'),
        ),
      ).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('rejects callback replay, state substitution, missing code, and declined consent before token exchange', async () => {
    for (const mutation of [
      (url: URL) => url.searchParams.set('state', 'attacker-state'),
      (url: URL) => url.searchParams.delete('code'),
      (url: URL) => url.searchParams.set('error', 'access_denied'),
    ]) {
      const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
      const path = join(dir, 'session.json');
      let authorization = '';
      const exchange = vi.fn();
      const manager = new LocalChatGPTSessionManager({
        appName: 'test',
        path,
        fetch: exchange,
        openBrowser: (url) => {
          authorization = url;
        },
      });
      const attempt = await manager.begin();
      const rejected = attempt.callback.catch((error) => error);
      const auth = new URL(authorization);
      const callback = new URL(auth.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state', auth.searchParams.get('state')!);
      callback.searchParams.set('code', 'single-use');
      callback.searchParams.set('client_id', 'oaiapp_test');
      mutation(callback);
      const response = await fetch(callback);
      expect(response.status).toBe(400);
      await expect(rejected).resolves.toBeInstanceOf(Error);
      expect(exchange).not.toHaveBeenCalled();
      expect(await manager.sessions()).toEqual([]);
    }
  });
  it('rejects bad issuer, audience, nonce, and expiry on signed ID tokens', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    (jwk as { kid?: string }).kid = 'claims';
    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      async () => new Response(JSON.stringify({ keys: [jwk] })),
    );
    const manager = new LocalChatGPTSessionManager({
      appName: 'test',
      fetch: async () =>
        new Response(JSON.stringify({ jwks_uri: 'https://issuer.test/jwks' })),
    });
    try {
      for (const [issuer, audience, nonce, expiration] of [
        ['https://wrong.test', 'oaiapp_test', 'nonce', '1h'],
        ['https://auth.openai.com', 'wrong-client', 'nonce', '1h'],
        ['https://auth.openai.com', 'oaiapp_test', 'wrong-nonce', '1h'],
        ['https://auth.openai.com', 'oaiapp_test', 'nonce', '-1s'],
      ]) {
        const token = await new SignJWT({ sub: 'subject', nonce })
          .setProtectedHeader({ alg: 'RS256', kid: 'claims' })
          .setIssuer(issuer)
          .setAudience(audience)
          .setIssuedAt()
          .setExpirationTime(expiration)
          .sign(privateKey);
        await expect(
          (manager as any).verify(token, 'oaiapp_test', 'nonce'),
        ).rejects.toBeInstanceOf(Error);
      }
      const missingExpiration = await new SignJWT({
        sub: 'subject',
        nonce: 'nonce',
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'claims' })
        .setIssuer('https://auth.openai.com')
        .setAudience('oaiapp_test')
        .setIssuedAt()
        .sign(privateKey);
      await expect(
        (manager as any).verify(missingExpiration, 'oaiapp_test', 'nonce'),
      ).rejects.toBeInstanceOf(Error);
      const missingIssuedAt = await new SignJWT({
        sub: 'subject',
        nonce: 'nonce',
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'claims' })
        .setIssuer('https://auth.openai.com')
        .setAudience('oaiapp_test')
        .setExpirationTime('1h')
        .sign(privateKey);
      await expect(
        (manager as any).verify(missingIssuedAt, 'oaiapp_test', 'nonce'),
      ).rejects.toBeInstanceOf(Error);
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });
  it('never persists identity-only consent as a plan-usage session', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
    const path = join(dir, 'session.json');
    let auth = '';
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    (jwk as any).kid = 'scope';
    const originalFetch = globalThis.fetch;
    const fetcher = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes('openid-configuration'))
        return new Response(
          JSON.stringify({ jwks_uri: 'https://issuer.test/jwks' }),
        );
      if (url.includes('/jwks'))
        return new Response(JSON.stringify({ keys: [jwk] }));
      const params = new URL(auth).searchParams;
      const id = await new SignJWT({
        sub: 'subject',
        nonce: params.get('nonce'),
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'scope' })
        .setIssuer('https://auth.openai.com')
        .setAudience('oaiapp_test')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey);
      return new Response(
        JSON.stringify({
          id_token: id,
          access_token: 'access',
          refresh_token: 'refresh',
          scope: 'openid profile email offline_access',
          expires_in: 3600,
        }),
      );
    });
    vi.stubGlobal('fetch', async (input: any, init?: any) =>
      String(input).includes('issuer.test')
        ? fetcher(input, init)
        : originalFetch(input, init),
    );
    try {
      const manager = new LocalChatGPTSessionManager({
        appName: 'test',
        path,
        fetch: fetcher as any,
        openBrowser: (url) => {
          auth = url;
        },
      });
      const attempt = await manager.begin();
      const rejected = attempt.callback.catch((e) => e);
      const request = new URL(auth);
      const callback = new URL(request.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state', request.searchParams.get('state')!);
      callback.searchParams.set('code', 'code');
      callback.searchParams.set('client_id', 'oaiapp_test');
      await originalFetch(callback);
      await expect(rejected).resolves.toMatchObject({
        code: 'plan_permission_missing',
      });
      expect(await manager.sessions()).toEqual([]);
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });
  it('clears a refreshed session when plan permission is withdrawn', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
    const path = join(dir, 'session.json');
    await writeFile(path, JSON.stringify(record), { mode: 0o600 });
    const manager = new LocalChatGPTSessionManager({
      appName: 'test',
      path,
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'next-access',
            refresh_token: 'next-refresh',
            scope: 'openid profile email offline_access',
            expires_in: 3600,
          }),
        ),
      ),
    });
    await expect(manager.refresh('oaiapp_test')).rejects.toMatchObject({
      code: 'plan_permission_missing',
    });
    expect(await manager.sessions()).toEqual([]);
  });
});
