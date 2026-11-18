import {
  AccountingReauthRequiredError,
  QuickBooksOAuthError,
} from '../../errors.js';
import type {
  QuickBooksInvoiceReadback,
  QuickBooksInvoiceReadbackTransaction,
} from '../../types.js';
import { currencyMinorUnitFactor, isCurrencyMinorUnit } from './line-amount.js';

/** The slice of the provider this read needs. */
export interface QuickBooksReadbackTransport {
  readonly realmId: string;
  readonly environment: 'sandbox' | 'production';
  request<T>(method: 'GET', endpoint: string): Promise<T>;
  homeCurrency(): Promise<string>;
}

interface LinkedTxn {
  TxnId?: unknown;
  TxnType?: unknown;
}
interface InvoiceRecord {
  Id?: unknown;
  status?: unknown;
  TxnStatus?: unknown;
  PrivateNote?: unknown;
  TotalAmt?: unknown;
  Balance?: unknown;
  DueDate?: unknown;
  CustomerRef?: { value?: unknown };
  CurrencyRef?: { value?: unknown };
  TxnTaxDetail?: { TotalTax?: unknown };
  Line?: { Amount?: unknown; DetailType?: unknown }[];
  LinkedTxn?: LinkedTxn[];
}
interface PaymentRecord {
  Id?: unknown;
  TotalAmt?: unknown;
  Line?: { Amount?: unknown; LinkedTxn?: LinkedTxn[] }[];
}

// Never put provider payloads into a thrown error.
function fail(reason: string): never {
  throw new Error(`QuickBooks invoice readback failed: ${reason}`);
}

/**
 * Wrap every provider read so a transport failure never carries a response
 * body, header or token; only typed auth errors and the HTTP status survive.
 */
async function sanitized<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (
      error instanceof AccountingReauthRequiredError ||
      error instanceof QuickBooksOAuthError
    )
      throw error;
    const status =
      error instanceof Error
        ? /^QBO API error \((\d{3})\)/.exec(error.message)?.[1]
        : undefined;
    return fail(
      status ? `provider read failed (HTTP ${status})` : 'provider read failed',
    );
  }
}

/** Link types that carry no money against the invoice. */
const NON_MONETARY_LINKS = new Set([
  'CreditMemo', // applied through a Payment, which is counted below
  'Estimate',
  'SalesOrder',
  'TimeActivity',
  'ReimburseCharge',
  'Charge',
]);

function minor(value: unknown, currency: string, what: string): number {
  if (typeof value !== 'number' || !isCurrencyMinorUnit(value, currency))
    fail(`${what} is not an exact ${currency} amount`);
  const factor = currencyMinorUnitFactor(currency) as number;
  const result = Math.round((value as number) * factor);
  if (!Number.isSafeInteger(result)) fail(`${what} exceeds safe minor units`);
  return result;
}

function id(value: unknown, what: string): string {
  if (typeof value !== 'string' || !value || value.trim() !== value)
    fail(`${what} is missing`);
  return value as string;
}

/**
 * Read one invoice with its balance, void state and the exact amount each
 * linked payment or credit application applies to it.
 */
