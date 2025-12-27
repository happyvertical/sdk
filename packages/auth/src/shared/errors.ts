/**
 * @happyvertical/auth - Error Classes
 *
 * Standardized authentication error types for consistent error handling
 * across all providers (Keycloak, Cognito, Nostr).
 */

/**
 * Authentication error codes.
 */
export enum AuthErrorCode {
  // Authentication errors
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INVALID_REFRESH_TOKEN = 'INVALID_REFRESH_TOKEN',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  MFA_REQUIRED = 'MFA_REQUIRED',
  INVALID_MFA_CODE = 'INVALID_MFA_CODE',

  // Authorization errors
  ACCESS_DENIED = 'ACCESS_DENIED',
  INSUFFICIENT_SCOPE = 'INSUFFICIENT_SCOPE',
  INVALID_ROLE = 'INVALID_ROLE',

  // User management errors
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS = 'USER_ALREADY_EXISTS',
  USER_DISABLED = 'USER_DISABLED',

  // Provider errors
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',

  // OAuth/OIDC errors
  INVALID_STATE = 'INVALID_STATE',
  INVALID_NONCE = 'INVALID_NONCE',
  INVALID_GRANT = 'INVALID_GRANT',
  INVALID_CLIENT = 'INVALID_CLIENT',
  INVALID_REDIRECT_URI = 'INVALID_REDIRECT_URI',

  // Nostr-specific errors
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  RELAY_ERROR = 'RELAY_ERROR',
  CHALLENGE_EXPIRED = 'CHALLENGE_EXPIRED',
  EXTENSION_NOT_FOUND = 'EXTENSION_NOT_FOUND',
  INVALID_KEY = 'INVALID_KEY',

  // General
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Base authentication error class.
 */
export class AuthError extends Error {
  public readonly code: AuthErrorCode;
  public readonly provider?: string;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: AuthErrorCode,
    provider?: string,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.provider = provider;
    this.context = context;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthError);
    }
  }

  /**
   * Convert error to JSON for logging/serialization.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      provider: this.provider,
      context: this.context,
      stack: this.stack,
    };
  }
}

// =============================================================================
// AUTHENTICATION ERRORS
// =============================================================================

/**
 * Invalid credentials error.
 */
export class InvalidCredentialsError extends AuthError {
  constructor(provider?: string, context?: Record<string, unknown>) {
    super(
      'Invalid credentials',
      AuthErrorCode.INVALID_CREDENTIALS,
      provider,
      context,
    );
    this.name = 'InvalidCredentialsError';
  }
}

/**
 * Invalid token error.
 */
export class InvalidTokenError extends AuthError {
  constructor(
    message?: string,
    provider?: string,
    context?: Record<string, unknown>,
  ) {
    super(
      message || 'Invalid token',
      AuthErrorCode.INVALID_TOKEN,
      provider,
      context,
    );
    this.name = 'InvalidTokenError';
  }
}

/**
 * Token expired error.
 */
export class TokenExpiredError extends AuthError {
  public readonly expiredAt?: Date;

  constructor(
    provider?: string,
    expiredAt?: Date,
    context?: Record<string, unknown>,
  ) {
    super('Token has expired', AuthErrorCode.TOKEN_EXPIRED, provider, context);
    this.name = 'TokenExpiredError';
    this.expiredAt = expiredAt;
  }
}

/**
 * Invalid refresh token error.
 */
export class InvalidRefreshTokenError extends AuthError {
  constructor(provider?: string, context?: Record<string, unknown>) {
    super(
      'Invalid or expired refresh token',
      AuthErrorCode.INVALID_REFRESH_TOKEN,
      provider,
      context,
    );
    this.name = 'InvalidRefreshTokenError';
  }
}

/**
 * Session expired error.
 */
export class SessionExpiredError extends AuthError {
  constructor(provider?: string, context?: Record<string, unknown>) {
    super(
      'Session has expired',
      AuthErrorCode.SESSION_EXPIRED,
      provider,
      context,
    );
    this.name = 'SessionExpiredError';
  }
}

/**
 * MFA required error.
 */
export class MfaRequiredError extends AuthError {
  public readonly mfaMethods?: string[];

  constructor(
    provider?: string,
    mfaMethods?: string[],
    context?: Record<string, unknown>,
  ) {
    super(
      'Multi-factor authentication required',
      AuthErrorCode.MFA_REQUIRED,
      provider,
      context,
    );
    this.name = 'MfaRequiredError';
    this.mfaMethods = mfaMethods;
  }
}

