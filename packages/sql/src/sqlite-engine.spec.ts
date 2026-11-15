import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMainThread } from 'node:worker_threads';
import type { DatabaseError } from '@happyvertical/utils';
import { afterEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import { resetSqliteFileTracking } from './shared/sqlite-engine';
import {
  type DatabaseInterface,
  ReopenNotSupportedError,
  type ReopenOptions,
} from './shared/types';

const secureFile = {
  driver: 'node:sqlite',
  custody: 'trusted-parent',
} as const;

const roots: string[] = [];
const open: DatabaseInterface[] = [];

async function tempRoot(): Promise<string> {
  // The secure path rejects symlinked components, and macOS /var is one.
  const root = await mkdtemp(join(await realpath(tmpdir()), 'sdk-engine-'));
  roots.push(root);
  return root;
}

async function track(db: DatabaseInterface): Promise<DatabaseInterface> {
  open.push(db);
  return db;
}

const secureOptions = (file: string) =>
  ({ type: 'sqlite', url: file, secureFile }) as const;
const libsqlOptions = (file: string) =>
  ({ type: 'sqlite', url: file }) as const;

async function integrity(db: DatabaseInterface): Promise<unknown[]> {
  const result = await db.query('PRAGMA integrity_check');
  return result.rows.map(
    (row: Record<string, unknown>) => Object.values(row)[0],
  );
}

afterEach(async () => {
  for (const db of open.splice(0)) await db.close?.().catch(() => {});
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
  resetSqliteFileTracking();
});

describe('DatabaseInterface.engine', () => {
  it('reports node-sqlite for a secure file connection', async () => {
    const root = await tempRoot();
    const db = await track(
      await getDatabase(secureOptions(join(root, 'a.db'))),
    );
    expect(db.engine).toBe('node-sqlite');
  });

  it('keeps libsql when every native capability is disabled', async () => {
    const root = await tempRoot();
    const db = await track(
      await getDatabase({
        type: 'sqlite',
        url: join(root, 'n.db'),
        capabilities: { vector: false, notifications: false },
      }),
    );
    // Capabilities that are all disabled keep the default engine.
    expect(db.engine).toBe('libsql');
  });

  it('reports libsql for a plain file and for an in-memory connection', async () => {
    const root = await tempRoot();
    const file = await track(
      await getDatabase(libsqlOptions(join(root, 'b.db'))),
    );
    const memory = await track(
      await getDatabase({ type: 'sqlite', url: ':memory:' }),
    );
    expect(file.engine).toBe('libsql');
    expect(memory.engine).toBe('libsql');
  });

  it('reports the same engine on transaction handles and scoped interfaces', async () => {
    const root = await tempRoot();
    for (const options of [
      secureOptions(join(root, 'c.db')),
      libsqlOptions(join(root, 'd.db')),
    ]) {
      const db = await track(await getDatabase(options));
      const handle = await db.beginTransaction?.();
      expect(handle?.engine).toBe(db.engine);
      await handle?.rollback();
      await db.transaction?.(async (tx) => {
        expect(tx.engine).toBe(db.engine);
      });
    }
  });

  it('reports the engine of the other adapters', async () => {
    const json = await track(
      await getDatabase({ type: 'json', url: await tempRoot() }),
    );
    expect(json.engine).toBe('json');
    const duck = await track(
      await getDatabase({ type: 'duckdb', url: ':memory:' }),
    );
    expect(duck.engine).toBe('duckdb');
    expect((await duck.beginTransaction?.())?.engine).toBe('duckdb');
  });
});

describe('DatabaseInterface.reopenOptions', () => {
  it.each([
    ['node-sqlite', secureOptions],
    ['libsql', libsqlOptions],
  ] as const)('reopens a %s file on the same engine and coordinates with the first connection', async (engine, make) => {
    const root = await tempRoot();
    const file = join(root, 'shared.db');
    const first = await track(await getDatabase(make(file)));
    await first.query('PRAGMA journal_mode = WAL');
    await first.query('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
    await first.query("INSERT INTO t (id, v) VALUES (1, 'a')");

    const options = first.reopenOptions?.();
    expect(options).toMatchObject({ type: 'sqlite' });
    const second = await track(await getDatabase(options as ReopenOptions));
    expect(second).not.toBe(first);
    expect(second.engine).toBe(engine);
    expect(second.engine).toBe(first.engine);

    // `first` holds the write lock. `second` must not write through it: it is
    // refused as locked rather than succeeding next to the holder.
    const holder = await first.beginTransaction?.();
    try {
      await holder?.update('t', { id: 1 }, { v: 'held' });
      const refusal = await second.update('t', { id: 1 }, { v: 'second' }).then(
        () => undefined,
        (error) => error as DatabaseError,
      );
      expect(refusal, 'the second write waited or failed').toBeDefined();
      expect(JSON.stringify(refusal?.context)).toMatch(
        /database is locked|SQLITE_BUSY/i,
      );
    } finally {
      await holder?.commit();
    }

    expect(await first.get('t', { id: 1 })).toMatchObject({ v: 'held' });
    expect(await integrity(first)).toEqual(['ok']);
    if (engine === 'node-sqlite') {
      // The libsql guard invalidates a connection after SQLITE_BUSY; the
      // node:sqlite connection stays usable once the holder is done.
      await second.update('t', { id: 1 }, { v: 'second' });
      expect(await first.get('t', { id: 1 })).toMatchObject({ v: 'second' });
      expect(await integrity(second)).toEqual(['ok']);
    }
  });

  it('keeps secureFile out of libsql options and authToken out of node-sqlite options', async () => {
    const root = await tempRoot();
    const secure = await track(
      await getDatabase(secureOptions(join(root, 'e.db'))),
    );
    expect(secure.reopenOptions?.()).toMatchObject({ secureFile });
    const plain = await track(
      await getDatabase(libsqlOptions(join(root, 'f.db'))),
    );
    expect(plain.reopenOptions?.()).not.toHaveProperty('secureFile');
  });

  it.skipIf(!isMainThread)(
    'keeps the file it was acquired with after the working directory changes',
    async () => {
      const root = await tempRoot();
      const other = await tempRoot();
      const previous = process.cwd();
      process.chdir(root);
      try {
        const plain = await track(await getDatabase(libsqlOptions('rel.db')));
        const fileUrl = await track(
          await getDatabase({ type: 'sqlite', url: 'file:rel2.db' }),
        );
        process.chdir(other);
        const real = await realpath(root);
        const plainOptions = plain.reopenOptions?.() as { url: string };
        const fileUrlOptions = fileUrl.reopenOptions?.() as { url: string };
        expect(plainOptions.url).toBe(join(real, 'rel.db'));
        expect(fileUrlOptions.url).toBe(join(real, 'rel2.db'));
      } finally {
        process.chdir(previous);
      }
    },
  );

  it('keeps an absolute file:// URL exactly as given', async () => {
    const root = await tempRoot();
    const url = `file://${join(root, 'a%23b.db')}`;
    const db = await track(await getDatabase({ type: 'sqlite', url }));
    const reopened = db.reopenOptions?.() as { url: string };
    expect(reopened.url).toBe(url);
  });

  it('refuses with a typed error where reopening is not safe', async () => {
    const memory = await track(
      await getDatabase({ type: 'sqlite', url: ':memory:' }),
    );
    expect(() => memory.reopenOptions?.()).toThrow(ReopenNotSupportedError);
    const duck = await track(
      await getDatabase({ type: 'duckdb', url: ':memory:' }),
    );
    expect(() => duck.reopenOptions?.()).toThrow(ReopenNotSupportedError);
    const json = await track(
      await getDatabase({ type: 'json', url: await tempRoot() }),
    );
    try {
      json.reopenOptions?.();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ReopenNotSupportedError);
      expect((error as ReopenNotSupportedError).engine).toBe('json');
    }
  });
});

describe('mixing engines on one SQLite file', () => {
  async function collectWarnings(work: () => Promise<void>) {
    const seen: Array<{ code?: string; message: string }> = [];
    const listener = (warning: Error & { code?: string }) => {
      if (warning.code === 'HV_SQL_SQLITE_ENGINE_MIX') seen.push(warning);
    };
    process.on('warning', listener);
    try {
      await work();
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('warning', listener);
    }
    return seen;
  }

  it('is detectable: the engines differ and a warning names the file', async () => {
    const root = await tempRoot();
    const file = join(root, 'mixed.db');
    const warnings = await collectWarnings(async () => {
      const secure = await track(await getDatabase(secureOptions(file)));
      const plain = await track(await getDatabase(libsqlOptions(file)));
      expect(secure.engine).not.toBe(plain.engine);
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('mixed.db');
    expect(warnings[0].message).toContain('db.reopenOptions()');
  });

  it('makes the issue reproduction detectable before any write', async () => {
    // The issue's reproduction, in-thread and in an isolated temp directory:
    // node:sqlite holds BEGIN IMMEDIATE and a libsql connection on the same
    // file is not stopped. The file is thrown away, never reused.
    const root = await tempRoot();
    const file = join(root, 'hazard.db');
    let secure!: DatabaseInterface;
    let plain!: DatabaseInterface;
    await collectWarnings(async () => {
      secure = await track(await getDatabase(secureOptions(file)));
      await secure.query('PRAGMA journal_mode = WAL');
      await secure.query('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
      await secure.query("INSERT INTO t (id, v) VALUES (1, 'a')");
      plain = await track(await getDatabase(libsqlOptions(file)));
    });
    // Detectable before any write: the two connections disagree on engine.
    expect(plain.engine).not.toBe(secure.engine);

    // What the unsafe arrangement does next (the libsql write is not stopped
    // by the node:sqlite writer; see the issue) is upstream behaviour that
    // differs by platform and libsql version, so it is deliberately not
    // asserted here. The detectable part above is what this package owns.
  });

  it('recognises one file through a symlink and warns once', async () => {
    const root = await tempRoot();
    const file = join(root, 'real.db');
    await symlink(root, join(root, 'link'));
    const warnings = await collectWarnings(async () => {
      await track(await getDatabase(secureOptions(file)));
      await track(
        await getDatabase(libsqlOptions(join(root, 'link', 'real.db'))),
      );
      await track(await getDatabase(libsqlOptions(file)));
    });
    expect(warnings).toHaveLength(1);
  });

  it('does not warn for the same engine, other files, or after close', async () => {
    const root = await tempRoot();
    const warnings = await collectWarnings(async () => {
      const a = await track(
        await getDatabase(secureOptions(join(root, 'a.db'))),
      );
      await track(await getDatabase(secureOptions(join(root, 'a.db'))));
      await track(await getDatabase(libsqlOptions(join(root, 'b.db'))));
      await a.close?.();
      const closed = await track(
        await getDatabase(libsqlOptions(join(root, 'c.db'))),
      );
      await closed.close?.();
    });
    expect(warnings).toEqual([]);
    const afterClose = await collectWarnings(async () => {
      const first = await getDatabase(secureOptions(join(root, 'd.db')));
      await first.close?.();
      await track(await getDatabase(libsqlOptions(join(root, 'd.db'))));
    });
    expect(afterClose).toEqual([]);
  });

  it('does not warn for in-memory databases', async () => {
    const warnings = await collectWarnings(async () => {
      await track(await getDatabase({ type: 'sqlite', url: ':memory:' }));
    });
    expect(warnings).toEqual([]);
  });
});

describe('reopenOptions contents', () => {
  it('survives structured clone as it is, even with a Windows verifier', async () => {
    const root = await tempRoot();
    const db = await track(
      await getDatabase({
        type: 'sqlite',
        url: join(root, 'clone.db'),
        secureFile: {
          ...secureFile,
          root,
          windowsCustody: { verify: () => {} },
        },
      }),
    );
    const options = db.reopenOptions?.();
    expect(structuredClone(options)).toEqual(options);
    // The verifier is a function and stays behind; the worker supplies its own.
    expect(options).toMatchObject({ secureFile: { ...secureFile, root } });
    expect(JSON.stringify(options)).not.toContain('windowsCustody');
  });

  it.skipIf(!isMainThread)(
    'makes secureFile.root absolute when the connection is acquired',
    async () => {
      const root = await tempRoot();
      const other = await tempRoot();
      const previous = process.cwd();
      process.chdir(root);
      try {
        const db = await track(
          await getDatabase({
            type: 'sqlite',
            url: join(root, 'rooted.db'),
            secureFile: { ...secureFile, root: '.' },
          }),
        );
        process.chdir(other);
        const options = db.reopenOptions?.() as {
          secureFile: { root: string };
        };
        expect(options.secureFile.root).toBe(await realpath(root));
      } finally {
        process.chdir(previous);
      }
    },
  );

  it('returns copies that cannot change the connection', async () => {
    const root = await tempRoot();
    const db = await track(
      await getDatabase(secureOptions(join(root, 'c.db'))),
    );
    const first = db.reopenOptions?.() as {
      secureFile: { custody: string };
    };
    first.secureFile.custody = 'tampered';
    const second = db.reopenOptions?.() as {
      secureFile: { custody: string };
    };
    expect(second.secureFile.custody).toBe('trusted-parent');
    expect(second.secureFile).not.toBe(first.secureFile);
  });

  it('treats a remote URL with leading whitespace as remote', async () => {
    const remote = ' \tlibsql://example.invalid';
    const { createSqliteReopenOptions } = await import(
      './shared/sqlite-engine'
    );
    const options = createSqliteReopenOptions(
      'libsql',
      { authToken: 'token' },
      remote,
    )();
    expect(options.url).toBe('libsql://example.invalid');
  });
});

describe('engine bookkeeping after a failed open', () => {
  it('does not leave a file marked open when schema creation fails', async () => {
    const root = await tempRoot();
    const file = join(root, 'failed.db');
    await expect(
      getDatabase({
        ...secureOptions(file),
        schemas: { broken: { ddl: 'THIS IS NOT SQL' } },
      }),
    ).rejects.toThrow();
    const seen: string[] = [];
    const listener = (warning: Error & { code?: string }) => {
      if (warning.code === 'HV_SQL_SQLITE_ENGINE_MIX')
        seen.push(warning.message);
    };
    process.on('warning', listener);
    try {
      await track(await getDatabase(libsqlOptions(file)));
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('warning', listener);
    }
    expect(seen).toEqual([]);
  });
});
