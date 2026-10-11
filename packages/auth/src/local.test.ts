import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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
    await expect(second).resolves.toMatchObject({ refreshToken: 'refresh-1' });
    expect(refreshTokens).toEqual(['refresh-secret']);
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
    await expect(logout).resolves.toEqual({
      remoteRevocationConfirmed: true,
    });
    releaseRefresh();
    await expect(refresh).rejects.toMatchObject({
      code: 'session_invalidated',
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
  it('releases the credential mutex when its process is killed', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
    const path = join(dir, 'session.json');
    const mutex = `${path}.mutex.sqlite`;
    await writeFile(path, JSON.stringify(record), { mode: 0o600 });
    const child = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "import { DatabaseSync } from 'node:sqlite'; const database = new DatabaseSync(process.argv[1], { timeout: 0 }); database.exec('BEGIN IMMEDIATE'); process.stdout.write('held'); setInterval(() => {}, 1000);",
        mutex,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    try {
      await once(child.stdout!, 'data');
      const probe = new DatabaseSync(mutex, { timeout: 0 });
      let busy: any;
      try {
        probe.exec('BEGIN IMMEDIATE');
      } catch (error) {
        busy = error;
      } finally {
        probe.close();
      }
      expect(busy).toMatchObject({ code: 'ERR_SQLITE_ERROR', errcode: 5 });
      child.kill('SIGKILL');
      await once(child, 'exit');
      const inode = (await stat(mutex)).ino;
      const manager = new LocalChatGPTSessionManager({
        appName: 'test',
        path,
        fetch: vi.fn().mockRejectedValue(new Error('offline')),
      });
      await expect(manager.logout('oaiapp_test')).resolves.toEqual({
        remoteRevocationConfirmed: false,
      });
      expect(await manager.sessions()).toEqual([]);
      expect((await stat(mutex)).ino).toBe(inode);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await once(child, 'exit');
      }
    }
  });
  it('serializes same-process credential transactions without blocking progress', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
    const path = join(dir, 'session.json');
    await writeFile(path, JSON.stringify(record), { mode: 0o600 });
    const one = new LocalChatGPTSessionManager({
      appName: 'test',
      path,
      fetch: vi.fn(),
    });
    const two = new LocalChatGPTSessionManager({
      appName: 'test',
      path,
      fetch: vi.fn(),
    });
    let releaseOne!: () => void;
    let enteredOne!: () => void;
    const firstRelease = new Promise<void>((resolve) => {
      releaseOne = resolve;
    });
    const firstEntered = new Promise<void>((resolve) => {
      enteredOne = resolve;
    });
    let active = 0;
    let maxActive = 0;
    const first = (one as any).locked(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      enteredOne();
      await firstRelease;
      active--;
    });
    await firstEntered;
    const mutex = `${path}.mutex.sqlite`;
    const inode = (await stat(mutex)).ino;
    const probe = new DatabaseSync(mutex, { timeout: 0 });
    expect(() => probe.exec('BEGIN IMMEDIATE')).toThrow('database is locked');
    probe.close();

    let releaseTwo!: () => void;
    let enteredTwo!: () => void;
    const secondRelease = new Promise<void>((resolve) => {
      releaseTwo = resolve;
    });
    const secondEntered = new Promise<void>((resolve) => {
      enteredTwo = resolve;
    });
    const second = (two as any).locked(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      enteredTwo();
      await secondRelease;
      active--;
    });
    releaseOne();
    await first;
    await secondEntered;
    const secondProbe = new DatabaseSync(mutex, { timeout: 0 });
    expect(() => secondProbe.exec('BEGIN IMMEDIATE')).toThrow(
      'database is locked',
    );
    secondProbe.close();
    releaseTwo();
    await second;
    expect(maxActive).toBe(1);
    expect((await stat(mutex)).ino).toBe(inode);
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
  it('does not restore a session when logout overlaps reauthorization', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
    const path = join(dir, 'session.json');
    await writeFile(path, JSON.stringify(record), { mode: 0o600 });
    let authorization = '';
    let releaseExchange!: () => void;
    let exchangeStarted!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseExchange = resolve;
    });
    const started = new Promise<void>((resolve) => {
      exchangeStarted = resolve;
    });
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    (jwk as any).kid = 'reauthorize';
    const loginFetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes('openid-configuration'))
        return new Response(
          JSON.stringify({ jwks_uri: 'https://issuer.test/jwks' }),
        );
      if (url.includes('/oauth/token')) {
        exchangeStarted();
        await release;
        const params = new URL(authorization).searchParams;
        const idToken = await new SignJWT({
          sub: 'sub',
          nonce: params.get('nonce'),
        })
          .setProtectedHeader({ alg: 'RS256', kid: 'reauthorize' })
          .setIssuer('https://auth.openai.com')
          .setAudience('oaiapp_test')
          .setIssuedAt()
          .setExpirationTime('1h')
          .sign(privateKey);
        return new Response(
          JSON.stringify({
            id_token: idToken,
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            scope: 'openid chatgpt.tokens.use.direct',
            expires_in: 3600,
          }),
        );
      }
      throw new Error(url);
    });
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', async (input: any) =>
      String(input).includes('/jwks')
        ? new Response(JSON.stringify({ keys: [jwk] }))
        : originalFetch(input),
    );
    try {
      const manager = new LocalChatGPTSessionManager({
        appName: 'test',
        path,
        fetch: loginFetch as any,
        openBrowser: (url) => {
          authorization = url;
        },
      });
      const loggerOut = new LocalChatGPTSessionManager({
        appName: 'test',
        path,
        fetch: vi
          .fn()
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                revocation_endpoint: 'https://issuer.test/revoke',
              }),
            ),
          )
          .mockResolvedValueOnce(new Response('', { status: 200 })),
      });
      const attempt = await manager.begin('oaiapp_test');
      const rejected = attempt.callback.catch((error) => error);
      const auth = new URL(authorization);
      const callback = new URL(auth.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state', auth.searchParams.get('state')!);
      callback.searchParams.set('code', 'reauthorize');
      const request = originalFetch(callback);
      await started;
      await expect(loggerOut.logout('oaiapp_test')).resolves.toEqual({
        remoteRevocationConfirmed: true,
      });
      releaseExchange();
      await expect(request).resolves.toMatchObject({ status: 400 });
      await expect(rejected).resolves.toMatchObject({
        code: 'session_invalidated',
      });
      expect(await manager.sessions()).toEqual([]);
    } finally {
      vi.stubGlobal('fetch', originalFetch);
    }
  });
  it('invalidates an older refresh when reauthorization replaces credentials', async () => {
    for (const refreshStatus of [200, 400]) {
      const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
      const path = join(dir, 'session.json');
      await writeFile(path, JSON.stringify(record), { mode: 0o600 });
      let authorization = '';
      let releaseRefresh!: () => void;
      let refreshStarted!: () => void;
      const release = new Promise<void>((resolve) => {
        releaseRefresh = resolve;
      });
      const started = new Promise<void>((resolve) => {
        refreshStarted = resolve;
      });
      const { publicKey, privateKey } = await generateKeyPair('RS256');
      const jwk = await exportJWK(publicKey);
      (jwk as any).kid = 'replace';
      const fetcher = vi.fn(async (input: any, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('openid-configuration'))
          return new Response(
            JSON.stringify({ jwks_uri: 'https://issuer.test/jwks' }),
          );
        if (url.includes('/oauth/token')) {
          const body = init?.body as URLSearchParams;
          if (body.get('grant_type') === 'refresh_token') {
            refreshStarted();
            await release;
            return new Response(
              refreshStatus === 200
                ? JSON.stringify({
                    access_token: 'stale-access',
                    refresh_token: 'stale-refresh',
                    expires_in: 3600,
                  })
                : '{}',
              { status: refreshStatus },
            );
          }
          const nonce = new URL(authorization).searchParams.get('nonce');
          const idToken = await new SignJWT({ sub: 'sub', nonce })
            .setProtectedHeader({ alg: 'RS256', kid: 'replace' })
            .setIssuer('https://auth.openai.com')
            .setAudience('oaiapp_test')
            .setIssuedAt()
            .setExpirationTime('1h')
            .sign(privateKey);
          return new Response(
            JSON.stringify({
              id_token: idToken,
              access_token: 'reauthorized-access',
              refresh_token: 'reauthorized-refresh',
              scope: 'openid chatgpt.tokens.use.direct',
              expires_in: 3600,
            }),
          );
        }
        throw new Error(url);
      });
      const originalFetch = globalThis.fetch;
      vi.stubGlobal('fetch', async (input: any) =>
        String(input).includes('/jwks')
          ? new Response(JSON.stringify({ keys: [jwk] }))
          : originalFetch(input),
      );
      try {
        const refresher = new LocalChatGPTSessionManager({
          appName: 'test',
          path,
          fetch: fetcher as any,
        });
        const reauthorizer = new LocalChatGPTSessionManager({
          appName: 'test',
          path,
          fetch: fetcher as any,
          openBrowser: (url) => {
            authorization = url;
          },
        });
        const refresh = refresher.refresh('oaiapp_test');
        await started;
        const attempt = await reauthorizer.begin('oaiapp_test');
        const auth = new URL(authorization);
        const callback = new URL(auth.searchParams.get('redirect_uri')!);
        callback.searchParams.set('state', auth.searchParams.get('state')!);
        callback.searchParams.set('code', 'reauthorize');
        await expect(originalFetch(callback)).resolves.toMatchObject({
          status: 200,
        });
        await expect(attempt.callback).resolves.toMatchObject({
          accessToken: 'reauthorized-access',
        });
        releaseRefresh();
        await expect(refresh).rejects.toBeInstanceOf(Error);
        await expect(reauthorizer.sessions()).resolves.toEqual([
          expect.objectContaining({
            clientId: 'oaiapp_test',
            expiresAt: expect.any(Number),
          }),
        ]);
        const disk = JSON.parse(await readFile(path, 'utf8'));
        expect(disk.sessions[0].accessToken).toBe('reauthorized-access');
        expect(disk.refreshes?.oaiapp_test).toBeUndefined();
      } finally {
        vi.stubGlobal('fetch', originalFetch);
      }
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
