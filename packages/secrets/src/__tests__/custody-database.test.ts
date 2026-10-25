import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type DatabaseInterface, getDatabase } from '@happyvertical/sql';
import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseCustodyLedger } from '../adapters/custody-database.js';
import {
  CredentialCustody,
  type CustodyEvent,
  type CustodyReceipt,
  Ed25519CustodyReceiptAttestor,
  InMemoryCustodyLedger,
  SecretMaterial,
} from '../shared/custody.js';

const now = '2026-10-24T00:00:00.000Z';
const signature = sign(
  null,
  Buffer.from('test-public-receipt'),
  generateKeyPairSync('ed25519').privateKey,
).toString('base64url');
function receipt(id = 'receipt-1', replacesReceiptId?: string): CustodyReceipt {
  return {
    receiptId: id,
    mode: 'ephemeral',
    credentialId: `credential-${id}`,
    subject: 'operator',
    issuer: 'issuer',
    verifier: 'verifier',
    verificationState: 'verified',
    issuedAt: now,
    verifiedAt: now,
    rotationRootReceiptId: 'receipt-1',
    attribution: { actor: 'operator', runtime: 'node', session: 'test' },
    metadata: {},
    finalizer: 'finalizer',
    finalizationId: `final-${id}`,
    attestation: {
      algorithm: 'Ed25519',
      attestor: 'attestor',
      keyId: 'key-1',
      signature,
    },
    ...(replacesReceiptId ? { replacesReceiptId } : {}),
  };
}
function event(
  type: CustodyEvent['type'],
  receiptId = 'receipt-1',
  eventId = `${type}-${receiptId}`,
): CustodyEvent {
  return { eventId, type, receiptId, occurredAt: now };
}
const directories: string[] = [];
const databases: DatabaseInterface[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) db.client.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
async function setup() {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'sdk-custody-'));
  chmodSync(directory, 0o700);
  directories.push(directory);
  const path = join(directory, 'ledger.sqlite');
  const db = await getDatabase({
    type: 'sqlite',
    url: path,
    cache: false,
    secureFile: { driver: 'node:sqlite', custody: 'trusted-parent' },
  });
  databases.push(db);
  const ledger = new DatabaseCustodyLedger({ db });
  await ledger.initialize();
  return { db, ledger, directory, path };
}

for (const kind of ['memory', 'database'] as const) {
  describe(`${kind} custody transition contract`, () => {
    async function setupLedger() {
      return kind === 'memory'
        ? new InMemoryCustodyLedger()
        : (await setup()).ledger;
    }
    it('rejects colliding prepared event IDs without adding a receipt', async () => {
      const ledger = await setupLedger();
      await ledger.appendEvent(event('orphan-detected', 'other', 'collision'));
      await expect(
        ledger.recordIssuance(
          receipt(),
          event('finalization-pending', 'receipt-1', 'collision'),
        ),
      ).rejects.toThrow();
      expect(await ledger.listReceipts()).toEqual([]);
      expect(await ledger.listEvents()).toHaveLength(1);
    });
    it('commits both events, retries exactly, and rejects conflicting followups atomically', async () => {
      const ledger = await setupLedger();
      await ledger.recordIssuance(receipt(), event('finalization-pending'));
      const issued = event('issued');
      const followup = event('retirement-pending', 'prior');
      await ledger.commitIssuance('receipt-1', issued, followup);
      await ledger.commitIssuance('receipt-1', issued, followup);
      expect(await ledger.listEvents()).toHaveLength(3);
      await expect(
        ledger.commitIssuance('receipt-1', issued, {
          ...followup,
          reason: 'different',
        }),
      ).rejects.toThrow();
      await expect(
        ledger.commitIssuance('receipt-1', issued, {
          ...followup,
          eventId: 'new-followup',
        }),
      ).rejects.toThrow();
      expect(await ledger.listEvents()).toHaveLength(3);
    });
    it('preflights followup collisions before issuing and enforces receipt identity', async () => {
      const ledger = await setupLedger();
      await ledger.recordIssuance(receipt(), event('finalization-pending'));
      await ledger.appendEvent(event('orphan-detected', 'prior', 'collision'));
      await expect(
        ledger.commitIssuance(
          'receipt-1',
          event('issued'),
          event('retirement-pending', 'prior', 'collision'),
        ),
      ).rejects.toThrow();
      await expect(
        ledger.commitIssuance('receipt-1', event('issued', 'other')),
      ).rejects.toThrow();
      expect(
        (await ledger.listEvents()).some((entry) => entry.type === 'issued'),
      ).toBe(false);
    });
    it('enforces duplicate, terminal and active-child rotation conflicts', async () => {
      const ledger = await setupLedger();
      await ledger.recordIssuance(receipt(), event('finalization-pending'));
      await expect(
        ledger.recordIssuance(receipt(), event('finalization-pending')),
      ).rejects.toThrow();
      await expect(
        ledger.recordIssuance(
          receipt('missing-child', 'missing'),
          event('finalization-pending', 'missing-child'),
        ),
      ).rejects.toThrow();
      await expect(
        ledger.recordIssuance(
          receipt('early-child', 'receipt-1'),
          event('finalization-pending', 'early-child'),
        ),
      ).rejects.toThrow();
      await ledger.commitIssuance('receipt-1', event('issued'));
      await ledger.recordIssuance(
        receipt('child', 'receipt-1'),
        event('finalization-pending', 'child'),
      );
      await expect(
        ledger.recordIssuance(
          receipt('second', 'receipt-1'),
          event('finalization-pending', 'second'),
        ),
      ).rejects.toThrow();
      await ledger.appendEvent(event('revoked'));
      await expect(
        ledger.recordIssuance(
          receipt('third', 'receipt-1'),
          event('finalization-pending', 'third'),
        ),
      ).rejects.toThrow();
    });
    it('accepts exact event retry but rejects changed content', async () => {
      const ledger = await setupLedger();
      await ledger.appendEvent(event('orphan-detected'));
      await ledger.appendEvent(event('orphan-detected'));
      await expect(
        ledger.appendEvent({ ...event('orphan-detected'), reason: 'changed' }),
      ).rejects.toThrow();
      expect(await ledger.listEvents()).toHaveLength(1);
    });
  });
}

