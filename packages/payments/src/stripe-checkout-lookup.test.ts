/* biome-ignore-all lint/style/useNamingConvention: Stripe wire-format fixtures. */
import { describe, expect, it, vi } from 'vitest';
import { StripeAdapter } from './adapters/stripe.js';
import {
  PaymentConfigurationError,
  PaymentNotOwnedError,
  PaymentProviderError,
  PaymentVerificationError,
} from './errors.js';
import type { PaymentBackend, PaymentCheckoutLookupResult } from './index.js';

const account = 'acct_owned';
const input = {
  paymentIntentId: 'pi_owned',
  livemode: false,
  stripeAccount: account,
};
const intent = (overrides: Record<string, unknown> = {}) => ({
  object: 'payment_intent',
  id: 'pi_owned',
  livemode: false,
  ...overrides,
});
const charge = (overrides: Record<string, unknown> = {}) => ({
  object: 'charge',
  id: 'ch_owned',
  livemode: false,
  payment_intent: 'pi_owned',
  ...overrides,
});
const session = (overrides: Record<string, unknown> = {}) => ({
  object: 'checkout.session',
  id: 'cs_test_owned',
  livemode: false,
  mode: 'payment',
  payment_intent: 'pi_owned',
  metadata: { quoteId: 'opaque quote:42' },
  client_reference_id: 'opaque quote:42',
  ...overrides,
});
const list = (data: unknown[] = [], hasMore: unknown = false) => ({
  object: 'list',
  data,
  has_more: hasMore,
});
function fixture(responses: unknown[], options = {}) {
  let index = 0;
  const fetch = vi.fn(async () => {
    const response = responses[index++];
    if (response instanceof Error) throw response;
    if (response instanceof Response) return response;
    return new Response(JSON.stringify(response), { status: 200 });
  });
  return {
    client: new StripeAdapter({
      secretKey: 'sk_test_fixture',
      fetch,
      ...options,
    }),
    fetch,
  };
}

