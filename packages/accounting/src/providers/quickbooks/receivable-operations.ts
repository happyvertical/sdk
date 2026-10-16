import { createHash } from 'node:crypto';
import type { QuickBooksProvider } from './index.js';
import { currencyMinorUnitFactor, isCurrencyMinorUnit } from './line-amount.js';
import {
  mapQuickBooksReceivableRequest,
  type QuickBooksReceivableMapping,
  type QuickBooksReceivableReadback,
  type QuickBooksReceivableRequest,
  type QuickBooksReceivableTransferOperations,
  reconcileQuickBooksReceivableRecord,
  validateQuickBooksReceivableMapping,
  validateQuickBooksReceivableRequest,
} from './receivable-transfer.js';

type ProviderRecord = Record<string, any>;
/** Each operation is separately durable in the host. This class does not pretend QBO supports a saga transaction. */
export class QuickBooksReceivableTransfers
  implements QuickBooksReceivableTransferOperations
{
  constructor(private provider: QuickBooksProvider) {}
  private assertScope(mapping: QuickBooksReceivableMapping) {
    validateQuickBooksReceivableMapping(mapping);
    if (
      mapping.realmId !== this.provider.realmId ||
      mapping.environment !== this.provider.environment
    )
      throw new Error(
        'Receivable mapping belongs to another provider realm or environment',
      );
  }
  private async entity(type: string, id: string): Promise<ProviderRecord> {
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(id))
      throw new Error('Unsupported provider entity reference');
    const result = await this.provider.request<Record<string, ProviderRecord>>(
      'GET',
      `${type.toLowerCase()}/${encodeURIComponent(id)}`,
    );
    const value = result[type];
    if (!value || value.Id !== id)
      throw new Error(`Provider ${type} identity differs`);
    return value;
  }
  async verifyMapping(mapping: QuickBooksReceivableMapping) {
    this.assertScope(mapping);
    const prefs = await this.provider.request<{ Preferences?: ProviderRecord }>(
      'GET',
      'preferences',
    );
    const currencies = prefs.Preferences?.CurrencyPrefs;
    if (
      currencies?.HomeCurrency?.value !== mapping.currency ||
      typeof currencies?.MultiCurrencyEnabled !== 'boolean'
    )
      throw new Error(
        'Receivable transfers require verified home currency; foreign exchange is unsupported',
      );
    const customer = await this.entity('Customer', mapping.customerRef);
    if (
      customer.Active !== true ||
      (customer.CurrencyRef?.value ??
        (currencies.MultiCurrencyEnabled === false
          ? mapping.currency
          : undefined)) !== mapping.currency
    )
      throw new Error(
        'Receivable customer must be active and use the verified home currency',
      );
    for (const [ref, type] of [
      [mapping.receivablesAccountRef, 'Accounts Receivable'],
      [mapping.retainedAssetAccountRef, 'Other Current Asset'],
      ...(mapping.cashAccountRef ? [[mapping.cashAccountRef, 'Bank']] : []),
    ]) {
      const account = await this.entity('Account', ref);
      if (
        account.Active !== true ||
        account.AccountType !== type ||
        (account.CurrencyRef !== undefined &&
          account.CurrencyRef?.value !== mapping.currency)
      )
        throw new Error(
          'Receivable account type, activity or currency differs from the reviewed mapping',
        );
    }
    return {
      mappingHash: createHash('sha256')
        .update(JSON.stringify(mapping))
        .digest('hex'),
      homeCurrency: mapping.currency,
    };
  }
  private currency(
    record: ProviderRecord,
    mapping: QuickBooksReceivableMapping,
  ) {
    if (record.CurrencyRef?.value !== mapping.currency)
      throw new Error('Provider transaction currency differs');
  }
  private minor(amount: unknown, currency: string): number {
    if (typeof amount !== 'number' || !isCurrencyMinorUnit(amount, currency))
      throw new Error(
        'Provider amount is missing or outside the exact currency grid',
      );
    const value = Math.round(amount * currencyMinorUnitFactor(currency)!);
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error('Provider amount is outside supported safe minor units');
    return value;
  }
  private journalDirection(
    record: ProviderRecord,
    mapping: QuickBooksReceivableMapping,
  ): { kind: 'debit' | 'credit'; amountMinor: number } {
    this.currency(record, mapping);
    if (!Array.isArray(record.Line))
      throw new Error('Provider journal lines are missing');
    const ar = record.Line.filter(
      (line: ProviderRecord) =>
        line.JournalEntryLineDetail?.AccountRef?.value ===
        mapping.receivablesAccountRef,
    );
    if (ar.length !== 1)
      throw new Error(
        'Provider receivable journal needs exactly one reviewed AR line',
      );
    const detail = ar[0].JournalEntryLineDetail;
    if (
      detail.Entity?.Type !== 'Customer' ||
      detail.Entity?.EntityRef?.value !== mapping.customerRef ||
      !['Debit', 'Credit'].includes(detail.PostingType)
    )
      throw new Error('Provider journal customer or AR direction differs');
    return {
      kind: detail.PostingType === 'Debit' ? 'debit' : 'credit',
      amountMinor: this.minor(ar[0].Amount, mapping.currency),
    };
  }
  private async customerPayments(
    mapping: QuickBooksReceivableMapping,
  ): Promise<ProviderRecord[]> {
    const rows: ProviderRecord[] = [];
    // Complete pagination is mandatory for capacity; no ordinary list default cap may truncate it.
    for (let page = 0; page < 10000; page++) {
      const query = `SELECT * FROM Payment WHERE CustomerRef = '${mapping.customerRef}' STARTPOSITION ${page * 100 + 1} MAXRESULTS 100`;
      const result = await this.provider.request<{
        QueryResponse?: { Payment?: ProviderRecord[] };
      }>('GET', `query?query=${encodeURIComponent(query)}`);
      if (!result.QueryResponse)
        throw new Error('Provider payment query omitted its result');
      const batch = result.QueryResponse.Payment ?? [];
      if (!Array.isArray(batch))
        throw new Error('Provider payment query is malformed');
      rows.push(...batch);
      if (batch.length < 100) return rows;
    }
    throw new Error(
      'Complete provider payment history is required before receivable application',
    );
  }
  private async available(
    ref: { type: string; id: string },
    mapping: QuickBooksReceivableMapping,
    direction: 'debit' | 'credit',
  ) {
    const record = await this.entity(ref.type, ref.id);
    this.currency(record, mapping);
    if (ref.type !== 'JournalEntry') {
      if (record.CustomerRef?.value !== mapping.customerRef)
        throw new Error('Application transaction belongs to another customer');
      return this.minor(
        ref.type === 'Invoice' ? record.Balance : record.RemainingCredit,
        mapping.currency,
      );
    }
    const journal = this.journalDirection(record, mapping);
    if (journal.kind !== direction)
      throw new Error('Application journal has the wrong receivable direction');
    let used = 0n;
    for (const payment of await this.customerPayments(mapping)) {
      if (payment.CustomerRef?.value !== mapping.customerRef)
        throw new Error('Payment query crossed customer authority');
      for (const line of payment.Line ?? []) {
        const links = line.LinkedTxn ?? [];
        if (
          links.some(
            (link: ProviderRecord) =>
              link.TxnType === 'JournalEntry' && link.TxnId === ref.id,
          )
        ) {
          if (links.length !== 1)
            throw new Error(
              'Ambiguous multi-transaction payment allocation requires reconciliation',
            );
          this.currency(payment, mapping);
          used += BigInt(this.minor(line.Amount, mapping.currency));
        }
      }
    }
    const available = BigInt(journal.amountMinor) - used;
    if (available < 0n)
      throw new Error(
        'Provider journal is overapplied and requires reconciliation',
      );
    return Number(available);
  }
  private async preflight(request: QuickBooksReceivableRequest) {
    await this.verifyMapping(request.input.mapping);
    const input = request.input,
      source = await this.entity(input.source.type, input.source.id);
    this.currency(source, input.mapping);
    if (input.source.type === 'JournalEntry')
      this.journalDirection(source, input.mapping);
    else if (source.CustomerRef?.value !== input.mapping.customerRef)
      throw new Error(
        'Source provider transaction belongs to another customer',
      );
    if (input.kind === 'application') {
      const debit = await this.available(input.debit, input.mapping, 'debit'),
        credit = await this.available(input.credit, input.mapping, 'credit');
      if (input.amountMinor > debit || input.amountMinor > credit)
        throw new Error(
          'Noncash application exceeds current source debit or credit capacity',
        );
    }
  }
  async execute(
    request: QuickBooksReceivableRequest,
  ): Promise<QuickBooksReceivableReadback> {
    // Reconstruct and retain exact bytes before any asynchronous metadata lookup.
    const retained = structuredClone(request);
    validateQuickBooksReceivableRequest(
      retained,
      this.provider.realmId,
      this.provider.environment,
    );
    const body = mapQuickBooksReceivableRequest(retained.input);
    await this.preflight(retained);
    const response = await this.provider.request<
      Record<string, ProviderRecord>
    >('POST', retained.endpoint, body, retained);
    const type =
      retained.endpoint === 'journalentry' ? 'JournalEntry' : 'Payment';
    // A malformed success is unresolved, never a confirmed operation.
    return reconcileQuickBooksReceivableRecord(retained, response[type]);
  }
  async read(
    request: QuickBooksReceivableRequest,
    externalId: string,
  ): Promise<QuickBooksReceivableReadback> {
    const retained = structuredClone(request);
    validateQuickBooksReceivableRequest(
      retained,
      this.provider.realmId,
      this.provider.environment,
    );
    const type =
      retained.endpoint === 'journalentry' ? 'JournalEntry' : 'Payment';
    return reconcileQuickBooksReceivableRecord(
      retained,
      await this.entity(type, externalId),
    );
  }
}
