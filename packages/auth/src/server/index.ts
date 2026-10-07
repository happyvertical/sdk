import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { type JWTPayload, jwtVerify, SignJWT } from 'jose';
import {
  type OAuthAuthorizationCodeGrant,
  type OAuthAuthorizationRedirect,
  type OAuthAuthorizationRequest,
  type OAuthAuthorizationServerOptions,
  type OAuthClient,
  type OAuthConsentContext,
  type OAuthRefreshGrant,
  OAuthServerError,
  type OAuthTokenResponse,
} from './types.js';

export { InMemoryOAuthAuthorizationStorage } from './memory.js';
export * from './types.js';

const maxLifetime = 60 * 60 * 24 * 90;
const scopePattern = /^[\x21\x23-\x5b\x5d-\x7e]+$/u;

function opaque(): { id: string; secret: string; value: string; hash: string } {
  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  return { id, secret, value: `${id}.${secret}`, hash: hash(secret) };
}
function hash(value: string) {
  return createHash('sha256').update(value).digest('base64url');
}
function parseOpaque(value: string): { id: string; hash: string } | null {
  const [id, secret, extra] = value.split('.');
  if (
    !id ||
    !secret ||
    extra ||
    !/^[0-9a-f-]{36}$/iu.test(id) ||
    !/^[A-Za-z0-9_-]{32,}$/u.test(secret)
  )
    return null;
  return { id, hash: hash(secret) };
}
function same(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function scopeList(value: string | null): string[] {
  if (!value) return [];
  const scopes = value.split(' ').filter(Boolean);
  if (!scopes.length || scopes.some((scope) => !scopePattern.test(scope)))
    throw new OAuthServerError('invalid_scope', 'Invalid scope.');
  return [...new Set(scopes)];
}
function endpoint(issuer: string, path: string) {
  return new URL(path, issuer.endsWith('/') ? issuer : `${issuer}/`).href;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      pragma: 'no-cache',
    },
  });
}
function errorResponse(error: unknown) {
  const value =
    error instanceof OAuthServerError
      ? error
      : new OAuthServerError('invalid_request', 'Invalid request.');
  return json(
    { error: value.error, error_description: value.description },
    value.status,
  );
}

/** Framework-independent OAuth authorization server. Mount {@link handle} in any Fetch-compatible router. */
export class OAuthAuthorizationServer {
  private readonly issuer: string;
  private readonly issuerUrl: URL;
  private readonly options: Required<
    Pick<
      OAuthAuthorizationServerOptions,
      | 'authorizationCodeLifetimeSeconds'
      | 'accessTokenLifetimeSeconds'
      | 'refreshTokenLifetimeSeconds'
      | 'issueRefreshTokens'
      | 'dynamicClientRegistration'
    >
  > &
    OAuthAuthorizationServerOptions;

  constructor(options: OAuthAuthorizationServerOptions) {
    this.issuerUrl = this.assertIssuer(options.issuer);
    this.issuer = this.issuerUrl.href.replace(/\/$/u, '');
    for (const lifetime of [
      options.authorizationCodeLifetimeSeconds ?? 300,
      options.accessTokenLifetimeSeconds ?? 300,
      options.refreshTokenLifetimeSeconds ?? 60 * 60 * 24 * 30,
    ])
      if (
        !Number.isInteger(lifetime) ||
        lifetime < 30 ||
        lifetime > maxLifetime
      )
        throw new TypeError(
          'OAuth lifetimes must be whole seconds between 30 and 90 days.',
        );
    this.options = {
      ...options,
      authorizationCodeLifetimeSeconds:
        options.authorizationCodeLifetimeSeconds ?? 300,
      accessTokenLifetimeSeconds: options.accessTokenLifetimeSeconds ?? 300,
      refreshTokenLifetimeSeconds:
        options.refreshTokenLifetimeSeconds ?? 60 * 60 * 24 * 30,
      issueRefreshTokens: options.issueRefreshTokens !== false,
      dynamicClientRegistration: options.dynamicClientRegistration === true,
    };
  }

