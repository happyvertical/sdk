import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickBooksProvider } from './index.js';

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

type Doc = Record<string, unknown>;

/** Serve fixture documents by `entity/id`; anything else is a 400. */
function serve(docs: Record<string, Doc>, homeCurrency = 'CAD') {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      urls.push(url);
      expect(init.method).toBe('GET');
      if (url.includes('/preferences'))
        return new Response(
          JSON.stringify({
            Preferences: {
              CurrencyPrefs: { HomeCurrency: { value: homeCurrency } },
            },
          }),
        );
      const key = new URL(url).pathname.split('/').slice(-2).join('/');
      const doc = docs[key];
      if (!doc) return new Response('{"Fault":{}}', { status: 400 });
      const entity = key.startsWith('invoice') ? 'Invoice' : 'Payment';
      return new Response(JSON.stringify({ [entity]: doc }));
    }),
  );
  return urls;
}

function invoice(over: Doc = {}): Doc {
  return {
    Id: 'inv-1',
    SyncToken: '3',
    CustomerRef: { value: 'cust-1' },
    TxnDate: '2026-11-01',
    DueDate: '2026-12-01',
    TotalAmt: 105,
    Balance: 105,
    TxnTaxDetail: { TotalTax: 5 },
    Line: [
      { Amount: 100, DetailType: 'SalesItemLineDetail' },
      { Amount: 100, DetailType: 'SubTotalLineDetail' },
    ],
    CurrencyRef: { value: 'CAD' },
    ...over,
  };
}
const link = (TxnId: string, TxnType = 'Payment') => ({ TxnId, TxnType });
const invoiceLine = (Amount: number, id = 'inv-1') => ({
  Amount,
  LinkedTxn: [{ TxnId: id, TxnType: 'Invoice' }],
});

afterEach(() => vi.unstubAllGlobals());

