/** Exact, explicit receivable reclassification. No sales, tax or bank-transfer approximation. */
import { createHash } from 'node:crypto';
import { currencyMinorUnitFactor, isCurrencyMinorUnit } from './line-amount.js';

export interface QuickBooksReceivableMapping {
  realmId: string;
  environment: 'sandbox' | 'production';
  version: string;
  reviewEvidenceRef: string;
  accountingBasis: 'accrual';
  taxTiming: 'invoice-tax-point';
  releaseDueDates: 'host-managed';
  currency: string;
  customerRef: string;
  receivablesAccountRef: string;
  retainedAssetAccountRef: string;
  cashAccountRef: string | null;
}
export interface QuickBooksReceivableSource {
  type: 'Invoice' | 'CreditMemo' | 'JournalEntry';
  id: string;
  customerRef: string;
  /** Immutable host snapshot/agreement/release reference, never a guessed provider field. */
  evidenceRef: string;
}
interface TransferEvidence {
  mapping: QuickBooksReceivableMapping;
  source: QuickBooksReceivableSource;
  requestId: string;
  effectiveOn: string;
  evidenceRef: string;
}
export interface QuickBooksReceivableTransferInput extends TransferEvidence {
  kind: 'withhold' | 'release' | 'cash-refund' | 'reverse-cash-refund';
  amountMinor: number;
}
export interface QuickBooksNonCashApplicationInput extends TransferEvidence {
  kind: 'application';
  amountMinor: number;
  debit: { type: 'Invoice' | 'JournalEntry'; id: string };
  credit: { type: 'CreditMemo' | 'JournalEntry'; id: string };
}
export type QuickBooksReceivableInput =
  | QuickBooksReceivableTransferInput
  | QuickBooksNonCashApplicationInput;
export interface QuickBooksReceivableRequest {
  version: 1;
  endpoint: 'journalentry' | 'payment';
  realmId: string;
  environment: 'sandbox' | 'production';
  requestId: string;
  payloadHash: string;
  input: QuickBooksReceivableInput;
}
export interface QuickBooksReceivableReadback {
  externalId: string;
  syncToken: string;
  kind: QuickBooksReceivableInput['kind'];
  customerRef: string;
  currency: string;
  effectiveOn: string;
  amountMinor: number;
  /** Noncash application amount is never counted as a customer cash receipt. */
  nonCashAppliedMinor: number;
  /** A cash journal is a record, not evidence of provider bank settlement. */
  recordedCashChangeMinor: number;
  providerProcessedCashMinor: 0;
  bankSettlementVerified: false;
  source: QuickBooksReceivableSource;
  payloadHash: string;
}
export interface QuickBooksReceivableTransferOperations {
  verifyMapping(
    mapping: QuickBooksReceivableMapping,
  ): Promise<{ mappingHash: string; homeCurrency: string }>;
  execute(
    request: QuickBooksReceivableRequest,
  ): Promise<QuickBooksReceivableReadback>;
  /** Reconcile a known remote ID against the complete prepared contract, not just its total. */
  read(
    request: QuickBooksReceivableRequest,
    externalId: string,
  ): Promise<QuickBooksReceivableReadback>;
}

