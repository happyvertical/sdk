import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { getAccountingProvider } from './index.js';
import { StripeProvider } from './providers/stripe/index.js';

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

    it('should create Stripe provider with billing operations', async () => {
      const provider = await getAccountingProvider({
        type: 'stripe',
        secretKey: 'sk_test_123',
      });

      expect(provider.type).toBe('stripe');
      expect(provider.customers).toBeDefined();
      expect(provider.invoices).toBeDefined();
      expect(provider.payments).toBeDefined();
      expect(provider.webhooks).toBeDefined();
      expect((provider as StripeProvider).billing).toBeDefined();
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

  describe('StripeProvider', () => {
    it('creates and updates customers through Stripe form requests', async () => {
      const { provider, calls } = createStripeProvider([
        { id: 'cus_123', name: 'Acme' },
      ]);

      const result = await provider.customers.sync({
        id: 'tenant-1',
        externalId: 'cus_123',
        name: 'Acme',
        email: 'billing@example.com',
        metadata: { tenantId: 'tenant-1' },
      });

      expect(result).toMatchObject({
        action: 'updated',
        externalId: 'cus_123',
      });
      expect(calls[0]?.url).toBe(
        'https://api.stripe.test/v1/customers/cus_123',
      );
      expect(calls[0]?.init.method).toBe('POST');

      const body = new URLSearchParams(String(calls[0]?.init.body));
      expect(body.get('name')).toBe('Acme');
      expect(body.get('email')).toBe('billing@example.com');
      expect(body.get('metadata[tenantId]')).toBe('tenant-1');
      expect(body.has('tax_exempt')).toBe(false);
    });

    it('reuses an idempotency key when retrying Stripe POST requests', async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      const fetchMock = vi
        .fn()
        .mockImplementationOnce(
          async (input: string | URL, init?: RequestInit) => {
            calls.push({ url: String(input), init: init || {} });
            return new Response('{"error":{"message":"temporary"}}', {
              status: 500,
              headers: { 'content-type': 'application/json' },
            });
          },
        )
        .mockImplementationOnce(
          async (input: string | URL, init?: RequestInit) => {
            calls.push({ url: String(input), init: init || {} });
            return new Response(JSON.stringify({ id: 'cus_retry' }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          },
        );

      const provider = new StripeProvider({
        type: 'stripe',
        secretKey: 'sk_test_123',
        apiBaseUrl: 'https://api.stripe.test',
        fetch: fetchMock as unknown as typeof fetch,
      });

      await expect(
        provider.customers.push({
          id: 'tenant-1',
          name: 'Acme',
        }),
      ).resolves.toMatchObject({ externalId: 'cus_retry' });

      expect(calls).toHaveLength(2);
      const firstKey = getHeader(calls[0]?.init.headers, 'Idempotency-Key');
      const secondKey = getHeader(calls[1]?.init.headers, 'Idempotency-Key');
      expect(firstKey).toBeTruthy();
      expect(secondKey).toBe(firstKey);
    });

    it('preserves explicit customer tax exemption values', async () => {
      const { provider, calls } = createStripeProvider([
        { id: 'cus_123', name: 'Acme' },
      ]);

      await provider.customers.sync({
        id: 'tenant-1',
        externalId: 'cus_123',
        name: 'Acme',
        taxExempt: false,
      });

      const body = new URLSearchParams(String(calls[0]?.init.body));
      expect(body.get('tax_exempt')).toBe('none');
    });

    it('preserves zero customer balances', async () => {
      const { provider } = createStripeProvider([
        { id: 'cus_123', name: 'Acme', balance: 0, currency: 'usd' },
      ]);

      const customer = await provider.customers.pull('cus_123');

      expect(customer.balance).toBe(0);
    });

    it('maps zero-decimal Stripe customer and payment amounts to accounting major units', async () => {
      const { provider } = createStripeProvider([
        { id: 'cus_jpy', name: 'Acme', balance: 1200, currency: 'jpy' },
        {
          id: 'pi_jpy',
          amount: 1200,
          currency: 'jpy',
          created: 0,
          status: 'succeeded',
        },
      ]);

      await expect(provider.customers.pull('cus_jpy')).resolves.toMatchObject({
        balance: 1200,
        currency: 'jpy',
      });
      await expect(provider.payments.pull('pi_jpy')).resolves.toMatchObject({
        amount: 1200,
        currency: 'jpy',
      });
    });

    it('reconciles tagged pending items after an invoice creation failure', async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      let invoiceItemCreates = 0;
      let invoiceLookups = 0;
      let pendingItemLookups = 0;
      const fetchMock = vi.fn(
        async (input: string | URL, init?: RequestInit) => {
          const url = String(input);
          calls.push({ url, init: init || {} });

          if (url.includes('/v1/invoices?')) {
            invoiceLookups += 1;
            return stripeResponse({ data: [], has_more: false });
          }
          if (url.includes('/v1/invoiceitems?')) {
            pendingItemLookups += 1;
            return stripeResponse(
              pendingItemLookups === 1
                ? { data: [], has_more: false }
                : {
                    data: [
                      {
                        id: 'ii_1',
                        metadata: {
                          local_invoice_id: 'period-2026-09',
                          local_line_index: '0',
                        },
                      },
                      {
                        id: 'ii_2',
                        metadata: {
                          local_invoice_id: 'period-2026-09',
                          local_line_index: '1',
                        },
                      },
                    ],
                    has_more: false,
                  },
            );
          }
          if (url.endsWith('/v1/invoiceitems')) {
            invoiceItemCreates += 1;
            return stripeResponse({ id: `ii_${invoiceItemCreates}` });
          }
          if (url.endsWith('/v1/invoices')) {
            return invoiceLookups === 1
              ? new Response('{"error":"invoice unavailable"}', { status: 400 })
              : stripeResponse({ id: 'in_123' });
          }
          return stripeResponse({});
        },
      );
      const provider = new StripeProvider({
        type: 'stripe',
        secretKey: 'test-secret',
        apiBaseUrl: 'https://api.stripe.test',
        fetch: fetchMock as unknown as typeof fetch,
      });
      const invoice = {
        id: 'period-2026-09',
        invoiceNumber: 'INV-2026-09',
        customerId: 'tenant-1',
        customerExternalId: 'cus_123',
        issueDate: new Date('2026-09-01T00:00:00Z'),
        dueDate: new Date('2026-09-30T00:00:00Z'),
        lineItems: [
          { description: 'Usage', quantity: 1, unitPrice: 12.34 },
          { description: 'Subscription', quantity: 1, unitPrice: 5 },
        ],
        subtotal: 17.34,
        taxAmount: 0,
        totalAmount: 17.34,
        currency: 'USD',
        idempotencyKey: 'id0',
      };

      await expect(provider.invoices.push(invoice)).rejects.toThrow(
        'Stripe API error (400)',
      );
      await expect(provider.invoices.push(invoice)).resolves.toMatchObject({
        externalId: 'in_123',
      });

      expect(invoiceItemCreates).toBe(2);
      const itemKeys = calls
        .filter((call) => call.url.endsWith('/v1/invoiceitems'))
        .map((call) => getHeader(call.init.headers, 'Idempotency-Key'));
      expect(itemKeys).toEqual(['id0:item:0', 'id0:item:1']);
      const invoiceKeys = calls
        .filter((call) => call.url.endsWith('/v1/invoices'))
        .map((call) => getHeader(call.init.headers, 'Idempotency-Key'));
      expect(invoiceKeys).toEqual(['id0:invoice', 'id0:invoice']);
    });

    it('replays only invoice items missing after a partial line-item failure', async () => {
      const calls: Array<{ url: string; init: RequestInit }> = [];
      let itemAttempts = 0;
      let pendingLookups = 0;
      const fetchMock = vi.fn(
        async (input: string | URL, init?: RequestInit) => {
          const url = String(input);
          calls.push({ url, init: init || {} });
          if (url.includes('/v1/invoices?')) {
            return stripeResponse({ data: [], has_more: false });
          }
          if (url.includes('/v1/invoiceitems?')) {
            pendingLookups += 1;
            return stripeResponse({
              data:
                pendingLookups === 1
                  ? []
                  : [
                      {
                        id: 'ii_1',
                        metadata: {
                          local_invoice_id: 'partial-lines',
                          local_line_index: '0',
                        },
                      },
                    ],
              has_more: false,
            });
          }
          if (url.endsWith('/v1/invoiceitems')) {
            itemAttempts += 1;
            return itemAttempts === 2
              ? new Response('{"error":"line unavailable"}', { status: 400 })
              : stripeResponse({ id: `ii_${itemAttempts}` });
          }
          return stripeResponse({ id: 'in_partial' });
        },
      );
      const provider = new StripeProvider({
        type: 'stripe',
        secretKey: 'test-secret',
        apiBaseUrl: 'https://api.stripe.test',
        fetch: fetchMock as unknown as typeof fetch,
      });
      const invoice = {
        id: 'partial-lines',
        invoiceNumber: 'INV-partial',
        customerId: 'tenant-1',
        customerExternalId: 'cus_123',
        issueDate: new Date('2026-09-01T00:00:00Z'),
        dueDate: new Date('2026-09-30T00:00:00Z'),
        lineItems: [
          { description: 'Usage', quantity: 1, unitPrice: 10 },
          { description: 'Subscription', quantity: 1, unitPrice: 5 },
        ],
        subtotal: 15,
        taxAmount: 0,
        totalAmount: 15,
        idempotencyKey: 'id1',
      };

      await expect(provider.invoices.push(invoice)).rejects.toThrow(
        'Stripe API error (400)',
      );
      await expect(provider.invoices.push(invoice)).resolves.toMatchObject({
        externalId: 'in_partial',
      });
      expect(itemAttempts).toBe(3);
      expect(
        calls
          .filter((call) => call.url.endsWith('/v1/invoiceitems'))
          .map((call) => getHeader(call.init.headers, 'Idempotency-Key')),
      ).toEqual(['id1:item:0', 'id1:item:1', 'id1:item:1']);
    });

    it('reconciles a provider invoice by local id after Stripe idempotency expires', async () => {
      const { provider, calls } = createStripeProvider([
        {
          data: [
            { id: 'in_existing', metadata: { local_id: 'period-2026-08' } },
          ],
          has_more: false,
        },
      ]);

      await expect(
        provider.invoices.push({
          id: 'period-2026-08',
          invoiceNumber: 'INV-2026-08',
          customerId: 'tenant-1',
          customerExternalId: 'cus_123',
          issueDate: new Date('2026-08-01T00:00:00Z'),
          dueDate: new Date('2026-08-31T00:00:00Z'),
          lineItems: [],
          subtotal: 0,
          taxAmount: 0,
          totalAmount: 0,
          idempotencyKey: 'id3',
        }),
      ).resolves.toMatchObject({ externalId: 'in_existing' });

      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toContain('/v1/invoices?');
    });

    it('maps accounting major units to Stripe currency units and preserves automatic tax', async () => {
      const { provider, calls } = createStripeProvider([
        { id: 'ii_usd' },
        { id: 'in_usd' },
        { id: 'ii_jpy' },
        { id: 'in_jpy' },
      ]);
      const baseInvoice = {
        id: 'invoice-units',
        invoiceNumber: 'INV-units',
        customerId: 'tenant-1',
        customerExternalId: 'cus_123',
        issueDate: new Date('2026-09-01T00:00:00Z'),
        dueDate: new Date('2026-09-30T00:00:00Z'),
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 0 }],
      };

      await provider.invoices.push({
        ...baseInvoice,
        id: 'usd-units',
        currency: 'USD',
        automaticTax: true,
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 12.34 }],
      });
      await provider.invoices.push({
        ...baseInvoice,
        id: 'jpy-units',
        currency: 'JPY',
        lineItems: [{ description: 'Service', quantity: 1, unitPrice: 1200 }],
      });

      expect(
        new URLSearchParams(String(calls[0]?.init.body)).get(
          'unit_amount_decimal',
        ),
      ).toBe('1234');
      expect(
        new URLSearchParams(String(calls[0]?.init.body)).get('tax_behavior'),
      ).toBe('exclusive');
      expect(
        new URLSearchParams(String(calls[1]?.init.body)).get(
          'automatic_tax[enabled]',
        ),
      ).toBe('true');
      expect(
        new URLSearchParams(String(calls[2]?.init.body)).get(
          'unit_amount_decimal',
        ),
      ).toBe('1200');
    });

    it('uses a synced customer billing address for a Stripe Tax invoice', async () => {
      const { provider, calls } = createStripeProvider([
        { id: 'cus_tax' },
        { id: 'ii_tax' },
        { id: 'in_tax' },
        {
          id: 'in_tax',
          customer: 'cus_tax',
          subtotal: 1000,
          total_taxes: [{ amount: 50 }],
          total: 1050,
          amount_remaining: 1050,
          currency: 'usd',
        },
      ]);

      await provider.customers.sync({
        id: 'tenant-tax',
        externalId: 'cus_tax',
        name: 'Taxable customer',
        billingAddress: {
          street1: '510 Townsend St',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94103',
          country: 'US',
        },
      });
      await provider.invoices.push({
        id: 'invoice-tax',
        invoiceNumber: 'INV-tax',
        customerId: 'tenant-tax',
        customerExternalId: 'cus_tax',
        issueDate: new Date('2026-09-01T00:00:00Z'),
        dueDate: new Date('2026-09-30T00:00:00Z'),
        lineItems: [
          { description: 'Taxable service', quantity: 1, unitPrice: 10 },
        ],
        subtotal: 10,
        taxAmount: 0,
        totalAmount: 10,
        currency: 'USD',
        automaticTax: true,
      });

      expect(
        new URLSearchParams(String(calls[0]?.init.body)).get(
          'address[country]',
        ),
      ).toBe('US');
      expect(
        new URLSearchParams(String(calls[2]?.init.body)).get(
          'automatic_tax[enabled]',
        ),
      ).toBe('true');
      await expect(provider.invoices.pull('in_tax')).resolves.toMatchObject({
        taxAmount: 0.5,
        totalAmount: 10.5,
      });
    });

    it('creates checkout and customer portal sessions', async () => {
      const { provider, calls } = createStripeProvider([
        {
          id: 'cs_123',
          url: 'https://checkout.stripe.test/session',
          customer: 'cus_123',
          subscription: 'sub_123',
        },
        {
          id: 'cs_124',
          url: 'https://checkout.stripe.test/session-retry',
          customer: 'cus_123',
        },
        {
          id: 'bps_123',
          url: 'https://billing.stripe.test/session',
        },
      ]);

      const checkout = await provider.billing.createCheckoutSession({
        customerExternalId: 'cus_123',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        lineItems: [{ price: 'price_123', quantity: 2 }],
        metadata: { tenantId: 'tenant-1' },
        idempotencyKey: 'id2',
      });
      expect(checkout).toMatchObject({
        externalId: 'cs_123',
        customerExternalId: 'cus_123',
        subscriptionExternalId: 'sub_123',
      });
      await expect(
        provider.billing.createCheckoutSession({
          customerExternalId: 'cus_123',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
          lineItems: [{ price: 'price_123', quantity: 2 }],
          idempotencyKey: 'id2',
        }),
      ).resolves.toMatchObject({ externalId: 'cs_124' });
      const portal = await provider.billing.createCustomerPortalSession({
        customerExternalId: 'cus_123',
        returnUrl: 'https://example.com/billing',
      });
      expect(portal).toMatchObject({
        externalId: 'bps_123',
        url: 'https://billing.stripe.test/session',
      });

      const checkoutBody = new URLSearchParams(String(calls[0]?.init.body));
      expect(checkoutBody.get('mode')).toBe('subscription');
      expect(checkoutBody.get('line_items[0][price]')).toBe('price_123');
      expect(checkoutBody.get('metadata[tenantId]')).toBe('tenant-1');
      expect(getHeader(calls[0]?.init.headers, 'Idempotency-Key')).toBe('id2');
      expect(getHeader(calls[1]?.init.headers, 'Idempotency-Key')).toBe('id2');

      const portalBody = new URLSearchParams(String(calls[2]?.init.body));
      expect(portalBody.get('customer')).toBe('cus_123');
      expect(portalBody.get('return_url')).toBe('https://example.com/billing');
    });

    it('retrieves subscription status summaries', async () => {
      const { provider } = createStripeProvider([
        {
          id: 'sub_123',
          status: 'active',
          customer: 'cus_123',
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
          cancel_at_period_end: false,
        },
      ]);

      const status =
        await provider.billing.retrieveSubscriptionStatus('sub_123');

      expect(status).toMatchObject({
        externalId: 'sub_123',
        status: 'active',
        customerExternalId: 'cus_123',
        cancelAtPeriodEnd: false,
      });
      expect(status.currentPeriodStart?.toISOString()).toBe(
        '2023-11-14T22:13:20.000Z',
      );
    });

    it('verifies and parses Stripe webhooks', () => {
      const { provider } = createStripeProvider([]);
      const payload = JSON.stringify({
        id: 'evt_123',
        type: 'invoice.payment_succeeded',
        created: 1_700_000_000,
        data: {
          object: {
            id: 'in_123',
            object: 'invoice',
          },
        },
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac('sha256', 'whsec_test')
        .update(`${timestamp}.${payload}`)
        .digest('hex');

      expect(
        provider.webhooks.verify(
          payload,
          `t=${timestamp},v1=${signature}`,
          'whsec_test',
        ),
      ).toBe(true);

      expect(provider.webhooks.parse(payload)).toMatchObject({
        id: 'evt_123',
        type: 'invoice.payment_succeeded',
        provider: 'stripe',
        resourceType: 'invoice',
        resourceId: 'in_123',
      });
    });

    it('rejects stale Stripe webhook signatures', () => {
      const { provider } = createStripeProvider([]);
      const payload = JSON.stringify({
        id: 'evt_123',
        type: 'invoice.payment_succeeded',
      });
      const timestamp = String(Math.floor(Date.now() / 1000) - 301);
      const signature = createHmac('sha256', 'whsec_test')
        .update(`${timestamp}.${payload}`)
        .digest('hex');

      expect(
        provider.webhooks.verify(
          payload,
          `t=${timestamp},v1=${signature}`,
          'whsec_test',
        ),
      ).toBe(false);
    });

    it('preserves Unix epoch timestamps', async () => {
      const { provider } = createStripeProvider([
        {
          id: 'in_123',
          number: 'INV-1',
          customer: 'cus_123',
          created: 0,
          due_date: 0,
          total: 0,
          amount_paid: 0,
          amount_remaining: 0,
        },
      ]);

      const invoice = await provider.invoices.pull('in_123');

      expect(invoice.issueDate.toISOString()).toBe('1970-01-01T00:00:00.000Z');
      expect(invoice.dueDate.toISOString()).toBe('1970-01-01T00:00:00.000Z');
    });

    it('returns Stripe Tax totals in the invoice currency major unit', async () => {
      const { provider } = createStripeProvider([
        {
          id: 'in_jpy_tax',
          number: 'INV-JPY',
          customer: 'cus_123',
          subtotal: 1200,
          total_taxes: [{ amount: 120 }],
          total: 1320,
          amount_paid: 0,
          amount_remaining: 1320,
          currency: 'jpy',
        },
      ]);

      await expect(provider.invoices.pull('in_jpy_tax')).resolves.toMatchObject(
        {
          subtotal: 1200,
          taxAmount: 120,
          totalAmount: 1320,
          balance: 1320,
          currency: 'jpy',
        },
      );
    });
  });
});

function stripeResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function getHeader(headers: HeadersInit | undefined, name: string) {
  if (!headers) {
    return undefined;
  }

  return new Headers(headers).get(name) || undefined;
}

function createStripeProvider(responses: unknown[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init || {} });
    const response = responses.shift() || {};
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const provider = new StripeProvider({
    type: 'stripe',
    secretKey: 'sk_test_123',
    apiBaseUrl: 'https://api.stripe.test',
    fetch: fetchMock as unknown as typeof fetch,
  });

  return { provider, calls, fetchMock };
}
