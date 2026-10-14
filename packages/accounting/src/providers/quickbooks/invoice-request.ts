import { createHash } from 'node:crypto';
import type {
  CreditMemoInput,
  InvoiceInput,
  InvoiceLineItemInput,
  QuickBooksCreditMemoRequest,
  QuickBooksInvoiceRequest,
} from '../../types.js';
import {
  isCurrencyMinorUnit,
  matchesCurrencyRoundedLineAmount,
  roundCurrencyAmount,
} from './line-amount.js';

type QuickBooksCreateRequest =
  | QuickBooksInvoiceRequest
  | QuickBooksCreditMemoRequest;

interface QuickBooksSalesLine {
  LineNum: number;
  Description: string;
  Amount: number;
  DetailType: 'SalesItemLineDetail';
  SalesItemLineDetail: {
    Qty: number;
    UnitPrice: number;
    ItemRef?: { value: string };
    TaxCodeRef?: { value: string };
    TaxInclusiveAmt?: number;
  };
}

/** Prepare once, persist before sending, and reuse unchanged. Performs no I/O. */
export function prepareQuickBooksInvoiceRequest(
  invoice: InvoiceInput,
  identity: Omit<QuickBooksInvoiceRequest, 'payloadHash'>,
): QuickBooksInvoiceRequest {
  if (invoice.externalId)
    throw new Error('QuickBooks request identity is only for invoice creation');
  return prepareRequest(mapInvoiceToQBO(invoice), identity, 'invoice');
}

/** Prepare once, persist before sending, and reuse unchanged. Performs no I/O. */
export function prepareQuickBooksCreditMemoRequest(
  creditMemo: CreditMemoInput,
  identity: Omit<QuickBooksCreditMemoRequest, 'payloadHash'>,
): QuickBooksCreditMemoRequest {
  if (creditMemo.externalId)
    throw new Error(
      'QuickBooks request identity is only for credit memo creation',
    );
  return prepareRequest(
    mapCreditMemoToQBO(creditMemo),
    identity,
    'credit memo',
  );
}

function prepareRequest<T extends QuickBooksCreateRequest>(
  mapped: unknown,
  identity: Omit<T, 'payloadHash'>,
  kind: 'invoice' | 'credit memo',
): T {
  const payload = JSON.stringify(mapped);
  const request = { ...identity, payloadHash: hash(payload) } as T;
  validateRequest(
    request,
    identity.realmId,
    identity.environment,
    payload,
    kind,
  );
  return Object.freeze(request);
}

function hash(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

export function validateQuickBooksInvoiceRequest(
  request: QuickBooksInvoiceRequest,
  realmId: string,
  environment: 'sandbox' | 'production',
  payload: string | undefined,
): void {
  validateRequest(request, realmId, environment, payload, 'invoice');
}

export function validateQuickBooksCreditMemoRequest(
  request: QuickBooksCreditMemoRequest,
  realmId: string,
  environment: 'sandbox' | 'production',
  payload: string | undefined,
): void {
  validateRequest(request, realmId, environment, payload, 'credit memo');
}

function validateRequest(
  request: QuickBooksCreateRequest,
  realmId: string,
  environment: 'sandbox' | 'production',
  payload: string | undefined,
  kind: 'invoice' | 'credit memo',
): void {
  if (
    !request ||
    typeof request.requestId !== 'string' ||
    !/^[A-Za-z0-9._-]{1,50}$/.test(request.requestId)
  ) {
    throw new Error(
      'QuickBooks requestId must contain 1–50 URL-safe letters, digits, dots, underscores or hyphens',
    );
  }
  if (
    !request.realmId ||
    request.realmId !== realmId ||
    !['sandbox', 'production'].includes(request.environment) ||
    request.environment !== environment
  ) {
    throw new Error(`QuickBooks ${kind} request realm/environment mismatch`);
  }
  if (!payload || request.payloadHash !== hash(payload)) {
    throw new Error(
      `QuickBooks ${kind} request payload mismatch; reconcile the original request`,
    );
  }
  const parsed = JSON.parse(payload);
  if (parsed.Id !== undefined || parsed.SyncToken !== undefined) {
    throw new Error(`QuickBooks request identity is only for ${kind} creation`);
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function close(a: number, b: number): boolean {
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a - b) <=
      Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 8
  );
}

function finite(value: number, label: string, allowNegative = false): number {
  if (!Number.isFinite(value) || (!allowNegative && value < 0))
    throw new Error(
      `QuickBooks ${label} must be a finite ${allowNegative ? '' : 'non-negative '}amount`,
    );
  return value;
}

function reference(value: string | undefined, label: string) {
  if (!value || value.trim() !== value || value.length > 255)
    throw new Error(`QuickBooks ${label} must be a non-empty realm reference`);
  return { value };
}

function componentRate(
  value: number | string | undefined,
  label: string,
): number {
  const rate =
    typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)
      ? Number(value)
      : value;
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0)
    throw new Error(
      `QuickBooks ${label} needs a non-negative decimal frozen component rate`,
    );
  return rate;
}

