import type {
  CreatePaymentOptionInput,
  PaymentBackend,
  PaymentBackendCapabilities,
  PaymentOption,
} from './types';

export interface PaymentBackendConformanceOptions {
  createBackend: () => PaymentBackend;
  sampleInput?: CreatePaymentOptionInput;
}

export interface PaymentBackendConformanceCase {
  name: string;
  run: () => Promise<void>;
}

const DEFAULT_SAMPLE_INPUT: CreatePaymentOptionInput = {
  quoteId: 'quote-conformance-1',
  usdAmount: 12.34,
  expiresAt: new Date('2030-01-01T00:00:00.000Z'),
};

export function createPaymentBackendConformanceCases(
  options: PaymentBackendConformanceOptions,
): PaymentBackendConformanceCase[] {
  return [
    {
      name: 'declares stable payment capabilities',
      run: async () => {
        assertCapabilities(options.createBackend().capabilities);
      },
    },
    {
      name: 'creates a payment option for a quote',
      run: async () => {
        const backend = options.createBackend();
        const input = options.sampleInput ?? DEFAULT_SAMPLE_INPUT;
        const option = await backend.createPaymentOption(input);
        assertPaymentOption(backend.capabilities, input, option);
      },
    },
    {
      name: 'returns an idempotent quote status',
      run: async () => {
        const backend = options.createBackend();
        const input = options.sampleInput ?? DEFAULT_SAMPLE_INPUT;
        const option = await backend.createPaymentOption(input);
        const status = await backend.getStatus({
          quoteId: option.quoteId,
          payTo: option.payTo,
        });

        assert(status.backendId === backend.capabilities.id, 'status backend id mismatch');
        assert(status.quoteId === option.quoteId, 'status quote id mismatch');
        assert(status.payTo === option.payTo, 'status payTo mismatch');
      },
    },
  ];
}

function assertCapabilities(capabilities: PaymentBackendCapabilities): void {
  assert(capabilities.id.length > 0, 'capability id is required');
  assert(capabilities.settlementCurrency.length > 0, 'settlement currency is required');
  assert(capabilities.chainId.length > 0, 'chain id/provider id is required');
  assert(
    capabilities.typicalConfirmationLatencyMs >= 0,
    'typical confirmation latency must be non-negative',
  );
}

function assertPaymentOption(
  capabilities: PaymentBackendCapabilities,
  input: CreatePaymentOptionInput,
  option: PaymentOption,
): void {
  assert(option.backendId === capabilities.id, 'payment option backend id mismatch');
  assert(option.quoteId === input.quoteId, 'payment option quote id mismatch');
  assert(option.usdAmount === input.usdAmount, 'payment option amount mismatch');
  assert(option.payTo.length > 0, 'payment option payTo is required');
  assert(
    option.settlementCurrency === capabilities.settlementCurrency,
    'payment option settlement currency mismatch',
  );
  assert(
    option.settlementShape === capabilities.settlementShape,
    'payment option settlement shape mismatch',
  );
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
