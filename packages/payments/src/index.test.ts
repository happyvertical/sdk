import { describe, expect, it } from 'vitest';
import {
  createPaymentBackendConformanceCases,
  type PaymentBackend,
  type PaymentUpdate,
} from './index';

function createMemoryBackend(): PaymentBackend {
  const updates = new Map<string, PaymentUpdate>();

  return {
    capabilities: {
      id: 'memory-usd',
      settlementCurrency: 'USD',
      chainId: 'memory',
      x402Capable: false,
      typicalConfirmationLatencyMs: 0,
      supportsRefunds: true,
      settlementShape: 'url',
    },
    async createPaymentOption(input) {
      const option = {
        backendId: 'memory-usd',
        quoteId: input.quoteId,
        settlementShape: 'url' as const,
        settlementCurrency: 'USD',
        payTo: `https://payments.example/quotes/${input.quoteId}`,
        usdAmount: input.usdAmount,
        expiresAt: input.expiresAt,
      };
      updates.set(input.quoteId, {
        backendId: option.backendId,
        quoteId: option.quoteId,
        payTo: option.payTo,
        status: 'pending',
      });
      return option;
    },
    async *watchPayment(input) {
      yield await this.getStatus(input);
    },
    async getStatus(input) {
      const update = updates.get(input.quoteId);
      if (!update) {
        throw new Error(`unknown quote ${input.quoteId}`);
      }
      return update;
    },
    async sendPayout(input) {
      return {
        id: 'payout-memory-1',
        status: 'confirmed',
        destination: input.destination,
        amount: input.amount,
        currency: input.currency,
      };
    },
  };
}

describe('payment backend conformance suite', () => {
  for (const testCase of createPaymentBackendConformanceCases({
    createBackend: createMemoryBackend,
  })) {
    it(testCase.name, async () => {
      await expect(testCase.run()).resolves.toBeUndefined();
    });
  }
});
