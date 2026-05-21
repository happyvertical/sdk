import type {
  CreatePaymentOptionInput,
  PaymentBackend,
  PaymentBackendCapabilities,
  PaymentOption,
  PaymentStatusResult,
  PayoutResult,
} from '../types.js';

type ConformanceExpectation = {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeInstanceOf(expected: unknown): void;
  toContain(expected: unknown): void;
  toMatchObject(expected: unknown): void;
  resolves: {
    toMatchObject(expected: unknown): Promise<void>;
  };
};

type ConformanceExpect = ((actual: unknown) => ConformanceExpectation) & {
  any(expected: unknown): unknown;
  objectContaining(expected: Record<string, unknown>): unknown;
};

export interface PaymentBackendConformanceTestApi {
  describe(name: string, callback: () => void): void;
  it(name: string, callback: () => void | Promise<void>): void;
  expect: ConformanceExpect;
}

export interface PaymentBackendConformanceHarness {
  createBackend(): PaymentBackend | Promise<PaymentBackend>;
  createPaymentOptionInput?: CreatePaymentOptionInput;
  expectedCapabilities?: Partial<PaymentBackendCapabilities>;
  expectedOption?: Partial<PaymentOption>;
  expectedStatus?: Partial<PaymentStatusResult>;
  payoutInput?: Parameters<PaymentBackend['sendPayout']>[0];
  expectedPayout?: Partial<PayoutResult>;
}

const futureExpiryOffsetMs = 365 * 24 * 60 * 60 * 1_000;

const defaultPaymentOptionInput: CreatePaymentOptionInput = {
  quoteId: 'quote-conformance',
  amount: 1234,
  currency: 'USD',
  expiresAt: new Date(Date.now() + futureExpiryOffsetMs),
};

export function definePaymentBackendConformanceTests(
  backendName: string,
  harness: PaymentBackendConformanceHarness,
  testApi = readGlobalConformanceTestApi(),
): void {
  const { describe, expect, it } = testApi;

  describe(`${backendName} PaymentBackend conformance`, () => {
    it('declares required capabilities', async () => {
      const backend = await harness.createBackend();

      expect(backend.capabilities.id).toEqual(expect.any(String));
      expect(backend.capabilities.displayName).toEqual(expect.any(String));
      expect(backend.capabilities.settlementCurrency).toEqual(
        expect.any(String),
      );
      expect(backend.capabilities.chain).toEqual(expect.any(String));
      expect(['address', 'url', 'psbt']).toContain(
        backend.capabilities.settlementShape,
      );
      expect(typeof backend.capabilities.x402Capable).toBe('boolean');
      expect(typeof backend.capabilities.supportsRefunds).toBe('boolean');
      expect(typeof backend.capabilities.supportsPayouts).toBe('boolean');
      expect(typeof backend.capabilities.supportsWebhooks).toBe('boolean');
      expect(
        backend.capabilities.confirmationLatency.expectedSeconds,
      ).toBeGreaterThanOrEqual(0);
      expect(backend.capabilities).toMatchObject(
        harness.expectedCapabilities ?? {},
      );
    });

    it('creates a payment option with stable quote metadata', async () => {
      const backend = await harness.createBackend();
      const input =
        harness.createPaymentOptionInput ?? defaultPaymentOptionInput;
      const option = await backend.createPaymentOption(input);

      expect(option.backendId).toBe(backend.capabilities.id);
      expect(option.quoteId).toBe(input.quoteId);
      expect(option.payTo).toEqual(expect.any(String));
      expect(option.settlementCurrency).toBe(
        backend.capabilities.settlementCurrency,
      );
      expect(option.settlementShape).toBe(backend.capabilities.settlementShape);
      expect(option.settlementAmount).toEqual(expect.any(Number));
      expect(option.amount).toBe(input.amount);
      expect(option.currency).toBe(input.currency);
      expect(option.expiresAt).toBeInstanceOf(Date);
      expect(option).toMatchObject(harness.expectedOption ?? {});
    });

    it('reports idempotent status for an option', async () => {
      const backend = await harness.createBackend();
      const input =
        harness.createPaymentOptionInput ?? defaultPaymentOptionInput;
      const option = await backend.createPaymentOption(input);
      const status = await backend.getStatus(input.quoteId, option.payTo);

      expect(status.backendId).toBe(backend.capabilities.id);
      expect(status.quoteId).toBe(input.quoteId);
      expect(status.payTo).toBe(option.payTo);
      expect(status.updatedAt).toBeInstanceOf(Date);
      expect(status).toMatchObject(harness.expectedStatus ?? {});
    });

    it('returns an async iterable from watchPayment', async () => {
      const backend = await harness.createBackend();
      const input =
        harness.createPaymentOptionInput ?? defaultPaymentOptionInput;
      const option = await backend.createPaymentOption(input);
      const stream = backend.watchPayment({
        quoteId: input.quoteId,
        payTo: option.payTo,
        pollIntervalMs: 1,
        timeoutMs: 1,
      });

      expect(typeof stream[Symbol.asyncIterator]).toBe('function');
      await expect(
        stream[Symbol.asyncIterator]().next(),
      ).resolves.toMatchObject({
        value: expect.objectContaining({
          backendId: backend.capabilities.id,
          quoteId: input.quoteId,
        }),
      });
    });

    it('sends payouts through the backend payout surface', async () => {
      const backend = await harness.createBackend();
      const payout = await backend.sendPayout(
        harness.payoutInput ?? {
          destination: 'destination-conformance',
          amount: 100,
          currency: 'USD',
        },
      );

      expect(payout.backendId).toBe(backend.capabilities.id);
      expect(payout.destination).toEqual(expect.any(String));
      expect(payout.amount).toEqual(expect.any(Number));
      expect(payout.currency).toEqual(expect.any(String));
      expect(payout).toMatchObject(harness.expectedPayout ?? {});
    });
  });
}

function readGlobalConformanceTestApi(): PaymentBackendConformanceTestApi {
  const candidate = globalThis as {
    describe?: unknown;
    expect?: unknown;
    it?: unknown;
  };

  if (
    typeof candidate.describe === 'function' &&
    typeof candidate.it === 'function' &&
    typeof candidate.expect === 'function' &&
    typeof (candidate.expect as { any?: unknown }).any === 'function' &&
    typeof (candidate.expect as { objectContaining?: unknown })
      .objectContaining === 'function'
  ) {
    return {
      describe:
        candidate.describe as PaymentBackendConformanceTestApi['describe'],
      expect: candidate.expect as ConformanceExpect,
      it: candidate.it as PaymentBackendConformanceTestApi['it'],
    };
  }

  throw new Error(
    'definePaymentBackendConformanceTests requires a test API. Pass { describe, expect, it } from Vitest or enable compatible test globals.',
  );
}
