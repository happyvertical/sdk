import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  STRIPE_BACKEND_ID,
  StripeAdapter,
  verifyStripeWebhookSignature,
} from './adapters/stripe.js';
import { definePaymentBackendConformanceTests } from './testing/conformance.js';

const checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_123';
const stripeWebhookSecret = 'whsec_test';
const futureExpiryOffsetMs = 60 * 60 * 1_000;

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

function createStripeFetch() {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);

    if (url.endsWith('/checkout/sessions') && init?.method === 'POST') {
      return jsonResponse({
        id: 'cs_test_123',
        url: checkoutUrl,
        ...Object.fromEntries([['payment_intent', 'pi_123']]),
      });
    }

    if (url.endsWith('/checkout/sessions/cs_test_123')) {
      return jsonResponse({
        id: 'cs_test_123',
        status: 'complete',
        ...Object.fromEntries([
          ['payment_status', 'paid'],
          ['payment_intent', 'pi_123'],
        ]),
      });
    }

    if (url.endsWith('/transfers') && init?.method === 'POST') {
      return jsonResponse({
        id: 'tr_123',
      });
    }

    if (url.endsWith('/refunds') && init?.method === 'POST') {
      return jsonResponse({
        id: 're_123',
        status: 'succeeded',
      });
    }

    return jsonResponse({ error: { message: 'not found' } }, 404);
  });
}

function createAdapter() {
  return new StripeAdapter({
    secretKey: 'sk_test_123',
    apiBaseUrl: 'https://stripe.example/v1',
    fetch: createStripeFetch(),
    successUrl: 'https://app.example/success',
    cancelUrl: 'https://app.example/cancel',
  });
}

function createWebhookAdapter() {
  return new StripeAdapter({
    secretKey: 'sk_test_123',
    apiBaseUrl: 'https://stripe.example/v1',
    fetch: createStripeFetch(),
    successUrl: 'https://app.example/success',
    cancelUrl: 'https://app.example/cancel',
    webhookSecret: stripeWebhookSecret,
  });
}

