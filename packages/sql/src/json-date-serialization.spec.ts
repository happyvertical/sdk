import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

/**
 * Integration tests for Date field serialization in JSON adapter
 *
 * Tests the round-trip conversion of Date fields:
 * 1. JavaScript Date → DuckDB TIMESTAMP (via ISO string)
 * 2. DuckDB TIMESTAMP → { micros: number } → JavaScript Date
 * 3. Ensure subsequent UPSERT operations work correctly
 *
 * Reproduces issue #319: JSON adapter fails to serialize Date fields during UPSERT
 */

describe('JSON adapter Date serialization', () => {
  let db: DatabaseInterface;
  let testDataDir: string;

  beforeEach(async () => {
    // Use temp directory for JSON files
    testDataDir = join(
      process.cwd(),
      'test-data',
      `json-date-test-${Date.now()}`,
    );

    // Initialize JSON adapter
    db = await getDatabase({
      type: 'json',
      url: testDataDir,
      autoRegister: false, // Don't auto-load JSON files
      writeStrategy: 'immediate',
    });

    // Manually create table with TIMESTAMP columns
    // This simulates what SMRT framework would create
    await db.execute`
      CREATE TABLE places (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        context TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(slug, context)
      )
    `;
  });

  afterEach(async () => {
    // Clean up test data directory
    try {
      await rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors during cleanup
    }
  });

  it('should handle Date fields in round-trip save-load-save cycle', async () => {
    const now = new Date();
    const placeId = 'place-123';

    // 1. Initial save with Date objects
    await db.upsert('places', ['slug', 'context'], {
      id: placeId,
      slug: 'town-hall',
      context: '/locations',
      name: 'Town Hall',
      url: 'https://example.com',
      created_at: now,
      updated_at: now,
    });

    // 2. Load the record back
    const loaded = await db.get('places', { id: placeId });

    expect(loaded).toBeDefined();
    expect(loaded?.id).toBe(placeId);

    // 3. Verify Date fields are returned as Date objects (not { micros } objects)
    expect(loaded?.created_at).toBeInstanceOf(Date);
    expect(loaded?.updated_at).toBeInstanceOf(Date);

    // 4. Update and save again (this is where issue #319 occurs)
    const updatedPlace = {
      ...loaded,
      name: 'Updated Town Hall',
    };

    // This should NOT fail with "Cannot create values of type ANY"
    await expect(
      db.upsert('places', ['slug', 'context'], updatedPlace),
    ).resolves.toMatchObject({
      operation: 'upsert',
      affected: 1,
    });

    // 5. Verify the update persisted
    const reloaded = await db.get('places', { id: placeId });
    expect(reloaded?.name).toBe('Updated Town Hall');
    expect(reloaded?.created_at).toBeInstanceOf(Date);
    expect(reloaded?.updated_at).toBeInstanceOf(Date);
  });

  it('should convert { micros } objects to Date when reading', async () => {
    const now = new Date();

    await db.insert('places', {
      id: 'test-id',
      slug: 'test-place',
      context: '',
      name: 'Test Place',
      url: null,
      created_at: now,
      updated_at: now,
    });

    const record = await db.get('places', { id: 'test-id' });

    // DuckDB returns dates as { micros: number }
    // Our fix should convert them to Date objects
    expect(record?.created_at).toBeInstanceOf(Date);
    expect(record?.updated_at).toBeInstanceOf(Date);

    // Verify the Date values are approximately correct
    // (allowing for rounding in DuckDB's microsecond precision)
    if (record?.created_at instanceof Date) {
      const diff = Math.abs(record.created_at.getTime() - now.getTime());
      expect(diff).toBeLessThan(1000); // Within 1 second
    }
  });

  it('should handle null Date fields correctly', async () => {
    await db.insert('places', {
      id: 'null-dates',
      slug: 'null-test',
      context: '',
      name: 'Null Date Test',
      url: null,
      created_at: null,
      updated_at: null,
    });

    const record = await db.get('places', { id: 'null-dates' });

    expect(record?.created_at).toBeNull();
    expect(record?.updated_at).toBeNull();

    // Update should work with null dates
    await expect(
      db.upsert('places', ['slug', 'context'], {
        ...record,
        name: 'Updated Null Date Test',
      }),
    ).resolves.toMatchObject({
      operation: 'upsert',
      affected: 1,
    });
  });

  it('should handle multiple records with Date fields', async () => {
    const baseDate = new Date('2024-01-01T00:00:00Z');

    // Insert multiple records with Date fields
    for (let i = 0; i < 5; i++) {
      const recordDate = new Date(baseDate.getTime() + i * 86400000); // Add i days

      await db.insert('places', {
        id: `place-${i}`,
        slug: `place-${i}`,
        context: '',
        name: `Place ${i}`,
        url: null,
        created_at: recordDate,
        updated_at: recordDate,
      });
    }

    // Load all records
    const records = await db.list('places', {});

    expect(records).toHaveLength(5);

    // Verify all Date fields are Date objects
    for (const record of records) {
      expect(record.created_at).toBeInstanceOf(Date);
      expect(record.updated_at).toBeInstanceOf(Date);
    }

    // Update each record (round-trip test)
    for (const record of records) {
      await expect(
        db.upsert('places', ['slug', 'context'], {
          ...record,
          name: `${record.name} - Updated`,
        }),
      ).resolves.toMatchObject({
        operation: 'upsert',
        affected: 1,
      });
    }
  });
});
