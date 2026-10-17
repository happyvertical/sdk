import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickBooksProvider } from './index.js';
import {
  mapQuickBooksReceivableRequest,
  prepareQuickBooksReceivableRequest,
  type QuickBooksOrdinaryReceivableMapping,
  type QuickBooksReceivableInput,
  type QuickBooksReceivableMapping,
  reconcileQuickBooksReceivableRecord,
  validateQuickBooksReceivableRequest,
} from './receivable-transfer.js';

const mapping: QuickBooksReceivableMapping = {
  realmId: 'realm-a',
  environment: 'sandbox',
  version: 'mapping-1',
  reviewEvidenceRef: 'review-1',
  accountingBasis: 'accrual',
  taxTiming: 'invoice-tax-point',
  releaseDueDates: 'host-managed',
  currency: 'CAD',
  customerRef: 'customer-1',
  receivablesAccountRef: 'ar',
  retainedAssetAccountRef: 'retained',
  cashAccountRef: 'bank',
};
function input(
  kind:
    | 'withhold'
    | 'release'
    | 'cash-refund'
    | 'reverse-cash-refund' = 'withhold',
): QuickBooksReceivableInput {
  return {
    mapping: structuredClone(mapping),
    source: {
      type: 'Invoice',
      id: 'invoice-1',
      customerRef: 'customer-1',
      evidenceRef: 'frozen-invoice-1',
    },
    requestId: 'request-1',
    effectiveOn: '2026-10-16',
    evidenceRef: 'agreement-1',
    kind,
    amountMinor: 1000,
  };
}
function application(): QuickBooksReceivableInput {
  return {
    ...input(),
    kind: 'application',
    debit: { type: 'Invoice', id: 'invoice-1' },
    credit: { type: 'JournalEntry', id: 'journal-1' },
  };
}
function record(value: QuickBooksReceivableInput) {
  return {
    ...mapQuickBooksReceivableRequest(value),
    Id: 'remote-1',
    SyncToken: '0',
    ...(value.kind === 'application' ? { UnappliedAmt: 0 } : {}),
  };
}
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
function fixtures() {
  const journal = record(input());
  journal.Id = 'journal-1';
  return new Map<string, unknown>([
    [
      'preferences',
      {
        Preferences: {
          CurrencyPrefs: {
            HomeCurrency: { value: 'CAD' },
            MultiCurrencyEnabled: false,
          },
        },
      },
    ],
    ['customer/customer-1', { Customer: { Id: 'customer-1', Active: true } }],
    [
      'account/ar',
      {
        Account: { Id: 'ar', Active: true, AccountType: 'Accounts Receivable' },
      },
    ],
    [
      'account/retained',
      {
        Account: {
          Id: 'retained',
          Active: true,
          AccountType: 'Other Current Asset',
        },
      },
    ],
    [
      'account/bank',
      { Account: { Id: 'bank', Active: true, AccountType: 'Bank' } },
    ],
    [
      'invoice/invoice-1',
      {
        Invoice: {
          Id: 'invoice-1',
          CustomerRef: { value: 'customer-1' },
          CurrencyRef: { value: 'CAD' },
          Balance: 105,
        },
      },
    ],
    ['journalentry/journal-1', { JournalEntry: journal }],
    [
      'creditmemo/credit-1',
      {
        CreditMemo: {
          Id: 'credit-1',
          CustomerRef: { value: 'customer-1' },
          CurrencyRef: { value: 'CAD' },
          RemainingCredit: 10,
        },
      },
    ],
  ]);
}
function network(rows = fixtures()) {
  const posts: { url: URL; body: Record<string, unknown> }[] = [];
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    const parsed = new URL(url),
      endpoint = parsed.pathname.split('/realm-a/')[1];
    if (options?.method === 'POST') {
      const body = JSON.parse(options.body as string);
      posts.push({ url: parsed, body });
      return new Response(
        JSON.stringify({
          [endpoint === 'journalentry' ? 'JournalEntry' : 'Payment']: {
            ...body,
            Id: 'remote-1',
            SyncToken: '0',
            ...(endpoint === 'payment' ? { UnappliedAmt: 0 } : {}),
          },
        }),
      );
    }
    const value =
      endpoint === 'query'
        ? { QueryResponse: { Payment: [] } }
        : rows.get(endpoint);
    if (!value) throw new Error(`Unexpected fixture GET ${endpoint}`);
    return new Response(JSON.stringify(value));
  });
  vi.stubGlobal('fetch', fetcher);
  return { posts, fetcher, rows };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function ordinary(
  kind: 'application' | 'cash-refund' | 'reverse-cash-refund' = 'application',
): QuickBooksReceivableInput {
  const {
    retainedAssetAccountRef: _retained,
    releaseDueDates: _due,
    ...common
  } = mapping;
  const ordinaryMapping: QuickBooksOrdinaryReceivableMapping = {
    ...common,
    kind: 'ordinary',
  };
  return {
    ...(kind === 'application'
      ? {
          ...application(),
          credit: { type: 'CreditMemo' as const, id: 'credit-1' },
        }
      : input(kind)),
    mapping: ordinaryMapping,
  };
}

