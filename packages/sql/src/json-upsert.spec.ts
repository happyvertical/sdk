/**
 * Regression test for Issue #316: JSON/DuckDB adapter ON CONFLICT fails with UNIQUE constraint error
 *
 * The JSON adapter (DuckDB-backed) failed when executing UPSERT queries with ON CONFLICT
 * clause, throwing a binder error about UNIQUE constraints not being referenced.
 *
 * Root cause: DuckDB requires inline UNIQUE constraints, not separate UNIQUE INDEX statements,
 * for ON CONFLICT clauses to work correctly.
 *
 * Fix: Convert UNIQUE INDEX statements to inline UNIQUE constraints when creating tables.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearConnectionCache, getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

describe('JSON adapter UPSERT with UNIQUE constraints (Issue #316)', () => {
  let testDataDir: string;
  let db: DatabaseInterface & { exportTable: (table: string) => Promise<void> };

  beforeAll(async () => {
    // Create test data directory
    testDataDir = join(process.cwd(), '.test-json-upsert');
    await mkdir(testDataDir, { recursive: true });

    // Initialize empty JSON file
    await writeFile(join(testDataDir, 'weather_forecasts.json'), '[]', 'utf-8');
  });

  afterAll(async () => {
    // Clean up test directory
    await rm(testDataDir, { recursive: true, force: true });
  });

  it('should handle UPSERT with composite UNIQUE constraint (slug, context)', async () => {
    // Simulate SMRT-generated schema with UNIQUE INDEX
    const smrtSchema = {
      ddl: `CREATE TABLE weather_forecasts (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT CAST('' AS TEXT),
  name TEXT NOT NULL DEFAULT CAST('' AS TEXT),
  temperature REAL NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
)`,
      indexes: [
        'CREATE UNIQUE INDEX IF NOT EXISTS weather_forecasts_slug_context_idx ON weather_forecasts (slug, context)',
      ],
      triggers: [],
    };

    // Create database with explicit schema
    db = (await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      autoRegister: true, // Load schemas
      schemas: {
        weather_forecasts: smrtSchema,
      },
    })) as DatabaseInterface & {
      exportTable: (table: string) => Promise<void>;
    };

    // First insert
    const insertResult = await db.upsert(
      'weather_forecasts',
      ['slug', 'context'],
      {
        id: 'forecast-1',
        slug: 'denver-forecast',
        context: '',
        name: 'Denver Weather',
        temperature: 72,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    );

    expect(insertResult.operation).toBe('upsert');
    expect(insertResult.affected).toBe(1);

    // Verify insert
    const inserted = await db.get('weather_forecasts', {
      slug: 'denver-forecast',
    });
    expect(inserted).toBeTruthy();
    expect(inserted?.name).toBe('Denver Weather');
    expect(inserted?.temperature).toBe(72);

    // Update via UPSERT (same slug + context, should update)
    const updateResult = await db.upsert(
      'weather_forecasts',
      ['slug', 'context'],
      {
        id: 'forecast-1',
        slug: 'denver-forecast',
        context: '',
        name: 'Denver Weather Updated',
        temperature: 85,
        created_at: inserted?.created_at,
        updated_at: new Date().toISOString(),
      },
    );

    expect(updateResult.operation).toBe('upsert');
    expect(updateResult.affected).toBe(1);

    // Verify update
    const updated = await db.get('weather_forecasts', {
      slug: 'denver-forecast',
    });
    expect(updated).toBeTruthy();
    expect(updated?.name).toBe('Denver Weather Updated');
    expect(updated?.temperature).toBe(85);

    // Verify only one record exists (update, not insert)
    const allRecords = await db.list('weather_forecasts', {});
    expect(allRecords).toHaveLength(1);
  });

  it('should handle UPSERT with different context values', async () => {
    // Insert record with context = ''
    await db.upsert('weather_forecasts', ['slug', 'context'], {
      id: 'forecast-2',
      slug: 'boulder-forecast',
      context: '',
      name: 'Boulder Weather',
      temperature: 68,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Insert record with same slug but different context (should insert, not update)
    await db.upsert('weather_forecasts', ['slug', 'context'], {
      id: 'forecast-3',
      slug: 'boulder-forecast',
      context: '/forecast',
      name: 'Boulder Weather Forecast Page',
      temperature: 70,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Verify both records exist
    const allBoulder = await db.list('weather_forecasts', {
      slug: 'boulder-forecast',
    });
    expect(allBoulder).toHaveLength(2);

    // Verify context distinguishes them
    const emptyContext = await db.get('weather_forecasts', {
      slug: 'boulder-forecast',
      context: '',
    });
    expect(emptyContext?.name).toBe('Boulder Weather');

    const forecastContext = await db.get('weather_forecasts', {
      slug: 'boulder-forecast',
      context: '/forecast',
    });
    expect(forecastContext?.name).toBe('Boulder Weather Forecast Page');
  });

  it('should handle multiple UPSERTs on the same record', async () => {
    const baseRecord = {
      id: 'forecast-4',
      slug: 'springs-forecast',
      context: '',
      created_at: new Date().toISOString(),
    };

    // First UPSERT
    await db.upsert('weather_forecasts', ['slug', 'context'], {
      ...baseRecord,
      name: 'Springs Weather v1',
      temperature: 65,
      updated_at: new Date().toISOString(),
    });

    // Second UPSERT (update temperature)
    await db.upsert('weather_forecasts', ['slug', 'context'], {
      ...baseRecord,
      name: 'Springs Weather v2',
      temperature: 70,
      updated_at: new Date().toISOString(),
    });

    // Third UPSERT (update temperature again)
    await db.upsert('weather_forecasts', ['slug', 'context'], {
      ...baseRecord,
      name: 'Springs Weather v3',
      temperature: 75,
      updated_at: new Date().toISOString(),
    });

    // Verify final state
    const final = await db.get('weather_forecasts', {
      slug: 'springs-forecast',
    });
    expect(final?.name).toBe('Springs Weather v3');
    expect(final?.temperature).toBe(75);

    // Verify only one record (not three)
    const allSprings = await db.list('weather_forecasts', {
      slug: 'springs-forecast',
    });
    expect(allSprings).toHaveLength(1);
  });

  it('should work with simple single-column UNIQUE constraint', async () => {
    // Clear cache to get fresh connection for new schema
    await clearConnectionCache();
    // Create empty JSON file for products table
    await writeFile(join(testDataDir, 'products.json'), '[]', 'utf-8');

    // Create database with products schema
    const productsDb = (await getDatabase({
      type: 'json',
      url: testDataDir,
      writeStrategy: 'immediate',
      autoRegister: true,
      schemas: {
        products: {
          ddl: `CREATE TABLE products (
  id TEXT PRIMARY KEY NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL
)`,
          indexes: [
            'CREATE UNIQUE INDEX IF NOT EXISTS products_sku_idx ON products (sku)',
          ],
          triggers: [],
        },
      },
    })) as DatabaseInterface & {
      exportTable: (table: string) => Promise<void>;
    };

    // UPSERT with single-column constraint
    await productsDb.upsert('products', ['sku'], {
      id: 'prod-1',
      sku: 'WIDGET-001',
      name: 'Widget',
      price: 9.99,
    });

    const product = await productsDb.get('products', { sku: 'WIDGET-001' });
    expect(product?.name).toBe('Widget');

    // Update via UPSERT
    await productsDb.upsert('products', ['sku'], {
      id: 'prod-1',
      sku: 'WIDGET-001',
      name: 'Super Widget',
      price: 19.99,
    });

    const updated = await productsDb.get('products', { sku: 'WIDGET-001' });
    expect(updated?.name).toBe('Super Widget');
    expect(updated?.price).toBeCloseTo(19.99, 2); // Floating-point comparison
  });

  it('should handle UPSERT with quoted column names (Issue #418)', async () => {
    // Create separate test database for this test
    const quotedTestDir = join(process.cwd(), '.test-json-quoted');
    await mkdir(quotedTestDir, { recursive: true });
    await writeFile(join(quotedTestDir, 'poly_events.json'), '[]', 'utf-8');

    try {
      const quotedDb = (await getDatabase({
        type: 'json',
        url: ':memory:',
        dataDir: quotedTestDir,
        writeStrategy: 'immediate',
        autoRegister: false,
      })) as DatabaseInterface & {
        exportTable: (table: string) => Promise<void>;
      };

      // Create table with quoted column names like SMRT's SchemaGenerator
      await quotedDb.execute`
        CREATE TABLE IF NOT EXISTS "poly_events" (
          "_meta_type" TEXT NOT NULL,
          "slug" TEXT NOT NULL,
          "context" TEXT NOT NULL,
          "title" TEXT,
          "count" INTEGER DEFAULT 0,
          PRIMARY KEY ("_meta_type", "slug", "context")
        )
      `;

      // First upsert (insert)
      const data1 = {
        _meta_type: 'Meeting',
        slug: 'team-standup',
        context: '/meetings',
        title: 'Daily Standup',
        count: 1,
      };

      await quotedDb.upsert(
        'poly_events',
        ['_meta_type', 'slug', 'context'],
        data1,
      );

      const result1 = await quotedDb.single`
        SELECT * FROM poly_events
        WHERE "_meta_type" = ${data1._meta_type}
        AND "slug" = ${data1.slug}
        AND "context" = ${data1.context}
      `;

      expect(result1).toEqual(data1);

      // Second upsert (update)
      const data2 = {
        _meta_type: 'Meeting',
        slug: 'team-standup',
        context: '/meetings',
        title: 'Weekly Standup',
        count: 5,
      };

      await quotedDb.upsert(
        'poly_events',
        ['_meta_type', 'slug', 'context'],
        data2,
      );

      const result2 = await quotedDb.single`
        SELECT * FROM poly_events
        WHERE "_meta_type" = ${data2._meta_type}
        AND "slug" = ${data2.slug}
        AND "context" = ${data2.context}
      `;

      expect(result2).toEqual(data2);

      // Verify only one record exists (update, not insert)
      const allRecords = await quotedDb.many`SELECT * FROM poly_events`;
      expect(allRecords).toHaveLength(1);
    } finally {
      // Clean up test directory
      await rm(quotedTestDir, { recursive: true, force: true });
    }
  });

  it('should update one row when a composite conflict column is null', async () => {
    await clearConnectionCache();
    const nullableTestDir = join(process.cwd(), '.test-json-nullable-upsert');
    await mkdir(nullableTestDir, { recursive: true });
    await writeFile(
      join(nullableTestDir, 'nullable_forecasts.json'),
      '[]',
      'utf-8',
    );

    try {
      const nullableDb = await getDatabase({
        type: 'json',
        url: nullableTestDir,
        writeStrategy: 'immediate',
        autoRegister: true,
        schemas: {
          nullable_forecasts: {
            ddl: `CREATE TABLE nullable_forecasts (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  tenant_id TEXT,
  title TEXT
)`,
            indexes: [
              'CREATE UNIQUE INDEX IF NOT EXISTS nullable_forecasts_slug_tenant_idx ON nullable_forecasts (slug, tenant_id)',
            ],
            triggers: [],
          },
        },
      });

      await nullableDb.upsert('nullable_forecasts', ['slug', 'tenant_id'], {
        id: 'forecast-1',
        slug: 'shared-forecast',
        tenant_id: null,
        title: 'Initial title',
      });

      await nullableDb.upsert('nullable_forecasts', ['slug', 'tenant_id'], {
        id: 'forecast-2',
        slug: 'shared-forecast',
        tenant_id: null,
        title: 'Updated title',
      });

      const records = await nullableDb.list('nullable_forecasts', {
        slug: 'shared-forecast',
      });
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        id: 'forecast-2',
        slug: 'shared-forecast',
        tenant_id: null,
        title: 'Updated title',
      });

      const persisted = JSON.parse(
        await readFile(
          join(nullableTestDir, 'nullable_forecasts.json'),
          'utf-8',
        ),
      );
      expect(persisted).toHaveLength(1);
      expect(persisted[0]).toMatchObject({
        id: 'forecast-2',
        slug: 'shared-forecast',
        tenant_id: null,
        title: 'Updated title',
      });
    } finally {
      await rm(nullableTestDir, { recursive: true, force: true });
    }
  });

  it('should preserve database-native null-distinct upsert behavior when requested', async () => {
    await clearConnectionCache();
    const optOutTestDir = join(
      process.cwd(),
      '.test-json-nullable-upsert-opt-out',
    );
    await mkdir(optOutTestDir, { recursive: true });
    await writeFile(
      join(optOutTestDir, 'nullable_forecasts_opt_out.json'),
      '[]',
      'utf-8',
    );

    try {
      const optOutDb = await getDatabase({
        type: 'json',
        url: optOutTestDir,
        writeStrategy: 'immediate',
        autoRegister: true,
        schemas: {
          nullable_forecasts_opt_out: {
            ddl: `CREATE TABLE nullable_forecasts_opt_out (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  tenant_id TEXT,
  title TEXT
)`,
            indexes: [
              'CREATE UNIQUE INDEX IF NOT EXISTS nullable_forecasts_opt_out_slug_tenant_idx ON nullable_forecasts_opt_out (slug, tenant_id)',
            ],
            triggers: [],
          },
        },
      });

      await optOutDb.upsert(
        'nullable_forecasts_opt_out',
        ['slug', 'tenant_id'],
        {
          id: 'forecast-1',
          slug: 'shared-forecast',
          tenant_id: null,
          title: 'Initial title',
        },
        { nullsDistinct: true },
      );

      await optOutDb.upsert(
        'nullable_forecasts_opt_out',
        ['slug', 'tenant_id'],
        {
          id: 'forecast-2',
          slug: 'shared-forecast',
          tenant_id: null,
          title: 'Second title',
        },
        { nullsDistinct: true },
      );

      const records = await optOutDb.list('nullable_forecasts_opt_out', {
        slug: 'shared-forecast',
      });
      expect(records).toHaveLength(2);
      expect(records.map((record) => record.title).sort()).toEqual([
        'Initial title',
        'Second title',
      ]);

      const persisted = JSON.parse(
        await readFile(
          join(optOutTestDir, 'nullable_forecasts_opt_out.json'),
          'utf-8',
        ),
      );
      expect(persisted).toHaveLength(2);
    } finally {
      await rm(optOutTestDir, { recursive: true, force: true });
    }
  });
});
