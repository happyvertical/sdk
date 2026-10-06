import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { vector } from '@electric-sql/pglite-pgvector';
import { afterEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

/**
 * `dataDir`, `extensions` and `client`: how a PGlite database is persisted and
 * extended.
 */

const open: DatabaseInterface[] = [];
const dirs: string[] = [];

afterEach(async () => {
  for (const db of open.splice(0)) await db.close?.();
  for (const dir of dirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe('pglite dataDir', () => {
  it('persists to a filesystem directory across instances', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sql-pglite-'));
    dirs.push(dir);
    const dataDir = path.join(dir, 'db');

    const first = await getDatabase({ type: 'pglite', dataDir });
    await first.query('CREATE TABLE kept (id int PRIMARY KEY, label text)');
    await first.insert('kept', { id: 1, label: 'survives' });
    await first.close?.();

    const second = await getDatabase({ type: 'pglite', dataDir });
    open.push(second);
    expect(await second.get('kept', { id: 1 })).toEqual({
      id: 1,
      label: 'survives',
    });
  });

  it('shares one instance per persistent directory', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sql-pglite-'));
    dirs.push(dir);
    const dataDir = path.join(dir, 'db');
    const a = await getDatabase({ type: 'pglite', dataDir });
    const b = await getDatabase({ type: 'pglite', dataDir });
    open.push(a);
    expect(a).toBe(b);
  });

  it('treats url as an alias, so HAVE_SQL_URL can pick the location', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sql-pglite-'));
    dirs.push(dir);
    const url = path.join(dir, 'db');
    const db = await getDatabase({ type: 'pglite', url });
    open.push(db);
    expect(db.url).toBe(url);
  });

  it('defaults to memory:// and does not persist', async () => {
    const db = await getDatabase({ type: 'pglite' });
    expect(db.url).toBe('memory://');
    await db.query('CREATE TABLE gone (id int)');
    await db.close?.();
    const again = await getDatabase({ type: 'pglite' });
    open.push(again);
    expect(await again.tableExists('gone')).toBe(false);
  });
});

describe('pglite extensions', () => {
  it('loads a bundled contrib extension', async () => {
    const { citext } = await import('@electric-sql/pglite/contrib/citext');
    const db = await getDatabase({
      type: 'pglite',
      extensions: { citext },
    });
    open.push(db);
    await db.query('CREATE EXTENSION IF NOT EXISTS citext');
    await db.query('CREATE TABLE people (email citext PRIMARY KEY)');
    await db.insert('people', { email: 'Ada@Example.com' });
    expect(await db.get('people', { email: 'ada@example.com' })).not.toBeNull();
  });

  it('runs the vector capabilities on the pgvector extension', async () => {
    const db = await getDatabase({
      type: 'pglite',
      extensions: { vector },
    });
    open.push(db);
    const table = `docs_${randomUUID().replace(/-/g, '')}`;
    await db.query(`CREATE TABLE ${table} (id int PRIMARY KEY, label text)`);
    await db.vector?.ensureColumn(table, 'embedding', 3);
    await db.vector?.ensureIndex(table, 'embedding', { type: 'hnsw' });
    await db.insert(table, [
      { id: 1, label: 'x-axis' },
      { id: 2, label: 'y-axis' },
    ]);
    await db.vector?.upsertVector(table, { id: 1 }, 'embedding', [1, 0, 0]);
    await db.vector?.upsertVector(table, { id: 2 }, 'embedding', [0, 1, 0]);

    const hits = await db.vector?.search(table, 'embedding', [0.9, 0.1, 0], {
      limit: 2,
    });
    expect(hits?.map((hit) => hit.label)).toEqual(['x-axis', 'y-axis']);
  });

  it('reports a missing extension through the normal error path', async () => {
    const db = await getDatabase({ type: 'pglite' });
    open.push(db);
    await expect(db.query('CREATE EXTENSION vector')).rejects.toThrow();
  });
});

describe('pglite client option', () => {
  it('builds on a caller-owned instance and leaves it open', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = await PGlite.create();
    try {
      const db = await getDatabase({ type: 'pglite', client: pg });
      await db.query('CREATE TABLE owned (id int)');
      await db.insert('owned', { id: 1 });
      await db.close?.();

      expect(pg.closed).toBe(false);
      expect(
        (await pg.query('SELECT count(*)::int AS n FROM owned')).rows,
      ).toEqual([{ n: 1 }]);
    } finally {
      await pg.close();
    }
  });
});
