import { describe, expect, it } from 'vitest';
import {
  createFakeStripe,
  type FakeStripeCall,
  type FakeStripeReply,
  stripeError,
} from '../../../test/fake-stripe.js';
import { StripeProvider } from './index.js';

const charge = {
  customerExternalId: 'cus_1',
  paymentMethodExternalId: 'pm_card',
  amountMinor: 2500,
  currency: 'usd',
  idempotencyKey: 'topup:policy-7:3',
  description: 'Prepaid credit top-up',
  metadata: { policy: 'policy-7' },
  automaticTax: true,
};

const emptySearch = { body: { object: 'search_result', data: [] } };

const calculation = {
  id: 'taxcalc_1',
  object: 'tax.calculation',
  amount_total: 2825,
  tax_amount_exclusive: 325,
  tax_amount_inclusive: 0,
};

function taxedFake(
  overrides: {
    calculation?: FakeStripeReply;
    paymentIntent?: (call: FakeStripeCall) => FakeStripeReply;
    search?: FakeStripeReply;
  } = {},
) {
  return createFakeStripe((call) => {
    if (call.path === '/v1/payment_intents/search') {
      return overrides.search ?? emptySearch;
    }
    if (call.path === '/v1/customers/cus_1') {
      return {
        body: {
          id: 'cus_1',
          invoice_settings: { default_payment_method: 'pm_default' },
        },
      };
    }
    if (call.path === '/v1/tax/calculations') {
      return overrides.calculation ?? { body: calculation };
    }
    if (call.path === '/v1/payment_intents') {
      if (overrides.paymentIntent) return overrides.paymentIntent(call);
      return {
        body: {
          id: 'pi_1',
          status: 'succeeded',
          amount: Number(call.params.amount),
          currency: 'usd',
          customer: 'cus_1',
          payment_method: call.params.payment_method,
          metadata: Object.fromEntries(
            Object.entries(call.params)
              .filter(([key]) => key.startsWith('metadata['))
              .map(([key, value]) => [key.slice(9, -1), value]),
          ),
        },
      };
    }
  });
}

function paths(calls: FakeStripeCall[]) {
  return calls.map((call) => `${call.method} ${call.path}`);
}

