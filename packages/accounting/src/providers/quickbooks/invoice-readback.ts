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
  const response = await provider.request<{ Invoice?: InvoiceRecord }>(
    'GET',
    `invoice/${encodeURIComponent(invoiceId)}`,
  );
  const invoice = response?.Invoice;
  if (!invoice || invoice.Id !== invoiceId) fail('invoice not returned');
  if (invoice.status === 'Deleted') fail('invoice is deleted');

  // QuickBooks omits CurrencyRef on home-currency transactions.
  const currency =
    typeof invoice.CurrencyRef?.value === 'string' && invoice.CurrencyRef.value
      ? invoice.CurrencyRef.value
      : await provider.homeCurrency();
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

    const paymentResponse = await provider.request<{ Payment?: PaymentRecord }>(
      'GET',
      `payment/${encodeURIComponent(linkedId)}`,
    );
    const payment = paymentResponse?.Payment;
    if (!payment || payment.Id !== linkedId)
      fail('linked payment not returned');

    let applied = 0;
    let credits = false;
    for (const line of payment.Line ?? []) {
      const links = line.LinkedTxn ?? [];
      for (const l of links) {
        // Only invoices and credit memos may appear on a payment line; a
        // journal entry or anything else cannot be attributed safely.
        if (l.TxnType !== 'Invoice' && l.TxnType !== 'CreditMemo')
          fail('unsupported transaction linked to payment');
        if (l.TxnType === 'CreditMemo') credits = true;
      }
      if (links.some((l) => l.TxnType === 'Invoice' && l.TxnId === invoiceId)) {
        applied += minor(line.Amount, currency, 'applied amount');
        if (!Number.isSafeInteger(applied)) fail('applied amount overflow');
      }
    }
    // A voided payment keeps its link but applies nothing.
    if (applied === 0) continue;
    // A zero-total payment settles the invoice with a non-cash source.
    const nonCash = payment.TotalAmt === 0;
    if (credits && !nonCash) fail('payment mixes cash and credit');
    transactions.push({
      id: linkedId,
      kind: nonCash ? 'credit' : 'payment',
      amountMinor: applied,
    });
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