const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function text(
  value: unknown,
  label: string,
  max = 1000,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    value !== value.trim() ||
    value.length > max
  )
    throw new Error(`${label} must be explicit trimmed text`);
}
function id(value: unknown, label: string): asserts value is string {
  text(value, label, 100);
  if (!/^[A-Za-z0-9._-]+$/.test(value))
    throw new Error(`${label} is not a supported provider reference`);
}
function date(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new Error('Receivable effective date is invalid');
}
function minor(value: number, currency: string): number {
  const factor = currencyMinorUnitFactor(currency);
  if (!factor || !Number.isSafeInteger(value) || value <= 0)
    throw new Error(
      'Receivable amount must be positive safe integer currency minor units',
    );
  const major = value / factor;
  if (
    !isCurrencyMinorUnit(major, currency) ||
    Math.round(major * factor) !== value
  )
    throw new Error(
      'Receivable amount cannot be represented exactly by the provider',
    );
  return major;
}
export function validateQuickBooksReceivableMapping(
  mapping: QuickBooksReceivableMapping,
) {
  id(mapping.realmId, 'Realm');
  id(mapping.customerRef, 'Customer');
  text(mapping.version, 'Mapping version');
  text(mapping.reviewEvidenceRef, 'Mapping review evidence');
  if (
    !['sandbox', 'production'].includes(mapping.environment) ||
    mapping.accountingBasis !== 'accrual' ||
    mapping.taxTiming !== 'invoice-tax-point' ||
    mapping.releaseDueDates !== 'host-managed'
  )
    throw new Error(
      'Receivable transfers support explicit accrual, invoice-tax-point and host-managed release due dates only',
    );
  if (
    !/^[A-Z]{3}$/.test(mapping.currency) ||
    !currencyMinorUnitFactor(mapping.currency)
  )
    throw new Error('Unsupported receivable currency');
  const refs = [
    mapping.receivablesAccountRef,
    mapping.retainedAssetAccountRef,
    ...(mapping.cashAccountRef === null ? [] : [mapping.cashAccountRef]),
  ];
  for (const ref of refs) id(ref, 'Posting account');
  if (new Set(refs).size !== refs.length)
    throw new Error('Receivable posting accounts must be distinct');
}
function validate(input: QuickBooksReceivableInput) {
  validateQuickBooksReceivableMapping(input.mapping);
  id(input.requestId, 'Request');
  if (input.requestId.length > 50)
    throw new Error('QuickBooks requestId must contain at most 50 characters');
  date(input.effectiveOn);
  text(input.evidenceRef, 'Operation evidence', 1000);
  if (!['Invoice', 'CreditMemo', 'JournalEntry'].includes(input.source.type))
    throw new Error('Unsupported source transaction type');
  id(input.source.id, 'Source transaction');
  id(input.source.customerRef, 'Source customer');
  text(input.source.evidenceRef, 'Source evidence');
  if (input.source.customerRef !== input.mapping.customerRef)
    throw new Error('Source customer differs from receivable mapping');
  minor(input.amountMinor, input.mapping.currency);
  if (input.kind === 'application') {
    if (
      !['Invoice', 'JournalEntry'].includes(input.debit.type) ||
      !['CreditMemo', 'JournalEntry'].includes(input.credit.type)
    )
      throw new Error('Unsupported noncash application transaction types');
    id(input.debit.id, 'Debit transaction');
    id(input.credit.id, 'Credit transaction');
    if (
      input.debit.type === input.credit.type &&
      input.debit.id === input.credit.id
    )
      throw new Error('Cannot apply a journal to itself');
  } else if (
    !['withhold', 'release', 'cash-refund', 'reverse-cash-refund'].includes(
      input.kind,
    )
  )
    throw new Error('Unsupported receivable transfer direction');
  else if (input.kind.includes('cash-refund') && !input.mapping.cashAccountRef)
    throw new Error('Cash refund recording requires an explicit cash account');
}
export function mapQuickBooksReceivableRequest(
  input: QuickBooksReceivableInput,
): Record<string, unknown> {
  validate(input);
  const amount = minor(input.amountMinor, input.mapping.currency);
  const source = `${input.source.type}:${input.source.id}; customer:${input.source.customerRef}; evidence:${input.source.evidenceRef}`;
  const note = `${input.kind}; ${source}; operation:${input.evidenceRef}; mapping:${input.mapping.version}; request:${input.requestId}`;
  if (note.length > 4000)
    throw new Error('Receivable provenance exceeds the provider note limit');
  const base = {
    TxnDate: input.effectiveOn,
    CurrencyRef: { value: input.mapping.currency },
    PrivateNote: note,
  };
  if (input.kind === 'application')
    return {
      ...base,
      CustomerRef: { value: input.mapping.customerRef },
      TotalAmt: 0,
      ProcessPayment: false,
      Line: [input.debit, input.credit].map((ref) => ({
        Amount: amount,
        LinkedTxn: [{ TxnType: ref.type, TxnId: ref.id }],
      })),
    };
  const arDebit = input.kind === 'release' || input.kind === 'cash-refund';
  const counterpart = input.kind.includes('cash-refund')
    ? input.mapping.cashAccountRef
    : input.mapping.retainedAssetAccountRef;
  return {
    ...base,
    Line: [
      { account: input.mapping.receivablesAccountRef, debit: arDebit },
      { account: counterpart, debit: !arDebit },
    ].map((line, index) => ({
      LineNum: index + 1,
      Description: source,
      Amount: amount,
      DetailType: 'JournalEntryLineDetail',
      JournalEntryLineDetail: {
        PostingType: line.debit ? 'Debit' : 'Credit',
        AccountRef: { value: line.account },
        Entity: {
          Type: 'Customer',
          EntityRef: { value: input.mapping.customerRef },
        },
      },
    })),
  };
}
/** Pure preparation. Persist before sending; the hash does not prove a remote write occurred once. */
export function prepareQuickBooksReceivableRequest(
  input: QuickBooksReceivableInput,
): QuickBooksReceivableRequest {
  const frozenInput = structuredClone(input),
    body = mapQuickBooksReceivableRequest(frozenInput);
  return Object.freeze({
    version: 1,
    endpoint: input.kind === 'application' ? 'payment' : 'journalentry',
    realmId: input.mapping.realmId,
    environment: input.mapping.environment,
    requestId: input.requestId,
    payloadHash: hash({ input: frozenInput, body }),
    input: frozenInput,
  });
}
export function validateQuickBooksReceivableRequest(
  request: QuickBooksReceivableRequest,
  realmId: string,
  environment: string,
  serializedBody?: string,
) {
  const expected = prepareQuickBooksReceivableRequest(request.input);
  if (
    request.version !== 1 ||
    request.realmId !== realmId ||
    request.environment !== environment ||
    request.endpoint !== expected.endpoint ||
    request.requestId !== expected.requestId ||
    request.payloadHash !== expected.payloadHash ||
    request.realmId !== expected.realmId ||
    request.environment !== expected.environment ||
    (serializedBody !== undefined &&
      serializedBody !==
        JSON.stringify(mapQuickBooksReceivableRequest(request.input)))
  )
    throw new Error(
      'Receivable request scope, provenance or frozen payload changed',
    );
}

