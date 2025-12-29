/**
 * @happyvertical/auth - Type Definitions
 *
 * Unified authentication interface supporting:
 * - Keycloak (OIDC/OAuth2)
 * - AWS Cognito (OAuth2)
 * - Nostr (public key identity)
 */

// =============================================================================
// CORE INTERFACE
// =============================================================================

/**
 * Core authentication interface that all providers must implement.
 *
 * The interface is designed around concepts that can be mapped across
 * different authentication paradigms:
 * - OAuth/OIDC (Keycloak, Cognito): Traditional token-based flows
 * - Decentralized (Nostr): Public key identity with event-based verification
 */
export interface AuthInterface {
  // ---------------------------------------------------------------------------
  // AUTHENTICATION FLOWS
  // ---------------------------------------------------------------------------

  /**
   * Get the authorization URL for initiating OAuth/OIDC login flow.
   *
   * For Nostr: Returns a challenge URL/data for signing.
   */
  getAuthorizationUrl(
    options?: AuthorizationOptions,
  ): Promise<AuthorizationResult>;

  /**
   * Exchange authorization code for tokens (OAuth callback handler).
   *
   * For Nostr: Verifies signed challenge and creates session.
   */
  exchangeCode(params: CodeExchangeParams): Promise<AuthResult>;

  /**
   * Authenticate with credentials directly (password grant / login).
   *
   * For Nostr: Authenticate with nsec (private key) or NIP-07 extension.
   */
  authenticate(credentials: AuthCredentials): Promise<AuthResult>;

  /**
   * Refresh an expired access token.
   *
   * For Nostr: Re-verify identity (optional, may return same session).
   */
  refresh(refreshToken: string): Promise<AuthResult>;

  /**
   * End the user session (logout).
   */
  logout(options?: LogoutOptions): Promise<void>;

  // ---------------------------------------------------------------------------
  // TOKEN OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * Validate a token and return claims if valid.
   *
   * For Nostr: Validates NIP-98 event signature and returns pubkey claims.
   */
  validateToken(
    token: string,
    options?: TokenValidationOptions,
  ): Promise<TokenClaims | null>;

  /**
   * Decode a token without validation (for inspection).
   *
   * For Nostr: Decodes event metadata.
   */
  decodeToken(token: string): TokenPayload;

  /**
   * Introspect a token (active check with full claims).
   *
   * For Nostr: Check if pubkey is valid/not revoked.
   */
  introspectToken(token: string): Promise<TokenIntrospection>;

  // ---------------------------------------------------------------------------
  // USER OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * Get the current user's profile from a valid token/session.
   *
   * For Nostr: Fetches profile (kind:0) from relays.
   */
  getProfile(tokenOrSession: string): Promise<UserProfile>;

  /**
   * Update the current user's profile.
   *
   * For Nostr: Publishes updated profile event (kind:0).
   */
  updateProfile(
    tokenOrSession: string,
    profile: Partial<UserProfile>,
  ): Promise<UserProfile>;

  /**
   * Get a user by ID (admin operation).
   *
   * For Nostr: Fetches profile by npub.
   */
  getUser(userId: string, adminToken?: string): Promise<UserProfile>;

  /**
   * Create a new user (admin operation).
   *
   * For Nostr: Not applicable - returns error or generates keypair.
   */
  createUser(user: CreateUserRequest, adminToken: string): Promise<UserProfile>;

  /**
   * Update a user (admin operation).
   *
   * For Nostr: Not applicable in centralized sense.
   */
  updateUser(
    userId: string,
    updates: Partial<CreateUserRequest>,
    adminToken: string,
  ): Promise<UserProfile>;

  /**
   * Delete a user (admin operation).
   *
   * For Nostr: Not applicable - keys cannot be revoked centrally.
   */
  deleteUser(userId: string, adminToken: string): Promise<void>;

  /**
   * List users (admin operation).
   *
   * For Nostr: Search profiles from relays.
   */
  listUsers(query: UserQuery, adminToken?: string): Promise<UserListResult>;

  /**
   * Request password reset (admin or self-service).
   *
   * For Nostr: Not applicable.
   */
  requestPasswordReset(email: string): Promise<void>;

  /**
   * Reset password with token.
   *
   * For Nostr: Not applicable.
   */
  resetPassword(token: string, newPassword: string): Promise<void>;

  // ---------------------------------------------------------------------------
  // SESSION OPERATIONS
  // ---------------------------------------------------------------------------

