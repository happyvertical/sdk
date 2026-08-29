import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import {
  createSecureSqliteClient,
  parseDarwinAclListing,
  type SecureSqliteRuntime,
  toPublicRowCount,
} from './secure-sqlite-client';
import type { DatabaseInterface } from './shared/types';

const tempRoots = new Set<string>();
const trustedParent = { custody: 'trusted-parent' } as const;
const secureFile = {
  driver: 'node:sqlite',
  custody: 'trusted-parent',
} as const;

async function makeTempRoot(): Promise<string> {
  // macOS exposes /var as a symlink. Use its real path because secure
  // acquisition intentionally rejects every symlink component.
  const root = await mkdtemp(
    join(await realpath(tmpdir()), 'sdk-secure-sqlite-'),
  );
  tempRoots.add(root);
  return root;
}

async function loadNodeSqliteDriver() {
  return (await import('node:sqlite')) as any;
}

function createTrustedClient(url: string, runtime?: SecureSqliteRuntime) {
  return createSecureSqliteClient(url, trustedParent, runtime);
}

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function txOf(db: DatabaseInterface) {
  const transaction = db.transaction;
  if (!transaction) throw new Error('transaction unavailable');
  return transaction.bind(db);
}

async function expectEveryScopeRouteClosed(db: DatabaseInterface) {
  const sql = Object.assign(['SELECT 1'], {
    raw: ['SELECT 1'],
  }) as unknown as TemplateStringsArray;
  const operations: Promise<unknown>[] = [
    db.insert('closed_scope', { id: 1 }),
    db.get('closed_scope', { id: 1 }),
    db.list('closed_scope', { id: 1 }),
    db.update('closed_scope', { id: 1 }, { id: 2 }),
    db.upsert('closed_scope', ['id'], { id: 1 }),
    db.getOrInsert('closed_scope', { id: 1 }, { id: 1 }),
    db.delete('closed_scope', { id: 1 }),
    db.count('closed_scope'),
    db.table('closed_scope').insert({ id: 1 }),
    db.many(sql),
    db.single(sql),
    db.pluck(sql),
    db.execute(sql),
    db.query('SELECT 1'),
    db.oo(sql),
    db.oO(sql),
    db.ox(sql),
    db.xx(sql),
    db.tableExists('closed_scope'),
    txOf(db)(async () => undefined),
  ];
  if (db.syncSchema) operations.push(db.syncSchema('SELECT 1'));

  await Promise.all(
    operations.map((operation) =>
      expect(operation).rejects.toThrow('Transaction scope is ending or ended'),
    ),
  );
}

afterEach(async () => {
  await Promise.all(
    [...tempRoots].map((root) => rm(root, { recursive: true, force: true })),
  );
  tempRoots.clear();
});

