import { createHash } from 'node:crypto';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  jwtVerify,
  SignJWT,
} from 'jose';
import { describe, expect, it, vi } from 'vitest';
import {
  createAuthorizationServer,
  InMemoryOAuthAuthorizationStorage,
} from './index.js';
import type { OAuthConsentContext } from './types.js';

const issuer = 'https://issuer.example';
const redirectUri = 'https://app.example/callback';
const verifier = 'v'.repeat(64);
const challenge = createHash('sha256').update(verifier).digest('base64url');

async function setup(
  revalidate?: (
    context: OAuthConsentContext,
  ) => Promise<OAuthConsentContext | null>,
  serverIssuer = issuer,
  allowLoopbackRedirects = true,
) {
  const keys = await generateKeyPair('RS256');
  const storage = new InMemoryOAuthAuthorizationStorage();
  await storage.registerClient({
    id: 'client',
    redirectUris: [redirectUri],
    allowedScopes: ['mcp.read'],
    allowedResources: ['https://resource.example/mcp'],
    tokenEndpointAuthMethod: 'none',
    createdAt: new Date(),
  });
  const server = createAuthorizationServer({
    issuer: serverIssuer,
    signingKey: {
      privateKey: keys.privateKey,
      publicKey: keys.publicKey,
      publicJwk: await exportJWK(keys.publicKey),
      algorithm: 'RS256',
      keyId: 'test',
    },
    storage,
    scopes: ['mcp.read'],
    resources: ['https://resource.example/mcp'],
    dynamicClientRegistration: true,
    allowLoopbackRedirects,
    identity: {
      revalidateConsent: async (context) =>
        revalidate ? revalidate(context) : context,
    },
  });
  return { server, storage, keys };
}
function authorization() {
  return new URLSearchParams({
    response_type: 'code',
    client_id: 'client',
    redirect_uri: redirectUri,
    scope: 'mcp.read',
    resource: 'https://resource.example/mcp',
    state: 'state',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
}
async function code(server: Awaited<ReturnType<typeof setup>>['server']) {
  return new URL(
    (
      await server.approve(
        await server.parseAuthorizationRequest(authorization()),
        { subject: 'alice', tenantId: 'tenant-a' },
      )
    ).redirectUri,
  ).searchParams.get('code')!;
}
async function exchange(
  server: Awaited<ReturnType<typeof setup>>['server'],
  value: string,
  patch: Record<string, string> = {},
) {
  return server.token(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'client',
      redirect_uri: redirectUri,
      code: value,
      code_verifier: verifier,
      resource: 'https://resource.example/mcp',
      ...patch,
    }),
  );
}

function refresh(
  server: Awaited<ReturnType<typeof setup>>['server'],
  token: string,
) {
  return server.token(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: 'client',
      refresh_token: token,
      resource: 'https://resource.example/mcp',
    }),
  );
}