  /**
   * List active sessions for a user.
   *
   * For Nostr: List known relay connections or local sessions.
   */
  listSessions(userId: string, adminToken?: string): Promise<Session[]>;

  /**
   * Revoke a specific session.
   *
   * For Nostr: Disconnect from relay or clear local session.
   */
  revokeSession(sessionId: string, adminToken?: string): Promise<void>;

  /**
   * Revoke all sessions for a user.
   */
  revokeAllSessions(userId: string, adminToken?: string): Promise<void>;

  // ---------------------------------------------------------------------------
  // AUTHORIZATION (ROLES & PERMISSIONS)
  // ---------------------------------------------------------------------------

  /**
   * Check if user has a specific role.
   *
   * For Nostr: Check against local role mapping or badge events.
   */
  hasRole(tokenOrUserId: string, role: string): Promise<boolean>;

  /**
   * Check if user has a specific permission.
   *
   * For Nostr: Check against local permission mapping.
   */
  hasPermission(
    tokenOrUserId: string,
    permission: string,
    resource?: string,
  ): Promise<boolean>;

  /**
   * Get all roles for a user.
   */
  getRoles(tokenOrUserId: string, adminToken?: string): Promise<string[]>;

  /**
   * Assign role to user (admin operation).
   *
   * For Nostr: Managed locally or via badge events.
   */
  assignRole(userId: string, role: string, adminToken: string): Promise<void>;

  /**
   * Remove role from user (admin operation).
   */
  removeRole(userId: string, role: string, adminToken: string): Promise<void>;

  // ---------------------------------------------------------------------------
  // PROVIDER INFORMATION
  // ---------------------------------------------------------------------------

  /**
   * Get provider capabilities.
   */
  getCapabilities(): Promise<AuthCapabilities>;

  /**
   * Get OpenID Connect discovery document.
   *
   * For Nostr: Returns null or mock document.
   */
  getDiscoveryDocument(): Promise<OIDCDiscoveryDocument | null>;
}

// =============================================================================
// PROVIDER OPTIONS
// =============================================================================

/**
 * Base configuration options for all providers.
 */
export interface BaseAuthOptions {
  /** Request timeout in milliseconds */
  timeout?: number;

  /** Maximum number of retries for failed requests */
  maxRetries?: number;

  /** Custom headers for HTTP requests */
  headers?: Record<string, string>;
}

/**
 * Keycloak provider options.
 */
export interface KeycloakOptions extends BaseAuthOptions {
  type: 'keycloak';

  /** Keycloak server URL (e.g., 'https://auth.example.com') */
  serverUrl: string;

  /** Keycloak realm name */
  realm: string;

  /** Client ID for this application */
  clientId: string;

  /** Client secret (for confidential clients) */
  clientSecret?: string;

  /** OAuth callback URL for this application */
  redirectUri?: string;

  /** Default scopes to request */
  scopes?: string[];

  /**
   * Use PKCE for public clients.
   * @default true
   */
  usePKCE?: boolean;

  /**
   * Verify SSL certificates.
   * @default true
   */
  verifySsl?: boolean;
}

/**
 * AWS Cognito provider options.
 */
export interface CognitoOptions extends BaseAuthOptions {
  type: 'cognito';

  /** AWS region (e.g., 'us-east-1') */
  region: string;

  /** Cognito User Pool ID */
  userPoolId: string;

  /** App client ID */
  clientId: string;

  /** App client secret (if configured) */
  clientSecret?: string;

  /** OAuth callback URL */
  redirectUri?: string;

  /** Cognito domain for hosted UI (e.g., 'myapp.auth.us-east-1.amazoncognito.com') */
  domain?: string;

  /** Default scopes to request */
  scopes?: string[];

  /** AWS credentials (optional, uses default credential chain if not provided) */
  credentials?: AWSCredentials;
}

/**
 * AWS credentials for Cognito.
 */
export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/**
 * Nostr provider options.
 */
export interface NostrOptions extends BaseAuthOptions {
  type: 'nostr';

  /** Relay URLs to connect to */
  relays: string[];

  /**
   * Private key (nsec) for signing - only for server-side operations.
   * WARNING: Never expose this in client-side code.
   */
  privateKey?: string;

  /**
   * Challenge expiration time in seconds.
   * @default 300 (5 minutes)
   */
  challengeExpiration?: number;

  /** Local role mapping storage */
  roleStore?: RoleStoreConfig;

