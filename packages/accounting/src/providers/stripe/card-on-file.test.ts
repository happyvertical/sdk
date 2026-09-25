import { describe, expect, it } from 'vitest';
import { createFakeStripe } from '../../../test/fake-stripe.js';

const setupInput = {
  mode: 'setup' as const,
  successUrl: 'https://app.test/ok',
  cancelUrl: 'https://app.test/cancel',
  customerExternalId: 'cus_1',
  currency: 'CAD',
  idempotencyKey: 'card-setup:account-42',
};

describe('Stripe card-on-file billing (#1273)', () => {
  it('creates a setup-mode session without line items', async () => {
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/checkout/sessions') {
        return {
          body: {
            id: 'cs_setup',
            url: 'https://checkout.stripe.test/cs_setup',
            mode: 'setup',
            customer: 'cus_1',
            setup_intent: 'seti_1',
          },
        };
      }
    });

    const session = await provider.billing.createCheckoutSession({
      ...setupInput,
      billingAddressCollection: 'required',
      customerUpdate: { address: 'auto', name: 'auto' },
      paymentMethodTypes: ['card'],
    });

    expect(session).toMatchObject({
      externalId: 'cs_setup',
      mode: 'setup',
      customerExternalId: 'cus_1',
      setupIntentExternalId: 'seti_1',
    });
    const params = calls[0]?.params || {};
    expect(params).toMatchObject({
      mode: 'setup',
      currency: 'cad',
      'payment_method_types[0]': 'card',
      billing_address_collection: 'required',
      'customer_update[address]': 'auto',
    });
    expect(
      Object.keys(params).some((key) => key.startsWith('line_items')),
    ).toBe(false);
    expect(calls[0]?.idempotencyKey).toBe('card-setup:account-42');
  });

  it('validates setup-mode inputs before calling Stripe', async () => {
    const { provider, calls } = createFakeStripe(() => ({ body: {} }));
    await expect(
      provider.billing.createCheckoutSession({
        ...setupInput,
        currency: undefined,
      }),
    ).rejects.toThrow('requires currency or paymentMethodTypes');
    await expect(
      provider.billing.createCheckoutSession({
        ...setupInput,
        lineItems: [{ price: 'price_1' }],
      }),
    ).rejects.toThrow('does not accept line items');
    await expect(
      provider.billing.createCheckoutSession({
        ...setupInput,
        automaticTax: true,
      }),
    ).rejects.toThrow('does not calculate tax');
    await expect(
      provider.billing.createCheckoutSession({
        ...setupInput,
        setupFutureUsage: 'off_session',
      }),
    ).rejects.toThrow('only to payment-mode');
    await expect(
      provider.billing.createCheckoutSession({
        ...setupInput,
        mode: 'subscription',
      }),
    ).rejects.toThrow('subscription-mode Checkout requires line items');
    expect(calls).toHaveLength(0);
  });

  it('saves the card from a payment-mode purchase for later off-session use', async () => {
    const { provider, calls } = createFakeStripe(() => ({
      body: { id: 'cs_pay', mode: 'payment' },
    }));
    await provider.billing.createCheckoutSession({
      mode: 'payment',
      successUrl: 'https://app.test/ok',
      cancelUrl: 'https://app.test/cancel',
      customerExternalId: 'cus_1',
      setupFutureUsage: 'off_session',
      lineItems: [{ priceData: { currency: 'usd', unitAmountMinor: 2500 } }],
    });
    expect(calls[0]?.params).toMatchObject({
      'payment_intent_data[setup_future_usage]': 'off_session',
    });
  });

  it('retrieves the payment method a completed setup session saved', async () => {
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/checkout/sessions/cs_setup') {
        return {
          body: {
            id: 'cs_setup',
            mode: 'setup',
            status: 'complete',
            payment_status: 'no_payment_required',
            customer: 'cus_1',
            setup_intent: { id: 'seti_1', payment_method: 'pm_card' },
            metadata: { account: '42' },
          },
        };
      }
    });

    await expect(
      provider.billing.retrieveCheckoutSession('cs_setup'),
    ).resolves.toMatchObject({
      externalId: 'cs_setup',
      mode: 'setup',
      status: 'complete',
      paymentStatus: 'no_payment_required',
      customerExternalId: 'cus_1',
      setupIntentExternalId: 'seti_1',
      paymentMethodExternalId: 'pm_card',
      metadata: { account: '42' },
    });
    expect(calls[0]).toMatchObject({
      method: 'GET',
      params: { 'expand[0]': 'setup_intent', 'expand[1]': 'payment_intent' },
    });
  });

  it('reports taxed payment-session totals in ISO minor units', async () => {
    const { provider } = createFakeStripe(() => ({
      body: {
        id: 'cs_pay',
        mode: 'payment',
        status: 'complete',
        payment_status: 'paid',
        currency: 'isk',
        amount_subtotal: 50000,
        amount_total: 62000,
        total_details: { amount_tax: 12000 },
        payment_intent: { id: 'pi_1', payment_method: { id: 'pm_2' } },
      },
    }));
    await expect(
      provider.billing.retrieveCheckoutSession('cs_pay'),
    ).resolves.toMatchObject({
      currency: 'ISK',
      amountSubtotalMinor: 500,
      amountTaxMinor: 120,
      amountTotalMinor: 620,
      paymentIntentExternalId: 'pi_1',
      paymentMethodExternalId: 'pm_2',
      paymentStatus: 'paid',
    });
  });

  it('sets the customer default payment method for invoices', async () => {
    const { provider, calls } = createFakeStripe(() => ({
      body: { id: 'cus_1' },
    }));
    await provider.billing.setDefaultPaymentMethod('cus_1', 'pm_card');
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/v1/customers/cus_1',
      params: { 'invoice_settings[default_payment_method]': 'pm_card' },
    });
  });

  describe('automatically charged invoices', () => {
    const invoice = {
      id: 'close-1',
      invoiceNumber: 'INV-1',
      customerId: 'account-42',
      customerExternalId: 'cus_1',
      issueDate: new Date('2026-09-01T00:00:00Z'),
      dueDate: new Date('2026-09-30T00:00:00Z'),
      lineItems: [{ description: 'Plan', quantity: 1, unitPrice: 20 }],
      subtotal: 20,
      taxAmount: 0,
      totalAmount: 20,
      currency: 'usd',
    };

    it('creates charge_automatically invoices without a due date', async () => {
      const { provider, calls } = createFakeStripe((call) => {
        if (call.path === '/v1/invoiceitems') return { body: { id: 'ii_1' } };
        if (call.path === '/v1/invoices') return { body: { id: 'in_1' } };
      });
      await provider.invoices.push({
        ...invoice,
        collectionMethod: 'charge_automatically',
      });
      const create = calls.find((call) => call.path === '/v1/invoices');
      expect(create?.params).toMatchObject({
        collection_method: 'charge_automatically',
        auto_advance: 'false',
      });
      expect(create?.params.due_date).toBeUndefined();
    });

    it('keeps send_invoice with a due date as the default', async () => {
      const { provider, calls } = createFakeStripe((call) => {
        if (call.path === '/v1/invoiceitems') return { body: { id: 'ii_1' } };
        if (call.path === '/v1/invoices') return { body: { id: 'in_1' } };
      });
      await provider.invoices.push(invoice);
      const create = calls.find((call) => call.path === '/v1/invoices');
      expect(create?.params).toMatchObject({
        collection_method: 'send_invoice',
        due_date: String(Date.parse('2026-09-30T00:00:00Z') / 1000),
      });
    });

    it('omits the due date when updating an automatically charged invoice', async () => {
      const { provider, calls } = createFakeStripe(() => ({
        body: { id: 'in_1' },
      }));
      await provider.invoices.sync({
        ...invoice,
        externalId: 'in_1',
        collectionMethod: 'charge_automatically',
      });
      expect(calls[0]?.params.due_date).toBeUndefined();
    });

    it('rejects an unknown collection method', async () => {
      const { provider, calls } = createFakeStripe(() => ({ body: {} }));
      await expect(
        provider.invoices.push({
          ...invoice,
          collectionMethod: 'wire' as 'send_invoice',
        }),
      ).rejects.toThrow("Unsupported invoice collectionMethod 'wire'");
      expect(calls).toHaveLength(0);
    });

    it('finalizes with automatic collection instead of emailing', async () => {
      const { provider, calls } = createFakeStripe((call) => {
        if (call.method === 'GET') {
          return {
            body: {
              id: 'in_1',
              status: 'draft',
              collection_method: 'charge_automatically',
            },
          };
        }
        return { body: { id: 'in_1', status: 'open' } };
      });
      await provider.invoices.send('in_1');
      expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
        'GET /v1/invoices/in_1',
        'POST /v1/invoices/in_1/finalize',
      ]);
      expect(calls[1]).toMatchObject({
        params: { auto_advance: 'true' },
        idempotencyKey: 'in_1:finalize',
      });
    });

    it('turns automatic collection on for an open invoice finalized elsewhere', async () => {
      const { provider, calls } = createFakeStripe((call) =>
        call.method === 'GET'
          ? {
              body: {
                id: 'in_1',
                status: 'open',
                auto_advance: false,
                collection_method: 'charge_automatically',
              },
            }
          : { body: { id: 'in_1' } },
      );
      await provider.invoices.send('in_1');
      expect(calls[1]).toMatchObject({
        method: 'POST',
        path: '/v1/invoices/in_1',
        params: { auto_advance: 'true' },
      });
    });

    it('does nothing more for an invoice already collecting or paid', async () => {
      const { provider, calls } = createFakeStripe(() => ({
        body: {
          id: 'in_1',
          status: 'paid',
          collection_method: 'charge_automatically',
        },
      }));
      await provider.invoices.send('in_1');
      expect(calls).toHaveLength(1);
    });

    it('still emails send_invoice invoices', async () => {
      const { provider, calls } = createFakeStripe((call) =>
        call.method === 'GET'
          ? {
              body: {
                id: 'in_1',
                status: 'draft',
                collection_method: 'send_invoice',
              },
            }
          : { body: { id: 'in_1' } },
      );
      await provider.invoices.send('in_1');
      expect(calls[1]).toMatchObject({
        method: 'POST',
        path: '/v1/invoices/in_1/send',
      });
    });
  });
});