function mapDocumentLines(
  input: Pick<
    InvoiceInput,
    | 'lineItems'
    | 'subtotal'
    | 'taxAmount'
    | 'totalAmount'
    | 'currency'
    | 'quickbooksMapping'
  >,
): QuickBooksSalesLine[] {
  const mode = input.quickbooksMapping?.globalTaxCalculation;
  if (mode && !['TaxExcluded', 'TaxInclusive', 'NotApplicable'].includes(mode))
    throw new Error(
      'QuickBooks globalTaxCalculation must be TaxExcluded, TaxInclusive or NotApplicable',
    );
  finite(input.subtotal, 'subtotal');
  finite(input.taxAmount, 'tax amount');
  finite(input.totalAmount, 'total amount');
  if (input.lineItems.length === 0)
    throw new Error('QuickBooks invoices require at least one sales line');
  const hasLineMapping = input.lineItems.some((item) => item.quickbooksMapping);
  if ((input.taxAmount > 0 || hasLineMapping) && !input.quickbooksMapping)
    throw new Error(
      'QuickBooks mapped or nonzero-tax invoices require explicit globalTaxCalculation',
    );
  if (
    input.quickbooksMapping &&
    input.lineItems.some((item) => !item.quickbooksMapping)
  )
    throw new Error(
      'QuickBooks mapped invoices require itemRef and taxCodeRef on every line',
    );
  if (input.taxAmount > 0 && mode === 'NotApplicable')
    throw new Error(
      'QuickBooks nonzero tax cannot use NotApplicable global tax calculation',
    );

  const mapped: QuickBooksSalesLine[] = [];
  let snapshotTax = 0;
  let hasCompleteLineTax = true;
  for (const [index, item] of input.lineItems.entries()) {
    const line = mapLine(item, index, input.currency, mode);
    mapped.push(...line.lines);
    if (line.taxAmount === undefined) hasCompleteLineTax = false;
    else snapshotTax += line.taxAmount;
  }
  const mappedSubtotal = mapped.reduce(
    (sum, line) => sum + (line.Amount as number),
    0,
  );
  if (!close(mappedSubtotal, input.subtotal))
    throw new Error('QuickBooks line amounts must equal the invoice subtotal');
  if (!close(input.subtotal + input.taxAmount, input.totalAmount))
    throw new Error(
      'QuickBooks subtotal plus tax must equal the invoice total',
    );
  if (hasCompleteLineTax && !close(snapshotTax, input.taxAmount))
    throw new Error(
      'QuickBooks stored line tax must equal the invoice tax amount',
    );
  return mapped;
}

