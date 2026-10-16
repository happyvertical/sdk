import type {
  CreditMemoInput,
  InvoiceInput,
  QuickBooksCreditMemoRequest,
  QuickBooksInvoiceRequest,
} from '../../types.js';
import {
  mapCreditMemoToQBO,
  mapInvoiceToQBO,
  prepareQuickBooksCreditMemoRequest,
  prepareQuickBooksInvoiceRequest,
} from './invoice-request.js';

/** The host obtains this record through its authorized realm-bound provider. */
export interface QuickBooksDocumentReadback {
  readonly realmId: string;
  readonly environment: 'sandbox' | 'production';
  readonly externalId: string;
  readonly record: unknown;
}
export interface VerifiedQuickBooksDocumentReadback {
  readonly externalId: string;
  readonly syncToken: string;
  readonly payloadHash: string;
}
function reject(): never {
  // Never put private provider payloads or credentials into a thrown error.
  throw new Error('QuickBooks readback differs from the frozen document');
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject();
  return value as Record<string, unknown>;
}
function matches(expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((item, index) => matches(item, actual[index]))
    );
  if (expected !== null && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object' || Array.isArray(actual))
      return false;
    const record = actual as Record<string, unknown>;
    return Object.entries(expected).every(
      ([key, value]) => value === undefined || matches(value, record[key]),
    );
  }
  return expected === actual;
}
function verify(
  input: InvoiceInput | CreditMemoInput,
  request: QuickBooksInvoiceRequest | QuickBooksCreditMemoRequest,
  prepared: QuickBooksInvoiceRequest | QuickBooksCreditMemoRequest,
  payload: Record<string, unknown>,
  observed: QuickBooksDocumentReadback,
): VerifiedQuickBooksDocumentReadback {
  if (
    !observed.externalId ||
    observed.externalId.trim() !== observed.externalId ||
    request.realmId !== observed.realmId ||
    request.environment !== observed.environment ||
    request.requestId !== prepared.requestId ||
    request.payloadHash !== prepared.payloadHash ||
    !input.currency ||
    !input.quickbooksMapping
  )
    reject();
  const raw = object(observed.record);
  if (
    raw.Id !== observed.externalId ||
    typeof raw.SyncToken !== 'string' ||
    !/^\d+$/.test(raw.SyncToken) ||
    raw.TotalAmt !== input.totalAmount ||
    raw.status === 'Deleted' ||
    raw.TxnStatus === 'Voided' ||
    (raw.Deposit !== undefined && raw.Deposit !== 0) ||
    (raw.ExchangeRate !== undefined && raw.ExchangeRate !== 1)
  )
    reject();
  if (!Array.isArray(raw.Line)) reject();
  const lines: unknown[] = [];
  let subtotals = 0;
  for (const item of raw.Line) {
    const line = object(item);
    if (line.DetailType === 'SalesItemLineDetail') lines.push(line);
    else if (
      line.DetailType === 'SubTotalLineDetail' &&
      ++subtotals === 1 &&
      line.Amount === input.subtotal
    )
      continue;
    else reject();
  }
  const expectedTax = object(payload.TxnTaxDetail);
  const actualTax = object(raw.TxnTaxDetail);
  // A header total alone cannot prove which nonzero tax components were posted.
  if (input.taxAmount !== 0 && !Array.isArray(expectedTax.TaxLine)) reject();
  if (
    expectedTax.TaxLine === undefined &&
    actualTax.TaxLine !== undefined &&
    (!Array.isArray(actualTax.TaxLine) || actualTax.TaxLine.length !== 0)
  )
    reject();
  if (!matches(payload, { ...raw, Line: lines })) reject();
  return {
    externalId: observed.externalId,
    syncToken: raw.SyncToken,
    payloadHash: prepared.payloadHash,
  };
}

/** Verify a fetched invoice; never guesses absence or makes a provider call. */
export function verifyQuickBooksInvoiceReadback(
  invoice: InvoiceInput,
  request: QuickBooksInvoiceRequest,
  observed: QuickBooksDocumentReadback,
): VerifiedQuickBooksDocumentReadback {
  const {
    externalId: _externalId,
    quickbooksRequest: _request,
    ...original
  } = invoice;
  const prepared = prepareQuickBooksInvoiceRequest(original, request);
  return verify(
    original,
    request,
    prepared,
    mapInvoiceToQBO(original),
    observed,
  );
}

/** Verify the credit document only; application to the original invoice remains separate. */
export function verifyQuickBooksCreditMemoReadback(
  credit: CreditMemoInput,
  request: QuickBooksCreditMemoRequest,
  observed: QuickBooksDocumentReadback,
): VerifiedQuickBooksDocumentReadback {
  if (request.creditedInvoiceExternalId !== credit.creditedInvoiceExternalId)
    reject();
  const {
    externalId: _externalId,
    quickbooksCreditMemoRequest: _request,
    ...original
  } = credit;
  const prepared = prepareQuickBooksCreditMemoRequest(original, request);
  return verify(
    original,
    request,
    prepared,
    mapCreditMemoToQBO(original),
    observed,
  );
}
