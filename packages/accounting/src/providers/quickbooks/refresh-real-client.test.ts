import OAuthClient from 'intuit-oauth';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickBooksProvider } from './index.js';

// Deliberately does NOT mock intuit-oauth: its own refresh-token validity
// check ran before any request and made every refresh fail (sdk#1558).
function provider(refreshToken = 'old-refresh') {
  return new QuickBooksProvider({
    type: 'quickbooks',
    clientId: 'test-client',
    clientSecret: 'test-secret',
    refreshToken,
    realmId: 'realm-a',
    environment: 'sandbox',
    maxRetries: 0,
  });
}

describe('QuickBooksProvider refresh with the real intuit-oauth client', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends the refresh_token grant to the token endpoint and returns the rotated tokens', async () => {
    const send = vi
      .spyOn(
        OAuthClient.prototype as unknown as {
          getTokenRequest: (request: unknown) => Promise<unknown>;
        },
        'getTokenRequest',
      )
      .mockImplementation(async () => {
        const json = {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
          token_type: 'bearer',
        };
        return { json, getJson: () => json };
      });
    await expect(provider().ensureAccessToken()).resolves.toBe('new-access');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      method: 'POST',
      data: { grant_type: 'refresh_token', refresh_token: 'old-refresh' },
    });
  });
});