  /** Session storage configuration */
  sessionStore?: SessionStoreConfig;

  /**
   * Timeout for relay operations in milliseconds.
   * @default 10000
   */
  relayTimeout?: number;
}

/**
 * Role store configuration for Nostr.
 */
export interface RoleStoreConfig {
  type: 'memory' | 'file' | 'database';
  path?: string;
  /** DatabaseInterface from @happyvertical/sql */
  database?: unknown;
}

/**
 * Session store configuration for Nostr.
 */
export interface SessionStoreConfig {
  type: 'memory' | 'file' | 'database';
  path?: string;
  database?: unknown;
  /** Session TTL in seconds */
  ttl?: number;
}

/**
 * Kanidm provider options.
 */
export interface KanidmOptions extends BaseAuthOptions {
  type: 'kanidm';

  /** Kanidm server URL (e.g., 'https://idp.example.com') */
  serverUrl: string;

  /** OAuth2 client ID */
  clientId: string;

  /** Client secret (for confidential clients) */
  clientSecret?: string;

  /** OAuth callback URL for this application */
  redirectUri?: string;

  /** Default scopes to request */
  scopes?: string[];

  /**
   * Use PKCE for authorization code flow.
   * @default true (required by Kanidm)
   */
  usePKCE?: boolean;

  /**
   * Verify SSL certificates.
   * @default true
   */
  verifySsl?: boolean;

  /**
   * Admin username for Kanidm API operations.
   * Required for user management operations.
   */
  adminUsername?: string;

  /**
   * Admin password for Kanidm API operations.
   * Required for user management operations.
   */
  adminPassword?: string;
}

/**
 * Union type for all provider options.
 */
export type GetAuthOptions =
  | KeycloakOptions
  | CognitoOptions
  | NostrOptions
  | KanidmOptions;

// =============================================================================
// AUTHENTICATION FLOW TYPES
// =============================================================================

/**
 * Options for initiating authorization flow.
 */
export interface AuthorizationOptions {
  /** OAuth scopes to request */
  scopes?: string[];

  /** State parameter for CSRF protection */
  state?: string;

  /** Nonce for ID token validation */
  nonce?: string;

  /** Custom redirect URI (overrides default) */
  redirectUri?: string;

  /** Prompt behavior ('login' | 'consent' | 'none') */
  prompt?: 'login' | 'consent' | 'none';

  /** Login hint (pre-fill email/username) */
  loginHint?: string;

  /** Additional custom parameters */
  extraParams?: Record<string, string>;
}

/**
 * Result from getAuthorizationUrl.
 */
export interface AuthorizationResult {
  /**
   * The authorization URL to redirect to.
   * For Nostr: URL-encoded challenge data or NIP-07 compatible data.
   */
  url: string;

  /** State parameter to verify on callback */
  state: string;

  /** PKCE code verifier (store securely, needed for code exchange) */
  codeVerifier?: string;

  /** Nonce for ID token validation */
  nonce?: string;

  /** For Nostr: The challenge to be signed */
  challenge?: string;
}

/**
 * Parameters for code exchange.
 */
export interface CodeExchangeParams {
  /** Authorization code from callback */
  code: string;

  /** State parameter from callback (for verification) */
  state?: string;

  /** PKCE code verifier */
  codeVerifier?: string;

  /** Redirect URI (must match authorization request) */
  redirectUri?: string;

  /** For Nostr: Signed challenge event */
  signedEvent?: NostrSignedEvent;
}

/**
 * Authentication credentials.
 */
export interface AuthCredentials {
  /** OAuth grant type */
  grantType?: 'password' | 'client_credentials';

  /** Username or email */
  username?: string;

  /** Password */
  password?: string;

  /** For Nostr: Private key (nsec format) */
  privateKey?: string;

  /** For Nostr: Public key (npub format) */
  publicKey?: string;

  /** OAuth scopes to request */
  scopes?: string[];

  /** MFA/2FA code if required */
  mfaCode?: string;

  /** For Nostr: Authentication method */
  method?: 'extension' | 'privateKey' | 'generate' | 'bunker';

  /** For Nostr: NIP-46 bunker URL */
  bunkerUrl?: string;
}

/**
 * Authentication result.
 */
export interface AuthResult {
  /** Access token (JWT for OAuth, session token for Nostr) */
  accessToken: string;

  /** Token type (usually 'Bearer') */
  tokenType: string;

