import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createQuickBooksOAuthClient,
  QuickBooksOAuthError,
} from '../../index.js';

const oauth = vi.hoisted(() => {
  const authorizeUri = vi.fn();
  const createToken = vi.fn();
  const revoke = vi.fn();
  const construct = vi.fn();
  class MockOAuthClient {
    constructor(options: unknown) {
      construct(options);
    }
    authorizeUri = authorizeUri;
    createToken = createToken;
    revoke = revoke;
  }
  return { authorizeUri, createToken, revoke, construct, MockOAuthClient };
});

vi.mock('intuit-oauth', () => ({ default: oauth.MockOAuthClient }));

const options = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  environment: 'sandbox' as const,
  redirectUri: 'https://app.example.test/api/accounting/quickbooks/callback',
};
const callback = `${options.redirectUri}?code=authorization-code&realmId=realm-17&state=opaque-state`;

async function client() {
  return createQuickBooksOAuthClient(options);
}

describe('QuickBooks OAuth client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    oauth.authorizeUri.mockReturnValue(
      'https://appcenter.intuit.com/connect/oauth2?state=opaque-state',
    );
    oauth.createToken.mockResolvedValue({
      getJson: () => ({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        token_type: 'bearer',
        scope: 'com.intuit.quickbooks.accounting openid',
      }),
    });
    oauth.revoke.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('constructs the official client and requests only the accounting scope', async () => {
    const connection = await client();
    expect(connection.authorizationUrl({ state: 'opaque-state' })).toBe(
      'https://appcenter.intuit.com/connect/oauth2?state=opaque-state',
    );
    expect(oauth.construct).toHaveBeenCalledWith(options);
    expect(oauth.authorizeUri).toHaveBeenCalledWith({
      scope: ['com.intuit.quickbooks.accounting'],
      state: 'opaque-state',
    });
  });

  it('validates and exchanges one callback into public tokens', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T18:00:00Z'));
    const result = await (await client()).exchangeCallback({
      callbackUrl: callback,
      expectedState: 'opaque-state',
    });
    expect(oauth.createToken).toHaveBeenCalledWith(callback);
    expect(result).toEqual({
      realmId: 'realm-17',
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date('2026-10-04T19:00:00Z'),
        tokenType: 'bearer',
      },
      grantedScopes: ['com.intuit.quickbooks.accounting', 'openid'],
    });
  });

  it.each([
    ['wrong origin', callback.replace('app.example.test', 'evil.example.test')],
    ['wrong path', callback.replace('/callback?', '/other?')],
    [
      'callback error',
      `${options.redirectUri}?error=access_denied&state=opaque-state`,
    ],
    ['duplicate code', `${callback}&code=second`],
    ['missing code', callback.replace('code=authorization-code&', '')],
    ['duplicate realm', `${callback}&realmId=second`],
    ['missing realm', callback.replace('realmId=realm-17&', '')],
    ['duplicate state', `${callback}&state=second`],
    ['missing state', callback.replace('&state=opaque-state', '')],
  ])('rejects %s before token exchange', async (_label, callbackUrl) => {
    const connection = await client();
    await expect(
      connection.exchangeCallback({
        callbackUrl,
        expectedState: 'opaque-state',
      }),
    ).rejects.toBeInstanceOf(QuickBooksOAuthError);
    expect(oauth.createToken).not.toHaveBeenCalled();
  });

  it('rejects mismatched state before token exchange', async () => {
    await expect(
      (await client()).exchangeCallback({
        callbackUrl: callback,
        expectedState: 'different-state',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(oauth.createToken).not.toHaveBeenCalled();
  });

  it('requires a nonempty caller-owned state for authorization', async () => {
    const connection = await client();
    expect(() => connection.authorizationUrl({ state: '' })).toThrow(
      expect.objectContaining({ code: 'INVALID_STATE' }),
    );
    expect(oauth.authorizeUri).not.toHaveBeenCalled();
  });

  it.each([
    { ...options, clientId: '' },
    { ...options, clientSecret: ' spaced ' },
    { ...options, environment: 'unknown' as 'sandbox' },
    { ...options, redirectUri: 'javascript:alert(1)' },
    { ...options, redirectUri: `${options.redirectUri}?tenant=secret` },
  ])('rejects invalid configuration before constructing a client', async (value) => {
    await expect(createQuickBooksOAuthClient(value)).rejects.toMatchObject({
      code: 'INVALID_CONFIGURATION',
    });
    expect(oauth.construct).not.toHaveBeenCalled();
  });

  it.each([
    { access_token: 'authorization-code' },
    { access_token: 'access', refresh_token: 'refresh', expires_in: '3600' },
    { access_token: 'access', refresh_token: 'refresh', expires_in: -1 },
    {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: Number.MAX_VALUE,
    },
  ])('rejects malformed token response %# with a sanitized error', async (token) => {
    oauth.createToken.mockResolvedValue({ getJson: () => token });
    const error = await (await client())
      .exchangeCallback({
        callbackUrl: callback,
        expectedState: 'opaque-state',
      })
      .catch((caught) => caught);
    expect(error).toMatchObject({ code: 'EXCHANGE_FAILED' });
    expect(error.message).not.toContain('authorization-code');
    expect(error).not.toHaveProperty('cause');
  });

  it('sanitizes official exchange failures', async () => {
    oauth.createToken.mockRejectedValue(
      new Error(`${callback} ${options.clientSecret} refresh-secret`),
    );
    const error = await (await client())
      .exchangeCallback({
        callbackUrl: callback,
        expectedState: 'opaque-state',
      })
      .catch((caught) => caught);
    expect(error).toMatchObject({ code: 'EXCHANGE_FAILED' });
    expect(error.message).toBe('QuickBooks OAuth token exchange failed');
    expect(error).not.toHaveProperty('cause');
  });

  it('revokes a supplied refresh token through the official client', async () => {
    await (await client()).revoke({ refreshToken: 'refresh-token' });
    expect(oauth.revoke).toHaveBeenCalledWith({
      refresh_token: 'refresh-token',
    });
  });

  it('rejects blank tokens locally and sanitizes revocation failures', async () => {
    const connection = await client();
    await expect(connection.revoke({ refreshToken: '' })).rejects.toMatchObject(
      {
        code: 'INVALID_TOKEN',
      },
    );
    expect(oauth.revoke).not.toHaveBeenCalled();

    oauth.revoke.mockRejectedValue(new Error('refresh-token client-secret'));
    const error = await connection
      .revoke({ refreshToken: 'refresh-token' })
      .catch((caught) => caught);
    expect(error).toMatchObject({ code: 'REVOCATION_FAILED' });
    expect(error).not.toHaveProperty('cause');
  });

  it('sanitizes authorization URL failures', async () => {
    oauth.authorizeUri.mockImplementation(() => {
      throw new Error(`${options.clientSecret} opaque-state`);
    });
    const connection = await client();
    let caught: unknown;
    try {
      connection.authorizationUrl({ state: 'opaque-state' });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      code: 'AUTHORIZATION_FAILED',
      message: 'QuickBooks OAuth authorization failed',
    });
    expect(caught).not.toHaveProperty('cause');
  });
});
