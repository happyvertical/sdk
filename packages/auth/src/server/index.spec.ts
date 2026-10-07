import { createHash } from 'node:crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify } from 'jose';
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
    identity: {
      revalidateConsent: async (context) =>
        revalidate ? revalidate(context) : context,
    },
  });
  return { server, storage };
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

  it('concurrent refresh permits one exchange and revokes its family after replay', async () => {
    const { server } = await setup();
    const first = await exchange(server, await code(server));
    const results = await Promise.allSettled([
      refresh(server, first.refresh_token!),
      refresh(server, first.refresh_token!),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    for (const result of results)
      if (result.status === 'fulfilled')
        await expect(
          refresh(server, result.value.refresh_token!),
        ).rejects.toMatchObject({ error: 'invalid_grant' });
  });
});
