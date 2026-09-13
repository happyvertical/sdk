import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

function postgresTestOptions(overrides: Record<string, unknown> = {}) {
  return {
    type: 'postgres' as const,
    database: process.env.SQLOO_DATABASE || 'testdb',
    host: process.env.SQLOO_HOST || 'localhost',
    user: process.env.SQLOO_USER || 'postgres',
    password: process.env.SQLOO_PASSWORD || 'postgres',
    port: Number(process.env.SQLOO_PORT) || 5432,
    // A search_path is connection state. A one-client pool makes the root
    // interface exercise exactly the session whose path this test configures.
    max: 1,
    ...overrides,
  };
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function tableExistsOf(db: DatabaseInterface) {
  return db.tableExists.bind(db);
}

function syncSchemaOf(db: DatabaseInterface) {
  if (!db.syncSchema) throw new Error('adapter does not expose syncSchema()');
  return db.syncSchema.bind(db);
}

function transactionOf(db: DatabaseInterface) {
  if (!db.transaction) throw new Error('adapter does not expose transaction()');
  return db.transaction.bind(db);
}

async function checkPostgreSQLConnection(): Promise<boolean> {
  try {
    const probe = await getDatabase(
      postgresTestOptions({ dbid: randomUUID() }),
    );
    await probe.execute`SELECT 1`;
    await probe.client.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * #1247: metadata must follow PostgreSQL's search_path relation resolution.
 * A public twin catches the old public-only predicates: selecting the wrong
 * schema must neither mutate it nor describe it as the active relation.
 */
describe('postgres schema-aware metadata', () => {
  let postgresAvailable = false;
  let db: Awaited<ReturnType<typeof getDatabase>>;
  let schema: string;
  let table: string;
  let literalTable: string;

  beforeEach(async () => {
    postgresAvailable = await checkPostgreSQLConnection();
    if (!postgresAvailable) return;

    db = await getDatabase(postgresTestOptions({ dbid: randomUUID() }));
    const suffix = randomUUID().replaceAll('-', '');
    schema = `metadata_${suffix}`;
    table = `relation_${suffix}`;
    literalTable = `Mixed.${suffix}`;
    await db.client.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    await db.client.query(
      `CREATE TABLE public.${quoteIdentifier(table)} (public_only text)`,
    );
    await db.client.query(
      `CREATE TABLE ${quoteIdentifier(schema)}.${quoteIdentifier(table)} (id text primary key)`,
    );
    await db.client.query(
      `CREATE TABLE ${quoteIdentifier(schema)}.${quoteIdentifier(literalTable)} (id text primary key)`,
    );
    await db.query(`SET search_path TO ${quoteIdentifier(schema)}, public`);
  });

  afterEach(async () => {
    if (!postgresAvailable || !db) return;
    await db.client.query(
      `DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`,
    );
    await db.client.query(
      `DROP TABLE IF EXISTS public.${quoteIdentifier(table)}`,
    );
    await db.client.end();
  });

  it('uses the search-path relation for root metadata and repeat sync', async () => {
    if (!postgresAvailable) return;

    expect(await tableExistsOf(db)(table)).toBe(true);
    expect(await tableExistsOf(db)(`missing_${table}`)).toBe(false);
    // tableExists historically accepts the literal table name, rather than a
    // SQL relation expression. A dot and uppercase letters must stay literal.
    expect(await tableExistsOf(db)(literalTable)).toBe(true);

    const before = await db.getTableSchema?.(table);
    expect(before?.columns).toHaveProperty('id');
    expect(before?.columns).not.toHaveProperty('public_only');

    const ddl = `CREATE TABLE IF NOT EXISTS ${quoteIdentifier(table)} (
      id text primary key,
      schema_only text
    );
    CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`${table}_schema_only_idx`)}
      ON ${quoteIdentifier(table)} (schema_only);`;
    await syncSchemaOf(db)(ddl);
    await syncSchemaOf(db)(ddl);

    const targetColumns = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
      schema,
      table,
    );
    const publicColumns = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      table,
    );
    expect(targetColumns.rows.map((row) => row.column_name)).toContain(
      'schema_only',
    );
    expect(publicColumns.rows.map((row) => row.column_name)).not.toContain(
      'schema_only',
    );
  }, 30000);

  it('keeps schema metadata on the caller-owned transaction and rolls it back', async () => {
    if (!postgresAvailable) return;

    await expect(
      transactionOf(db)(async (tx) => {
        expect(await tableExistsOf(tx)(table)).toBe(true);
        await syncSchemaOf(
          tx,
        )(`CREATE TABLE IF NOT EXISTS ${quoteIdentifier(table)} (
          id text primary key,
          transaction_only text
        );`);
        throw new Error('__rollback_schema_metadata__');
      }),
    ).rejects.toThrow('__rollback_schema_metadata__');

    const columns = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
      schema,
      table,
    );
    expect(columns.rows.map((row) => row.column_name)).not.toContain(
      'transaction_only',
    );
  }, 30000);

  it('does not expose a relation when the active role lacks table privileges', async () => {
    if (!postgresAvailable) return;

    const role = `metadata_denied_${randomUUID().replaceAll('-', '')}`;
    try {
      await db.client.query(`CREATE ROLE ${quoteIdentifier(role)} NOLOGIN`);
      await db.client.query(`GRANT ${quoteIdentifier(role)} TO CURRENT_USER`);
      await db.client.query(
        `GRANT USAGE ON SCHEMA ${quoteIdentifier(schema)} TO ${quoteIdentifier(role)}`,
      );
      await db.client.query(
        `REVOKE ALL ON TABLE ${quoteIdentifier(schema)}.${quoteIdentifier(table)} FROM ${quoteIdentifier(role)}`,
      );
      await db.query(`SET ROLE ${quoteIdentifier(role)}`);

      expect(await tableExistsOf(db)(table)).toBe(false);
      expect(await db.getTableSchema?.(table)).toBeNull();
    } finally {
      await db.client.query('RESET ROLE');
      await db.client.query(
        `REVOKE ALL ON TABLE ${quoteIdentifier(schema)}.${quoteIdentifier(table)} FROM ${quoteIdentifier(role)}`,
      );
      await db.client.query(
        `REVOKE USAGE ON SCHEMA ${quoteIdentifier(schema)} FROM ${quoteIdentifier(role)}`,
      );
      await db.client.query(
        `REVOKE ${quoteIdentifier(role)} FROM CURRENT_USER`,
      );
      await db.client.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`);
    }
  }, 30000);
});
