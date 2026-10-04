import { createHash, timingSafeEqual } from 'node:crypto';
import { QuickBooksOAuthError } from '../../errors.js';
import type {
  QuickBooksOAuthClient,
  QuickBooksOAuthConnection,
  QuickBooksOAuthOptions,
  TokenSet,
} from '../../types.js';

const ACCOUNTING_SCOPE = 'com.intuit.quickbooks.accounting';

/** Create a public QuickBooks connection helper backed by Intuit's OAuth client. */
export async function createQuickBooksOAuthClient(
  options: QuickBooksOAuthOptions,
): Promise<QuickBooksOAuthClient> {
  const redirect = validateOptions(options);
  const OAuthClient = (await import('intuit-oauth')).default;
  let client: InstanceType<typeof OAuthClient>;
  try {
    client = new OAuthClient({
      clientId: options.clientId,
      clientSecret: options.clientSecret,
      environment: options.environment,
      redirectUri: options.redirectUri,
    });
  } catch {
    throw new QuickBooksOAuthError('INVALID_CONFIGURATION');
  }

  return {
    authorizationUrl({ state }) {
      validateOpaque(state, 'INVALID_STATE');
      try {
        return client.authorizeUri({ scope: [ACCOUNTING_SCOPE], state });
      } catch {
        throw new QuickBooksOAuthError('AUTHORIZATION_FAILED');
      }
    },

    async exchangeCallback({ callbackUrl, expectedState }) {
      validateOpaque(expectedState, 'INVALID_STATE');
      const callback = validateCallback(callbackUrl, redirect);
      const state = single(callback.searchParams, 'state', 'INVALID_STATE');
      validateOpaque(state, 'INVALID_STATE');
      if (!sameOpaqueValue(state, expectedState))
        throw new QuickBooksOAuthError('INVALID_STATE');
      const code = single(callback.searchParams, 'code', 'INVALID_CALLBACK');
      if (code.length > 4096)
        throw new QuickBooksOAuthError('INVALID_CALLBACK');
      const realmId = single(
        callback.searchParams,
        'realmId',
        'INVALID_CALLBACK',
      );
      if (realmId.length > 255)
        throw new QuickBooksOAuthError('INVALID_CALLBACK');
      for (const name of callback.searchParams.keys())
        if (!['code', 'realmId', 'state'].includes(name))
          throw new QuickBooksOAuthError('INVALID_CALLBACK');

      // Rebuild from the configured redirect and the three validated values.
      // intuit-oauth treats a callback `redirectUri` query as an override.
      const exchangeUrl = new URL(redirect);
      exchangeUrl.searchParams.set('code', code);
      exchangeUrl.searchParams.set('realmId', realmId);
      exchangeUrl.searchParams.set('state', state);

      try {
        const response = await client.createToken(exchangeUrl.toString());
        const token = response.getJson();
        const tokens = mapTokens(token);
        const grantedScopes = scopes(token.scope);
        return {
          realmId,
          tokens,
          ...(grantedScopes ? { grantedScopes } : {}),
        } satisfies QuickBooksOAuthConnection;
      } catch (error) {
        if (error instanceof QuickBooksOAuthError) throw error;
        throw new QuickBooksOAuthError('EXCHANGE_FAILED');
      }
    },

    async revoke({ refreshToken }) {
      validateOpaque(refreshToken, 'INVALID_TOKEN');
      try {
        await client.revoke({ refresh_token: refreshToken });
      } catch {
        throw new QuickBooksOAuthError('REVOCATION_FAILED');
      }
    },
  };
}

function validateOptions(options: QuickBooksOAuthOptions): URL {
  if (
    !options ||
    !['sandbox', 'production'].includes(options.environment) ||
    !nonempty(options.clientId) ||
    !nonempty(options.clientSecret) ||
    !nonempty(options.redirectUri)
  )
    throw new QuickBooksOAuthError('INVALID_CONFIGURATION');

  try {
    const redirect = new URL(options.redirectUri);
    if (
      !['http:', 'https:'].includes(redirect.protocol) ||
      redirect.username ||
      redirect.password ||
      redirect.search ||
      redirect.hash
    )
      throw new Error('invalid redirect');
    return redirect;
  } catch {
    throw new QuickBooksOAuthError('INVALID_CONFIGURATION');
  }
}

function validateCallback(callbackUrl: string, redirect: URL): URL {
  try {
    const callback = new URL(callbackUrl);
    if (
      callback.protocol !== redirect.protocol ||
      callback.origin !== redirect.origin ||
      callback.pathname !== redirect.pathname ||
      callback.username ||
      callback.password ||
      callback.hash ||
      callback.searchParams.has('error')
    )
      throw new Error('invalid callback');
    return callback;
  } catch {
    throw new QuickBooksOAuthError('INVALID_CALLBACK');
  }
}

function single(
  params: URLSearchParams,
  name: string,
  code: 'INVALID_STATE' | 'INVALID_CALLBACK',
): string {
  const values = params.getAll(name);
  if (values.length !== 1 || !nonempty(values[0]))
    throw new QuickBooksOAuthError(code);
  return values[0];
}

function validateOpaque(
  value: string,
  code: 'INVALID_STATE' | 'INVALID_TOKEN',
): void {
  if (!nonempty(value) || value.length > 4096)
    throw new QuickBooksOAuthError(code);
}

function sameOpaqueValue(actual: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(actual), digest(expected));
}

function mapTokens(token: {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
}): TokenSet {
  if (
    !nonempty(token?.access_token) ||
    !nonempty(token.refresh_token) ||
    typeof token.expires_in !== 'number' ||
    !Number.isFinite(token.expires_in) ||
    token.expires_in <= 0 ||
    (token.token_type !== undefined && !nonempty(token.token_type))
  )
    throw new QuickBooksOAuthError('EXCHANGE_FAILED');
  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  if (!Number.isFinite(expiresAt.getTime()))
    throw new QuickBooksOAuthError('EXCHANGE_FAILED');
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt,
    ...(token.token_type ? { tokenType: token.token_type } : {}),
  };
}

function scopes(value: unknown): string[] | undefined {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/\s+/)
      : [];
  const normalized = [
    ...new Set(values.filter((item): item is string => nonempty(item))),
  ];
  return normalized.length ? normalized : undefined;
}

function nonempty(value: unknown): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.trim() === value
  );
}
