/**
 * Kanidm Provider - OAuth2/OIDC Authentication
 *
 * Implements OAuth2/OIDC authentication with Kanidm server including:
 * - OIDC Discovery (client-specific endpoints)
 * - Authorization Code Flow with PKCE (required by Kanidm)
 * - Token validation using JWKS (ES256)
 * - Token introspection
 * - User management via Kanidm's native /v1/ API
 */

import * as jose from 'jose';

import {
  AccessDeniedError,
  ConfigurationError,
  InvalidClientError,
  InvalidCredentialsError,
  InvalidGrantError,
  InvalidNonceError,
  InvalidTokenError,
  NetworkError,
  NotImplementedError,
  ProviderError,
  TokenExpiredError,
  UserAlreadyExistsError,
  UserNotFoundError,
} from '../errors.js';
import type {
  AuthCapabilities,
  AuthCredentials,
  AuthInterface,
  AuthorizationOptions,
  AuthorizationResult,
  AuthResult,
  CodeExchangeParams,
  CreateUserRequest,
  KanidmOptions,
  LogoutOptions,
  OIDCDiscoveryDocument,
  Session,
  TokenClaims,
  TokenIntrospection,
  TokenPayload,
  TokenValidationOptions,
  UserListResult,
  UserProfile,
  UserQuery,
} from '../types.js';

/**
 * Generate a random string for state/nonce/PKCE.
 */
