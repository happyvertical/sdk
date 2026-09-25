import { describe, expect, it } from 'vitest';
import { createFakeStripe } from '../../../test/fake-stripe.js';

function fakeWith(
  status: string,
  extra: Record<string, unknown> = {},
  finalized: Record<string, unknown> = {
    status: 'open',
    amount_remaining: 2500,
  },
) {
  return createFakeStripe((call) =>
    call.path.endsWith('/finalize')
      ? { body: { id: 'in_1', ...finalized } }
      : call.method === 'GET'
        ? {
            body: {
              id: 'in_1',
              status,
              currency: 'usd',
              total: 2500,
              amount_paid: 0,
              amount_remaining: 2500,
              ...extra,
            },
          }
        : { body: { id: 'in_1', status: 'paid', paid_out_of_band: true } },
  );
}

describe('Stripe invoices paid out of band (#1277)', () => {
  it('pays an open invoice out of band, idempotently keyed', async () => {
    const { provider, calls } = fakeWith('open');
    await provider.invoices.markPaidOutOfBand?.('in_1');
    expect(calls.map((call) => [call.method, call.path])).toEqual([
      ['GET', '/v1/invoices/in_1'],
      ['POST', '/v1/invoices/in_1/pay'],
    ]);
    expect(calls[1]).toMatchObject({
      params: { paid_out_of_band: 'true' },
      idempotencyKey: 'in_1:paid_out_of_band',
    });
  });

  it('leaves an invoice already paid out of band alone', async () => {
    const { provider, calls } = fakeWith('paid', { paid_out_of_band: true });
    await provider.invoices.markPaidOutOfBand?.('in_1');
    expect(calls).toHaveLength(1);
  });

  it('refuses an invoice Stripe already collected itself', async () => {
    const { provider, calls } = fakeWith('paid', { amount_paid: 2500 });
    await expect(provider.invoices.markPaidOutOfBand?.('in_1')).rejects.toThrow(
      /already paid through Stripe/,
    );
    expect(calls).toHaveLength(1);
  });

  it('stops after a finalization that settles the invoice, and refuses one that grows it', async () => {
    const settled = fakeWith(
      'draft',
      {},
      { status: 'paid', amount_remaining: 0 },
    );
    await settled.provider.invoices.markPaidOutOfBand?.('in_1');
    expect(settled.calls.map((call) => call.path)).toEqual([
      '/v1/invoices/in_1',
      '/v1/invoices/in_1/finalize',
    ]);
    const grown = fakeWith(
      'draft',
      {},
      { status: 'open', amount_remaining: 2825 },
    );
    await expect(
      grown.provider.invoices.markPaidOutOfBand?.('in_1'),
    ).rejects.toThrow(/grew from 2500 to 2825/);
    expect(grown.calls.at(-1)?.path).toBe('/v1/invoices/in_1/finalize');
  });

  it('finalizes a draft without automatic collection before paying it', async () => {
    const { provider, calls } = fakeWith('draft');
    await provider.invoices.markPaidOutOfBand?.('in_1');
    expect(calls.map((call) => call.path)).toEqual([
      '/v1/invoices/in_1',
      '/v1/invoices/in_1/finalize',
      '/v1/invoices/in_1/pay',
    ]);
    expect(calls[1]).toMatchObject({
      params: { auto_advance: 'false' },
      idempotencyKey: 'in_1:finalize_out_of_band',
    });
  });

  it('pays an uncollectible invoice and refuses a void one', async () => {
    const uncollectible = fakeWith('uncollectible');
    await uncollectible.provider.invoices.markPaidOutOfBand?.('in_1');
    expect(uncollectible.calls.at(-1)?.path).toBe('/v1/invoices/in_1/pay');

    const voided = fakeWith('void');
    await expect(
      voided.provider.invoices.markPaidOutOfBand?.('in_1'),
    ).rejects.toThrow(/void/);
    expect(voided.calls).toHaveLength(1);
  });

  it('reports paidOutOfBand on pulled invoices', async () => {
    const paid = fakeWith('paid', {
      paid_out_of_band: true,
      amount_paid: 2500,
    });
    await expect(paid.provider.invoices.pull('in_1')).resolves.toMatchObject({
      status: 'paid',
      paidOutOfBand: true,
    });
    const card = fakeWith('paid');
    await expect(card.provider.invoices.pull('in_1')).resolves.toMatchObject({
      paidOutOfBand: false,
    });
  });
});