describe('secure SQLite file acquisition', () => {
  it('enforces the secure Node runtime floor before loading the driver', async () => {
    for (const nodeVersion of [
      '22.22.3',
      '24.17.99',
      '24.18',
      '24.18.0-rc.1',
      '24.19.0-rc.1',
      '25.0.0-beta.1',
    ]) {
      let driverLoaded = false;
      await expect(
        createSecureSqliteClient('/unused/app.db', trustedParent, {
          platform: 'linux',
          nodeVersion,
          loadDriver: async () => {
            driverLoaded = true;
            return loadNodeSqliteDriver();
          },
        }),
      ).rejects.toThrow('requires Node.js 24.18.0 or newer');
      expect(driverLoaded).toBe(false);
    }

    const root = await makeTempRoot();
    for (const nodeVersion of ['24.18.0', '24.19.7', '25.0.0']) {
      const client = await createTrustedClient(
        join(root, `node-${nodeVersion}.db`),
        {
          platform: process.platform,
          nodeVersion,
          loadDriver: loadNodeSqliteDriver,
        },
      );
      await client.execute('SELECT 1');
      await client.close();
    }
  });

  it('parses macOS ACL markers without confusing extended attributes', () => {
    expect(
      parseDarwinAclListing(
        'drwx------+ 2 user staff 64 Aug 29 15:07 /data\n 0: group:everyone allow write',
      ),
    ).toBe(true);
    expect(
      parseDarwinAclListing('drwx------@ 2 user staff 64 Aug 29 15:07 /data'),
    ).toBe(false);
    expect(
      parseDarwinAclListing('drwx------  2 user staff 64 Aug 29 15:07 /data'),
    ).toBe(false);
    expect(() => parseDarwinAclListing('unexpected output')).toThrow(
      'unrecognized listing',
    );
  });

  it('rejects a macOS ACL before loading the driver', async () => {
    const root = await makeTempRoot();
    let driverLoaded = false;

    await expect(
      createSecureSqliteClient(join(root, 'app.db'), trustedParent, {
        platform: 'darwin',
        inspectDarwinAcl: async (path) => path === root,
        loadDriver: async () => {
          driverLoaded = true;
          return loadNodeSqliteDriver();
        },
      }),
    ).rejects.toThrow('contains a macOS access control list');
    expect(driverLoaded).toBe(false);
  });

  it('rejects a macOS ACL on an existing database leaf', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'app.db');
    await writeFile(databasePath, '');
    await chmod(databasePath, 0o600);
    let driverLoaded = false;

    await expect(
      createSecureSqliteClient(databasePath, trustedParent, {
        platform: 'darwin',
        inspectDarwinAcl: async (path) => path === databasePath,
        loadDriver: async () => {
          driverLoaded = true;
          return loadNodeSqliteDriver();
        },
      }),
    ).rejects.toThrow('contains a macOS access control list');
    expect(driverLoaded).toBe(false);
  });

  it('fails closed when macOS ACL inspection fails', async () => {
    const root = await makeTempRoot();
    let driverLoaded = false;

    await expect(
      createSecureSqliteClient(join(root, 'app.db'), trustedParent, {
        platform: 'darwin',
        inspectDarwinAcl: async (path) => {
          if (path === root) throw new Error('inspection unavailable');
          return false;
        },
        loadDriver: async () => {
          driverLoaded = true;
          return loadNodeSqliteDriver();
        },
      }),
    ).rejects.toThrow('cannot inspect macOS access control lists');
    expect(driverLoaded).toBe(false);
  });

  it('checks clean macOS custody components and an existing leaf', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'app.db');
    await writeFile(databasePath, '');
    await chmod(databasePath, 0o600);
    const inspected = new Set<string>();

    const client = await createSecureSqliteClient(databasePath, trustedParent, {
      platform: 'darwin',
      inspectDarwinAcl: async (path) => {
        inspected.add(path);
        return false;
      },
      loadDriver: loadNodeSqliteDriver,
    });
    await client.close();

    expect(inspected.has(root)).toBe(true);
    expect(inspected.has(databasePath)).toBe(true);
  });

  it('does not inspect macOS ACLs on non-Darwin platforms', async () => {
    const root = await makeTempRoot();
    let inspected = false;
    const client = await createSecureSqliteClient(
      join(root, 'app.db'),
      trustedParent,
      {
        platform: 'linux',
        inspectDarwinAcl: async () => {
          inspected = true;
          throw new Error('must not run');
        },
        loadDriver: loadNodeSqliteDriver,
      },
    );
    await client.close();
    expect(inspected).toBe(false);
  });

  it('requires an explicit trusted-parent custody contract', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'app.db');

    await expect(
      getDatabase({
        type: 'sqlite',
        url: databasePath,
        secureFile: true,
        cache: false,
      }),
    ).rejects.toThrow('explicit trusted-parent custody contract');

    await expect(
      getDatabase({
        type: 'sqlite',
        url: databasePath,
        secureFile: { driver: 'node:sqlite' } as any,
        cache: false,
      }),
    ).rejects.toThrow('requires trusted-parent custody');
    await expect(
      getDatabase({
        type: 'sqlite',
        url: databasePath,
        secureFile: { custody: 'trusted-parent' } as any,
        cache: false,
      }),
    ).rejects.toThrow('Unsupported secure SQLite driver');
    await expect(readFile(databasePath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('enforces the declared custody root for nested databases', async () => {
    const root = await makeTempRoot();
    const nested = join(root, 'nested');
    await mkdir(nested, { mode: 0o700 });
    const databasePath = join(nested, 'app.db');

    const db = await getDatabase({
      type: 'sqlite',
      url: databasePath,
      secureFile: { ...secureFile, root },
      cache: false,
    });
    await db.execute`CREATE TABLE rooted (id INTEGER PRIMARY KEY)`;
    await db.close?.();

    await expect(
      getDatabase({
        type: 'sqlite',
        url: databasePath,
        secureFile: { ...secureFile, root: join(root, 'other') },
        cache: false,
      }),
    ).rejects.toThrow('must be beneath its trusted custody root');
  });

  it('rejects custody owned by another uid before loading the driver', async () => {
    const root = await makeTempRoot();
    let driverLoaded = false;

    await expect(
      createSecureSqliteClient(join(root, 'app.db'), trustedParent, {
        platform: process.platform,
        pathOwnerUid: (path, actualUid) =>
          path === root ? actualUid + 1 : actualUid,
        loadDriver: async () => {
          driverLoaded = true;
          return loadNodeSqliteDriver();
        },
      }),
    ).rejects.toThrow('not owned by the current user');
    expect(driverLoaded).toBe(false);
  });

  it('allows only current-user or root-owned ancestors above custody', async () => {
    const root = await makeTempRoot();
    const ancestor = dirname(root);
    const currentUid = process.getuid?.() ?? 501;
    let driverLoaded = false;

    await expect(
      createSecureSqliteClient(join(root, 'foreign.db'), trustedParent, {
        platform: 'linux',
        currentUid: () => currentUid,
        pathOwnerUid: (path, actualUid) =>
          path === ancestor ? currentUid + 1 : actualUid,
        loadDriver: async () => {
          driverLoaded = true;
          return loadNodeSqliteDriver();
        },
      }),
    ).rejects.toThrow('ancestor is owned by an untrusted user');
    expect(driverLoaded).toBe(false);

    const rootOwned = await createSecureSqliteClient(
      join(root, 'root-owned.db'),
      trustedParent,
      {
        platform: 'linux',
        currentUid: () => currentUid,
        pathOwnerUid: (path, actualUid) => (path === ancestor ? 0 : actualUid),
        loadDriver: loadNodeSqliteDriver,
      },
    );
    await rootOwned.close();

    const userOwned = await createSecureSqliteClient(
      join(root, 'user-owned.db'),
      trustedParent,
      {
        platform: 'linux',
        currentUid: () => currentUid,
        pathOwnerUid: (path, actualUid) =>
          path === ancestor ? currentUid : actualUid,
        loadDriver: loadNodeSqliteDriver,
      },
    );
    await userOwned.close();
  });

  it('rejects group/world-writable custody before loading the driver', async () => {
    const root = await makeTempRoot();
    await chmod(root, 0o770);
    let driverLoaded = false;

    await expect(
      createSecureSqliteClient(join(root, 'app.db'), trustedParent, {
        platform: process.platform,
        loadDriver: async () => {
          driverLoaded = true;
          return loadNodeSqliteDriver();
        },
      }),
    ).rejects.toThrow('group/world writable');
    expect(driverLoaded).toBe(false);
  });

  it('creates, transacts, closes, and reopens a regular database', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'app.db');
    const db = await getDatabase({
      type: 'sqlite',
      url: databasePath,
      secureFile,
      cache: false,
    });

    await db.execute`PRAGMA foreign_keys = ON`;
    expect(await db.pluck`PRAGMA foreign_keys`).toBe(1);
    await db.execute`CREATE TABLE jobs (id INTEGER PRIMARY KEY, title TEXT)`;

    await db.transaction(async (transaction) => {
      await transaction.insert('jobs', { id: 1, title: 'first' });
    });

    await expect(
      db.transaction(async (transaction) => {
        await transaction.insert('jobs', { id: 2, title: 'rolled back' });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await db.count('jobs')).toBe(1);
    await db.close?.();

    const reopened = await getDatabase({
      type: 'sqlite',
      url: databasePath,
      secureFile,
      cache: false,
    });
    expect(
      await reopened.single`SELECT title FROM jobs WHERE id = ${1}`,
    ).toEqual({ title: 'first' });
    await reopened.close?.();

    await rm(databasePath);
    await expect(readFile(databasePath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects a symlinked database leaf without touching its target', async () => {
    const root = await makeTempRoot();
    const target = join(root, 'target.txt');
    const databasePath = join(root, 'app.db');
    await writeFile(target, 'untouched');
    await symlink(target, databasePath);

    await expect(
      getDatabase({
        type: 'sqlite',
        url: databasePath,
        secureFile,
        cache: false,
      }),
    ).rejects.toThrow('database leaf must be a regular file');
    expect(await readFile(target, 'utf8')).toBe('untouched');
  });

  it('rejects a symlinked ancestor without creating the database target', async () => {
    const root = await makeTempRoot();
    const realDirectory = join(root, 'real');
    const linkedDirectory = join(root, 'linked');
    await mkdir(realDirectory);
    await symlink(realDirectory, linkedDirectory);

    await expect(
      getDatabase({
        type: 'sqlite',
        url: join(linkedDirectory, 'app.db'),
        secureFile,
        cache: false,
      }),
    ).rejects.toThrow('custody chain must contain only real directories');
    await expect(readFile(join(realDirectory, 'app.db'))).rejects.toMatchObject(
      {
        code: 'ENOENT',
      },
    );
  });

  it('reports affected rows for CTE and comment-prefixed writes', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.execute`CREATE TABLE jobs (id INTEGER PRIMARY KEY, title TEXT)`;
    await db.execute`INSERT INTO jobs (id, title) VALUES (1, 'one'), (2, 'two'), (3, 'three')`;

    const cteInsert = await db.query(`
      WITH new_jobs(id, title) AS (VALUES (4, 'four'), (5, 'five'))
      INSERT INTO jobs SELECT id, title FROM new_jobs
    `);
    expect(cteInsert.rowCount).toBe(2);

    const cteUpdate = await db.query(`
      WITH selected(id) AS (VALUES (1), (2))
      UPDATE jobs SET title = 'updated'
      WHERE id IN (SELECT id FROM selected)
    `);
    expect(cteUpdate.rowCount).toBe(2);

    const cteDelete = await db.query(`
      WITH selected(id) AS (VALUES (5))
      DELETE FROM jobs WHERE id IN (SELECT id FROM selected)
    `);
    expect(cteDelete.rowCount).toBe(1);

    const commentDelete = await db.query(`
      /* a valid write may begin with a comment */
      DELETE FROM jobs WHERE id = 3
    `);
    expect(commentDelete.rowCount).toBe(1);
    expect(await db.count('jobs')).toBe(3);
    await db.close?.();
  });

  it('queues close behind accepted work and rejects new work while closing', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'app.db');
    const client = await createTrustedClient(databasePath);

    const acceptedWrite = client.execute(
      'CREATE TABLE close_race (id INTEGER PRIMARY KEY)',
    );
    const closing = client.close();

    await expect(acceptedWrite).resolves.toMatchObject({ rowsAffected: 0 });
    await expect(
      client.execute('INSERT INTO close_race (id) VALUES (1)'),
    ).rejects.toThrow('closing or closed');
    await expect(closing).resolves.toBeUndefined();

    const reopened = await createTrustedClient(databasePath);
    expect(
      await reopened.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'close_race'",
      ),
    ).toMatchObject({ rows: [{ name: 'close_race' }] });
    await reopened.close();
  });

  it('does not let close overtake an already-invoked transaction', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'app.db');
    const db = await getDatabase({
      type: 'sqlite',
      url: databasePath,
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE invocation_order (id INTEGER PRIMARY KEY)');

    const acceptedTransaction = db.transaction(async (tx) => {
      await tx.query('INSERT INTO invocation_order (id) VALUES (1)');
    });
    const closing = db.close?.();
    if (!closing) throw new Error('close unavailable');

    await expect(acceptedTransaction).resolves.toBeUndefined();
    await expect(closing).resolves.toBeUndefined();
    await expect(
      db.query('INSERT INTO invocation_order (id) VALUES (2)'),
    ).rejects.toThrow('closing or closed');

    const reopened = await getDatabase({
      type: 'sqlite',
      url: databasePath,
      secureFile,
      cache: false,
    });
    expect(
      (await reopened.query('SELECT id FROM invocation_order')).rows,
    ).toEqual([{ id: 1 }]);
    await reopened.close?.();
  });

  it('does not let close overtake an already-invoked multi-step upsert', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'app.db');
    const db = await getDatabase({
      type: 'sqlite',
      url: databasePath,
      secureFile,
      cache: false,
    });
    await db.query(`
      CREATE TABLE invocation_upsert (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        tenant_id TEXT,
        UNIQUE(slug, tenant_id)
      )
    `);

    const acceptedUpsert = db.upsert(
      'invocation_upsert',
      ['slug', 'tenant_id'],
      { id: 'kept', slug: 'shared', tenant_id: null },
    );
    const closing = db.close?.();
    if (!closing) throw new Error('close unavailable');

    await expect(acceptedUpsert).resolves.toMatchObject({ affected: 1 });
    await expect(closing).resolves.toBeUndefined();

    const reopened = await getDatabase({
      type: 'sqlite',
      url: databasePath,
      secureFile,
      cache: false,
    });
    expect(
      (await reopened.query('SELECT id FROM invocation_upsert')).rows,
    ).toEqual([{ id: 'kept' }]);
    await reopened.close?.();
  });

  it('keeps an outsider write outside a paused transaction rollback', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'app.db');
    const db = await getDatabase({
      type: 'sqlite',
      url: databasePath,
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE reservation (id INTEGER PRIMARY KEY)');
    const transactionStarted = deferred();
    const resumeTransaction = deferred();

    const rollingBack = db.transaction?.(async (tx) => {
      await tx.query('INSERT INTO reservation (id) VALUES (1)');
      transactionStarted.resolve();
      await resumeTransaction.promise;
      throw new Error('rollback owner');
    });
    if (!rollingBack) throw new Error('transaction unavailable');
    await transactionStarted.promise;

    let outsiderSettled = false;
    const outsider = db
      .query('INSERT INTO reservation (id) VALUES (2)')
      .finally(() => {
        outsiderSettled = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(outsiderSettled).toBe(false);

    resumeTransaction.resolve();
    await expect(rollingBack).rejects.toThrow('rollback owner');
    await expect(outsider).resolves.toMatchObject({ rowCount: 1 });
    expect((await db.query('SELECT id FROM reservation')).rows).toEqual([
      { id: 2 },
    ]);
    await db.close?.();
  });

  it('waits to close until a paused transaction commits', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'app.db');
    const db = await getDatabase({
      type: 'sqlite',
      url: databasePath,
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE close_reservation (id INTEGER PRIMARY KEY)');
    const transactionStarted = deferred();
    const resumeTransaction = deferred();

    const committing = db.transaction?.(async (tx) => {
      await tx.query('INSERT INTO close_reservation (id) VALUES (1)');
      transactionStarted.resolve();
      await resumeTransaction.promise;
      await tx.query('INSERT INTO close_reservation (id) VALUES (2)');
    });
    if (!committing) throw new Error('transaction unavailable');
    await transactionStarted.promise;

    let closeSettled = false;
    const closing = db.close?.().finally(() => {
      closeSettled = true;
    });
    if (!closing) throw new Error('close unavailable');
    await expect(
      db.query('INSERT INTO close_reservation (id) VALUES (3)'),
    ).rejects.toThrow('closing or closed');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closeSettled).toBe(false);

    resumeTransaction.resolve();
    await expect(committing).resolves.toBeUndefined();
    await expect(closing).resolves.toBeUndefined();

    const reopened = await getDatabase({
      type: 'sqlite',
      url: databasePath,
      secureFile,
      cache: false,
    });
    expect(
      (await reopened.query('SELECT id FROM close_reservation ORDER BY id'))
        .rows,
    ).toEqual([{ id: 1 }, { id: 2 }]);
    await reopened.close?.();
  });

  it('drains accepted callback operations and rejects detached late work', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE scope_lifetime (id INTEGER PRIMARY KEY)');

    let lateAfterReturn: Promise<unknown> | undefined;
    const lateAfterReturnCreated = deferred();
    await txOf(db)(async (tx) => {
      void tx.table('scope_lifetime').insert({ id: 1 });
      queueMicrotask(() => {
        queueMicrotask(() => {
          lateAfterReturn = tx.query(
            'INSERT INTO scope_lifetime (id) VALUES (4)',
          );
          void lateAfterReturn.catch(() => {});
          lateAfterReturnCreated.resolve();
        });
      });
    });
    await lateAfterReturnCreated.promise;
    await expect(lateAfterReturn).rejects.toThrow(
      'Transaction scope is ending or ended',
    );

    let lateOperation: Promise<unknown> | undefined;
    const lateCreated = deferred();
    await expect(
      txOf(db)(async (tx) => {
        void tx.query('INSERT INTO scope_lifetime (id) VALUES (2)');
        queueMicrotask(() => {
          queueMicrotask(() => {
            lateOperation = tx.query(
              'INSERT INTO scope_lifetime (id) VALUES (3)',
            );
            void lateOperation.catch(() => {});
            lateCreated.resolve();
          });
        });
        throw new Error('rollback callback scope');
      }),
    ).rejects.toThrow('rollback callback scope');
    await lateCreated.promise;
    await expect(lateOperation).rejects.toThrow(
      'Transaction scope is ending or ended',
    );

    expect(
      (await db.query('SELECT id FROM scope_lifetime ORDER BY id')).rows,
    ).toEqual([{ id: 1 }]);
    await db.close?.();
  });

  it('seals and drains manual handles when commit or rollback starts', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query(
      'CREATE TABLE manual_scope_lifetime (id INTEGER PRIMARY KEY)',
    );

    const committed = await db.beginTransaction?.();
    if (!committed) throw new Error('beginTransaction unavailable');
    const acceptedCommit = committed.query(
      'INSERT INTO manual_scope_lifetime (id) VALUES (1)',
    );
    const committing = committed.commit();
    await expect(
      committed.query('INSERT INTO manual_scope_lifetime (id) VALUES (2)'),
    ).rejects.toThrow('Transaction scope is ending or ended');
    await expect(acceptedCommit).resolves.toMatchObject({ rowCount: 1 });
    await expect(committing).resolves.toBeUndefined();
    await expectEveryScopeRouteClosed(committed);

    const rolledBack = await db.beginTransaction?.();
    if (!rolledBack) throw new Error('beginTransaction unavailable');
    const acceptedRollback = rolledBack.insert('manual_scope_lifetime', {
      id: 3,
    });
    const rollingBack = rolledBack.rollback();
    await expect(
      rolledBack.table('manual_scope_lifetime').insert({ id: 4 }),
    ).rejects.toThrow('Transaction scope is ending or ended');
    await expect(acceptedRollback).resolves.toMatchObject({ affected: 1 });
    await expect(rollingBack).resolves.toBeUndefined();

    expect(
      (await db.query('SELECT id FROM manual_scope_lifetime ORDER BY id')).rows,
    ).toEqual([{ id: 1 }]);
    await db.close?.();
  });

  it('prevents nested savepoint work from escaping its callback lifetime', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query(
      'CREATE TABLE nested_scope_lifetime (id INTEGER PRIMARY KEY)',
    );
    let lateNested: Promise<unknown> | undefined;
    const lateCreated = deferred();

    await txOf(db)(async (outer) => {
      await txOf(outer)(async (inner) => {
        void inner.query('INSERT INTO nested_scope_lifetime (id) VALUES (1)');
        queueMicrotask(() => {
          queueMicrotask(() => {
            lateNested = inner.query(
              'INSERT INTO nested_scope_lifetime (id) VALUES (2)',
            );
            void lateNested.catch(() => {});
            lateCreated.resolve();
          });
        });
      });
      await lateCreated.promise;
      await expect(lateNested).rejects.toThrow(
        'Transaction scope is ending or ended',
      );
      await outer.query('INSERT INTO nested_scope_lifetime (id) VALUES (3)');
    });

    expect(
      (await db.query('SELECT id FROM nested_scope_lifetime ORDER BY id')).rows,
    ).toEqual([{ id: 1 }, { id: 3 }]);
    await db.close?.();
  });

  it('preserves commit, rollback, and nested savepoint behavior', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE nested_reservation (id INTEGER PRIMARY KEY)');

    await db.transaction?.(async (outer) => {
      await outer.query('INSERT INTO nested_reservation (id) VALUES (1)');
      await outer.transaction?.(async (inner) => {
        await inner.query('INSERT INTO nested_reservation (id) VALUES (2)');
      });
      await expect(
        outer.transaction?.(async (inner) => {
          await inner.query('INSERT INTO nested_reservation (id) VALUES (3)');
          throw new Error('nested rollback');
        }),
      ).rejects.toThrow('nested rollback');
      await outer.query('INSERT INTO nested_reservation (id) VALUES (4)');
    });

    await expect(
      db.transaction?.(async (tx) => {
        await tx.query('INSERT INTO nested_reservation (id) VALUES (5)');
        throw new Error('outer rollback');
      }),
    ).rejects.toThrow('outer rollback');
    expect(
      (await db.query('SELECT id FROM nested_reservation ORDER BY id')).rows,
    ).toEqual([{ id: 1 }, { id: 2 }, { id: 4 }]);
    await db.close?.();
  });

  it('normalizes boolean parameters across public SQLite operations', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query(`
      CREATE TABLE boolean_values (
        id TEXT PRIMARY KEY,
        active INTEGER NOT NULL,
        visible INTEGER NOT NULL,
        payload TEXT NOT NULL
      )
    `);

    await db.insert('boolean_values', {
      id: 'one',
      active: true,
      visible: false,
      payload: { nested: true },
    });
    await db.update('boolean_values', { active: true }, { visible: true });
    await db.upsert('boolean_values', ['id'], {
      id: 'one',
      active: false,
      visible: true,
      payload: { nested: false },
    });

    expect(await db.get('boolean_values', { active: false })).toEqual({
      id: 'one',
      active: 0,
      visible: 1,
      payload: '{"nested":false}',
    });
    expect(
      (await db.query('SELECT id FROM boolean_values WHERE visible = ?', true))
        .rows,
    ).toEqual([{ id: 'one' }]);
    expect(
      await db.single`SELECT id FROM boolean_values WHERE active = ${false}`,
    ).toEqual({ id: 'one' });
    expect(
      (
        await db.query(
          "SELECT '$1' AS literal, id FROM boolean_values /* $2 */ WHERE id = $1",
          'one',
        )
      ).rows,
    ).toEqual([{ literal: '$1', id: 'one' }]);
    await db.close?.();
  });

  it('serializes concurrent nested callback transactions and drains failures', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'app.db');
    const db = await getDatabase({
      type: 'sqlite',
      url: databasePath,
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE sibling_callbacks (id INTEGER PRIMARY KEY)');

    await txOf(db)(async (outer) => {
      await Promise.all([
        txOf(outer)(async (first) => {
          await first.query('INSERT INTO sibling_callbacks (id) VALUES (1)');
        }),
        txOf(outer)(async (second) => {
          await second.query('INSERT INTO sibling_callbacks (id) VALUES (2)');
        }),
      ]);
    });

    const secondStarted = deferred();
    const continueSecond = deferred();
    let outerSettled = false;
    const rollingBack = txOf(db)(async (outer) => {
      const first = txOf(outer)(async () => {
        throw new Error('first sibling failed');
      });
      const second = txOf(outer)(async (later) => {
        secondStarted.resolve();
        await continueSecond.promise;
        await later.query('INSERT INTO sibling_callbacks (id) VALUES (3)');
      });
      await Promise.all([first, second]);
    });
    void rollingBack.then(
      () => {
        outerSettled = true;
      },
      () => {
        outerSettled = true;
      },
    );
    await secondStarted.promise;

    let closeSettled = false;
    const closing = db.close?.().finally(() => {
      closeSettled = true;
    });
    if (!closing) throw new Error('close unavailable');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(outerSettled).toBe(false);
    expect(closeSettled).toBe(false);

    continueSecond.resolve();
    await expect(rollingBack).rejects.toThrow('first sibling failed');
    await expect(closing).resolves.toBeUndefined();

    const reopened = await getDatabase({
      type: 'sqlite',
      url: databasePath,
      secureFile,
      cache: false,
    });
    expect(
      (await reopened.query('SELECT id FROM sibling_callbacks ORDER BY id'))
        .rows,
    ).toEqual([{ id: 1 }, { id: 2 }]);
    await reopened.close?.();
  });

  it('serializes and drains concurrent nested manual transactions', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE sibling_manual (id INTEGER PRIMARY KEY)');
    const handle = await db.beginTransaction?.();
    if (!handle) throw new Error('beginTransaction unavailable');

    await Promise.all([
      txOf(handle)(async (first) => {
        await first.query('INSERT INTO sibling_manual (id) VALUES (1)');
      }),
      txOf(handle)(async (second) => {
        await second.query('INSERT INTO sibling_manual (id) VALUES (2)');
      }),
    ]);
    await expect(
      txOf(handle)(async (failed) => {
        await failed.query('INSERT INTO sibling_manual (id) VALUES (3)');
        throw new Error('manual child failed');
      }),
    ).rejects.toThrow('manual child failed');

    const childStarted = deferred();
    const continueChild = deferred();
    const child = txOf(handle)(async (nested) => {
      childStarted.resolve();
      await continueChild.promise;
      await nested.query('INSERT INTO sibling_manual (id) VALUES (4)');
    });
    await childStarted.promise;
    let commitSettled = false;
    const committing = handle.commit().finally(() => {
      commitSettled = true;
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(commitSettled).toBe(false);
    continueChild.resolve();
    await expect(child).resolves.toBeUndefined();
    await expect(committing).resolves.toBeUndefined();

    expect(
      (await db.query('SELECT id FROM sibling_manual ORDER BY id')).rows,
    ).toEqual([{ id: 1 }, { id: 2 }, { id: 4 }]);
    await db.close?.();
  });

  it('keeps null-aware upserts inside callback transaction reservations', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query(`
        CREATE TABLE callback_nullable_reservation (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL,
          tenant_id TEXT,
          value TEXT,
          UNIQUE(slug, tenant_id)
        )
      `);

    await db.transaction?.(async (tx) => {
      await tx.upsert('callback_nullable_reservation', ['slug', 'tenant_id'], {
        id: 'committed',
        slug: 'shared',
        tenant_id: null,
        value: 'one',
      });
      await tx.upsert('callback_nullable_reservation', ['slug', 'tenant_id'], {
        id: 'updated',
        slug: 'shared',
        tenant_id: null,
        value: 'two',
      });
    });

    await expect(
      db.transaction?.(async (tx) => {
        await tx.upsert(
          'callback_nullable_reservation',
          ['slug', 'tenant_id'],
          {
            id: 'rolled-back',
            slug: 'shared',
            tenant_id: null,
            value: 'three',
          },
        );
        throw new Error('rollback callback upsert');
      }),
    ).rejects.toThrow('rollback callback upsert');

    expect(
      (await db.query('SELECT id, value FROM callback_nullable_reservation'))
        .rows,
    ).toEqual([{ id: 'updated', value: 'two' }]);
    await db.close?.();
  }, 2_000);

  it('keeps null-aware upserts inside manual transaction reservations', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query(`
        CREATE TABLE manual_nullable_reservation (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL,
          tenant_id TEXT,
          value TEXT,
          UNIQUE(slug, tenant_id)
        )
      `);

    const committed = await db.beginTransaction?.();
    if (!committed) throw new Error('beginTransaction unavailable');
    await committed.upsert(
      'manual_nullable_reservation',
      ['slug', 'tenant_id'],
      { id: 'committed', slug: 'shared', tenant_id: null, value: 'one' },
    );
    await committed.commit();

    const rolledBack = await db.beginTransaction?.();
    if (!rolledBack) throw new Error('beginTransaction unavailable');
    await rolledBack.upsert(
      'manual_nullable_reservation',
      ['slug', 'tenant_id'],
      {
        id: 'rolled-back',
        slug: 'shared',
        tenant_id: null,
        value: 'two',
      },
    );
    await rolledBack.rollback();

    expect(
      (await db.query('SELECT id, value FROM manual_nullable_reservation'))
        .rows,
    ).toEqual([{ id: 'committed', value: 'one' }]);
    await db.close?.();
  }, 2_000);

  it('supports composite bigint and null conflict values in every transaction route', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query(`
      CREATE TABLE bigint_nullable (
        id TEXT PRIMARY KEY,
        scope INTEGER NOT NULL,
        tenant_id TEXT,
        value TEXT,
        UNIQUE(scope, tenant_id)
      )
    `);

    const topLevel = 9007199254740993n;
    await db.upsert('bigint_nullable', ['scope', 'tenant_id'], {
      id: 'top-one',
      scope: topLevel,
      tenant_id: null,
      value: 'one',
    });
    await db.upsert('bigint_nullable', ['scope', 'tenant_id'], {
      id: 'top-two',
      scope: topLevel,
      tenant_id: null,
      value: 'two',
    });

    await txOf(db)(async (tx) => {
      await tx.upsert('bigint_nullable', ['scope', 'tenant_id'], {
        id: 'callback',
        scope: 9007199254740995n,
        tenant_id: null,
        value: 'callback',
      });
    });

    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');
    await manual.upsert('bigint_nullable', ['scope', 'tenant_id'], {
      id: 'manual',
      scope: 9007199254740997n,
      tenant_id: null,
      value: 'manual',
    });
    await manual.rollback();

    expect(
      (
        await db.query(
          'SELECT id, scope, value FROM bigint_nullable ORDER BY scope',
        )
      ).rows,
    ).toEqual([
      { id: 'top-two', scope: topLevel, value: 'two' },
      {
        id: 'callback',
        scope: 9007199254740995n,
        value: 'callback',
      },
    ]);
    await db.close?.();
  });

  it('reserves the connection for a manual transaction handle', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE manual_reservation (id INTEGER PRIMARY KEY)');
    const handle = await db.beginTransaction?.();
    if (!handle) throw new Error('beginTransaction unavailable');
    await handle.query('INSERT INTO manual_reservation (id) VALUES (1)');

    let outsiderSettled = false;
    const outsider = db
      .query('INSERT INTO manual_reservation (id) VALUES (2)')
      .finally(() => {
        outsiderSettled = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(outsiderSettled).toBe(false);

    await handle.rollback();
    await expect(outsider).resolves.toMatchObject({ rowCount: 1 });
    expect((await db.query('SELECT id FROM manual_reservation')).rows).toEqual([
      { id: 2 },
    ]);
    await db.close?.();
  });

  it('binds and reads SQLite integers without losing precision', async () => {
    const root = await makeTempRoot();
    const client = await createTrustedClient(join(root, 'app.db'));
    await client.execute('CREATE TABLE values_table (value INTEGER)');

    await client.execute({
      sql: 'INSERT INTO values_table (value) VALUES (?), (?)',
      args: [1n, 9007199254740993n],
    });
    expect(
      await client.execute('SELECT value FROM values_table ORDER BY value'),
    ).toMatchObject({ rows: [{ value: 1 }, { value: 9007199254740993n }] });
    await client.close();
  });

  it('fails rather than rounding a row count outside the public range', () => {
    expect(() =>
      toPublicRowCount(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
    ).toThrow('exceed the public safe-integer row-count range');
  });

  it('preserves lastInsertRowid beyond Number.MAX_SAFE_INTEGER', async () => {
    const root = await makeTempRoot();
    const client = await createTrustedClient(join(root, 'app.db'));
    await client.execute('CREATE TABLE ids (id INTEGER PRIMARY KEY)');

    const inserted = await client.execute(
      'INSERT INTO ids (id) VALUES (9007199254740993)',
    );
    expect(inserted.lastInsertRowid).toBe(9007199254740993n);
    await client.close();
  });

  it('does not leave a failed acquisition cached', async () => {
    const root = await makeTempRoot();
    const target = join(root, 'target.txt');
    const databasePath = join(root, 'app.db');
    await writeFile(target, 'untouched');
    await symlink(target, databasePath);

    const options = {
      type: 'sqlite' as const,
      url: databasePath,
      secureFile,
      dbid: 'secure-retry',
    };
    await expect(getDatabase(options)).rejects.toThrow(
      'database leaf must be a regular file',
    );

    await rm(databasePath);
    const db = await getDatabase(options);
    await db.execute`CREATE TABLE recovered (id INTEGER PRIMARY KEY)`;
    expect(await db.tableExists('recovered')).toBe(true);
    await db.close?.();
  });

  it('fails closed on unsupported platforms before loading the driver', async () => {
    let driverLoaded = false;
    await expect(
      createSecureSqliteClient('/tmp/app.db', trustedParent, {
        platform: 'win32',
        loadDriver: async () => {
          driverLoaded = true;
          return loadNodeSqliteDriver();
        },
      }),
    ).rejects.toThrow('unsupported on win32');
    expect(driverLoaded).toBe(false);
  });

  it('fails closed with an actionable error when the secure driver cannot load', async () => {
    const root = await makeTempRoot();
    await expect(
      createSecureSqliteClient(join(root, 'app.db'), trustedParent, {
        platform: process.platform,
        loadDriver: async () => {
          throw new Error('native binding unavailable');
        },
      }),
    ).rejects.toThrow('could not load the node:sqlite driver');
  });

  it('rejects backends and options that cannot preserve the guarantee', async () => {
    await expect(
      getDatabase({
        type: 'sqlite',
        url: 'libsql://example.turso.io',
        secureFile,
        cache: false,
      }),
    ).rejects.toThrow('requires a local file-backed database');

    await expect(
      getDatabase({
        type: 'sqlite',
        url: ':memory:',
        secureFile,
        cache: false,
      }),
    ).rejects.toThrow('requires a local file-backed database');

    await expect(
      getDatabase({
        type: 'sqlite',
        url: './app.db',
        secureFile,
        capabilities: { vector: true },
        cache: false,
      }),
    ).rejects.toThrow('cannot be combined with native SQLite capabilities');

    await expect(
      getDatabase({
        type: 'sqlite',
        url: './app.db',
        secureFile: { driver: 'libsql' } as any,
        cache: false,
      }),
    ).rejects.toThrow('Unsupported secure SQLite driver');
  });
});
