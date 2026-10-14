import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CreditMemoInput,
  type InvoiceInput,
  prepareQuickBooksCreditMemoRequest,
  requireCreditMemoOperations,
} from '../../index.js';
import { StripeProvider } from '../stripe/index.js';
import { QuickBooksProvider } from './index.js';
import { mapCreditMemoToQBO, mapInvoiceToQBO } from './invoice-request.js';

function inclusiveInvoice(overrides: Partial<InvoiceInput> = {}): InvoiceInput {
  return {
    id: 'frozen-invoice-1',
    invoiceNumber: 'INV-1',
    customerId: 'customer-1',
    customerExternalId: 'customer-qbo',
    issueDate: new Date(2026, 9, 13),
    dueDate: new Date(2026, 10, 13),
    currency: 'CAD',
    subtotal: 100,
    taxAmount: 13,
    totalAmount: 113,
    quickbooksMapping: { globalTaxCalculation: 'TaxInclusive' },
    lineItems: [
      {
        description: 'Frozen HST service',
        quantity: 2,
        unitPrice: 56.5,
        amount: 100,
        taxAmount: 13,
        taxInclusiveAmount: 113,
        taxComponents: [{ taxCode: 'HST', rate: '0.13', taxAmount: 13 }],
        quickbooksMapping: { itemRef: 'item-1', taxCodeRef: 'tax-hst' },
      },
    ],
    ...overrides,
  };
}

function creditMemo(): CreditMemoInput {
  const invoice = inclusiveInvoice();
  return {
    id: 'credit-1',
    creditedInvoiceExternalId: 'qbo-invoice-1',
    creditMemoNumber: 'CM-1',
    customerId: invoice.customerId,
    customerExternalId: invoice.customerExternalId,
    issueDate: invoice.issueDate,
    currency: invoice.currency,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    quickbooksMapping: invoice.quickbooksMapping,
    lineItems: invoice.lineItems,
  };
}

function quickBooksProvider(): QuickBooksProvider {
  const provider = new QuickBooksProvider({
    type: 'quickbooks',
    clientId: 'client',
    clientSecret: 'secret',
    realmId: 'realm-1',
    refreshToken: 'refresh',
    environment: 'sandbox',
    maxRetries: 1,
  });
  vi.spyOn(provider, 'ensureAccessToken').mockResolvedValue('token');
  return provider;
}