function mapLine(
  item: InvoiceLineItemInput,
  index: number,
  currency: string | undefined,
  mode: 'TaxExcluded' | 'TaxInclusive' | 'NotApplicable' | undefined,
): { lines: QuickBooksSalesLine[]; taxAmount?: number } {
  const label = `line ${index + 1}`;
  if (item.taxRate !== undefined && item.taxRate !== 0)
    throw new Error(
      'QuickBooks numeric taxRate is not supported; use a realm taxCodeRef',
    );
  if (item.taxCode !== undefined)
    throw new Error(
      'QuickBooks generic taxCode is not a realm tax reference; use quickbooksMapping.taxCodeRef',
    );
  finite(item.quantity, `${label} quantity`);
  if (item.quantity <= 0)
    throw new Error(`QuickBooks ${label} quantity must be greater than zero`);
  finite(item.unitPrice, `${label} unit price`);
  const baseDocumentAmount = item.quantity * item.unitPrice;
  finite(baseDocumentAmount, `${label} pre-discount amount`);
  const discount = finite(item.discount ?? 0, `${label} discount`);
  if (discount > baseDocumentAmount && !close(discount, baseDocumentAmount))
    throw new Error(
      `QuickBooks ${label} discount cannot exceed quantity times unit price`,
    );
  const netAmount = finite(
    item.amount ?? baseDocumentAmount - discount,
    `${label} amount`,
  );
  const taxAmount =
    item.taxAmount === undefined
      ? undefined
      : finite(item.taxAmount, `${label} tax amount`);
  if (item.taxComponents !== undefined) {
    if (taxAmount === undefined)
      throw new Error(
        `QuickBooks ${label} tax components require a line tax amount`,
      );
    const componentTax = item.taxComponents.reduce(
      (sum, component, componentIndex) => {
        if (
          !component.taxCode ||
          component.taxCode.trim() !== component.taxCode
        )
          throw new Error(
            `QuickBooks ${label} tax component ${componentIndex + 1} needs a tax code`,
          );
        return (
          sum +
          finite(
            component.taxAmount,
            `${label} tax component ${componentIndex + 1}`,
          )
        );
      },
      0,
    );
    if (!close(componentTax, taxAmount))
      throw new Error(
        `QuickBooks ${label} tax components must equal the line tax amount`,
      );
  }

  const inclusive = mode === 'TaxInclusive';
  const grossAmount = item.taxInclusiveAmount;
  if (inclusive) {
    if (
      grossAmount === undefined ||
      taxAmount === undefined ||
      !item.taxComponents?.length
    )
      throw new Error(
        `QuickBooks ${label} TaxInclusive snapshots require gross amount, line tax and tax components`,
      );
    finite(grossAmount, `${label} tax-inclusive amount`);
    if (!close(netAmount + taxAmount, grossAmount))
      throw new Error(
        `QuickBooks ${label} net amount plus tax must equal gross amount`,
      );
    if (!close(baseDocumentAmount - discount, grossAmount))
      throw new Error(
        `QuickBooks ${label} gross amount must equal quantity times gross unit price less gross discount`,
      );
  } else if (
    !close(netAmount, baseDocumentAmount - discount) &&
    !matchesCurrencyRoundedLineAmount(
      item.quantity,
      item.unitPrice,
      netAmount + discount,
      currency,
    )
  ) {
    throw new Error(
      `QuickBooks ${label} amount must equal quantity times unit price less discount`,
    );
  }

  const itemRef = item.quickbooksMapping
    ? reference(item.quickbooksMapping.itemRef, `${label} itemRef`)
    : undefined;
  const taxCodeRef = item.quickbooksMapping
    ? reference(item.quickbooksMapping.taxCodeRef, `${label} taxCodeRef`)
    : undefined;
  const line = (
    amount: number,
    quantity: number,
    unitPrice: number,
    description: string,
    taxInclusiveAmount?: number,
  ) => ({
    LineNum: index + 1,
    Description: description,
    Amount: amount,
    DetailType: 'SalesItemLineDetail' as const,
    SalesItemLineDetail: {
      Qty: quantity,
      UnitPrice: unitPrice,
      ItemRef: itemRef,
      TaxCodeRef: taxCodeRef,
      ...(taxInclusiveAmount === undefined
        ? {}
        : { TaxInclusiveAmt: taxInclusiveAmount }),
    },
  });

  if (discount === 0 && !inclusive) {
    return {
      lines: [line(netAmount, item.quantity, item.unitPrice, item.description)],
      taxAmount,
    };
  }
  if (
    discount === 0 ||
    isCurrencyMinorUnit(netAmount / item.quantity, currency)
  ) {
    return {
      lines: [
        line(
          netAmount,
          item.quantity,
          netAmount / item.quantity,
          item.description,
          inclusive ? grossAmount : undefined,
        ),
      ],
      taxAmount,
    };
  }

  let preDiscountAmount = baseDocumentAmount;
  let negativeAmount = -discount;
  const preDiscountGross = inclusive ? baseDocumentAmount : undefined;
  if (inclusive) {
    const components = item.taxComponents;
    if (!components?.length)
      throw new Error(
        `QuickBooks ${label} needs frozen component rates for an inclusive negative discount line`,
      );
    const rate = components.reduce(
      (sum, component, componentIndex) =>
        sum +
        componentRate(
          component.rate,
          `${label} tax component ${componentIndex + 1}`,
        ),
      0,
    );
    const discountNet = roundCurrencyAmount(discount / (1 + rate), currency);
    if (discountNet === undefined)
      throw new Error(
        `QuickBooks ${label} needs a recognized currency to map an inclusive fractional-unit discount`,
      );
    preDiscountAmount = netAmount + discountNet;
    negativeAmount = -discountNet;
  } else if (!close(preDiscountAmount - netAmount, discount)) {
    throw new Error(
      `QuickBooks ${label} amount must equal quantity times unit price less discount`,
    );
  }
  const negativeGross = inclusive
    ? (roundCurrencyAmount(grossAmount! - preDiscountGross!, currency) ??
      grossAmount! - preDiscountGross!)
    : undefined;
  return {
    lines: [
      line(
        preDiscountAmount,
        item.quantity,
        preDiscountAmount / item.quantity,
        item.description,
        preDiscountGross,
      ),
      line(
        negativeAmount,
        1,
        negativeAmount,
        `Discount on line ${index + 1}`,
        negativeGross,
      ),
    ],
    taxAmount,
  };
}

