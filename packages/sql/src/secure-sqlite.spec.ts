import { rmSync, writeFileSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
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
import { toSafeSqliteCount } from './sqlite';

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
      '024.18.0',
      '24.018.0',
      '24.18.00',
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
      parseDarwinAclListing(
        'drwx------+ 2 user staff 64 Aug 29 15:07 /Users/user\n 0: group:everyone deny delete',
      ),
    ).toBe(false);
    expect(
      parseDarwinAclListing(
        'drwx------+ 2 user staff 64 Aug 29 15:07 /data\n 0: group:everyone deny delete\n 1: user:guest allow write,delete',
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
    expect(() =>
      parseDarwinAclListing(
        'drwx------+ 2 user staff 64 Aug 29 15:07 /data\n malformed entry',
      ),
    ).toThrow('unrecognized entry');
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
    ).rejects.toThrow('contains a permissive macOS access control list');
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
    ).rejects.toThrow('contains a permissive macOS access control list');
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

  it('creates a new database leaf with restrictive permissions under a permissive umask', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'permissive-umask.db');
    const previousUmask = process.umask(0o000);
    let client: Awaited<ReturnType<typeof createTrustedClient>> | undefined;

    try {
      client = await createTrustedClient(databasePath);
    } finally {
      process.umask(previousUmask);
    }

    try {
      expect((await lstat(databasePath)).mode & 0o777).toBe(0o600);
    } finally {
      await client?.close();
    }
  });

  it('removes a securely precreated leaf when driver acquisition fails', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'failed-open.db');

    await expect(
      createSecureSqliteClient(databasePath, trustedParent, {
        platform: process.platform,
        loadDriver: async () =>
          ({
            // biome-ignore lint/style/useNamingConvention: mirrors node:sqlite's public API
            DatabaseSync: class {
              constructor() {
                throw new Error('open failed');
              }
            },
          }) as any,
      }),
    ).rejects.toThrow('rejected the database path');
    await expect(lstat(databasePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails closed if a newly created leaf disappears during custody revalidation', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'disappearing.db');

    await expect(
      createSecureSqliteClient(databasePath, trustedParent, {
        platform: 'darwin',
        inspectDarwinAcl: async (path) => {
          if (path === databasePath) await rm(databasePath);
          return false;
        },
        loadDriver: loadNodeSqliteDriver,
      }),
    ).rejects.toThrow('leaf changed during acquisition');
    await expect(lstat(databasePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not remove a replacement leaf when driver acquisition fails', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'replaced-before-cleanup.db');

    await expect(
      createSecureSqliteClient(databasePath, trustedParent, {
        platform: process.platform,
        loadDriver: async () =>
          ({
            // biome-ignore lint/style/useNamingConvention: mirrors node:sqlite's public API
            DatabaseSync: class {
              constructor() {
                rmSync(databasePath);
                writeFileSync(databasePath, 'replacement', { mode: 0o600 });
                throw new Error('open failed after replacement');
              }
            },
          }) as any,
      }),
    ).rejects.toThrow('rejected the database path');
    expect(await readFile(databasePath, 'utf8')).toBe('replacement');
  });

  it('compares cleanup identities as exact bigints', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'bigint-identity.db');
    const createdIdentity = 9_007_199_254_740_992n;
    const replacementIdentity = 9_007_199_254_740_993n;
    let statRequestedBigints = false;
    let lstatRequestedBigints = false;

    await expect(
      createSecureSqliteClient(databasePath, trustedParent, {
        platform: process.platform,
        openLeaf: async (...args) => {
          const handle = await open(...args);
          return new Proxy(handle, {
            get(target, property) {
              if (property === 'stat') {
                return async (options?: { bigint?: boolean }) => {
                  statRequestedBigints = options?.bigint === true;
                  return {
                    ...(await target.stat({ bigint: true })),
                    dev: createdIdentity,
                    ino: createdIdentity,
                  };
                };
              }
              const value = Reflect.get(target, property, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        },
        lstatLeaf: (async (_path, options?: { bigint?: boolean }) => {
          lstatRequestedBigints = options?.bigint === true;
          return {
            ...(await lstat(databasePath, { bigint: true })),
            dev: replacementIdentity,
            ino: replacementIdentity,
          };
        }) as typeof lstat,
        loadDriver: async () =>
          ({
            // biome-ignore lint/style/useNamingConvention: mirrors node:sqlite's public API
            DatabaseSync: class {
              constructor() {
                throw new Error('driver rejected leaf');
              }
            },
          }) as any,
      }),
    ).rejects.toThrow('leaf changed during acquisition');

    expect(statRequestedBigints).toBe(true);
    expect(lstatRequestedBigints).toBe(true);
    expect((await lstat(databasePath)).isFile()).toBe(true);
  });

  it('closes the created leaf and leaves it in place when identity inspection fails', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'failed-stat.db');
    let closeCalls = 0;

    await expect(
      createSecureSqliteClient(databasePath, trustedParent, {
        platform: process.platform,
        openLeaf: async (...args) => {
          const handle = await open(...args);
          return new Proxy(handle, {
            get(target, property) {
              if (property === 'stat') {
                return async () => {
                  throw new Error('fstat failed');
                };
              }
              if (property === 'close') {
                return async () => {
                  closeCalls += 1;
                  await target.close();
                };
              }
              const value = Reflect.get(target, property, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        },
        loadDriver: loadNodeSqliteDriver,
      }),
    ).rejects.toThrow('could not close the created leaf');
    expect(closeCalls).toBe(1);
    expect((await lstat(databasePath)).isFile()).toBe(true);
  });

  it('identity-guards cleanup when closing the created leaf fails after replacement', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'replaced-during-close.db');

    await expect(
      createSecureSqliteClient(databasePath, trustedParent, {
        platform: process.platform,
        openLeaf: async (...args) => {
          const handle = await open(...args);
          return new Proxy(handle, {
            get(target, property) {
              if (property === 'close') {
                return async () => {
                  await target.close();
                  rmSync(databasePath);
                  writeFileSync(databasePath, 'replacement', { mode: 0o600 });
                  throw new Error('close failed after replacement');
                };
              }
              const value = Reflect.get(target, property, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
        },
        loadDriver: loadNodeSqliteDriver,
      }),
    ).rejects.toThrow('could not close the created leaf');
    expect(await readFile(databasePath, 'utf8')).toBe('replacement');
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
    await expect(
      db.client.execute('INSERT INTO close_reservation (id) VALUES (4)'),
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

  it('guards public client execution with database and transaction lifetimes', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE guarded_client (id INTEGER PRIMARY KEY)');

    let callbackScope: DatabaseInterface | undefined;
    await txOf(db)(async (tx) => {
      callbackScope = tx;
      await tx.client.execute('INSERT INTO guarded_client (id) VALUES (1)');
    });
    if (!callbackScope) throw new Error('callback scope unavailable');
    await expect(
      callbackScope.client.execute(
        'INSERT INTO guarded_client (id) VALUES (2)',
      ),
    ).rejects.toThrow('Transaction scope is ending or ended');

    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');
    await manual.client.execute('INSERT INTO guarded_client (id) VALUES (3)');
    await manual.commit();
    await expect(
      manual.client.execute('INSERT INTO guarded_client (id) VALUES (4)'),
    ).rejects.toThrow('Transaction scope is ending or ended');

    expect(
      (await db.query('SELECT id FROM guarded_client ORDER BY id')).rows,
    ).toEqual([{ id: 1 }, { id: 3 }]);
    await db.close?.();
  });

  it('preserves the default LibSQL transaction client execute overload', async () => {
    const db = await getDatabase({
      type: 'sqlite',
      url: ':memory:',
      cache: false,
    });
    await db.query('CREATE TABLE libsql_client (id INTEGER PRIMARY KEY)');

    await txOf(db)(async (tx) => {
      await tx.client.execute('INSERT INTO libsql_client (id) VALUES (?)', [1]);
    });

    expect(
      (await db.query('SELECT id FROM libsql_client ORDER BY id')).rows,
    ).toEqual([{ id: 1 }]);
    await db.close?.();
  });

  it('fails atomically when SQLite automatically rolls a transaction back', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query(`
      CREATE TABLE automatic_rollback (
        id INTEGER PRIMARY KEY ON CONFLICT ROLLBACK
      )
    `);

    await expect(
      txOf(db)(async (tx) => {
        await tx.query('INSERT INTO automatic_rollback (id) VALUES (1)');
        const conflict = tx.query(
          'INSERT INTO automatic_rollback (id) VALUES (1)',
        );
        const acceptedLater = tx.query(
          'INSERT INTO automatic_rollback (id) VALUES (2)',
        );
        await conflict.catch((error) => {
          expect(error).toBeInstanceOf(Error);
        });
        await acceptedLater.catch((error) => {
          expect(error).toBeInstanceOf(Error);
        });
      }),
    ).rejects.toThrow();
    expect(await db.count('automatic_rollback')).toBe(0);

    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');
    await manual.query('INSERT INTO automatic_rollback (id) VALUES (3)');
    const manualConflict = manual.query(
      'INSERT INTO automatic_rollback (id) VALUES (3)',
    );
    const manualLater = manual.query(
      'INSERT INTO automatic_rollback (id) VALUES (4)',
    );
    await manualConflict.catch((error) => {
      expect(error).toBeInstanceOf(Error);
    });
    await manualLater.catch((error) => {
      expect(error).toBeInstanceOf(Error);
    });
    await expect(manual.commit()).rejects.toThrow();
    expect(await db.count('automatic_rollback')).toBe(0);

    await expect(
      txOf(db)(async (outer) => {
        await outer.query('INSERT INTO automatic_rollback (id) VALUES (5)');
        await txOf(outer)(async (inner) => {
          await inner.query('INSERT INTO automatic_rollback (id) VALUES (6)');
          const conflict = inner.query(
            'INSERT INTO automatic_rollback (id) VALUES (6)',
          );
          const acceptedLater = inner.query(
            'INSERT INTO automatic_rollback (id) VALUES (7)',
          );
          await conflict.catch((error) => {
            expect(error).toBeInstanceOf(Error);
          });
          await acceptedLater.catch((error) => {
            expect(error).toBeInstanceOf(Error);
          });
        }).catch(() => undefined);
      }),
    ).rejects.toThrow();
    expect(await db.count('automatic_rollback')).toBe(0);
    await db.close?.();
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

  it('rolls back when accepted unawaited work fails in callback, nested, and manual scopes', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE accepted_failure (id INTEGER PRIMARY KEY)');

    await expect(
      txOf(db)(async (tx) => {
        await tx.insert('accepted_failure', { id: 1 });
        void tx.insert('accepted_failure', { id: 1 });
      }),
    ).rejects.toThrow();
    expect(await db.count('accepted_failure')).toBe(0);

    await expect(
      txOf(db)(async (outer) => {
        await outer.insert('accepted_failure', { id: 2 });
        await txOf(outer)(async (inner) => {
          await inner.insert('accepted_failure', { id: 3 });
          void inner.insert('accepted_failure', { id: 3 });
        });
      }),
    ).rejects.toThrow();
    expect(await db.count('accepted_failure')).toBe(0);

    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');
    await manual.insert('accepted_failure', { id: 4 });
    void manual.insert('accepted_failure', { id: 4 });
    await expect(manual.commit()).rejects.toThrow();
    expect(await db.count('accepted_failure')).toBe(0);

    let combinedFailure: unknown;
    try {
      await txOf(db)(async (tx) => {
        await tx.insert('accepted_failure', { id: 5 });
        void tx.insert('accepted_failure', { id: 5 });
        throw new Error('primary callback failure');
      });
    } catch (error) {
      combinedFailure = error;
    }
    expect(combinedFailure).toBeInstanceOf(AggregateError);
    expect(
      (combinedFailure as AggregateError).errors.some(
        (error) =>
          error instanceof Error &&
          error.message === 'primary callback failure',
      ),
    ).toBe(true);
    expect(await db.count('accepted_failure')).toBe(0);

    await db.close?.();
  });

  it('propagates detached nested failures while preserving observed savepoint recovery', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE nested_observation (id INTEGER PRIMARY KEY)');

    await expect(
      txOf(db)(async (outer) => {
        await outer.insert('nested_observation', { id: 1 });
        void txOf(outer)(async (inner) => {
          await inner.insert('nested_observation', { id: 2 });
          void inner.insert('nested_observation', { id: 2 });
        });
      }),
    ).rejects.toThrow();
    expect(await db.count('nested_observation')).toBe(0);

    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');
    await manual.insert('nested_observation', { id: 3 });
    void txOf(manual)(async (inner) => {
      await inner.insert('nested_observation', { id: 4 });
      void inner.insert('nested_observation', { id: 4 });
    });
    await expect(manual.commit()).rejects.toThrow();
    expect(await db.count('nested_observation')).toBe(0);

    await txOf(db)(async (outer) => {
      await outer.insert('nested_observation', { id: 5 });
      void txOf(outer)(async (inner) => {
        await inner.insert('nested_observation', { id: 6 });
      });
    });

    await txOf(db)(async (outer) => {
      await outer.insert('nested_observation', { id: 7 });
      await txOf(outer)(async (inner) => {
        await inner.insert('nested_observation', { id: 8 });
        throw new Error('observed nested rollback');
      }).catch((error) => {
        expect(error).toMatchObject({ message: 'observed nested rollback' });
      });
      await outer.insert('nested_observation', { id: 9 });
    });

    expect(
      (await db.query('SELECT id FROM nested_observation ORDER BY id')).rows,
    ).toEqual([{ id: 5 }, { id: 6 }, { id: 7 }, { id: 9 }]);
    await db.close?.();
  });

  it('returns native Promise instances for secure scoped operations and nesting', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE native_promises (id INTEGER PRIMARY KEY)');
    let operationRecovered = false;
    let nestedRecovered = false;

    await txOf(db)(async (tx) => {
      const operation = tx.insert('native_promises', { id: 1 });
      expect(operation).toBeInstanceOf(Promise);
      await Promise.prototype.then.call(operation, (value) => value);
      const failedOperation = tx.insert('native_promises', { id: 1 });
      void Promise.prototype.then.call(failedOperation, undefined, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        operationRecovered = true;
      });

      const nested = txOf(tx)(async (inner) => {
        await inner.insert('native_promises', { id: 2 });
        return 42;
      });
      expect(nested).toBeInstanceOf(Promise);
      await expect(
        Promise.prototype.then.call(nested, (value) => value),
      ).resolves.toBe(42);

      const failedNested = txOf(tx)(async (inner) => {
        await inner.insert('native_promises', { id: 3 });
        throw new Error('intrinsic recovery');
      });
      void Promise.prototype.then.call(failedNested, undefined, async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        nestedRecovered = true;
      });
      await tx.insert('native_promises', { id: 4 });
      expect(nestedRecovered).toBe(false);
    });

    expect(operationRecovered).toBe(true);
    expect(nestedRecovered).toBe(true);
    expect(
      (await db.query('SELECT id FROM native_promises ORDER BY id')).rows,
    ).toEqual([{ id: 1 }, { id: 2 }, { id: 4 }]);
    await db.close?.();
  });

  it('commits after fully awaited intrinsic promise chains recover', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE intrinsic_chain (id INTEGER PRIMARY KEY)');

    await txOf(db)(async (tx) => {
      await tx.insert('intrinsic_chain', { id: 1 });
      const failed = tx.insert('intrinsic_chain', { id: 1 });
      const fulfillmentOnly = Promise.prototype.then.call(
        failed,
        (value) => value,
      ) as Promise<unknown>;
      await fulfillmentOnly.catch(() => undefined);

      const firstIntrinsicHop = Promise.prototype.then.call(
        tx.insert('intrinsic_chain', { id: 1 }),
        (value) => value,
      ) as Promise<unknown>;
      const secondIntrinsicHop = Promise.prototype.then.call(
        firstIntrinsicHop,
        (value) => value,
      ) as Promise<unknown>;
      await secondIntrinsicHop.catch(() => undefined);

      const rethrown = Promise.prototype.then.call(
        tx.insert('intrinsic_chain', { id: 1 }),
        undefined,
        () => {
          throw new Error('mapped intrinsic failure');
        },
      ) as Promise<unknown>;
      await rethrown.catch((error) => {
        expect(error).toMatchObject({ message: 'mapped intrinsic failure' });
      });
      await tx.insert('intrinsic_chain', { id: 2 });
    });

    expect(
      (await db.query('SELECT id FROM intrinsic_chain ORDER BY id')).rows,
    ).toEqual([{ id: 1 }, { id: 2 }]);
    await db.close?.();
  });

  it('commits after callers handle statement failures in callback and manual transactions', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE handled_failure (id INTEGER PRIMARY KEY)');

    await txOf(db)(async (tx) => {
      await tx.insert('handled_failure', { id: 1 });
      await tx.insert('handled_failure', { id: 1 }).catch((error) => {
        expect(error).toBeInstanceOf(Error);
      });
      await tx.insert('handled_failure', { id: 2 });
      void tx.insert('handled_failure', { id: 2 }).catch(() => undefined);
    });

    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');
    await manual.insert('handled_failure', { id: 3 });
    await manual.insert('handled_failure', { id: 3 }).catch(() => undefined);
    await manual.insert('handled_failure', { id: 4 });
    void manual.insert('handled_failure', { id: 4 }).catch(() => undefined);
    await manual.commit();

    expect(
      (await db.query('SELECT id FROM handled_failure ORDER BY id')).rows,
    ).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    await db.close?.();
  });

  it('does not treat fulfillment-only nested chains as rejection handling', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query(
      'CREATE TABLE chained_nested_failure (id INTEGER PRIMARY KEY)',
    );

    await expect(
      txOf(db)(async (outer) => {
        await outer.insert('chained_nested_failure', { id: 1 });
        void txOf(outer)(async (inner) => {
          await inner.insert('chained_nested_failure', { id: 2 });
          throw new Error('finally child failed');
        }).finally(() => undefined);
      }),
    ).rejects.toThrow('finally child failed');
    expect(await db.count('chained_nested_failure')).toBe(0);

    await expect(
      txOf(db)(async (outer) => {
        await outer.insert('chained_nested_failure', { id: 3 });
        void txOf(outer)(async () => {
          throw new Error('then child failed');
        }).then(() => undefined);
      }),
    ).rejects.toThrow('then child failed');
    expect(await db.count('chained_nested_failure')).toBe(0);

    await txOf(db)(async (outer) => {
      await outer.insert('chained_nested_failure', { id: 4 });
      void txOf(outer)(async () => {
        throw new Error('caught chained child');
      })
        .finally(() => undefined)
        .catch(() => undefined);
    });
    expect(await db.count('chained_nested_failure')).toBe(1);
    await db.close?.();
  });

  it('rolls back detached callback, manual, and nested failures whose handlers rethrow', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE rethrown_failure (id INTEGER PRIMARY KEY)');
    const rethrow = (error: unknown): never => {
      throw error;
    };

    await expect(
      txOf(db)(async (tx) => {
        await tx.insert('rethrown_failure', { id: 1 });
        void tx.insert('rethrown_failure', { id: 1 }).catch(rethrow);
      }),
    ).rejects.toThrow();
    expect(await db.count('rethrown_failure')).toBe(0);

    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');
    await manual.insert('rethrown_failure', { id: 2 });
    void manual.insert('rethrown_failure', { id: 2 }).catch(rethrow);
    await expect(manual.commit()).rejects.toThrow();
    expect(await db.count('rethrown_failure')).toBe(0);

    await expect(
      txOf(db)(async (outer) => {
        await outer.insert('rethrown_failure', { id: 3 });
        void txOf(outer)(async (inner) => {
          await inner.insert('rethrown_failure', { id: 4 });
          throw new Error('nested rethrow');
        }).catch(rethrow);
      }),
    ).rejects.toThrow('nested rethrow');
    expect(await db.count('rethrown_failure')).toBe(0);
    await db.close?.();
  });

  it('does not mistake Promise assimilation for explicit failure recovery', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE assimilated_failure (id INTEGER PRIMARY KEY)');

    await expect(
      txOf(db)(async (tx) => {
        await tx.insert('assimilated_failure', { id: 1 });
        void Promise.resolve(tx.insert('assimilated_failure', { id: 1 })).catch(
          () => undefined,
        );
      }),
    ).rejects.toThrow();
    expect(await db.count('assimilated_failure')).toBe(0);

    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');
    await manual.insert('assimilated_failure', { id: 2 });
    void Promise.all([manual.insert('assimilated_failure', { id: 2 })]).catch(
      () => undefined,
    );
    await expect(manual.commit()).rejects.toThrow();
    expect(await db.count('assimilated_failure')).toBe(0);

    await expect(
      txOf(db)(async (outer) => {
        await outer.insert('assimilated_failure', { id: 3 });
        await txOf(outer)(async (inner) => {
          await inner.insert('assimilated_failure', { id: 4 });
          void (async () => {
            await inner.insert('assimilated_failure', { id: 4 });
          })().catch(() => undefined);
        });
      }),
    ).rejects.toThrow();
    expect(await db.count('assimilated_failure')).toBe(0);
    await db.close?.();
  });

  it('recognizes explicit native then handlers as failure recovery', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE native_handler (id INTEGER PRIMARY KEY)');

    await txOf(db)(async (tx) => {
      await tx.insert('native_handler', { id: 1 });
      void tx.insert('native_handler', { id: 1 }).then(String, Number.isNaN);
    });

    expect(await db.count('native_handler')).toBe(1);
    await db.close?.();
  });

  it('preserves rejection propagation for catch without a handler', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE empty_catch (id INTEGER PRIMARY KEY)');

    await expect(
      txOf(db)(async (tx) => {
        await tx.insert('empty_catch', { id: 1 });
        await tx.insert('empty_catch', { id: 1 }).catch();
      }),
    ).rejects.not.toThrow(TypeError);
    expect(await db.count('empty_catch')).toBe(0);
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
      await outer
        .transaction?.(async (inner) => {
          await inner.query('INSERT INTO nested_reservation (id) VALUES (3)');
          throw new Error('nested rollback');
        })
        .catch((error) => {
          expect(error).toMatchObject({ message: 'nested rollback' });
        });
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

  it('rejects raw transaction control inside managed secure scopes', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE managed_control (id INTEGER PRIMARY KEY)');

    await expect(
      txOf(db)(async (tx) => {
        await tx.query('INSERT INTO managed_control (id) VALUES (1)');
        await tx.query('/* disguised */ COMMIT');
      }),
    ).rejects.toThrow('Failed to execute raw query');
    expect(await db.count('managed_control')).toBe(0);

    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');
    await manual.query('INSERT INTO managed_control (id) VALUES (2)');
    await manual.client
      .execute('-- disguised\nRELEASE SAVEPOINT hv_sp_1')
      .catch((error) => {
        expect(error).toMatchObject({
          message:
            'Transaction-control SQL is managed by the SQLite transaction scope',
        });
      });
    await manual.rollback();
    expect(await db.count('managed_control')).toBe(0);

    await db.close?.();
  });

  it('keeps parent operations outside overlapping nested savepoints', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE nested_parent_order (id INTEGER PRIMARY KEY)');

    const childStarted = deferred();
    const continueChild = deferred();
    await txOf(db)(async (outer) => {
      const child = txOf(outer)(async (inner) => {
        await inner.query('INSERT INTO nested_parent_order (id) VALUES (1)');
        childStarted.resolve();
        await continueChild.promise;
        throw new Error('child rollback');
      }).catch((error) => {
        expect(error).toMatchObject({ message: 'child rollback' });
      });
      await childStarted.promise;
      let parentSettled = false;
      const parentWrite = outer
        .query('INSERT INTO nested_parent_order (id) VALUES (2)')
        .finally(() => {
          parentSettled = true;
        });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(parentSettled).toBe(false);
      continueChild.resolve();
      await expect(child).resolves.toBeUndefined();
      await expect(parentWrite).resolves.toMatchObject({ rowCount: 1 });
    });

    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');
    const manualChildStarted = deferred();
    const continueManualChild = deferred();
    const manualChild = txOf(manual)(async (inner) => {
      await inner.query('INSERT INTO nested_parent_order (id) VALUES (3)');
      manualChildStarted.resolve();
      await continueManualChild.promise;
      throw new Error('manual child rollback');
    }).catch((error) => {
      expect(error).toMatchObject({ message: 'manual child rollback' });
    });
    await manualChildStarted.promise;
    let manualParentSettled = false;
    const manualParentWrite = manual
      .query('INSERT INTO nested_parent_order (id) VALUES (4)')
      .finally(() => {
        manualParentSettled = true;
      });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(manualParentSettled).toBe(false);
    continueManualChild.resolve();
    await expect(manualChild).resolves.toBeUndefined();
    await expect(manualParentWrite).resolves.toMatchObject({ rowCount: 1 });
    await manual.commit();

    expect(
      (await db.query('SELECT id FROM nested_parent_order ORDER BY id')).rows,
    ).toEqual([{ id: 2 }, { id: 4 }]);
    await db.close?.();
  });

  it('rejects captured parent handles inside nested callback contexts', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE captured_parent (id INTEGER PRIMARY KEY)');

    await txOf(db)(async (outer) => {
      await txOf(outer)(async (inner) => {
        await inner.query('INSERT INTO captured_parent (id) VALUES (1)');
        await outer
          .query('INSERT INTO captured_parent (id) VALUES (2)')
          .catch((error) => {
            expect(error).toMatchObject({
              message:
                'A parent transaction handle cannot run inside a nested transaction callback',
            });
          });
        await txOf(outer)(async () => undefined).catch((error) => {
          expect(error).toMatchObject({
            message:
              'A parent transaction handle cannot run inside a nested transaction callback',
          });
        });
        throw new Error('child rollback');
      }).catch((error) => {
        expect(error).toMatchObject({ message: 'child rollback' });
      });
      await outer.query('INSERT INTO captured_parent (id) VALUES (3)');
    });

    expect((await db.query('SELECT id FROM captured_parent')).rows).toEqual([
      { id: 3 },
    ]);
    await db.close?.();
  });

  it('rejects transaction-control SQL on every secure root raw route', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE root_control (id INTEGER PRIMARY KEY)');

    await expect(db.query('/* disguised */ BEGIN')).rejects.toThrow(
      'Failed to execute raw query',
    );
    await expect(db.execute`-- disguised
      SAVEPOINT external`).rejects.toThrow('Failed to execute query');
    await expect(db.client.execute('; ROLLBACK')).rejects.toThrow(
      'Transaction-control SQL is managed',
    );

    await db.query('INSERT INTO root_control (id) VALUES (1)');
    expect((await db.query('SELECT id FROM root_control')).rows).toEqual([
      { id: 1 },
    ]);
    await db.close?.();
  });

  it('validates and executes one immutable transaction-scoped statement snapshot', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query('CREATE TABLE statement_snapshot (id INTEGER PRIMARY KEY)');
    let sqlReads = 0;
    const statefulStatement = {
      get sql() {
        sqlReads += 1;
        return sqlReads === 1 ? 'SELECT 1' : 'COMMIT';
      },
      args: [],
    };

    await txOf(db)(async (tx) => {
      await tx.insert('statement_snapshot', { id: 1 });
      await tx.client.execute(statefulStatement);
      await tx.insert('statement_snapshot', { id: 2 });
    });

    expect(sqlReads).toBe(1);
    expect(
      (await db.query('SELECT id FROM statement_snapshot ORDER BY id')).rows,
    ).toEqual([{ id: 1 }, { id: 2 }]);
    await db.close?.();
  });

  it('poisons the secure client when rollback cannot normalize the connection', async () => {
    const root = await makeTempRoot();
    let inTransaction = false;
    let closeCalls = 0;
    const client = await createSecureSqliteClient(
      join(root, 'rollback-failure.db'),
      trustedParent,
      {
        platform: process.platform,
        nodeVersion: '24.18.0',
        loadDriver: async () =>
          ({
            // biome-ignore lint/style/useNamingConvention: mirrors node:sqlite's public API
            DatabaseSync: class {
              get isTransaction() {
                return inTransaction;
              }

              prepare(sql: string) {
                return {
                  setReadBigInts: () => {},
                  columns: () => [],
                  all: () => [],
                  run: () => {
                    if (/^BEGIN/i.test(sql)) inTransaction = true;
                    if (/^ROLLBACK/i.test(sql)) {
                      throw new Error('rollback I/O failure');
                    }
                    return { changes: 0n, lastInsertRowid: 0n };
                  },
                };
              }

              close() {
                closeCalls += 1;
                inTransaction = false;
              }
            },
          }) as any,
      },
    );
    const transaction = await client.transaction();

    await expect(transaction.rollback()).rejects.toThrow(
      'rollback I/O failure',
    );
    expect(closeCalls).toBe(1);
    await expect(client.execute('SELECT 1')).rejects.toThrow(
      'closing or closed',
    );
    await expect(client.close()).resolves.toBeUndefined();
    expect(closeCalls).toBe(1);
  });

  it('does not poison the client for a concurrent duplicate terminal call', async () => {
    const root = await makeTempRoot();
    const client = await createTrustedClient(join(root, 'duplicate-end.db'));
    await client.execute('CREATE TABLE duplicate_end (id INTEGER PRIMARY KEY)');
    const transaction = await client.transaction();
    await transaction.execute('INSERT INTO duplicate_end (id) VALUES (1)');

    const first = transaction.rollback();
    const duplicate = transaction.rollback();
    await expect(first).resolves.toBeUndefined();
    await expect(duplicate).rejects.toThrow('transaction is already ending');

    await client.execute('INSERT INTO duplicate_end (id) VALUES (2)');
    expect(
      await client.execute('SELECT id FROM duplicate_end ORDER BY id'),
    ).toMatchObject({ rows: [{ id: 2 }] });
    await client.close();
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
    await txOf(handle)(async (failed) => {
      await failed.query('INSERT INTO sibling_manual (id) VALUES (3)');
      throw new Error('manual child failed');
    }).catch((error) => {
      expect(error).toMatchObject({ message: 'manual child failed' });
    });

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

  it('serializes concurrent nullable upserts in callback, nested, and manual scopes', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
    });
    await db.query(`
      CREATE TABLE concurrent_nullable_scope (
        id TEXT PRIMARY KEY,
        scope INTEGER NOT NULL,
        tenant_id TEXT,
        value TEXT,
        UNIQUE(scope, tenant_id)
      )
    `);

    await txOf(db)(async (tx) => {
      await Promise.all([
        tx.upsert('concurrent_nullable_scope', ['scope', 'tenant_id'], {
          id: 'callback-one',
          scope: 2,
          tenant_id: null,
          value: 'one',
        }),
        tx.upsert('concurrent_nullable_scope', ['scope', 'tenant_id'], {
          id: 'callback-two',
          scope: 2n,
          tenant_id: null,
          value: 'two',
        }),
        tx.upsert('concurrent_nullable_scope', ['scope', 'tenant_id'], {
          id: 'callback-three',
          scope: '2',
          tenant_id: null,
          value: 'three',
        }),
      ]);
      await txOf(tx)(async (nested) => {
        await Promise.all([
          nested.upsert(
            'Concurrent_Nullable_Scope',
            ['TENANT_ID', 'SCOPE', 'SCOPE'],
            {
              id: 'nested-one',
              SCOPE: true,
              TENANT_ID: null,
              value: 'one',
            },
          ),
          nested.upsert('concurrent_nullable_scope', ['scope', 'tenant_id'], {
            id: 'nested-two',
            scope: 1,
            tenant_id: null,
            value: 'two',
          }),
        ]);
      });
    });

    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');
    await Promise.all([
      manual.upsert('concurrent_nullable_scope', ['scope', 'tenant_id'], {
        id: 'manual-one',
        scope: -0,
        tenant_id: null,
        value: 'one',
      }),
      manual.upsert('concurrent_nullable_scope', ['scope', 'tenant_id'], {
        id: 'manual-two',
        scope: 0,
        tenant_id: null,
        value: 'two',
      }),
    ]);
    expect(
      (
        await manual.query(
          'SELECT id, value FROM concurrent_nullable_scope WHERE scope = ?',
          [0],
        )
      ).rows,
    ).toEqual([{ id: 'manual-two', value: 'two' }]);
    await manual.rollback();

    expect(
      (
        await db.query(
          'SELECT id, value FROM concurrent_nullable_scope ORDER BY scope',
        )
      ).rows,
    ).toEqual([
      { id: 'nested-two', value: 'two' },
      { id: 'callback-three', value: 'three' },
    ]);
    expect(await db.count('concurrent_nullable_scope')).toBe(2);
    await db.close?.();
  });

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

  it('starts transactionQueueTimeout before an earlier outsider clears the invocation barrier', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
      transactionQueueTimeout: 50,
    });
    await db.query('CREATE TABLE timeout_order (id INTEGER PRIMARY KEY)');
    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');

    const outsider = db.query('INSERT INTO timeout_order (id) VALUES (1)');
    let callbackRan = false;
    const started = Date.now();
    const timedOut = txOf(db)(async (tx) => {
      callbackRan = true;
      await tx.query('INSERT INTO timeout_order (id) VALUES (2)');
    });
    await expect(timedOut).rejects.toThrow('Timed out after 50ms');
    expect(Date.now() - started).toBeLessThan(500);
    expect(callbackRan).toBe(false);

    await manual.rollback();
    await expect(outsider).resolves.toMatchObject({ rowCount: 1 });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(callbackRan).toBe(false);
    expect((await db.query('SELECT id FROM timeout_order')).rows).toEqual([
      { id: 1 },
    ]);
    await db.close?.();
  });

  it('starts manual transactionQueueTimeout before an earlier outsider clears the invocation barrier', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
      transactionQueueTimeout: 50,
    });
    await db.query(
      'CREATE TABLE manual_timeout_order (id INTEGER PRIMARY KEY)',
    );
    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');

    const outsider = db.query(
      'INSERT INTO manual_timeout_order (id) VALUES (1)',
    );
    const started = Date.now();
    const timedOut = db.beginTransaction?.();
    if (!timedOut) throw new Error('beginTransaction unavailable');
    await expect(timedOut).rejects.toThrow('Timed out after 50ms');
    expect(Date.now() - started).toBeLessThan(500);

    await manual.rollback();
    await expect(outsider).resolves.toMatchObject({ rowCount: 1 });
    expect(
      (await db.query('SELECT id FROM manual_timeout_order')).rows,
    ).toEqual([{ id: 1 }]);
    await db.close?.();
  });

  it('stops the queue deadline after callback and manual transactions acquire the connection', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'app.db'),
      secureFile,
      cache: false,
      transactionQueueTimeout: 30,
    });
    await db.query('CREATE TABLE acquired_deadline (id INTEGER PRIMARY KEY)');

    await txOf(db)(async (tx) => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      await tx.insert('acquired_deadline', { id: 1 });
    });

    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');
    await new Promise((resolve) => setTimeout(resolve, 80));
    await manual.insert('acquired_deadline', { id: 2 });
    await manual.commit();

    expect(await db.count('acquired_deadline')).toBe(2);
    await db.close?.();
  });

  it('uses connection-before-key ordering for nullable upserts outside and inside a transaction', async () => {
    const root = await makeTempRoot();
    const db = await getDatabase({
      type: 'sqlite',
      url: join(root, 'libsql-lock-order.db'),
      cache: false,
      transactionQueueTimeout: 500,
    });
    await db.query(
      'CREATE TABLE nullable_lock_order (id TEXT PRIMARY KEY, slug TEXT, tenant_id TEXT, value TEXT)',
    );
    const manual = await db.beginTransaction?.();
    if (!manual) throw new Error('beginTransaction unavailable');

    const outsider = db.upsert('nullable_lock_order', ['slug', 'tenant_id'], {
      id: 'outside',
      slug: 'shared',
      tenant_id: null,
      value: 'outside',
    });
    await manual.upsert('nullable_lock_order', ['slug', 'tenant_id'], {
      id: 'inside',
      slug: 'shared',
      tenant_id: null,
      value: 'inside',
    });
    await manual.commit();
    await expect(outsider).resolves.toMatchObject({ operation: 'upsert' });

    expect(await db.count('nullable_lock_order')).toBe(1);
    expect(
      await db.single`SELECT id, value FROM nullable_lock_order WHERE slug = ${'shared'} AND tenant_id IS NULL`,
    ).toEqual({ id: 'outside', value: 'outside' });
    await db.close?.();
  });

  it('does not let a transaction reserve the connection ahead of a retrying secure upsert', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'secure-retry-order.db');
    const db = await getDatabase({
      type: 'sqlite',
      url: databasePath,
      secureFile,
      cache: false,
      transactionQueueTimeout: 1_000,
    });
    await db.query(
      'CREATE TABLE secure_retry_order (id TEXT PRIMARY KEY, slug TEXT, tenant_id TEXT, value TEXT)',
    );
    const { DatabaseSync } = await import('node:sqlite');
    const external = new DatabaseSync(databasePath);
    external.exec('BEGIN EXCLUSIVE');

    const upsert = db.upsert('secure_retry_order', ['slug', 'tenant_id'], {
      id: 'upsert',
      slug: 'shared',
      tenant_id: null,
      value: 'upsert',
    });
    const transaction = txOf(db)(async (tx) => {
      await tx.insert('secure_retry_order', {
        id: 'transaction',
        slug: 'other',
        tenant_id: null,
        value: 'transaction',
      });
    });
    setTimeout(() => external.exec('COMMIT'), 80);

    await Promise.race([
      Promise.all([upsert, transaction]),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('secure lock-order deadlock')),
          2_000,
        ),
      ),
    ]);
    external.close();
    expect(await db.count('secure_retry_order')).toBe(2);
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
    expect(() =>
      toSafeSqliteCount(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
    ).toThrow('SQLite count exceeds the safe integer range');
    expect(toSafeSqliteCount(3n)).toBe(3);
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

  it('evicts an explicitly cached adapter when public client.close is used', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'client-close.db');
    const options = {
      type: 'sqlite' as const,
      url: databasePath,
      secureFile,
      dbid: databasePath,
    };
    const first = await getDatabase(options);
    await first.query('CREATE TABLE client_close (id INTEGER PRIMARY KEY)');
    await first.client.close?.();

    const reopened = await getDatabase(options);
    expect(reopened).not.toBe(first);
    await reopened.query('INSERT INTO client_close (id) VALUES (1)');
    expect((await reopened.query('SELECT id FROM client_close')).rows).toEqual([
      { id: 1 },
    ]);
    await reopened.close?.();
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