function stripeWebhookSignature(
  payload: string,
  timestamp = Math.floor(Date.now() / 1_000),
): string {
  const signature = createHmac('sha256', stripeWebhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  return `t=${timestamp},v1=${signature}`;
}

function storedQuoteIds(adapter: unknown): string[] {
  return [
    ...(
      adapter as { optionsByQuote: Map<string, unknown> }
    ).optionsByQuote.keys(),
  ];
}

definePaymentBackendConformanceTests(
  'StripeAdapter',
  {
    createBackend: createAdapter,
    createPaymentOptionInput: {
      quoteId: 'quote-conformance',
      amount: 1234,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    },
    expectedCapabilities: {
      id: STRIPE_BACKEND_ID,
      settlementCurrency: 'USD',
      chain: 'stripe',
      settlementShape: 'url',
      x402Capable: false,
    },
    expectedOption: {
      payTo: checkoutUrl,
      providerPaymentId: 'cs_test_123',
    },
    expectedStatus: {
      status: 'confirmed',
      transactionId: 'pi_123',
    },
    payoutInput: {
      destination: 'acct_123',
      amount: 2550,
      currency: 'USD',
    },
    expectedPayout: {
      status: 'submitted',
      payoutId: 'tr_123',
    },
  },
  { describe, expect, it },
);

describe('StripeAdapter', () => {
  it('evicts older stored payment options when cache capacity is reached', async () => {
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch: createStripeFetch(),
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
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

  it('verifies Stripe webhook signatures', () => {
    const timestamp = Math.floor(Date.now() / 1_000);
    const payload = JSON.stringify({ id: 'evt_123' });
    const signature = createHmac('sha256', 'whsec_test')
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    expect(() =>
      verifyStripeWebhookSignature(
        payload,
        `t=${timestamp},v1=${signature}`,
        'whsec_test',
      ),
    ).not.toThrow();
  });

  it('rejects blank Stripe webhook secrets in the exported verifier', () => {
    const timestamp = Math.floor(Date.now() / 1_000);

    expect(() =>
      verifyStripeWebhookSignature('{}', `t=${timestamp},v1=abc123`, ' '),
    ).toThrow('Stripe webhook secret must not be empty');
  });

  it('rejects non-string Stripe webhook verifier inputs', () => {
    const timestamp = Math.floor(Date.now() / 1_000);

    expect(() =>
      verifyStripeWebhookSignature(
        123 as never,
        `t=${timestamp},v1=abc123`,
        'whsec_test',
      ),
    ).toThrow('Stripe webhook payload must be a string');
    expect(() =>
      verifyStripeWebhookSignature('{}', 123 as never, 'whsec_test'),
    ).toThrow('Stripe signature header must be a string');
  });

  it('rejects invalid Stripe webhook timestamp tolerances', () => {
    const timestamp = Math.floor(Date.now() / 1_000);

    expect(() =>
      verifyStripeWebhookSignature(
        '{}',
        `t=${timestamp},v1=abc123`,
        'whsec_test',
        Number.NaN,
      ),
    ).toThrow('toleranceSeconds must be a non-negative finite number');
  });

  it('accepts any matching v1 signature in a Stripe rotation header', () => {
    const timestamp = Math.floor(Date.now() / 1_000);
    const payload = JSON.stringify({ id: 'evt_123' });
    const signature = createHmac('sha256', 'whsec_test')
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    expect(() =>
      verifyStripeWebhookSignature(
        payload,
        `t=${timestamp},v1=bad,v1=${signature}`,
        'whsec_test',
      ),
    ).not.toThrow();
  });

  it('rejects Stripe signature headers with nonnumeric timestamps', () => {
    const payload = JSON.stringify({ id: 'evt_123' });
    const signature = createHmac('sha256', 'whsec_test')
      .update(`not-a-number.${payload}`)
      .digest('hex');

    expect(() =>
      verifyStripeWebhookSignature(
        payload,
        `t=not-a-number,v1=${signature}`,
        'whsec_test',
      ),
    ).toThrow('Invalid Stripe signature header');
  });

  it('rejects Stripe signature headers with fractional timestamps', () => {
    const payload = JSON.stringify({ id: 'evt_123' });
    const signature = createHmac('sha256', 'whsec_test')
      .update(`123.45.${payload}`)
      .digest('hex');

    expect(() =>
      verifyStripeWebhookSignature(
        payload,
        `t=123.45,v1=${signature}`,
        'whsec_test',
        Number.MAX_SAFE_INTEGER,
      ),
    ).toThrow('Invalid Stripe signature header');
  });

  it('rejects Stripe signature headers with exponent timestamps', () => {
    const payload = JSON.stringify({ id: 'evt_123' });
    const signature = createHmac('sha256', 'whsec_test')
      .update(`1e3.${payload}`)
      .digest('hex');

    expect(() =>
      verifyStripeWebhookSignature(
        payload,
        `t=1e3,v1=${signature}`,
        'whsec_test',
        Number.MAX_SAFE_INTEGER,
      ),
    ).toThrow('Invalid Stripe signature header');
  });

  it('rejects Stripe signature headers with duplicate timestamps', () => {
    const timestamp = Math.floor(Date.now() / 1_000);
    const payload = JSON.stringify({ id: 'evt_123' });
    const signature = createHmac('sha256', 'whsec_test')
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    expect(() =>
      verifyStripeWebhookSignature(
        payload,
        `t=${timestamp},t=${timestamp},v1=${signature}`,
        'whsec_test',
      ),
    ).toThrow('Invalid Stripe signature header');
  });

  it('rejects Stripe signature headers with non-hex v1 signatures', () => {
    const timestamp = Math.floor(Date.now() / 1_000);

    expect(() =>
      verifyStripeWebhookSignature(
        '{}',
        `t=${timestamp},v1=not-hex`,
        'whsec_test',
      ),
    ).toThrow('Invalid Stripe signature header');
  });

  it('rejects Stripe signature headers with future timestamps', () => {
    const payload = JSON.stringify({ id: 'evt_123' });
    const timestamp = Math.floor(Date.now() / 1_000) + 60;
    const signature = createHmac('sha256', 'whsec_test')
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    expect(() =>
      verifyStripeWebhookSignature(
        payload,
        `t=${timestamp},v1=${signature}`,
        'whsec_test',
      ),
    ).toThrow('Stripe webhook signature timestamp is in the future');
  });

  it('requires webhook signatures when a Stripe secret is configured', () => {
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch: createStripeFetch(),
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
      webhookSecret: 'whsec_test',
    });

    expect(() =>
      adapter.parseWebhookEvent(JSON.stringify({ id: 'evt_123' })),
    ).toThrow('Missing Stripe webhook signature');
  });

  it('requires a configured Stripe webhook secret before parsing webhooks', () => {
    const adapter = createAdapter();
    const payload = JSON.stringify({
      id: 'evt_123',
      type: 'checkout.session.completed',
    });

    expect(() =>
      adapter.parseWebhookEvent(payload, stripeWebhookSignature(payload)),
    ).toThrow('parseWebhookEvent requires webhookSecret');
  });

  it('rejects blank webhook secrets instead of disabling Stripe verification', () => {
    expect(
      () =>
        new StripeAdapter({
          secretKey: 'sk_test_123',
          apiBaseUrl: 'https://stripe.example/v1',
          fetch: createStripeFetch(),
          successUrl: 'https://app.example/success',
          cancelUrl: 'https://app.example/cancel',
          webhookSecret: 123 as never,
        }),
    ).toThrow('webhookSecret must be a string');

    expect(
      () =>
        new StripeAdapter({
          secretKey: 'sk_test_123',
          apiBaseUrl: 'https://stripe.example/v1',
          fetch: createStripeFetch(),
          successUrl: 'https://app.example/success',
          cancelUrl: 'https://app.example/cancel',
          webhookSecret: '',
        }),
    ).toThrow('webhookSecret must not be empty');
  });

  it('rejects blank Stripe endpoint and currency overrides', () => {
    expect(
      () =>
        new StripeAdapter({
          secretKey: 123 as never,
          apiBaseUrl: 'https://stripe.example/v1',
          fetch: createStripeFetch(),
          successUrl: 'https://app.example/success',
          cancelUrl: 'https://app.example/cancel',
        }),
    ).toThrow('requires secretKey');

    expect(
      () =>
        new StripeAdapter({
          secretKey: 'sk_test_123',
          apiBaseUrl: 123 as never,
          fetch: createStripeFetch(),
          successUrl: 'https://app.example/success',
          cancelUrl: 'https://app.example/cancel',
        }),
    ).toThrow('apiBaseUrl must be a string');

    expect(
      () =>
        new StripeAdapter({
          secretKey: 'sk_test_123',
          apiBaseUrl: ' ',
          fetch: createStripeFetch(),
          successUrl: 'https://app.example/success',
          cancelUrl: 'https://app.example/cancel',
        }),
    ).toThrow('apiBaseUrl must not be empty');

    expect(
      () =>
        new StripeAdapter({
          secretKey: 'sk_test_123',
          apiBaseUrl: 'not-a-url',
          fetch: createStripeFetch(),
          successUrl: 'https://app.example/success',
          cancelUrl: 'https://app.example/cancel',
        }),
    ).toThrow('StripeAdapter apiBaseUrl must be a valid URL');

    expect(
      () =>
        new StripeAdapter({
          secretKey: 'sk_test_123',
          apiBaseUrl: 'https://stripe.example/v1',
          fetch: createStripeFetch(),
          successUrl: 'https://app.example/success',
          cancelUrl: 'https://app.example/cancel',
          defaultCurrency: 123 as never,
        }),
    ).toThrow('three-letter ISO currency code');

    expect(
      () =>
        new StripeAdapter({
          secretKey: 'sk_test_123',
          apiBaseUrl: 'https://stripe.example/v1',
          fetch: createStripeFetch(),
          successUrl: 'https://app.example/success',
          cancelUrl: 'https://app.example/cancel',
          defaultCurrency: ' ',
        }),
    ).toThrow('three-letter ISO currency code');
  });

  it('rejects malformed Stripe Checkout redirect URLs before calling Stripe', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'not-a-url',
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-invalid-url',
        amount: 1000,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('Stripe successUrl must be a valid URL');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects non-string Stripe Checkout redirect URLs before calling Stripe', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 123 as never,
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-invalid-url-type',
        amount: 1000,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('Stripe successUrl must be a string');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the default Stripe currency in supported capabilities', () => {
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch: createStripeFetch(),
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
      defaultCurrency: 'jpy',
      supportedCurrencies: ['usd'],
    });

    expect(adapter.capabilities.supportedSettlementCurrencies).toEqual(
      expect.arrayContaining(['JPY', 'USD']),
    );
  });

  it('rejects Stripe payout currencies outside the configured support set', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
      supportedCurrencies: ['usd'],
    });

    await expect(
      adapter.sendPayout({
        destination: 'acct_123',
        amount: 100,
        currency: 'cad',
      }),
    ).rejects.toThrow('currency CAD is not configured as supported');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes Stripe UGX minor-unit amounts through unchanged', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
      defaultCurrency: 'ugx',
      supportedCurrencies: ['ugx'],
    });

    await adapter.createPaymentOption({
      quoteId: 'quote-ugx',
      amount: 500,
      currency: 'UGX',
      expiresAt: futureExpiresAt(),
    });

    const body = new URLSearchParams(String(fetch.mock.calls[0]?.[1]?.body));

    expect(body.get('line_items[0][price_data][unit_amount]')).toBe('500');
  });

  it('rejects fractional whole-unit Stripe special-case amounts', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
      defaultCurrency: 'ugx',
      supportedCurrencies: ['ugx'],
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-fractional-ugx',
        amount: 501,
        currency: 'UGX',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('Stripe Checkout amount for UGX');
    await expect(
      adapter.sendPayout({
        destination: 'acct_123',
        amount: 501,
        currency: 'UGX',
      }),
    ).rejects.toThrow('Stripe payout amount for UGX');
    await expect(
      adapter.refundPayment({
        paymentId: 'pi_123',
        amount: 501,
        currency: 'UGX',
      }),
    ).rejects.toThrow('Stripe refund amount for UGX');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects non-integer Stripe amounts before calling Stripe', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
      defaultCurrency: 'ugx',
      supportedCurrencies: ['ugx'],
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-fractional-ugx',
        amount: 510.5,
        currency: 'UGX',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('Stripe Checkout amount must be a non-negative integer');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects Checkout expiry values outside Stripe API limits', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-short-expiry',
        amount: 1000,
        currency: 'USD',
        expiresAt: new Date(Date.now() + 15 * 60 * 1_000),
      }),
    ).rejects.toThrow('at least 30 minutes');
    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-long-expiry',
        amount: 1000,
        currency: 'USD',
        expiresAt: new Date(Date.now() + 25 * 60 * 60 * 1_000),
      }),
    ).rejects.toThrow('no more than 24 hours');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('accepts Checkout expiry exactly 30 minutes from now', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);

    try {
      await expect(
        adapter.createPaymentOption({
          quoteId: 'quote-boundary-expiry',
          amount: 1000,
          currency: 'USD',
          expiresAt: new Date(now + 30 * 60 * 1_000),
        }),
      ).resolves.toMatchObject({
        expiresAt: new Date(now + 30 * 60 * 1_000),
      });
    } finally {
      dateNow.mockRestore();
    }
  });

  it('returns the Checkout expiry that is sent to Stripe', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        id: 'cs_test_123',
        url: checkoutUrl,
      }),
    );
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });
    const quoteExpiresAt = new Date(Date.now() + 60 * 60 * 1_000);
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-valid-expiry',
      amount: 1000,
      currency: 'USD',
      expiresAt: quoteExpiresAt,
    });
    const body = new URLSearchParams(String(fetch.mock.calls[0]?.[1]?.body));
    const stripeExpiresAt = Number(body.get('expires_at'));

    expect(Math.floor(option.expiresAt.getTime() / 1_000)).toBe(
      stripeExpiresAt,
    );
  });

  it('trims Stripe provider ids and URLs returned during Checkout creation', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        id: ' cs_test_trimmed ',
        url: ' https://checkout.stripe.com/c/pay/cs_test_trimmed ',
        ...Object.fromEntries([['payment_intent', ' pi_trimmed ']]),
      }),
    );
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-provider-trim',
        amount: 1000,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).resolves.toMatchObject({
      payTo: 'https://checkout.stripe.com/c/pay/cs_test_trimmed',
      providerPaymentId: 'cs_test_trimmed',
      paymentUri: 'https://checkout.stripe.com/c/pay/cs_test_trimmed',
      metadata: {
        sessionId: 'cs_test_trimmed',
        paymentIntent: 'pi_trimmed',
      },
    });
  });

  it('rejects non-string Stripe provider ids during Checkout creation', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({
        id: 123,
        url: 'https://checkout.stripe.com/c/pay/cs_test_123',
      }),
    );
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-numeric-provider-id',
        amount: 1000,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('Checkout Session response did not include id and url');
  });

  it('rejects unsupported Checkout modes before calling Stripe', () => {
    const fetch = createStripeFetch();

    expect(
      () =>
        new StripeAdapter({
          secretKey: 'sk_test_123',
          apiBaseUrl: 'https://stripe.example/v1',
          fetch,
          successUrl: 'https://app.example/success',
          cancelUrl: 'https://app.example/cancel',
          checkoutMode: 'setup',
        }),
    ).toThrow('only supports payment Checkout mode');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects blank Stripe quote ids before Checkout creation', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: ' ',
        amount: 1000,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('Stripe quoteId must not be empty');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('parses checkout webhooks into confirmed status', () => {
    const adapter = createWebhookAdapter();
    const payload = JSON.stringify({
      id: 'evt_123',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          status: 'complete',
          ...Object.fromEntries([
            ['payment_status', 'paid'],
            ['client_reference_id', 'quote-123'],
          ]),
        },
      },
    });
    const event = adapter.parseWebhookEvent(
      payload,
      stripeWebhookSignature(payload),
    );

    expect(event).toMatchObject({
      id: 'evt_123',
      type: 'checkout.session.completed',
      status: 'confirmed',
      quoteId: 'quote-123',
      providerPaymentId: 'cs_test_123',
    });
  });

  it('maps async Stripe Checkout success webhooks to confirmed status', () => {
    const adapter = createWebhookAdapter();
    const payload = JSON.stringify({
      id: 'evt_async_123',
      type: 'checkout.session.async_payment_succeeded',
      data: {
        object: {
          id: 'cs_test_123',
          ...Object.fromEntries([['client_reference_id', 'quote-async']]),
        },
      },
    });
    const event = adapter.parseWebhookEvent(
      payload,
      stripeWebhookSignature(payload),
    );

    expect(event).toMatchObject({
      id: 'evt_async_123',
      status: 'confirmed',
      quoteId: 'quote-async',
    });
  });

  it('wraps malformed Stripe webhook JSON in a provider error', () => {
    const adapter = createWebhookAdapter();

    expect(() =>
      adapter.parseWebhookEvent('not-json', stripeWebhookSignature('not-json')),
    ).toThrow('Invalid Stripe webhook JSON payload');
  });

  it('rejects Stripe webhook payloads missing event identity fields', () => {
    const adapter = createWebhookAdapter();
    const missingType = JSON.stringify({ id: 'evt_123' });
    const blankIdentity = JSON.stringify({ id: ' ', type: ' ' });
    const nonStringId = JSON.stringify({ id: 123, type: 'event.type' });

    expect(() =>
      adapter.parseWebhookEvent(
        missingType,
        stripeWebhookSignature(missingType),
      ),
    ).toThrow('Stripe webhook event type must be a string');
    expect(() =>
      adapter.parseWebhookEvent(
        blankIdentity,
        stripeWebhookSignature(blankIdentity),
      ),
    ).toThrow('Stripe webhook event id must not be empty');
    expect(() =>
      adapter.parseWebhookEvent(
        nonStringId,
        stripeWebhookSignature(nonStringId),
      ),
    ).toThrow('Stripe webhook event id must be a string');
  });

  it('trims optional Stripe webhook identifiers', () => {
    const adapter = createWebhookAdapter();
    const payload = JSON.stringify({
      id: ' evt_123 ',
      type: ' checkout.session.completed ',
      data: {
        object: {
          id: ' cs_test_123 ',
          status: 'complete',
          ...Object.fromEntries([
            ['payment_status', 'paid'],
            ['client_reference_id', ' quote-123 '],
          ]),
        },
      },
    });

    expect(
      adapter.parseWebhookEvent(payload, stripeWebhookSignature(payload)),
    ).toMatchObject({
      id: 'evt_123',
      type: 'checkout.session.completed',
      quoteId: 'quote-123',
      providerPaymentId: 'cs_test_123',
    });
  });

  it('marks duplicate Stripe webhook event ids', () => {
    const adapter = createWebhookAdapter();
    const payload = JSON.stringify({
      id: 'evt_replayed',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_123',
          status: 'complete',
          ...Object.fromEntries([['payment_status', 'paid']]),
        },
      },
    });
    const signature = stripeWebhookSignature(payload);

    expect(adapter.parseWebhookEvent(payload, signature).duplicate).toBe(false);
    expect(adapter.parseWebhookEvent(payload, signature)).toMatchObject({
      duplicate: true,
    });
  });

  it('rejects zero-value Stripe payment, payout, and refund requests', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.createPaymentOption({
        quoteId: 'quote-zero',
        amount: 0,
        currency: 'USD',
        expiresAt: futureExpiresAt(),
      }),
    ).rejects.toThrow('Stripe Checkout amount must be greater than zero');
    await expect(
      adapter.sendPayout({
        destination: 'acct_123',
        amount: 0,
        currency: 'USD',
      }),
    ).rejects.toThrow('Stripe payout amount must be greater than zero');
    await expect(
      adapter.refundPayment({
        paymentId: 'pi_123',
        amount: 0,
        currency: 'USD',
      }),
    ).rejects.toThrow('Stripe refund amount must be greater than zero');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects blank Stripe payout destinations before calling Stripe', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.sendPayout({
        destination: ' ',
        amount: 100,
        currency: 'USD',
      }),
    ).rejects.toThrow('Stripe payout destination must not be empty');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects non-string Stripe payout currencies before calling Stripe', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.sendPayout({
        destination: 'acct_123',
        amount: 100,
        currency: 123 as never,
      }),
    ).rejects.toThrow('three-letter ISO currency code');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('trims Stripe payout destination inputs', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    const payout = await adapter.sendPayout({
      destination: ' acct_123 ',
      amount: 100,
      currency: 'USD',
    });
    const body = new URLSearchParams(String(fetch.mock.calls[0]?.[1]?.body));

    expect(payout.destination).toBe('acct_123');
    expect(body.get('destination')).toBe('acct_123');
  });

  it('trims Stripe endpoint, auth, and currency configuration', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: ' sk_test_123 ',
      apiBaseUrl: ' https://stripe.example/v1/ ',
      fetch,
      successUrl: ' https://app.example/success ',
      cancelUrl: ' https://app.example/cancel ',
      defaultCurrency: ' usd ',
    });

    await adapter.createPaymentOption({
      quoteId: 'quote-trimmed-config',
      amount: 1000,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });

    const [url, init] = fetch.mock.calls[0] ?? [];
    const body = new URLSearchParams(String(init?.body));

    expect(String(url)).toBe('https://stripe.example/v1/checkout/sessions');
    expect(new Headers(init?.headers).get('Authorization')).toBe(
      'Bearer sk_test_123',
    );
    expect(body.get('success_url')).toBe('https://app.example/success');
    expect(body.get('cancel_url')).toBe('https://app.example/cancel');
    expect(body.get('line_items[0][price_data][currency]')).toBe('usd');
  });

  it('keeps reserved Stripe metadata fields authoritative', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await adapter.createPaymentOption({
      quoteId: 'quote-reserved',
      amount: 1000,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
      metadata: {
        quoteId: 'quote-wrong',
      },
    });
    await adapter.sendPayout({
      destination: 'acct_123',
      amount: 100,
      currency: 'USD',
      quoteId: ' quote-payout ',
      metadata: {
        quoteId: 'quote-wrong',
      },
    });

    const createBody = new URLSearchParams(
      String(fetch.mock.calls[0]?.[1]?.body),
    );
    const payoutBody = new URLSearchParams(
      String(fetch.mock.calls[1]?.[1]?.body),
    );

    expect(createBody.get('metadata[quoteId]')).toBe('quote-reserved');
    expect(payoutBody.get('metadata[quoteId]')).toBe('quote-payout');
  });

  it('sets idempotency keys on Stripe state-changing requests', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await adapter.createPaymentOption({
      quoteId: 'quote-idempotent',
      amount: 1000,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
      idempotencyKey: 'idem-checkout',
    });
    await adapter.sendPayout({
      destination: 'acct_123',
      amount: 500,
      currency: 'USD',
      idempotencyKey: 'idem-payout',
    });
    await adapter.refundPayment({
      paymentId: 'pi_123',
      amount: 500,
      currency: 'USD',
      idempotencyKey: 'idem-refund',
    });

    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Idempotency-Key'),
    ).toBe('idem-checkout');
    expect(
      new Headers(fetch.mock.calls[1]?.[1]?.headers).get('Idempotency-Key'),
    ).toBe('idem-payout');
    expect(
      new Headers(fetch.mock.calls[2]?.[1]?.headers).get('Idempotency-Key'),
    ).toBe('idem-refund');
    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).get('Stripe-Version'),
    ).toBe('2024-06-20');
  });

  it('trims Stripe status lookup provider ids and payTo values', async () => {
    const adapter = createAdapter();

    await expect(
      adapter.getStatus(' quote-123 ', ` ${checkoutUrl} `, {
        providerPaymentId: ' cs_test_123 ',
      }),
    ).resolves.toMatchObject({
      quoteId: 'quote-123',
      payTo: checkoutUrl,
      providerPaymentId: 'cs_test_123',
    });
  });

  it('uses actual Stripe session totals for paid status reconciliation', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/checkout/sessions/cs_test_discounted')) {
        return jsonResponse({
          id: 'cs_test_discounted',
          status: 'complete',
          ...Object.fromEntries([
            ['payment_status', 'paid'],
            ['payment_intent', 'pi_discounted'],
            ['amount_total', 900],
          ]),
          currency: 'usd',
        });
      }

      return jsonResponse({ error: { message: 'not found' } }, 404);
    });
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.getStatus('quote-discounted', checkoutUrl, {
        providerPaymentId: 'cs_test_discounted',
        amount: 1000,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      status: 'confirmed',
      settlementAmount: 900,
      receivedAmount: 900,
      settlementCurrency: 'USD',
    });
  });

  it('rejects Stripe status sessions that belong to another quote', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/checkout/sessions/cs_test_wrong_quote')) {
        return jsonResponse({
          id: 'cs_test_wrong_quote',
          status: 'complete',
          ...Object.fromEntries([
            ['payment_status', 'paid'],
            ['client_reference_id', 'quote-other'],
          ]),
        });
      }

      return jsonResponse({ error: { message: 'not found' } }, 404);
    });
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.getStatus('quote-expected', checkoutUrl, {
        providerPaymentId: 'cs_test_wrong_quote',
      }),
    ).rejects.toThrow('did not match quote-expected');
  });

  it('treats no-payment-required Stripe sessions as confirmed', async () => {
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/checkout/sessions/cs_test_no_payment')) {
        return jsonResponse({
          id: 'cs_test_no_payment',
          status: 'complete',
          ...Object.fromEntries([
            ['payment_status', 'no_payment_required'],
            ['amount_total', 0],
          ]),
          currency: 'usd',
        });
      }

      return jsonResponse({ error: { message: 'not found' } }, 404);
    });
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.getStatus('quote-free', checkoutUrl, {
        providerPaymentId: 'cs_test_no_payment',
        amount: 0,
        currency: 'USD',
      }),
    ).resolves.toMatchObject({
      status: 'confirmed',
      receivedAmount: 0,
    });
  });

  it('rejects blank Stripe payout quote ids before calling Stripe', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.sendPayout({
        destination: 'acct_123',
        amount: 100,
        quoteId: ' ',
      }),
    ).rejects.toThrow('Stripe payout quoteId must not be empty');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects blank Stripe refund payment references before calling Stripe', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.refundPayment({
        paymentId: ' ',
        amount: 100,
      }),
    ).rejects.toThrow('Stripe refund payment reference must not be empty');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates refunds through Stripe Refunds API', async () => {
    const adapter = createAdapter();
    const refund = await adapter.refundPayment({
      paymentId: 'pi_123',
      amount: 1000,
      currency: 'USD',
    });

    expect(refund).toMatchObject({
      status: 'succeeded',
      refundId: 're_123',
      transactionId: 'pi_123',
    });
  });

  it('maps Stripe refund response statuses to refund results', async () => {
    for (const [stripeStatus, expectedStatus] of [
      ['succeeded', 'succeeded'],
      ['failed', 'failed'],
      ['canceled', 'failed'],
      ['requires_action', 'requires_action'],
      ['pending', 'submitted'],
      ['unknown', 'submitted'],
    ] as const) {
      const fetch = vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = String(input);

          if (url.endsWith('/refunds') && init?.method === 'POST') {
            return jsonResponse({
              id: `re_${stripeStatus}`,
              status: stripeStatus,
            });
          }

          return jsonResponse({ error: { message: 'not found' } }, 404);
        },
      );
      const adapter = new StripeAdapter({
        secretKey: 'sk_test_123',
        apiBaseUrl: 'https://stripe.example/v1',
        fetch,
        successUrl: 'https://app.example/success',
        cancelUrl: 'https://app.example/cancel',
      });

      await expect(
        adapter.refundPayment({
          paymentId: 'pi_123',
          amount: 1000,
          currency: 'USD',
        }),
      ).resolves.toMatchObject({
        status: expectedStatus,
        refundId: `re_${stripeStatus}`,
      });
    }
  });

  it('creates Stripe refunds from charge references when provided', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await adapter.refundPayment({
      paymentId: 'ch_123',
      amount: 1000,
      currency: 'USD',
    });

    const body = new URLSearchParams(String(fetch.mock.calls[0]?.[1]?.body));

    expect(body.get('charge')).toBe('ch_123');
    expect(body.get('payment_intent')).toBeNull();
  });

  it('creates Stripe refunds from Checkout Session references', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    const refund = await adapter.refundPayment({
      paymentId: 'cs_test_123',
      amount: 1000,
      currency: 'USD',
    });
    const refundCall = fetch.mock.calls.find(([input]) =>
      String(input).endsWith('/refunds'),
    );
    const body = new URLSearchParams(String(refundCall?.[1]?.body));

    expect(refund).toMatchObject({
      status: 'succeeded',
      refundId: 're_123',
      transactionId: 'cs_test_123',
    });
    expect(body.get('payment_intent')).toBe('pi_123');
    expect(body.get('charge')).toBeNull();
  });

  it('rejects unsupported Stripe refund reference ids before calling Stripe', async () => {
    const fetch = createStripeFetch();
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    await expect(
      adapter.refundPayment({
        paymentId: 'pm_123',
        amount: 1000,
        currency: 'USD',
      }),
    ).rejects.toThrow('Checkout Session (cs_), payment_intent (pi_)');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('trims Stripe status, payout, and refund provider identifiers', async () => {
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);

        if (url.endsWith('/checkout/sessions') && init?.method === 'POST') {
          return jsonResponse({
            id: ' cs_test_trimmed ',
            url: checkoutUrl,
            ...Object.fromEntries([['payment_intent', ' pi_trimmed ']]),
          });
        }

        if (url.endsWith('/checkout/sessions/cs_test_trimmed')) {
          return jsonResponse({
            id: ' cs_test_trimmed ',
            status: 'complete',
            ...Object.fromEntries([
              ['payment_status', 'paid'],
              ['payment_intent', ' pi_status_trimmed '],
            ]),
          });
        }

        if (url.endsWith('/transfers') && init?.method === 'POST') {
          return jsonResponse({
            id: ' tr_trimmed ',
          });
        }

        if (url.endsWith('/refunds') && init?.method === 'POST') {
          return jsonResponse({
            id: ' re_trimmed ',
            status: 'succeeded',
          });
        }

        return jsonResponse({ error: { message: 'not found' } }, 404);
      },
    );
    const adapter = new StripeAdapter({
      secretKey: 'sk_test_123',
      apiBaseUrl: 'https://stripe.example/v1',
      fetch,
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });
    const option = await adapter.createPaymentOption({
      quoteId: 'quote-trimmed-identifiers',
      amount: 1000,
      currency: 'USD',
      expiresAt: futureExpiresAt(),
    });

    await expect(
      adapter.getStatus('quote-trimmed-identifiers', option.payTo),
    ).resolves.toMatchObject({
      transactionId: 'pi_status_trimmed',
    });
    await expect(
      adapter.sendPayout({
        destination: 'acct_123',
        amount: 100,
      }),
    ).resolves.toMatchObject({
      payoutId: 'tr_trimmed',
    });
    await expect(
      adapter.refundPayment({
        paymentId: 'pi_123',
        amount: 100,
      }),
    ).resolves.toMatchObject({
      refundId: 're_trimmed',
    });
  });
});
