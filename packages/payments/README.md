# @happyvertical/payments

Provider-neutral payment primitives for Happy Vertical quotes, settlement, x402 proof verification, and payouts.

This package intentionally contains only the interface and shared conformance tests. Concrete backends such as Base USDC, Stripe Checkout, or bank rails can live in sibling adapter packages while sharing the same quote/status/payout contract.

## Install

```bash
npm install @happyvertical/payments
```

## PaymentBackend shape

A backend declares its capabilities and implements:

- `createPaymentOption(input)` — create a unique address or checkout URL for a quote.
- `watchPayment(input)` — stream/poll payment updates for a quote option.
- `getStatus(input)` — idempotently return the current state of a quote option.
- `verifyX402Proof(input)` — optional x402 `X-Payment` proof verification for crypto-capable backends.
- `sendPayout(input)` — send a native payout or refund through the backend.

## Adapter conformance

Adapters can import `createPaymentBackendConformanceCases()` and run the returned cases in their own test suite:

```ts
import { createPaymentBackendConformanceCases } from '@happyvertical/payments';
import { describe, it } from 'vitest';
import { createBaseUsdcAdapter } from './base-usdc';

describe('BaseUsdcAdapter conformance', () => {
  for (const testCase of createPaymentBackendConformanceCases({
    createBackend: createBaseUsdcAdapter,
  })) {
    it(testCase.name, testCase.run);
  }
});
```

The initial suite checks stable capabilities, quote option creation, and idempotent status reads. Adapter-specific issues can extend it with watch, x402, refund, and payout cases.