/**
 * Invalid MFA code error.
 */
export class InvalidMfaCodeError extends AuthError {
  constructor(provider?: string, context?: Record<string, unknown>) {
    super(
      'Invalid MFA code',
      AuthErrorCode.INVALID_MFA_CODE,
      provider,
      context,
    );
    this.name = 'InvalidMfaCodeError';
  }
}

// =============================================================================
// AUTHORIZATION ERRORS
// =============================================================================

/**
 * Access denied error.
 */
export class AccessDeniedError extends AuthError {
  constructor(
    message?: string,
    provider?: string,
    context?: Record<string, unknown>,
  ) {
    super(
      message || 'Access denied',
      AuthErrorCode.ACCESS_DENIED,
      provider,
      context,
    );
    this.name = 'AccessDeniedError';
  }
}

/**
 * Insufficient scope error.
 */
export class InsufficientScopeError extends AuthError {
  public readonly requiredScopes?: string[];
  public readonly grantedScopes?: string[];

  constructor(
    requiredScopes?: string[],
    grantedScopes?: string[],
    provider?: string,
    context?: Record<string, unknown>,
  ) {
    super(
      `Insufficient scope. Required: ${requiredScopes?.join(', ') || 'unknown'}`,
      AuthErrorCode.INSUFFICIENT_SCOPE,
      provider,
      context,
    );
    this.name = 'InsufficientScopeError';
    this.requiredScopes = requiredScopes;
    this.grantedScopes = grantedScopes;
  }
}

// =============================================================================
// USER MANAGEMENT ERRORS
// =============================================================================

/**
 * User not found error.
 */
export class UserNotFoundError extends AuthError {
  public readonly userId?: string;

  constructor(
    userId?: string,
    provider?: string,
    context?: Record<string, unknown>,
  ) {
    super(
      userId ? `User not found: ${userId}` : 'User not found',
      AuthErrorCode.USER_NOT_FOUND,
      provider,
      context,
    );
    this.name = 'UserNotFoundError';
    this.userId = userId;
  }
}

/**
 * User already exists error.
 */
export class UserAlreadyExistsError extends AuthError {
  constructor(
    identifier?: string,
    provider?: string,
    context?: Record<string, unknown>,
  ) {
    super(
      identifier ? `User already exists: ${identifier}` : 'User already exists',
      AuthErrorCode.USER_ALREADY_EXISTS,
      provider,
      context,
    );
    this.name = 'UserAlreadyExistsError';
  }
}

/**
 * User disabled error.
 */
export class UserDisabledError extends AuthError {
  constructor(
    userId?: string,
    provider?: string,
    context?: Record<string, unknown>,
  ) {
    super(
      userId ? `User is disabled: ${userId}` : 'User is disabled',
      AuthErrorCode.USER_DISABLED,
      provider,
      context,
    );
    this.name = 'UserDisabledError';
  }
}

// =============================================================================
// PROVIDER ERRORS
// =============================================================================

/**
 * Provider error.
 */
export class ProviderError extends AuthError {
  public readonly originalError?: Error;

  constructor(
    message: string,
    provider?: string,
    originalError?: Error,
    context?: Record<string, unknown>,
  ) {
    super(message, AuthErrorCode.PROVIDER_ERROR, provider, context);
    this.name = 'ProviderError';
    this.originalError = originalError;
  }
}

/**
 * Configuration error.
 */
export class ConfigurationError extends AuthError {
  constructor(
    message: string,
    provider?: string,
    context?: Record<string, unknown>,
  ) {
    super(message, AuthErrorCode.CONFIGURATION_ERROR, provider, context);
    this.name = 'ConfigurationError';
  }
}

/**
 * Network error.
 */
export class NetworkError extends AuthError {
  public readonly originalError?: Error;

  constructor(
    message?: string,
    provider?: string,
    originalError?: Error,
    context?: Record<string, unknown>,
  ) {
    super(
      message || 'Network error',
      AuthErrorCode.NETWORK_ERROR,
      provider,
      context,
    );
    this.name = 'NetworkError';
    this.originalError = originalError;
  }
}

// =============================================================================
// OAUTH/OIDC ERRORS
// =============================================================================

/**
 * Invalid state error.
 */