/** Exact readback validation; provider-added IDs/names are allowed, omitted financial facts are not. */
export function reconcileQuickBooksReceivableRecord(
  request: QuickBooksReceivableRequest,
  value: unknown,
): QuickBooksReceivableReadback {
  validateQuickBooksReceivableRequest(
    request,
    request.realmId,
    request.environment,
  );
  const raw = value as Record<string, any>,
    expected = mapQuickBooksReceivableRequest(request.input),
    input = request.input;
  if (!raw || typeof raw !== 'object')
    throw new Error('Receivable provider record is missing');
  id(raw.Id, 'Provider record');
  text(raw.SyncToken, 'Provider sync token', 100);
  if (
    raw.TxnDate !== expected.TxnDate ||
    raw.CurrencyRef?.value !== input.mapping.currency ||
    raw.PrivateNote !== expected.PrivateNote ||
    !Array.isArray(raw.Line) ||
    raw.Line.length !== 2
  )
    throw new Error(
      'Receivable provider identity, currency, date or evidence differs',
    );
  if (
    (raw.ExchangeRate !== undefined && raw.ExchangeRate !== 1) ||
    (raw.TxnTaxDetail !== undefined && raw.TxnTaxDetail?.TotalTax !== 0)
  )
    throw new Error(
      'Receivable readback contains unsupported exchange or tax effects',
    );
  const expectedLines = expected.Line as Record<string, any>[];
  for (let i = 0; i < 2; i++) {
    const line = raw.Line[i],
      wanted = expectedLines[i];
    if (line.Amount !== wanted.Amount)
      throw new Error('Receivable provider line amount differs');
    if (input.kind === 'application') {
      if (
        !Array.isArray(line.LinkedTxn) ||
        line.LinkedTxn.length !== 1 ||
        line.LinkedTxn[0].TxnType !== wanted.LinkedTxn[0].TxnType ||
        line.LinkedTxn[0].TxnId !== wanted.LinkedTxn[0].TxnId
      )
        throw new Error('Receivable application linkage differs');
    } else {
      const details = line.JournalEntryLineDetail,
        required = wanted.JournalEntryLineDetail;
      if (
        line.DetailType !== 'JournalEntryLineDetail' ||
        line.Description !== wanted.Description ||
        details?.PostingType !== required.PostingType ||
        details?.AccountRef?.value !== required.AccountRef.value ||
        details?.Entity?.Type !== 'Customer' ||
        details?.Entity?.EntityRef?.value !== input.mapping.customerRef ||
        details?.TaxAmount !== undefined ||
        details?.TaxCodeRef !== undefined
      )
        throw new Error('Receivable journal posting authority differs');
    }
  }
  if (
    input.kind === 'application' &&
    (raw.TotalAmt !== 0 ||
      raw.UnappliedAmt !== 0 ||
      raw.CustomerRef?.value !== input.mapping.customerRef ||
      raw.ProcessPayment === true)
  )
    throw new Error(
      'Noncash application must have zero cash and no unapplied balance',
    );
  return {
    externalId: raw.Id,
    syncToken: raw.SyncToken,
    kind: input.kind,
    customerRef: input.mapping.customerRef,
    currency: input.mapping.currency,
    effectiveOn: input.effectiveOn,
    amountMinor: input.amountMinor,
    nonCashAppliedMinor: input.kind === 'application' ? input.amountMinor : 0,
    recordedCashChangeMinor:
      input.kind === 'cash-refund'
        ? -input.amountMinor
        : input.kind === 'reverse-cash-refund'
          ? input.amountMinor
          : 0,
    providerProcessedCashMinor: 0,
    bankSettlementVerified: false,
    source: structuredClone(input.source),
    payloadHash: request.payloadHash,
  };
}
