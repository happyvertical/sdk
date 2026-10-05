import { describe, expect, it } from 'vitest';
import { prepareQuickBooksInvoiceRequest } from '../../index.js';
import type { InvoiceInput } from '../../types.js';
import { mapInvoiceToQBO } from './invoice-request.js';

function invoice(
  quantity: number,
  unitPrice: number,
  amount: number,
  currency?: string,
): InvoiceInput {
  return {
    id: 'rounded',
    invoiceNumber: 'ROUND-1',
    customerId: 'customer',
    issueDate: new Date(2026, 9, 4),
    dueDate: new Date(2026, 10, 4),
    currency,
    subtotal: amount,
    taxAmount: 0,
    totalAmount: amount,
    quickbooksMapping: { globalTaxCalculation: 'TaxExcluded' },
    lineItems: [
      {
        description: 'Exact retained source',
        quantity,
        unitPrice,
        amount,
        quickbooksMapping: { itemRef: '1', taxCodeRef: '2' },
      },
    ],
  };
}
describe('QuickBooks currency-rounded retained line amounts', () => {
  it.each([
    ['CAD', 1.0005, 10, 10.01],
    ['USD', 1, 1.005, 1.01],
    ['JPY', 1.5, 1, 2],
    ['KWD', 1.0005, 1, 1.001],
    ['IQD', 1.0005, 1, 1.001],
    ['CLF', 1.00005, 1, 1.0001],
    ['UYW', 1.00005, 1, 1.0001],
    ['MGA', 1, 1.005, 1.01],
    ['RSD', 1, 1.005, 1.01],
    ['CAD', 1.0004999, 10, 10],
    ['CAD', 1.0005001, 10, 10.01],
    ['CAD', 0.0000005, 10000, 0.01],
    ['CAD', 0.00000049, 10000, 0],
  ] as const)('preserves %s quantity%s price%s rounded amount%s', (currency, quantity, unitPrice, amount) => {
    const input = invoice(quantity, unitPrice, amount, currency),
      before = structuredClone(input);
    const mapped = mapInvoiceToQBO(input);
    expect(mapped.Line[0]).toMatchObject({
      Amount: amount,
      SalesItemLineDetail: { Qty: quantity, UnitPrice: unitPrice },
    });
    expect(input).toEqual(before);
    const identity = {
      requestId: 'rounding-proof',
      realmId: '1',
      environment: 'sandbox' as const,
    };
    expect(prepareQuickBooksInvoiceRequest(input, identity)).toEqual(
      prepareQuickBooksInvoiceRequest(input, identity),
    );
  });
  it.each([
    10, 10.02, 10.009, 10.0101,
  ])('rejects contradictory or extra-precision CAD amount%s', (amount) => {
    expect(() => mapInvoiceToQBO(invoice(1.0005, 10, amount, 'CAD'))).toThrow(
      /amount must equal/,
    );
  });
  it.each([
    undefined,
    'ZZZ',
    'XXX',
    'XAU',
    ' CAD ',
  ])('does not infer rounding precision for %s', (currency) => {
    expect(() => mapInvoiceToQBO(invoice(1.0005, 10, 10.01, currency))).toThrow(
      /amount must equal/,
    );
  });
  it.each([
    [-1.0005, 10, 10.01],
    [1.0005, -10, 10.01],
    [1.0005, 10, -10.01],
  ])('preserves negative-input rejection', (quantity, unitPrice, amount) => {
    expect(() =>
      mapInvoiceToQBO(invoice(quantity, unitPrice, amount, 'CAD')),
    ).toThrow(/non-negative/);
  });
  it('preserves exact-product callers and existing floating representation without rewriting', () => {
    for (const input of [
      invoice(3, 0.1, 0.1 * 3),
      invoice(1, 0.00001, 0.00001, 'CAD'),
    ]) {
      expect(mapInvoiceToQBO(input).Line[0].Amount).toBe(
        input.lineItems[0].amount,
      );
    }
  });
  it('keeps invoice totals authoritative after admitting rounded lines', () => {
    const input = invoice(1.0005, 10, 10.01, 'CAD');
    input.totalAmount = 10;
    expect(() => mapInvoiceToQBO(input)).toThrow(/subtotal plus tax/);
  });
});
