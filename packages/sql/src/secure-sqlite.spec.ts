import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
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
} from './secure-sqlite-client';

const tempRoots = new Set<string>();
const trustedParent = { custody: 'trusted-parent' } as const;
const secureFile = {
  driver: 'sqlite3',
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

async function loadSqlite3Driver() {
  const imported = await import('sqlite3');
  return imported.default as any;
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

afterEach(async () => {
  await Promise.all(
    [...tempRoots].map((root) => rm(root, { recursive: true, force: true })),
  );
  tempRoots.clear();
});

describe('secure SQLite file acquisition', () => {
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
          return loadSqlite3Driver();
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
          return loadSqlite3Driver();
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
          return loadSqlite3Driver();
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
      loadDriver: loadSqlite3Driver,
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
        loadDriver: loadSqlite3Driver,
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
        secureFile: { driver: 'sqlite3' } as any,
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
          return loadSqlite3Driver();
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
          return loadSqlite3Driver();
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
        loadDriver: loadSqlite3Driver,
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
        loadDriver: loadSqlite3Driver,
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
          return loadSqlite3Driver();
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

  it('fails closed when the leaf is replaced immediately before driver acquisition', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'app.db');
    const displacedPath = join(root, 'original.db');
    const target = join(root, 'target.txt');
    await writeFile(databasePath, 'original');
    await writeFile(target, 'untouched');

    const runtime: SecureSqliteRuntime = {
      platform: process.platform,
      loadDriver: loadSqlite3Driver,
      beforeDriverOpen: async (acquisitionPath) => {
        expect(acquisitionPath).toBe(databasePath);
        await rename(databasePath, displacedPath);
        await symlink(target, databasePath);
      },
    };

    await expect(
      createSecureSqliteClient(databasePath, trustedParent, runtime),
    ).rejects.toThrow('Secure SQLite acquisition rejected');
    expect(await readFile(target, 'utf8')).toBe('untouched');
    expect(await readFile(displacedPath, 'utf8')).toBe('original');
  });

  it('keeps the acquired handle bound when the pathname is replaced after open', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'app.db');
    const displacedPath = join(root, 'acquired.db');
    const replacementPath = join(root, 'replacement.db');

    const original = await createTrustedClient(databasePath);
    await original.execute(
      'CREATE TABLE identity_marker (value TEXT NOT NULL)',
    );
    await original.execute(
      "INSERT INTO identity_marker (value) VALUES ('acquired')",
    );
    await original.close();

    const replacement = await createTrustedClient(replacementPath);
    await replacement.execute(
      'CREATE TABLE identity_marker (value TEXT NOT NULL)',
    );
    await replacement.execute(
      "INSERT INTO identity_marker (value) VALUES ('replacement')",
    );
    await replacement.close();

    const acquired = await createSecureSqliteClient(
      databasePath,
      trustedParent,
      {
        platform: process.platform,
        loadDriver: loadSqlite3Driver,
        afterDriverOpen: async (acquisitionPath) => {
          expect(acquisitionPath).toBe(databasePath);
          await rename(databasePath, displacedPath);
          await rename(replacementPath, databasePath);
        },
      },
    );

    expect(
      await acquired.execute('SELECT value FROM identity_marker'),
    ).toMatchObject({ rows: [{ value: 'acquired' }] });
    await acquired.close();

    const currentPath = await createTrustedClient(databasePath);
    expect(
      await currentPath.execute('SELECT value FROM identity_marker'),
    ).toMatchObject({ rows: [{ value: 'replacement' }] });
    await currentPath.close();

    const acquiredPath = await createTrustedClient(displacedPath);
    expect(
      await acquiredPath.execute('SELECT value FROM identity_marker'),
    ).toMatchObject({ rows: [{ value: 'acquired' }] });
    await acquiredPath.close();
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
    ).rejects.toThrow('Failed to execute raw query');
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

  it('rejects BigInt parameters instead of silently binding NULL', async () => {
    const root = await makeTempRoot();
    const client = await createTrustedClient(join(root, 'app.db'));
    await client.execute('CREATE TABLE values_table (value INTEGER)');

    await expect(
      client.execute({
        sql: 'INSERT INTO values_table (value) VALUES (?)',
        args: [1n],
      }),
    ).rejects.toThrow('BigInt parameters are unsupported');
    expect(
      await client.execute('SELECT COUNT(*) AS count FROM values_table'),
    ).toMatchObject({ rows: [{ count: 0 }] });
    await client.close();
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
          return loadSqlite3Driver();
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
    ).rejects.toThrow('could not load the sqlite3 driver');
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
