import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickBooksWriteError } from '../../errors.js';
import type { QuickBooksPaymentInput } from '../../types.js';
import { QuickBooksProvider } from './index.js';
import { prepareQuickBooksPaymentRequest } from './payment-request.js';

function provider() {
  const p = new QuickBooksProvider({
    type: 'quickbooks',
    clientId: 'test',
    clientSecret: 'test',
    refreshToken: 'test',
    realmId: 'realm-a',
    environment: 'sandbox',
    maxRetries: 0,
  });
  vi.spyOn(p, 'ensureAccessToken').mockResolvedValue('token');
  return p;
}

function input(): QuickBooksPaymentInput {
  return {
    customerRef: 'cust-1',
    depositToAccountRef: 'bank-1',
    paidOn: '2026-11-10',
    currency: 'CAD',
    amount: 150.5,
    applications: [
      { invoiceRef: 'inv-1', amount: 100 },
      { invoiceRef: 'inv-2', amount: 50.5 },
    ],
    reference: 'ch_123',
  };
}
const identity = {
  requestId: 'pay-1',
  realmId: 'realm-a',
  environment: 'sandbox' as const,
};

/** The record QBO documents for a payment created from input(). */
function stored(overrides: Record<string, unknown> = {}) {
  return {
    Id: 'pay-remote-1',
    SyncToken: '0',
    TxnDate: '2026-11-10',
    TotalAmt: 150.5,
    UnappliedAmt: 0,
    CustomerRef: { value: 'cust-1' },
    DepositToAccountRef: { value: 'bank-1' },
    CurrencyRef: { value: 'CAD' },
    PaymentRefNum: 'ch_123',
    Line: [
      { Amount: 100, LinkedTxn: [{ TxnId: 'inv-1', TxnType: 'Invoice' }] },
      { Amount: 50.5, LinkedTxn: [{ TxnId: 'inv-2', TxnType: 'Invoice' }] },
    ],
    ...overrides,
  };
}

function mockFetch(readback: unknown, postStatus = 200) {
  const calls: { url: URL; method: string; body?: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url: new URL(url),
        method: init.method as string,
        body: init.body as string | undefined,
      });
      if (init.method === 'POST')
        return new Response(
          postStatus === 200
            ? JSON.stringify({ Payment: stored() })
            : '{"Fault":{}}',
          { status: postStatus },
        );
      return new Response(JSON.stringify({ Payment: readback }), {
        status: 200,
      });
    }),
  );
  return calls;
}

