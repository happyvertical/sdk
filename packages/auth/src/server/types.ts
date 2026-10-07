import type { JWK } from 'jose';

/** OAuth errors safe to serialize at an endpoint or redirect to a registered callback. */
export class OAuthServerError extends Error {
  constructor(
    readonly error: OAuthErrorCode,
    readonly description: string,
    readonly status = 400,
  ) {
    super(description);
    this.name = 'OAuthServerError';
  }
}

/** Errors defined by OAuth 2.0 endpoints supported by this server. */
export type OAuthErrorCode =
  | 'access_denied'
  | 'invalid_client'
  | 'invalid_grant'
  | 'invalid_request'
  | 'invalid_request_uri'
  | 'invalid_scope'
  | 'invalid_token'
  | 'unsupported_grant_type'
  | 'unsupported_response_type';

/** A client registered by an operator or dynamic-client-registration endpoint. */
export interface OAuthClient {
  readonly id: string;
  readonly redirectUris: readonly string[];
  readonly allowedScopes: readonly string[];
  readonly tokenEndpointAuthMethod: 'none' | 'client_secret_post';
  /** Store a password hash, never a raw secret. */
  readonly secretHash?: string;
  readonly allowedResources?: readonly string[];
  readonly createdAt: Date;
}

/** A subject and current application context approved by the host's authenticated session. */
export interface OAuthConsentContext {
  readonly subject: string;
  /** Optional tenant selected and authorized by trusted application state. */
  readonly tenantId?: string;
  /** Additional JSON-safe access-token claims supplied by the application. */
  readonly claims?: Readonly<Record<string, string | number | boolean>>;
  readonly scopes?: readonly string[];
}

/** Request parsed from an OAuth authorization endpoint request. */
export interface OAuthAuthorizationRequest {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly responseType: 'code';
  readonly scopes: readonly string[];
  readonly resource?: string;
  readonly state?: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: 'S256';
}

/** A durable authorization-code grant; codeHash must be a SHA-256 hash, not a bearer secret. */
export interface OAuthAuthorizationCodeGrant {
  readonly id: string;
  readonly codeHash: string;
  readonly clientId: string;
  readonly subject: string;
  readonly tenantId?: string;
  readonly claims?: Readonly<Record<string, string | number | boolean>>;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly resource?: string;
  readonly codeChallenge: string;
  readonly expiresAt: Date;
}

/** A durable rotating refresh-token grant; tokenHash must be a SHA-256 hash. */
export interface OAuthRefreshGrant {
  readonly id: string;
  readonly tokenHash: string;
  readonly familyId: string;
  readonly clientId: string;
  readonly subject: string;
  readonly tenantId?: string;
  readonly claims?: Readonly<Record<string, string | number | boolean>>;
  readonly scopes: readonly string[];
  readonly resource?: string;
  readonly expiresAt: Date;
}

/** Redirect response to return after an authenticated user has approved consent. */
export interface OAuthAuthorizationRedirect {
  readonly redirectUri: string;
}

/** Result of an atomic code consume operation. */
export type OAuthCodeConsumeResult =
  | { readonly status: 'consumed'; readonly grant: OAuthAuthorizationCodeGrant }
  | { readonly status: 'invalid' | 'expired' | 'replayed' };

/** Result of an atomic refresh rotation operation. */
export type OAuthRefreshRotateResult =
  | { readonly status: 'rotated'; readonly grant: OAuthRefreshGrant }
  | { readonly status: 'invalid' | 'expired' | 'replayed' | 'revoked' };

/** Durable persistence boundary. Implement consume/rotate as one database transaction or compare-and-swap. */
export interface OAuthAuthorizationStorage {
  getClient(clientId: string): Promise<OAuthClient | null>;
  registerClient(client: OAuthClient): Promise<void>;
  createAuthorizationCode(grant: OAuthAuthorizationCodeGrant): Promise<void>;
  /** Atomically validates the exact binding and marks the code permanently consumed. */
  consumeAuthorizationCode(input: {
    readonly id: string;
    readonly codeHash: string;
    readonly clientId: string;
    readonly redirectUri: string;
    readonly resource?: string;
    readonly now: Date;
  }): Promise<OAuthCodeConsumeResult>;
  createRefreshGrant(grant: OAuthRefreshGrant): Promise<void>;
  /** Atomically persist a subset of a replacement grant's scopes before exposing its token. Reject missing or mismatched grants and any expansion. Required to support live narrowing. */
  narrowRefreshGrant?(input: {
    readonly id: string;
    readonly tokenHash: string;
    readonly scopes: readonly string[];
  }): Promise<void>;
  /** Atomically consumes a refresh token, creates replacement, and revokes its family on replay. */
  rotateRefreshGrant(input: {
    readonly id: string;
    readonly tokenHash: string;
    readonly clientId: string;
    readonly resource?: string;
    /** Storage derives the replacement's subject, scopes and family from the atomically consumed grant. */
    readonly replacement: Pick<
      OAuthRefreshGrant,
      'id' | 'tokenHash' | 'expiresAt'
    >;
    readonly now: Date;
  }): Promise<OAuthRefreshRotateResult>;
  revokeRefreshGrant(input: {
    readonly id: string;
    readonly tokenHash: string;
    readonly now: Date;
  }): Promise<void>;
  revokeAccessToken(input: {
    readonly jti: string;
    readonly expiresAt: Date;
  }): Promise<void>;
  isAccessTokenRevoked(jti: string, now: Date): Promise<boolean>;
}

/** Application-owned authorization checks. The server never authenticates browser sessions itself. */
export interface OAuthIdentityProvider {
  /** Called before every token issue; return null when live authorization is inactive. */
  revalidateConsent?(
    context: OAuthConsentContext,
    grant: OAuthAuthorizationCodeGrant | OAuthRefreshGrant,
  ): Promise<OAuthConsentContext | null>;
  /** Called before issuing a refreshed token; return null when the identity, tenant, or permissions are no longer active. */
  refreshConsent?(
    context: OAuthConsentContext,
    grant: OAuthRefreshGrant,
  ): Promise<OAuthConsentContext | null>;
}

/** Signing material controlled by the host. Publish only publicJwk through JWKS. */
export interface OAuthSigningKey {
  readonly privateKey: CryptoKey | Uint8Array;
  /** Public key paired with privateKey, used only for local verification helpers. */
  readonly publicKey: CryptoKey | Uint8Array;
  readonly publicJwk: JWK;
  readonly algorithm: 'RS256' | 'ES256';
  readonly keyId: string;
}

/** Configuration for a framework-independent OAuth authorization server. */
export interface OAuthAuthorizationServerOptions {
  readonly issuer: string;
  readonly signingKey: OAuthSigningKey;
  readonly storage: OAuthAuthorizationStorage;
  readonly identity: OAuthIdentityProvider;
  readonly scopes: readonly string[];
  readonly resources?: readonly string[];
  readonly authorizationCodeLifetimeSeconds?: number;
  readonly accessTokenLifetimeSeconds?: number;
  readonly refreshTokenLifetimeSeconds?: number;
  readonly issueRefreshTokens?: boolean;
  /** Enables RFC 7591 public-client registration. It is disabled by default. */
  readonly dynamicClientRegistration?: boolean;
}

/** Tokens returned by successful token endpoint grants. */
export interface OAuthTokenResponse {
  readonly access_token: string;
  readonly token_type: 'Bearer';
  readonly expires_in: number;
  readonly scope: string;
  readonly refresh_token?: string;
}
