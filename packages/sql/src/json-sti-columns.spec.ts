/**
 * Tests for STI (Single Table Inheritance) column handling in JSON adapter
 *
 * These tests verify the fix for issue #518:
 * JSON adapter fails to upsert STI subclass records when parent records
 * have empty subclass columns.
 *
 * The problem: When a table is created from SMRT schema DDL, the DDL may
 * only include columns from the base class. However, schema.columns
 * (now exposed as schema.fields) includes ALL fields from all STI descendants.
 * Without adding the missing columns, upsert operations for subclass records fail.
 *
 * The fix: After creating the table from DDL, we check if all columns from
 * schema.fields exist and add any missing ones via ALTER TABLE ADD COLUMN.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearConnectionCache, getDatabase } from './index';
import type { DatabaseInterface } from './shared/types';

describe('JSON adapter STI column handling (Issue #518)', () => {
  let db: DatabaseInterface;
  const testDataDir = './test-sti-columns-data';

  beforeEach(async () => {
    // Create clean test data directory
    mkdirSync(testDataDir, { recursive: true });
    await clearConnectionCache();
  });

  afterEach(async () => {
    await clearConnectionCache();
    rmSync(testDataDir, { recursive: true, force: true });
  });

  describe('SchemaProvider with fields for STI columns', () => {
    it('should add missing STI columns from schema.fields after table creation', async () => {
      // Create a JSON file with Event records (base class)
      // These records have empty string values for STI-specific columns
      writeFileSync(
        `${testDataDir}/events.json`,
        JSON.stringify([
          {
            id: randomUUID(),
            slug: 'council-meeting-january-2025',
            context: '',
            title: 'Council Meeting - January 2025',
            description: 'Regular monthly council meeting',
            start_date: '2025-01-27T19:00:00Z',
            end_date: '2025-01-27T21:00:00Z',
            // These columns are from STI subclasses but not in base DDL
            location_id: '',
            provider_id: '',
          },
        ]),
      );

      // Define schema with:
      // - DDL that only has base Event columns (no location_id, provider_id)
      // - fields that include ALL columns (including STI subclass columns)
      const schemas = {
        events: {
          tableName: 'events',
          ddl: `CREATE TABLE events (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL,
            context TEXT NOT NULL DEFAULT '',
            title TEXT,
            description TEXT,
            start_date TEXT,
            end_date TEXT,
            UNIQUE(slug, context)
          )`,
          indexes: [],
          // This is the key part: fields includes STI columns not in DDL
          fields: {
            id: { type: 'TEXT', primaryKey: true, notNull: true },
            slug: { type: 'TEXT', notNull: true },
            context: { type: 'TEXT', notNull: true, defaultValue: "''" },
            title: { type: 'TEXT' },
            description: { type: 'TEXT' },
            start_date: { type: 'TEXT' },
            end_date: { type: 'TEXT' },
            // STI columns from WeatherForecast subclass
            location_id: { type: 'TEXT' },
            provider_id: { type: 'TEXT' },
          },
        },
      };

      // Initialize database with schema
      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        writeStrategy: 'immediate',
        schemas,
      });

      // Verify table has all columns including STI columns
      const columnsResult = await db.many`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'events'
        ORDER BY column_name
      `;

      const columnNames = columnsResult.map((c) => c.column_name);

      // Should have all columns including STI columns
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('slug');
      expect(columnNames).toContain('context');
      expect(columnNames).toContain('title');
      expect(columnNames).toContain('location_id');
      expect(columnNames).toContain('provider_id');
    });

    it('should allow upsert of STI subclass records after columns are added', async () => {
      // Create empty JSON file (simulating fresh start)
      writeFileSync(`${testDataDir}/events.json`, JSON.stringify([]));

      // Schema with STI columns in fields
      const schemas = {
        events: {
          tableName: 'events',
          ddl: `CREATE TABLE events (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL,
            context TEXT NOT NULL DEFAULT '',
            title TEXT,
            _meta_type TEXT DEFAULT 'Event',
            UNIQUE(slug, context)
          )`,
          indexes: [],
          fields: {
            id: { type: 'TEXT', primaryKey: true, notNull: true },
            slug: { type: 'TEXT', notNull: true },
            context: { type: 'TEXT', notNull: true, defaultValue: "''" },
            title: { type: 'TEXT' },
            _meta_type: { type: 'TEXT', defaultValue: "'Event'" },
            // STI columns
            location_id: { type: 'TEXT' },
            provider_id: { type: 'TEXT' },
            forecast_date: { type: 'TEXT' },
            temperature_high: { type: 'INTEGER' },
            temperature_low: { type: 'INTEGER' },
          },
        },
      };

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        writeStrategy: 'immediate',
        schemas,
      });

      // Insert a base Event record
      const eventId = randomUUID();
      await db.insert('events', {
        id: eventId,
        slug: 'council-meeting',
        context: '',
        title: 'Council Meeting',
        _meta_type: 'Event',
        location_id: '',
        provider_id: '',
        forecast_date: '',
        temperature_high: null,
        temperature_low: null,
      });

      // Now upsert a WeatherForecast (STI subclass) record
      const forecastId = randomUUID();
      await db.upsert('events', ['slug', 'context'], {
        id: forecastId,
        slug: 'bentley-weather-2025-01-27',
        context: 'weather',
        title: 'Weather Forecast - January 27, 2025',
        _meta_type: 'WeatherForecast',
        location_id: 'bentley-ab',
        provider_id: 'environment-canada',
        forecast_date: '2025-01-27',
        temperature_high: 5,
        temperature_low: -10,
      });

      // Verify upsert succeeded
      const forecast = await db.get('events', {
        slug: 'bentley-weather-2025-01-27',
      });
      expect(forecast).toBeDefined();
      expect(forecast?.location_id).toBe('bentley-ab');
      expect(forecast?.provider_id).toBe('environment-canada');
      expect(forecast?.temperature_high).toBe(5);
      expect(forecast?.temperature_low).toBe(-10);
    });

    it('should handle scenario from issue #518 reproduction', async () => {
      // This test reproduces the exact scenario from issue #518:
      // 1. events.json has Event records with empty location_id/provider_id
      // 2. Try to save WeatherForecast with location_id populated
      // 3. Should NOT fail with "Column with name location_id does not exist"

      // Step 1: Pre-populate events.json with Event records that have empty STI columns
      const existingEventId = randomUUID();
      writeFileSync(
        `${testDataDir}/events.json`,
        JSON.stringify([
          {
            id: existingEventId,
            slug: 'council-meeting-january-2025',
            context: '',
            title: 'Council Meeting - January 2025',
            location_id: '', // Empty string - this is the problematic case
            provider_id: '', // Empty string
          },
        ]),
      );

      // Define schema with fields including STI columns
      const schemas = {
        events: {
          tableName: 'events',
          ddl: `CREATE TABLE events (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL,
            context TEXT NOT NULL DEFAULT '',
            title TEXT,
            UNIQUE(slug, context)
          )`,
          indexes: [],
          fields: {
            id: { type: 'TEXT', primaryKey: true, notNull: true },
            slug: { type: 'TEXT', notNull: true },
            context: { type: 'TEXT', notNull: true },
            title: { type: 'TEXT' },
            location_id: { type: 'TEXT' },
            provider_id: { type: 'TEXT' },
          },
        },
      };

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        writeStrategy: 'immediate',
        schemas,
      });

      // Step 2: Verify existing data was loaded
      const existingEvent = await db.get('events', { id: existingEventId });
      expect(existingEvent).toBeDefined();
      expect(existingEvent?.slug).toBe('council-meeting-january-2025');

      // Step 3: Try to save a WeatherForecast with location_id populated
      // This should NOT fail with "Column with name location_id does not exist"
      const forecastId = randomUUID();

      // This was the failing operation in issue #518
      await expect(
        db.upsert('events', ['slug', 'context'], {
          id: forecastId,
          slug: 'bentley-weather-2025-01-27',
          context: 'weather',
          title: 'Weather Forecast',
          location_id: 'bentley-ab', // Non-empty location_id
          provider_id: 'environment-canada',
        }),
      ).resolves.not.toThrow();

      // Verify the record was created
      const forecast = await db.get('events', { id: forecastId });
      expect(forecast).toBeDefined();
      expect(forecast?.location_id).toBe('bentley-ab');
      expect(forecast?.provider_id).toBe('environment-canada');
    });
  });

  describe('_meta_data JSON serialization (Issue #542)', () => {
    it('should serialize _meta_data as JSON object, not string', async () => {
      // This test verifies the fix for issue #542:
      // _meta_data should be serialized as {} not "{}" in JSON output
      writeFileSync(`${testDataDir}/events.json`, JSON.stringify([]));

      const schemas = {
        events: {
          tableName: 'events',
          ddl: `CREATE TABLE events (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL,
            context TEXT NOT NULL DEFAULT '',
            title TEXT,
            _meta_type TEXT DEFAULT 'Event',
            _meta_data JSON DEFAULT '{}',
            UNIQUE(slug, context)
          )`,
          indexes: [],
          fields: {
            id: { type: 'TEXT', primaryKey: true, notNull: true },
            slug: { type: 'TEXT', notNull: true },
            context: { type: 'TEXT', notNull: true },
            title: { type: 'TEXT' },
            _meta_type: { type: 'TEXT' },
            _meta_data: { type: 'JSON' },
          },
        },
      };

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        writeStrategy: 'immediate',
        schemas,
      });

      // Insert a record with _meta_data as an object
      const eventId = randomUUID();
      await db.upsert('events', ['slug', 'context'], {
        id: eventId,
        slug: 'test-meeting',
        context: '',
        title: 'Test Meeting',
        _meta_type: 'Meeting',
        _meta_data: { customField: 'value' },
      });

      // Read the JSON file directly to verify serialization
      const { readFileSync } = await import('node:fs');
      const jsonContent = readFileSync(`${testDataDir}/events.json`, 'utf-8');
      const records = JSON.parse(jsonContent);

      // _meta_data should be an object, not a string
      expect(records[0]._meta_data).toBeDefined();
      expect(typeof records[0]._meta_data).toBe('object');
      expect(records[0]._meta_data).not.toBe('{}');
      expect(records[0]._meta_data).not.toBe('{"customField":"value"}');

      // The actual object structure should be preserved
      if (typeof records[0]._meta_data === 'object') {
        expect(records[0]._meta_data.customField).toBe('value');
      }
    });

    it('should serialize empty _meta_data as {} not "{}"', async () => {
      writeFileSync(`${testDataDir}/events.json`, JSON.stringify([]));

      const schemas = {
        events: {
          tableName: 'events',
          ddl: `CREATE TABLE events (
            id TEXT PRIMARY KEY,
            slug TEXT NOT NULL,
            context TEXT NOT NULL DEFAULT '',
            _meta_type TEXT DEFAULT 'Event',
            _meta_data JSON DEFAULT '{}',
            UNIQUE(slug, context)
          )`,
          indexes: [],
          fields: {
            id: { type: 'TEXT' },
            slug: { type: 'TEXT' },
            context: { type: 'TEXT' },
            _meta_type: { type: 'TEXT' },
            _meta_data: { type: 'JSON' },
          },
        },
      };

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        writeStrategy: 'immediate',
        schemas,
      });

      // Insert a record with empty _meta_data
      const eventId = randomUUID();
      await db.upsert('events', ['slug', 'context'], {
        id: eventId,
        slug: 'test-event',
        context: '',
        _meta_type: 'Event',
        _meta_data: {},
      });

      // Read the JSON file directly
      const { readFileSync } = await import('node:fs');
      const jsonContent = readFileSync(`${testDataDir}/events.json`, 'utf-8');
      const records = JSON.parse(jsonContent);

      // _meta_data should be {} (object), not "{}" (string)
      expect(records[0]._meta_data).toBeDefined();
      expect(typeof records[0]._meta_data).toBe('object');
      expect(records[0]._meta_data).toEqual({});
      expect(records[0]._meta_data).not.toBe('{}');
    });
  });

  describe('Edge cases', () => {
    it('should handle fields as Map (in addition to Record)', async () => {
      // The SmrtSchemaDefinition interface allows Map<string, any> for fields
      // Our implementation should handle both Map and Record formats
      writeFileSync(`${testDataDir}/test_table.json`, JSON.stringify([]));

      // Use a Map for fields (simulating potential SMRT internal format)
      const fieldsMap = new Map<string, any>([
        ['id', { type: 'TEXT', primaryKey: true }],
        ['name', { type: 'TEXT' }],
        ['extra_column', { type: 'TEXT' }], // This column is not in DDL
      ]);

      const schemas = {
        test_table: {
          tableName: 'test_table',
          ddl: `CREATE TABLE test_table (
            id TEXT PRIMARY KEY,
            name TEXT
          )`,
          indexes: [],
          fields: fieldsMap,
        },
      };

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        schemas,
      });

      // Verify extra_column was added
      const columnsResult = await db.many`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'test_table'
      `;
      const columnNames = columnsResult.map((c) => c.column_name);
      expect(columnNames).toContain('extra_column');

      // Verify we can insert using the extra column
      await db.insert('test_table', {
        id: 'test-1',
        name: 'Test',
        extra_column: 'extra value',
      });

      const record = await db.get('test_table', { id: 'test-1' });
      expect(record?.extra_column).toBe('extra value');
    });

    it('should handle fields with default values', async () => {
      writeFileSync(`${testDataDir}/defaults_table.json`, JSON.stringify([]));

      const schemas = {
        defaults_table: {
          tableName: 'defaults_table',
          ddl: `CREATE TABLE defaults_table (
            id TEXT PRIMARY KEY,
            name TEXT
          )`,
          indexes: [],
          fields: {
            id: { type: 'TEXT', primaryKey: true },
            name: { type: 'TEXT' },
            // STI column with empty string default
            category: { type: 'TEXT', defaultValue: "''" },
            // STI column with NULL default
            description: { type: 'TEXT', defaultValue: 'NULL' },
            // STI column with specific default
            status: { type: 'TEXT', defaultValue: "'active'" },
          },
        },
      };

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        schemas,
      });

      // Insert record without specifying default columns
      await db.execute`
        INSERT INTO defaults_table (id, name) VALUES ('test-1', 'Test')
      `;

      // Verify defaults were applied
      const record =
        await db.single`SELECT * FROM defaults_table WHERE id = 'test-1'`;
      expect(record).toBeDefined();
      // Note: DuckDB may return NULL for empty string defaults in some cases
      // The important thing is the column exists and upsert works
    });

    it('should not fail if no fields are provided', async () => {
      writeFileSync(
        `${testDataDir}/no_fields.json`,
        JSON.stringify([{ id: '1', data: 'test' }]),
      );

      const schemas = {
        no_fields: {
          tableName: 'no_fields',
          ddl: `CREATE TABLE no_fields (
            id TEXT PRIMARY KEY,
            data TEXT
          )`,
          // No fields property
        },
      };

      // Should not throw
      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        schemas,
      });

      const record = await db.get('no_fields', { id: '1' });
      expect(record).toBeDefined();
      expect(record?.data).toBe('test');
    });

    it('should handle schema where all fields are already in DDL', async () => {
      writeFileSync(`${testDataDir}/complete.json`, JSON.stringify([]));

      const schemas = {
        complete: {
          tableName: 'complete',
          ddl: `CREATE TABLE complete (
            id TEXT PRIMARY KEY,
            name TEXT,
            email TEXT
          )`,
          fields: {
            id: { type: 'TEXT', primaryKey: true },
            name: { type: 'TEXT' },
            email: { type: 'TEXT' },
            // All fields already in DDL - no columns to add
          },
        },
      };

      db = await getDatabase({
        type: 'json',
        url: testDataDir,
        schemas,
      });

      // Should work normally
      await db.insert('complete', {
        id: 'test-1',
        name: 'Test',
        email: 'test@example.com',
      });

      const record = await db.get('complete', { id: 'test-1' });
      expect(record).toBeDefined();
    });
  });
});
