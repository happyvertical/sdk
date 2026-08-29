import {
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
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import {
  createSecureSqliteClient,
  type SecureSqliteRuntime,
} from './secure-sqlite-client';

const tempRoots = new Set<string>();

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

afterEach(async () => {
  await Promise.all(
    [...tempRoots].map((root) => rm(root, { recursive: true, force: true })),
  );
  tempRoots.clear();
});

describe('secure SQLite file acquisition', () => {
  it('creates, transacts, closes, and reopens a regular database', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'app.db');
    const db = await getDatabase({
      type: 'sqlite',
      url: databasePath,
      secureFile: true,
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
      secureFile: { driver: 'sqlite3' },
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
        secureFile: true,
        cache: false,
      }),
    ).rejects.toThrow('Secure SQLite acquisition rejected');
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
        secureFile: true,
        cache: false,
      }),
    ).rejects.toThrow('Secure SQLite acquisition rejected');
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
      createSecureSqliteClient(databasePath, runtime),
    ).rejects.toThrow('Secure SQLite acquisition rejected');
    expect(await readFile(target, 'utf8')).toBe('untouched');
    expect(await readFile(displacedPath, 'utf8')).toBe('original');
  });

  it('keeps the acquired handle bound when the pathname is replaced after open', async () => {
    const root = await makeTempRoot();
    const databasePath = join(root, 'app.db');
    const displacedPath = join(root, 'acquired.db');
    const replacementPath = join(root, 'replacement.db');

    const original = await createSecureSqliteClient(databasePath);
    await original.execute(
      'CREATE TABLE identity_marker (value TEXT NOT NULL)',
    );
    await original.execute(
      "INSERT INTO identity_marker (value) VALUES ('acquired')",
    );
    await original.close();

    const replacement = await createSecureSqliteClient(replacementPath);
    await replacement.execute(
      'CREATE TABLE identity_marker (value TEXT NOT NULL)',
    );
    await replacement.execute(
      "INSERT INTO identity_marker (value) VALUES ('replacement')",
    );
    await replacement.close();

    const acquired = await createSecureSqliteClient(databasePath, {
      platform: process.platform,
      loadDriver: loadSqlite3Driver,
      afterDriverOpen: async (acquisitionPath) => {
        expect(acquisitionPath).toBe(databasePath);
        await rename(databasePath, displacedPath);
        await rename(replacementPath, databasePath);
      },
    });

    expect(
      await acquired.execute('SELECT value FROM identity_marker'),
    ).toMatchObject({ rows: [{ value: 'acquired' }] });
    await acquired.close();

    const currentPath = await createSecureSqliteClient(databasePath);
    expect(
      await currentPath.execute('SELECT value FROM identity_marker'),
    ).toMatchObject({ rows: [{ value: 'replacement' }] });
    await currentPath.close();

    const acquiredPath = await createSecureSqliteClient(displacedPath);
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
      secureFile: true,
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

  it('does not leave a failed acquisition cached', async () => {
    const root = await makeTempRoot();
    const target = join(root, 'target.txt');
    const databasePath = join(root, 'app.db');
    await writeFile(target, 'untouched');
    await symlink(target, databasePath);

    const options = {
      type: 'sqlite' as const,
      url: databasePath,
      secureFile: true,
      dbid: 'secure-retry',
    };
    await expect(getDatabase(options)).rejects.toThrow(
      'Secure SQLite acquisition rejected',
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
      createSecureSqliteClient('/tmp/app.db', {
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
    await expect(
      createSecureSqliteClient('/tmp/app.db', {
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
        secureFile: true,
        cache: false,
      }),
    ).rejects.toThrow('requires a local file-backed database');

    await expect(
      getDatabase({
        type: 'sqlite',
        url: ':memory:',
        secureFile: true,
        cache: false,
      }),
    ).rejects.toThrow('requires a local file-backed database');

    await expect(
      getDatabase({
        type: 'sqlite',
        url: './app.db',
        secureFile: true,
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