  /** Parse and validate an authorization request without authenticating a browser session. */
  async parseAuthorizationRequest(
    input: URLSearchParams,
  ): Promise<OAuthAuthorizationRequest> {
    if (input.get('response_type') !== 'code')
      throw new OAuthServerError(
        'unsupported_response_type',
        'Only authorization code is supported.',
      );
    const clientId = required(input, 'client_id');
    const redirectUri = required(input, 'redirect_uri');
    const client = await this.options.storage.getClient(clientId);
    if (!client)
      throw new OAuthServerError('invalid_request', 'Unknown client.');
    this.assertRedirect(client, redirectUri);
    const codeChallenge = required(input, 'code_challenge');
    if (
      !/^[A-Za-z0-9_-]{43,128}$/u.test(codeChallenge) ||
      input.get('code_challenge_method') !== 'S256'
    )
      throw new OAuthServerError('invalid_request', 'S256 PKCE is required.');
    const scopes = scopeList(input.get('scope'));
    this.assertScopes(client, scopes);
    const resource = input.get('resource') ?? undefined;
    this.assertResource(client, resource);
    return {
      clientId,
      redirectUri,
      responseType: 'code',
      scopes,
      resource,
      state: input.get('state') ?? undefined,
      codeChallenge,
      codeChallengeMethod: 'S256',
    };
  }

  /** Records an application-approved authorization decision and returns its redirect URI. */
  async approve(
    request: OAuthAuthorizationRequest,
    consent: OAuthConsentContext,
  ): Promise<OAuthAuthorizationRedirect> {
    if (!consent.subject || consent.subject.length > 512)
      throw new OAuthServerError('access_denied', 'Authorization denied.');
    const client = await this.options.storage.getClient(request.clientId);
    if (!client)
      throw new OAuthServerError('invalid_request', 'Unknown client.');
    this.assertRedirect(client, request.redirectUri);
    this.assertScopes(client, request.scopes);
    this.assertResource(client, request.resource);
    const code = opaque();
    const now = new Date();
    const grant: OAuthAuthorizationCodeGrant = {
      id: code.id,
      codeHash: code.hash,
      clientId: request.clientId,
      subject: consent.subject,
      ...(consent.tenantId ? { tenantId: consent.tenantId } : {}),
      ...(consent.claims ? { claims: consent.claims } : {}),
      redirectUri: request.redirectUri,
      scopes: request.scopes,
      ...(request.resource ? { resource: request.resource } : {}),
      codeChallenge: request.codeChallenge,
      expiresAt: new Date(
        now.getTime() + this.options.authorizationCodeLifetimeSeconds * 1000,
      ),
    };
    await this.options.storage.createAuthorizationCode(grant);
    const redirect = new URL(request.redirectUri);
    redirect.searchParams.set('code', code.value);
    if (request.state) redirect.searchParams.set('state', request.state);
    redirect.searchParams.set('iss', this.issuer);
    return { redirectUri: redirect.href };
  }

  /** Exchanges an authorization code or a rotating refresh token for an access token. */
  async token(input: URLSearchParams): Promise<OAuthTokenResponse> {
    const grantType = required(input, 'grant_type');
    if (grantType === 'authorization_code') return this.exchangeCode(input);
    if (grantType === 'refresh_token') return this.refresh(input);
    throw new OAuthServerError(
      'unsupported_grant_type',
      'Unsupported grant_type.',
    );
  }

  /** RFC 7009-style best-effort revocation; unknown token values deliberately succeed. */
  async revoke(input: URLSearchParams): Promise<void> {
    const token = required(input, 'token');
    const parsed = parseOpaque(token);
    if (parsed) {
      await this.options.storage.revokeRefreshGrant({
        id: parsed.id,
        tokenHash: parsed.hash,
        now: new Date(),
      });
      return;
    }
    try {
      await this.revokeAccessToken(token);
    } catch {
      // RFC 7009 requires a successful response for an unknown token.
    }
  }