describe('QuickBooks invoice readback', () => {
  it('reads an unpaid invoice', async () => {
    serve({ 'invoice/inv-1': invoice() });
    await expect(provider().invoices.readback('inv-1')).resolves.toEqual({
      realmId: 'realm-a',
      environment: 'sandbox',
      externalId: 'inv-1',
      customerExternalId: 'cust-1',
      currency: 'CAD',
      subtotalMinor: 10000,
      discountMinor: 0,
      taxMinor: 500,
      totalMinor: 10500,
      dueDate: '2026-12-01',
      balanceMinor: 10500,
      voided: false,
      complete: true,
      transactions: [],
    });
  });

  it('reads a partial payment and a full settlement', async () => {
    serve({
      'invoice/inv-1': invoice({
        Balance: 0,
        LinkedTxn: [link('p1'), link('p2'), link('inv-ignored', 'Estimate')],
      }),
      'payment/p1': { Id: 'p1', TotalAmt: 40.25, Line: [invoiceLine(40.25)] },
      'payment/p2': { Id: 'p2', TotalAmt: 64.75, Line: [invoiceLine(64.75)] },
    });
    const result = await provider().invoices.readback('inv-1');
    expect(result.balanceMinor).toBe(0);
    expect(result.transactions).toEqual([
      { id: 'p1', kind: 'payment', amountMinor: 4025 },
      { id: 'p2', kind: 'payment', amountMinor: 6475 },
    ]);
  });

  it('counts only this invoice share of a multi-invoice payment, once', async () => {
    const urls = serve({
      'invoice/inv-1': invoice({
        Balance: 5,
        LinkedTxn: [link('p1'), link('p1')],
      }),
      'payment/p1': {
        Id: 'p1',
        TotalAmt: 150,
        Line: [invoiceLine(100), invoiceLine(50, 'inv-2')],
      },
    });
    const result = await provider().invoices.readback('inv-1');
    expect(result.transactions).toEqual([
      { id: 'p1', kind: 'payment', amountMinor: 10000 },
    ]);
    expect(urls.filter((u) => u.includes('/payment/p1'))).toHaveLength(1);
  });

  it('reports a credit memo application as a credit and ignores the bare link', async () => {
    serve({
      'invoice/inv-1': invoice({
        Balance: 55,
        LinkedTxn: [link('cm-1', 'CreditMemo'), link('p9')],
      }),
      'payment/p9': {
        Id: 'p9',
        TotalAmt: 0,
        Line: [
          invoiceLine(50),
          { Amount: 50, LinkedTxn: [{ TxnId: 'cm-1', TxnType: 'CreditMemo' }] },
        ],
      },
    });
    const result = await provider().invoices.readback('inv-1');
    expect(result.transactions).toEqual([
      { id: 'p9', kind: 'credit', amountMinor: 5000 },
    ]);
  });

  it('refuses a payment mixing cash and credit', async () => {
    serve({
      'invoice/inv-1': invoice({ Balance: 0, LinkedTxn: [link('p9')] }),
      'payment/p9': {
        Id: 'p9',
        TotalAmt: 20,
        Line: [
          invoiceLine(105),
          { Amount: 85, LinkedTxn: [{ TxnId: 'cm-1', TxnType: 'CreditMemo' }] },
        ],
      },
    });
    await expect(provider().invoices.readback('inv-1')).rejects.toThrow(
      'mixes cash and credit',
    );
  });

  const je = {
    Amount: 105,
    LinkedTxn: [{ TxnId: 'je-1', TxnType: 'JournalEntry' }],
  };

  it('refuses a payment line linking a journal entry', async () => {
    serve({
      'invoice/inv-1': invoice({ Balance: 0, LinkedTxn: [link('p9')] }),
      'payment/p9': { Id: 'p9', TotalAmt: 0, Line: [invoiceLine(105), je] },
    });
    await expect(provider().invoices.readback('inv-1')).rejects.toThrow(
      'unsupported transaction',
    );
  });

  it('refuses cash mixed with a journal-entry credit', async () => {
    serve({
      'invoice/inv-1': invoice({ Balance: 0, LinkedTxn: [link('p9')] }),
      'payment/p9': { Id: 'p9', TotalAmt: 20, Line: [invoiceLine(105), je] },
    });
    await expect(provider().invoices.readback('inv-1')).rejects.toThrow(
      'unsupported transaction',
    );
  });

  it('refuses a zero-total payment with only invoice lines (unverifiable noncash)', async () => {
    serve({
      'invoice/inv-1': invoice({ Balance: 55, LinkedTxn: [link('p9')] }),
      'payment/p9': { Id: 'p9', TotalAmt: 0, Line: [invoiceLine(50)] },
    });
    await expect(provider().invoices.readback('inv-1')).rejects.toThrow(
      'funding cannot be verified',
    );
  });

  it('refuses credit lines that do not fund the invoice applications', async () => {
    serve({
      'invoice/inv-1': invoice({ Balance: 55, LinkedTxn: [link('p9')] }),
      'payment/p9': {
        Id: 'p9',
        TotalAmt: 0,
        Line: [
          invoiceLine(50),
          { Amount: 30, LinkedTxn: [{ TxnId: 'cm-1', TxnType: 'CreditMemo' }] },
        ],
      },
    });
    await expect(provider().invoices.readback('inv-1')).rejects.toThrow(
      'credit lines disagree',
    );
  });

  it.each([
    ['invoice', 'invoice/inv-1'],
    ['payment', 'payment/p1'],
  ])('sanitizes transport failures reading the %s', async (_name, _key) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/payment/p1') || url.includes('/invoice/')
          ? url.includes('/invoice/') && _name === 'payment'
            ? new Response(
                JSON.stringify({
                  Invoice: invoice({ LinkedTxn: [link('p1')] }),
                }),
              )
            : new Response('Bearer sk-leak customer-secret', { status: 401 })
          : new Response('{}'),
      ),
    );
    const error = (await provider()
      .invoices.readback('inv-1')
      .catch((e: Error) => e)) as Error;
    expect(error.message).toContain('provider read failed (HTTP 401)');
    expect(error.message).not.toMatch(/sk-leak|customer-secret|Bearer/);
  });

  it('refuses a balance reduced by an unlinked deposit', async () => {
    serve({
      'invoice/inv-1': invoice({
        TotalAmt: 100,
        Balance: 60,
        Deposit: 40,
        TxnTaxDetail: {},
      }),
    });
    await expect(provider().invoices.readback('inv-1')).rejects.toThrow(
      'balance disagrees',
    );
  });

  it('skips a voided payment that applies nothing', async () => {
    serve({
      'invoice/inv-1': invoice({ LinkedTxn: [link('p1')] }),
      'payment/p1': { Id: 'p1', TotalAmt: 0, Line: [invoiceLine(0)] },
    });
    expect((await provider().invoices.readback('inv-1')).transactions).toEqual(
      [],
    );
  });

  it('reports a voided invoice', async () => {
    serve({
      'invoice/inv-1': invoice({
        TotalAmt: 0,
        Balance: 0,
        PrivateNote: 'Voided',
        TxnTaxDetail: {},
        Line: [{ Amount: 0, DetailType: 'SalesItemLineDetail' }],
      }),
    });
    const result = await provider().invoices.readback('inv-1');
    expect(result).toMatchObject({
      voided: true,
      totalMinor: 0,
      balanceMinor: 0,
    });
  });

  it('does not treat a nonzero invoice with a Voided-looking note as voided', async () => {
    serve({ 'invoice/inv-1': invoice({ PrivateNote: 'Voided by mistake' }) });
    expect((await provider().invoices.readback('inv-1')).voided).toBe(false);
  });

  it('throws for a deleted or missing invoice', async () => {
    serve({ 'invoice/inv-1': invoice({ status: 'Deleted' }) });
    await expect(provider().invoices.readback('inv-1')).rejects.toThrow(
      'deleted',
    );
    await expect(provider().invoices.readback('inv-404')).rejects.toThrow();
  });

  it('defaults to the home currency and uses its minor unit', async () => {
    const doc = invoice({
      TotalAmt: 1050,
      Balance: 1050,
      TxnTaxDetail: { TotalTax: 50 },
      Line: [{ Amount: 1000, DetailType: 'SalesItemLineDetail' }],
    });
    delete doc.CurrencyRef;
    serve({ 'invoice/inv-1': doc }, 'JPY');
    const result = await provider().invoices.readback('inv-1');
    expect(result).toMatchObject({
      currency: 'JPY',
      totalMinor: 1050,
      subtotalMinor: 1000,
      taxMinor: 50,
    });
  });

  it('sums discount lines', async () => {
    serve({
      'invoice/inv-1': invoice({
        Line: [
          { Amount: 120, DetailType: 'SalesItemLineDetail' },
          { Amount: 20, DetailType: 'DiscountLineDetail' },
          { Amount: 120, DetailType: 'SubTotalLineDetail' },
        ],
      }),
    });
    expect(await provider().invoices.readback('inv-1')).toMatchObject({
      subtotalMinor: 12000,
      discountMinor: 2000,
    });
  });

  it('refuses amounts off the currency grid, missing balance and unknown links', async () => {
    serve({ 'invoice/inv-1': invoice({ Balance: 10.505 }) });
    await expect(provider().invoices.readback('inv-1')).rejects.toThrow(
      'balance',
    );
    serve({ 'invoice/inv-1': invoice({ Balance: undefined }) });
    await expect(provider().invoices.readback('inv-1')).rejects.toThrow(
      'balance',
    );
    serve({ 'invoice/inv-1': invoice({ LinkedTxn: [link('x', 'Mystery')] }) });
    await expect(provider().invoices.readback('inv-1')).rejects.toThrow(
      'unrecognized',
    );
  });

  it('fails when a linked payment cannot be read, never returning a partial result', async () => {
    serve({ 'invoice/inv-1': invoice({ LinkedTxn: [link('gone')] }) });
    await expect(provider().invoices.readback('inv-1')).rejects.toThrow();
  });

  it('keeps provider payloads out of errors', async () => {
    serve({
      'invoice/inv-1': invoice({ Balance: 1.234, PrivateNote: 'secret-note' }),
    });
    const error = await provider()
      .invoices.readback('inv-1')
      .catch((e: Error) => e);
    expect((error as Error).message).not.toContain('secret-note');
  });
});