describe('ordinary receivables without retention authority', () => {
  it('preserves all existing retained prepared payload hashes', () => {
    expect(
      [
        'withhold',
        'release',
        'cash-refund',
        'reverse-cash-refund',
        'application',
      ].map(
        (kind) =>
          prepareQuickBooksReceivableRequest(
            kind === 'application' ? application() : input(kind as 'withhold'),
          ).payloadHash,
      ),
    ).toMatchSnapshot();
  });
  it.each([
    'application',
    'cash-refund',
    'reverse-cash-refund',
  ] as const)('executes and reads %s using only reviewed AR/cash accounts', async (kind) => {
    const net = network();
    net.rows.delete('account/retained');
    const value = ordinary(kind);
    if (kind === 'application') value.mapping.cashAccountRef = null;
    const request = prepareQuickBooksReceivableRequest(value);
    const p = provider();
    const result = await p.receivableTransfers.execute(request);
    expect(net.posts).toHaveLength(1);
    expect(result).toMatchObject({
      amountMinor: 1000,
      providerProcessedCashMinor: 0,
      bankSettlementVerified: false,
      nonCashAppliedMinor: kind === 'application' ? 1000 : 0,
      recordedCashChangeMinor:
        kind === 'cash-refund'
          ? -1000
          : kind === 'reverse-cash-refund'
            ? 1000
            : 0,
    });
    const type = kind === 'application' ? 'Payment' : 'JournalEntry';
    net.rows.set(`${type.toLowerCase()}/remote-1`, { [type]: record(value) });
    expect(await p.receivableTransfers.read(request, 'remote-1')).toEqual(
      result,
    );
    expect(net.posts).toHaveLength(1);
    expect(
      net.fetcher.mock.calls.every(
        ([url]) => !url.includes('/account/retained'),
      ),
    ).toBe(true);
  });
  it.each([
    'withhold',
    'release',
  ] as const)('rejects ordinary %s before provider IO', (kind) => {
    const net = network();
    expect(() =>
      prepareQuickBooksReceivableRequest({ ...ordinary('cash-refund'), kind }),
    ).toThrow();
    expect(net.fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { kind: 'unknown' },
    { retainedAssetAccountRef: 'retained' },
    { releaseDueDates: 'host-managed' },
    { cashAccountRef: 'ar' },
    { accountingBasis: 'cash' },
    { taxTiming: 'receipt' },
    { currency: 'ZZZ' },
    { receivablesAccountRef: undefined },
    { cashAccountRef: undefined },
  ])('rejects ambiguous or malformed ordinary mapping %j', (patch) => {
    const value = ordinary();
    expect(() =>
      prepareQuickBooksReceivableRequest({
        ...value,
        mapping: { ...value.mapping, ...patch } as any,
      }),
    ).toThrow();
  });
  it('requires a real cash account for refund recording', () => {
    const value = ordinary('cash-refund');
    value.mapping.cashAccountRef = null;
    expect(() => prepareQuickBooksReceivableRequest(value)).toThrow();
  });
  it.each([
    'realm',
    'source',
    'currency',
    'inactive',
    'capacity',
  ] as const)('rejects ordinary %s without a write', async (reason) => {
    const net = network(),
      value = ordinary();
    if (reason === 'realm') value.mapping.realmId = 'other';
    if (reason === 'currency') value.mapping.currency = 'USD';
    if (reason === 'source') value.source.customerRef = 'other';
    if (reason === 'inactive')
      net.rows.set('account/ar', {
        Account: {
          Id: 'ar',
          Active: false,
          AccountType: 'Accounts Receivable',
        },
      });
    if (reason === 'capacity') value.amountMinor = 1001;
    await expect(async () =>
      provider().receivableTransfers.execute(
        prepareQuickBooksReceivableRequest(value),
      ),
    ).rejects.toThrow();
    expect(net.posts).toHaveLength(0);
  });
  it('binds ordinary request provenance and rejects a mutated prepared mapping', () => {
    const request = prepareQuickBooksReceivableRequest(ordinary());
    request.input.mapping.receivablesAccountRef = 'other';
    expect(() =>
      validateQuickBooksReceivableRequest(request, 'realm-a', 'sandbox'),
    ).toThrow(/changed/);
  });
});

describe('reviewed receivable transfer contracts', () => {
  it.each([
    ['withhold', 'Credit', 'retained', 0],
    ['release', 'Debit', 'retained', 0],
    ['cash-refund', 'Debit', 'bank', -1000],
    ['reverse-cash-refund', 'Credit', 'bank', 1000],
  ] as const)('balances %s without sales, tax or claimed bank settlement', (kind, arDirection, other, cash) => {
    const value = input(kind),
      body = mapQuickBooksReceivableRequest(value) as any;
    expect(body.Line.map((l: any) => l.Amount)).toEqual([10, 10]);
    expect(body.Line[0].JournalEntryLineDetail).toMatchObject({
      PostingType: arDirection,
      AccountRef: { value: 'ar' },
    });
    expect(body.Line[1].JournalEntryLineDetail.AccountRef.value).toBe(other);
    for (const line of body.Line) {
      expect(line.Description).toContain(
        'Invoice:invoice-1; customer:customer-1; evidence:frozen-invoice-1',
      );
      expect(line.JournalEntryLineDetail.Entity).toEqual({
        Type: 'Customer',
        EntityRef: { value: 'customer-1' },
      });
      expect(line.JournalEntryLineDetail.TaxCodeRef).toBeUndefined();
    }
    expect(
      reconcileQuickBooksReceivableRecord(
        prepareQuickBooksReceivableRequest(value),
        record(value),
      ),
    ).toMatchObject({
      amountMinor: 1000,
      recordedCashChangeMinor: cash,
      providerProcessedCashMinor: 0,
      bankSettlementVerified: false,
      nonCashAppliedMinor: 0,
    });
  });
  it('maps exact noncash application references and never counts them as cash', () => {
    const value = application(),
      body = mapQuickBooksReceivableRequest(value);
    expect(body).toMatchObject({
      TotalAmt: 0,
      ProcessPayment: false,
      CustomerRef: { value: 'customer-1' },
      Line: [
        { Amount: 10, LinkedTxn: [{ TxnType: 'Invoice', TxnId: 'invoice-1' }] },
        {
          Amount: 10,
          LinkedTxn: [{ TxnType: 'JournalEntry', TxnId: 'journal-1' }],
        },
      ],
    });
    expect(
      reconcileQuickBooksReceivableRecord(
        prepareQuickBooksReceivableRequest(value),
        record(value),
      ),
    ).toMatchObject({ nonCashAppliedMinor: 1000, recordedCashChangeMinor: 0 });
  });
  it.each([
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects unsafe or nonpositive minor amount %s', (amountMinor) => {
    expect(() =>
      prepareQuickBooksReceivableRequest({ ...input(), amountMinor }),
    ).toThrow();
  });
  it('rejects unsupported policy, duplicate accounts, source customer and request mutation', () => {
    for (const patch of [
      { accountingBasis: 'cash' },
      { taxTiming: 'receipt' },
      { releaseDueDates: 'provider' },
      { retainedAssetAccountRef: 'ar' },
      { currency: 'ZZZ' },
    ])
      expect(() =>
        prepareQuickBooksReceivableRequest({
          ...input(),
          mapping: { ...mapping, ...patch } as any,
        }),
      ).toThrow();
    const value = input();
    value.source.customerRef = 'another';
    expect(() => prepareQuickBooksReceivableRequest(value)).toThrow(/customer/);
    expect(() =>
      prepareQuickBooksReceivableRequest({
        ...input(),
        requestId: 'a'.repeat(51),
      }),
    ).toThrow(/50/);
    const request = prepareQuickBooksReceivableRequest(input());
    request.input.amountMinor = 2000;
    expect(() =>
      validateQuickBooksReceivableRequest(request, 'realm-a', 'sandbox'),
    ).toThrow(/changed/);
  });
  it('rejects missing or changed remote financial/provenance facts', () => {
    const value = input(),
      request = prepareQuickBooksReceivableRequest(value);
    for (const patch of [
      { CurrencyRef: undefined },
      { PrivateNote: 'other' },
      { TxnDate: '2026-10-17' },
      { Line: [] },
      { SyncToken: undefined },
    ])
      expect(() =>
        reconcileQuickBooksReceivableRecord(request, {
          ...record(value),
          ...patch,
        }),
      ).toThrow();
    const raw = record(value) as any;
    raw.Line[1].JournalEntryLineDetail.Entity.EntityRef.value = 'other';
    expect(() => reconcileQuickBooksReceivableRecord(request, raw)).toThrow(
      /authority/,
    );
    const app = application();
    expect(() =>
      reconcileQuickBooksReceivableRecord(
        prepareQuickBooksReceivableRequest(app),
        { ...record(app), TotalAmt: 10 },
      ),
    ).toThrow(/zero cash/);
  });
});

describe('public QuickBooks transfer provider path', () => {
  it('checks reviewed metadata, posts the prepared request identity and reconciles exact readback', async () => {
    const { posts } = network(),
      p = provider();
    const result = await p.receivableTransfers.execute(
      prepareQuickBooksReceivableRequest(input()),
    );
    expect(posts).toHaveLength(1);
    expect(posts[0].url.searchParams.get('requestid')).toBe('request-1');
    expect(result.externalId).toBe('remote-1');
    expect(result.bankSettlementVerified).toBe(false);
  });
  it('supports documented zero-cash JournalEntry application with complete capacity evidence', async () => {
    const { posts } = network();
    const result = await provider().receivableTransfers.execute(
      prepareQuickBooksReceivableRequest(application()),
    );
    expect(posts[0].body.TotalAmt).toBe(0);
    expect(result.nonCashAppliedMinor).toBe(1000);
  });
  it.each([
    'foreign-currency',
    'inactive-account',
    'foreign-source',
    'realm',
  ])('rejects %s before any write', async (reason) => {
    const net = network(),
      value = input();
    if (reason === 'foreign-currency') value.mapping.currency = 'USD';
    if (reason === 'inactive-account')
      net.rows.set('account/ar', {
        Account: {
          Id: 'ar',
          Active: false,
          AccountType: 'Accounts Receivable',
        },
      });
    if (reason === 'foreign-source')
      net.rows.set('invoice/invoice-1', {
        Invoice: {
          Id: 'invoice-1',
          CustomerRef: { value: 'other' },
          CurrencyRef: { value: 'CAD' },
        },
      });
    if (reason === 'realm') value.mapping.realmId = 'other';
    await expect(
      provider().receivableTransfers.execute(
        prepareQuickBooksReceivableRequest(value),
      ),
    ).rejects.toThrow();
    expect(net.posts).toHaveLength(0);
  });
  it('rejects current allocation over-capacity before writing', async () => {
    const net = network();
    await expect(
      provider().receivableTransfers.execute(
        prepareQuickBooksReceivableRequest({
          ...application(),
          amountMinor: 1001,
        }),
      ),
    ).rejects.toThrow(/capacity/);
    expect(net.posts).toHaveLength(0);
  });
  it('reads a known external record without issuing another write', async () => {
    const value = input(),
      net = network();
    net.rows.set('journalentry/remote-1', { JournalEntry: record(value) });
    expect(
      await provider().receivableTransfers.read(
        prepareQuickBooksReceivableRequest(value),
        'remote-1',
      ),
    ).toMatchObject({ externalId: 'remote-1' });
    expect(net.posts).toHaveLength(0);
  });
});

describe('receivable failure and reconciliation boundaries', () => {
  it('preserves ordinary unknown outcome and reconciles without another POST', async () => {
    const value = ordinary('cash-refund'),
      request = prepareQuickBooksReceivableRequest(value),
      p = provider(),
      rows = fixtures();
    rows.delete('account/retained');
    rows.set('journalentry/remote-1', { JournalEntry: record(value) });
    const spy = vi
      .spyOn(p, 'request')
      .mockImplementation(async (method, endpoint) =>
        method === 'POST'
          ? ({
              JournalEntry: { ...record(value), SyncToken: undefined },
            } as any)
          : (rows.get(endpoint) as any),
      );
    await expect(p.receivableTransfers.execute(request)).rejects.toMatchObject({
      outcome: 'unknown',
      requestId: request.requestId,
      payloadHash: request.payloadHash,
      externalId: 'remote-1',
    });
    expect(await p.receivableTransfers.read(request, 'remote-1')).toMatchObject(
      {
        recordedCashChangeMinor: -1000,
        providerProcessedCashMinor: 0,
        bankSettlementVerified: false,
      },
    );
    expect(spy.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(
      1,
    );
  });
  it('does not truncate journal capacity at the first history page', async () => {
    const p = provider(),
      rows = fixtures(),
      writes: unknown[] = [];
    const spy = vi
      .spyOn(p, 'request')
      .mockImplementation(async (method, endpoint, body) => {
        if (method === 'POST') {
          writes.push(body);
          return {} as any;
        }
        if (endpoint.startsWith('query?')) {
          const query = new URLSearchParams(endpoint.slice(6)).get('query')!;
          const payment = {
            CustomerRef: { value: 'customer-1' },
            CurrencyRef: { value: 'CAD' },
            Line: [
              {
                Amount: 0.01,
                LinkedTxn: [{ TxnType: 'JournalEntry', TxnId: 'journal-1' }],
              },
            ],
          };
          return {
            QueryResponse: {
              Payment: query.includes('STARTPOSITION 1 ')
                ? Array.from({ length: 100 }, () => structuredClone(payment))
                : [
                    {
                      ...payment,
                      Line: [
                        {
                          Amount: 9,
                          LinkedTxn: [
                            { TxnType: 'JournalEntry', TxnId: 'journal-1' },
                          ],
                        },
                      ],
                    },
                  ],
            },
          } as any;
        }
        return rows.get(endpoint) as any;
      });
    await expect(
      p.receivableTransfers.execute(
        prepareQuickBooksReceivableRequest(application()),
      ),
    ).rejects.toThrow(/capacity/);
    expect(writes).toHaveLength(0);
    expect(
      spy.mock.calls.filter(([, endpoint]) => endpoint.startsWith('query?')),
    ).toHaveLength(2);
  });
  it('retains the prepared input across asynchronous account verification', async () => {
    const value = input(),
      request = prepareQuickBooksReceivableRequest(value),
      p = provider(),
      rows = fixtures();
    let posted: any;
    vi.spyOn(p, 'request').mockImplementation(
      async (method, endpoint, body) => {
        if (method === 'POST') {
          posted = body;
          return {
            JournalEntry: { ...(body as any), Id: 'remote-1', SyncToken: '0' },
          } as any;
        }
        if (endpoint === 'preferences') request.input.amountMinor = 9999;
        return rows.get(endpoint) as any;
      },
    );
    expect(await p.receivableTransfers.execute(request)).toMatchObject({
      amountMinor: 1000,
    });
    expect(posted.Line[0].Amount).toBe(10);
  });
  it.each([
    'missing-sync-token',
    'wrong-amount',
    'wrong-links',
  ])('retains uncertain write identity after %s provider success', async (fault) => {
    const p = provider(),
      rows = fixtures();
    const value = fault === 'wrong-links' ? application() : input();
    const request = prepareQuickBooksReceivableRequest(value);
    const malformed = record(value) as any;
    malformed.Id = 'remote-1';
    if (fault === 'missing-sync-token') delete malformed.SyncToken;
    if (fault === 'wrong-amount') malformed.Line[0].Amount = 999;
    if (fault === 'wrong-links')
      malformed.Line[0].LinkedTxn[0].TxnId = 'wrong-source';
    const requestSpy = vi
      .spyOn(p, 'request')
      .mockImplementation(async (method, endpoint) =>
        method === 'POST'
          ? ({
              [request.endpoint === 'payment' ? 'Payment' : 'JournalEntry']:
                malformed,
            } as any)
          : ((endpoint.startsWith('query?')
              ? { QueryResponse: { Payment: [] } }
              : rows.get(endpoint)) as any),
      );
    await expect(p.receivableTransfers.execute(request)).rejects.toMatchObject({
      name: 'QuickBooksWriteError',
      code: 'QBO_WRITE_ERROR',
      outcome: 'unknown',
      realmId: 'realm-a',
      environment: 'sandbox',
      endpoint: request.endpoint,
      requestId: request.requestId,
      payloadHash: request.payloadHash,
      externalId: 'remote-1',
      cause: expect.any(Error),
    });
    expect(
      requestSpy.mock.calls.filter(([method]) => method === 'POST'),
    ).toHaveLength(1);
  });
  it('classifies a lost write response as unknown, never a confirmed cash payment', async () => {
    const p = provider(),
      rows = fixtures();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options?: RequestInit) => {
        if (options?.method === 'POST') throw new Error('connection lost');
        return new Response(
          JSON.stringify(rows.get(new URL(url).pathname.split('/realm-a/')[1])),
        );
      }),
    );
    await expect(
      p.receivableTransfers.execute(
        prepareQuickBooksReceivableRequest(input('cash-refund')),
      ),
    ).rejects.toMatchObject({ outcome: 'unknown', requestId: 'request-1' });
  });
});
