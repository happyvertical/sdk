import { describe, expect, it, vi } from 'vitest';
import {
  prepareQuickBooksCreditMemoRequest,
  prepareQuickBooksInvoiceRequest,
  verifyQuickBooksCreditMemoReadback,
  verifyQuickBooksInvoiceReadback,
} from '../../index.js';
import type { CreditMemoInput, InvoiceInput } from '../../types.js';
import { QuickBooksProvider } from './index.js';

const identity = {
  requestId: 'original-request',
  realmId: 'realm',
  environment: 'sandbox' as const,
};
function input(): InvoiceInput {
  return {
    id: 'local',
    invoiceNumber: 'INV-1',
    customerId: 'local-customer',
    customerExternalId: 'customer',
    issueDate: new Date(2026, 9, 1),
    dueDate: new Date(2026, 9, 31),
    currency: 'CAD',
    subtotal: 100,
    taxAmount: 5,
    totalAmount: 105,
    quickbooksMapping: { globalTaxCalculation: 'TaxExcluded' },
    lineItems: [
      {
        description: 'Work',
        quantity: 2,
        unitPrice: 50,
        amount: 100,
        taxAmount: 5,
        taxComponents: [
          {
            taxCode: 'gst',
            rate: '0.05',
            quickbooksTaxRateRef: 'rate',
            taxAmount: 5,
          },
        ],
        quickbooksMapping: {
          itemRef: 'item',
          taxCodeRef: 'tax-code',
          taxComponents: [{ taxRateRef: 'rate', compound: false }],
        },
      },
    ],
  };
}
function record() {
  return {
    Id: 'remote',
    SyncToken: '2',
    TotalAmt: 105,
    CustomerRef: { value: 'customer', name: 'Provider display metadata' },
    DocNumber: 'INV-1',
    TxnDate: '2026-10-01',
    DueDate: '2026-10-31',
    CurrencyRef: { value: 'CAD' },
    GlobalTaxCalculation: 'TaxExcluded',
    MetaData: { LastUpdatedTime: '2026-10-16T00:00:00Z' },
    Line: [
      {
        Id: 'provider-line',
        LineNum: 1,
        Description: 'Work',
        Amount: 100,
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          Qty: 2,
          UnitPrice: 50,
          ItemRef: { value: 'item' },
          TaxCodeRef: { value: 'tax-code' },
        },
      },
    ],
    TxnTaxDetail: {
      TotalTax: 5,
      TaxLine: [
        {
          Amount: 5,
          DetailType: 'TaxLineDetail',
          TaxLineDetail: {
            TaxRateRef: { value: 'rate' },
            TaxPercent: 5,
            PercentBased: true,
          },
        },
      ],
    },
  };
}
function observed(raw: unknown = record()) {
  return {
    realmId: 'realm',
    environment: 'sandbox' as const,
    externalId: 'remote',
    record: raw,
  };
}
describe('public frozen QuickBooks document verification', () => {
  it('reads credit evidence through the configured provider without writing or guessing identity', async () => {
    const provider = new QuickBooksProvider({
      type: 'quickbooks',
      clientId: 'fixture',
      clientSecret: 'fixture',
      refreshToken: 'fixture',
      realmId: 'realm',
      environment: 'sandbox',
    });
    const request = vi
      .spyOn(provider, 'request')
      .mockResolvedValue({ CreditMemo: { Id: 'credit/id', SyncToken: '1' } });
    expect(provider.creditMemos.pull).toBeTypeOf('function');
    const result = await provider.creditMemos.pull!('credit/id');
    expect(request).toHaveBeenCalledExactlyOnceWith(
      'GET',
      'creditmemo/credit%2Fid',
    );
    expect(result).toMatchObject({
      provider: 'quickbooks',
      externalId: 'credit/id',
      raw: { Id: 'credit/id' },
    });
    request.mockResolvedValue({ CreditMemo: { Id: 'other' } });
    await expect(provider.creditMemos.pull!('credit/id')).rejects.toThrow(
      'identity differs',
    );
    await expect(provider.creditMemos.pull!(' ')).rejects.toThrow(
      'exact external ID',
    );
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('verifies exact original economics while accepting provider metadata without I/O', () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    try {
      const invoice = input(),
        request = prepareQuickBooksInvoiceRequest(invoice, identity);
      expect(
        verifyQuickBooksInvoiceReadback(invoice, request, observed()),
      ).toEqual({
        externalId: 'remote',
        syncToken: '2',
        payloadHash: request.payloadHash,
      });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it.each([
    'customer',
    'date',
    'total',
    'currency',
    'item',
    'tax-code',
    'tax-rate',
    'tax-basis',
    'extra-line',
    'revision',
    'identity',
    'deposit',
    'fx',
  ])('refuses changed %s', (change) => {
    const invoice = input(),
      request = prepareQuickBooksInvoiceRequest(invoice, identity),
      raw: any = record();
    if (change === 'customer') raw.CustomerRef.value = 'other';
    if (change === 'date') raw.TxnDate = '2026-10-02';
    if (change === 'total') raw.TotalAmt = 105.01;
    if (change === 'currency') raw.CurrencyRef.value = 'USD';
    if (change === 'item')
      raw.Line[0].SalesItemLineDetail.ItemRef.value = 'other';
    if (change === 'tax-code')
      raw.Line[0].SalesItemLineDetail.TaxCodeRef.value = 'other';
    if (change === 'tax-rate')
      raw.TxnTaxDetail.TaxLine[0].TaxLineDetail.TaxRateRef.value = 'other';
    if (change === 'tax-basis')
      raw.TxnTaxDetail.TaxLine[0].TaxLineDetail.TaxPercent = 7;
    if (change === 'extra-line')
      raw.Line.push({ DetailType: 'DiscountLineDetail', Amount: 0 });
    if (change === 'revision') raw.SyncToken = null;
    if (change === 'identity') raw.Id = 'another';
    if (change === 'deposit') raw.Deposit = 1;
    if (change === 'fx') raw.ExchangeRate = 0.8;
    expect(() =>
      verifyQuickBooksInvoiceReadback(invoice, request, observed(raw)),
    ).toThrow('differs from the frozen document');
  });
  it('checks provider-added implicit taxable bases without changing frozen request bytes', () => {
    const invoice = input();
    const descriptor = prepareQuickBooksInvoiceRequest(invoice, identity);
    const raw: any = record();
    raw.TxnTaxDetail.TaxLine[0].TaxLineDetail.NetAmountTaxable = 99;
    expect(() =>
      verifyQuickBooksInvoiceReadback(invoice, descriptor, observed(raw)),
    ).toThrow();
    raw.TxnTaxDetail.TaxLine[0].TaxLineDetail.NetAmountTaxable = 100;
    expect(
      verifyQuickBooksInvoiceReadback(invoice, descriptor, observed(raw))
        .externalId,
    ).toBe('remote');
    expect(prepareQuickBooksInvoiceRequest(invoice, identity)).toEqual(
      descriptor,
    );
    const { invoiceNumber, dueDate: _due, ...shared } = invoice;
    const credit: CreditMemoInput = {
      ...shared,
      creditMemoNumber: invoiceNumber,
      creditedInvoiceExternalId: 'original',
    };
    const creditDescriptor = prepareQuickBooksCreditMemoRequest(
      credit,
      identity,
    );
    delete raw.DueDate;
    expect(
      verifyQuickBooksCreditMemoReadback(
        credit,
        creditDescriptor,
        observed(raw),
      ).externalId,
    ).toBe('remote');
    raw.TxnTaxDetail.TaxLine[0].TaxLineDetail.NetAmountTaxable = 99;
    expect(() =>
      verifyQuickBooksCreditMemoReadback(
        credit,
        creditDescriptor,
        observed(raw),
      ),
    ).toThrow();
  });
  it('refuses foreign connection, changed frozen descriptor and unproved tax components', () => {
    const invoice = input(),
      request = prepareQuickBooksInvoiceRequest(invoice, identity);
    expect(() =>
      verifyQuickBooksInvoiceReadback(invoice, request, {
        ...observed(),
        realmId: 'other',
      }),
    ).toThrow();
    expect(() =>
      verifyQuickBooksInvoiceReadback(invoice, request, {
        ...observed(),
        environment: 'production',
      }),
    ).toThrow();
    expect(() =>
      verifyQuickBooksInvoiceReadback(
        invoice,
        { ...request, payloadHash: 'forged' },
        observed(),
      ),
    ).toThrow();
    const noComponents = input();
    delete noComponents.lineItems[0].taxComponents;
    expect(() =>
      verifyQuickBooksInvoiceReadback(
        noComponents,
        prepareQuickBooksInvoiceRequest(noComponents, identity),
        observed(),
      ),
    ).toThrow();
  });
  it.each([
    ['JPY', 100],
    ['CAD', 10.25],
    ['KWD', 10.125],
  ] as const)('retains exact %s precision', (currency, amount) => {
    const invoice = input();
    Object.assign(invoice, {
      currency,
      subtotal: amount,
      taxAmount: 0,
      totalAmount: amount,
    });
    invoice.quickbooksMapping = { globalTaxCalculation: 'NotApplicable' };
    invoice.lineItems = [
      {
        description: 'Work',
        quantity: 1,
        unitPrice: amount,
        amount,
        taxAmount: 0,
        quickbooksMapping: { itemRef: 'item', taxCodeRef: 'tax-code' },
      },
    ];
    const raw: any = record();
    Object.assign(raw, {
      TotalAmt: amount,
      CurrencyRef: { value: currency },
      GlobalTaxCalculation: 'NotApplicable',
      TxnTaxDetail: { TotalTax: 0 },
    });
    raw.Line[0].Amount = amount;
    raw.Line[0].SalesItemLineDetail.Qty = 1;
    raw.Line[0].SalesItemLineDetail.UnitPrice = amount;
    expect(
      verifyQuickBooksInvoiceReadback(
        invoice,
        prepareQuickBooksInvoiceRequest(invoice, identity),
        observed(raw),
      ).externalId,
    ).toBe('remote');
  });
  it('verifies exact generated inclusive discount lines', () => {
    const invoice = input();
    Object.assign(invoice, {
      subtotal: 29,
      taxAmount: 0,
      totalAmount: 29,
      quickbooksMapping: { globalTaxCalculation: 'TaxInclusive' },
    });
    invoice.lineItems = [
      {
        description: 'Work',
        quantity: 3,
        unitPrice: 10,
        discount: 1,
        amount: 29,
        taxAmount: 0,
        taxInclusiveAmount: 29,
        quickbooksMapping: { itemRef: 'item', taxCodeRef: 'tax-code' },
      },
    ];
    const raw: any = record();
    Object.assign(raw, {
      TotalAmt: 29,
      GlobalTaxCalculation: 'TaxInclusive',
      TxnTaxDetail: { TotalTax: 0 },
    });
    raw.Line[0].Amount = 30;
    Object.assign(raw.Line[0].SalesItemLineDetail, {
      Qty: 3,
      UnitPrice: 10,
      TaxInclusiveAmt: 30,
    });
    raw.Line.push({
      LineNum: 1,
      Description: 'Discount on line 1',
      Amount: -1,
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        Qty: 1,
        UnitPrice: -1,
        TaxInclusiveAmt: -1,
        ItemRef: { value: 'item' },
        TaxCodeRef: { value: 'tax-code' },
      },
    });
    const request = prepareQuickBooksInvoiceRequest(invoice, identity);
    expect(
      verifyQuickBooksInvoiceReadback(invoice, request, observed(raw))
        .externalId,
    ).toBe('remote');
    raw.Line.pop();
    expect(() =>
      verifyQuickBooksInvoiceReadback(invoice, request, observed(raw)),
    ).toThrow();
  });
  it('checks compound component basis and a matching subtotal summary', () => {
    const invoice = input();
    invoice.taxAmount = 12.35;
    invoice.totalAmount = 112.35;
    invoice.lineItems[0].taxAmount = 12.35;
    invoice.lineItems[0].taxComponents!.push({
      taxCode: 'pst',
      rate: '0.07',
      quickbooksTaxRateRef: 'compound-rate',
      taxAmount: 7.35,
      compound: true,
      taxableAmount: 105,
    });
    invoice.lineItems[0].quickbooksMapping!.taxComponents!.push({
      taxRateRef: 'compound-rate',
      compound: true,
    });
    const raw: any = record();
    raw.TotalAmt = 112.35;
    raw.TxnTaxDetail.TotalTax = 12.35;
    raw.Line.push({ DetailType: 'SubTotalLineDetail', Amount: 100 });
    raw.TxnTaxDetail.TaxLine.push({
      Amount: 7.35,
      DetailType: 'TaxLineDetail',
      TaxLineDetail: {
        TaxRateRef: { value: 'compound-rate' },
        TaxPercent: 7,
        PercentBased: true,
        NetAmountTaxable: 105,
      },
    });
    const request = prepareQuickBooksInvoiceRequest(invoice, identity);
    expect(
      verifyQuickBooksInvoiceReadback(invoice, request, observed(raw))
        .externalId,
    ).toBe('remote');
    raw.TxnTaxDetail.TaxLine[1].TaxLineDetail.NetAmountTaxable = 100;
    expect(() =>
      verifyQuickBooksInvoiceReadback(invoice, request, observed(raw)),
    ).toThrow();
  });
  it('binds credit source identity while leaving invoice application separate', () => {
    const invoice = input();
    const credit: CreditMemoInput = {
      ...invoice,
      creditMemoNumber: 'CM-1',
      creditedInvoiceExternalId: 'original-invoice',
    };
    const request = prepareQuickBooksCreditMemoRequest(credit, identity),
      raw: any = record();
    raw.DocNumber = 'CM-1';
    delete raw.DueDate;
    expect(
      verifyQuickBooksCreditMemoReadback(credit, request, observed(raw))
        .externalId,
    ).toBe('remote');
    expect(() =>
      verifyQuickBooksCreditMemoReadback(
        { ...credit, creditedInvoiceExternalId: 'other' },
        request,
        observed(raw),
      ),
    ).toThrow();
  });
});