describe('QuickBooks payment creation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('posts the documented payload with requestid and verifies the readback', async () => {
    const calls = mockFetch(stored());
    const request = prepareQuickBooksPaymentRequest(input(), identity);
    const result = await provider().payments.create(input(), request);

    expect(calls[0].method).toBe('POST');
    expect(calls[0].url.pathname).toBe('/v3/company/realm-a/payment');
    expect(calls[0].url.searchParams.get('requestid')).toBe('pay-1');
    expect(JSON.parse(calls[0].body as string)).toEqual({
      TotalAmt: 150.5,
      CustomerRef: { value: 'cust-1' },
      DepositToAccountRef: { value: 'bank-1' },
      TxnDate: '2026-11-10',
      CurrencyRef: { value: 'CAD' },
      PaymentRefNum: 'ch_123',
      Line: [
        { Amount: 100, LinkedTxn: [{ TxnId: 'inv-1', TxnType: 'Invoice' }] },
        { Amount: 50.5, LinkedTxn: [{ TxnId: 'inv-2', TxnType: 'Invoice' }] },
      ],
    });
    expect(calls[1].method).toBe('GET');
    expect(calls[1].url.pathname).toBe(
      '/v3/company/realm-a/payment/pay-remote-1',
    );
    expect(result).toMatchObject({
      externalId: 'pay-remote-1',
      syncToken: '0',
      customerRef: 'cust-1',
      depositToAccountRef: 'bank-1',
      amount: 150.5,
      applications: [
        { invoiceRef: 'inv-1', amount: 100 },
        { invoiceRef: 'inv-2', amount: 50.5 },
      ],
      payment: {
        externalId: 'pay-remote-1',
        invoiceExternalIds: ['inv-1', 'inv-2'],
      },
    });
  });

  it.each([
    ['amount', { TotalAmt: 150 }],
    ['customer', { CustomerRef: { value: 'cust-2' } }],
    ['deposit account', { DepositToAccountRef: { value: 'bank-2' } }],
    ['date', { TxnDate: '2026-11-11' }],
    ['unapplied remainder', { UnappliedAmt: 1 }],
    ['reference', { PaymentRefNum: 'other' }],
    [
      'linked invoice',
      {
        Line: [
          { Amount: 100, LinkedTxn: [{ TxnId: 'inv-1', TxnType: 'Invoice' }] },
          { Amount: 50.5, LinkedTxn: [{ TxnId: 'inv-9', TxnType: 'Invoice' }] },
        ],
      },
    ],
    [
      'applied amount',
      {
        Line: [
          { Amount: 90, LinkedTxn: [{ TxnId: 'inv-1', TxnType: 'Invoice' }] },
          { Amount: 60.5, LinkedTxn: [{ TxnId: 'inv-2', TxnType: 'Invoice' }] },
        ],
      },
    ],
  ])('reports an unknown outcome with the remote id when readback %s differs', async (_label, change) => {
    mockFetch(stored(change));
    const request = prepareQuickBooksPaymentRequest(input(), identity);
    const error = await provider()
      .payments.create(input(), request)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(QuickBooksWriteError);
    expect(error).toMatchObject({
      outcome: 'unknown',
      externalId: 'pay-remote-1',
      requestId: 'pay-1',
    });
  });

  it('reports a rejected create as a rejected write', async () => {
    mockFetch(stored(), 400);
    const request = prepareQuickBooksPaymentRequest(input(), identity);
    const error = await provider()
      .payments.create(input(), request)
      .catch((e: unknown) => e);
    // A reused request identity cannot prove the write never landed.
    expect(error).toBeInstanceOf(QuickBooksWriteError);
    expect((error as QuickBooksWriteError).status).toBe(400);
  });

  it('refuses to send when the input no longer matches the prepared request', async () => {
    const calls = mockFetch(stored());
    const request = prepareQuickBooksPaymentRequest(input(), identity);
    const changed = { ...input(), reference: 'ch_999' };
    await expect(provider().payments.create(changed, request)).rejects.toThrow(
      'payload mismatch',
    );
    expect(calls).toHaveLength(0);
  });

  it('refuses a descriptor for another realm or environment', async () => {
    const calls = mockFetch(stored());
    const request = prepareQuickBooksPaymentRequest(input(), {
      ...identity,
      realmId: 'realm-b',
    });
    await expect(provider().payments.create(input(), request)).rejects.toThrow(
      'realm/environment mismatch',
    );
    expect(calls).toHaveLength(0);
  });

  it.each<[string, Partial<QuickBooksPaymentInput>]>([
    ['unbalanced total', { amount: 151 }],
    ['no applications', { applications: [] }],
    [
      'duplicate invoice',
      {
        applications: [
          { invoiceRef: 'inv-1', amount: 100 },
          { invoiceRef: 'inv-1', amount: 50.5 },
        ],
      },
    ],
    ['off-grid amount', { amount: 150.505 }],
    [
      'zero application',
      {
        amount: 50.5,
        applications: [
          { invoiceRef: 'inv-1', amount: 0 },
          { invoiceRef: 'inv-2', amount: 50.5 },
        ],
      },
    ],
    ['bad date', { paidOn: '2026-02-30' }],
    ['unknown currency', { currency: 'XXX' }],
    ['injected ref', { customerRef: "1' OR '1'='1" }],
    ['long reference', { reference: 'x'.repeat(22) }],
  ])('rejects %s before any I/O', (_label, change) => {
    expect(() =>
      prepareQuickBooksPaymentRequest({ ...input(), ...change }, identity),
    ).toThrow();
  });

  it('rejects an unsafe requestId', () => {
    expect(() =>
      prepareQuickBooksPaymentRequest(input(), {
        ...identity,
        requestId: 'a b',
      }),
    ).toThrow('requestId');
  });
});
