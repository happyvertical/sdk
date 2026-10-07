import { createHash } from 'node:crypto';
import { exportJWK, generateKeyPair } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  createAuthorizationServer,
  InMemoryOAuthAuthorizationStorage,
} from './index.js';

const issuer = 'https://issuer.example';
const redirectUri = 'https://app.example/callback';
const verifier = 'v'.repeat(64);
const challenge = createHash('sha256').update(verifier).digest('base64url');

async function setup() {
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
    issuer,
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
    identity: { refreshConsent: async (context) => context },
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
});
