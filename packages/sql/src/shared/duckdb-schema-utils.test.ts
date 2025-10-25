import { describe, expect, it } from 'vitest';
import {
  convertUniqueIndexesToInlineConstraints,
  hasUniqueIndexes,
  parseIndexStatement,
} from './duckdb-schema-utils';

describe('duckdb-schema-utils', () => {
  describe('parseIndexStatement', () => {
    it('should parse a UNIQUE index statement', () => {
      const sql =
        'CREATE UNIQUE INDEX ds_slug_context_idx ON ds (slug, context)';
      const result = parseIndexStatement(sql);

      expect(result).toEqual({
        name: 'ds_slug_context_idx',
        columns: ['slug', 'context'],
        unique: true,
        sql,
      });
    });

    it('should parse a regular (non-UNIQUE) index statement', () => {
      const sql = 'CREATE INDEX idx_users_email ON users (email)';
      const result = parseIndexStatement(sql);

      expect(result).toEqual({
        name: 'idx_users_email',
        columns: ['email'],
        unique: false,
        sql,
      });
    });

    it('should parse index with IF NOT EXISTS', () => {
      const sql =
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products (sku)';
      const result = parseIndexStatement(sql);

      expect(result).toEqual({
        name: 'idx_products_sku',
        columns: ['sku'],
        unique: true,
        sql,
      });
    });

    it('should parse multi-column index', () => {
      const sql =
        'CREATE INDEX idx_orders_user_date ON orders (user_id, created_at)';
      const result = parseIndexStatement(sql);

      expect(result).toEqual({
        name: 'idx_orders_user_date',
        columns: ['user_id', 'created_at'],
        unique: false,
        sql,
      });
    });

    it('should return null for invalid SQL', () => {
      const result = parseIndexStatement('NOT A VALID INDEX STATEMENT');
      expect(result).toBeNull();
    });

    it('should handle extra whitespace', () => {
      const sql = `
        CREATE   UNIQUE   INDEX   ds_slug_context_idx
        ON   ds   (slug,   context)
      `;
      const result = parseIndexStatement(sql);

      expect(result?.name).toBe('ds_slug_context_idx');
      expect(result?.columns).toEqual(['slug', 'context']);
      expect(result?.unique).toBe(true);
    });
  });

  describe('hasUniqueIndexes', () => {
    it('should return true when UNIQUE indexes are present', () => {
      const indexes = [
        'CREATE UNIQUE INDEX ds_slug_context_idx ON ds (slug, context)',
        'CREATE INDEX idx_users_email ON users (email)',
      ];
      expect(hasUniqueIndexes(indexes)).toBe(true);
    });

    it('should return false when only regular indexes are present', () => {
      const indexes = [
        'CREATE INDEX idx_users_email ON users (email)',
        'CREATE INDEX idx_posts_user_id ON posts (user_id)',
      ];
      expect(hasUniqueIndexes(indexes)).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(hasUniqueIndexes([])).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(hasUniqueIndexes(undefined)).toBe(false);
    });
  });

  describe('convertUniqueIndexesToInlineConstraints', () => {
    it('should convert single UNIQUE index to inline constraint', () => {
      const ddl = `CREATE TABLE ds (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  context TEXT NOT NULL
)`;
      const indexes = [
        'CREATE UNIQUE INDEX ds_slug_context_idx ON ds (slug, context)',
      ];

      const result = convertUniqueIndexesToInlineConstraints(ddl, indexes);

      expect(result.ddl).toContain('UNIQUE(slug, context)');
      expect(result.indexes).toEqual([]);
    });

    it('should convert multiple UNIQUE indexes', () => {
      const ddl = `CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT NOT NULL
)`;
      const indexes = [
        'CREATE UNIQUE INDEX idx_users_email ON users (email)',
        'CREATE UNIQUE INDEX idx_users_username ON users (username)',
      ];

      const result = convertUniqueIndexesToInlineConstraints(ddl, indexes);

      expect(result.ddl).toContain('UNIQUE(email)');
      expect(result.ddl).toContain('UNIQUE(username)');
      expect(result.indexes).toEqual([]);
    });

    it('should preserve regular (non-UNIQUE) indexes', () => {
      const ddl = `CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  slug TEXT NOT NULL
)`;
      const indexes = [
        'CREATE UNIQUE INDEX idx_posts_slug ON posts (slug)',
        'CREATE INDEX idx_posts_user_id ON posts (user_id)',
      ];

      const result = convertUniqueIndexesToInlineConstraints(ddl, indexes);

      expect(result.ddl).toContain('UNIQUE(slug)');
      expect(result.indexes).toEqual([
        'CREATE INDEX idx_posts_user_id ON posts (user_id)',
      ]);
    });

    it('should handle table with existing constraints', () => {
      const ddl = `CREATE TABLE products (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL CHECK(price > 0)
)`;
      const indexes = [
        'CREATE UNIQUE INDEX idx_products_sku ON products (sku)',
      ];

      const result = convertUniqueIndexesToInlineConstraints(ddl, indexes);

      expect(result.ddl).toContain('UNIQUE(sku)');
      expect(result.ddl).toContain('CHECK(price > 0)');
    });

    it('should return unchanged DDL when no indexes provided', () => {
      const ddl = `CREATE TABLE simple (
  id TEXT PRIMARY KEY,
  name TEXT
)`;

      const result = convertUniqueIndexesToInlineConstraints(ddl, undefined);

      expect(result.ddl).toBe(ddl);
      expect(result.indexes).toEqual([]);
    });

    it('should return unchanged DDL when only regular indexes provided', () => {
      const ddl = `CREATE TABLE logs (
  id TEXT PRIMARY KEY,
  level TEXT,
  message TEXT
)`;
      const indexes = ['CREATE INDEX idx_logs_level ON logs (level)'];

      const result = convertUniqueIndexesToInlineConstraints(ddl, indexes);

      expect(result.ddl).toBe(ddl);
      expect(result.indexes).toEqual(indexes);
    });

    it('should handle DDL with trailing comma on last column', () => {
      const ddl = `CREATE TABLE items (
  id TEXT PRIMARY KEY,
  name TEXT,
)`;
      const indexes = ['CREATE UNIQUE INDEX idx_items_name ON items (name)'];

      const result = convertUniqueIndexesToInlineConstraints(ddl, indexes);

      expect(result.ddl).toContain('UNIQUE(name)');
    });

    it('should handle multi-column UNIQUE constraint', () => {
      const ddl = `CREATE TABLE events (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  context TEXT NOT NULL,
  title TEXT
)`;
      const indexes = [
        'CREATE UNIQUE INDEX events_slug_context_idx ON events (slug, context)',
      ];

      const result = convertUniqueIndexesToInlineConstraints(ddl, indexes);

      expect(result.ddl).toContain('UNIQUE(slug, context)');
      expect(result.indexes).toEqual([]);
    });

    it('should handle DDL with closing paren and semicolon', () => {
      const ddl = `CREATE TABLE test (
  id TEXT PRIMARY KEY,
  value TEXT
);`;
      const indexes = ['CREATE UNIQUE INDEX idx_test_value ON test (value)'];

      const result = convertUniqueIndexesToInlineConstraints(ddl, indexes);

      expect(result.ddl).toContain('UNIQUE(value)');
      expect(result.ddl).toContain(');');
    });
  });
});