describe('DatabaseCustodyLedger durability', () => {
  it('requires initialization and transactional persistence', async () => {
    const { db } = await setup();
    const unopened = new DatabaseCustodyLedger({ db });
    await expect(unopened.listEvents()).rejects.toThrow('Initialize');
    await expect(
      new DatabaseCustodyLedger({
        db: { ...db, transaction: undefined },
      }).initialize(),
    ).rejects.toThrow('requires database transactions');
  });
  it('preserves durable sink and nested recovery metadata exactly', async () => {
    const { db, ledger } = await setup();
    const durable: CustodyReceipt = {
      ...receipt(),
      mode: 'durable',
      metadata: { empty: '', purpose: 'operator' },
      sink: {
        sinkName: 'sink',
        reference: 'runtime:receipt-1',
        version: '1',
        storedAt: now,
      },
    };
    await ledger.recordIssuance(durable, event('finalization-pending'));
    const recovery = {
      ...event('rollback-pending'),
      recoveryId: 'recovery',
      recoveryReceipt: durable,
      finalizationReceipt: durable,
      requiresSink: true,
    };
    await ledger.appendEvent(recovery);
    const reopened = new DatabaseCustodyLedger({ db });
    await reopened.initialize();
    expect(await reopened.listReceipts()).toEqual([durable]);
    expect(await reopened.listEvents()).toEqual([
      event('finalization-pending'),
      recovery,
    ]);
  });
  it('survives independent process reopen with exact receipt and event bytes', async () => {
    const { ledger, path, directory } = await setup();
    await ledger.recordIssuance(receipt(), event('finalization-pending'));
    await ledger.commitIssuance(
      'receipt-1',
      event('issued'),
      event('retirement-pending', 'prior'),
    );
    const expected = {
      receipts: await ledger.listReceipts(),
      events: await ledger.listEvents(),
    };
    // Execute the built published entry in a fresh Node process, not a reseeded ledger.
    const entry = fileURLToPath(
      new URL('../../dist/index.js', import.meta.url),
    );
    const sqlEntry = fileURLToPath(
      new URL('../../../sql/dist/index.js', import.meta.url),
    );
    const script = join(directory, 'read.mjs');
    writeFileSync(
      script,
      `import {DatabaseCustodyLedger} from ${JSON.stringify(entry)}; import {getDatabase} from ${JSON.stringify(sqlEntry)}; const db=await getDatabase({type:'sqlite',url:process.argv[2],cache:false,secureFile:{driver:'node:sqlite',custody:'trusted-parent'}}); const ledger=new DatabaseCustodyLedger({db}); await ledger.initialize(); console.log(JSON.stringify({receipts:await ledger.listReceipts(),events:await ledger.listEvents()})); db.client.close();`,
    );
    const child = spawnSync(process.execPath, [script, path], {
      encoding: 'utf8',
    });
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual(expected);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
  it('recovers a real interrupted custody issuance in another process', async () => {
    const { ledger, path, directory } = await setup();
    const entry = fileURLToPath(
      new URL('../../dist/index.js', import.meta.url),
    );
    const sqlEntry = fileURLToPath(
      new URL('../../../sql/dist/index.js', import.meta.url),
    );
    const script = join(directory, 'interrupt.mjs');
    writeFileSync(
      script,
      `
      import {generateKeyPairSync} from 'node:crypto';
      import {DatabaseCustodyLedger,CredentialCustody,Ed25519CustodyReceiptAttestor,SecretMaterial} from ${JSON.stringify(entry)};
      import {getDatabase} from ${JSON.stringify(sqlEntry)};
      const db=await getDatabase({type:'sqlite',url:process.argv[2],cache:false,secureFile:{driver:'node:sqlite',custody:'trusted-parent'}});
      class Interrupted extends DatabaseCustodyLedger { async commitIssuance() { console.log(JSON.stringify(await this.listReceipts())); process.exit(0); } }
      const ledger=new Interrupted({db}); await ledger.initialize();
      const custody=new CredentialCustody({ledger,
        issuer:{name:'issuer',async issue(){return {credentialId:'credential-interrupted',secret:SecretMaterial.fromString('synthetic-ephemeral-value')}} ,async revoke(){}},
        verifier:{name:'verifier',async verify(){return {verified:true}}},
        attestor:new Ed25519CustodyReceiptAttestor({privateKey:generateKeyPairSync('ed25519').privateKey,keyId:'test-key'}),
        finalizer:{name:'finalizer',async prepare(){return {prepared:true}},async commit(){},async abort(){},async status(){return 'committed'}},
        now:()=>new Date(${JSON.stringify(now)}),finalizationTakeoverMs:0});
      await custody.issue({mode:'ephemeral',subject:'operator',attribution:{actor:'operator',runtime:'node',session:'test'}});
    `,
    );
    const child = spawnSync(process.execPath, [script, path], {
      encoding: 'utf8',
    });
    expect(child.status, child.stderr).toBe(0);
    const original = JSON.parse(child.stdout);
    expect(await ledger.listReceipts()).toEqual(original);
    expect((await ledger.listEvents()).map((entry) => entry.type)).toEqual([
      'finalization-pending',
    ]);
    const custody = new CredentialCustody({
      ledger,
      issuer: {
        name: 'issuer',
        async issue() {
          throw new Error('Recovery must not issue');
        },
        async revoke() {},
      },
      verifier: {
        name: 'verifier',
        async verify() {
          throw new Error('Recovery must not verify');
        },
      },
      attestor: new Ed25519CustodyReceiptAttestor({
        privateKey: generateKeyPairSync('ed25519').privateKey,
        keyId: 'test-key',
      }),
      finalizer: {
        name: 'finalizer',
        async prepare() {
          throw new Error('Recovery must not prepare');
        },
        async commit() {},
        async abort() {},
        async status() {
          return 'committed';
        },
      },
      now: () => new Date(now),
      finalizationTakeoverMs: 0,
    });
    await custody.recoverPendingRollbacks();
    await custody.recoverPendingRollbacks();
    expect((await ledger.listEvents()).map((entry) => entry.type)).toEqual([
      'finalization-pending',
      'issued',
    ]);
    expect(await ledger.listReceipts()).toEqual(original);
  });
  it('rolls back a failure after SQL update and preserves both atomic operations', async () => {
    const { db, ledger } = await setup();
    if (!db.transaction) throw new Error('SQLite requires transactions');
    const transaction = db.transaction;
    const failing = new DatabaseCustodyLedger({
      db: {
        ...db,
        transaction: async (callback) =>
          transaction(async (tx) => {
            await callback(tx);
            throw new Error('injected commit failure');
          }),
      },
    });
    await failing.initialize();
    await expect(
      failing.recordIssuance(receipt(), event('finalization-pending')),
    ).rejects.toThrow('injected');
    expect(await ledger.listReceipts()).toEqual([]);
    expect(await ledger.listEvents()).toEqual([]);
    await ledger.recordIssuance(receipt(), event('finalization-pending'));
    await expect(
      failing.commitIssuance(
        'receipt-1',
        event('issued'),
        event('retirement-pending', 'prior'),
      ),
    ).rejects.toThrow('injected');
    expect(await ledger.listEvents()).toEqual([event('finalization-pending')]);
  });
  it('fails closed on CAS conflict without losing state', async () => {
    const { db, ledger } = await setup();
    if (!db.transaction) throw new Error('SQLite requires transactions');
    const transaction = db.transaction;
    const conflicting = new DatabaseCustodyLedger({
      db: {
        ...db,
        transaction: async (callback) =>
          transaction(async (tx) =>
            callback({
              ...tx,
              query: async (sql, ...args) =>
                sql.startsWith('UPDATE custody_ledger_state')
                  ? { rows: [], rowCount: 0 }
                  : tx.query(sql, ...args),
            }),
          ),
      },
    });
    await conflicting.initialize();
    await expect(
      conflicting.recordIssuance(receipt(), event('finalization-pending')),
    ).rejects.toThrow('concurrently');
    expect(await ledger.listReceipts()).toEqual([]);
  });
  it('handles competing connections without a second child or lost event', async () => {
    const { path, ledger } = await setup();
    const db2 = await getDatabase({
      type: 'sqlite',
      url: path,
      cache: false,
      secureFile: { driver: 'node:sqlite', custody: 'trusted-parent' },
    });
    databases.push(db2);
    const other = new DatabaseCustodyLedger({ db: db2 });
    await other.initialize();
    await ledger.recordIssuance(receipt(), event('finalization-pending'));
    await ledger.commitIssuance('receipt-1', event('issued'));
    const outcomes = await Promise.allSettled([
      ledger.recordIssuance(
        receipt('child-a', 'receipt-1'),
        event('finalization-pending', 'child-a'),
      ),
      other.recordIssuance(
        receipt('child-b', 'receipt-1'),
        event('finalization-pending', 'child-b'),
      ),
    ]);
    expect(
      outcomes.filter((entry) => entry.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(await ledger.listReceipts()).toHaveLength(2);
    await other.appendEvent(event('orphan-detected', 'orphan'));
    expect(await ledger.listEvents()).toHaveLength(4);
  });
  it('isolates named ledgers and rejects unsafe IDs', async () => {
    const { db, ledger } = await setup();
    const other = new DatabaseCustodyLedger({ db, ledgerId: 'other' });
    await other.initialize();
    await other.appendEvent(event('orphan-detected'));
    expect(await ledger.listEvents()).toEqual([]);
    expect(
      () => new DatabaseCustodyLedger({ db, ledgerId: '../unsafe' }),
    ).toThrow();
  });
  it.each([
    '{',
    '{"schema":2,"receipts":[],"events":[]}',
    '{"schema":1,"receipts":[],"events":[{"type":"unknown"}]}',
  ])('does not reset corrupt state (%s)', async (payload) => {
    const { db, ledger } = await setup();
    await db.query('UPDATE custody_ledger_state SET payload = ?', payload);
    await expect(ledger.listEvents()).rejects.toThrow('state is invalid');
    await expect(
      new DatabaseCustodyLedger({ db }).initialize(),
    ).rejects.toThrow();
    expect(
      (await db.query('SELECT payload FROM custody_ledger_state')).rows[0]
        .payload,
    ).toBe(payload);
  });
  it('rejects unknown fields, malformed enums, secret material and recognized tokens before persistence', async () => {
    const { ledger } = await setup();
    const token = `ghp_${'x'.repeat(36)}`;
    const secret = SecretMaterial.fromString('synthetic');
    const inputs = [
      { ...receipt(), token },
      { ...receipt(), mode: 'unknown' },
      { ...receipt(), metadata: { value: secret } },
      { ...receipt(), metadata: { value: token } },
    ];
    for (const input of inputs)
      await expect(
        ledger.recordIssuance(
          input as CustodyReceipt,
          event('finalization-pending'),
        ),
      ).rejects.toThrow('schema-valid');
    secret.destroy();
    expect(await ledger.listReceipts()).toEqual([]);
    await expect(
      ledger.appendEvent({
        ...event('orphan-detected'),
        requiresSink: 'yes',
      } as unknown as CustodyEvent),
    ).rejects.toThrow();
  });
});
