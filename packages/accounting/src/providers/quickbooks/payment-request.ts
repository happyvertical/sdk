import { createHash } from 'node:crypto';
import type {
  QuickBooksPaymentInput,
  QuickBooksPaymentRequest,
} from '../../types.js';
import { currencyMinorUnitFactor, isCurrencyMinorUnit } from './line-amount.js';

const REF = /^[A-Za-z0-9._-]{1,100}$/;

interface QuickBooksPaymentPayload {
  TotalAmt: number;
  CustomerRef: { value: string };
  DepositToAccountRef: { value: string };
  TxnDate: string;
  CurrencyRef: { value: string };
  PaymentRefNum?: string;
  PaymentMethodRef?: { value: string };
  PrivateNote?: string;
  Line: {
    Amount: number;
    LinkedTxn: { TxnId: string; TxnType: 'Invoice' }[];
  }[];
}

/** Amount in integer minor units, or throw when off the currency grid. */
export function paymentMinor(amount: number, currency: string): bigint {
  const factor = currencyMinorUnitFactor(currency);
  if (
    factor === undefined ||
    typeof amount !== 'number' ||
    !(amount > 0) ||
    !isCurrencyMinorUnit(amount, currency)
  )
    throw new Error(
      'QuickBooks payment amounts must be positive and exact in the currency minor unit',
    );
  return BigInt(Math.round(amount * factor));
}

function ref(value: unknown, label: string): string {
  if (typeof value !== 'string' || !REF.test(value))
    throw new Error(`QuickBooks payment ${label} is not a valid reference`);
  return value;
}

/** Validate a payment input and map it to the exact QBO payload. Performs no I/O. */
export function mapQuickBooksPayment(
  input: QuickBooksPaymentInput,
): QuickBooksPaymentPayload {
  const currency = input?.currency;
  if (
    typeof currency !== 'string' ||
    currencyMinorUnitFactor(currency) === undefined
  )
    throw new Error('QuickBooks payment requires a known ISO 4217 currency');
  const total = paymentMinor(input.amount, currency);
  if (
    typeof input.paidOn !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) ||
    new Date(`${input.paidOn}T00:00:00Z`).toISOString().slice(0, 10) !==
      input.paidOn
  )
    throw new Error('QuickBooks payment paidOn must be a real YYYY-MM-DD date');
  if (!Array.isArray(input.applications) || input.applications.length === 0)
    throw new Error('QuickBooks payment must apply to at least one invoice');
  const seen = new Set<string>();
  let applied = 0n;
  const lines = input.applications.map((application) => {
    const invoiceRef = ref(application?.invoiceRef, 'invoiceRef');
    if (seen.has(invoiceRef))
      throw new Error('QuickBooks payment applies to an invoice twice');
    seen.add(invoiceRef);
    applied += paymentMinor(application.amount, currency);
    return {
      Amount: application.amount,
      LinkedTxn: [{ TxnId: invoiceRef, TxnType: 'Invoice' as const }],
    };
  });
  if (applied !== total)
    throw new Error(
      'QuickBooks payment amount must equal the sum of its invoice applications',
    );
  if (
    input.reference !== undefined &&
    (typeof input.reference !== 'string' ||
      !input.reference.trim() ||
      input.reference.length > 21)
  )
    throw new Error('QuickBooks payment reference must be 1-21 characters');
  if (
    input.privateNote !== undefined &&
    (typeof input.privateNote !== 'string' || input.privateNote.length > 4000)
  )
    throw new Error('QuickBooks payment privateNote is too long');
  return {
    TotalAmt: input.amount,
    CustomerRef: { value: ref(input.customerRef, 'customerRef') },
    DepositToAccountRef: {
      value: ref(input.depositToAccountRef, 'depositToAccountRef'),
    },
    TxnDate: input.paidOn,
    CurrencyRef: { value: currency },
    ...(input.reference ? { PaymentRefNum: input.reference } : {}),
    ...(input.paymentMethodRef
      ? {
          PaymentMethodRef: {
            value: ref(input.paymentMethodRef, 'paymentMethodRef'),
          },
        }
      : {}),
    ...(input.privateNote ? { PrivateNote: input.privateNote } : {}),
    Line: lines,
  };
}

function hash(payload: string): string {
  return createHash('sha256').update(payload).digest('hex');
}

/** Prepare once, persist before sending, and reuse unchanged. Performs no I/O. */
export function prepareQuickBooksPaymentRequest(
  input: QuickBooksPaymentInput,
  identity: Omit<QuickBooksPaymentRequest, 'payloadHash'>,
): QuickBooksPaymentRequest {
  const payload = JSON.stringify(mapQuickBooksPayment(input));
  const request: QuickBooksPaymentRequest = {
    ...identity,
    payloadHash: hash(payload),
  };
  validateQuickBooksPaymentRequest(
    request,
    identity.realmId,
    identity.environment,
    payload,
  );
  return Object.freeze(request);
}

export function validateQuickBooksPaymentRequest(
  request: QuickBooksPaymentRequest,
  realmId: string,
  environment: 'sandbox' | 'production',
  payload: string | undefined,
): void {
  if (
    !request ||
    typeof request.requestId !== 'string' ||
    !/^[A-Za-z0-9._-]{1,50}$/.test(request.requestId)
  )
    throw new Error(
      'QuickBooks requestId must contain 1–50 URL-safe letters, digits, dots, underscores or hyphens',
    );
  if (
    !request.realmId ||
    request.realmId !== realmId ||
    !['sandbox', 'production'].includes(request.environment) ||
    request.environment !== environment
  )
    throw new Error('QuickBooks payment request realm/environment mismatch');
  if (!payload || request.payloadHash !== hash(payload))
    throw new Error(
      'QuickBooks payment request payload mismatch; reconcile the original request',
    );
}