function generateRandomString(length = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

/**
 * Generate PKCE code verifier and challenge.
 */
async function generatePKCE(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifier = generateRandomString(32);
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return { verifier, challenge };
}

/**
 * Kanidm authentication provider.
 *
 * Implements OAuth2/OIDC authentication with Kanidm server.
 * Key differences from Keycloak:
 * - Client-specific OIDC endpoints: /oauth2/openid/{clientId}/...
 * - ES256 token signing (not RS256)
 * - Authorization code flow only (no password grant)
 * - Native /v1/ API for admin operations (multi-step auth)
 */
export class KanidmProvider implements AuthInterface {
  private options: Required<Pick<KanidmOptions, 'serverUrl' | 'clientId'>> &
    KanidmOptions;
  private discoveryDocument: OIDCDiscoveryDocument | null = null;
  private jwks: jose.JWTVerifyGetKey | null = null;
  private adminToken: string | null = null;
  private adminTokenExpiry: number = 0;

  constructor(options: KanidmOptions) {
    if (!options.serverUrl) {
      throw new ConfigurationError('serverUrl is required', 'kanidm');
    }
    if (!options.clientId) {
      throw new ConfigurationError('clientId is required', 'kanidm');
    }

    this.options = {
      usePKCE: true, // Required by Kanidm
      verifySsl: true,
      scopes: ['openid', 'profile', 'email', 'groups'],
      timeout: 30000,
      maxRetries: 3,
      ...options,
    };
  }

  // ---------------------------------------------------------------------------
  // INTERNAL HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Get the OIDC base URL for this client.
   * Kanidm uses client-specific OIDC endpoints.
   */
  private getOidcBaseUrl(): string {
    return `${this.options.serverUrl}/oauth2/openid/${this.options.clientId}`;
  }

  /**
   * Get the native API base URL.
   */
  private getApiBaseUrl(): string {
    return `${this.options.serverUrl}/v1`;
  }

  /**
   * Make an HTTP request with error handling.
   */
  private async request<T>(
    url: string,
    options: RequestInit = {},
    token?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.options.headers,
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(this.options.timeout || 30000),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        let errorData: Record<string, unknown> = {};
        try {
          errorData = JSON.parse(errorBody);
        } catch {
          // Not JSON
        }

        this.handleHttpError(response.status, errorData, errorBody);
      }

      const text = await response.text();
      if (!text) return {} as T;
      return JSON.parse(text) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new NetworkError('Request timed out', 'kanidm', error);
      }
      if (
        error instanceof InvalidCredentialsError ||
        error instanceof AccessDeniedError ||
        error instanceof InvalidGrantError ||
        error instanceof InvalidClientError ||
        error instanceof UserNotFoundError ||
        error instanceof ProviderError
      ) {
        throw error;
      }
      throw new NetworkError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'kanidm',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Handle HTTP error responses.
   */
  private handleHttpError(
    status: number,
    data: Record<string, unknown>,
    rawBody: string,
  ): never {
    const error = data.error as string | undefined;
    const errorDescription =
      data.message || data.error_description || data.errorMessage || rawBody;

    switch (status) {
      case 400:
        if (error === 'invalid_grant') {
          throw new InvalidGrantError(errorDescription as string, 'kanidm');
        }
        if (error === 'invalid_client') {
          throw new InvalidClientError('kanidm');
        }
        throw new ProviderError(`Bad request: ${errorDescription}`, 'kanidm');

      case 401:
        throw new InvalidCredentialsError('kanidm');

      case 403:
        throw new AccessDeniedError(errorDescription as string, 'kanidm');

      case 404:
        throw new UserNotFoundError(undefined, 'kanidm');

      case 409:
        throw new UserAlreadyExistsError(undefined, 'kanidm');

      default:
        throw new ProviderError(
          `Kanidm error (${status}): ${errorDescription}`,
          'kanidm',
        );
    }
  }

  /**
   * Fetch and cache the OIDC discovery document.
   */
  private async fetchDiscoveryDocument(): Promise<OIDCDiscoveryDocument> {
    if (this.discoveryDocument) {
      return this.discoveryDocument;
    }

    const url = `${this.getOidcBaseUrl()}/.well-known/openid-configuration`;
    this.discoveryDocument = await this.request<OIDCDiscoveryDocument>(url);
    return this.discoveryDocument;
  }

  /**
   * Get JWKS for token validation.
   */
  private async getJWKS(): Promise<jose.JWTVerifyGetKey> {
    if (this.jwks) {
      return this.jwks;
    }

    const discovery = await this.fetchDiscoveryDocument();
    this.jwks = jose.createRemoteJWKSet(new URL(discovery.jwks_uri));
    return this.jwks;
  }

  /**
   * Authenticate with Kanidm's native API to get an admin token.
   * Uses the multi-step authentication flow.
   */
  private async getAdminToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.adminToken && Date.now() < this.adminTokenExpiry) {
      return this.adminToken;
    }

    if (!this.options.adminUsername || !this.options.adminPassword) {
      throw new ConfigurationError(
        'adminUsername and adminPassword are required for admin operations',
        'kanidm',
      );
    }

    const authUrl = `${this.getApiBaseUrl()}/auth`;

    // Step 1: Initialize auth
    const initResponse = await fetch(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step: {
          init2: {
            username: this.options.adminUsername,
            issue: 'token',
            privileged: true,
          },
        },
      }),
      signal: AbortSignal.timeout(this.options.timeout || 30000),
    });

    if (!initResponse.ok) {
      throw new InvalidCredentialsError('kanidm', {
        reason: 'Failed to initialize admin authentication',
      });
    }

    // Get session cookie from response
    const cookies = initResponse.headers.get('set-cookie');

    // Step 2: Begin password authentication
    const beginResponse = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body: JSON.stringify({
        step: {
          begin: 'password',
        },
      }),
      signal: AbortSignal.timeout(this.options.timeout || 30000),
    });

    if (!beginResponse.ok) {
      throw new InvalidCredentialsError('kanidm', {
        reason: 'Failed to begin password authentication',
      });
    }

    // Step 3: Provide password
    const credResponse = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookies ? { Cookie: cookies } : {}),
      },
      body: JSON.stringify({
        step: {
          cred: {
            password: this.options.adminPassword,
          },
        },
      }),
      signal: AbortSignal.timeout(this.options.timeout || 30000),
    });

    if (!credResponse.ok) {
      throw new InvalidCredentialsError('kanidm', {
        reason: 'Invalid admin credentials',
      });
    }

    const result = (await credResponse.json()) as {
      state?: { success?: string };
      token?: string;
    };

    // Extract token from response
    const token = result.state?.success || result.token;
    if (!token) {
      throw new ProviderError(
        'Failed to obtain admin token from Kanidm',
        'kanidm',
      );
    }

    this.adminToken = token;
    // Cache for 1 hour (Kanidm tokens typically last longer, but this is safe)
    this.adminTokenExpiry = Date.now() + 3600000;

    return this.adminToken;
  }

  // ---------------------------------------------------------------------------
  // AUTHENTICATION FLOWS
  // ---------------------------------------------------------------------------

  async getAuthorizationUrl(
    options?: AuthorizationOptions,
  ): Promise<AuthorizationResult> {
    const discovery = await this.fetchDiscoveryDocument();

    const state = options?.state || generateRandomString();
    const nonce = options?.nonce || generateRandomString();
    const scopes = options?.scopes ||
      this.options.scopes || ['openid', 'profile', 'email', 'groups'];
    const redirectUri = options?.redirectUri || this.options.redirectUri;

    if (!redirectUri) {
      throw new ConfigurationError('redirectUri is required', 'kanidm');
    }

    const params = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      nonce,
    });

    if (options?.prompt) {
      params.set('prompt', options.prompt);
    }

    if (options?.loginHint) {
      params.set('login_hint', options.loginHint);
    }

    // Add extra params
    if (options?.extraParams) {
      for (const [key, value] of Object.entries(options.extraParams)) {
        params.set(key, value);
      }
    }

    // PKCE is required by Kanidm
    const pkce = await generatePKCE();
    params.set('code_challenge', pkce.challenge);
    params.set('code_challenge_method', 'S256');

    const url = `${discovery.authorization_endpoint}?${params.toString()}`;

    return {
      url,
      state,
      nonce,
      codeVerifier: pkce.verifier,
    };
  }

  async exchangeCode(params: CodeExchangeParams): Promise<AuthResult> {
    const discovery = await this.fetchDiscoveryDocument();

    const redirectUri = params.redirectUri || this.options.redirectUri;
    if (!redirectUri) {
      throw new ConfigurationError('redirectUri is required', 'kanidm');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.options.clientId,
      code: params.code,
      redirect_uri: redirectUri,
    });

    if (this.options.clientSecret) {
      body.set('client_secret', this.options.clientSecret);
    }

    // Code verifier is required for PKCE
    if (params.codeVerifier) {
      body.set('code_verifier', params.codeVerifier);
    }

    const response = await this.request<{
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in: number;
      token_type: string;
      scope?: string;
    }>(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    // Decode ID token to get user ID
    let userId = '';
    if (response.id_token) {
      const payload = jose.decodeJwt(response.id_token);
      userId = payload.sub || '';
    }

    return {
      accessToken: response.access_token,
      tokenType: response.token_type || 'Bearer',
      expiresIn: response.expires_in,
      refreshToken: response.refresh_token,
      idToken: response.id_token,
      scope: response.scope,
      userId,
    };
  }

  async authenticate(_credentials: AuthCredentials): Promise<AuthResult> {
    // Kanidm only supports authorization_code grant for OAuth2
    // Direct authentication is not supported via OAuth2
    throw new NotImplementedError('authenticate', 'kanidm', {
      reason:
        'Kanidm only supports authorization code flow. Use getAuthorizationUrl() and exchangeCode() instead.',
    });
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const discovery = await this.fetchDiscoveryDocument();

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.options.clientId,
      refresh_token: refreshToken,
    });

    if (this.options.clientSecret) {
      body.set('client_secret', this.options.clientSecret);
    }

    const response = await this.request<{
      access_token: string;
      refresh_token?: string;
      id_token?: string;
      expires_in: number;
      token_type: string;
      scope?: string;
    }>(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    // Decode to get user ID
    let userId = '';
    if (response.access_token) {
      const payload = jose.decodeJwt(response.access_token);
      userId = payload.sub || '';
    }

    return {
      accessToken: response.access_token,
      tokenType: response.token_type || 'Bearer',
      expiresIn: response.expires_in,
      refreshToken: response.refresh_token || refreshToken,
      idToken: response.id_token,
      scope: response.scope,
      userId,
    };
  }

  async logout(options?: LogoutOptions): Promise<void> {
    const discovery = await this.fetchDiscoveryDocument();

    // Revoke refresh token if provided
    // Silently ignore failures - invalid tokens are effectively already revoked
    if (options?.refreshToken && discovery.revocation_endpoint) {
      const body = new URLSearchParams({
        client_id: this.options.clientId,
        token: options.refreshToken,
        token_type_hint: 'refresh_token',
      });

      if (this.options.clientSecret) {
        body.set('client_secret', this.options.clientSecret);
      }

      try {
        await this.request(discovery.revocation_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
      } catch {
        // Ignore revocation errors - token may already be invalid/revoked
      }
    }

    // Revoke access token if provided
    // Silently ignore failures - invalid tokens are effectively already revoked
    if (options?.token && discovery.revocation_endpoint) {
      const body = new URLSearchParams({
        client_id: this.options.clientId,
        token: options.token,
        token_type_hint: 'access_token',
      });

      if (this.options.clientSecret) {
        body.set('client_secret', this.options.clientSecret);
      }

      try {
        await this.request(discovery.revocation_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });
      } catch {
        // Ignore revocation errors - token may already be invalid/revoked
      }
    }
  }

  // ---------------------------------------------------------------------------
  // TOKEN OPERATIONS
  // ---------------------------------------------------------------------------

  async validateToken(
    token: string,
    options?: TokenValidationOptions,
  ): Promise<TokenClaims | null> {
    try {
      const jwks = await this.getJWKS();
      const discovery = await this.fetchDiscoveryDocument();

      const verifyOptions: jose.JWTVerifyOptions = {
        issuer: options?.issuer || discovery.issuer,
        clockTolerance: options?.clockTolerance || 0,
      };

      if (options?.audience) {
        verifyOptions.audience = options.audience;
      }

      const { payload } = await jose.jwtVerify(token, jwks, verifyOptions);

      // Check nonce if provided
      if (options?.nonce && payload.nonce !== options.nonce) {
        throw new InvalidNonceError('kanidm');
      }

      // Extract groups from Kanidm token structure
      // Kanidm uses 'groups' claim directly
      const groups = (payload.groups as string[]) || [];

      return {
        sub: payload.sub || '',
        iss: payload.iss || '',
        aud: payload.aud || '',
        exp: payload.exp || 0,
        iat: payload.iat || 0,
        nbf: payload.nbf,
        azp: payload.azp as string | undefined,
        email: payload.email as string | undefined,
        email_verified: payload.email_verified as boolean | undefined,
        preferred_username: payload.preferred_username as string | undefined,
        name: payload.name as string | undefined,
        roles: groups, // Map groups to roles for consistency
        ...payload,
      };
    } catch (error) {
      if (error instanceof jose.errors.JWTExpired) {
        throw new TokenExpiredError('kanidm');
      }
      if (error instanceof jose.errors.JWTClaimValidationFailed) {
        return null;
      }
      if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
        throw new InvalidTokenError('Invalid token signature', 'kanidm');
      }
      if (error instanceof InvalidNonceError) {
        throw error;
      }
      return null;
    }
  }

  decodeToken(token: string): TokenPayload {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new InvalidTokenError('Invalid JWT format', 'kanidm');
      }

      const header = JSON.parse(atob(parts[0]));
      const payload = jose.decodeJwt(token);

      return {
        header: {
          alg: header.alg,
          typ: header.typ,
          kid: header.kid,
        },
        payload: payload as unknown as TokenClaims,
        signature: parts[2],
      };
    } catch {
      throw new InvalidTokenError('Failed to decode token', 'kanidm');
    }
  }

  async introspectToken(token: string): Promise<TokenIntrospection> {
    const discovery = await this.fetchDiscoveryDocument();

    if (!discovery.introspection_endpoint) {
      // Fallback to local validation
      const claims = await this.validateToken(token);
      return {
        active: claims !== null,
        claims: claims || undefined,
      };
    }

    const body = new URLSearchParams({
      client_id: this.options.clientId,
      token,
    });

    if (this.options.clientSecret) {
      body.set('client_secret', this.options.clientSecret);
    }

    const response = await this.request<{
      active: boolean;
      sub?: string;
      iss?: string;
      aud?: string | string[];
      exp?: number;
      iat?: number;
      client_id?: string;
      scope?: string;
      token_type?: string;
      [key: string]: unknown;
    }>(discovery.introspection_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.active) {
      return { active: false };
    }

    return {
      active: true,
      claims: {
        sub: response.sub || '',
        iss: response.iss || '',
        aud: response.aud || '',
        exp: response.exp || 0,
        iat: response.iat || 0,
        ...response,
      },
      tokenType: response.token_type,
      clientId: response.client_id,
      scope: response.scope,
    };
  }

  // ---------------------------------------------------------------------------
  // USER OPERATIONS
  // ---------------------------------------------------------------------------

  async getProfile(tokenOrSession: string): Promise<UserProfile> {
    const discovery = await this.fetchDiscoveryDocument();

    const response = await this.request<{
      sub: string;
      preferred_username?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      groups?: string[];
      [key: string]: unknown;
    }>(discovery.userinfo_endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenOrSession}` },
    });

    return {
      id: response.sub,
      username: response.preferred_username,
      email: response.email,
      emailVerified: response.email_verified,
      firstName: response.given_name,
      lastName: response.family_name,
      displayName: response.name,
      picture: response.picture,
      groups: response.groups,
    };
  }

  async updateProfile(
    _tokenOrSession: string,
    _profile: Partial<UserProfile>,
  ): Promise<UserProfile> {
    // Kanidm doesn't expose profile update via OAuth2/OIDC
    throw new NotImplementedError('updateProfile', 'kanidm', {
      reason:
        'Profile updates are not supported via OAuth2. Use admin API with createUser/updateUser.',
    });
  }

  async getUser(userId: string, _adminToken?: string): Promise<UserProfile> {
    const token = await this.getAdminToken();

    const response = await this.request<KanidmPerson>(
      `${this.getApiBaseUrl()}/person/${userId}`,
      { method: 'GET' },
      token,
    );

    return this.mapKanidmPerson(response);
  }

  async createUser(
    user: CreateUserRequest,
    _adminToken: string,
  ): Promise<UserProfile> {
    const token = await this.getAdminToken();

    const kanidmPerson: Partial<KanidmPersonCreate> = {
      attrs: {
        name: [user.username],
        displayname: [
          user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.username,
        ],
      },
    };

    if (user.email && kanidmPerson.attrs) {
      kanidmPerson.attrs.mail = [user.email];
    }

    const response = await fetch(`${this.getApiBaseUrl()}/person`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(kanidmPerson),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 409) {
        throw new UserAlreadyExistsError(user.username, 'kanidm');
      }
      throw new ProviderError(`Failed to create user: ${errorBody}`, 'kanidm');
    }

    // Fetch the created user
    return this.getUser(user.username, token);
  }

  async updateUser(
    userId: string,
    updates: Partial<CreateUserRequest>,
    _adminToken: string,
  ): Promise<UserProfile> {
    const token = await this.getAdminToken();

    const attrs: Record<string, string[]> = {};

    if (updates.email !== undefined) {
      attrs.mail = [updates.email];
    }

    if (updates.firstName !== undefined || updates.lastName !== undefined) {
      const displayName =
        updates.firstName && updates.lastName
          ? `${updates.firstName} ${updates.lastName}`
          : updates.firstName || updates.lastName || '';
      if (displayName) {
        attrs.displayname = [displayName];
      }
    }

    await this.request(
      `${this.getApiBaseUrl()}/person/${userId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ attrs }),
      },
      token,
    );

    return this.getUser(userId, token);
  }

  async deleteUser(userId: string, _adminToken: string): Promise<void> {
    const token = await this.getAdminToken();

    await this.request(
      `${this.getApiBaseUrl()}/person/${userId}`,
      { method: 'DELETE' },
      token,
    );
  }

  async listUsers(
    query: UserQuery,
    _adminToken?: string,
  ): Promise<UserListResult> {
    const token = await this.getAdminToken();

    // Kanidm uses a different query format
    let url = `${this.getApiBaseUrl()}/person`;

    // Add search filter if provided
    // Note: Kanidm API may have different filtering capabilities
    const params = new URLSearchParams();
    if (query.search) {
      params.set('search', query.search);
    }

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    const response = await this.request<KanidmPerson[]>(
      url,
      { method: 'GET' },
      token,
    );

    const users = Array.isArray(response) ? response : [];

    // Apply client-side filtering and pagination
    let filteredUsers = users.map((u) => this.mapKanidmPerson(u));

    if (query.email) {
      filteredUsers = filteredUsers.filter((u) => u.email === query.email);
    }

    if (query.username) {
      filteredUsers = filteredUsers.filter(
        (u) => u.username === query.username,
      );
    }

    const total = filteredUsers.length;
    const offset = query.offset || 0;
    const limit = query.limit || 100;

    return {
      users: filteredUsers.slice(offset, offset + limit),
      total,
      limit,
      offset,
    };
  }

  async requestPasswordReset(_email: string): Promise<void> {
    throw new NotImplementedError('requestPasswordReset', 'kanidm', {
      reason: 'Password reset is not exposed via Kanidm API',
    });
  }

  async resetPassword(_token: string, _newPassword: string): Promise<void> {
    throw new NotImplementedError('resetPassword', 'kanidm', {
      reason: 'Password reset is not exposed via Kanidm API',
    });
  }

  // ---------------------------------------------------------------------------
  // SESSION OPERATIONS
  // ---------------------------------------------------------------------------

  async listSessions(
    _userId: string,
    _adminToken?: string,
  ): Promise<Session[]> {
    throw new NotImplementedError('listSessions', 'kanidm', {
      reason: 'Session management is not exposed via Kanidm API',
    });
  }

  async revokeSession(_sessionId: string, _adminToken?: string): Promise<void> {
    throw new NotImplementedError('revokeSession', 'kanidm', {
      reason: 'Session management is not exposed via Kanidm API',
    });
  }

  async revokeAllSessions(
    _userId: string,
    _adminToken?: string,
  ): Promise<void> {
    throw new NotImplementedError('revokeAllSessions', 'kanidm', {
      reason: 'Session management is not exposed via Kanidm API',
    });
  }

  // ---------------------------------------------------------------------------
  // AUTHORIZATION
  // ---------------------------------------------------------------------------

  async hasRole(tokenOrUserId: string, role: string): Promise<boolean> {
    const roles = await this.getRoles(tokenOrUserId);
    return roles.includes(role);
  }

  async hasPermission(
    tokenOrUserId: string,
    permission: string,
    resource?: string,
  ): Promise<boolean> {
    // Check if the user has a group matching the permission
    const roles = await this.getRoles(tokenOrUserId);
    const permissionRole = resource ? `${resource}:${permission}` : permission;
    return roles.includes(permissionRole) || roles.includes(permission);
  }

  async getRoles(
    tokenOrUserId: string,
    _adminToken?: string,
  ): Promise<string[]> {
    // First try to decode as JWT
    try {
      const claims = await this.validateToken(tokenOrUserId);
      if (claims) {
        return claims.roles || [];
      }
    } catch {
      // Not a valid token
    }

    // Try to get user and return their groups
    try {
      const user = await this.getUser(tokenOrUserId);
      return user.groups || [];
    } catch {
      // User not found or other error
    }

    return [];
  }

  async assignRole(
    _userId: string,
    _role: string,
    _adminToken: string,
  ): Promise<void> {
    throw new NotImplementedError('assignRole', 'kanidm', {
      reason:
        'Role assignment via API requires group management. Use Kanidm CLI to add users to groups.',
    });
  }

  async removeRole(
    _userId: string,
    _role: string,
    _adminToken: string,
  ): Promise<void> {
    throw new NotImplementedError('removeRole', 'kanidm', {
      reason:
        'Role removal via API requires group management. Use Kanidm CLI to remove users from groups.',
    });
  }

  // ---------------------------------------------------------------------------
  // PROVIDER INFORMATION
  // ---------------------------------------------------------------------------

  async getCapabilities(): Promise<AuthCapabilities> {
    return {
      authorizationCode: true,
      passwordGrant: false, // Not supported
      clientCredentials: false, // Not supported
      tokenRefresh: true,
      oidc: true,
      userManagement: true, // Via /v1/person API
      sessionManagement: false, // Not exposed
      rbac: true, // Via groups claim
      passwordReset: false, // Not exposed via API
      mfa: true, // Webauthn/passkeys supported
      socialLogin: false,
      federation: true,
      decentralized: false,
    };
  }

  async getDiscoveryDocument(): Promise<OIDCDiscoveryDocument | null> {
    return this.fetchDiscoveryDocument();
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  private mapKanidmPerson(person: KanidmPerson): UserProfile {
    const attrs = person.attrs || {};

    return {
      id: attrs.uuid?.[0] || attrs.name?.[0] || '',
      username: attrs.name?.[0],
      email: attrs.mail?.[0],
      displayName: attrs.displayname?.[0],
      groups: attrs.memberof,
      enabled: true, // Kanidm doesn't expose this directly
    };
  }
}

// ---------------------------------------------------------------------------
// KANIDM API TYPES
// ---------------------------------------------------------------------------

interface KanidmPerson {
  attrs: {
    uuid?: string[];
    name?: string[];
    displayname?: string[];
    mail?: string[];
    memberof?: string[];
    [key: string]: string[] | undefined;
  };
}

interface KanidmPersonCreate {
  attrs: {
    name: string[];
    displayname?: string[];
    mail?: string[];
    [key: string]: string[] | undefined;
  };
}