describe('Stripe checkout reverse reconciliation', () => {
  it('recovers a lost-response legacy checkout and repeats without cache, exposing only typed data', async () => {
    const { client, fetch } = fixture([
      intent(),
      list([session({ private: 'never expose' })]),
      intent(),
      list([session()]),
    ]);
    const result: PaymentCheckoutLookupResult =
      await client.lookupCheckout(input);
    const backend: PaymentBackend = client;
    expect(backend.lookupCheckout).toBeTypeOf('function');
    expect(result).toEqual({
      backendId: 'stripe',
      accountId: account,
      livemode: false,
      paymentIntentId: 'pi_owned',
      status: 'matched',
      checkoutId: 'cs_test_owned',
      quoteId: 'opaque quote:42',
      clientReferenceId: 'opaque quote:42',
    });
    expect(await client.lookupCheckout(input)).toEqual(result);
    expect(fetch.mock.calls).toHaveLength(4);
    for (const call of fetch.mock.calls as unknown as [string, RequestInit][]) {
      expect(new Headers(call[1].headers).get('Stripe-Account')).toBe(account);
      expect(call[1].method).toBe('GET');
    }
    expect((fetch.mock.calls as unknown as [string][])[1]?.[0]).toContain(
      'payment_intent=pi_owned&limit=100',
    );
  });

  it.each([
    { metadata: {}, client_reference_id: 'client only' },
    { metadata: { quoteId: 'metadata only' }, client_reference_id: null },
    { metadata: { quoteId: 'metadata only' }, client_reference_id: undefined },
  ])('supports a single legacy quote identity %j', async (fields) => {
    const { client } = fixture([intent(), list([session(fields)])]);
    expect(await client.lookupCheckout(input)).toMatchObject({
      status: 'matched',
      quoteId: fields.metadata.quoteId ?? fields.client_reference_id,
    });
  });

  it('resolves Charge-only evidence and validates both supplied references', async () => {
    const { client, fetch } = fixture([charge(), intent(), list([session()])]);
    expect(
      await client.lookupCheckout({
        ...input,
        paymentIntentId: undefined,
        chargeId: 'ch_owned',
      }),
    ).toMatchObject({
      status: 'matched',
      chargeId: 'ch_owned',
      paymentIntentId: 'pi_owned',
    });
    expect((fetch.mock.calls as unknown as [string][])[0]?.[0]).toContain(
      '/charges/ch_owned',
    );
    const valid = fixture([charge(), intent(), list([session()])]);
    expect(
      await valid.client.lookupCheckout({ ...input, chargeId: 'ch_owned' }),
    ).toMatchObject({ status: 'matched' });
    const invalid = fixture([charge({ payment_intent: 'pi_other' })]);
    await expect(
      invalid.client.lookupCheckout({ ...input, chargeId: 'ch_owned' }),
    ).rejects.toBeInstanceOf(PaymentVerificationError);
  });

  it.each([
    undefined,
    'pi_owned',
  ])('reconciles bank-debit Charge py_ evidence with PI %s', async (paymentIntentId) => {
    const { client, fetch } = fixture([
      charge({ id: 'py_owned' }),
      intent(),
      list([session()]),
    ]);
    expect(
      await client.lookupCheckout({
        ...input,
        paymentIntentId,
        chargeId: 'py_owned',
      }),
    ).toMatchObject({
      status: 'matched',
      chargeId: 'py_owned',
      paymentIntentId: 'pi_owned',
    });
    expect((fetch.mock.calls as unknown as [string][])[0]?.[0]).toContain(
      '/charges/py_owned',
    );
  });

  it.each([
    { id: 'py_other' },
    { id: 'ch_owned' },
    { object: 'payment_intent' },
    { livemode: true },
    { account: 'acct_foreign' },
    { payment_intent: 'pi_other' },
  ])('refuses conflicting bank-debit Charge identity %j', async (fields) => {
    const { client, fetch } = fixture([charge({ id: 'py_owned', ...fields })]);
    await expect(
      client.lookupCheckout({ ...input, chargeId: 'py_owned' }),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns complete no_match for an external PI or a validated legacy Charge without PI', async () => {
    const external = fixture([intent(), list()]);
    expect(await external.client.lookupCheckout(input)).toMatchObject({
      status: 'no_match',
    });
    const legacy = fixture([charge({ payment_intent: null })]);
    expect(
      await legacy.client.lookupCheckout({
        livemode: false,
        chargeId: 'ch_owned',
      }),
    ).toEqual({
      backendId: 'stripe',
      livemode: false,
      chargeId: 'ch_owned',
      status: 'no_match',
    });
    expect(legacy.fetch).toHaveBeenCalledTimes(1);
    const inconsistent = fixture([charge({ payment_intent: null })]);
    await expect(
      inconsistent.client.lookupCheckout({ ...input, chargeId: 'ch_owned' }),
    ).rejects.toBeInstanceOf(PaymentVerificationError);
  });

  it('uses platform or configured scope and refuses overrides of configured accounts', async () => {
    const platform = fixture([intent(), list()]);
    expect(
      await platform.client.lookupCheckout({
        ...input,
        stripeAccount: undefined,
      }),
    ).not.toHaveProperty('accountId');
    expect(
      new Headers(
        (
          platform.fetch.mock.calls as unknown as [string, RequestInit][]
        )[0]?.[1].headers,
      ).has('Stripe-Account'),
    ).toBe(false);
    const scoped = fixture([intent(), list()], { stripeAccount: account });
    expect(
      await scoped.client.lookupCheckout({
        ...input,
        stripeAccount: undefined,
      }),
    ).toMatchObject({ accountId: account });
    await expect(
      scoped.client.lookupCheckout({ ...input, stripeAccount: 'acct_foreign' }),
    ).rejects.toBeInstanceOf(PaymentNotOwnedError);
    expect(scoped.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    intent({ id: 'pi_other' }),
    intent({ livemode: true }),
    intent({ account: 'acct_foreign' }),
    intent({ object: 'charge' }),
    intent({ livemode: undefined }),
    intent({ id: 42 }),
  ])('fails closed on malformed or foreign PI %j', async (value) => {
    const { client, fetch } = fixture([value]);
    await expect(client.lookupCheckout(input)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    charge({ id: 'ch_other' }),
    charge({ object: 'payment_intent' }),
    charge({ livemode: true }),
    charge({ account: 'acct_foreign' }),
    charge({ payment_intent: undefined }),
    charge({ payment_intent: 42 }),
    charge({ payment_intent: intent({ livemode: true }) }),
  ])('fails closed on malformed or foreign Charge %j', async (value) => {
    const { client } = fixture([value]);
    await expect(
      client.lookupCheckout({ ...input, chargeId: 'ch_owned' }),
    ).rejects.toThrow();
  });

  it.each([
    { id: 'wrong' },
    { object: 'payment_intent' },
    { livemode: true },
    { account: 'acct_foreign' },
    { payment_intent: 'pi_other' },
    { payment_intent: null },
    { payment_intent: intent({ livemode: true }) },
    { mode: 'subscription' },
    { mode: 'future_mode' },
    { metadata: [] },
    { metadata: { quoteId: 42 } },
    { client_reference_id: 42 },
    { client_reference_id: 'conflict' },
    { metadata: { quoteId: ' opaque quote:42' } },
  ])('refuses malformed, unknown or inconsistent Session identity %j', async (fields) => {
    const { client } = fixture([intent(), list([session(fields)])]);
    await expect(client.lookupCheckout(input)).rejects.toThrow();
  });

  it('validates expanded PI references and account/environment across all resource reads', async () => {
    const { client } = fixture([
      charge({ payment_intent: intent() }),
      intent(),
      list([session({ payment_intent: intent() })]),
    ]);
    expect(
      await client.lookupCheckout({ ...input, chargeId: 'ch_owned' }),
    ).toMatchObject({ status: 'matched' });
    const wrongPlatform = fixture([intent({ account })]);
    await expect(
      wrongPlatform.client.lookupCheckout({
        ...input,
        stripeAccount: undefined,
      }),
    ).rejects.toBeInstanceOf(PaymentVerificationError);
  });

  it('distinguishes absent quote ownership from complete absence', async () => {
    const { client } = fixture([
      intent(),
      list([session({ metadata: undefined, client_reference_id: null })]),
    ]);
    expect(await client.lookupCheckout(input)).toMatchObject({
      status: 'indeterminate',
      reason: 'missing_quote',
    });
  });

  it('exhausts pagination before accepting a match and follows scoped cursors', async () => {
    const { client, fetch } = fixture([
      intent(),
      list([session()], true),
      list(),
    ]);
    expect(await client.lookupCheckout(input)).toMatchObject({
      status: 'matched',
    });
    const request = (
      fetch.mock.calls as unknown as [string, RequestInit][]
    )[2]!;
    expect(request[0]).toContain('starting_after=cs_test_owned');
    expect(new Headers(request[1].headers).get('Stripe-Account')).toBe(account);
  });

  it('returns indeterminate when pagination is capped even with a valid candidate', async () => {
    const { client } = fixture([intent(), list([session()], true)]);
    expect(
      await client.lookupCheckout({ ...input, maxPages: 1 }),
    ).toMatchObject({ status: 'indeterminate', reason: 'pagination_limit' });
  });

  it('returns indeterminate for multiple sessions even when quotes agree', async () => {
    const { client } = fixture([
      intent(),
      list([session()], true),
      list([session({ id: 'cs_test_second' })]),
    ]);
    expect(await client.lookupCheckout(input)).toMatchObject({
      status: 'indeterminate',
      reason: 'ambiguous',
    });
  });

  it.each([
    list([], true),
    { object: 'list', data: [], has_more: 'false' },
    { object: 'list', data: {}, has_more: false },
    { data: [], has_more: false },
    null,
    list([null]),
    list(Array.from({ length: 101 }, () => session())),
  ])('rejects invalid pagination envelopes %j', async (page) => {
    const { client } = fixture([intent(), page]);
    await expect(client.lookupCheckout(input)).rejects.toBeInstanceOf(
      PaymentProviderError,
    );
  });

  it('rejects repeated cursors/duplicate sessions instead of asserting absence', async () => {
    const { client } = fixture([
      intent(),
      list([session()], true),
      list([session()], true),
    ]);
    await expect(client.lookupCheckout(input)).rejects.toBeInstanceOf(
      PaymentProviderError,
    );
  });

  it.each([
    new Error('private network detail'),
    new Response('private invalid json', { status: 200 }),
    new Response(
      JSON.stringify({ error: { message: 'private error detail' } }),
      { status: 503 },
    ),
    new Response('not found', { status: 404 }),
  ])('preserves provider failure without exposing private data', async (failure) => {
    const { client } = fixture([failure]);
    await expect(client.lookupCheckout(input)).rejects.toThrow(
      'Stripe checkout lookup request failed.',
    );
  });

  it('preserves safe retryability without retaining upstream messages or causes', async () => {
    for (const failure of [
      new Error('private network'),
      new Response('private upstream', { status: 503 }),
    ]) {
      const { client } = fixture([failure]);
      await expect(client.lookupCheckout(input)).rejects.toMatchObject({
        retryable: true,
        message: 'Stripe checkout lookup request failed.',
      });
    }
    const { client } = fixture([
      new Response('private missing', { status: 404 }),
    ]);
    const error = await client
      .lookupCheckout(input)
      .catch((error: unknown) => error);
    expect(error).toMatchObject({ retryable: false });
    expect(error).not.toHaveProperty('cause');
  });

  it('fails rather than returning a candidate when a later page is unavailable', async () => {
    const { client } = fixture([
      intent(),
      list([session()], true),
      new Error('offline'),
    ]);
    await expect(client.lookupCheckout(input)).rejects.toBeInstanceOf(
      PaymentProviderError,
    );
  });

  it.each([
    {},
    { ...input, livemode: 'false' },
    { ...input, paymentIntentId: 'ch_wrong' },
    { ...input, chargeId: 'invalid' },
    { ...input, chargeId: 'py_' },
    { ...input, chargeId: 'py_owned!' },
    { ...input, maxPages: 0 },
    { ...input, maxPages: 101 },
    { ...input, maxPages: 1.5 },
    { ...input, stripeAccount: 'foreign' },
  ])('rejects invalid input before fetching %j', async (value) => {
    const { client, fetch } = fixture([]);
    await expect(
      client.lookupCheckout(value as typeof input),
    ).rejects.toBeInstanceOf(PaymentConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
