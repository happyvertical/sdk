import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFakeStripe, stripeError } from '../../../test/fake-stripe.js';
import { StripeProvider } from './index.js';

const charge = {
  customerExternalId: 'cus_1',
  amountMinor: 2500,
  currency: 'usd',
  idempotencyKey: 'topup:policy-7:3',
  description: 'Prepaid credit top-up',
  metadata: { policy: 'policy-7' },
};

const emptySearch = { body: { object: 'search_result', data: [] } };

describe('Stripe off-session saved payment method charges (#1270)', () => {
  it('charges the customer default payment method idempotently', async () => {
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/payment_intents/search') return emptySearch;
      if (call.path === '/v1/customers/cus_1') {
        return {
          body: {
            id: 'cus_1',
            invoice_settings: { default_payment_method: 'pm_default' },
          },
        };
      }
      if (call.path === '/v1/payment_intents') {
        return {
          body: {
            id: 'pi_1',
            status: 'succeeded',
            amount: 2500,
            currency: 'usd',
            payment_method: 'pm_default',
          },
        };
      }
    });

    const result = await provider.payments.chargeSavedPaymentMethod?.(charge);

    expect(result).toMatchObject({
      status: 'succeeded',
      provider: 'stripe',
      paymentExternalId: 'pi_1',
      paymentMethodExternalId: 'pm_default',
      customerExternalId: 'cus_1',
      amountMinor: 2500,
      currency: 'USD',
      chargeKey: 'topup:policy-7:3',
    });
    expect(result?.failureCode).toBeUndefined();
    expect(calls[0]).toMatchObject({
      path: '/v1/payment_intents/search',
      params: { query: "metadata['hv_charge_key']:'topup:policy-7:3'" },
    });
    const create = calls.find((call) => call.path === '/v1/payment_intents');
    expect(create).toMatchObject({
      method: 'POST',
      idempotencyKey: 'topup:policy-7:3:payment_intent',
      params: {
        amount: '2500',
        currency: 'usd',
        customer: 'cus_1',
        payment_method: 'pm_default',
        off_session: 'true',
        confirm: 'true',
        description: 'Prepaid credit top-up',
        'metadata[policy]': 'policy-7',
        'metadata[hv_charge_key]': 'topup:policy-7:3',
      },
    });
  });

  it('charges an explicit payment method without reading the customer', async () => {
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/payment_intents/search') return emptySearch;
      if (call.path === '/v1/payment_intents') {
        return { body: { id: 'pi_1', status: 'processing', amount: 2500 } };
      }
    });
    const result = await provider.payments.chargeSavedPaymentMethod?.({
      ...charge,
      paymentMethodExternalId: 'pm_card',
    });
    expect(result?.status).toBe('processing');
    expect(calls.map((call) => call.path)).toEqual([
      '/v1/payment_intents/search',
      '/v1/payment_intents',
    ]);
  });

  it('reports a decline as a failed outcome, not an exception', async () => {
    const { provider } = createFakeStripe((call) => {
      if (call.path === '/v1/payment_intents/search') return emptySearch;
      if (call.path === '/v1/payment_intents') {
        return stripeError(402, {
          type: 'card_error',
          code: 'card_declined',
          decline_code: 'insufficient_funds',
          message: 'Your card has insufficient funds.',
          payment_intent: {
            id: 'pi_declined',
            status: 'requires_payment_method',
            payment_method: 'pm_card',
          },
        });
      }
    });
    await expect(
      provider.payments.chargeSavedPaymentMethod?.({
        ...charge,
        paymentMethodExternalId: 'pm_card',
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      paymentExternalId: 'pi_declined',
      failureCode: 'card_declined',
      declineCode: 'insufficient_funds',
      failureMessage: 'Your card has insufficient funds.',
      amountMinor: 2500,
    });
  });

  it('surfaces authentication_required as requires_action', async () => {
    const { provider } = createFakeStripe((call) => {
      if (call.path === '/v1/payment_intents/search') return emptySearch;
      if (call.path === '/v1/payment_intents') {
        return stripeError(402, {
          type: 'card_error',
          code: 'authentication_required',
          message: 'This payment requires authentication.',
          payment_intent: {
            id: 'pi_sca',
            status: 'requires_payment_method',
          },
        });
      }
    });
    await expect(
      provider.payments.chargeSavedPaymentMethod?.({
        ...charge,
        paymentMethodExternalId: 'pm_card',
      }),
    ).resolves.toMatchObject({
      status: 'requires_action',
      paymentExternalId: 'pi_sca',
      // Kept although Stripe's embedded PaymentIntent omits it.
      paymentMethodExternalId: 'pm_card',
      failureCode: 'authentication_required',
    });
  });

  it('throws non-card errors such as an invalid request', async () => {
    const { provider } = createFakeStripe((call) => {
      if (call.path === '/v1/payment_intents/search') return emptySearch;
      return stripeError(400, {
        type: 'invalid_request_error',
        code: 'resource_missing',
        message: 'No such PaymentMethod',
      });
    });
    const error = await provider.payments
      .chargeSavedPaymentMethod?.({
        ...charge,
        paymentMethodExternalId: 'pm_gone',
      })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      name: 'StripeApiError',
      status: 400,
      code: 'resource_missing',
    });
    expect((error as Error).message).toMatch(/^Stripe API error \(400\)/);
  });

  it('returns a failed outcome without charging when no default payment method exists', async () => {
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/payment_intents/search') return emptySearch;
      if (call.path === '/v1/customers/cus_1') {
        return { body: { id: 'cus_1', invoice_settings: {} } };
      }
    });
    await expect(
      provider.payments.chargeSavedPaymentMethod?.(charge),
    ).resolves.toMatchObject({
      status: 'failed',
      failureCode: 'payment_method_missing',
    });
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('returns the original charge after the idempotency window instead of charging twice', async () => {
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/payment_intents/search') {
        return {
          body: {
            object: 'search_result',
            data: [
              {
                id: 'pi_original',
                created: 10,
                status: 'succeeded',
                amount: 2500,
                currency: 'usd',
                customer: 'cus_1',
                payment_method: 'pm_card',
                metadata: { hv_charge_key: 'topup:policy-7:3' },
              },
            ],
          },
        };
      }
    });
    await expect(
      provider.payments.chargeSavedPaymentMethod?.(charge),
    ).resolves.toMatchObject({
      status: 'succeeded',
      paymentExternalId: 'pi_original',
    });
    expect(calls).toHaveLength(1);
  });

  it.each([
    [{ amount: 9900, currency: 'usd', customer: 'cus_1' }],
    [{ amount: 2500, currency: 'eur', customer: 'cus_1' }],
    [{ amount: 2500, currency: 'usd', customer: 'cus_other' }],
  ])('refuses a key reused for a different charge after the window (%o)', async (original) => {
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/payment_intents/search') {
        return {
          body: {
            object: 'search_result',
            data: [
              {
                id: 'pi_original',
                status: 'succeeded',
                metadata: { hv_charge_key: 'topup:policy-7:3' },
                ...original,
              },
            ],
          },
        };
      }
    });
    await expect(
      provider.payments.chargeSavedPaymentMethod?.(charge),
    ).rejects.toThrow('idempotencyKey was already used for a different charge');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('refuses currencies whose ISO 4217 and runtime minor units disagree', async () => {
    const { provider, calls } = createFakeStripe(() => emptySearch);
    await expect(
      provider.payments.chargeSavedPaymentMethod?.({
        ...charge,
        currency: 'IQD',
        amountMinor: 5000,
      }),
    ).rejects.toThrow('ambiguous minor unit');
    expect(calls).toHaveLength(0);
  });

  it('replays a lost response with the same Stripe idempotency key', async () => {
    const intents = new Map<string, string>();
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/payment_intents/search') return emptySearch;
      if (call.path === '/v1/payment_intents') {
        const key = call.idempotencyKey as string;
        if (!intents.has(key)) intents.set(key, `pi_${intents.size + 1}`);
        return { body: { id: intents.get(key), status: 'succeeded' } };
      }
    });
    const input = { ...charge, paymentMethodExternalId: 'pm_card' };
    const first = await provider.payments.chargeSavedPaymentMethod?.(input);
    const second = await provider.payments.chargeSavedPaymentMethod?.(input);
    expect(second?.paymentExternalId).toBe(first?.paymentExternalId);
    expect(intents.size).toBe(1);
    expect(
      calls
        .filter((call) => call.method === 'POST')
        .map((c) => c.idempotencyKey),
    ).toEqual([
      'topup:policy-7:3:payment_intent',
      'topup:policy-7:3:payment_intent',
    ]);
  });

  it('converts ISO minor units to Stripe units (ISK is two-decimal at Stripe)', async () => {
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/payment_intents/search') return emptySearch;
      return { body: { id: 'pi_1', status: 'succeeded' } };
    });
    await provider.payments.chargeSavedPaymentMethod?.({
      ...charge,
      currency: 'ISK',
      amountMinor: 500,
      paymentMethodExternalId: 'pm_card',
    });
    expect(calls[1]?.params).toMatchObject({
      amount: '50000',
      currency: 'isk',
    });
  });

  it.each([
    [{ amountMinor: 0 }, 'positive'],
    [{ amountMinor: -5 }, 'positive'],
    [{ amountMinor: 12.5 }, 'safe integer'],
    [{ currency: 'dollars' }, 'three-letter code'],
    [{ idempotencyKey: '' }, 'idempotencyKey'],
    [{ customerExternalId: '' }, 'require a customer'],
  ])('rejects invalid input %o before calling Stripe', async (override, message) => {
    const { provider, calls } = createFakeStripe(() => emptySearch);
    await expect(
      provider.payments.chargeSavedPaymentMethod?.({ ...charge, ...override }),
    ).rejects.toThrow(message);
    expect(calls).toHaveLength(0);
  });

  describe('webhook normalization', () => {
    const secret = 'whsec_test';
    const provider = new StripeProvider({
      type: 'stripe',
      secretKey: 'sk_test',
      webhookSecret: secret,
    });

    function event(type: string, object: Record<string, unknown>) {
      return JSON.stringify({
        id: `evt_${type}`,
        type,
        created: 1_790_000_000,
        data: { object: { object: 'payment_intent', ...object } },
      });
    }

    it('normalizes a succeeded off-session charge with its charge key', () => {
      const payload = event('payment_intent.succeeded', {
        id: 'pi_1',
        status: 'succeeded',
        amount: 2500,
        currency: 'usd',
        customer: 'cus_1',
        metadata: { hv_charge_key: 'topup:policy-7:3', policy: 'policy-7' },
      });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHmac('sha256', secret)
        .update(`${timestamp}.${payload}`)
        .digest('hex');
      expect(
        provider.webhooks.verify(payload, `t=${timestamp},v1=${signature}`, ''),
      ).toBe(true);

      expect(provider.webhooks.parse(payload)).toMatchObject({
        id: 'evt_payment_intent.succeeded',
        resourceType: 'payment',
        resourceId: 'pi_1',
        payment: {
          status: 'succeeded',
          paymentExternalId: 'pi_1',
          customerExternalId: 'cus_1',
          amountMinor: 2500,
          currency: 'USD',
          chargeKey: 'topup:policy-7:3',
          metadata: { policy: 'policy-7' },
        },
      });
    });

    it('normalizes failures and authentication requirements', () => {
      const failed = provider.webhooks.parse(
        event('payment_intent.payment_failed', {
          id: 'pi_2',
          status: 'requires_payment_method',
          amount: 1200,
          currency: 'jpy',
          last_payment_error: {
            code: 'card_declined',
            decline_code: 'generic_decline',
            message: 'Your card was declined.',
          },
        }),
      );
      expect(failed.payment).toMatchObject({
        status: 'failed',
        amountMinor: 1200,
        currency: 'JPY',
        failureCode: 'card_declined',
        declineCode: 'generic_decline',
      });

      const sca = provider.webhooks.parse(
        event('payment_intent.payment_failed', {
          id: 'pi_3',
          status: 'requires_payment_method',
          last_payment_error: { code: 'authentication_required' },
        }),
      );
      expect(sca.payment?.status).toBe('requires_action');

      const canceled = provider.webhooks.parse(
        event('payment_intent.canceled', { id: 'pi_4', status: 'canceled' }),
      );
      expect(canceled.payment?.status).toBe('canceled');
    });

    it('omits an amount it cannot convert exactly instead of failing the event', () => {
      const parsed = provider.webhooks.parse(
        event('payment_intent.succeeded', {
          id: 'pi_iqd',
          status: 'succeeded',
          amount: 5000,
          currency: 'iqd',
        }),
      );
      expect(parsed.payment).toMatchObject({
        status: 'succeeded',
        currency: 'IQD',
      });
      expect(parsed.payment?.amountMinor).toBeUndefined();
    });

    it('leaves non-payment events without a payment summary', () => {
      const parsed = provider.webhooks.parse(
        JSON.stringify({
          id: 'evt_inv',
          type: 'invoice.paid',
          data: { object: { id: 'in_1', object: 'invoice' } },
        }),
      );
      expect(parsed.payment).toBeUndefined();
      expect(parsed).not.toHaveProperty('payment');
    });
  });
});
