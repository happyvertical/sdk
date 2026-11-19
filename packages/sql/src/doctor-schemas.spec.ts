import { afterEach, describe, expect, it } from 'vitest';
import {
  checkExpectedTables,
  checkRelationship,
  checkUniqueColumn,
  runDoctor,
} from './doctor';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

/**
 * #1550: the doctor takes a schema, a list of schemas, or all non-system
 * schemas. PGlite runs the same PostgreSQL dialect in-process; runDoctor only
 * accepts a postgres:// URL, so the handle is given one.
 */
const open: DatabaseInterface[] = [];

afterEach(async () => {
  for (const db of open.splice(0)) await db.close?.().catch(() => {});
});

async function twoSchemas(): Promise<DatabaseInterface> {
  const pglite = await getDatabase({ type: 'pglite' });
  open.push(pglite);
  // Two schemas each hold `items`; only `tenant_a` has a duplicate slug and
  // only `tenant_b` has an orphaned reference.
  await pglite.query('CREATE SCHEMA tenant_a');
  await pglite.query('CREATE SCHEMA tenant_b');
  await pglite.query('CREATE TABLE tenant_a.items (id text, slug text)');
  await pglite.query(
    "INSERT INTO tenant_a.items VALUES ('1', 'dup'), ('2', 'dup')",
  );
  await pglite.query(
    'CREATE TABLE tenant_b.items (id text, slug text, owner_id text)',
  );
  await pglite.query('CREATE TABLE tenant_b.owners (id text)');
  await pglite.query(
    "INSERT INTO tenant_b.items VALUES ('1', 'one', 'missing')",
  );
  await pglite.query('CREATE TABLE public.only_public (id text)');
  return { ...pglite, url: 'postgres://pglite.invalid/db' };
}

const checks = [
  checkUniqueColumn({ table: 'items', column: 'slug', label: 'slug' }),
  checkRelationship({
    childTable: 'items',
    childColumn: 'owner_id',
    parentTable: 'owners',
    label: 'item owner',
  }),
  checkExpectedTables(['only_public']),
];

describe('runDoctor schemas', () => {
  it('checks only public by default', async () => {
    const db = await twoSchemas();
    const result = await runDoctor({ db, checks });
    expect(result.issues).toEqual([]);
  });

  it('checks one named schema, resolving same-named tables inside it', async () => {
    const db = await twoSchemas();
    const a = await runDoctor({ db, checks, schemas: 'tenant_a' });
    expect(a.failures.map((issue) => issue.message)).toEqual([
      '[tenant_a] Duplicate slug "dup" in items (2 rows).',
    ]);
    expect(a.failures[0].schema).toBe('tenant_a');

    const b = await runDoctor({ db, checks, schemas: ['tenant_b'] });
    expect(b.failures.map((issue) => issue.message)).toEqual([
      '[tenant_b] item owner: 1 orphaned row.',
    ]);
  });

  it('checks a list of schemas, reporting each separately', async () => {
    const db = await twoSchemas();
    const result = await runDoctor({
      db,
      checks,
      schemas: ['tenant_a', 'tenant_b', 'tenant_a'],
    });
    expect(result.failures.map((issue) => issue.schema)).toEqual([
      'tenant_a',
      'tenant_b',
    ]);
    expect(result.warnings.map((issue) => issue.message)).toEqual([
      '[tenant_a] Missing expected table: only_public',
      '[tenant_b] Missing expected table: only_public',
    ]);
  });

  it('enumerates every non-system schema', async () => {
    const db = await twoSchemas();
    const seen: string[] = [];
    await runDoctor({
      db,
      checks: [
        async ({ schema }) => {
          seen.push(schema);
          return [];
        },
      ],
      allSchemas: true,
    });
    expect(seen).toEqual(['public', 'tenant_a', 'tenant_b']);
  });

  it('leaves the connection search_path untouched', async () => {
    const db = await twoSchemas();
    await runDoctor({ db, checks, schemas: 'tenant_a' });
    const result = await db.query('SHOW search_path');
    expect(String(Object.values(result.rows[0])[0])).not.toContain('tenant_a');
  });

  describe('on a caller-owned transaction', () => {
    async function withTx<T>(
      db: DatabaseInterface,
      fn: (tx: DatabaseInterface) => Promise<T>,
    ): Promise<T> {
      return db.transaction?.(async (tx) => {
        await tx.query('SET LOCAL search_path TO tenant_a');
        return fn(tx);
      }) as Promise<T>;
    }
    const asPg = (tx: DatabaseInterface): DatabaseInterface => ({
      ...tx,
      url: 'postgres://pglite.invalid/db',
    });
    const pathOf = async (tx: DatabaseInterface) =>
      String(Object.values((await tx.query('SHOW search_path')).rows[0])[0]);

    it('restores the incoming search_path after success', async () => {
      const db = await twoSchemas();
      await withTx(db, async (tx) => {
        const before = await pathOf(tx);
        await runDoctor({ db: asPg(tx), checks, schemas: 'tenant_b' });
        expect(await pathOf(tx)).toBe(before);
        // Unqualified names still resolve to the caller's schema.
        expect(await tx.tableExists('items')).toBe(true);
        expect(
          Object.keys((await tx.getTableSchema?.('items'))?.columns ?? {}),
        ).toEqual(['id', 'slug']);
      });
    });

    it('restores the incoming search_path when a check throws', async () => {
      const db = await twoSchemas();
      await withTx(db, async (tx) => {
        const before = await pathOf(tx);
        await expect(
          runDoctor({
            db: asPg(tx),
            checks: [
              async () => {
                throw new Error('check failed');
              },
            ],
            schemas: 'tenant_b',
          }),
        ).rejects.toThrow('check failed');
        expect(await pathOf(tx)).toBe(before);
        expect(await tx.tableExists('items')).toBe(true);
        expect(
          Object.keys((await tx.getTableSchema?.('items'))?.columns ?? {}),
        ).toEqual(['id', 'slug']);
      });
    });

    it('restores it across a list of schemas on a nested transaction', async () => {
      const db = await twoSchemas();
      await withTx(db, (outer) =>
        outer.transaction?.(async (inner) => {
          const before = await pathOf(inner);
          await runDoctor({
            db: asPg(inner),
            checks,
            schemas: ['tenant_b', 'public'],
          });
          expect(await pathOf(inner)).toBe(before);
        }),
      );
    });
  });
});