describe('OAuthAuthorizationServer', () => {
  it.each([
    'x'.repeat(42),
    'x'.repeat(129),
    'x'.repeat(42) + '+',
  ])('rejects malformed PKCE before code consumption: %s', async (invalid) => {
    const { server, storage } = await setup();
    const params = authorization();
    params.set(
      'code_challenge',
      createHash('sha256').update(invalid).digest('base64url'),
    );
    const value = new URL(
      (
        await server.approve(await server.parseAuthorizationRequest(params), {
          subject: 'alice',
        })
      ).redirectUri,
    ).searchParams.get('code')!;
    await expect(
      exchange(server, value, { code_verifier: invalid }),
    ).rejects.toMatchObject({ error: 'invalid_grant' });
    expect(storage.usedCodes.size).toBe(0);
  });

  it.each([
    43, 128,
  ])('accepts valid PKCE boundary length %s', async (length) => {
    const { server } = await setup();
    const valid = 'a'.repeat(length - 4) + '._~-';
    const params = authorization();
    params.set(
      'code_challenge',
      createHash('sha256').update(valid).digest('base64url'),
    );
    const value = new URL(
      (
        await server.approve(await server.parseAuthorizationRequest(params), {
          subject: 'alice',
        })
      ).redirectUri,
    ).searchParams.get('code')!;
    expect(
      (await exchange(server, value, { code_verifier: valid })).access_token,
    ).toBeTruthy();
  });

  it.each([
    '/token',
    '/revoke',
  ])('bounds streaming form bodies for %s', async (path) => {
    const { server } = await setup();
    for (const length of [undefined, '1', '20000']) {
      const cancelled = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array(8192).fill(97));
        },
        cancel: cancelled,
      });
      const response = await server.handle(
        new Request(issuer + path, {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            ...(length ? { 'content-length': length } : {}),
          },
          body,
          duplex: 'half',
        } as RequestInit),
      );
      expect(response.status).toBe(413);
      expect(cancelled).toHaveBeenCalledOnce();
    }
  });

  it('persists requested refresh narrowing and rejects expansion', async () => {
    const { server, storage } = await setup();
    const initial = await exchange(server, await code(server));
    const narrowed = await server.token(
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: 'client',
        refresh_token: initial.refresh_token!,
        resource: 'https://resource.example/mcp',
        scope: '',
      }),
    );
    expect(narrowed.scope).toBe('');
    expect((await refresh(server, narrowed.refresh_token!)).scope).toBe('');
    const other = await exchange(server, await code(server));
    await expect(
      server.token(
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: 'client',
          refresh_token: other.refresh_token!,
          resource: 'https://resource.example/mcp',
          scope: 'admin',
        }),
      ),
    ).rejects.toMatchObject({ error: 'invalid_scope' });
    expect(storage.revokedFamilies.size).toBe(1);
  });

  it('persists changed and removed claims across subsequent refreshes', async () => {
    let mode = 'initial';
    const observed: Array<OAuthConsentContext['claims']> = [];
    const { server, storage } = await setup(async (context) => {
      observed.push(context.claims);
      if (mode === 'initial') return { ...context, claims: { role: 'old' } };
      if (mode === 'change') return { ...context, claims: { role: 'new' } };
      if (mode === 'remove') return { ...context, claims: undefined };
      return context;
    });
    const first = await exchange(server, await code(server));
    mode = 'change';
    const second = await refresh(server, first.refresh_token!);
    expect(
      storage.refreshes.get(second.refresh_token!.split('.')[0])?.claims,
    ).toEqual({ role: 'new' });
    mode = 'remove';
    const third = await refresh(server, second.refresh_token!);
    expect(observed.at(-1)).toEqual({ role: 'new' });
    expect(
      storage.refreshes.get(third.refresh_token!.split('.')[0])?.claims,
    ).toBeUndefined();
    mode = 'preserve';
    const fourth = await refresh(server, third.refresh_token!);
    expect(observed.at(-1)).toBeUndefined();
    expect(
      (await server.verifyAccessToken(fourth.access_token)).role,
    ).toBeUndefined();
  });

  it('binds S256 PKCE, client, redirect URI, resource, scopes and one-time code use', async () => {
    const { server } = await setup();
    const value = await code(server);
    const tokens = await exchange(server, value);
    expect(tokens.refresh_token).toBeTruthy();
    expect(
      (
        await server.verifyAccessToken(
          tokens.access_token,
          'https://resource.example/mcp',
        )
      ).tenant_id,
    ).toBe('tenant-a');
    await server.revokeAccessToken(tokens.access_token);
    await expect(
      server.verifyAccessToken(
        tokens.access_token,
        'https://resource.example/mcp',
      ),
    ).rejects.toMatchObject({ error: 'invalid_token' });
    await expect(exchange(server, value)).rejects.toMatchObject({
      error: 'invalid_grant',
    });
    for (const patch of [
      { code_verifier: 'wrong' },
      { redirect_uri: 'https://attacker.example/cb' },
      { resource: 'https://attacker.example' },
    ]) {
      const next = await code(server);
      await expect(exchange(server, next, patch)).rejects.toMatchObject({
        error: 'invalid_grant',
      });
    }
  });

  it('rotates refresh tokens and makes a replay revoke the full token family', async () => {
    const { server } = await setup();
    const first = await exchange(server, await code(server));
    const refresh = async (token: string) =>
      server.token(
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: 'client',
          refresh_token: token,
          resource: 'https://resource.example/mcp',
        }),
      );
    const second = await refresh(first.refresh_token!);
    await expect(refresh(first.refresh_token!)).rejects.toMatchObject({
      error: 'invalid_grant',
    });
    await expect(refresh(second.refresh_token!)).rejects.toMatchObject({
      error: 'invalid_grant',
    });
  });

  it('handles discovery, JWKS, DCR and rejects malformed or unsafe registration', async () => {
    const { server } = await setup();
    const metadata = await (
      await server.handle(
        new Request(`${issuer}/.well-known/oauth-authorization-server`),
      )
    ).json();
    expect(metadata).toMatchObject({
      issuer,
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
    });
    expect((await server.handle(new Request(`${issuer}/jwks`))).status).toBe(
      200,
    );
    const registered = await server.handle(
      new Request(`${issuer}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['http://127.0.0.1/callback'],
          token_endpoint_auth_method: 'none',
        }),
      }),
    );
    expect(registered.status).toBe(201);
    await expect(
      server.register({ redirect_uris: ['http://attacker.example/callback'] }),
    ).rejects.toMatchObject({ error: 'invalid_request' });
    const invalid = authorization();
    invalid.set('code_challenge_method', 'plain');
    await expect(
      server.parseAuthorizationRequest(invalid),
    ).rejects.toMatchObject({ error: 'invalid_request' });
  });

  it('atomically permits only one concurrent code exchange', async () => {
    const { server } = await setup();
    const value = await code(server);
    const result = await Promise.allSettled([
      exchange(server, value),
      exchange(server, value),
    ]);
    expect(result.filter((entry) => entry.status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(result.filter((entry) => entry.status === 'rejected')).toHaveLength(
      1,
    );
  });

  it('uses issuer-relative endpoints and denies wrong audience, empty consent, and reserved claims', async () => {
    const { server } = await setup(undefined, 'https://issuer.example/oauth');
    const nested = await (
      await server.handle(
        new Request('https://issuer.example/oauth/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'invalid' }),
        }),
      )
    ).json();
    expect(nested.error).toBe('unsupported_grant_type');
    await expect(
      server.approve(await server.parseAuthorizationRequest(authorization()), {
        subject: '',
      }),
    ).rejects.toMatchObject({ error: 'access_denied' });
    const tokens = await exchange(server, await code(server));
    await expect(
      server.verifyAccessToken(tokens.access_token, 'https://other.example'),
    ).rejects.toThrow();
    const request = await server.parseAuthorizationRequest(authorization());
    await expect(
      server
        .approve(request, { subject: 'alice', claims: { scope: 'admin' } })
        .then((result) =>
          exchange(
            server,
            new URL(result.redirectUri).searchParams.get('code')!,
          ),
        ),
    ).rejects.toMatchObject({ error: 'invalid_request' });
  });

  it('revalidates code and refresh grants, narrows scopes, and revokes refreshes', async () => {
    const denied = await setup(async () => null);
    await expect(
      exchange(denied.server, await code(denied.server)),
    ).rejects.toMatchObject({ error: 'invalid_grant' });
    const narrowed = await setup(async (context) => ({
      ...context,
      scopes: [],
    }));
    const first = await exchange(narrowed.server, await code(narrowed.server));
    expect(
      (await narrowed.server.verifyAccessToken(first.access_token)).scope,
    ).toBe('');
    await narrowed.server.revoke(
      new URLSearchParams({ token: first.refresh_token! }),
    );
    await expect(
      narrowed.server.token(
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: 'client',
          refresh_token: first.refresh_token!,
          resource: 'https://resource.example/mcp',
        }),
      ),
    ).rejects.toMatchObject({ error: 'invalid_grant' });
  });
  it('persists refresh-time narrowing and never restores removed permissions', async () => {
    let narrow = false;
    const { server, storage } = await setup(async (context) =>
      narrow ? { ...context, scopes: [] } : context,
    );
    const first = await exchange(server, await code(server));
    expect(first.scope).toBe('mcp.read');
    narrow = true;
    const second = await refresh(server, first.refresh_token!);
    expect(second.scope).toBe('');
    expect((await server.verifyAccessToken(second.access_token)).scope).toBe(
      '',
    );
    expect(
      storage.refreshes.get(second.refresh_token!.split('.')[0])?.scopes,
    ).toEqual([]);
    narrow = false;
    expect((await refresh(server, second.refresh_token!)).scope).toBe('');
  });

  it.each([
    'deny',
    'subject',
    'tenant',
    'scope',
  ] as const)('fails closed on live %s changes during code and refresh exchange', async (change) => {
    let changed = false;
    const { server, storage } = await setup(async (context) => {
      if (!changed) return context;
      if (change === 'deny') return null;
      if (change === 'subject') return { ...context, subject: 'mallory' };
      if (change === 'tenant') return { ...context, tenantId: 'tenant-b' };
      return { ...context, scopes: ['admin'] };
    });
    const initial = await exchange(server, await code(server));
    const pending = await code(server);
    changed = true;
    await expect(exchange(server, pending)).rejects.toMatchObject({
      error: change === 'scope' ? 'invalid_scope' : 'invalid_grant',
    });
    await expect(refresh(server, initial.refresh_token!)).rejects.toThrow();
    expect(storage.revokedFamilies.size).toBe(1);
    changed = false;
    await expect(exchange(server, pending)).rejects.toThrow();
    await expect(refresh(server, initial.refresh_token!)).rejects.toThrow();
  });

  it.each([
    null,
    [],
    {},
    { redirect_uris: [] },
    { redirect_uris: [1] },
    { redirect_uris: ['garbage'] },
    { redirect_uris: [redirectUri], grant_types: ['client_credentials'] },
    { redirect_uris: [redirectUri], response_types: ['token'] },
    {
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'client_secret_basic',
    },
    { redirect_uris: [redirectUri], scope: 'admin' },
    { redirect_uris: [redirectUri], scope: [] },
  ])('rejects malformed DCR metadata %j without registering', async (metadata) => {
    const { server, storage } = await setup();
    await expect(server.register(metadata)).rejects.toThrow();
    expect(storage.clients.size).toBe(1);
  });

  it.each([
    'iss',
    'sub',
    'aud',
    'exp',
    'iat',
    'jti',
    'scope',
    'client_id',
    'tenant_id',
    'nbf',
  ])('rejects reserved JWT claim %s', async (claim) => {
    const { server } = await setup();
    const redirect = await server.approve(
      await server.parseAuthorizationRequest(authorization()),
      { subject: 'alice', claims: { [claim]: 'forged' } },
    );
    await expect(
      exchange(server, new URL(redirect.redirectUri).searchParams.get('code')!),
    ).rejects.toMatchObject({ error: 'invalid_request' });
  });

  it('round-trips a signed token through advertised path issuer discovery and JWKS', async () => {
    const { server } = await setup(undefined, `${issuer}/oauth`);
    const metadata = await (
      await server.handle(
        new Request(`${issuer}/.well-known/oauth-authorization-server/oauth`),
      )
    ).json();
    expect(metadata.issuer).toBe(`${issuer}/oauth`);
    expect(metadata.token_endpoint).toBe(`${issuer}/oauth/token`);
    const jwks = await (
      await server.handle(new Request(metadata.jwks_uri))
    ).json();
    expect(jwks.keys[0].d).toBeUndefined();
    const token = await exchange(server, await code(server));
    const verified = await jwtVerify(
      token.access_token,
      createLocalJWKSet(jwks),
      {
        issuer: metadata.issuer,
        audience: 'https://resource.example/mcp',
        algorithms: ['RS256'],
      },
    );
    expect(verified.protectedHeader.kid).toBe('test');
    expect(verified.payload.sub).toBe('alice');
    const revoked = await server.handle(
      new Request(`${issuer}/oauth/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: token.refresh_token! }),
      }),
    );
    expect(revoked.status).toBe(200);
    await expect(refresh(server, token.refresh_token!)).rejects.toThrow();
  });

  it('does not expose tokens when durable writes or reads fail, including after mutation', async () => {
    const { server, storage } = await setup();
    const createCode = vi
      .spyOn(storage, 'createAuthorizationCode')
      .mockRejectedValueOnce(new Error('database unavailable'));
    await expect(code(server)).rejects.toThrow('database unavailable');
    expect(storage.codes.size).toBe(0);
    createCode.mockRestore();
    const value = await code(server);
    const createRefresh = vi
      .spyOn(storage, 'createRefreshGrant')
      .mockImplementationOnce(async (grant) => {
        storage.refreshes.set(grant.id, grant);
        throw new Error('connection lost after write');
      });
    await expect(exchange(server, value)).rejects.toThrow('connection lost');
    await expect(exchange(server, value)).rejects.toThrow();
    // The orphaned grant contains hashes only: its opaque secret was never returned.
    expect([...storage.refreshes.values()][0]).not.toHaveProperty('token');
    createRefresh.mockRestore();
    const first = await exchange(server, await code(server));
    const rotate = storage.rotateRefreshGrant.bind(storage);
    vi.spyOn(storage, 'rotateRefreshGrant').mockImplementationOnce(
      async (input) => {
        await rotate(input);
        throw new Error('connection lost after rotation');
      },
    );
    await expect(refresh(server, first.refresh_token!)).rejects.toThrow(
      'connection lost',
    );
    await expect(refresh(server, first.refresh_token!)).rejects.toThrow();
    vi.spyOn(storage, 'isAccessTokenRevoked').mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(server.verifyAccessToken(first.access_token)).rejects.toThrow(
      'database unavailable',
    );
  });

  it('fails closed if persisting narrowed scopes fails', async () => {
    let narrow = false;
    const { server, storage } = await setup(async (context) =>
      narrow ? { ...context, scopes: [] } : context,
    );
    const first = await exchange(server, await code(server));
    narrow = true;
    vi.spyOn(storage, 'narrowRefreshGrant').mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(refresh(server, first.refresh_token!)).rejects.toThrow(
      'database unavailable',
    );
    expect(storage.revokedFamilies.size).toBe(1);
    await expect(refresh(server, first.refresh_token!)).rejects.toThrow();
  });
  it('honors approval scope narrowing and rejects approval expansion', async () => {
    const { server } = await setup();
    const request = await server.parseAuthorizationRequest(authorization());
    const approved = await server.approve(request, {
      subject: 'alice',
      scopes: [],
    });
    expect(
      (
        await exchange(
          server,
          new URL(approved.redirectUri).searchParams.get('code')!,
        )
      ).scope,
    ).toBe('');
    await expect(
      server.approve(request, { subject: 'alice', scopes: ['admin'] }),
    ).rejects.toMatchObject({ error: 'invalid_scope' });
  });

  it('concurrent refresh permits at most one exchange and revokes its family after replay', async () => {
    const { server, storage } = await setup();
    const first = await exchange(server, await code(server));
    const results = await Promise.allSettled([
      refresh(server, first.refresh_token!),
      refresh(server, first.refresh_token!),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled').length,
    ).toBeLessThanOrEqual(1);
    expect(storage.revokedFamilies.size).toBe(1);
    for (const result of results)
      if (result.status === 'fulfilled')
        await expect(
          refresh(server, result.value.refresh_token!),
        ).rejects.toMatchObject({ error: 'invalid_grant' });
  });
  it('requires explicit opt-in for HTTP loopback registration', async () => {
    const { server } = await setup(undefined, issuer, false);
    await expect(
      server.register({ redirect_uris: ['http://localhost/callback'] }),
    ).rejects.toMatchObject({ error: 'invalid_request' });
    await expect(
      server.register({ redirect_uris: [redirectUri] }),
    ).resolves.toHaveProperty('client_id');
  });

  it.each([
    'exp',
    'iat',
    'sub',
    'client_id',
    'scope',
    'aud',
    'jti',
    'typ',
    'scope-type',
    'client-type',
    'tenant-type',
  ])('rejects signed access JWT with invalid %s', async (field) => {
    const { server, keys } = await setup();
    const now = Math.floor(Date.now() / 1000);
    const payload: Record<string, unknown> = {
      iss: issuer,
      sub: 'alice',
      client_id: 'client',
      scope: 'mcp.read',
      aud: 'https://resource.example/mcp',
      jti: 'test',
      iat: now,
      exp: now + 300,
    };
    if (field === 'scope-type') payload.scope = ['mcp.read'];
    else if (field === 'client-type') payload.client_id = 1;
    else if (field === 'tenant-type') payload.tenant_id = [];
    else delete payload[field];
    const token = await new SignJWT(payload)
      .setProtectedHeader({
        alg: 'RS256',
        typ: field === 'typ' ? 'JWT' : 'at+jwt',
      })
      .sign(keys.privateKey);
    await expect(
      server.verifyAccessToken(token, 'https://resource.example/mcp'),
    ).rejects.toThrow();
  });
  it.each([
    'isAccessTokenRevoked',
    'revokeAccessToken',
  ] as const)('reports revocation storage failure from %s and permits recovery', async (operation) => {
    const { server, storage } = await setup();
    const tokens = await exchange(server, await code(server));
    const revoke = () =>
      server.handle(
        new Request(`${issuer}/revoke`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: tokens.access_token }),
        }),
      );
    vi.spyOn(storage, operation).mockRejectedValueOnce(
      new Error('private database outage'),
    );
    const failed = await revoke();
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({
      error: 'server_error',
      error_description:
        'The authorization server could not complete the request.',
    });
    await expect(
      server.verifyAccessToken(tokens.access_token),
    ).resolves.toHaveProperty('sub', 'alice');
    expect((await revoke()).status).toBe(200);
    await expect(
      server.verifyAccessToken(tokens.access_token),
    ).rejects.toMatchObject({ error: 'invalid_token' });
    expect((await revoke()).status).toBe(200);
  });

  it('treats malformed, expired and signature-invalid revocation tokens as unknown', async () => {
    const { server, keys } = await setup();
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({
      scope: 'mcp.read',
      client_id: 'client',
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt' })
      .setIssuer(issuer)
      .setSubject('alice')
      .setAudience(issuer)
      .setJti('expired')
      .setIssuedAt(now - 600)
      .setExpirationTime(now - 300)
      .sign(keys.privateKey);
    const alien = await setup();
    const foreign = await exchange(alien.server, await code(alien.server));
    for (const token of ['malformed', expired, foreign.access_token]) {
      const response = await server.handle(
        new Request(`${issuer}/revoke`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }),
        }),
      );
      expect(response.status).toBe(200);
    }
  });

  it.each([
    { redirect_uris: Array(11).fill(redirectUri) },
    { redirect_uris: [`https://app.example/${'x'.repeat(2048)}`] },
    { redirect_uris: [redirectUri], client_name: 'x'.repeat(257) },
    { redirect_uris: [redirectUri], client_name: [] },
    { redirect_uris: [redirectUri], scope: ' '.repeat(2049) },
    {
      redirect_uris: [redirectUri],
      grant_types: Array(3).fill('authorization_code'),
    },
    { redirect_uris: [redirectUri], response_types: Array(2).fill('code') },
  ])('bounds direct registration metadata before persistence %j', async (metadata) => {
    const { server, storage } = await setup();
    await expect(server.register(metadata)).rejects.toMatchObject({
      error: 'invalid_request',
    });
    expect(storage.clients.size).toBe(1);
  });

  it.each([
    'absent',
    'understated',
    'excessive',
  ] as const)('bounds streamed registration body with %s content length', async (length) => {
    const { server, storage } = await setup();
    const cancelled = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `{"redirect_uris":["${redirectUri}"],"extension":"`,
          ),
        );
      },
      pull(controller) {
        controller.enqueue(new Uint8Array(8192).fill(120));
      },
      cancel: cancelled,
    });
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (length !== 'absent')
      headers['content-length'] = length === 'understated' ? '1' : '20000';
    const response = await server.handle(
      new Request(`${issuer}/register`, {
        method: 'POST',
        headers,
        body: stream,
        duplex: 'half',
      } as RequestInit),
    );
    expect(response.status).toBe(413);
    expect(cancelled).toHaveBeenCalledOnce();
    expect(storage.clients.size).toBe(1);
  });

  it('accepts registration limits and ignores bounded extension metadata', async () => {
    const { server, storage } = await setup();
    const response = await server.handle(
      new Request(`${issuer}/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: Array(10).fill(redirectUri),
          client_name: 'x'.repeat(256),
          extension: { ignored: true },
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(storage.clients.size).toBe(2);
    const malformed = await server.handle(
      new Request(`${issuer}/register`, { method: 'POST', body: '{' }),
    );
    expect(malformed.status).toBe(400);
  });
});
