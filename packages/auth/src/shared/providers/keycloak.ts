/**
 * Keycloak Provider - OIDC/OAuth2 Authentication
 *
 * Implements full OIDC/OAuth2 authentication with Keycloak server including:
 * - OIDC Discovery
 * - Authorization Code Flow with PKCE
 * - Token validation using JWKS
 * - Token introspection
 * - User management via Admin API
 * - Session management
 */

import * as jose from 'jose';

import {
  AccessDeniedError,
  ConfigurationError,
  InvalidClientError,
  InvalidCredentialsError,
  InvalidGrantError,
  InvalidNonceError,
  InvalidRedirectUriError,
  InvalidStateError,
  InvalidTokenError,
  MfaRequiredError,
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
  KeycloakOptions,
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
 * Keycloak authentication provider.
 *
 * Implements full OIDC/OAuth2 authentication with Keycloak server.
 */
export class KeycloakProvider implements AuthInterface {
  private options: Required<
    Pick<KeycloakOptions, 'serverUrl' | 'realm' | 'clientId'>
  > &
    KeycloakOptions;
  private discoveryDocument: OIDCDiscoveryDocument | null = null;
  private jwks: jose.JWTVerifyGetKey | null = null;

  constructor(options: KeycloakOptions) {
    if (!options.serverUrl) {
      throw new ConfigurationError('serverUrl is required', 'keycloak');
    }
    if (!options.realm) {
      throw new ConfigurationError('realm is required', 'keycloak');
    }
    if (!options.clientId) {
      throw new ConfigurationError('clientId is required', 'keycloak');
    }

    this.options = {
      usePKCE: true,
      verifySsl: true,
      scopes: ['openid', 'profile', 'email'],
      timeout: 30000,
      maxRetries: 3,
      ...options,
    };
  }

  // ---------------------------------------------------------------------------
  // INTERNAL HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Get the base URL for the realm.
   */
  private getRealmUrl(): string {
    return `${this.options.serverUrl}/realms/${this.options.realm}`;
  }

  /**
   * Get the admin API base URL.
   */
  private getAdminUrl(): string {
    return `${this.options.serverUrl}/admin/realms/${this.options.realm}`;
  }

  /**
   * Make an HTTP request with error handling.
   */
  private async request<T>(
    url: string,
    options: RequestInit = {},
    adminToken?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.options.headers,
      ...(options.headers as Record<string, string>),
    };

    if (adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
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
        throw new NetworkError('Request timed out', 'keycloak', error);
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
        'keycloak',
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
      data.errorMessage || data.error_description || rawBody;

    switch (status) {
      case 400:
        if (error === 'invalid_grant') {
          throw new InvalidGrantError(errorDescription as string, 'keycloak');
        }
        if (error === 'invalid_client') {
          throw new InvalidClientError('keycloak');
        }
        throw new ProviderError(`Bad request: ${errorDescription}`, 'keycloak');

      case 401:
        throw new InvalidCredentialsError('keycloak');

      case 403:
        throw new AccessDeniedError(errorDescription as string, 'keycloak');

      case 404:
        throw new UserNotFoundError(undefined, 'keycloak');

      case 409:
        throw new UserAlreadyExistsError(undefined, 'keycloak');

      default:
        throw new ProviderError(
          `Keycloak error (${status}): ${errorDescription}`,
          'keycloak',
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

    const url = `${this.getRealmUrl()}/.well-known/openid-configuration`;
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
      this.options.scopes || ['openid', 'profile', 'email'];
    const redirectUri = options?.redirectUri || this.options.redirectUri;

    if (!redirectUri) {
      throw new ConfigurationError('redirectUri is required', 'keycloak');
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

    let codeVerifier: string | undefined;
    if (this.options.usePKCE) {
      const pkce = await generatePKCE();
      codeVerifier = pkce.verifier;
      params.set('code_challenge', pkce.challenge);
      params.set('code_challenge_method', 'S256');
    }

    const url = `${discovery.authorization_endpoint}?${params.toString()}`;

    return {
      url,
      state,
      nonce,
      codeVerifier,
    };
  }

  async exchangeCode(params: CodeExchangeParams): Promise<AuthResult> {
    const discovery = await this.fetchDiscoveryDocument();

    const redirectUri = params.redirectUri || this.options.redirectUri;
    if (!redirectUri) {
      throw new ConfigurationError('redirectUri is required', 'keycloak');
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

  async authenticate(credentials: AuthCredentials): Promise<AuthResult> {
    const discovery = await this.fetchDiscoveryDocument();
    const grantType = credentials.grantType || 'password';

    const scopes = credentials.scopes ||
      this.options.scopes || ['openid', 'profile', 'email'];
    const body = new URLSearchParams({
      grant_type: grantType,
      client_id: this.options.clientId,
      scope: scopes.join(' '),
    });

    if (grantType === 'client_credentials') {
      // Client credentials grant - requires client secret
      if (!this.options.clientSecret) {
        throw new InvalidCredentialsError('keycloak', {
          reason: 'Client secret is required for client_credentials grant',
        });
      }
      body.set('client_secret', this.options.clientSecret);
    } else {
      // Password grant - requires username and password
      if (!credentials.username || !credentials.password) {
        throw new InvalidCredentialsError('keycloak', {
          reason: 'Username and password are required',
        });
      }
      body.set('username', credentials.username);
      body.set('password', credentials.password);

      if (this.options.clientSecret) {
        body.set('client_secret', this.options.clientSecret);
      }

      // Add MFA code if provided
      if (credentials.mfaCode) {
        body.set('totp', credentials.mfaCode);
      }
    }

    try {
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
      } else if (response.access_token) {
        const payload = jose.decodeJwt(response.access_token);
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
    } catch (error) {
      // Check for MFA required
      if (
        error instanceof ProviderError &&
        error.message.includes('invalid_grant') &&
        error.message.includes('totp')
      ) {
        throw new MfaRequiredError('keycloak', ['totp']);
      }
      throw error;
    }
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

    if (!discovery.end_session_endpoint) {
      // Just revoke the token if no end_session_endpoint
      if (options?.refreshToken && discovery.revocation_endpoint) {
        await this.request(discovery.revocation_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: this.options.clientId,
            token: options.refreshToken,
            token_type_hint: 'refresh_token',
          }).toString(),
        });
      }
      return;
    }

    const params = new URLSearchParams({
      client_id: this.options.clientId,
    });

    if (options?.token) {
      params.set('id_token_hint', options.token);
    }

    if (options?.postLogoutRedirectUri) {
      params.set('post_logout_redirect_uri', options.postLogoutRedirectUri);
    }

    // For logout, we typically redirect the user, but for server-side we can POST
    if (options?.refreshToken && discovery.revocation_endpoint) {
      const revokeParams = new URLSearchParams({
        client_id: this.options.clientId,
        token: options.refreshToken,
        token_type_hint: 'refresh_token',
      });
      if (this.options.clientSecret) {
        revokeParams.set('client_secret', this.options.clientSecret);
      }
      await this.request(discovery.revocation_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: revokeParams.toString(),
      });
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
        throw new InvalidNonceError('keycloak');
      }

      // Extract roles from Keycloak token structure
      const roles: string[] = [];

      // Realm roles
      if (payload.realm_access && typeof payload.realm_access === 'object') {
        const realmAccess = payload.realm_access as { roles?: string[] };
        if (realmAccess.roles) {
          roles.push(...realmAccess.roles);
        }
      }

      // Client roles
      if (
        payload.resource_access &&
        typeof payload.resource_access === 'object'
      ) {
        const resourceAccess = payload.resource_access as Record<
          string,
          { roles?: string[] }
        >;
        for (const client of Object.values(resourceAccess)) {
          if (client.roles) {
            roles.push(...client.roles);
          }
        }
      }

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
        roles,
        ...payload,
      };
    } catch (error) {
      if (error instanceof jose.errors.JWTExpired) {
        throw new TokenExpiredError('keycloak');
      }
      if (error instanceof jose.errors.JWTClaimValidationFailed) {
        return null;
      }
      if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
        throw new InvalidTokenError('Invalid token signature', 'keycloak');
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
        throw new InvalidTokenError('Invalid JWT format', 'keycloak');
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
      throw new InvalidTokenError('Failed to decode token', 'keycloak');
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
    };
  }

  async updateProfile(
    tokenOrSession: string,
    profile: Partial<UserProfile>,
  ): Promise<UserProfile> {
    // Get user ID from token
    const payload = jose.decodeJwt(tokenOrSession);
    const userId = payload.sub;

    if (!userId) {
      throw new InvalidTokenError('Token does not contain user ID', 'keycloak');
    }

    // Update via Account API (requires account-api feature in Keycloak)
    const accountUrl = `${this.getRealmUrl()}/account`;

    const updateData: Record<string, unknown> = {};
    if (profile.firstName !== undefined)
      updateData.firstName = profile.firstName;
    if (profile.lastName !== undefined) updateData.lastName = profile.lastName;
    if (profile.email !== undefined) updateData.email = profile.email;

    await this.request(accountUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenOrSession}` },
      body: JSON.stringify(updateData),
    });

    return this.getProfile(tokenOrSession);
  }

  async getUser(userId: string, adminToken?: string): Promise<UserProfile> {
    if (!adminToken) {
      throw new AccessDeniedError('Admin token required', 'keycloak');
    }

    const response = await this.request<KeycloakUser>(
      `${this.getAdminUrl()}/users/${userId}`,
      { method: 'GET' },
      adminToken,
    );

    return this.mapKeycloakUser(response);
  }

  async createUser(
    user: CreateUserRequest,
    adminToken: string,
  ): Promise<UserProfile> {
    const keycloakUser: Partial<KeycloakUser> = {
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      enabled: user.enabled ?? true,
      emailVerified: user.emailVerified ?? false,
      attributes: user.attributes as Record<string, string[]>,
    };

    if (user.password) {
      keycloakUser.credentials = [
        {
          type: 'password',
          value: user.password,
          temporary: false,
        },
      ];
    }

    const response = await fetch(`${this.getAdminUrl()}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(keycloakUser),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      if (response.status === 409) {
        throw new UserAlreadyExistsError(user.username, 'keycloak');
      }
      throw new ProviderError(
        `Failed to create user: ${errorBody}`,
        'keycloak',
      );
    }

    // Get the created user ID from Location header
    const location = response.headers.get('Location');
    if (!location) {
      throw new ProviderError('Failed to get created user ID', 'keycloak');
    }

    const userId = location.split('/').pop()!;

    // Assign roles if provided
    if (user.roles?.length) {
      await this.assignRoles(userId, user.roles, adminToken);
    }

    // Assign groups if provided
    if (user.groups?.length) {
      for (const groupName of user.groups) {
        await this.addUserToGroup(userId, groupName, adminToken);
      }
    }

    return this.getUser(userId, adminToken);
  }

  async updateUser(
    userId: string,
    updates: Partial<CreateUserRequest>,
    adminToken: string,
  ): Promise<UserProfile> {
    const keycloakUser: Partial<KeycloakUser> = {};

    if (updates.username !== undefined)
      keycloakUser.username = updates.username;
    if (updates.email !== undefined) keycloakUser.email = updates.email;
    if (updates.firstName !== undefined)
      keycloakUser.firstName = updates.firstName;
    if (updates.lastName !== undefined)
      keycloakUser.lastName = updates.lastName;
    if (updates.enabled !== undefined) keycloakUser.enabled = updates.enabled;
    if (updates.emailVerified !== undefined)
      keycloakUser.emailVerified = updates.emailVerified;
    if (updates.attributes !== undefined) {
      keycloakUser.attributes = updates.attributes as Record<string, string[]>;
    }

    await this.request(
      `${this.getAdminUrl()}/users/${userId}`,
      {
        method: 'PUT',
        body: JSON.stringify(keycloakUser),
      },
      adminToken,
    );

    // Update password if provided
    if (updates.password) {
      await this.request(
        `${this.getAdminUrl()}/users/${userId}/reset-password`,
        {
          method: 'PUT',
          body: JSON.stringify({
            type: 'password',
            value: updates.password,
            temporary: false,
          }),
        },
        adminToken,
      );
    }

    return this.getUser(userId, adminToken);
  }

  async deleteUser(userId: string, adminToken: string): Promise<void> {
    await this.request(
      `${this.getAdminUrl()}/users/${userId}`,
      { method: 'DELETE' },
      adminToken,
    );
  }

  async listUsers(
    query: UserQuery,
    adminToken?: string,
  ): Promise<UserListResult> {
    if (!adminToken) {
      throw new AccessDeniedError('Admin token required', 'keycloak');
    }

    const params = new URLSearchParams();

    if (query.search) params.set('search', query.search);
    if (query.email) params.set('email', query.email);
    if (query.username) params.set('username', query.username);
    if (query.enabled !== undefined)
      params.set('enabled', String(query.enabled));
    if (query.limit) params.set('max', String(query.limit));
    if (query.offset) params.set('first', String(query.offset));

    const users = await this.request<KeycloakUser[]>(
      `${this.getAdminUrl()}/users?${params.toString()}`,
      { method: 'GET' },
      adminToken,
    );

    // Get total count
    const countResponse = await this.request<number>(
      `${this.getAdminUrl()}/users/count?${params.toString()}`,
      { method: 'GET' },
      adminToken,
    );

    return {
      users: users.map((u) => this.mapKeycloakUser(u)),
      total: countResponse,
      limit: query.limit || 100,
      offset: query.offset || 0,
    };
  }

  async requestPasswordReset(email: string): Promise<void> {
    // This requires admin privileges or self-service password reset configured
    // We'll use the execute-actions-email endpoint
    throw new NotImplementedError('requestPasswordReset', 'keycloak', {
      reason:
        'Requires admin token or use Keycloak login page for self-service reset',
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Password reset via token is handled by Keycloak's login flow
    throw new NotImplementedError('resetPassword', 'keycloak', {
      reason: 'Password reset is handled by Keycloak login flow',
    });
  }

  // ---------------------------------------------------------------------------
  // SESSION OPERATIONS
  // ---------------------------------------------------------------------------

  async listSessions(userId: string, adminToken?: string): Promise<Session[]> {
    if (!adminToken) {
      throw new AccessDeniedError('Admin token required', 'keycloak');
    }

    const sessions = await this.request<KeycloakSession[]>(
      `${this.getAdminUrl()}/users/${userId}/sessions`,
      { method: 'GET' },
      adminToken,
    );

    return sessions.map((s) => ({
      id: s.id,
      userId: s.userId,
      clientId: s.clients ? Object.keys(s.clients).join(', ') : undefined,
      startedAt: new Date(s.start),
      lastAccessedAt: new Date(s.lastAccess),
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
    }));
  }

  async revokeSession(sessionId: string, adminToken?: string): Promise<void> {
    if (!adminToken) {
      throw new AccessDeniedError('Admin token required', 'keycloak');
    }

    await this.request(
      `${this.getAdminUrl()}/sessions/${sessionId}`,
      { method: 'DELETE' },
      adminToken,
    );
  }

  async revokeAllSessions(userId: string, adminToken?: string): Promise<void> {
    if (!adminToken) {
      throw new AccessDeniedError('Admin token required', 'keycloak');
    }

    await this.request(
      `${this.getAdminUrl()}/users/${userId}/logout`,
      { method: 'POST' },
      adminToken,
    );
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
    // Keycloak permissions are typically checked via the Authorization Services API
    // For now, we check if the user has a role matching the permission
    // A full implementation would use the entitlement API
    const roles = await this.getRoles(tokenOrUserId);
    const permissionRole = resource ? `${resource}:${permission}` : permission;
    return roles.includes(permissionRole) || roles.includes(permission);
  }

  async getRoles(
    tokenOrUserId: string,
    adminToken?: string,
  ): Promise<string[]> {
    // First try to decode as JWT
    try {
      const claims = await this.validateToken(tokenOrUserId);
      if (claims) {
        return claims.roles || [];
      }
    } catch {
      // Not a valid token, might be a user ID
    }

    // If admin token provided, try to fetch roles by user ID
    if (adminToken) {
      try {
        const roleMappings = await this.request<{
          realmMappings?: { name: string }[];
        }>(
          `${this.getAdminUrl()}/users/${tokenOrUserId}/role-mappings`,
          { method: 'GET' },
          adminToken,
        );

        return roleMappings.realmMappings?.map((r) => r.name) || [];
      } catch {
        // User ID not found or other error
      }
    }

    return [];
  }

  async assignRole(
    userId: string,
    role: string,
    adminToken: string,
  ): Promise<void> {
    // First, get the role
    const roles = await this.request<KeycloakRole[]>(
      `${this.getAdminUrl()}/roles`,
      { method: 'GET' },
      adminToken,
    );

    const roleObj = roles.find((r) => r.name === role);
    if (!roleObj) {
      throw new ProviderError(`Role not found: ${role}`, 'keycloak');
    }

    await this.request(
      `${this.getAdminUrl()}/users/${userId}/role-mappings/realm`,
      {
        method: 'POST',
        body: JSON.stringify([roleObj]),
      },
      adminToken,
    );
  }

  async removeRole(
    userId: string,
    role: string,
    adminToken: string,
  ): Promise<void> {
    // First, get the role
    const roles = await this.request<KeycloakRole[]>(
      `${this.getAdminUrl()}/roles`,
      { method: 'GET' },
      adminToken,
    );

    const roleObj = roles.find((r) => r.name === role);
    if (!roleObj) {
      throw new ProviderError(`Role not found: ${role}`, 'keycloak');
    }

    await this.request(
      `${this.getAdminUrl()}/users/${userId}/role-mappings/realm`,
      {
        method: 'DELETE',
        body: JSON.stringify([roleObj]),
      },
      adminToken,
    );
  }

  // ---------------------------------------------------------------------------
  // PROVIDER INFORMATION
  // ---------------------------------------------------------------------------

  async getCapabilities(): Promise<AuthCapabilities> {
    return {
      authorizationCode: true,
      passwordGrant: true,
      clientCredentials: true,
      tokenRefresh: true,
      oidc: true,
      userManagement: true,
      sessionManagement: true,
      rbac: true,
      passwordReset: true,
      mfa: true,
      socialLogin: true,
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

  private mapKeycloakUser(user: KeycloakUser): UserProfile {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: user.emailVerified,
      firstName: user.firstName,
      lastName: user.lastName,
      displayName:
        user.firstName && user.lastName
          ? `${user.firstName} ${user.lastName}`
          : user.username,
      enabled: user.enabled,
      createdAt: user.createdTimestamp
        ? new Date(user.createdTimestamp)
        : undefined,
      attributes: user.attributes,
      groups: user.groups,
    };
  }

  private async assignRoles(
    userId: string,
    roleNames: string[],
    adminToken: string,
  ): Promise<void> {
    const allRoles = await this.request<KeycloakRole[]>(
      `${this.getAdminUrl()}/roles`,
      { method: 'GET' },
      adminToken,
    );

    const rolesToAssign = allRoles.filter((r) => roleNames.includes(r.name));

    if (rolesToAssign.length > 0) {
      await this.request(
        `${this.getAdminUrl()}/users/${userId}/role-mappings/realm`,
        {
          method: 'POST',
          body: JSON.stringify(rolesToAssign),
        },
        adminToken,
      );
    }
  }

  private async addUserToGroup(
    userId: string,
    groupName: string,
    adminToken: string,
  ): Promise<void> {
    // Get group by name
    const groups = await this.request<KeycloakGroup[]>(
      `${this.getAdminUrl()}/groups?search=${encodeURIComponent(groupName)}`,
      { method: 'GET' },
      adminToken,
    );

    const group = groups.find((g) => g.name === groupName);
    if (!group) {
      throw new ProviderError(`Group not found: ${groupName}`, 'keycloak');
    }

    await this.request(
      `${this.getAdminUrl()}/users/${userId}/groups/${group.id}`,
      { method: 'PUT' },
      adminToken,
    );
  }
}

// ---------------------------------------------------------------------------
// KEYCLOAK API TYPES
// ---------------------------------------------------------------------------

interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
  emailVerified?: boolean;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  createdTimestamp?: number;
  attributes?: Record<string, string[]>;
  groups?: string[];
  credentials?: Array<{
    type: string;
    value: string;
    temporary?: boolean;
  }>;
}

interface KeycloakSession {
  id: string;
  userId: string;
  username: string;
  start: number;
  lastAccess: number;
  ipAddress?: string;
  userAgent?: string;
  clients?: Record<string, string>;
}

interface KeycloakRole {
  id: string;
  name: string;
  description?: string;
  composite?: boolean;
  clientRole?: boolean;
  containerId?: string;
}

interface KeycloakGroup {
  id: string;
  name: string;
  path?: string;
  subGroups?: KeycloakGroup[];
}