  /** Immediately makes a valid, unexpired access JWT inactive through the injected revocation store. */
  async revokeAccessToken(token: string): Promise<void> {
    const payload = await this.verifyAccessToken(token);
    if (typeof payload.jti !== 'string' || typeof payload.exp !== 'number')
      throw new OAuthServerError('invalid_token', 'Invalid access token.', 401);
    await this.options.storage.revokeAccessToken({
      jti: payload.jti,
      expiresAt: new Date(payload.exp * 1000),
    });
  }

  /** Verifies issuer, signature, expiry, audience and live server-side access-token revocation. */
  async verifyAccessToken(
    token: string,
    audience?: string,
  ): Promise<JWTPayload> {
    const { payload } = await jwtVerify(
      token,
      this.options.signingKey.publicKey,
      {
        issuer: this.issuer,
        ...(audience ? { audience } : {}),
        algorithms: [this.options.signingKey.algorithm],
      },
    );
    if (
      !payload.jti ||
      (await this.options.storage.isAccessTokenRevoked(payload.jti, new Date()))
    )
      throw new OAuthServerError('invalid_token', 'Invalid access token.', 401);
    return payload;
  }

  /** Returns RFC 8414 authorization-server metadata. */
  discovery() {
    return {
      issuer: this.issuer,
      authorization_endpoint: endpoint(this.issuer, 'authorize'),
      token_endpoint: endpoint(this.issuer, 'token'),
      jwks_uri: endpoint(this.issuer, 'jwks'),
      ...(this.options.dynamicClientRegistration
        ? { registration_endpoint: endpoint(this.issuer, 'register') }
        : {}),
      response_types_supported: ['code'],
      grant_types_supported: [
        'authorization_code',
        ...(this.options.issueRefreshTokens ? ['refresh_token'] : []),
      ],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
      scopes_supported: [...this.options.scopes],
    };
  }

  /** Returns the public signing JWK. */
  jwks() {
    return {
      keys: [
        {
          ...this.options.signingKey.publicJwk,
          kid: this.options.signingKey.keyId,
          alg: this.options.signingKey.algorithm,
          use: 'sig',
        },
      ],
    };
  }

  /** Safely registers a public authorization-code client when DCR is explicitly enabled. */
  async register(
    input: unknown,
  ): Promise<{ client_id: string; client_id_issued_at: number }> {
    if (!this.options.dynamicClientRegistration)
      throw new OAuthServerError(
        'invalid_request',
        'Dynamic client registration is disabled.',
        404,
      );
    const value = input as Record<string, unknown>;
    if (
      !Array.isArray(value.redirect_uris) ||
      !value.redirect_uris.length ||
      value.redirect_uris.some((uri) => typeof uri !== 'string')
    )
      throw new OAuthServerError(
        'invalid_request',
        'redirect_uris is required.',
      );
    if (
      value.token_endpoint_auth_method !== undefined &&
      value.token_endpoint_auth_method !== 'none'
    )
      throw new OAuthServerError(
        'invalid_request',
        'Only public clients are supported.',
      );
    const client: OAuthClient = {
      id: randomUUID(),
      redirectUris: value.redirect_uris.map((uri) =>
        this.assertPublicRedirect(uri),
      ),
      allowedScopes: this.options.scopes,
      tokenEndpointAuthMethod: 'none',
      createdAt: new Date(),
    };
    await this.options.storage.registerClient(client);
    return {
      client_id: client.id,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    };
  }