describe('QuickBooks frozen money snapshots', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['CAD', 100, 13, 113],
    ['JPY', 1000, 100, 1100],
    ['KWD', 10.125, 0.506, 10.631],
  ] as const)('maps tax-inclusive %s snapshots as net Amount and gross TaxInclusiveAmt', (currency, net, tax, gross) => {
    const invoice = inclusiveInvoice({
      currency,
      subtotal: net,
      taxAmount: tax,
      totalAmount: gross,
      lineItems: [
        {
          ...inclusiveInvoice().lineItems[0],
          quantity: 1,
          unitPrice: gross,
          amount: net,
          taxAmount: tax,
          taxInclusiveAmount: gross,
          taxComponents: [{ taxCode: 'GST', rate: '0.13', taxAmount: tax }],
        },
      ],
    });
    const mapped = mapInvoiceToQBO(invoice);
    expect(mapped).toMatchObject({
      GlobalTaxCalculation: 'TaxInclusive',
      TxnTaxDetail: { TotalTax: tax },
      Line: [
        {
          Amount: net,
          SalesItemLineDetail: { TaxInclusiveAmt: gross },
        },
      ],
    });
  });

  it('maps a 10% GST/PST-inclusive discount as the reduced net unit price exactly once', () => {
    const invoice = inclusiveInvoice({
      subtotal: 90,
      taxAmount: 11.7,
      totalAmount: 101.7,
      lineItems: [
        {
          ...inclusiveInvoice().lineItems[0],
          quantity: 1,
          unitPrice: 113,
          discount: 11.3,
          amount: 90,
          taxAmount: 11.7,
          taxInclusiveAmount: 101.7,
          taxComponents: [
            { taxCode: 'GST', rate: '0.05', taxAmount: 4.5 },
            { taxCode: 'PST', rate: '0.08', taxAmount: 7.2 },
          ],
        },
      ],
    });
    const mapped = mapInvoiceToQBO(invoice);
    expect(mapped.Line).toEqual([
      expect.objectContaining({
        Amount: 90,
        SalesItemLineDetail: expect.objectContaining({
          UnitPrice: 90,
          TaxInclusiveAmt: 101.7,
        }),
      }),
    ]);
  });

  it('keeps the document-scoped allocated cent in the stored line snapshots', () => {
    const line = (
      net: number,
      tax: number,
      gross: number,
    ): InvoiceInput['lineItems'][number] => ({
      description: 'Document-scope allocation',
      quantity: 1,
      unitPrice: gross,
      amount: net,
      taxAmount: tax,
      taxInclusiveAmount: gross,
      taxComponents: [{ taxCode: 'GST', rate: '0.13', taxAmount: tax }],
      quickbooksMapping: { itemRef: 'item-1', taxCodeRef: 'tax-gst' },
    });
    const mapped = mapInvoiceToQBO(
      inclusiveInvoice({
        subtotal: 264.92,
        taxAmount: 34.44,
        totalAmount: 299.36,
        lineItems: [
          line(100, 13, 113),
          line(82.46, 10.72, 93.18),
          line(82.46, 10.72, 93.18),
        ],
      }),
    );
    expect(mapped.Line[2]).toMatchObject({
      Amount: 82.46,
      SalesItemLineDetail: { TaxInclusiveAmt: 93.18 },
    });
    expect(mapped.TxnTaxDetail).toEqual({ TotalTax: 34.44 });
  });

  it('maps a flat $5 GST/PST-inclusive discount to a negative QBO line when it cannot reduce the unit price on the currency grid', () => {
    const invoice = inclusiveInvoice({
      subtotal: 93.8,
      taxAmount: 12.2,
      totalAmount: 106,
      lineItems: [
        {
          ...inclusiveInvoice().lineItems[0],
          quantity: 3,
          unitPrice: 37,
          discount: 5,
          amount: 93.8,
          taxAmount: 12.2,
          taxInclusiveAmount: 106,
          taxComponents: [
            { taxCode: 'GST', rate: '0.05', taxAmount: 4.69 },
            { taxCode: 'PST', rate: '0.08', taxAmount: 7.51 },
          ],
        },
      ],
    });
    const mapped = mapInvoiceToQBO(invoice);
    expect(mapped.Line).toEqual([
      expect.objectContaining({
        Amount: 98.22,
        SalesItemLineDetail: expect.objectContaining({
          TaxCodeRef: { value: 'tax-hst' },
          TaxInclusiveAmt: 111,
        }),
      }),
      expect.objectContaining({
        Description: 'Discount on line 1',
        Amount: -4.42,
        SalesItemLineDetail: expect.objectContaining({
          TaxCodeRef: { value: 'tax-hst' },
          TaxInclusiveAmt: -5,
        }),
      }),
    ]);
  });

  it('refuses an inclusive negative-line discount without frozen component rates', () => {
    const invoice = inclusiveInvoice({
      subtotal: 93.8,
      taxAmount: 12.2,
      totalAmount: 106,
      lineItems: [
        {
          ...inclusiveInvoice().lineItems[0],
          quantity: 3,
          unitPrice: 37,
          discount: 5,
          amount: 93.8,
          taxAmount: 12.2,
          taxInclusiveAmount: 106,
          taxComponents: [{ taxCode: 'GST', taxAmount: 12.2 }],
        },
      ],
    });
    expect(() => mapInvoiceToQBO(invoice)).toThrow(/component rate/);
  });

  it.each([
    [
      'gross/net mismatch',
      (invoice: InvoiceInput) =>
        (invoice.lineItems[0].taxInclusiveAmount = 112),
    ],
    [
      'component mismatch',
      (invoice: InvoiceInput) =>
        (invoice.lineItems[0].taxComponents = [
          { taxCode: 'HST', rate: '0.13', taxAmount: 12 },
        ]),
    ],
    [
      'missing gross snapshot',
      (invoice: InvoiceInput) => delete invoice.lineItems[0].taxInclusiveAmount,
    ],
  ])('refuses malformed inclusive %s before I/O', (_label, change) => {
    const invoice = inclusiveInvoice();
    change(invoice);
    expect(() => mapInvoiceToQBO(invoice)).toThrow(/QuickBooks/);
  });

  it('binds a positive credit memo payload to one request identity and retries identical bytes', async () => {
    const memo = creditMemo();
    memo.quickbooksCreditMemoRequest = prepareQuickBooksCreditMemoRequest(
      memo,
      {
        requestId: 'credit-1-freeze-v1',
        realmId: 'realm-1',
        environment: 'sandbox',
      },
    );
    const requests: Array<{ url: string; body: string }> = [];
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce((url: string, options: RequestInit) => {
          requests.push({ url, body: options.body as string });
          throw new Error('response lost after remote acceptance');
        })
        .mockImplementationOnce((url: string, options: RequestInit) => {
          requests.push({ url, body: options.body as string });
          return new Response(
            JSON.stringify({ CreditMemo: { Id: 'qbo-credit-1' } }),
          );
        }),
    );
    const promise = quickBooksProvider().creditMemos.push(memo);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toMatchObject({
      externalId: 'qbo-credit-1',
    });
    expect(requests).toHaveLength(2);
    expect(new Set(requests.map((request) => request.url)).size).toBe(1);
    expect(new Set(requests.map((request) => request.body)).size).toBe(1);
    expect(new URL(requests[0].url).pathname).toContain('/creditmemo');
    expect(new URL(requests[0].url).searchParams.get('requestid')).toBe(
      'credit-1-freeze-v1',
    );
    expect(mapCreditMemoToQBO(memo)).toMatchObject({
      GlobalTaxCalculation: 'TaxInclusive',
      TxnTaxDetail: { TotalTax: 13 },
    });
  });

  it('keeps credit memos optional and refuses unsupported providers explicitly', () => {
    const stripe = new StripeProvider({ type: 'stripe', secretKey: 'sk_test' });
    expect(stripe.creditMemos).toBeUndefined();
    expect(() => requireCreditMemoOperations(stripe)).toThrow(
      "Accounting provider 'stripe' does not support credit memos",
    );
  });
});
