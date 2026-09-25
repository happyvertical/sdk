import { describe, expect, it } from 'vitest';
import { createFakeStripe } from '../../../test/fake-stripe.js';

function checkoutFake() {
  return createFakeStripe((call) => {
    if (call.method === 'POST' && call.path === '/v1/checkout/sessions') {
      return {
        body: {
          id: 'cs_1',
          url: 'https://checkout.stripe.test/cs_1',
          mode: 'payment',
          payment_intent: 'pi_1',
        },
      };
    }
  });
}

const base = {
  mode: 'payment' as const,
  successUrl: 'https://app.test/ok',
  cancelUrl: 'https://app.test/cancel',
  customerExternalId: 'cus_1',
  idempotencyKey: 'credit-purchase:cart-1',
};

describe('Stripe Checkout tax and minor-unit pricing (#1269)', () => {
  it('enables Stripe Tax, address collection, and customer updates', async () => {
    const { provider, calls } = checkoutFake();

    const session = await provider.billing.createCheckoutSession({
      ...base,
      automaticTax: true,
      billingAddressCollection: 'required',
      customerUpdate: { address: 'auto', name: 'auto' },
      lineItems: [
        {
          priceData: {
            currency: 'USD',
            unitAmountMinor: 5000,
            productName: 'Prepaid credit',
          },
        },
      ],
    });

    expect(session).toMatchObject({
      externalId: 'cs_1',
      mode: 'payment',
      paymentIntentExternalId: 'pi_1',
    });
    expect(calls[0]?.idempotencyKey).toBe('credit-purchase:cart-1');
    expect(calls[0]?.params).toMatchObject({
      mode: 'payment',
      customer: 'cus_1',
      'automatic_tax[enabled]': 'true',
      billing_address_collection: 'required',
      'customer_update[address]': 'auto',
      'customer_update[name]': 'auto',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][unit_amount]': '5000',
      // Stripe Tax needs a tax behavior on ad-hoc prices.
      'line_items[0][price_data][tax_behavior]': 'exclusive',
      'line_items[0][price_data][product_data][name]': 'Prepaid credit',
    });
  });

  it('honours an explicit inclusive tax behavior', async () => {
    const { provider, calls } = checkoutFake();
    await provider.billing.createCheckoutSession({
      ...base,
      automaticTax: true,
      lineItems: [
        {
          priceData: {
            currency: 'eur',
            unitAmountMinor: 1000,
            taxBehavior: 'inclusive',
          },
        },
      ],
    });
    expect(calls[0]?.params['line_items[0][price_data][tax_behavior]']).toBe(
      'inclusive',
    );
  });

  it.each([
    ['USD', 1999, '1999'],
    ['JPY', 1200, '1200'],
    ['KWD', 1500, '1500'],
    // Stripe represents ISK and UGX with two decimals although ISO 4217 has
    // none: 500 ISK is sent as 50000.
    ['ISK', 500, '50000'],
    ['UGX', 3000, '300000'],
  ])('converts %s ISO minor units to Stripe units', async (currency, minor, expected) => {
    const { provider, calls } = checkoutFake();
    await provider.billing.createCheckoutSession({
      ...base,
      lineItems: [{ priceData: { currency, unitAmountMinor: minor } }],
    });
    expect(calls[0]?.params['line_items[0][price_data][unit_amount]']).toBe(
      expected,
    );
  });

  it('keeps passing unitAmount through unconverted for existing callers', async () => {
    const { provider, calls } = checkoutFake();
    await provider.billing.createCheckoutSession({
      ...base,
      lineItems: [{ priceData: { currency: 'isk', unitAmount: 50000 } }],
    });
    expect(calls[0]?.params).toMatchObject({
      'line_items[0][price_data][unit_amount]': '50000',
    });
    expect(
      calls[0]?.params['line_items[0][price_data][tax_behavior]'],
    ).toBeUndefined();
    expect(calls[0]?.params['automatic_tax[enabled]']).toBeUndefined();
  });

  it('rejects ambiguous or fractional line amounts before calling Stripe', async () => {
    const { provider, calls } = checkoutFake();
    await expect(
      provider.billing.createCheckoutSession({
        ...base,
        lineItems: [
          {
            priceData: { currency: 'usd', unitAmount: 1, unitAmountMinor: 1 },
          },
        ],
      }),
    ).rejects.toThrow('exactly one of unitAmount or unitAmountMinor');
    await expect(
      provider.billing.createCheckoutSession({
        ...base,
        lineItems: [{ priceData: { currency: 'usd', unitAmountMinor: 1.5 } }],
      }),
    ).rejects.toThrow('safe integer number of minor units');
    expect(calls).toHaveLength(0);
  });

  it('requires a customer for customerUpdate', async () => {
    const { provider } = checkoutFake();
    await expect(
      provider.billing.createCheckoutSession({
        ...base,
        customerExternalId: undefined,
        customerEmail: 'buyer@example.test',
        customerUpdate: { address: 'auto' },
        lineItems: [{ priceData: { currency: 'usd', unitAmountMinor: 100 } }],
      }),
    ).rejects.toThrow('customerUpdate requires customerExternalId');
  });
});
