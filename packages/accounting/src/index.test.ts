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

    it('creates checkout and customer portal sessions', async () => {
      const { provider, calls } = createStripeProvider([
        {
          id: 'cs_123',
          url: 'https://checkout.stripe.test/session',
          customer: 'cus_123',
          subscription: 'sub_123',
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
      });
      const portal = await provider.billing.createCustomerPortalSession({
        customerExternalId: 'cus_123',
        returnUrl: 'https://example.com/billing',
      });

      expect(checkout).toMatchObject({
        externalId: 'cs_123',
        customerExternalId: 'cus_123',
        subscriptionExternalId: 'sub_123',
      });
      expect(portal).toMatchObject({
        externalId: 'bps_123',
        url: 'https://billing.stripe.test/session',
      });

      const checkoutBody = new URLSearchParams(String(calls[0]?.init.body));
      expect(checkoutBody.get('mode')).toBe('subscription');
      expect(checkoutBody.get('line_items[0][price]')).toBe('price_123');
      expect(checkoutBody.get('metadata[tenantId]')).toBe('tenant-1');

      const portalBody = new URLSearchParams(String(calls[1]?.init.body));
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
  });
});

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
