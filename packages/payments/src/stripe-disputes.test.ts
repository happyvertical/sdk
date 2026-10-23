/* biome-ignore-all lint/style/useNamingConvention: Stripe wire-format fixtures use provider snake_case fields. */
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { StripeAdapter } from './adapters/stripe.js';
import {
  PaymentNotOwnedError,
  PaymentProviderError,
  PaymentVerificationError,
} from './errors.js';
import type { PaymentDispute } from './index.js';

const secret = 'whsec_dispute_fixture';
const account = 'acct_cooperative';
const timestamp = 1792760000;
function transaction(amount = -1000, fee = 150, id = 'txn_withdrawal') {
  return {
    id,
    object: 'balance_transaction',
    amount,
    fee,
    net: amount - fee,
    currency: 'usd',
    created: timestamp,
    type: 'adjustment',
    reporting_category: 'dispute',
  };
}
function dispute(overrides: Record<string, unknown> = {}) {
  return {
    id: 'du_fixture',
    object: 'dispute',
    charge: 'ch_fixture',
    payment_intent: 'pi_fixture',
    amount: 1000,
    currency: 'usd',
    status: 'needs_response',
    livemode: false,
    created: timestamp,
    balance_transactions: [transaction()],
    ...overrides,
  };
}
function event(
  object = dispute(),
  type = 'charge.dispute.created',
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 'evt_fixture',
    type,
    account,
    livemode: false,
    created: timestamp,
    data: { object },
    ...overrides,
  };
}
function signature(payload: string) {
  const now = Math.floor(Date.now() / 1000);
  return `t=${now},v1=${createHmac('sha256', secret).update(`${now}.${payload}`).digest('hex')}`;
}
function adapter(options: Record<string, unknown> = {}) {
  return new StripeAdapter({
    secretKey: 'sk_test_fixture',
    connectWebhookSecret: secret,
    webhookSecret: secret,
    ...options,
  });
}
function parse(input = event(), client = adapter()) {
  const body = JSON.stringify(input);
  return client.parseConnectWebhookEvent(body, signature(body));
}
function retrieval(
  response: unknown = dispute(),
  options: Record<string, unknown> = {},
  status = 200,
) {
  const fetch = vi.fn(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(response), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  return { fetch, client: adapter({ fetch, ...options }) };
}

describe('typed Stripe disputes', () => {
  it.each([
    'created',
    'updated',
    'closed',
    'funds_withdrawn',
    'funds_reinstated',
  ])('normalizes signed %s snapshots without changing the payment status', (suffix) => {
    const result = parse(event(dispute(), `charge.dispute.${suffix}`));
    const detail: PaymentDispute | undefined = result.dispute;
    expect(result).toMatchObject({
      account,
      livemode: false,
      status: 'processing',
      createdAt: new Date(timestamp * 1000),
      duplicate: false,
      connect: { type: `charge.dispute.${suffix}`, dispute: detail },
    });
    expect(detail).toMatchObject({
      id: 'du_fixture',
      chargeId: 'ch_fixture',
      paymentIntentId: 'pi_fixture',
      amount: 1000,
      currency: 'USD',
      status: 'needs_response',
      providerStatus: 'needs_response',
      livemode: false,
      balanceTransactions: [
        {
          id: 'txn_withdrawal',
          amount: -1000,
          fee: 150,
          net: -1150,
          currency: 'USD',
        },
      ],
    });
  });

  it('uses actual balance evidence across duplicate and out-of-order events', () => {
    const client = adapter();
    const restored = dispute({
      status: 'won',
      balance_transactions: [
        transaction(),
        transaction(1000, 0, 'txn_restored'),
      ],
    });
    const latest = event(restored, 'charge.dispute.funds_reinstated');
    const first = parse(latest, client);
    const repeated = parse(latest, client);
    const earlier = parse(
      event(dispute({ balance_transactions: [] }), 'charge.dispute.created', {
        id: 'evt_older',
        created: timestamp - 50,
      }),
      client,
    );
    expect(repeated.duplicate).toBe(true);
    expect(repeated.dispute).toEqual(first.dispute);
    expect(first.dispute?.balanceTransactions.map((t) => t.net)).toEqual([
      -1150, 1000,
    ]);
    expect(earlier.dispute?.balanceTransactions).toEqual([]);
    expect(
      parse(
        event(
          dispute({ status: 'won', balance_transactions: [] }),
          'charge.dispute.closed',
        ),
      ).dispute?.balanceTransactions,
    ).toEqual([]);
  });

  it.each([
    'warning_needs_response',
    'warning_under_review',
    'warning_closed',
    'needs_response',
    'under_review',
    'won',
    'lost',
    'prevented',
  ])('retains known lifecycle status %s without inventing funds', (status) => {
    const result = parse(event(dispute({ status, balance_transactions: [] })));
    expect(result.dispute?.status).toBe(status);
    expect(result.dispute?.balanceTransactions).toEqual([]);
  });

  it.each([
    'funds_withdrawn',
    'funds_reinstated',
  ])('%s carries only the balance evidence in its snapshot', (suffix) => {
    expect(
      parse(
        event(
          dispute({ balance_transactions: [] }),
          `charge.dispute.${suffix}`,
        ),
      ).dispute?.balanceTransactions,
    ).toEqual([]);
  });

  it('supports future statuses safely and optional PI, while rejecting unknown dispute event types', () => {
    expect(
      parse(event(dispute({ status: 'future_state', payment_intent: null })))
        .dispute,
    ).toMatchObject({
      status: 'unknown',
      providerStatus: 'future_state',
      paymentIntentId: undefined,
    });
    expect(() => parse(event(dispute(), 'charge.dispute.future'))).toThrow(
      'Unsupported Stripe dispute event',
    );
    expect(parse(event({}, 'unrelated.future')).dispute).toBeUndefined();
  });

  it.each([
    { amount: Number.MAX_SAFE_INTEGER + 1 },
    { amount: -1 },
    { amount: '1000' },
    { amount: 1.5 },
    { currency: 'usdX' },
    { currency: 'USD' },
    { id: 'pi_wrong' },
    { charge: {} },
    { payment_intent: {} },
    { object: 'charge' },
    { status: null },
    { livemode: undefined },
    { created: Number.MAX_SAFE_INTEGER },
    { balance_transactions: undefined },
    { balance_transactions: null },
    { balance_transactions: ['txn_incomplete'] },
    { balance_transactions: [transaction(), transaction()] },
    { balance_transactions: [{ ...transaction(), amount: 0.5 }] },
    {
      balance_transactions: [
        { ...transaction(), fee: Number.MAX_SAFE_INTEGER + 1 },
      ],
    },
    { balance_transactions: [{ ...transaction(), net: 1 }] },
    { balance_transactions: [{ ...transaction(), currency: null }] },
    { balance_transactions: [{ ...transaction(), created: -1 }] },
    { balance_transactions: [{ ...transaction(), object: 'charge' }] },
    { account: 'acct_other' },
  ])('rejects malformed provider snapshots: %j', (overrides) => {
    expect(() => parse(event(dispute(overrides)))).toThrow(
      PaymentProviderError,
    );
  });

  it('preserves a balance transaction currency that differs after FX', () => {
    expect(
      parse(
        event(
          dispute({
            balance_transactions: [{ ...transaction(), currency: 'cad' }],
          }),
        ),
      ).dispute?.balanceTransactions[0]?.currency,
    ).toBe('CAD');
  });

  it('enforces signature, origin, owner and event environment before consumers act', async () => {
    const client = adapter({ stripeAccount: account });
    expect(() =>
      client.parseConnectWebhookEvent('not-json', signature('different')),
    ).toThrow('Invalid Stripe webhook signature');
    expect(() =>
      parse(event(dispute(), undefined, { account: 'acct_other' }), client),
    ).toThrow(PaymentNotOwnedError);
    expect(() =>
      parse(event(dispute(), undefined, { account: undefined })),
    ).toThrow(PaymentVerificationError);
    for (const livemode of [true, undefined, 'false']) {
      expect(() => parse(event(dispute(), undefined, { livemode }))).toThrow(
        PaymentVerificationError,
      );
    }
    expect(() =>
      parse(event(dispute(), undefined, { created: undefined })),
    ).toThrow(PaymentProviderError);
    const body = JSON.stringify(event());
    const resolver = vi.fn(() => undefined);
    await expect(
      client.resolveConnectWebhookEvent(body, signature(body), {
        resolveAccount: resolver,
      }),
    ).rejects.toThrow(PaymentNotOwnedError);
    expect(resolver).toHaveBeenCalledWith(
      account,
      expect.objectContaining({ dispute: expect.any(Object) }),
    );
    const owned = await client.resolveConnectWebhookEvent(
      body,
      signature(body),
      { resolveAccount: () => ({ tenant: 'cooperative' }) },
    );
    expect(owned.owner).toEqual({ tenant: 'cooperative' });
    expect(owned.event.duplicate).toBe(false);
    const untrusted = vi.fn();
    await expect(
      client.resolveConnectWebhookEvent(body, signature('bad'), {
        resolveAccount: untrusted,
      }),
    ).rejects.toThrow();
    expect(untrusted).not.toHaveBeenCalled();
  });

  it('also normalizes authenticated platform disputes, rejecting misrouted connected events', () => {
    const client = adapter();
    const body = JSON.stringify(
      event(dispute(), undefined, { account: undefined }),
    );
    expect(
      client.parseWebhookEvent(body, signature(body)).dispute?.account,
    ).toBeUndefined();
    const connectedBody = JSON.stringify(event());
    expect(() =>
      client.parseWebhookEvent(connectedBody, signature(connectedBody)),
    ).toThrow(PaymentVerificationError);
  });
});

describe('authoritative Stripe dispute reads', () => {
  it.each([
    undefined,
    account,
  ])('sends the authenticated account scope %s and returns it', async (stripeAccount) => {
    const { client, fetch } = retrieval(dispute());
    const result = await client.getDispute('du_fixture', {
      stripeAccount,
      expectedLivemode: false,
    });
    expect(result.account).toBe(stripeAccount);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toContain('/disputes/du_fixture?expand[]=charge');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('Stripe-Account')).toBe(
      stripeAccount ?? null,
    );
  });

  it('uses default scope, expands charge correlation, and rejects overriding a fixed account', async () => {
    const { client, fetch } = retrieval(
      dispute({
        payment_intent: null,
        charge: {
          id: 'ch_fixture',
          payment_intent: { id: 'pi_expanded' },
          livemode: false,
        },
      }),
      { stripeAccount: account },
    );
    expect(await client.getDispute('du_fixture')).toMatchObject({
      account,
      paymentIntentId: 'pi_expanded',
    });
    await expect(
      client.getDispute('du_fixture', { stripeAccount: 'acct_other' }),
    ).rejects.toThrow(PaymentNotOwnedError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    dispute({ id: 'du_other' }),
    dispute({ livemode: true }),
    dispute({ charge: { id: 'ch_fixture', payment_intent: 'pi_other' } }),
    dispute({ balance_transactions: undefined }),
    dispute({ account: 'acct_other' }),
  ])('rejects mismatched or incomplete authoritative data', async (response) => {
    const { client } = retrieval(response);
    await expect(
      client.getDispute('du_fixture', {
        stripeAccount: account,
        expectedLivemode: false,
      }),
    ).rejects.toThrow();
  });

  it('propagates provider and transport failures without making a write', async () => {
    const { client } = retrieval({ error: { message: 'missing' } }, {}, 404);
    await expect(
      client.getDispute('du_fixture', { stripeAccount: account }),
    ).rejects.toThrow();
    const fetch = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(
      adapter({ fetch }).getDispute('du_fixture', { stripeAccount: account }),
    ).rejects.toThrow('offline');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    'du_noncard',
    'dp_legacy',
  ])('accepts valid non-card charge identity with dispute %s', async (id) => {
    const payload = dispute({ id, charge: 'py_noncard', payment_intent: null });
    expect(parse(event(payload)).dispute).toMatchObject({
      id,
      chargeId: 'py_noncard',
    });
    const { client, fetch } = retrieval(payload);
    expect(
      await client.getDispute(id, { stripeAccount: account }),
    ).toMatchObject({ id, chargeId: 'py_noncard', account });
    expect(String(fetch.mock.calls[0]?.[0])).toContain(
      `/disputes/${id}?expand[]=charge`,
    );
  });

  it('rejects malformed identifiers and accounts before requesting', async () => {
    const { client, fetch } = retrieval();
    await expect(client.getDispute('du_bad/path')).rejects.toThrow();
    await expect(
      client.getDispute('du_fixture', { stripeAccount: 'invalid' }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
