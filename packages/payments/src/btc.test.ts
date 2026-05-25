import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  BTC_BACKEND_ID,
  BtcAdapter,
  defaultBtcConfirmationPolicy,
  verifyBtcpayWebhookSignature,
} from './adapters/btc.js';
import { definePaymentBackendConformanceTests } from './testing/conformance.js';

const btcAddress = 'bc1qexamplepaymentaddress0000000000000000000';
const btcpayWebhookSecret = 'secret';
const futureExpiryOffsetMs = 365 * 24 * 60 * 60 * 1_000;

function futureExpiresAt(): string {
  return new Date(
    Math.floor((Date.now() + futureExpiryOffsetMs) / 1_000) * 1_000,
  ).toISOString();
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function createBtcpayFetch() {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/invoices') && init?.method === 'POST') {
      return jsonResponse({
        id: 'inv_123',
        checkoutLink: 'https://btcpay.example/i/inv_123',
        paymentMethods: [
          {
            paymentMethod: 'BTC',
            destination: btcAddress,
            paymentLink: `bitcoin:${btcAddress}?amount=0.00042`,
            amount: '0.00042',
            rate: '30000',
          },
        ],
      });
    }

    if (url.endsWith('/invoices/inv_123')) {
      return jsonResponse({
        id: 'inv_123',
        status: 'Settled',
        amountPaid: '0.00042',
        payments: [{ confirmations: 2, transactionId: 'btc-tx-123' }],
      });
    }

    if (url.includes('/wallet/transactions') && init?.method === 'POST') {
      return jsonResponse({
        id: 'payout_123',
        unsignedPsbt: 'cHNidP8BAHECAAAAAQ==',
      });
    }

    return jsonResponse({ message: 'not found' }, 404);
  });
}

function createAdapter() {
  return new BtcAdapter({
    baseUrl: 'https://btcpay.example',
    apiKey: 'api-key',
    storeId: 'store_123',
    fetch: createBtcpayFetch(),
  });
}

function createWebhookAdapter() {
  return new BtcAdapter({
    baseUrl: 'https://btcpay.example',
    apiKey: 'api-key',
    storeId: 'store_123',
    fetch: createBtcpayFetch(),
    webhookSecret: btcpayWebhookSecret,
  });
}

function btcpayWebhookSignature(payload: string): string {
  return `sha256=${createHmac('sha256', btcpayWebhookSecret)
    .update(payload)
    .digest('hex')}`;
}

function storedQuoteIds(adapter: unknown): string[] {
  return [
    ...(
      adapter as { optionsByQuote: Map<string, unknown> }
    ).optionsByQuote.keys(),
  ];
}

definePaymentBackendConformanceTests(
  'BtcAdapter',
  {
    createBackend: createAdapter,
    expectedCapabilities: {
      id: BTC_BACKEND_ID,
      settlementCurrency: 'BTC',
      chain: 'bitcoin',
      settlementShape: 'address',
      x402Capable: false,
    },
    expectedOption: {
      payTo: btcAddress,
      settlementAmount: 42_000,
    },
    expectedStatus: {
      status: 'confirmed',
      confirmations: 2,
      transactionId: 'btc-tx-123',
    },
    payoutInput: {
      destination: btcAddress,
      amount: 10_000,
      currency: 'BTC',
    },
    expectedPayout: {
      status: 'pending_signature',
      psbt: 'cHNidP8BAHECAAAAAQ==',
    },
  },
  { describe, expect, it },
);

