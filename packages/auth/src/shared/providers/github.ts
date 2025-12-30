/**
 * GitHub Provider - OAuth2 Authentication
 *
 * Implements OAuth2 authentication with GitHub.
 * Note: GitHub does NOT support full OIDC (no id_token).
 * User info must be fetched via GitHub API.
 */

import {
  AccessDeniedError,
  ConfigurationError,
  InvalidClientError,
  InvalidGrantError,
  InvalidTokenError,
  NetworkError,
  NotImplementedError,
  ProviderError,
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
  GitHubOptions,
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
 * Generate a random string for state.
 */
function generateRandomString(length = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

/**
 * GitHub user response from API.
 */
interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  html_url: string;
  company: string | null;
  blog: string | null;
  location: string | null;
  bio: string | null;
  twitter_username: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * GitHub email response from API.
 */
interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

/**
 * GitHub authentication provider.
 *
 * Implements OAuth2 authentication with GitHub.
 * Key differences from OIDC providers:
 * - No ID token - user info fetched via API
 * - No JWKS - tokens are opaque
 * - No token introspection endpoint
 */
export class GitHubProvider implements AuthInterface {
  private options: Required<Pick<GitHubOptions, 'clientId'>> & GitHubOptions;

  private static readonly AUTHORIZATION_URL =
    'https://github.com/login/oauth/authorize';
  private static readonly TOKEN_URL =
    'https://github.com/login/oauth/access_token';
  private static readonly API_URL = 'https://api.github.com';

  constructor(options: GitHubOptions) {
    if (!options.clientId) {
      throw new ConfigurationError('clientId is required', 'github');
    }
    if (!options.clientSecret) {
      throw new ConfigurationError('clientSecret is required', 'github');
    }

    this.options = {
      scopes: ['user:email', 'read:user'],
      timeout: 30000,
      maxRetries: 3,
      ...options,
    };
  }

  // ---------------------------------------------------------------------------
  // INTERNAL HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Make an HTTP request to GitHub API with error handling.
   */
  private async request<T>(
    url: string,
    options: RequestInit = {},
    token?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'happyvertical-auth',
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
        throw new NetworkError('Request timed out', 'github', error);
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
        'github',
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
        if (error === 'bad_verification_code') {
          throw new InvalidGrantError('Invalid or expired code', 'github');
        }
        throw new ProviderError(`Bad request: ${errorDescription}`, 'github');

      case 401:
        throw new InvalidClientError('github');

      case 403:
        throw new AccessDeniedError(errorDescription as string, 'github');

      default:
        throw new ProviderError(
          `GitHub error (${status}): ${errorDescription}`,
          'github',
        );
    }
  }

  /**
   * Fetch user info from GitHub API.
   */
  private async fetchUser(token: string): Promise<GitHubUser> {
    return this.request<GitHubUser>(
      `${GitHubProvider.API_URL}/user`,
      { method: 'GET' },
      token,
    );
  }

  /**
   * Fetch user emails from GitHub API.
   */
  private async fetchEmails(token: string): Promise<GitHubEmail[]> {
    return this.request<GitHubEmail[]>(
      `${GitHubProvider.API_URL}/user/emails`,
      { method: 'GET' },
      token,
    );
  }

  /**
   * Get the primary verified email for a user.
   */
  private async getPrimaryEmail(token: string): Promise<string | undefined> {
    try {
      const emails = await this.fetchEmails(token);
      const primary = emails.find((e) => e.primary && e.verified);
      return primary?.email;
    } catch {
      // Email scope may not be granted
      return undefined;
    }
  }

  // ---------------------------------------------------------------------------
  // AUTHENTICATION FLOWS
  // ---------------------------------------------------------------------------

  async getAuthorizationUrl(
    options?: AuthorizationOptions,
  ): Promise<AuthorizationResult> {
    const state = options?.state || generateRandomString();
    const scopes = options?.scopes ||
      this.options.scopes || ['user:email', 'read:user'];
    const redirectUri = options?.redirectUri || this.options.redirectUri;

    if (!redirectUri) {
      throw new ConfigurationError('redirectUri is required', 'github');
    }

    const params = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: redirectUri,
      scope: scopes.join(' '),
      state,
    });

    if (options?.loginHint) {
      params.set('login', options.loginHint);
    }

    // GitHub doesn't support PKCE for OAuth apps (only GitHub Apps)
    // But we can still pass nonce for state management
    const nonce = options?.nonce || generateRandomString();

    // Add extra params
    if (options?.extraParams) {
      for (const [key, value] of Object.entries(options.extraParams)) {
        params.set(key, value);
      }
    }

    const url = `${GitHubProvider.AUTHORIZATION_URL}?${params.toString()}`;

    return {
      url,
      state,
      nonce,
      // GitHub OAuth doesn't use PKCE
      codeVerifier: undefined,
    };
  }

  async exchangeCode(params: CodeExchangeParams): Promise<AuthResult> {
    const redirectUri = params.redirectUri || this.options.redirectUri;

    const body = new URLSearchParams({
      client_id: this.options.clientId,
      client_secret: this.options.clientSecret!,
      code: params.code,
    });

    if (redirectUri) {
      body.set('redirect_uri', redirectUri);
    }

    // GitHub token endpoint requires Accept: application/json
    const response = await fetch(GitHubProvider.TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(this.options.timeout || 30000),
    });

    const data = (await response.json()) as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (data.error) {
      if (data.error === 'bad_verification_code') {
        throw new InvalidGrantError(
          data.error_description || 'Invalid or expired code',
          'github',
        );
      }
      throw new ProviderError(data.error_description || data.error, 'github');
    }

    if (!data.access_token) {
      throw new ProviderError('No access token received', 'github');
    }

    // Fetch user info to get user ID
    const user = await this.fetchUser(data.access_token);

    return {
      accessToken: data.access_token,
      tokenType: data.token_type || 'Bearer',
      expiresIn: 0, // GitHub tokens don't expire by default
      scope: data.scope,
      userId: user.id.toString(),
      // GitHub doesn't return refresh tokens or ID tokens
    };
  }

  async authenticate(_credentials: AuthCredentials): Promise<AuthResult> {
    throw new NotImplementedError('authenticate', 'github', {
      reason:
        'GitHub only supports authorization code flow. Use getAuthorizationUrl() and exchangeCode() instead.',
    });
  }

  async refresh(_refreshToken: string): Promise<AuthResult> {
    throw new NotImplementedError('refresh', 'github', {
      reason:
        'GitHub OAuth tokens do not expire and cannot be refreshed. For expiring tokens, use GitHub Apps instead.',
    });
  }

  async logout(options?: LogoutOptions): Promise<void> {
    // GitHub doesn't have a token revocation endpoint for OAuth apps
    // The user must revoke access via GitHub settings
    if (options?.token) {
      // Best effort: try to revoke via GitHub Apps API (won't work for OAuth apps)
      try {
        await fetch(
          `${GitHubProvider.API_URL}/applications/${this.options.clientId}/token`,
          {
            method: 'DELETE',
            headers: {
              Accept: 'application/json',
              Authorization: `Basic ${btoa(`${this.options.clientId}:${this.options.clientSecret}`)}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ access_token: options.token }),
          },
        );
      } catch {
        // Ignore - revocation may not be supported
      }
    }
  }

  // ---------------------------------------------------------------------------
  // TOKEN OPERATIONS
  // ---------------------------------------------------------------------------

  async validateToken(
    token: string,
    _options?: TokenValidationOptions,
  ): Promise<TokenClaims | null> {
    // GitHub tokens are opaque - validate by calling the API
    try {
      const user = await this.fetchUser(token);
      const email = await this.getPrimaryEmail(token);

      // Synthesize OIDC-like claims from GitHub user data
      return {
        sub: user.id.toString(),
        iss: 'https://github.com',
        aud: this.options.clientId,
        exp: 0, // GitHub tokens don't expire
        iat: Math.floor(Date.now() / 1000),
        email,
        email_verified: email ? true : undefined,
        preferred_username: user.login,
        name: user.name || undefined,
        picture: user.avatar_url,
        // GitHub-specific claims
        login: user.login,
        html_url: user.html_url,
        company: user.company,
        location: user.location,
        bio: user.bio,
      };
    } catch {
      return null;
    }
  }

  decodeToken(_token: string): TokenPayload {
    // GitHub tokens are opaque, not JWTs
    throw new InvalidTokenError(
      'GitHub tokens are opaque and cannot be decoded',
      'github',
    );
  }

  async introspectToken(token: string): Promise<TokenIntrospection> {
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
    const user = await this.fetchUser(tokenOrSession);
    const email = await this.getPrimaryEmail(tokenOrSession);

    return {
      id: user.id.toString(),
      username: user.login,
      email,
      emailVerified: email ? true : undefined,
      displayName: user.name || user.login,
      picture: user.avatar_url,
      attributes: {
        html_url: user.html_url,
        company: user.company || '',
        blog: user.blog || '',
        location: user.location || '',
        bio: user.bio || '',
        twitter_username: user.twitter_username || '',
      },
    };
  }

  async updateProfile(
    _tokenOrSession: string,
    _profile: Partial<UserProfile>,
  ): Promise<UserProfile> {
    throw new NotImplementedError('updateProfile', 'github', {
      reason: 'GitHub does not support profile updates via OAuth2',
    });
  }

  async getUser(_userId: string, _adminToken?: string): Promise<UserProfile> {
    throw new NotImplementedError('getUser', 'github', {
      reason: 'GitHub does not expose admin user management',
    });
  }

  async createUser(
    _user: CreateUserRequest,
    _adminToken: string,
  ): Promise<UserProfile> {
    throw new NotImplementedError('createUser', 'github', {
      reason: 'GitHub does not expose user creation',
    });
  }

  async updateUser(
    _userId: string,
    _updates: Partial<CreateUserRequest>,
    _adminToken: string,
  ): Promise<UserProfile> {
    throw new NotImplementedError('updateUser', 'github', {
      reason: 'GitHub does not expose user management',
    });
  }

  async deleteUser(_userId: string, _adminToken: string): Promise<void> {
    throw new NotImplementedError('deleteUser', 'github', {
      reason: 'GitHub does not expose user management',
    });
  }

  async listUsers(
    _query: UserQuery,
    _adminToken?: string,
  ): Promise<UserListResult> {
    throw new NotImplementedError('listUsers', 'github', {
      reason: 'GitHub does not expose user listing',
    });
  }

  async requestPasswordReset(_email: string): Promise<void> {
    throw new NotImplementedError('requestPasswordReset', 'github', {
      reason: 'Password management is handled by GitHub',
    });
  }

  async resetPassword(_token: string, _newPassword: string): Promise<void> {
    throw new NotImplementedError('resetPassword', 'github', {
      reason: 'Password management is handled by GitHub',
    });
  }

  // ---------------------------------------------------------------------------
  // SESSION OPERATIONS
  // ---------------------------------------------------------------------------

  async listSessions(
    _userId: string,
    _adminToken?: string,
  ): Promise<Session[]> {
    throw new NotImplementedError('listSessions', 'github', {
      reason: 'Session management is handled by GitHub',
    });
  }

  async revokeSession(_sessionId: string, _adminToken?: string): Promise<void> {
    throw new NotImplementedError('revokeSession', 'github', {
      reason: 'Session management is handled by GitHub',
    });
  }

  async revokeAllSessions(
    _userId: string,
    _adminToken?: string,
  ): Promise<void> {
    throw new NotImplementedError('revokeAllSessions', 'github', {
      reason: 'Session management is handled by GitHub',
    });
  }

  // ---------------------------------------------------------------------------
  // AUTHORIZATION
  // ---------------------------------------------------------------------------

  async hasRole(_tokenOrUserId: string, _role: string): Promise<boolean> {
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
    throw new NotImplementedError('assignRole', 'github', {
      reason: 'GitHub does not support role management',
    });
  }

  async removeRole(
    _userId: string,
    _role: string,
    _adminToken: string,
  ): Promise<void> {
    throw new NotImplementedError('removeRole', 'github', {
      reason: 'GitHub does not support role management',
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
      tokenRefresh: false, // GitHub OAuth tokens don't expire
      oidc: false, // GitHub is OAuth2, not OIDC
      userManagement: false,
      sessionManagement: false,
      rbac: false,
      passwordReset: false,
      mfa: true, // GitHub supports 2FA
      socialLogin: true,
      federation: false,
      decentralized: false,
    };
  }

  async getDiscoveryDocument(): Promise<OIDCDiscoveryDocument | null> {
    // GitHub doesn't have OIDC discovery
    return null;
  }
}
