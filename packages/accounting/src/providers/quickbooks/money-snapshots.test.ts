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
        taxComponents: [
          {
            taxCode: 'HST',
            rate: '0.13',
            quickbooksTaxRateRef: 'rate-hst',
            taxAmount: 13,
          },
        ],
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
    ['CAD', 100, 13, 113, '0.13'],
    ['JPY', 1000, 100, 1100, '0.1'],
    ['KWD', 10.125, 0.506, 10.631, '0.05'],
  ] as const)('maps tax-inclusive %s snapshots as net Amount and gross TaxInclusiveAmt', (currency, net, tax, gross, rate) => {
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
          taxComponents: [
            {
              taxCode: 'GST',
              rate,
              quickbooksTaxRateRef: 'rate-gst',
              taxAmount: tax,
            },
          ],
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

  it('maps explicit zero-tax inclusive exempt snapshots for invoices and credit memos', () => {
    const invoice = inclusiveInvoice({
      subtotal: 100,
      taxAmount: 0,
      totalAmount: 100,
      lineItems: [
        {
          description: 'Inclusive exempt service',
          quantity: 1,
          unitPrice: 100,
          amount: 100,
          taxAmount: 0,
          taxInclusiveAmount: 100,
          taxComponents: [],
          quickbooksMapping: {
            itemRef: 'item-exempt',
            taxCodeRef: 'tax-exempt',
          },
        },
      ],
    });
    expect(mapInvoiceToQBO(invoice)).toMatchObject({
      GlobalTaxCalculation: 'TaxInclusive',
      TxnTaxDetail: { TotalTax: 0 },
      Line: [
        {
          Amount: 100,
          SalesItemLineDetail: {
            TaxCodeRef: { value: 'tax-exempt' },
            TaxInclusiveAmt: 100,
          },
        },
      ],
    });
    expect(
      mapCreditMemoToQBO({
        ...creditMemo(),
        ...invoice,
        creditMemoNumber: 'CM-exempt',
        creditedInvoiceExternalId: 'qbo-invoice-1',
      }),
    ).toMatchObject({
      GlobalTaxCalculation: 'TaxInclusive',
      TxnTaxDetail: { TotalTax: 0 },
    });
  });

  it.each([
    ['invoice', (input: InvoiceInput) => mapInvoiceToQBO(input)],
    [
      'credit memo',
      (input: InvoiceInput) =>
        mapCreditMemoToQBO({
          ...creditMemo(),
          ...input,
          creditMemoNumber: 'CM-exempt-omitted-components',
          creditedInvoiceExternalId: 'qbo-invoice-1',
        }),
    ],
  ] as const)('maps an omitted component list for a %s exempt fractional-unit discount', (_kind, map) => {
    const baseLine = inclusiveInvoice().lineItems[0];
    const { taxComponents: _taxComponents, ...lineWithoutComponents } =
      baseLine;
    const invoice = inclusiveInvoice({
      subtotal: 29,
      taxAmount: 0,
      totalAmount: 29,
      lineItems: [
        {
          ...lineWithoutComponents,
          description: 'Inclusive exempt discounted service without components',
          quantity: 3,
          unitPrice: 10,
          discount: 1,
          amount: 29,
          taxAmount: 0,
          taxInclusiveAmount: 29,
          quickbooksMapping: {
            itemRef: 'item-exempt',
            taxCodeRef: 'tax-exempt',
          },
        },
      ],
    });
    expect(map(invoice)).toMatchObject({
      GlobalTaxCalculation: 'TaxInclusive',
      TxnTaxDetail: { TotalTax: 0 },
      Line: [
        {
          Amount: 30,
          SalesItemLineDetail: { TaxInclusiveAmt: 30 },
        },
        {
          Description: 'Discount on line 1',
          Amount: -1,
          SalesItemLineDetail: { TaxInclusiveAmt: -1 },
        },
      ],
    });
  });

  it.each([
    ['invoice', (input: InvoiceInput) => mapInvoiceToQBO(input)],
    [
      'credit memo',
      (input: InvoiceInput) =>
        mapCreditMemoToQBO({
          ...creditMemo(),
          ...input,
          creditMemoNumber: 'CM-exempt-discount',
          creditedInvoiceExternalId: 'qbo-invoice-1',
        }),
    ],
  ] as const)('maps a component-free inclusive exempt fractional-unit discount for a %s', (_kind, map) => {
    const invoice = inclusiveInvoice({
      subtotal: 29,
      taxAmount: 0,
      totalAmount: 29,
      lineItems: [
        {
          description: 'Inclusive exempt discounted service',
          quantity: 3,
          unitPrice: 10,
          discount: 1,
          amount: 29,
          taxAmount: 0,
          taxInclusiveAmount: 29,
          taxComponents: [],
          quickbooksMapping: {
            itemRef: 'item-exempt',
            taxCodeRef: 'tax-exempt',
          },
        },
      ],
    });
    expect(map(invoice)).toMatchObject({
      GlobalTaxCalculation: 'TaxInclusive',
      TxnTaxDetail: { TotalTax: 0 },
      Line: [
        {
          Amount: 30,
          SalesItemLineDetail: { TaxInclusiveAmt: 30 },
        },
        {
          Amount: -1,
          SalesItemLineDetail: { TaxInclusiveAmt: -1 },
        },
      ],
    });
  });

  it('still rejects positive inclusive tax without frozen component detail for invoices and credit memos', () => {
    const invoice = inclusiveInvoice({
      lineItems: [
        {
          ...inclusiveInvoice().lineItems[0],
          taxComponents: [],
        },
      ],
    });
    expect(() => mapInvoiceToQBO(invoice)).toThrow(
      'tax components must equal the line tax amount',
    );
    expect(() =>
      mapCreditMemoToQBO({
        ...creditMemo(),
        ...invoice,
        creditMemoNumber: 'CM-missing-component',
        creditedInvoiceExternalId: 'qbo-invoice-1',
      }),
    ).toThrow('tax components must equal the line tax amount');
  });

  it.each([
    ['invoice', (input: InvoiceInput) => mapInvoiceToQBO(input)],
    [
      'credit memo',
      (input: InvoiceInput) =>
        mapCreditMemoToQBO({
          ...creditMemo(),
          ...input,
          creditMemoNumber: 'CM-partial-tax',
          creditedInvoiceExternalId: 'qbo-invoice-1',
        }),
    ],
  ] as const)('rejects partial stored line tax for a frozen %s before mapping', (_kind, map) => {
    const input = inclusiveInvoice({
      quickbooksMapping: { globalTaxCalculation: 'TaxExcluded' },
      subtotal: 20,
      taxAmount: 2,
      totalAmount: 22,
      lineItems: [
        {
          description: 'Stored tax',
          quantity: 1,
          unitPrice: 10,
          amount: 10,
          taxAmount: 1,
          quickbooksMapping: { itemRef: 'item-1', taxCodeRef: 'tax-gst' },
        },
        {
          description: 'Missing stored tax',
          quantity: 1,
          unitPrice: 10,
          amount: 10,
          quickbooksMapping: { itemRef: 'item-2', taxCodeRef: 'tax-gst' },
        },
      ],
    });
    expect(() => map(input)).toThrow(
      'QuickBooks stored line tax must be supplied on every line when any line supplies it',
    );
  });

  it.each([
    ['invoice', (input: InvoiceInput) => mapInvoiceToQBO(input)],
    [
      'credit memo',
      (input: InvoiceInput) =>
        mapCreditMemoToQBO({
          ...creditMemo(),
          ...input,
          creditMemoNumber: 'CM-wrong-mode',
          creditedInvoiceExternalId: 'qbo-invoice-1',
        }),
    ],
  ] as const)('rejects a tax-inclusive amount outside TaxInclusive mode for a frozen %s', (_kind, map) => {
    const input = inclusiveInvoice({
      quickbooksMapping: { globalTaxCalculation: 'TaxExcluded' },
      subtotal: 10,
      taxAmount: 0,
      totalAmount: 10,
      lineItems: [
        {
          description: 'Wrong-mode gross snapshot',
          quantity: 1,
          unitPrice: 10,
          amount: 10,
          taxAmount: 0,
          taxInclusiveAmount: 10,
          quickbooksMapping: { itemRef: 'item-1', taxCodeRef: 'tax-none' },
        },
      ],
    });
    expect(() => map(input)).toThrow(
      'QuickBooks line 1 tax-inclusive amount requires TaxInclusive global tax calculation',
    );
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
            {
              taxCode: 'GST',
              rate: '0.05',
              quickbooksTaxRateRef: 'rate-gst',
              taxAmount: 4.5,
            },
            {
              taxCode: 'PST',
              rate: '0.08',
              quickbooksTaxRateRef: 'rate-pst',
              taxAmount: 7.2,
            },
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
      taxComponents: [
        {
          taxCode: 'GST',
          rate: '0.13',
          quickbooksTaxRateRef: 'rate-gst',
          taxAmount: tax,
        },
      ],
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
    expect(mapped.TxnTaxDetail).toEqual({
      TotalTax: 34.44,
      TaxLine: [
        {
          Amount: 34.44,
          DetailType: 'TaxLineDetail',
          TaxLineDetail: {
            TaxRateRef: { value: 'rate-gst' },
            TaxPercent: 13,
            PercentBased: true,
          },
        },
      ],
    });
  });

  it('maps the BC GST/PST 5%/7% frozen component amounts without recomputing them', () => {
    const mapped = mapInvoiceToQBO(
      inclusiveInvoice({
        subtotal: 100,
        taxAmount: 12,
        totalAmount: 112,
        lineItems: [
          {
            ...inclusiveInvoice().lineItems[0],
            quantity: 1,
            unitPrice: 112,
            amount: 100,
            taxAmount: 12,
            taxInclusiveAmount: 112,
            taxComponents: [
              {
                taxCode: 'GST',
                rate: '0.05',
                quickbooksTaxRateRef: 'rate-gst',
                taxAmount: 5,
              },
              {
                taxCode: 'PST',
                rate: '0.07',
                quickbooksTaxRateRef: 'rate-pst',
                taxAmount: 7,
              },
            ],
          },
        ],
      }),
    );
    expect(mapped.TxnTaxDetail?.TaxLine).toEqual([
      expect.objectContaining({
        Amount: 5,
        TaxLineDetail: expect.objectContaining({ TaxPercent: 5 }),
      }),
      expect.objectContaining({
        Amount: 7,
        TaxLineDetail: expect.objectContaining({ TaxPercent: 7 }),
      }),
    ]);
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
            {
              taxCode: 'GST',
              rate: '0.05',
              quickbooksTaxRateRef: 'rate-gst',
              taxAmount: 4.69,
            },
            {
              taxCode: 'PST',
              rate: '0.08',
              quickbooksTaxRateRef: 'rate-pst',
              taxAmount: 7.51,
            },
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
    expect(mapped.TxnTaxDetail).toMatchObject({
      TotalTax: 12.2,
      TaxLine: [
        {
          Amount: 4.69,
          TaxLineDetail: {
            TaxRateRef: { value: 'rate-gst' },
            TaxPercent: 5,
            PercentBased: true,
          },
        },
        {
          Amount: 7.51,
          TaxLineDetail: {
            TaxRateRef: { value: 'rate-pst' },
            TaxPercent: 8,
            PercentBased: true,
          },
        },
      ],
    });
  });

  it('maps an exclusive fractional-quantity discount from its stored net snapshot', () => {
    const invoice = inclusiveInvoice({
      currency: 'CAD',
      subtotal: 13.99,
      taxAmount: 0,
      totalAmount: 13.99,
      quickbooksMapping: { globalTaxCalculation: 'TaxExcluded' },
      lineItems: [
        {
          description: 'Fractional service',
          quantity: 1.5,
          unitPrice: 9.99,
          discount: 1,
          amount: 13.99,
          quickbooksMapping: { itemRef: 'item-1', taxCodeRef: 'tax-zero' },
        },
      ],
    });
    expect(mapInvoiceToQBO(invoice).Line).toMatchObject([
      { Amount: 14.99 },
      { Amount: -1, Description: 'Discount on line 1' },
    ]);
  });

  it('refuses off-grid frozen discounts before generating QBO fallback lines', () => {
    const invoice = inclusiveInvoice({
      currency: 'CAD',
      subtotal: 10,
      taxAmount: 0,
      totalAmount: 10,
      quickbooksMapping: { globalTaxCalculation: 'TaxExcluded' },
      lineItems: [
        {
          description: 'Off-grid discount',
          quantity: 3,
          unitPrice: 3.335,
          discount: 0.005,
          amount: 10,
          quickbooksMapping: { itemRef: 'item-1', taxCodeRef: 'tax-zero' },
        },
      ],
    });
    expect(() => mapInvoiceToQBO(invoice)).toThrow(/minor-unit grid/);
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
          {
            taxCode: 'HST',
            rate: '0.13',
            quickbooksTaxRateRef: 'rate-hst',
            taxAmount: 12,
          },
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

  it.each([
    ['JPY', 100.5, 12.5, 113],
    ['ZZZ', 100, 13, 113],
  ] as const)('refuses off-grid or unknown %s frozen inclusive snapshots', (currency, net, tax, gross) => {
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
          taxComponents: [
            {
              taxCode: 'HST',
              rate: '0.13',
              quickbooksTaxRateRef: 'rate-hst',
              taxAmount: tax,
            },
          ],
        },
      ],
    });
    expect(() => mapInvoiceToQBO(invoice)).toThrow(/minor-unit grid/);
  });

  it('refuses percent-form component rates instead of treating 13 as 13%', () => {
    const invoice = inclusiveInvoice();
    const component = invoice.lineItems[0].taxComponents?.[0];
    if (!component) throw new Error('invalid test fixture');
    component.rate = 13;
    expect(() => mapInvoiceToQBO(invoice)).toThrow(/rate from 0 through 1/);
  });

  it('refuses a materially wrong in-range component rate before mapping', () => {
    const invoice = inclusiveInvoice();
    const component = invoice.lineItems[0].taxComponents?.[0];
    if (!component) throw new Error('invalid test fixture');
    component.rate = '0.5';
    expect(() => mapInvoiceToQBO(invoice)).toThrow(/rate is inconsistent/);
  });

  it('rejects partial component detail instead of sending a tax-line subtotal', () => {
    const invoice = inclusiveInvoice({
      subtotal: 200,
      taxAmount: 10,
      totalAmount: 210,
      quickbooksMapping: { globalTaxCalculation: 'TaxExcluded' },
      lineItems: [
        {
          description: 'First taxed line',
          quantity: 1,
          unitPrice: 100,
          amount: 100,
          taxAmount: 5,
          taxComponents: [
            {
              taxCode: 'GST',
              rate: '0.05',
              quickbooksTaxRateRef: 'rate-gst',
              taxAmount: 5,
            },
          ],
          quickbooksMapping: { itemRef: 'item-1', taxCodeRef: 'tax-gst' },
        },
        {
          description: 'Second taxed line',
          quantity: 1,
          unitPrice: 100,
          amount: 100,
          taxAmount: 5,
          quickbooksMapping: { itemRef: 'item-2', taxCodeRef: 'tax-gst' },
        },
      ],
    });
    expect(() => mapInvoiceToQBO(invoice)).toThrow(/every taxed line/);
  });

  it('rejects component detail whose exact aggregate differs from the header', () => {
    const invoice = inclusiveInvoice({
      subtotal: 100,
      taxAmount: 10,
      totalAmount: 110,
      quickbooksMapping: { globalTaxCalculation: 'TaxExcluded' },
      lineItems: [
        {
          description: 'Taxed line',
          quantity: 1,
          unitPrice: 100,
          amount: 100,
          taxAmount: 5,
          taxComponents: [
            {
              taxCode: 'GST',
              rate: '0.05',
              quickbooksTaxRateRef: 'rate-gst',
              taxAmount: 5,
            },
          ],
          quickbooksMapping: { itemRef: 'item-1', taxCodeRef: 'tax-gst' },
        },
      ],
    });
    expect(() => mapInvoiceToQBO(invoice)).toThrow(
      /component tax detail must equal/,
    );
  });

  it('serializes floating component rates and aggregates exact minor-unit TaxLines', () => {
    const invoice = inclusiveInvoice({
      subtotal: 14.29,
      taxAmount: 3.3,
      totalAmount: 17.59,
      quickbooksMapping: { globalTaxCalculation: 'TaxExcluded' },
      lineItems: [
        {
          description: 'Seven percent one',
          quantity: 1,
          unitPrice: 1.43,
          amount: 1.43,
          taxAmount: 0.1,
          taxComponents: [
            {
              taxCode: 'GST',
              rate: 0.07,
              quickbooksTaxRateRef: 'rate-seven',
              taxAmount: 0.1,
            },
          ],
          quickbooksMapping: { itemRef: 'item-1', taxCodeRef: 'tax-seven' },
        },
        {
          description: 'Seven percent two',
          quantity: 1,
          unitPrice: 2.86,
          amount: 2.86,
          taxAmount: 0.2,
          taxComponents: [
            {
              taxCode: 'GST',
              rate: 0.07,
              quickbooksTaxRateRef: 'rate-seven',
              taxAmount: 0.2,
            },
          ],
          quickbooksMapping: { itemRef: 'item-2', taxCodeRef: 'tax-seven' },
        },
        {
          description: 'Thirty percent',
          quantity: 1,
          unitPrice: 10,
          amount: 10,
          taxAmount: 3,
          taxComponents: [
            {
              taxCode: 'PST',
              rate: 0.1 + 0.2,
              quickbooksTaxRateRef: 'rate-thirty',
              taxAmount: 3,
            },
          ],
          quickbooksMapping: { itemRef: 'item-3', taxCodeRef: 'tax-thirty' },
        },
      ],
    });
    const mapped = mapInvoiceToQBO(invoice);
    expect(mapped.TxnTaxDetail?.TaxLine).toEqual([
      expect.objectContaining({
        Amount: 0.3,
        TaxLineDetail: expect.objectContaining({ TaxPercent: 7 }),
      }),
      expect.objectContaining({
        Amount: 3,
        TaxLineDetail: expect.objectContaining({ TaxPercent: 30 }),
      }),
    ]);
  });

  it('normalizes only admitted binary-noise frozen amounts before TaxLine minor conversion', () => {
    const noisyAmount = 0.1 + 0.2;
    const invoice = inclusiveInvoice({
      subtotal: noisyAmount,
      taxAmount: noisyAmount,
      totalAmount: noisyAmount + noisyAmount,
      quickbooksMapping: { globalTaxCalculation: 'TaxExcluded' },
      lineItems: [
        {
          description: 'Derived noisy net',
          quantity: 3,
          unitPrice: 0.1,
          taxAmount: noisyAmount,
          taxComponents: [
            {
              taxCode: 'GST',
              rate: 1,
              quickbooksTaxRateRef: 'rate-full',
              taxAmount: noisyAmount,
            },
          ],
          quickbooksMapping: { itemRef: 'item-1', taxCodeRef: 'tax-full' },
        },
      ],
    });
    const mapped = mapInvoiceToQBO(invoice);
    expect(mapped.Line[0]?.Amount).toBe(noisyAmount);
    expect(mapped.TxnTaxDetail?.TaxLine).toEqual([
      expect.objectContaining({
        Amount: 0.3,
        TaxLineDetail: expect.objectContaining({ TaxPercent: 100 }),
      }),
    ]);
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
    expect(memo.quickbooksCreditMemoRequest).toMatchObject({
      creditedInvoiceExternalId: 'qbo-invoice-1',
    });
    expect(mapCreditMemoToQBO(memo)).toMatchObject({
      GlobalTaxCalculation: 'TaxInclusive',
      TxnTaxDetail: { TotalTax: 13 },
    });
  });

  it('rejects a changed credited invoice before issuing a request', async () => {
    const memo = creditMemo();
    memo.quickbooksCreditMemoRequest = prepareQuickBooksCreditMemoRequest(
      memo,
      {
        requestId: 'credit-link-v1',
        realmId: 'realm-1',
        environment: 'sandbox',
      },
    );
    memo.creditedInvoiceExternalId = 'qbo-invoice-2';
    const provider = quickBooksProvider();
    await expect(provider.creditMemos.push(memo)).rejects.toThrow(
      /linkage mismatch/,
    );
    expect(provider.ensureAccessToken).not.toHaveBeenCalled();
  });

  it('validates malformed credit-memo updates before authentication or GET', async () => {
    const memo = creditMemo();
    memo.externalId = 'qbo-credit-1';
    delete memo.lineItems[0].taxInclusiveAmount;
    const provider = quickBooksProvider();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(provider.creditMemos.sync(memo)).rejects.toThrow(
      /TaxInclusive/,
    );
    expect(provider.ensureAccessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps credit memos optional and refuses unsupported providers explicitly', () => {
    const stripe = new StripeProvider({ type: 'stripe', secretKey: 'sk_test' });
    expect(stripe.creditMemos).toBeUndefined();
    expect(() => requireCreditMemoOperations(stripe)).toThrow(
      "Accounting provider 'stripe' does not support credit memos",
    );
  });
});