describe('BtcAdapter', () => {
  it('evicts older stored payment options when cache capacity is reached', async () => {
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch: createBtcpayFetch(),
      maxStoredPaymentOptions: 1,
    });

    await adapter.createPaymentOption({
      quoteId: 'quote-1',
      amount: 1000,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });
    await adapter.createPaymentOption({
      quoteId: 'quote-2',
      amount: 2000,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });

    expect(storedQuoteIds(adapter)).toEqual(['quote-2']);
  });

  it('uses the tiered confirmation policy from the issue', () => {
    expect(
      defaultBtcConfirmationPolicy({ amount: 9999, currency: 'USD' }),
    ).toBe(1);
    expect(
      defaultBtcConfirmationPolicy({ amount: 10000, currency: 'USD' }),
    ).toBe(2);
    expect(
      defaultBtcConfirmationPolicy({ amount: 100000, currency: 'USD' }),
    ).toBe(3);
  });

  it('verifies BTCPay webhook signatures', () => {
    const payload = JSON.stringify({ type: 'InvoiceSettled' });
    const signature = `sha256=${createHmac('sha256', 'secret')
      .update(payload)
      .digest('hex')}`;

    expect(() =>
      verifyBtcpayWebhookSignature(payload, signature, 'secret'),
    ).not.toThrow();
  });

  it('rejects blank BTCPay webhook secrets in the exported verifier', () => {
    expect(() =>
      verifyBtcpayWebhookSignature('{}', 'sha256=abc123', ' '),
    ).toThrow('BTCPay webhook secret must not be empty');
  });

  it('rejects non-string BTCPay webhook verifier inputs', () => {
    expect(() =>
      verifyBtcpayWebhookSignature(123 as never, 'sha256=abc123', 'secret'),
    ).toThrow('BTCPay webhook payload must be a string');
    expect(() =>
      verifyBtcpayWebhookSignature('{}', 123 as never, 'secret'),
    ).toThrow('BTCPay webhook signature must be a string');
  });

  it('rejects non-hex BTCPay webhook signatures before constant-time compare', () => {
    expect(() =>
      verifyBtcpayWebhookSignature('{}', `sha256=${'z'.repeat(64)}`, 'secret'),
    ).toThrow('Invalid BTCPay webhook signature');
  });

  it('requires webhook signatures when a BTCPay secret is configured', () => {
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch: createBtcpayFetch(),
      webhookSecret: 'secret',
    });

    expect(() =>
      adapter.parseWebhookEvent(JSON.stringify({ type: 'InvoiceSettled' })),
    ).toThrow('Missing BTCPay webhook signature');
  });

  it('requires a configured BTCPay webhook secret before parsing webhooks', () => {
    const adapter = createAdapter();
    const payload = JSON.stringify({ type: 'InvoiceSettled' });

    expect(() =>
      adapter.parseWebhookEvent(payload, btcpayWebhookSignature(payload)),
    ).toThrow('parseWebhookEvent requires webhookSecret');
  });

  it('rejects blank webhook secrets instead of disabling BTCPay verification', () => {
    expect(
      () =>
        new BtcAdapter({
          baseUrl: 'https://btcpay.example',
          apiKey: 'api-key',
          storeId: 'store_123',
          fetch: createBtcpayFetch(),
          webhookSecret: 123 as never,
        }),
    ).toThrow('webhookSecret must be a string');

    expect(
      () =>
        new BtcAdapter({
          baseUrl: 'https://btcpay.example',
          apiKey: 'api-key',
          storeId: 'store_123',
          fetch: createBtcpayFetch(),
          webhookSecret: '',
        }),
    ).toThrow('webhookSecret must not be empty');
  });

  it('rejects blank BTCPay currency and payment method overrides', () => {
    expect(
      () =>
        new BtcAdapter({
          baseUrl: 123 as never,
          apiKey: 'api-key',
          storeId: 'store_123',
          fetch: createBtcpayFetch(),
        }),
    ).toThrow('requires baseUrl');

    expect(
      () =>
        new BtcAdapter({
          baseUrl: 'https://btcpay.example',
          apiKey: 123 as never,
          storeId: 'store_123',
          fetch: createBtcpayFetch(),
        }),
    ).toThrow('requires apiKey');

    expect(
      () =>
        new BtcAdapter({
          baseUrl: 'https://btcpay.example',
          apiKey: 'api-key',
          storeId: 123 as never,
          fetch: createBtcpayFetch(),
        }),
    ).toThrow('requires storeId');

    expect(
      () =>
        new BtcAdapter({
          baseUrl: 'not-a-url',
          apiKey: 'api-key',
          storeId: 'store_123',
          fetch: createBtcpayFetch(),
        }),
    ).toThrow('BtcAdapter baseUrl must be a valid URL');

    expect(
      () =>
        new BtcAdapter({
          baseUrl: 'https://btcpay.example/store?token=abc',
          apiKey: 'api-key',
          storeId: 'store_123',
          fetch: createBtcpayFetch(),
        }),
    ).toThrow('baseUrl must be an origin URL');

    expect(
      () =>
        new BtcAdapter({
          baseUrl: 'https://btcpay.example',
          apiKey: 'api-key',
          storeId: 'store_123',
          fetch: createBtcpayFetch(),
          currency: 123 as never,
        }),
    ).toThrow('currency must be a three-letter currency code');

    expect(
      () =>
        new BtcAdapter({
          baseUrl: 'https://btcpay.example',
          apiKey: 'api-key',
          storeId: 'store_123',
          fetch: createBtcpayFetch(),
          currency: ' ',
        }),
    ).toThrow('currency must be a three-letter currency code');

    expect(
      () =>
        new BtcAdapter({
          baseUrl: 'https://btcpay.example',
          apiKey: 'api-key',
          storeId: 'store_123',
          fetch: createBtcpayFetch(),
          currency: 'US1',
        }),
    ).toThrow('currency must be a three-letter currency code');

    expect(
      () =>
        new BtcAdapter({
          baseUrl: 'https://btcpay.example',
          apiKey: 'api-key',
          storeId: 'store_123',
          fetch: createBtcpayFetch(),
          paymentMethod: 123 as never,
        }),
    ).toThrow('paymentMethod must be a string');

    expect(
      () =>
        new BtcAdapter({
          baseUrl: 'https://btcpay.example',
          apiKey: 'api-key',
          storeId: 'store_123',
          fetch: createBtcpayFetch(),
          paymentMethod: ' ',
        }),
    ).toThrow('paymentMethod must not be empty');
  });

  it('trims optional BTCPay capability metadata', () => {
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch: createBtcpayFetch(),
      managedProviderName: '  BTCPay Cloud  ',
    });
    const blank = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch: createBtcpayFetch(),
      managedProviderName: ' ',
    });

    expect(adapter.capabilities.metadata).toMatchObject({
      managedProviderName: 'BTCPay Cloud',
    });
    expect(blank.capabilities.metadata).toMatchObject({
      managedProviderName: undefined,
    });
  });

  it('parses webhook events into the common status language', () => {
    const adapter = createWebhookAdapter();
    const payload = JSON.stringify({
      deliveryId: 'delivery_123',
      invoiceId: 'inv_123',
      type: 'InvoiceSettled',
      status: 'Settled',
      metadata: { quoteId: 'quote-123' },
    });
    const event = adapter.parseWebhookEvent(
      payload,
      btcpayWebhookSignature(payload),
    );

    expect(event).toMatchObject({
      deliveryId: 'delivery_123',
      invoiceId: 'inv_123',
      status: 'confirmed',
      quoteId: 'quote-123',
    });
  });

  it('maps BTCPay webhook event types when status fields are absent', () => {
    const adapter = createWebhookAdapter();
    const payload = JSON.stringify({
      deliveryId: 'delivery_123',
      type: 'InvoiceSettled',
      metadata: { quoteId: 'quote-123' },
    });

    expect(
      adapter.parseWebhookEvent(payload, btcpayWebhookSignature(payload)),
    ).toMatchObject({
      status: 'confirmed',
      quoteId: 'quote-123',
    });
  });

  it('does not classify incomplete BTCPay events as confirmed', () => {
    const adapter = createWebhookAdapter();
    const payload = JSON.stringify({
      deliveryId: 'delivery_123',
      type: 'InvoiceIncomplete',
      status: 'Incomplete',
    });

    expect(
      adapter.parseWebhookEvent(payload, btcpayWebhookSignature(payload)),
    ).toMatchObject({
      status: 'pending',
    });
  });

  it('does not classify unpaid BTCPay statuses as processing', () => {
    const adapter = createWebhookAdapter();
    const payload = JSON.stringify({
      deliveryId: 'delivery_123',
      type: 'InvoiceStatusChanged',
      status: 'Unpaid',
    });

    expect(
      adapter.parseWebhookEvent(payload, btcpayWebhookSignature(payload)),
    ).toMatchObject({
      status: 'pending',
    });
  });

  it('trims optional BTCPay webhook identifiers', () => {
    const adapter = createWebhookAdapter();
    const payload = JSON.stringify({
      deliveryId: ' delivery_123 ',
      invoiceId: ' inv_123 ',
      type: ' InvoiceSettled ',
      metadata: { quoteId: ' quote-123 ' },
    });

    expect(
      adapter.parseWebhookEvent(payload, btcpayWebhookSignature(payload)),
    ).toMatchObject({
      deliveryId: 'delivery_123',
      invoiceId: 'inv_123',
      type: 'InvoiceSettled',
      quoteId: 'quote-123',
      status: 'confirmed',
    });
  });

  it('ignores non-string optional BTCPay webhook identifiers', () => {
    const adapter = createWebhookAdapter();
    const payload = JSON.stringify({
      deliveryId: 'delivery_123',
      invoiceId: 456,
      type: 'InvoiceSettled',
      metadata: { quoteId: 789 },
    });

    expect(
      adapter.parseWebhookEvent(payload, btcpayWebhookSignature(payload)),
    ).toMatchObject({
      deliveryId: 'delivery_123',
      invoiceId: undefined,
      quoteId: undefined,
      status: 'confirmed',
    });
  });

  it('requires BTCPay webhook delivery ids for replay deduplication', () => {
    const adapter = createWebhookAdapter();
    const payload = JSON.stringify({
      type: 'InvoiceSettled',
      status: 'Settled',
    });

    expect(() =>
      adapter.parseWebhookEvent(payload, btcpayWebhookSignature(payload)),
    ).toThrow('BTCPay webhook deliveryId is required');
  });

  it('marks duplicate BTCPay webhook delivery ids', () => {
    const adapter = createWebhookAdapter();
    const payload = JSON.stringify({
      deliveryId: 'delivery_replayed',
      type: 'InvoiceSettled',
      status: 'Settled',
    });
    const signature = btcpayWebhookSignature(payload);

    expect(adapter.parseWebhookEvent(payload, signature).duplicate).toBe(false);
    expect(adapter.parseWebhookEvent(payload, signature)).toMatchObject({
      duplicate: true,
    });
  });

  it('wraps malformed BTCPay webhook JSON in a provider error', () => {
    const adapter = createWebhookAdapter();

    expect(() =>
      adapter.parseWebhookEvent('not-json', btcpayWebhookSignature('not-json')),
    ).toThrow('Invalid BTCPay webhook JSON payload');
  });

  it('fails invoice creation when BTCPay does not return a BTC address and amount', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/invoices')) {
        return jsonResponse({
          id: 'inv_without_btc',
          checkoutLink: 'https://btcpay.example/i/inv_without_btc',
          paymentMethods: [],
        });
      }

      if (url.endsWith('/payment-methods')) {
        return jsonResponse([]);
      }

      return jsonResponse({ message: 'not found' }, 404);
    });
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-123',
        amount: 1234,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('payment address and amount');
  });

  it('fails invoice creation when BTCPay returns a zero BTC amount', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/invoices')) {
        return jsonResponse({
          id: 'inv_zero_btc',
          checkoutLink: 'https://btcpay.example/i/inv_zero_btc',
          paymentMethods: [
            {
              paymentMethod: 'BTC',
              destination: btcAddress,
              amount: '0',
            },
          ],
        });
      }

      return jsonResponse({ message: 'not found' }, 404);
    });
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-zero-btc',
        amount: 1234,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('payment address and amount');
  });

  it('rejects blank BTCPay quote ids before invoice creation', async () => {
    const fetch = createBtcpayFetch();
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: ' ',
        amount: 1234,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('BTC quoteId must not be empty');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('ignores malformed BTCPay payment method entries', async () => {
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch: vi.fn(async (input: string | URL | Request) => {
        const url = String(input);

        if (url.endsWith('/invoices')) {
          return jsonResponse({
            id: 'inv_malformed_methods',
            paymentMethods: [null],
          });
        }

        if (url.endsWith('/payment-methods')) {
          return jsonResponse([]);
        }

        return jsonResponse({ message: 'not found' }, 404);
      }),
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-malformed-methods',
        amount: 1234,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('payment address and amount');
  });

  it('matches lowercase BTC config to BTCPay Bitcoin method aliases', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/invoices')) {
        return jsonResponse({
          id: 'inv_bitcoin_alias',
          paymentMethods: [
            {
              paymentMethod: 'Bitcoin',
              destination: btcAddress,
              amount: '0.00042',
            },
          ],
        });
      }

      return jsonResponse({ message: 'not found' }, 404);
    });
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
      paymentMethod: 'btc',
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-bitcoin-alias',
        amount: 1234,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).resolves.toMatchObject({
      payTo: btcAddress,
      settlementAmount: 42_000,
      providerPaymentId: 'inv_bitcoin_alias',
    });
  });

  it('does not treat Lightning BTC methods as default onchain BTC matches', async () => {
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch: vi.fn(async (input: string | URL | Request) => {
        const url = String(input);

        if (url.endsWith('/invoices')) {
          return jsonResponse({
            id: 'inv_lightning_only',
            paymentMethods: [
              {
                paymentMethod: 'BTC-LN',
                cryptoCode: 'BTC',
                destination: btcAddress,
                amount: '0.00042',
              },
            ],
          });
        }

        if (url.endsWith('/payment-methods')) {
          return jsonResponse([]);
        }

        return jsonResponse({ message: 'not found' }, 404);
      }),
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-lightning-only',
        amount: 1234,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('payment address and amount');
  });

  it('trims BTCPay provider ids and URLs returned during invoice creation', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/invoices')) {
        return jsonResponse({
          id: ' inv_trimmed ',
          checkoutLink: ' https://btcpay.example/i/inv_trimmed ',
          paymentMethods: [
            {
              paymentMethod: 'BTC',
              destination: btcAddress,
              paymentLink: ` bitcoin:${btcAddress}?amount=0.00042 `,
              amount: '0.00042',
            },
          ],
        });
      }

      return jsonResponse({ message: 'not found' }, 404);
    });
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-provider-trim',
        amount: 1234,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).resolves.toMatchObject({
      providerPaymentId: 'inv_trimmed',
      paymentUri: `bitcoin:${btcAddress}?amount=0.00042`,
      metadata: {
        invoiceId: 'inv_trimmed',
        checkoutLink: 'https://btcpay.example/i/inv_trimmed',
      },
    });
  });

  it('rejects non-string BTCPay provider ids during invoice creation', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/invoices')) {
        return jsonResponse({
          id: 123,
          paymentMethods: [
            {
              paymentMethod: 'BTC',
              destination: btcAddress,
              amount: '0.00042',
            },
          ],
        });
      }

      return jsonResponse({ message: 'not found' }, 404);
    });
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-numeric-provider-id',
        amount: 1234,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('BTCPay invoice response did not include an invoice id');
  });

  it('rejects expired quotes before creating a BTCPay invoice', async () => {
    const fetch = createBtcpayFetch();
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-expired',
        amount: 1234,
        currency: 'USD',
        expiresAt: '2000-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('BTCPay invoice expiry is in the past');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects zero-value BTCPay invoice and payout requests', async () => {
    const fetch = createBtcpayFetch();
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-zero',
        amount: 0,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('BTCPay invoice amount must be greater than zero');
    await expect(
      adapter.sendPayout({
        destination: btcAddress,
        amount: 0,
        currency: 'BTC',
      }),
    ).rejects.toThrow('BTC payout amount must be greater than zero');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects fractional whole-unit BTCPay invoice amounts for Stripe special-case currencies', async () => {
    const fetch = createBtcpayFetch();
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-fractional-ugx',
        amount: 501,
        currency: 'UGX',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('BTCPay invoice amount for UGX');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects blank BTC payout destinations before calling BTCPay', async () => {
    const fetch = createBtcpayFetch();
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.sendPayout({
        destination: ' ',
        amount: 10_000,
        currency: ' btc ',
      }),
    ).rejects.toThrow('BTC payout destination must not be empty');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('trims BTC payout destination and currency inputs', async () => {
    const fetch = createBtcpayFetch();
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    const payout = await adapter.sendPayout({
      destination: ` ${btcAddress} `,
      amount: 10_000,
      currency: ' btc ',
      quoteId: ' quote-payout ',
    });
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));

    expect(payout.destination).toBe(btcAddress);
    expect(body.destinations[0].destination).toBe(btcAddress);
    expect(body.destinations[0].amount).toBe('0.0001');
    expect(body.metadata.quoteId).toBe('quote-payout');
  });

  it('rejects invalid BTC payout currencies before calling BTCPay', async () => {
    const fetch = createBtcpayFetch();
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.sendPayout({
        destination: btcAddress,
        amount: 10_000,
        currency: ' ',
      }),
    ).rejects.toThrow('BTC payout currency must not be empty');
    await expect(
      adapter.sendPayout({
        destination: btcAddress,
        amount: 10_000,
        currency: 123 as never,
      }),
    ).rejects.toThrow('BTC payout currency must be a string');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects non-BTC refund currencies before creating BTCPay payouts', async () => {
    const fetch = createBtcpayFetch();
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.refundPayment({
        destination: btcAddress,
        amount: 10_000,
        currency: 'USD',
      }),
    ).rejects.toThrow('BTC refunds require BTC currency');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards BTC refund idempotency keys to payout metadata', async () => {
    const fetch = createBtcpayFetch();
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await adapter.refundPayment({
      destination: btcAddress,
      amount: 10_000,
      currency: 'BTC',
      idempotencyKey: 'refund-idem-123',
    });

    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));

    expect(body.metadata.idempotencyKey).toBe('refund-idem-123');
  });

  it('rejects blank BTC payout quote ids before calling BTCPay', async () => {
    const fetch = createBtcpayFetch();
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.sendPayout({
        destination: btcAddress,
        amount: 10_000,
        quoteId: ' ',
      }),
    ).rejects.toThrow('BTC payout quoteId must not be empty');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('marks pending BTCPay status expired from persisted expiry context after restart', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/invoices/inv_pending')) {
        return jsonResponse({
          id: 'inv_pending',
          status: 'New',
        });
      }

      return jsonResponse({ message: 'not found' }, 404);
    });
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.getStatus('quote-expired', btcAddress, {
        providerPaymentId: 'inv_pending',
        expiresAt: '2000-01-01T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      status: 'expired',
    });
  });

  it('trims BTC status lookup inputs before provider lookup', async () => {
    const adapter = createAdapter();

    await expect(
      adapter.getStatus(' quote-123 ', ` ${btcAddress} `, {
        providerPaymentId: ' inv_123 ',
      }),
    ).resolves.toMatchObject({
      quoteId: 'quote-123',
      payTo: btcAddress,
      providerPaymentId: 'inv_123',
    });
  });

  it('rejects blank BTC status provider payment ids', async () => {
    const adapter = createAdapter();

    await expect(
      adapter.getStatus('quote-123', btcAddress, {
        providerPaymentId: ' ',
      }),
    ).rejects.toThrow('BTC providerPaymentId must not be empty');
  });

  it('does not recover status from a partial quote id match', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('/invoices?textSearch=')) {
        return jsonResponse({
          items: [
            {
              id: 'inv_wrong',
              status: 'Settled',
              metadata: { quoteId: 'quote-10' },
              payments: [{ confirmations: 2, transactionId: 'btc-tx-wrong' }],
            },
            {
              id: 'inv_exact',
              status: 'Settled',
              metadata: { quoteId: 'quote-1' },
              payments: [{ confirmations: 2, transactionId: 'btc-tx-exact' }],
            },
          ],
        });
      }

      return jsonResponse({ message: 'not found' }, 404);
    });
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.getStatus('quote-1', btcAddress),
    ).resolves.toMatchObject({
      providerPaymentId: 'inv_exact',
      transactionId: 'btc-tx-exact',
    });
  });

  it('does not recover status from a partial BTC destination match', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('/invoices?textSearch=')) {
        return jsonResponse({
          items: [
            {
              id: 'inv_wrong',
              status: 'Settled',
              paymentMethods: [{ destination: `${btcAddress}extra` }],
              payments: [{ confirmations: 2, transactionId: 'btc-tx-wrong' }],
            },
          ],
        });
      }

      return jsonResponse({ message: 'not found' }, 404);
    });
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(
      adapter.getStatus('quote-missing', btcAddress),
    ).rejects.toThrow('BTCPay invoice for quote quote-missing was not found');
  });

  it('does not recover status from arbitrary serialized quote text', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('/invoices?textSearch=')) {
        return jsonResponse({
          items: [
            {
              id: 'inv_wrong',
              status: 'Settled',
              metadata: { description: 'quote-1 is only descriptive text' },
              payments: [{ confirmations: 2, transactionId: 'btc-tx-wrong' }],
            },
          ],
        });
      }

      return jsonResponse({ message: 'not found' }, 404);
    });
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(adapter.getStatus('quote-1', btcAddress)).rejects.toThrow(
      'BTCPay invoice for quote quote-1 was not found',
    );
  });

  it('rejects ambiguous BTCPay invoice search matches', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('/invoices?textSearch=')) {
        return jsonResponse({
          items: [
            { id: 'inv_one', metadata: { quoteId: 'quote-1' } },
            { id: 'inv_two', metadata: { quoteId: 'quote-1' } },
          ],
        });
      }

      return jsonResponse({ message: 'not found' }, 404);
    });
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await expect(adapter.getStatus('quote-1', btcAddress)).rejects.toThrow(
      'BTCPay invoice lookup for quote quote-1 returned multiple matches',
    );
  });

  it('trims BTCPay endpoint, auth, store, currency, and method configuration', async () => {
    const fetch = createBtcpayFetch();
    const adapter = new BtcAdapter({
      baseUrl: ' https://btcpay.example/ ',
      apiKey: ' api-key ',
      storeId: ' store_123 ',
      fetch,
      currency: ' usd ',
      paymentMethod: ' btc ',
    });

    await adapter.createPaymentOption({
      quoteId: 'quote-trimmed-config',
      amount: 1234,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });

    const [url, init] = fetch.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));

    expect(String(url)).toBe(
      'https://btcpay.example/api/v1/stores/store_123/invoices',
    );
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'token api-key',
    );
    expect(body.amount).toBe('12.34');
    expect(body.currency).toBe('USD');
  });

  it('uses three-decimal currency precision for BTCPay invoice amounts', async () => {
    const fetch = createBtcpayFetch();
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await adapter.createPaymentOption({
      quoteId: 'quote-kwd',
      amount: 1234,
      currency: 'KWD',
      expiresAt: futureExpiresAt(),
    });

    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));

    expect(body.amount).toBe('1.234');
    expect(body.currency).toBe('KWD');
  });

  it('keeps reserved BTCPay metadata fields authoritative', async () => {
    const fetch = createBtcpayFetch();
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });

    await adapter.createPaymentOption({
      quoteId: 'quote-reserved',
      amount: 1234,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
      buyerEmail: 'buyer@example.com',
      description: 'Correct description',
      metadata: {
        quoteId: 'quote-wrong',
        buyerEmail: 'wrong@example.com',
        description: 'Wrong description',
      },
    });
    await adapter.sendPayout({
      destination: btcAddress,
      amount: 10_000,
      currency: 'BTC',
      quoteId: 'quote-payout',
      memo: 'Correct memo',
      metadata: {
        quoteId: 'quote-wrong',
        memo: 'Wrong memo',
      },
    });

    const createBody = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    const payoutBody = JSON.parse(String(fetch.mock.calls[1]?.[1]?.body));

    expect(createBody.metadata).toMatchObject({
      quoteId: 'quote-reserved',
      buyerEmail: 'buyer@example.com',
      description: 'Correct description',
    });
    expect(payoutBody.metadata).toMatchObject({
      quoteId: 'quote-payout',
      idempotencyKey: 'quote-payout',
      memo: 'Correct memo',
    });
  });

  it('keeps settled BTC invoices processing until the tiered confirmation count is met', async () => {
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith('/invoices') && init?.method === 'POST') {
          return jsonResponse({
            id: 'inv_456',
            paymentMethods: [
              {
                paymentMethod: 'BTC',
                destination: btcAddress,
                amount: '0.1',
              },
            ],
          });
        }

        if (url.endsWith('/invoices/inv_456')) {
          return jsonResponse({
            id: 'inv_456',
            status: 'Settled',
            payments: [{ confirmations: 1, transactionId: 'btc-tx-456' }],
          });
        }

        return jsonResponse({ message: 'not found' }, 404);
      },
    );
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
      confirmationPolicy: () => 3,
    });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-456',
      amount: 100000,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });

    await expect(
      adapter.getStatus('quote-456', option.payTo),
    ).resolves.toMatchObject({
      status: 'processing',
      confirmations: 1,
      requiredConfirmations: 3,
    });
  });

  it('reads BTC confirmations from payment methods when settled invoices omit them', async () => {
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith('/invoices') && init?.method === 'POST') {
          return jsonResponse({
            id: 'inv_method_confirmed',
            paymentMethods: [
              {
                paymentMethod: 'BTC',
                destination: btcAddress,
                amount: '0.1',
              },
            ],
          });
        }

        if (url.endsWith('/invoices/inv_method_confirmed')) {
          return jsonResponse({
            id: 'inv_method_confirmed',
            status: 'Settled',
          });
        }

        if (url.endsWith('/invoices/inv_method_confirmed/payment-methods')) {
          return jsonResponse([
            {
              paymentMethod: 'BTC',
              payments: [{ confirmations: 3 }],
            },
          ]);
        }

        return jsonResponse({ message: 'not found' }, 404);
      },
    );
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
      confirmationPolicy: () => 2,
    });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-method-confirmed',
      amount: 100000,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });

    await expect(
      adapter.getStatus('quote-method-confirmed', option.payTo),
    ).resolves.toMatchObject({
      status: 'confirmed',
      confirmations: 3,
      requiredConfirmations: 2,
    });
  });

  it('trims BTC status and payout provider identifiers', async () => {
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith('/invoices') && init?.method === 'POST') {
          return jsonResponse({
            id: ' inv_trimmed ',
            paymentMethods: [
              {
                paymentMethod: 'BTC',
                destination: btcAddress,
                amount: '0.00042',
              },
            ],
          });
        }

        if (url.endsWith('/invoices/inv_trimmed')) {
          return jsonResponse({
            id: ' inv_trimmed ',
            status: 'Settled',
            payments: [{ confirmations: 2, transactionId: ' btc-tx-trimmed ' }],
          });
        }

        if (url.includes('/wallet/transactions') && init?.method === 'POST') {
          return jsonResponse({
            id: ' payout_trimmed ',
            unsignedPsbt: ' cHNidP8BAHECAAAAAQ== ',
            transactionId: ' btc-payout-tx ',
          });
        }

        return jsonResponse({ message: 'not found' }, 404);
      },
    );
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
    });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-trimmed-status',
      amount: 1234,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });

    await expect(
      adapter.getStatus('quote-trimmed-status', option.payTo),
    ).resolves.toMatchObject({
      providerPaymentId: 'inv_trimmed',
      transactionId: 'btc-tx-trimmed',
    });
    await expect(
      adapter.sendPayout({
        destination: btcAddress,
        amount: 10_000,
      }),
    ).resolves.toMatchObject({
      payoutId: 'payout_trimmed',
      psbt: 'cHNidP8BAHECAAAAAQ==',
      transactionId: 'btc-payout-tx',
    });
  });

  it('ignores non-integer BTCPay confirmation counts', async () => {
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith('/invoices') && init?.method === 'POST') {
          return jsonResponse({
            id: 'inv_fractional_confirmations',
            paymentMethods: [
              {
                paymentMethod: 'BTC',
                destination: btcAddress,
                amount: '0.1',
              },
            ],
          });
        }

        if (url.endsWith('/invoices/inv_fractional_confirmations')) {
          return jsonResponse({
            id: 'inv_fractional_confirmations',
            status: 'Settled',
            payments: [{ confirmations: 1.5, transactionId: 'btc-tx-789' }],
          });
        }

        return jsonResponse({ message: 'not found' }, 404);
      },
    );
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
      confirmationPolicy: () => 1,
    });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-fractional-confirmations',
      amount: 1234,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });

    const status = await adapter.getStatus(
      'quote-fractional-confirmations',
      option.payTo,
    );

    expect(status.status).toBe('processing');
    expect(status.confirmations).toBeUndefined();
  });

  it('ignores exponent-formatted BTCPay confirmation counts', async () => {
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith('/invoices') && init?.method === 'POST') {
          return jsonResponse({
            id: 'inv_exponent_confirmations',
            paymentMethods: [
              {
                paymentMethod: 'BTC',
                destination: btcAddress,
                amount: '0.1',
              },
            ],
          });
        }

        if (url.endsWith('/invoices/inv_exponent_confirmations')) {
          return jsonResponse({
            id: 'inv_exponent_confirmations',
            status: 'Settled',
            payments: [{ confirmations: '1e3', transactionId: 'btc-tx-789' }],
          });
        }

        return jsonResponse({ message: 'not found' }, 404);
      },
    );
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch,
      confirmationPolicy: () => 1,
    });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-exponent-confirmations',
      amount: 1234,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });

    const status = await adapter.getStatus(
      'quote-exponent-confirmations',
      option.payTo,
    );

    expect(status.status).toBe('processing');
    expect(status.confirmations).toBeUndefined();
  });

  it('rejects invalid BTC confirmation policy results', async () => {
    const adapter = new BtcAdapter({
      baseUrl: 'https://btcpay.example',
      apiKey: 'api-key',
      storeId: 'store_123',
      fetch: createBtcpayFetch(),
      confirmationPolicy: () => -1,
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-invalid-policy',
        amount: 1234,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow(
      'confirmationPolicy result must be a non-negative integer',
    );
  });
});
