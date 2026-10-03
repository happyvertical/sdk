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
  return {
    CustomerRef: { value: invoice.customerExternalId || invoice.customerId },
    DocNumber: invoice.invoiceNumber,
    TxnDate: formatLocalDate(invoice.issueDate),
    DueDate: formatLocalDate(invoice.dueDate),
    Line: invoice.lineItems.map((item, idx) => ({
      LineNum: idx + 1,
      Description: item.description,
      Amount: item.amount ?? item.quantity * item.unitPrice,
      DetailType: 'SalesItemLineDetail' as const,
      SalesItemLineDetail: {
        Qty: item.quantity,
        UnitPrice: item.unitPrice,
      },
    })),
    CurrencyRef: invoice.currency ? { value: invoice.currency } : undefined,
    CustomerMemo: invoice.memo ? { value: invoice.memo } : undefined,
  };
}
