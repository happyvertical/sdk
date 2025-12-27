/**
 * @happyvertical/auth - Factory Functions
 *
 * Creates authentication provider instances based on configuration.
 * Supports Keycloak, AWS Cognito, and Nostr providers.
 */

import { loadEnvConfig, ValidationError } from '@happyvertical/utils';

import type {
  AuthInterface,
  CognitoOptions,
  GetAuthOptions,
  KeycloakOptions,
  NostrOptions,
} from './types';

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Checks if the options are for Keycloak provider.
 */
function isKeycloakOptions(
  options: GetAuthOptions,
): options is KeycloakOptions {
  return options.type === 'keycloak';
}

/**
 * Checks if the options are for Cognito provider.
 */
function isCognitoOptions(options: GetAuthOptions): options is CognitoOptions {
  return options.type === 'cognito';
}

/**
 * Checks if the options are for Nostr provider.
 */
function isNostrOptions(options: GetAuthOptions): options is NostrOptions {
  return options.type === 'nostr';
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Creates an authentication provider instance based on the provided options.
 *
 * Supports environment variable configuration using the pattern:
 * - HAVE_AUTH_TYPE → provider type ('keycloak' | 'cognito' | 'nostr')
 * - HAVE_AUTH_SERVER_URL → serverUrl (Keycloak)
 * - HAVE_AUTH_REALM → realm (Keycloak)
 * - HAVE_AUTH_CLIENT_ID → clientId
 * - HAVE_AUTH_CLIENT_SECRET → clientSecret
 * - HAVE_AUTH_REDIRECT_URI → redirectUri
 * - HAVE_AUTH_REGION → region (Cognito)
 * - HAVE_AUTH_USER_POOL_ID → userPoolId (Cognito)
 * - HAVE_AUTH_DOMAIN → domain (Cognito)
 * - HAVE_AUTH_RELAYS → relays (Nostr, comma-separated)
 * - HAVE_AUTH_TIMEOUT → timeout (number)
 * - HAVE_AUTH_MAX_RETRIES → maxRetries (number)
 *
 * User-provided options always take precedence over environment variables.
 *
 * @param options - Configuration options for the auth provider
 * @returns Promise resolving to an AuthInterface implementation
 * @throws {ValidationError} When the provider type is unsupported or invalid
 *
 * @example
 * ```typescript
 * // Create Keycloak client
 * const auth = await getAuth({
 *   type: 'keycloak',
 *   serverUrl: 'https://auth.example.com',
 *   realm: 'my-realm',
 *   clientId: 'my-app'
 * });
 *
 * // Create Cognito client
 * const auth = await getAuth({
 *   type: 'cognito',
 *   region: 'us-east-1',
 *   userPoolId: 'us-east-1_xxx',
 *   clientId: 'xxx'
 * });
 *
 * // Create Nostr client
 * const auth = await getAuth({
 *   type: 'nostr',
 *   relays: ['wss://relay.damus.io', 'wss://nos.lol']
 * });
 *
 * // Use environment variables
 * // Set: HAVE_AUTH_TYPE=keycloak, HAVE_AUTH_SERVER_URL=..., etc.
 * const auth = await getAuth({} as GetAuthOptions);
 * ```
 */
export async function getAuth(options: GetAuthOptions): Promise<AuthInterface> {
  // Load environment variables with user options taking precedence
  const configuredOptions = loadEnvConfig(
    options as unknown as Record<string, unknown>,
    {
      packageName: 'auth',
      schema: {
        type: 'string',
        serverUrl: 'string',
        realm: 'string',
        clientId: 'string',
        clientSecret: 'string',
        redirectUri: 'string',
        scopes: 'string', // Will be comma-separated
        region: 'string',
        userPoolId: 'string',
        domain: 'string',
        relays: 'string', // Will be comma-separated
        privateKey: 'string',
        challengeExpiration: 'number',
        relayTimeout: 'number',
        timeout: 'number',
        maxRetries: 'number',
      },
      transform: {
        // Transform comma-separated strings to arrays
        relays: (value: string) =>
          value
            .split(',')
            .map((r) => r.trim())
            .filter(Boolean),
        scopes: (value: string) =>
          value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
      },
    },
  ) as unknown as GetAuthOptions;
  options = configuredOptions;

  if (isKeycloakOptions(options)) {
    const { KeycloakProvider } = await import('./providers/keycloak.js');
    return new KeycloakProvider(options);
  }

  if (isCognitoOptions(options)) {
    const { CognitoProvider } = await import('./providers/cognito.js');
    return new CognitoProvider(options);
  }

  if (isNostrOptions(options)) {
    const { NostrProvider } = await import('./providers/nostr/index.js');
    return new NostrProvider(options);
  }

  throw new ValidationError('Unsupported auth provider type', {
    supportedTypes: ['keycloak', 'cognito', 'nostr'],
    providedType: (options as Record<string, unknown>).type,
  });
}

/**
 * Auto-detect provider based on available configuration.
 *
 * @param options - Configuration options that may contain provider-specific settings
 * @returns Promise resolving to an AuthInterface based on detected configuration
 * @throws {ValidationError} When no provider can be detected
 *
 * @example
 * ```typescript
 * // Auto-detect Keycloak from serverUrl and realm
 * const auth = await getAuthAuto({
 *   serverUrl: 'https://auth.example.com',
 *   realm: 'my-realm',
 *   clientId: 'my-app'
 * });
 *
 * // Auto-detect Cognito from region and userPoolId
 * const auth = await getAuthAuto({
 *   region: 'us-east-1',
 *   userPoolId: 'us-east-1_xxx',
 *   clientId: 'xxx'
 * });
 *
 * // Auto-detect Nostr from relays
 * const auth = await getAuthAuto({
 *   relays: ['wss://relay.damus.io']
 * });
 * ```
 */
export async function getAuthAuto(
  options: Record<string, unknown>,
): Promise<AuthInterface> {
  // Detect Keycloak from serverUrl and realm
  if (options.serverUrl && options.realm) {
    return getAuth({ ...options, type: 'keycloak' } as KeycloakOptions);
  }

  // Detect Cognito from region and userPoolId
  if (options.region && options.userPoolId) {
    return getAuth({ ...options, type: 'cognito' } as CognitoOptions);
  }

  // Detect Nostr from relays
  if (
    options.relays &&
    Array.isArray(options.relays) &&
    options.relays.length > 0
  ) {
    return getAuth({ ...options, type: 'nostr' } as NostrOptions);
  }

  throw new ValidationError(
    'Could not auto-detect auth provider from options',
    {
      hint: 'Please specify a "type" field or provide provider-specific configuration',
      supportedTypes: ['keycloak', 'cognito', 'nostr'],
      providedOptions: Object.keys(options),
    },
  );
}
