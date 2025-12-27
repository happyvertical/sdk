/**
 * @happyvertical/auth
 *
 * Unified authentication interface supporting:
 * - Keycloak (OIDC/OAuth2)
 * - AWS Cognito (OAuth2)
 * - Nostr (public key identity)
 *
 * @example
 * ```typescript
 * import { getAuth } from '@happyvertical/auth';
 *
 * // Keycloak
 * const keycloak = await getAuth({
 *   type: 'keycloak',
 *   serverUrl: 'https://auth.example.com',
 *   realm: 'my-realm',
 *   clientId: 'my-app'
 * });
 *
 * // Cognito
 * const cognito = await getAuth({
 *   type: 'cognito',
 *   region: 'us-east-1',
 *   userPoolId: 'us-east-1_xxx',
 *   clientId: 'xxx'
 * });
 *
 * // Nostr
 * const nostr = await getAuth({
 *   type: 'nostr',
 *   relays: ['wss://relay.damus.io', 'wss://nos.lol']
 * });
 *
 * // Authentication
 * const result = await auth.authenticate({ username: 'user', password: 'pass' });
 * console.log(result.accessToken);
 *
 * // Token validation
 * const claims = await auth.validateToken(token);
 * if (claims) {
 *   console.log(`User: ${claims.sub}`);
 * }
 *
 * // User profile
 * const profile = await auth.getProfile(token);
 * console.log(profile.email);
 * ```
 *
 * @packageDocumentation
 */

// Error classes and utilities
export {
  // Authorization errors
  AccessDeniedError,
  AuthError,
  AuthErrorCode,
  ChallengeExpiredError,
  ConfigurationError,
  ExtensionNotFoundError,
  hasErrorCode,
  InsufficientScopeError,
  InvalidClientError,
  // Authentication errors
  InvalidCredentialsError,
  InvalidGrantError,
  InvalidKeyError,
  InvalidMfaCodeError,
  InvalidNonceError,
  InvalidRedirectUriError,
  InvalidRefreshTokenError,
  // Nostr-specific errors
  InvalidSignatureError,
  // OAuth/OIDC errors
  InvalidStateError,
  InvalidTokenError,
  // Utility functions
  isAuthError,
  MfaRequiredError,
  NetworkError,
  // General errors
  NotImplementedError,
  // Provider errors
  ProviderError,
  RelayError,
  SessionExpiredError,
  TokenExpiredError,
  UserAlreadyExistsError,
  UserDisabledError,
  // User management errors
  UserNotFoundError,
} from './shared/errors.js';
// Factory functions
export { getAuth, getAuthAuto } from './shared/factory.js';
// Types
export type {
  // Capability types
  AuthCapabilities,
  AuthCredentials,
  // Core interface
  AuthInterface,
  // Authentication flow types
  AuthorizationOptions,
  AuthorizationResult,
  AuthResult,
  AWSCredentials,
  BaseAuthOptions,
  CodeExchangeParams,
  CognitoOptions,
  CreateUserRequest,
  // Provider options
  GetAuthOptions,
  KeycloakOptions,
  LogoutOptions,
  NostrOptions,
  // Nostr types
  NostrSignedEvent,
  NostrSigner,
  NostrToken,
  NostrTokenOptions,
  NostrUnsignedEvent,
  OIDCDiscoveryDocument,
  RoleStoreConfig,
  // Session types
  Session,
  SessionStoreConfig,
  TokenClaims,
  TokenIntrospection,
  TokenPayload,
  // Token types
  TokenValidationOptions,
  UserListResult,
  // User types
  UserProfile,
  UserQuery,
  WindowNostr,
} from './shared/types.js';