export async function readQuickBooksInvoice(
  provider: QuickBooksReadbackTransport,
  externalId: string,
): Promise<QuickBooksInvoiceReadback> {
  const invoiceId = id(externalId, 'invoice id');
  const response = await sanitized(() =>
    provider.request<{ Invoice?: InvoiceRecord }>(
      'GET',
      `invoice/${encodeURIComponent(invoiceId)}`,
    ),
  );
  const invoice = response?.Invoice;
  if (!invoice || invoice.Id !== invoiceId) fail('invoice not returned');
  if (invoice.status === 'Deleted') fail('invoice is deleted');

  // QuickBooks omits CurrencyRef on home-currency transactions.
  const currency =
    typeof invoice.CurrencyRef?.value === 'string' && invoice.CurrencyRef.value
      ? invoice.CurrencyRef.value
      : await sanitized(() => provider.homeCurrency());
  const totalMinor = minor(invoice.TotalAmt, currency, 'total');
  const balanceMinor = minor(invoice.Balance, currency, 'balance');
  const taxMinor = minor(invoice.TxnTaxDetail?.TotalTax ?? 0, currency, 'tax');

  let subtotal: number | undefined;
  let salesTotal = 0;
  let discountMinor = 0;
  for (const line of invoice.Line ?? []) {
    if (line.DetailType === 'SubTotalLineDetail')
      subtotal = minor(line.Amount, currency, 'subtotal');
    else if (line.DetailType === 'SalesItemLineDetail')
      salesTotal += minor(line.Amount, currency, 'line amount');
    else if (line.DetailType === 'DiscountLineDetail')
      discountMinor += minor(line.Amount, currency, 'discount');
  }

  const voided =
    invoice.TxnStatus === 'Voided' ||
    (typeof invoice.PrivateNote === 'string' &&
      /^voided/i.test(invoice.PrivateNote) &&
      totalMinor === 0 &&
      balanceMinor === 0);

  const transactions: QuickBooksInvoiceReadbackTransaction[] = [];
  const seen = new Set<string>();
  for (const link of invoice.LinkedTxn ?? []) {
    const type = id(link?.TxnType, 'linked transaction type');
    const linkedId = id(link.TxnId, 'linked transaction id');
    if (type !== 'Payment') {
      if (!NON_MONETARY_LINKS.has(type))
        fail('unrecognized linked transaction');
      continue;
    }
    if (seen.has(linkedId)) continue;
    seen.add(linkedId);

    const paymentResponse = await sanitized(() =>
      provider.request<{ Payment?: PaymentRecord }>(
        'GET',
        `payment/${encodeURIComponent(linkedId)}`,
      ),
    );
    const payment = paymentResponse?.Payment;
    if (!payment || payment.Id !== linkedId)
      fail('linked payment not returned');

    let applied = 0;
    let creditLines = 0;
    for (const line of payment.Line ?? []) {
      const links = line.LinkedTxn ?? [];
      for (const l of links) {
        // Only invoices and credit memos may appear on a payment line; a
        // journal entry or anything else cannot be attributed safely.
        if (l.TxnType !== 'Invoice' && l.TxnType !== 'CreditMemo')
          fail('unsupported transaction linked to payment');
      }
      if (links.some((l) => l.TxnType === 'CreditMemo'))
        creditLines += minor(line.Amount, currency, 'credit amount');
      if (links.some((l) => l.TxnType === 'Invoice' && l.TxnId === invoiceId)) {
        applied += minor(line.Amount, currency, 'applied amount');
        if (!Number.isSafeInteger(applied)) fail('applied amount overflow');
      }
    }
    // A voided payment keeps its link but applies nothing.
    if (applied === 0) continue;
    const total = payment.TotalAmt;
    if (typeof total !== 'number') fail('linked payment has no total');
    let kind: 'payment' | 'credit';
    if (creditLines > 0) {
      // Credit application is a zero-total payment whose credit-memo lines
      // fund every invoice line; cash mixed with credit cannot be split.
      if (total !== 0) fail('payment mixes cash and credit');
      const invoiced = (payment.Line ?? []).reduce(
        (sum, line) =>
          line.LinkedTxn?.some((l) => l.TxnType === 'Invoice')
            ? sum + minor(line.Amount, currency, 'applied amount')
            : sum,
        0,
      );
      if (invoiced !== creditLines)
        fail('credit lines disagree with applications');
      kind = 'credit';
    } else {
      // A zero-total payment with no verifiable funding source (for example a
      // journal-entry application whose link is absent) is not cash.
      if (total <= 0) fail('payment funding cannot be verified');
      kind = 'payment';
    }
    transactions.push({ id: linkedId, kind, amountMinor: applied });
  }

  // Deposits and other provider-side reductions are not linked transactions;
  // an unexplained balance must never read as complete.
  const settled = transactions.reduce((sum, t) => sum + t.amountMinor, 0);
  if (!voided && totalMinor - balanceMinor !== settled)
    fail('balance disagrees with linked transactions');

  return {
    realmId: provider.realmId,
    environment: provider.environment,
    externalId: invoiceId,
    customerExternalId: id(invoice.CustomerRef?.value, 'customer'),
    currency,
    subtotalMinor: subtotal ?? salesTotal,
    discountMinor,
    taxMinor,
    totalMinor,
    dueDate:
      typeof invoice.DueDate === 'string' && invoice.DueDate
        ? invoice.DueDate
        : null,
    balanceMinor,
    voided,
    complete: true,
    transactions,
  };
}
