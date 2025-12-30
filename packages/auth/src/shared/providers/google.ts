/**
 * Google Provider - OAuth2/OIDC Authentication
 *
 * Implements OAuth2/OIDC authentication with Google including:
 * - OIDC Discovery
 * - Authorization Code Flow with PKCE
 * - Token validation using JWKS (RS256)
 * - ID token claims extraction
 */

import * as jose from 'jose';

import {
  AccessDeniedError,
  ConfigurationError,
  InvalidClientError,
  InvalidGrantError,
  InvalidNonceError,
  InvalidTokenError,
  NetworkError,
  NotImplementedError,
  ProviderError,
  TokenExpiredError,
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
  GoogleOptions,
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
 * Google authentication provider.
 *
 * Implements OAuth2/OIDC authentication with Google.
 * Uses standard OIDC discovery and PKCE for security.
 */
export class GoogleProvider implements AuthInterface {
  private options: Required<Pick<GoogleOptions, 'clientId'>> & GoogleOptions;
  private discoveryDocument: OIDCDiscoveryDocument | null = null;
  private jwks: jose.JWTVerifyGetKey | null = null;

  private static readonly DISCOVERY_URL =
    'https://accounts.google.com/.well-known/openid-configuration';

  constructor(options: GoogleOptions) {
    if (!options.clientId) {
      throw new ConfigurationError('clientId is required', 'google');
    }
    if (!options.clientSecret) {
      throw new ConfigurationError('clientSecret is required', 'google');
    }

    this.options = {
      usePKCE: true,
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
        throw new NetworkError('Request timed out', 'google', error);
      }
      if (
        error instanceof AccessDeniedError ||
        error instanceof InvalidGrantError ||
        error instanceof InvalidClientError ||
        error instanceof ProviderError
      ) {
        throw error;
      }
      throw new NetworkError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'google',
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
    const errorDescription = data.error_description || data.message || rawBody;

    switch (status) {
      case 400:
        if (error === 'invalid_grant') {
          throw new InvalidGrantError(errorDescription as string, 'google');
        }
        if (error === 'invalid_client') {
          throw new InvalidClientError('google');
        }
        throw new ProviderError(`Bad request: ${errorDescription}`, 'google');

      case 401:
        throw new InvalidClientError('google');

      case 403:
        throw new AccessDeniedError(errorDescription as string, 'google');

      default:
        throw new ProviderError(
          `Google error (${status}): ${errorDescription}`,
          'google',
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

    this.discoveryDocument = await this.request<OIDCDiscoveryDocument>(
      GoogleProvider.DISCOVERY_URL,
    );
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
      throw new ConfigurationError('redirectUri is required', 'google');
    }

    const params = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      nonce,
      access_type: 'offline', // Request refresh token
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

    // PKCE
    let codeVerifier: string | undefined;
    if (this.options.usePKCE !== false) {
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
      throw new ConfigurationError('redirectUri is required', 'google');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret!,
      code: params.code,
      redirect_uri: redirectUri,
    });

    // Code verifier for PKCE
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
    throw new NotImplementedError('authenticate', 'google', {
      reason:
        'Google only supports authorization code flow. Use getAuthorizationUrl() and exchangeCode() instead.',
    });
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const discovery = await this.fetchDiscoveryDocument();

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret!,
      refresh_token: refreshToken,
    });

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
    if (response.id_token) {
      const payload = jose.decodeJwt(response.id_token);
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
    // Google uses token revocation endpoint
    if (options?.token) {
      try {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${options.token}`,
          { method: 'POST' },
        );
      } catch {
        // Ignore revocation errors
      }
    }

    if (options?.refreshToken) {
      try {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${options.refreshToken}`,
          { method: 'POST' },
        );
      } catch {
        // Ignore revocation errors
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

      // Google tokens can have 'accounts.google.com' or 'https://accounts.google.com' as issuer
      if (!options?.issuer) {
        verifyOptions.issuer = [
          'https://accounts.google.com',
          'accounts.google.com',
        ];
      }

      if (options?.audience) {
        verifyOptions.audience = options.audience;
      }

      const { payload } = await jose.jwtVerify(token, jwks, verifyOptions);

      // Check nonce if provided
      if (options?.nonce && payload.nonce !== options.nonce) {
        throw new InvalidNonceError('google');
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
        name: payload.name as string | undefined,
        picture: payload.picture as string | undefined,
        given_name: payload.given_name as string | undefined,
        family_name: payload.family_name as string | undefined,
        locale: payload.locale as string | undefined,
        ...payload,
      };
    } catch (error) {
      if (error instanceof jose.errors.JWTExpired) {
        throw new TokenExpiredError('google');
      }
      if (error instanceof jose.errors.JWTClaimValidationFailed) {
        return null;
      }
      if (error instanceof jose.errors.JWSSignatureVerificationFailed) {
        throw new InvalidTokenError('Invalid token signature', 'google');
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
        throw new InvalidTokenError('Invalid JWT format', 'google');
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
      throw new InvalidTokenError('Failed to decode token', 'google');
    }
  }

  async introspectToken(token: string): Promise<TokenIntrospection> {
    // Google doesn't have a public introspection endpoint
    // Fall back to local validation
    const claims = await this.validateToken(token);
    return {
      active: claims !== null,
      claims: claims || undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // USER OPERATIONS
  // ---------------------------------------------------------------------------

  async getProfile(tokenOrSession: string): Promise<UserProfile> {
    const response = await this.request<{
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      given_name?: string;
      family_name?: string;
      picture?: string;
      locale?: string;
    }>(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      { method: 'GET' },
      tokenOrSession,
    );

    return {
      id: response.sub,
      email: response.email,
      emailVerified: response.email_verified,
      firstName: response.given_name,
      lastName: response.family_name,
      displayName: response.name,
      picture: response.picture,
    };
  }

  async updateProfile(
    _tokenOrSession: string,
    _profile: Partial<UserProfile>,
  ): Promise<UserProfile> {
    throw new NotImplementedError('updateProfile', 'google', {
      reason: 'Google does not support profile updates via OAuth2',
    });
  }

  async getUser(_userId: string, _adminToken?: string): Promise<UserProfile> {
    throw new NotImplementedError('getUser', 'google', {
      reason: 'Google does not expose admin user management',
    });
  }

  async createUser(
    _user: CreateUserRequest,
    _adminToken: string,
  ): Promise<UserProfile> {
    throw new NotImplementedError('createUser', 'google', {
      reason: 'Google does not expose user creation',
    });
  }

  async updateUser(
    _userId: string,
    _updates: Partial<CreateUserRequest>,
    _adminToken: string,
  ): Promise<UserProfile> {
    throw new NotImplementedError('updateUser', 'google', {
      reason: 'Google does not expose user management',
    });
  }

  async deleteUser(_userId: string, _adminToken: string): Promise<void> {
    throw new NotImplementedError('deleteUser', 'google', {
      reason: 'Google does not expose user management',
    });
  }

  async listUsers(
    _query: UserQuery,
    _adminToken?: string,
  ): Promise<UserListResult> {
    throw new NotImplementedError('listUsers', 'google', {
      reason: 'Google does not expose user listing',
    });
  }

  async requestPasswordReset(_email: string): Promise<void> {
    throw new NotImplementedError('requestPasswordReset', 'google', {
      reason: 'Password management is handled by Google',
    });
  }

  async resetPassword(_token: string, _newPassword: string): Promise<void> {
    throw new NotImplementedError('resetPassword', 'google', {
      reason: 'Password management is handled by Google',
    });
  }

  // ---------------------------------------------------------------------------
  // SESSION OPERATIONS
  // ---------------------------------------------------------------------------

  async listSessions(
    _userId: string,
    _adminToken?: string,
  ): Promise<Session[]> {
    throw new NotImplementedError('listSessions', 'google', {
      reason: 'Session management is handled by Google',
    });
  }

  async revokeSession(_sessionId: string, _adminToken?: string): Promise<void> {
    throw new NotImplementedError('revokeSession', 'google', {
      reason: 'Session management is handled by Google',
    });
  }

  async revokeAllSessions(
    _userId: string,
    _adminToken?: string,
  ): Promise<void> {
    throw new NotImplementedError('revokeAllSessions', 'google', {
      reason: 'Session management is handled by Google',
    });
  }

  // ---------------------------------------------------------------------------
  // AUTHORIZATION
  // ---------------------------------------------------------------------------

  async hasRole(_tokenOrUserId: string, _role: string): Promise<boolean> {
    // Google doesn't have a concept of roles in OAuth
    return false;
  }

  async hasPermission(
    _tokenOrUserId: string,
    _permission: string,
    _resource?: string,
  ): Promise<boolean> {
    return false;
  }

  async getRoles(
    _tokenOrUserId: string,
    _adminToken?: string,
  ): Promise<string[]> {
    return [];
  }

  async assignRole(
    _userId: string,
    _role: string,
    _adminToken: string,
  ): Promise<void> {
    throw new NotImplementedError('assignRole', 'google', {
      reason: 'Google does not support role management',
    });
  }

  async removeRole(
    _userId: string,
    _role: string,
    _adminToken: string,
  ): Promise<void> {
    throw new NotImplementedError('removeRole', 'google', {
      reason: 'Google does not support role management',
    });
  }

  // ---------------------------------------------------------------------------
  // PROVIDER INFORMATION
  // ---------------------------------------------------------------------------

  async getCapabilities(): Promise<AuthCapabilities> {
    return {
      authorizationCode: true,
      passwordGrant: false,
      clientCredentials: false,
      tokenRefresh: true,
      oidc: true,
      userManagement: false,
      sessionManagement: false,
      rbac: false,
      passwordReset: false,
      mfa: true, // Google supports 2FA
      socialLogin: true,
      federation: false,
      decentralized: false,
    };
  }

  async getDiscoveryDocument(): Promise<OIDCDiscoveryDocument | null> {
    return this.fetchDiscoveryDocument();
  }
}
