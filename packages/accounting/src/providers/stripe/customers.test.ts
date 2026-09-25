import { describe, expect, it } from 'vitest';
import { createFakeStripe } from '../../../test/fake-stripe.js';

const customer = {
  id: 'account-42',
  name: 'Network Co',
  email: 'billing@example.test',
  idempotencyKey: 'billing-account:account-42',
};

describe('Stripe idempotent customer creation (#1268)', () => {
  it('sends a key derived from the caller key and tags the local id', async () => {
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/customers/search') {
        return { body: { object: 'search_result', data: [] } };
      }
      if (call.method === 'POST' && call.path === '/v1/customers') {
        return { body: { id: 'cus_1' } };
      }
    });

    await expect(provider.customers.push(customer)).resolves.toMatchObject({
      action: 'created',
      externalId: 'cus_1',
    });

    expect(calls[0]).toMatchObject({
      method: 'GET',
      path: '/v1/customers/search',
      params: { query: "metadata['local_id']:'account-42'" },
    });
    expect(calls[1]).toMatchObject({
      method: 'POST',
      path: '/v1/customers',
      idempotencyKey: 'billing-account:account-42:customer',
      params: { 'metadata[local_id]': 'account-42', name: 'Network Co' },
    });
  });

  it('returns the same customer when a lost response is replayed with the key', async () => {
    // Stripe replays an idempotent create inside its retention window; search
    // has not indexed the first customer yet.
    const created = new Map<string, string>();
    let creates = 0;
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/customers/search') {
        return { body: { object: 'search_result', data: [] } };
      }
      if (call.method === 'POST' && call.path === '/v1/customers') {
        const key = call.idempotencyKey as string;
        if (!created.has(key)) {
          creates += 1;
          created.set(key, `cus_${creates}`);
        }
        return { body: { id: created.get(key) } };
      }
    });

    const first = await provider.customers.sync(customer);
    const replay = await provider.customers.sync(customer);

    expect(replay.externalId).toBe(first.externalId);
    expect(creates).toBe(1);
    const keys = calls
      .filter((call) => call.method === 'POST')
      .map((call) => call.idempotencyKey);
    expect(keys).toEqual([
      'billing-account:account-42:customer',
      'billing-account:account-42:customer',
    ]);
  });

  it('reconciles by local id after the idempotency key has expired', async () => {
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/customers/search') {
        return {
          body: {
            object: 'search_result',
            data: [
              // A later duplicate from a pre-#1268 retry, and a foreign
              // customer whose metadata only resembles ours.
              {
                id: 'cus_dup',
                created: 200,
                metadata: { local_id: 'account-42' },
              },
              {
                id: 'cus_original',
                created: 100,
                metadata: { local_id: 'account-42' },
              },
              {
                id: 'cus_other',
                created: 50,
                metadata: { local_id: 'account-420' },
              },
            ],
          },
        };
      }
    });

    await expect(provider.customers.push(customer)).resolves.toMatchObject({
      externalId: 'cus_original',
    });
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('follows search pages before deciding a customer is missing', async () => {
    const { provider } = createFakeStripe((call) => {
      if (call.path === '/v1/customers/search') {
        return call.params.page
          ? {
              body: {
                object: 'search_result',
                data: [
                  {
                    id: 'cus_page2',
                    created: 1,
                    metadata: { local_id: 'account-42' },
                  },
                ],
                has_more: false,
              },
            }
          : {
              body: {
                object: 'search_result',
                data: [],
                has_more: true,
                next_page: 'page_2',
              },
            };
      }
    });

    await expect(provider.customers.push(customer)).resolves.toMatchObject({
      externalId: 'cus_page2',
    });
  });

  it('escapes quotes in the search query', async () => {
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/customers/search') {
        return { body: { object: 'search_result', data: [] } };
      }
      return { body: { id: 'cus_1' } };
    });

    await provider.customers.push({ ...customer, id: "o'brien\\x" });
    expect(calls[0]?.params.query).toBe(
      "metadata['local_id']:'o\\'brien\\\\x'",
    );
  });

  it('keeps the adapter local id even when caller metadata sets local_id', async () => {
    const { provider, calls } = createFakeStripe((call) => {
      if (call.path === '/v1/customers/search') {
        return { body: { object: 'search_result', data: [] } };
      }
      return { body: { id: 'cus_1' } };
    });

    await provider.customers.push({
      ...customer,
      metadata: { local_id: 'spoofed', tenant: 't1' },
    });
    expect(calls[1]?.params).toMatchObject({
      'metadata[local_id]': 'account-42',
      'metadata[tenant]': 't1',
    });
  });

  it('keeps unkeyed pushes unchanged (no search, random key)', async () => {
    const { provider, calls } = createFakeStripe(() => ({
      body: { id: 'cus_1' },
    }));

    await provider.customers.push({ id: 'account-1', name: 'Solo' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.idempotencyKey).toMatch(/^sdk-/);
  });

  it('rejects an empty idempotency key', async () => {
    const { provider, calls } = createFakeStripe(() => ({ body: {} }));
    await expect(
      provider.customers.push({ ...customer, idempotencyKey: ' ' }),
    ).rejects.toThrow('idempotencyKey must be a non-empty string');
    expect(calls).toHaveLength(0);
  });
});
