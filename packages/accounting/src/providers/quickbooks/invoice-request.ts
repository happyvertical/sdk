import { createHash } from 'node:crypto';
import type { InvoiceInput, QuickBooksInvoiceRequest } from '../../types.js';

/** Prepare once, persist before sending, and reuse unchanged. Performs no I/O. */
export function prepareQuickBooksInvoiceRequest(
  invoice: InvoiceInput,
  identity: Omit<QuickBooksInvoiceRequest, 'payloadHash'>,
): QuickBooksInvoiceRequest {
  if (invoice.externalId)
    throw new Error('QuickBooks request identity is only for invoice creation');
  const payload = JSON.stringify(mapInvoiceToQBO(invoice));
  const request = { ...identity, payloadHash: hash(payload) };
  validateQuickBooksInvoiceRequest(
    request,
    identity.realmId,
    identity.environment,
    payload,
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
  // A deliberately conservative URL-safe subset of Intuit's 50-character limit.
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
    throw new Error('QuickBooks invoice request realm/environment mismatch');
  }
  if (!payload || request.payloadHash !== hash(payload)) {
    throw new Error(
      'QuickBooks invoice request payload mismatch; reconcile the original request',
    );
  }
  const parsed = JSON.parse(payload);
  if (parsed.Id !== undefined || parsed.SyncToken !== undefined) {
    throw new Error('QuickBooks request identity is only for invoice creation');
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function mapInvoiceToQBO(invoice: InvoiceInput) {
  if (invoice.collectionMethod === 'charge_automatically') {
    // QuickBooks cannot charge a stored payment method for an invoice.
    throw new Error(
      'QuickBooks does not support charge_automatically invoice collection',
    );
  }
  if (invoice.automaticTax)
    throw new Error(
      'QuickBooks does not support automaticTax invoice calculation',
    );
  if (
    invoice.quickbooksMapping &&
    !['TaxExcluded', 'NotApplicable'].includes(
      invoice.quickbooksMapping.globalTaxCalculation,
    )
  )
    throw new Error(
      'QuickBooks globalTaxCalculation must be TaxExcluded or NotApplicable',
    );
  const finite = (value: number, label: string) => {
    if (!Number.isFinite(value) || value < 0)
      throw new Error(
        `QuickBooks ${label} must be a finite non-negative amount`,
      );
    return value;
  };
  const reference = (value: string | undefined, label: string) => {
    if (!value || value.trim() !== value || value.length > 255)
      throw new Error(
        `QuickBooks ${label} must be a non-empty realm reference`,
      );
    return { value };
  };
  finite(invoice.subtotal, 'subtotal');
  finite(invoice.taxAmount, 'tax amount');
  finite(invoice.totalAmount, 'total amount');
  if (invoice.lineItems.length === 0)
    throw new Error('QuickBooks invoices require at least one sales line');
  const close = (a: number, b: number) =>
    Math.abs(a - b) <=
    Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)) * 8;
  const lines = invoice.lineItems.map((item, idx) => {
    if (item.discount !== undefined && item.discount !== 0)
      throw new Error(
        'QuickBooks line discounts are not supported; record an explicit supported sales line instead',
      );
    if (item.taxRate !== undefined && item.taxRate !== 0)
      throw new Error(
        'QuickBooks numeric taxRate is not supported; use a realm taxCodeRef',
      );
    if (item.taxCode !== undefined)
      throw new Error(
        'QuickBooks generic taxCode is not a realm tax reference; use quickbooksMapping.taxCodeRef',
      );
    finite(item.quantity, `line ${idx + 1} quantity`);
    finite(item.unitPrice, `line ${idx + 1} unit price`);
    const amount = finite(
      item.amount ?? item.quantity * item.unitPrice,
      `line ${idx + 1} amount`,
    );
    if (!close(amount, item.quantity * item.unitPrice))
      throw new Error(
        `QuickBooks line ${idx + 1} amount must equal quantity times unit price`,
      );
    return {
      LineNum: idx + 1,
      Description: item.description,
      Amount: amount,
      DetailType: 'SalesItemLineDetail' as const,
      SalesItemLineDetail: {
        Qty: item.quantity,
        UnitPrice: item.unitPrice,
        ItemRef: item.quickbooksMapping
          ? reference(item.quickbooksMapping.itemRef, `line ${idx + 1} itemRef`)
          : undefined,
        TaxCodeRef: item.quickbooksMapping
          ? reference(
              item.quickbooksMapping.taxCodeRef,
              `line ${idx + 1} taxCodeRef`,
            )
          : undefined,
      },
    };
  });
  // Compensated summation limits accumulated binary floating-point error
  // without assuming a currency-specific number of decimal places.
  let mappedSubtotal = 0;
  let compensation = 0;
  for (const line of lines) {
    const adjusted = line.Amount - compensation;
    const next = mappedSubtotal + adjusted;
    compensation = next - mappedSubtotal - adjusted;
    mappedSubtotal = next;
  }
  if (!close(mappedSubtotal, invoice.subtotal))
    throw new Error('QuickBooks line amounts must equal the invoice subtotal');
  if (!close(invoice.subtotal + invoice.taxAmount, invoice.totalAmount))
    throw new Error(
      'QuickBooks subtotal plus tax must equal the invoice total',
    );
  const hasLineMapping = invoice.lineItems.some(
    (item) => item.quickbooksMapping,
  );
  if ((invoice.taxAmount > 0 || hasLineMapping) && !invoice.quickbooksMapping)
    throw new Error(
      'QuickBooks mapped or nonzero-tax invoices require explicit globalTaxCalculation',
    );
  if (
    invoice.quickbooksMapping &&
    invoice.lineItems.some((item) => !item.quickbooksMapping)
  )
    throw new Error(
      'QuickBooks mapped invoices require itemRef and taxCodeRef on every line',
    );
  if (
    invoice.taxAmount > 0 &&
    invoice.quickbooksMapping?.globalTaxCalculation === 'NotApplicable'
  )
    throw new Error(
      'QuickBooks nonzero tax cannot use NotApplicable global tax calculation',
    );
  return {
    CustomerRef: { value: invoice.customerExternalId || invoice.customerId },
    DocNumber: invoice.invoiceNumber,
    TxnDate: formatLocalDate(invoice.issueDate),
    DueDate: formatLocalDate(invoice.dueDate),
    Line: lines,
    GlobalTaxCalculation: invoice.quickbooksMapping?.globalTaxCalculation,
    TxnTaxDetail: invoice.quickbooksMapping
      ? { TotalTax: invoice.taxAmount }
      : undefined,
    CurrencyRef: invoice.currency ? { value: invoice.currency } : undefined,
    CustomerMemo: invoice.memo ? { value: invoice.memo } : undefined,
  };
}