  /** Access token expiration in seconds */
  expiresIn: number;

  /** Refresh token for obtaining new access tokens */
  refreshToken?: string;

  /** ID token (OIDC) */
  idToken?: string;

  /** Granted scopes */
  scope?: string;

  /** User identifier */
  userId: string;

  /** For Nostr: Public key (npub) */
  publicKey?: string;

  /** For Nostr: Private key (nsec) - only returned on key generation, shown once */
  privateKey?: string;

  /** Warning message (e.g., for Nostr key generation) */
  warning?: string;
}

/**
 * Logout options.
 */
export interface LogoutOptions {
  /** Access token or ID token to invalidate */
  token?: string;

  /** Refresh token to revoke */
  refreshToken?: string;

  /** Session ID to end */
  sessionId?: string;

  /** Redirect after logout (for OIDC) */
  postLogoutRedirectUri?: string;
}

// =============================================================================
// TOKEN TYPES
// =============================================================================

/**
 * Token validation options.
 */
export interface TokenValidationOptions {
  /** Expected audience(s) */
  audience?: string | string[];

  /** Expected issuer */
  issuer?: string;

  /** Expected nonce (for ID tokens) */
  nonce?: string;

  /** Skip expiration check */
  ignoreExpiration?: boolean;

  /** Clock tolerance in seconds */
  clockTolerance?: number;

  /** For Nostr NIP-98: Expected URL */
  expectedUrl?: string;

  /** For Nostr NIP-98: Expected HTTP method */
  expectedMethod?: string;

  /** For Nostr NIP-98: Max age in seconds */
  maxAge?: number;
}

/**
 * Token claims (decoded and validated).
 * Property names follow OIDC/JWT standard claim names.
 */
// biome-ignore lint/style/useNamingConvention: OIDC standard claims use snake_case
export interface TokenClaims {
  /** Subject (user ID) */
  sub: string;

  /** Issuer */
  iss: string;

  /** Audience */
  aud: string | string[];

  /** Expiration timestamp */
  exp: number;

  /** Issued at timestamp */
  iat: number;

  /** Not before timestamp */
  nbf?: number;

  /** Authorized party (OIDC) */
  azp?: string;

  /** User email */
  email?: string;

  /** Email verified flag */
  email_verified?: boolean;

  /** User's preferred username */
  preferred_username?: string;

  /** User's name */
  name?: string;

  /** Roles (Keycloak resource_access or realm_access) */
  roles?: string[];

  /** For Nostr: Public key */
  pubkey?: string;

  /** Additional claims */
  [key: string]: unknown;
}

/**
 * Decoded token payload (without validation).
 */
export interface TokenPayload {
  header: {
    alg: string;
    typ?: string;
    kid?: string;
  };
  payload: TokenClaims;
  signature: string;
}

/**
 * Token introspection result.
 */
export interface TokenIntrospection {
  /** Is the token active? */
  active: boolean;

  /** Token claims (if active) */
  claims?: TokenClaims;

  /** Token type */
  tokenType?: string;

  /** Client ID that requested the token */
  clientId?: string;

  /** Scopes granted to this token */
  scope?: string;
}

// =============================================================================
// USER TYPES
// =============================================================================

/**
 * User profile.
 */
export interface UserProfile {
  /** User identifier */
  id: string;

  /** Username */
  username?: string;

  /** Email address */
  email?: string;

  /** Email verified status */
  emailVerified?: boolean;

  /** First name */
  firstName?: string;

  /** Last name */
  lastName?: string;

  /** Display name */
  displayName?: string;

  /** Profile picture URL */
  picture?: string;

  /** Phone number */
  phone?: string;

  /** Phone verified status */
  phoneVerified?: boolean;

  /** Account enabled status */
  enabled?: boolean;

  /** Account creation timestamp */
  createdAt?: Date;

  /** Last update timestamp */
  updatedAt?: Date;

  /** User's roles */
  roles?: string[];

  /** User's groups */
  groups?: string[];

  /** Custom attributes */
  attributes?: Record<string, string | string[]>;

  // Nostr-specific fields
  /** For Nostr: Public key (npub) */
  publicKey?: string;

  /** For Nostr: NIP-05 identifier */
  nip05?: string;

  /** For Nostr: Lightning address (LUD-16) */
  lud16?: string;

  /** For Nostr: About text */
  about?: string;

  /** For Nostr: Banner image URL */
  banner?: string;

