import { describe, expect, it } from 'vitest';
import { prepareQuickBooksInvoiceRequest } from '../../index.js';
import type { CreditMemoInput, InvoiceInput } from '../../types.js';
import { mapCreditMemoToQBO, mapInvoiceToQBO } from './invoice-request.js';

function invoice(inclusive = false): InvoiceInput {
  return {
    id: 'compound',
    invoiceNumber: 'INV-C',
    customerId: 'customer',
    issueDate: new Date('2026-10-01'),
    dueDate: new Date('2026-11-01'),
    currency: 'CAD',
    subtotal: 100,
    taxAmount: 12.35,
    totalAmount: 112.35,
    quickbooksMapping: {
      globalTaxCalculation: inclusive ? 'TaxInclusive' : 'TaxExcluded',
    },
    lineItems: [
      {
        description: 'Ordered',
        quantity: 1,
        unitPrice: inclusive ? 112.35 : 100,
        amount: 100,
        taxAmount: 12.35,
        ...(inclusive ? { taxInclusiveAmount: 112.35 } : {}),
        taxComponents: [
          {
            taxCode: 'a',
            rate: '0.05',
            quickbooksTaxRateRef: 'rate-a',
            taxAmount: 5,
          },
          {
            taxCode: 'b',
            rate: '0.07',
            quickbooksTaxRateRef: 'rate-b',
            taxAmount: 7.35,
            compound: true,
            taxableAmount: 105,
          },
        ],
        quickbooksMapping: {
          itemRef: 'item',
          taxCodeRef: 'compound-code',
          taxComponents: [
            { taxRateRef: 'rate-a', compound: false },
            { taxRateRef: 'rate-b', compound: true },
          ],
        },
      },
    ],
  };
}
describe('compound frozen QuickBooks snapshots (#1412)', () => {
  it.each([
    false,
    true,
  ])('preserves source tax and actual basis for inclusive=%s', (inclusive) => {
    const payload = mapInvoiceToQBO(invoice(inclusive));
    expect(payload.TxnTaxDetail).toEqual({
      TotalTax: 12.35,
      TaxLine: [
        {
          Amount: 5,
          DetailType: 'TaxLineDetail',
          TaxLineDetail: {
            TaxRateRef: { value: 'rate-a' },
            TaxPercent: 5,
            PercentBased: true,
          },
        },
        {
          Amount: 7.35,
          DetailType: 'TaxLineDetail',
          TaxLineDetail: {
            TaxRateRef: { value: 'rate-b' },
            TaxPercent: 7,
            PercentBased: true,
            NetAmountTaxable: 105,
          },
        },
      ],
    });
  });
  it('aggregates an applicable component across compound and additive line subsets', () => {
    const input = invoice();
    input.lineItems.push({
      description: 'B only',
      quantity: 1,
      unitPrice: 10,
      amount: 10,
      taxAmount: 0.7,
      taxComponents: [
        {
          taxCode: 'b',
          rate: '0.07',
          quickbooksTaxRateRef: 'rate-b',
          taxAmount: 0.7,
        },
      ],
      quickbooksMapping: { itemRef: 'item', taxCodeRef: 'b-code' },
    });
    input.subtotal = 110;
    input.taxAmount = 13.05;
    input.totalAmount = 123.05;
    expect(mapInvoiceToQBO(input).TxnTaxDetail?.TaxLine?.[1]).toMatchObject({
      Amount: 8.05,
      TaxLineDetail: { NetAmountTaxable: 115, TaxPercent: 7 },
    });
  });
  it('uses prior allocated penny tax rather than a synthetic effective rate', () => {
    const input = invoice();
    const line = input.lineItems[0];
    Object.assign(line, { unitPrice: 0.1, amount: 0.1, taxAmount: 0.12 });
    line.taxComponents = [
      {
        taxCode: 'a',
        rate: '0.05',
        quickbooksTaxRateRef: 'rate-a',
        taxAmount: 0.01,
      },
      {
        taxCode: 'b',
        rate: '1',
        quickbooksTaxRateRef: 'rate-b',
        taxAmount: 0.11,
        compound: true,
        taxableAmount: 0.11,
      },
    ];
    input.subtotal = 0.1;
    input.taxAmount = 0.12;
    input.totalAmount = 0.22;
    expect(mapInvoiceToQBO(input).TxnTaxDetail?.TaxLine?.[1]).toMatchObject({
      Amount: 0.11,
      TaxLineDetail: { TaxPercent: 100, NetAmountTaxable: 0.11 },
    });
  });
  it('extracts an inclusive fractional-unit discount with ordered factors', () => {
    const input = invoice(true);
    const line = input.lineItems[0];
    Object.assign(line, {
      quantity: 3,
      unitPrice: 100,
      discount: 9.99,
      amount: 258.13,
      taxAmount: 31.88,
      taxInclusiveAmount: 290.01,
    });
    line.taxComponents![0].taxAmount = 12.91;
    Object.assign(line.taxComponents![1], {
      taxAmount: 18.97,
      taxableAmount: 271.04,
    });
    input.subtotal = 258.13;
    input.taxAmount = 31.88;
    input.totalAmount = 290.01;
    expect(mapInvoiceToQBO(input).Line).toMatchObject([
      { Amount: 267.02, SalesItemLineDetail: { TaxInclusiveAmt: 300 } },
      { Amount: -8.89, SalesItemLineDetail: { TaxInclusiveAmt: -9.99 } },
    ]);
  });
  it('uses the same exact frozen representation for credit memos and stable request identity', () => {
    const input = invoice(true);
    const credit: CreditMemoInput = {
      ...input,
      creditedInvoiceExternalId: 'qbo-original',
      creditMemoNumber: 'CM-C',
    };
    expect(mapCreditMemoToQBO(credit).TxnTaxDetail).toEqual(
      mapInvoiceToQBO(input).TxnTaxDetail,
    );
    const identity = {
      requestId: 'stable',
      realmId: 'realm',
      environment: 'sandbox' as const,
    };
    expect(prepareQuickBooksInvoiceRequest(input, identity)).toEqual(
      prepareQuickBooksInvoiceRequest(structuredClone(input), identity),
    );
  });
  it('rejects missing or contradictory declared bases, rates and realm order before mapping', () => {
    const changes: Array<(input: InvoiceInput) => void> = [
      (p) => {
        delete p.lineItems[0].taxComponents![1].taxableAmount;
      },
      (p) => {
        p.lineItems[0].taxComponents![1].taxableAmount = 100;
      },
      (p) => {
        p.lineItems[0].taxComponents![1].taxableAmount = 105.001;
      },
      (p) => {
        p.lineItems[0].taxComponents![1].rate = '0.08';
      },
      (p) => {
        delete p.lineItems[0].quickbooksMapping!.taxComponents;
      },
      (p) => {
        p.lineItems[0].quickbooksMapping!.taxComponents!.reverse();
      },
      (p) => {
        p.lineItems[0].quickbooksMapping!.taxComponents![1].compound = false;
      },
      (p) => {
        p.lineItems[0].quickbooksMapping!.taxComponents![1].taxRateRef =
          'rate-a';
      },
      (p) => {
        Object.assign(p.lineItems[0].taxComponents![1], { compound: 'true' });
      },
      (p) => {
        Object.assign(p.lineItems[0].taxComponents![1], {
          priorComponentIds: ['a'],
        });
      },
    ];
    for (const change of changes) {
      const input = invoice();
      change(input);
      expect(() => mapInvoiceToQBO(input)).toThrow();
    }
  });
});
