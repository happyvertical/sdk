import type { DatabaseInterface } from '@happyvertical/sql';
import {
  CustodyError,
  type CustodyEvent,
  type CustodyLedger,
  type CustodyReceipt,
  InMemoryCustodyLedger,
  redactCredentialText,
} from '../shared/custody.js';
import { validateCustodySnapshot } from '../shared/custody-schema.js';

interface Snapshot {
  schema: 1;
  receipts: CustodyReceipt[];
  events: CustodyEvent[];
}

/**
 * Durable runtime metadata ledger. Validated with the SDK SQLite adapter.
 * Use secureFile trusted-parent acquisition beneath a private runtime directory.
 * The supplied database remains owned by the caller. No credential is stored.
 */
export class DatabaseCustodyLedger implements CustodyLedger {
  readonly #db: DatabaseInterface;
  readonly #ledgerId: string;
  #initialized = false;

  constructor(options: { db: DatabaseInterface; ledgerId?: string }) {
    this.#db = options.db;
    this.#ledgerId = options.ledgerId ?? 'default';
    if (
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(this.#ledgerId) ||
      redactCredentialText(this.#ledgerId) !== this.#ledgerId
    ) {
      throw new CustodyError(
        'INVALID_CUSTODY_LEDGER_ID',
        'record',
        'Ledger ID must be a non-secret identifier',
      );
    }
  }

  async initialize(): Promise<void> {
    if (this.#initialized) return;
    if (!this.#db.transaction) {
      throw new CustodyError(
        'CUSTODY_LEDGER_TRANSACTIONS_REQUIRED',
        'record',
        'Custody ledger requires database transactions',
      );
    }
    await this.#db.query(`CREATE TABLE IF NOT EXISTS custody_ledger_state (
      ledger_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      payload TEXT NOT NULL
    )`);
    await this.#db.query(
      'INSERT INTO custody_ledger_state (ledger_id, revision, payload) VALUES (?, ?, ?) ON CONFLICT (ledger_id) DO NOTHING',
      this.#ledgerId,
      0,
      JSON.stringify({ schema: 1, receipts: [], events: [] }),
    );
    // Existing state must be readable before initialization can succeed.
    await this.#load(this.#db);
    this.#initialized = true;
  }

  async #load(
    db: DatabaseInterface,
  ): Promise<{ ledger: InMemoryCustodyLedger; revision: number }> {
    const result = await db.query(
      'SELECT revision, payload FROM custody_ledger_state WHERE ledger_id = ?',
      this.#ledgerId,
    );
    const row = result.rows[0];
    if (
      !row ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 0 ||
      typeof row.payload !== 'string'
    ) {
      throw new CustodyError(
        'INVALID_CUSTODY_LEDGER_STATE',
        'record',
        'Custody ledger state is invalid',
      );
    }
    let state: Snapshot;
    try {
      state = validateCustodySnapshot(JSON.parse(row.payload));
    } catch {
      throw new CustodyError(
        'INVALID_CUSTODY_LEDGER_STATE',
        'record',
        'Custody ledger state is invalid',
      );
    }
    const ledger = new InMemoryCustodyLedger();
    const receipts = new Map(
      state.receipts.map((receipt) => [receipt.receiptId, receipt]),
    );
    try {
      for (const event of state.events) {
        if (event.type === 'finalization-pending') {
          const receipt = event.receiptId
            ? receipts.get(event.receiptId)
            : undefined;
          if (!receipt) throw new Error('Missing receipt');
          await ledger.recordIssuance(receipt, event);
          receipts.delete(receipt.receiptId);
        } else {
          await ledger.appendEvent(event);
        }
      }
      if (receipts.size) throw new Error('Missing issuance');
    } catch {
      throw new CustodyError(
        'INVALID_CUSTODY_LEDGER_STATE',
        'record',
        'Custody ledger history is invalid',
      );
    }
    return { ledger, revision: row.revision };
  }

  #assertInitialized(): void {
    if (!this.#initialized)
      throw new CustodyError(
        'CUSTODY_LEDGER_NOT_INITIALIZED',
        'record',
        'Initialize custody ledger before use',
      );
  }

  async #mutate(
    operation: (ledger: InMemoryCustodyLedger) => Promise<void>,
  ): Promise<void> {
    this.#assertInitialized();
    if (!this.#db.transaction)
      throw new CustodyError(
        'CUSTODY_LEDGER_TRANSACTIONS_REQUIRED',
        'record',
        'Custody ledger requires database transactions',
      );
    await this.#db.transaction(async (tx) => {
      const { ledger, revision } = await this.#load(tx);
      await operation(ledger);
      const state = validateCustodySnapshot({
        schema: 1,
        receipts: await ledger.listReceipts(),
        events: await ledger.listEvents(),
      });
      if (revision >= Number.MAX_SAFE_INTEGER)
        throw new CustodyError(
          'CUSTODY_LEDGER_REVISION_EXHAUSTED',
          'record',
          'Custody ledger revision exhausted',
        );
      const result = await tx.query(
        'UPDATE custody_ledger_state SET revision = ?, payload = ? WHERE ledger_id = ? AND revision = ?',
        revision + 1,
        JSON.stringify(state),
        this.#ledgerId,
        revision,
      );
      if (result.rowCount !== 1)
        throw new CustodyError(
          'CUSTODY_LEDGER_CONFLICT',
          'record',
          'Custody ledger changed concurrently; retry after reloading',
        );
    });
  }

  async recordIssuance(
    receipt: CustodyReceipt,
    event: CustodyEvent,
  ): Promise<void> {
    // Validate before cloning, so SecretMaterial/toJSON cannot disappear.
    const state = validateCustodySnapshot({
      schema: 1,
      receipts: [receipt],
      events: [event],
    });
    await this.#mutate((ledger) =>
      ledger.recordIssuance(state.receipts[0], state.events[0]),
    );
  }

  async commitIssuance(
    receiptId: string,
    event: CustodyEvent,
    followup?: CustodyEvent,
  ): Promise<void> {
    const state = validateCustodySnapshot({
      schema: 1,
      receipts: [],
      events: followup ? [event, followup] : [event],
    });
    await this.#mutate((ledger) =>
      ledger.commitIssuance(receiptId, state.events[0], state.events[1]),
    );
  }

  async appendEvent(event: CustodyEvent): Promise<void> {
    const state = validateCustodySnapshot({
      schema: 1,
      receipts: [],
      events: [event],
    });
    await this.#mutate((ledger) => ledger.appendEvent(state.events[0]));
  }

  async listReceipts(): Promise<CustodyReceipt[]> {
    this.#assertInitialized();
    return (await this.#load(this.#db)).ledger.listReceipts();
  }

  async listEvents(): Promise<CustodyEvent[]> {
    this.#assertInitialized();
    return (await this.#load(this.#db)).ledger.listEvents();
  }
}