export class InvalidStateError extends AuthError {
  constructor(provider?: string, context?: Record<string, unknown>) {
    super(
      'Invalid or mismatched state parameter',
      AuthErrorCode.INVALID_STATE,
      provider,
      context,
    );
    this.name = 'InvalidStateError';
  }
}

/**
 * Invalid nonce error.
 */
export class InvalidNonceError extends AuthError {
  constructor(provider?: string, context?: Record<string, unknown>) {
    super(
      'Invalid or mismatched nonce',
      AuthErrorCode.INVALID_NONCE,
      provider,
      context,
    );
    this.name = 'InvalidNonceError';
  }
}

/**
 * Invalid grant error.
 */
export class InvalidGrantError extends AuthError {
  constructor(
    message?: string,
    provider?: string,
    context?: Record<string, unknown>,
  ) {
    super(
      message || 'Invalid grant',
      AuthErrorCode.INVALID_GRANT,
      provider,
      context,
    );
    this.name = 'InvalidGrantError';
  }
}

/**
 * Invalid client error.
 */
export class InvalidClientError extends AuthError {
  constructor(provider?: string, context?: Record<string, unknown>) {
    super(
      'Invalid client credentials',
      AuthErrorCode.INVALID_CLIENT,
      provider,
      context,
    );
    this.name = 'InvalidClientError';
  }
}

/**
 * Invalid redirect URI error.
 */
export class InvalidRedirectUriError extends AuthError {
  constructor(provider?: string, context?: Record<string, unknown>) {
    super(
      'Invalid or mismatched redirect URI',
      AuthErrorCode.INVALID_REDIRECT_URI,
      provider,
      context,
    );
    this.name = 'InvalidRedirectUriError';
  }
}

// =============================================================================
// NOSTR-SPECIFIC ERRORS
// =============================================================================

/**
 * Invalid signature error.
 */
export class InvalidSignatureError extends AuthError {
  constructor(message?: string, context?: Record<string, unknown>) {
    super(
      message || 'Invalid event signature',
      AuthErrorCode.INVALID_SIGNATURE,
      'nostr',
      context,
    );
    this.name = 'InvalidSignatureError';
  }
}

/**
 * Relay error.
 */
export class RelayError extends AuthError {
  public readonly relayUrl?: string;
  public readonly originalError?: Error;

  constructor(
    message: string,
    relayUrl?: string,
    originalError?: Error,
    context?: Record<string, unknown>,
  ) {
    super(message, AuthErrorCode.RELAY_ERROR, 'nostr', {
      ...context,
      relayUrl,
    });
    this.name = 'RelayError';
    this.relayUrl = relayUrl;
    this.originalError = originalError;
  }
}

/**
 * Challenge expired error.
 */
export class ChallengeExpiredError extends AuthError {
  constructor(context?: Record<string, unknown>) {
    super(
      'Authentication challenge has expired',
      AuthErrorCode.CHALLENGE_EXPIRED,
      'nostr',
      context,
    );
    this.name = 'ChallengeExpiredError';
  }
}

/**
 * NIP-07 extension not found error.
 */
export class ExtensionNotFoundError extends AuthError {
  constructor(context?: Record<string, unknown>) {
    super(
      'NIP-07 browser extension not found. Install nos2x, Alby, or similar.',
      AuthErrorCode.EXTENSION_NOT_FOUND,
      'nostr',
      context,
    );
    this.name = 'ExtensionNotFoundError';
  }
}

/**
 * Invalid key error.
 */
export class InvalidKeyError extends AuthError {
  constructor(message?: string, context?: Record<string, unknown>) {
    super(
      message || 'Invalid key format',
      AuthErrorCode.INVALID_KEY,
      'nostr',
      context,
    );
    this.name = 'InvalidKeyError';
  }
}

// =============================================================================
// GENERAL ERRORS
// =============================================================================

/**
 * Not implemented error.
 */
export class NotImplementedError extends AuthError {
  public readonly operation: string;

  constructor(
    operation: string,
    provider?: string,
    context?: Record<string, unknown>,
  ) {
    super(
      `Operation '${operation}' is not supported by this provider`,
      AuthErrorCode.NOT_IMPLEMENTED,
      provider,
      context,
    );
    this.name = 'NotImplementedError';
    this.operation = operation;
  }
}

/**
 * Check if an error is an AuthError.
 */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/**
 * Check if an error has a specific error code.
 */
export function hasErrorCode(error: unknown, code: AuthErrorCode): boolean {
  return isAuthError(error) && error.code === code;
}
