/**
 * @happyvertical/accounting - Basic tests
 */

import { describe, expect, it } from 'vitest';
import { getAccountingProvider } from './index.js';

describe('@happyvertical/accounting', () => {
  describe('getAccountingProvider', () => {
    it('should throw error for unknown provider type', async () => {
      await expect(
        getAccountingProvider({ type: 'unknown' as 'quickbooks' }),
      ).rejects.toThrow('Unknown provider type');
    });

    it('should create QuickBooks provider with valid options', async () => {
      // QuickBooks provider can be created with credentials
      // (validation happens at request time, not construction)
      const provider = await getAccountingProvider({
        type: 'quickbooks',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        realmId: 'test-realm-id',
        refreshToken: 'test-refresh-token',
      });

      expect(provider.type).toBe('quickbooks');
      expect(provider.customers).toBeDefined();
      expect(provider.invoices).toBeDefined();
      expect(provider.vendors).toBeDefined();
      expect(provider.bills).toBeDefined();
      expect(provider.payments).toBeDefined();
      expect(provider.audit).toBeDefined();
      expect(provider.webhooks).toBeDefined();
    });

    it('should export type guards', async () => {
      const { isQuickBooksOptions, isStripeOptions } = await import(
        './index.js'
      );

      expect(isQuickBooksOptions({ type: 'quickbooks' })).toBe(true);
      expect(isQuickBooksOptions({ type: 'stripe' })).toBe(false);
      expect(isStripeOptions({ type: 'stripe' })).toBe(true);
      expect(isStripeOptions({ type: 'quickbooks' })).toBe(false);
    });
  });
});