function basePayload(
  input: Pick<
    InvoiceInput,
    | 'customerId'
    | 'customerExternalId'
    | 'issueDate'
    | 'subtotal'
    | 'taxAmount'
    | 'totalAmount'
    | 'currency'
    | 'memo'
    | 'lineItems'
    | 'quickbooksMapping'
  >,
  number: string,
) {
  const lines = mapDocumentLines(input);
  return {
    CustomerRef: { value: input.customerExternalId || input.customerId },
    DocNumber: number,
    TxnDate: formatLocalDate(input.issueDate),
    Line: lines,
    GlobalTaxCalculation: input.quickbooksMapping?.globalTaxCalculation,
    TxnTaxDetail: input.quickbooksMapping
      ? { TotalTax: input.taxAmount }
      : undefined,
    CurrencyRef: input.currency ? { value: input.currency } : undefined,
    CustomerMemo: input.memo ? { value: input.memo } : undefined,
  };
}

export function mapInvoiceToQBO(invoice: InvoiceInput) {
  if (invoice.collectionMethod === 'charge_automatically')
    throw new Error(
      'QuickBooks does not support charge_automatically invoice collection',
    );
  if (invoice.automaticTax)
    throw new Error(
      'QuickBooks does not support automaticTax invoice calculation',
    );
  return {
    ...basePayload(invoice, invoice.invoiceNumber),
    DueDate: formatLocalDate(invoice.dueDate),
  };
}

export function mapCreditMemoToQBO(creditMemo: CreditMemoInput) {
  if (
    !creditMemo.creditedInvoiceExternalId ||
    creditMemo.creditedInvoiceExternalId.trim() !==
      creditMemo.creditedInvoiceExternalId
  )
    throw new Error(
      'QuickBooks credit memos require a credited invoice external ID',
    );
  return basePayload(creditMemo, creditMemo.creditMemoNumber);
}
