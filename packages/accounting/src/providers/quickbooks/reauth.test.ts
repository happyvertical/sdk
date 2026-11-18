import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountingReauthRequiredError } from '../../index.js';
import { QuickBooksProvider } from './index.js';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('intuit-oauth', () => ({
  default: class {
    setToken() {}
    refresh = refresh;
  },
}));

function provider(onTokenRefresh?: () => Promise<void>) {
  return new QuickBooksProvider({
    type: 'quickbooks',
    clientId: 'test',
    clientSecret: 'test',
    refreshToken: 'old-refresh',
    realmId: 'realm-a',
    environment: 'sandbox',
    maxRetries: 0,
    onTokenRefresh,
  });
}

describe('QuickBooksProvider refresh grant rejection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    refresh.mockReset();
  });

  it('throws AccountingReauthRequiredError without calling the API or the persist hook', async () => {
    refresh.mockRejectedValue(
      Object.assign(new Error('invalid_grant'), {
        error: 'invalid_grant',
        error_description: 'Token invalid',
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onTokenRefresh = vi.fn();
    const caught = await provider(onTokenRefresh)
      .customers.pull('1')
      .catch((error: unknown) => error);
    expect(caught).toBeInstanceOf(AccountingReauthRequiredError);
    expect(caught).toMatchObject({
      code: 'REAUTH_REQUIRED',
      provider: 'quickbooks',
      realmId: 'realm-a',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onTokenRefresh).not.toHaveBeenCalled();
  });

  it('sanitizes other refresh failures without token or response fields', async () => {
    refresh.mockRejectedValue(
      Object.assign(new Error('boom secret-refresh-token'), {
        authResponse: { token: { refresh_token: 'secret-refresh-token' } },
        originalMessage: 'secret-refresh-token',
      }),
    );
    const caught = await provider()
      .ensureAccessToken()
      .catch((error: unknown) => error);
    expect(caught).not.toBeInstanceOf(AccountingReauthRequiredError);
    expect(caught).toMatchObject({ code: 'EXCHANGE_FAILED' });
    expect(caught).not.toHaveProperty('authResponse');
    expect(caught).not.toHaveProperty('cause');
    expect(JSON.stringify(caught)).not.toContain('secret');
    expect(String((caught as Error).message)).not.toContain('secret');
  });

  it('persists the rotated refresh token through onTokenRefresh', async () => {
    refresh.mockResolvedValue({
      getJson: () => ({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        token_type: 'bearer',
      }),
    });
    const onTokenRefresh = vi.fn().mockResolvedValue(undefined);
    await expect(provider(onTokenRefresh).ensureAccessToken()).resolves.toBe(
      'new-access',
    );
    expect(onTokenRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: 'new-refresh' }),
    );
  });
});
