import { mkdtemp, writeFile } from 'node:fs/promises';
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
  it('completes only a state-bound loopback callback with a verified identity', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hv-siwc-'));
    const path = join(dir, 'session.json');
    let authorization = '';
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    (jwk as any).kid = 'test';
    const fetcher = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes('openid-configuration'))
        return new Response(
          JSON.stringify({ jwks_uri: 'https://issuer.test/jwks' }),
        );
      if (url.includes('/jwks'))
        return new Response(JSON.stringify({ keys: [jwk] }));
      if (url.includes('/oauth/token')) {
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
      const result = await originalFetch(redirect);
      expect(result.status).toBe(200);
      await expect(attempt.callback).resolves.toMatchObject({
        subject: 'subject',
        clientId: 'oaiapp_test',
      });
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
});