describe('Stripe off-session charges with automatic tax (#1283)', () => {
  it('calculates tax, charges subtotal plus tax, and links the calculation', async () => {
    const { provider, calls } = taxedFake();

    const result = await provider.payments.chargeSavedPaymentMethod?.({
      ...charge,
      taxCode: 'txcd_10000000',
    });

    expect(result).toMatchObject({
      status: 'succeeded',
      paymentExternalId: 'pi_1',
      amountMinor: 2825,
      subtotalMinor: 2500,
      taxMinor: 325,
      taxCalculationExternalId: 'taxcalc_1',
      currency: 'USD',
      chargeKey: 'topup:policy-7:3',
    });
    expect(paths(calls)).toEqual([
      'GET /v1/payment_intents/search',
      'POST /v1/tax/calculations',
      'POST /v1/payment_intents',
    ]);
    expect(calls[1]?.idempotencyKey).toMatch(
      /^topup:policy-7:3:tax_calculation:[0-9a-f-]{36}$/,
    );
    expect(calls[1]).toMatchObject({
      params: {
        currency: 'usd',
        customer: 'cus_1',
        'line_items[0][amount]': '2500',
        'line_items[0][quantity]': '1',
        'line_items[0][tax_behavior]': 'exclusive',
        'line_items[0][tax_code]': 'txcd_10000000',
      },
    });
    expect(calls[2]).toMatchObject({
      idempotencyKey: 'topup:policy-7:3:payment_intent',
      params: {
        amount: '2825',
        currency: 'usd',
        customer: 'cus_1',
        payment_method: 'pm_card',
        off_session: 'true',
        confirm: 'true',
        'hooks[inputs][tax][calculation]': 'taxcalc_1',
        'metadata[policy]': 'policy-7',
        'metadata[hv_charge_key]': 'topup:policy-7:3',
        'metadata[hv_tax_calculation]': 'taxcalc_1',
        'metadata[hv_subtotal_amount]': '2500',
        'metadata[hv_tax_amount]': '325',
      },
    });
  });

  it('omits the tax code so Stripe uses the account default', async () => {
    const { provider, calls } = taxedFake();
    await provider.payments.chargeSavedPaymentMethod?.(charge);
    const calc = calls.find((call) => call.path === '/v1/tax/calculations');
    expect(calc?.params['line_items[0][tax_code]']).toBeUndefined();
  });

  it('reports zero tax for an exempt customer and still links the calculation', async () => {
    const { provider, calls } = taxedFake({
      calculation: {
        body: {
          ...calculation,
          amount_total: 2500,
          tax_amount_exclusive: 0,
        },
      },
    });
    const result = await provider.payments.chargeSavedPaymentMethod?.(charge);
    expect(result).toMatchObject({
      status: 'succeeded',
      amountMinor: 2500,
      subtotalMinor: 2500,
      taxMinor: 0,
    });
    const create = calls.find((call) => call.path === '/v1/payment_intents');
    expect(create?.params['hooks[inputs][tax][calculation]']).toBe('taxcalc_1');
  });

  it('checks the default payment method before paying for a calculation', async () => {
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/payment_intents/search') return emptySearch;
      if (call.path === '/v1/customers/cus_1') {
        return { body: { id: 'cus_1', invoice_settings: {} } };
      }
    });
    const result = await provider.payments.chargeSavedPaymentMethod?.({
      ...charge,
      paymentMethodExternalId: undefined,
    });
    expect(result).toMatchObject({
      status: 'failed',
      failureCode: 'payment_method_missing',
      amountMinor: 2500,
      subtotalMinor: 2500,
    });
    expect(result?.taxMinor).toBeUndefined();
    expect(paths(calls)).toEqual([
      'GET /v1/payment_intents/search',
      'GET /v1/customers/cus_1',
    ]);
  });

  it('returns a failed outcome without charging when the tax location is invalid', async () => {
    const { provider, calls } = taxedFake({
      calculation: stripeError(400, {
        type: 'invalid_request_error',
        code: 'customer_tax_location_invalid',
        message: "We could not determine the customer's tax location.",
      }),
    });
    const result = await provider.payments.chargeSavedPaymentMethod?.(charge);
    expect(result).toMatchObject({
      status: 'failed',
      failureCode: 'customer_tax_location_invalid',
      failureMessage: "We could not determine the customer's tax location.",
      amountMinor: 2500,
      subtotalMinor: 2500,
      paymentMethodExternalId: 'pm_card',
    });
    expect(result?.paymentExternalId).toBeUndefined();
    expect(result?.taxMinor).toBeUndefined();
    expect(calls.some((call) => call.path === '/v1/payment_intents')).toBe(
      false,
    );
  });

  it('recalculates on a same-key retry after the tax location is fixed', async () => {
    let fixed = false;
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/payment_intents/search') return emptySearch;
      if (call.path === '/v1/tax/calculations') {
        return fixed
          ? { body: calculation }
          : stripeError(400, {
              type: 'invalid_request_error',
              code: 'customer_tax_location_invalid',
            });
      }
      if (call.path === '/v1/payment_intents') {
        return {
          body: {
            id: 'pi_1',
            status: 'succeeded',
            amount: 2825,
            currency: 'usd',
            metadata: {
              hv_charge_key: 'topup:policy-7:3',
              hv_tax_calculation: 'taxcalc_1',
              hv_subtotal_amount: '2500',
              hv_tax_amount: '325',
            },
          },
        };
      }
    });
    await expect(
      provider.payments.chargeSavedPaymentMethod?.(charge),
    ).resolves.toMatchObject({
      status: 'failed',
      failureCode: 'customer_tax_location_invalid',
    });
    fixed = true;
    await expect(
      provider.payments.chargeSavedPaymentMethod?.(charge),
    ).resolves.toMatchObject({ status: 'succeeded', taxMinor: 325 });
    const keys = calls
      .filter((call) => call.path === '/v1/tax/calculations')
      .map((call) => call.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('throws other tax calculation errors without charging', async () => {
    const { provider, calls } = taxedFake({
      calculation: stripeError(400, {
        type: 'invalid_request_error',
        code: 'stripe_tax_inactive',
        message: 'Stripe Tax has not been activated on your account.',
      }),
    });
    await expect(
      provider.payments.chargeSavedPaymentMethod?.(charge),
    ).rejects.toMatchObject({ name: 'StripeApiError', status: 400 });
    expect(calls.some((call) => call.path === '/v1/payment_intents')).toBe(
      false,
    );
  });

  it.each([
    [{ ...calculation, amount_total: 2900 }],
    [{ ...calculation, tax_amount_exclusive: -1, amount_total: 2499 }],
    [{ ...calculation, tax_amount_exclusive: 32.5, amount_total: 2532.5 }],
    [{ ...calculation, id: '' }],
  ])('refuses a calculation that does not add up (%o)', async (body) => {
    const { provider, calls } = taxedFake({ calculation: { body } });
    await expect(
      provider.payments.chargeSavedPaymentMethod?.(charge),
    ).rejects.toThrow('does not add up');
    expect(calls.some((call) => call.path === '/v1/payment_intents')).toBe(
      false,
    );
  });

  it('reports a declined taxed charge with its subtotal and tax', async () => {
    const { provider } = taxedFake({
      paymentIntent: () =>
        stripeError(402, {
          type: 'card_error',
          code: 'card_declined',
          decline_code: 'insufficient_funds',
          message: 'Your card has insufficient funds.',
          payment_intent: {
            id: 'pi_declined',
            status: 'requires_payment_method',
            amount: 2825,
            currency: 'usd',
            payment_method: 'pm_card',
            metadata: {
              hv_charge_key: 'topup:policy-7:3',
              hv_tax_calculation: 'taxcalc_1',
              hv_subtotal_amount: '2500',
              hv_tax_amount: '325',
            },
          },
        }),
    });
    await expect(
      provider.payments.chargeSavedPaymentMethod?.(charge),
    ).resolves.toMatchObject({
      status: 'failed',
      paymentExternalId: 'pi_declined',
      failureCode: 'card_declined',
      amountMinor: 2825,
      subtotalMinor: 2500,
      taxMinor: 325,
      taxCalculationExternalId: 'taxcalc_1',
    });
  });

  it('reports tax on a decline whose error carries no PaymentIntent', async () => {
    const { provider } = taxedFake({
      paymentIntent: () =>
        stripeError(402, { type: 'card_error', code: 'card_declined' }),
    });
    await expect(
      provider.payments.chargeSavedPaymentMethod?.(charge),
    ).resolves.toMatchObject({
      status: 'failed',
      amountMinor: 2825,
      subtotalMinor: 2500,
      taxMinor: 325,
      taxCalculationExternalId: 'taxcalc_1',
    });
  });

  const taxedOriginal = {
    id: 'pi_original',
    created: 10,
    status: 'succeeded',
    amount: 2825,
    currency: 'usd',
    customer: 'cus_1',
    payment_method: 'pm_card',
    metadata: {
      hv_charge_key: 'topup:policy-7:3',
      hv_tax_calculation: 'taxcalc_1',
      hv_subtotal_amount: '2500',
      hv_tax_amount: '325',
    },
  };

  it('returns the original taxed charge after the idempotency window without recalculating', async () => {
    const { provider, calls } = taxedFake({
      search: { body: { object: 'search_result', data: [taxedOriginal] } },
    });
    await expect(
      provider.payments.chargeSavedPaymentMethod?.(charge),
    ).resolves.toMatchObject({
      status: 'succeeded',
      paymentExternalId: 'pi_original',
      amountMinor: 2825,
      subtotalMinor: 2500,
      taxMinor: 325,
      taxCalculationExternalId: 'taxcalc_1',
    });
    expect(paths(calls)).toEqual(['GET /v1/payment_intents/search']);
  });

  it.each([
    ['as an untaxed charge', { automaticTax: false }, taxedOriginal],
    ['for a different subtotal', { amountMinor: 2825 }, taxedOriginal],
    [
      'as a taxed charge of an untaxed original',
      {},
      {
        ...taxedOriginal,
        amount: 2500,
        metadata: { hv_charge_key: 'topup:policy-7:3' },
      },
    ],
  ])('refuses a taxed key reused %s', async (_label, change, original) => {
    const { provider, calls } = taxedFake({
      search: { body: { object: 'search_result', data: [original] } },
    });
    await expect(
      provider.payments.chargeSavedPaymentMethod?.({ ...charge, ...change }),
    ).rejects.toThrow('idempotencyKey was already used for a different charge');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it.each([
    [
      'taxCode without automaticTax',
      { automaticTax: false, taxCode: 'txcd_10000000' },
      'taxCode requires automaticTax',
    ],
    ['a blank taxCode', { taxCode: ' ' }, 'taxCode must be a non-empty string'],
    [
      'reserved metadata keys',
      { metadata: { hv_tax_amount: '0' } },
      'reserved by the adapter',
    ],
  ])('refuses %s before any provider request', async (_label, change, message) => {
    const { provider, calls } = taxedFake();
    await expect(
      provider.payments.chargeSavedPaymentMethod?.({ ...charge, ...change }),
    ).rejects.toThrow(message);
    expect(calls).toHaveLength(0);
  });

  it('keeps untaxed charges free of tax fields and tax requests', async () => {
    const { provider, calls } = taxedFake();
    const result = await provider.payments.chargeSavedPaymentMethod?.({
      ...charge,
      automaticTax: undefined,
    });
    expect(result).toMatchObject({ status: 'succeeded', amountMinor: 2500 });
    expect(result).not.toHaveProperty('subtotalMinor');
    expect(result).not.toHaveProperty('taxMinor');
    const create = calls.find((call) => call.path === '/v1/payment_intents');
    expect(create?.params['hooks[inputs][tax][calculation]']).toBeUndefined();
    expect(create?.params['metadata[hv_tax_amount]']).toBeUndefined();
    expect(calls.some((call) => call.path === '/v1/tax/calculations')).toBe(
      false,
    );
  });

  it('reports subtotal and tax in the payment webhook summary', () => {
    const provider = new StripeProvider({ type: 'stripe', secretKey: 'sk' });
    const parse = (object: Record<string, unknown>) =>
      provider.webhooks.parse(
        JSON.stringify({
          id: 'evt_1',
          type: 'payment_intent.succeeded',
          created: 1_790_000_000,
          data: { object: { object: 'payment_intent', ...object } },
        }),
      ).payment;

    expect(parse(taxedOriginal)).toMatchObject({
      status: 'succeeded',
      amountMinor: 2825,
      subtotalMinor: 2500,
      taxMinor: 325,
      taxCalculationExternalId: 'taxcalc_1',
      chargeKey: 'topup:policy-7:3',
    });
    const untaxed = parse({
      ...taxedOriginal,
      amount: 2500,
      metadata: { hv_charge_key: 'topup:policy-7:3' },
    });
    expect(untaxed?.amountMinor).toBe(2500);
    expect(untaxed).not.toHaveProperty('subtotalMinor');
    expect(untaxed).not.toHaveProperty('taxMinor');
  });
});