  /** Fetch-native routing for discovery, JWKS, registration, token and revocation endpoints. Authorization approval stays application-owned. */
  async handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      if (
        request.method === 'GET' &&
        path === '/.well-known/oauth-authorization-server'
      )
        return json(this.discovery());
      if (
        request.method === 'GET' &&
        path === '/.well-known/openid-configuration'
      )
        return json(this.discovery());
      if (request.method === 'GET' && path === '/jwks')
        return json(this.jwks());
      if (request.method === 'POST' && path === '/token')
        return json(await this.token(await form(request)));
      if (request.method === 'POST' && path === '/revoke') {
        await this.revoke(await form(request));
        return new Response(null, {
          status: 200,
          headers: { 'cache-control': 'no-store' },
        });
      }
      if (request.method === 'POST' && path === '/register')
        return json(await this.register(await request.json()), 201);
      return new Response(null, { status: 404 });
    } catch (error) {
      return errorResponse(error);
    }
  }

  private async exchangeCode(
    input: URLSearchParams,
  ): Promise<OAuthTokenResponse> {
    const client = await this.client(input);
    const raw = parseOpaque(required(input, 'code'));
    if (!raw)
      throw new OAuthServerError(
        'invalid_grant',
        'Invalid authorization code.',
      );
    const redirectUri = required(input, 'redirect_uri');
    const verifier = required(input, 'code_verifier');
    const resource = input.get('resource') ?? undefined;
    const result = await this.options.storage.consumeAuthorizationCode({
      id: raw.id,
      codeHash: raw.hash,
      clientId: client.id,
      redirectUri,
      ...(resource ? { resource } : {}),
      now: new Date(),
    });
    if (result.status !== 'consumed')
      throw new OAuthServerError(
        'invalid_grant',
        'Invalid authorization code.',
      );
    if (!same(hash(verifier), result.grant.codeChallenge))
      throw new OAuthServerError(
        'invalid_grant',
        'Invalid authorization code.',
      );
    return this.issue(result.grant, true);
  }
  private async refresh(input: URLSearchParams): Promise<OAuthTokenResponse> {
    const client = await this.client(input);
    const raw = parseOpaque(required(input, 'refresh_token'));
    if (!raw)
      throw new OAuthServerError('invalid_grant', 'Invalid refresh token.');
    const resource = input.get('resource') ?? undefined;
    const candidate = opaque();
    const now = new Date();
    const replacement = {
      id: candidate.id,
      tokenHash: candidate.hash,
      expiresAt: new Date(
        now.getTime() + this.options.refreshTokenLifetimeSeconds * 1000,
      ),
    };
    const result = await this.options.storage.rotateRefreshGrant({
      id: raw.id,
      tokenHash: raw.hash,
      clientId: client.id,
      ...(resource ? { resource } : {}),
      replacement,
      now,
    });
    if (result.status !== 'rotated')
      throw new OAuthServerError('invalid_grant', 'Invalid refresh token.');
    const consent = await this.options.identity.refreshConsent(
      {
        subject: result.grant.subject,
        ...(result.grant.tenantId ? { tenantId: result.grant.tenantId } : {}),
        ...(result.grant.claims ? { claims: result.grant.claims } : {}),
      },
      result.grant,
    );
    if (!consent) {
      await this.options.storage.revokeRefreshGrant({
        id: raw.id,
        tokenHash: raw.hash,
        now,
      });
      throw new OAuthServerError(
        'invalid_grant',
        'Authorization is no longer active.',
      );
    }
    return this.issue(
      {
        ...result.grant,
        subject: consent.subject,
        ...(consent.tenantId ? { tenantId: consent.tenantId } : {}),
        ...(consent.claims ? { claims: consent.claims } : {}),
      },
      false,
      candidate.value,
    );
  }
  private async issue(
    grant: Pick<
      OAuthAuthorizationCodeGrant,
      'clientId' | 'subject' | 'tenantId' | 'claims' | 'scopes' | 'resource'
    >,
    refresh = false,
    existingRefresh?: string,
  ): Promise<OAuthTokenResponse> {
    const now = Math.floor(Date.now() / 1000);
    const jti = randomUUID();
    const token = await new SignJWT({
      scope: grant.scopes.join(' '),
      client_id: grant.clientId,
      ...(grant.tenantId ? { tenant_id: grant.tenantId } : {}),
      ...grant.claims,
    })
      .setProtectedHeader({
        alg: this.options.signingKey.algorithm,
        kid: this.options.signingKey.keyId,
        typ: 'at+jwt',
      })
      .setIssuer(this.issuer)
      .setSubject(grant.subject)
      .setJti(jti)
      .setIssuedAt(now)
      .setExpirationTime(now + this.options.accessTokenLifetimeSeconds)
      .setAudience(grant.resource ?? this.issuer)
      .sign(this.options.signingKey.privateKey);
    let refreshToken: string | undefined;
    if (this.options.issueRefreshTokens) {
      if (existingRefresh) refreshToken = existingRefresh;
      else {
        const raw = opaque();
        await this.options.storage.createRefreshGrant({
          id: raw.id,
          tokenHash: raw.hash,
          familyId: randomUUID(),
          clientId: grant.clientId,
          subject: grant.subject,
          ...(grant.tenantId ? { tenantId: grant.tenantId } : {}),
          ...(grant.claims ? { claims: grant.claims } : {}),
          scopes: grant.scopes,
          ...(grant.resource ? { resource: grant.resource } : {}),
          expiresAt: new Date(
            Date.now() + this.options.refreshTokenLifetimeSeconds * 1000,
          ),
        });
        refreshToken = raw.value;
      }
    }
    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: this.options.accessTokenLifetimeSeconds,
      scope: grant.scopes.join(' '),
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
    };
  }
  private async client(input: URLSearchParams) {
    const id = required(input, 'client_id');
    const client = await this.options.storage.getClient(id);
    if (!client)
      throw new OAuthServerError('invalid_client', 'Invalid client.', 401);
    if (client.tokenEndpointAuthMethod === 'client_secret_post') {
      const secret = required(input, 'client_secret');
      if (!client.secretHash || !same(hash(secret), client.secretHash))
        throw new OAuthServerError('invalid_client', 'Invalid client.', 401);
    }
    return client;
  }
  private assertRedirect(client: OAuthClient, redirectUri: string) {
    if (!client.redirectUris.includes(redirectUri))
      throw new OAuthServerError('invalid_request', 'Invalid redirect_uri.');
  }
  private assertScopes(client: OAuthClient, scopes: readonly string[]) {
    if (
      scopes.some(
        (scope) =>
          !this.options.scopes.includes(scope) ||
          !client.allowedScopes.includes(scope),
      )
    )
      throw new OAuthServerError(
        'invalid_scope',
        'Requested scope is not allowed.',
      );
  }
  private assertResource(client: OAuthClient, resource?: string) {
    if (!resource) return;
    if (
      !this.options.resources?.includes(resource) ||
      (client.allowedResources && !client.allowedResources.includes(resource))
    )
      throw new OAuthServerError(
        'invalid_request',
        'Requested resource is not allowed.',
      );
  }
  private assertIssuer(issuer: string) {
    let url: URL;
    try {
      url = new URL(issuer);
    } catch {
      throw new TypeError('issuer must be an absolute URL.');
    }
    if (
      url.protocol !== 'https:' ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      throw new TypeError(
        'issuer must be an HTTPS origin or path without query, fragment, or credentials.',
      );
    return url;
  }
  private assertPublicRedirect(uri: string) {
    const url = new URL(uri);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      (url.protocol === 'http:' &&
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
      throw new OAuthServerError('invalid_request', 'Invalid redirect URI.');
    return url.href;
  }
}

/** Creates a framework-independent OAuth server; callers must provide durable storage in production. */
export function createAuthorizationServer(
  options: OAuthAuthorizationServerOptions,
) {
  return new OAuthAuthorizationServer(options);
}
function required(params: URLSearchParams, name: string) {
  const value = params.get(name);
  if (!value)
    throw new OAuthServerError('invalid_request', `${name} is required.`);
  return value;
}
async function form(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('application/x-www-form-urlencoded'))
    throw new OAuthServerError(
      'invalid_request',
      'Form-encoded request required.',
    );
  return new URLSearchParams(await request.text());
}