  /** For Nostr: Website URL */
  website?: string;
}

/**
 * Create user request.
 */
export interface CreateUserRequest {
  username: string;
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
  emailVerified?: boolean;
  attributes?: Record<string, string | string[]>;
  roles?: string[];
  groups?: string[];
}

/**
 * User query parameters.
 */
export interface UserQuery {
  /** Search string (matches username, email, name) */
  search?: string;

  /** Filter by email */
  email?: string;

  /** Filter by username */
  username?: string;

  /** Filter by enabled status */
  enabled?: boolean;

  /** Maximum results to return */
  limit?: number;

  /** Offset for pagination */
  offset?: number;

  /** For Nostr: Search by npub */
  publicKey?: string;
}

/**
 * User list result.
 */
export interface UserListResult {
  users: UserProfile[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// SESSION TYPES
// =============================================================================

/**
 * User session.
 */
export interface Session {
  /** Session identifier */
  id: string;

  /** User identifier */
  userId: string;

  /** Client identifier */
  clientId?: string;

  /** Session start time */
  startedAt: Date;

  /** Last activity time */
  lastAccessedAt: Date;

  /** Session expiration time */
  expiresAt?: Date;

  /** IP address */
  ipAddress?: string;

  /** User agent */
  userAgent?: string;

  /** For Nostr: Connected relays */
  relays?: string[];
}

// =============================================================================
// CAPABILITY TYPES
// =============================================================================

/**
 * Provider capabilities.
 */
export interface AuthCapabilities {
  /** Supports OAuth 2.0 authorization code flow */
  authorizationCode: boolean;

  /** Supports resource owner password credentials grant */
  passwordGrant: boolean;

  /** Supports client credentials grant */
  clientCredentials: boolean;

  /** Supports token refresh */
  tokenRefresh: boolean;

  /** Supports OpenID Connect */
  oidc: boolean;

  /** Supports user management (CRUD) */
  userManagement: boolean;

  /** Supports session management */
  sessionManagement: boolean;

  /** Supports role-based access control */
  rbac: boolean;

  /** Supports password reset flow */
  passwordReset: boolean;

  /** Supports MFA/2FA */
  mfa: boolean;

  /** Supports social login */
  socialLogin: boolean;

  /** Supports federated identity */
  federation: boolean;

  /** Is a decentralized provider */
  decentralized: boolean;
}

/**
 * OIDC Discovery Document.
 */
export interface OIDCDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  registration_endpoint?: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  claims_supported: string[];
  end_session_endpoint?: string;
  introspection_endpoint?: string;
  revocation_endpoint?: string;
}

// =============================================================================
// NOSTR-SPECIFIC TYPES
// =============================================================================

/**
 * Nostr signed event (NIP-01).
 * Property names follow Nostr protocol specification.
 */
// biome-ignore lint/style/useNamingConvention: Nostr protocol spec uses snake_case
export interface NostrSignedEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/**
 * Nostr unsigned event (for signing).
 * Property names follow Nostr protocol specification.
 */
// biome-ignore lint/style/useNamingConvention: Nostr protocol spec uses snake_case
export interface NostrUnsignedEvent {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

/**
 * Nostr NIP-98 token options.
 */
export interface NostrTokenOptions {
  /** The URL being accessed */
  url: string;

  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

  /** Optional payload hash for POST/PUT requests */
  payloadHash?: string;

  /**
   * Token validity window in seconds.
   * @default 60
   */
  validityWindow?: number;
}

/**
 * Nostr NIP-98 token.
 */
export interface NostrToken {
  /** The signed NIP-98 event (kind 27235) */
  event: NostrSignedEvent;

  /** Base64-encoded event for Authorization header */
  authorizationHeader: string;

  /** When this token was created */
  createdAt: Date;

  /** When this token expires */
  expiresAt: Date;
}

/**
 * Nostr signer interface.
 */
export interface NostrSigner {
  /** Get the public key */
  getPublicKey(): Promise<string>;

  /** Sign an event */
  signEvent(event: NostrUnsignedEvent): Promise<NostrSignedEvent>;
}

/**
 * Window.nostr interface (NIP-07).
 */
export interface WindowNostr {
  getPublicKey(): Promise<string>;
  signEvent(event: NostrUnsignedEvent): Promise<NostrSignedEvent>;
  getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

// Extend global Window interface
declare global {
  interface Window {
    nostr?: WindowNostr;
  }
}
