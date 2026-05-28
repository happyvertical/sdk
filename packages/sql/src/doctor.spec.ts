import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checkExpectedTables,
  checkRelationship,
  checkUniqueColumn,
  runDoctor,
} from './doctor';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

/**
 * Doctor checks use pg-specific SQL (pg_tables, count(*)::int,
 * NULLIF(trim(col::text), '')). These integration tests skip cleanly if
 * postgres isn't reachable so they don't block CI on machines without
 * a local pg.
 */
async function getTestPostgres(): Promise<DatabaseInterface | null> {
  try {
    const db = await getDatabase({
      type: 'postgres',
      database: process.env.SQLOO_DATABASE || 'testdb',
      host: process.env.SQLOO_HOST || 'localhost',
      user: process.env.SQLOO_USER || 'postgres',
      password: process.env.SQLOO_PASSWORD || 'postgres',
      port: Number(process.env.SQLOO_PORT) || 5432,
    });
    await db.execute`SELECT 1`;
    return db;
  } catch {
    return null;
  }
}

describe('doctor framework (pg integration)', () => {
  let db: DatabaseInterface | null;
  const schema = `doctor_test_${randomUUID().replace(/-/g, '_').slice(0, 8)}`;

  beforeAll(async () => {
    db = await getTestPostgres();
    if (!db) {
      console.log(
        'PostgreSQL not available — skipping doctor integration tests.',
      );
      return;
    }
    await db.query(
      `CREATE TABLE IF NOT EXISTS ${schema}_parents (id text primary key)`,
    );
    await db.query(
      `CREATE TABLE IF NOT EXISTS ${schema}_children (id text primary key, parent_id text, slug text)`,
    );
    await db.query(`INSERT INTO ${schema}_parents (id) VALUES ('p1'), ('p2')`);
    await db.query(
      `INSERT INTO ${schema}_children (id, parent_id, slug) VALUES ('c1', 'p1', 'foo'), ('c2', 'p_missing', 'foo'), ('c3', 'p2', 'bar')`,
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`DROP TABLE IF EXISTS ${schema}_children`);
    await db.query(`DROP TABLE IF EXISTS ${schema}_parents`);
    await db.client?.end?.();
  });

  it('checkExpectedTables warns about missing tables', async () => {
    if (!db) return;
    const result = await runDoctor({
      db,
      checks: [
        checkExpectedTables([
          `${schema}_parents`,
          `${schema}_children`,
          `${schema}_missing`,
        ]),
      ],
    });
    expect(result.warnings.map((w) => w.message)).toContain(
      `Missing expected table: ${schema}_missing`,
    );
    expect(result.failures).toEqual([]);
  });

  it('checkUniqueColumn fails on duplicate values', async () => {
    if (!db) return;
    const result = await runDoctor({
      db,
      checks: [
        checkUniqueColumn({
          table: `${schema}_children`,
          column: 'slug',
          label: 'slug',
        }),
      ],
    });
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures[0].message).toContain('"foo"');
  });

  it('checkRelationship fails on orphan rows', async () => {
    if (!db) return;
    const result = await runDoctor({
      db,
      checks: [
        checkRelationship({
          childTable: `${schema}_children`,
          childColumn: 'parent_id',
          parentTable: `${schema}_parents`,
          label: 'children point at parents',
        }),
      ],
    });
    expect(result.failures.length).toBe(1);
    expect(result.failures[0].message).toContain('1 orphaned row');
  });

  it('checks that name nonexistent tables short-circuit cleanly', async () => {
    if (!db) return;
    const result = await runDoctor({
      db,
      checks: [
        checkUniqueColumn({
          table: `${schema}_does_not_exist`,
          column: 'whatever',
          label: 'never seen',
        }),
        checkRelationship({
          childTable: `${schema}_does_not_exist`,
          childColumn: 'foo',
          parentTable: `${schema}_parents`,
          label: 'never seen',
        }),
      ],
    });
    expect(result.issues).toEqual([]);
  });
});

describe('runDoctor non-postgres guard', () => {
  it('throws a clear error when the database is not Postgres', async () => {
    // Doctor's check builders use pg-specific syntax; pointing them at
    // SQLite would fail mid-execution with a cryptic "no such table
    // pg_tables" error. The guard surfaces the constraint up front.
    const sqliteDb = await getDatabase({
      type: 'sqlite',
      url: ':memory:',
    });
    await expect(runDoctor({ db: sqliteDb, checks: [] })).rejects.toThrow(
      /Postgres/,
    );
  });
});
