import { describe, expect, it } from 'vitest';
import {
  assertCanExportDatabase,
  assertCanImportDatabase,
  databaseNameFromUrl,
  isLocalDatabaseUrl,
  postgresEnvFromUrl,
  redactDatabaseUrl,
} from './postgres-cli';

describe('postgres-cli URL helpers', () => {
  describe('databaseNameFromUrl', () => {
    it('extracts the path segment', () => {
      expect(
        databaseNameFromUrl('postgresql://user:pass@localhost:5432/app_name'),
      ).toBe('app_name');
    });

    it('throws when the URL has no database', () => {
      expect(() =>
        databaseNameFromUrl('postgresql://user:pass@localhost:5432/'),
      ).toThrow(/database name/u);
    });
  });

  describe('isLocalDatabaseUrl', () => {
    it.each([
      ['postgresql://user:pass@localhost:5432/app', true],
      ['postgresql://user:pass@127.0.0.1:5432/app', true],
      ['postgresql://user:pass@[::1]:5432/app', true],
      ['postgresql://user:pass@db.example.com:5432/app', false],
    ])('%s -> %s', (url, expected) => {
      expect(isLocalDatabaseUrl(url)).toBe(expected);
    });
  });

  describe('redactDatabaseUrl', () => {
    it('hides credentials', () => {
      expect(
        redactDatabaseUrl('postgresql://user:secret@localhost:5432/app'),
      ).toBe('postgresql://***:***@localhost:5432/app');
    });

    it('returns a sentinel for unparseable input', () => {
      expect(redactDatabaseUrl('not a url')).toBe('[invalid database url]');
    });
  });

  describe('postgresEnvFromUrl', () => {
    it('maps URL components to libpq env vars', () => {
      expect(
        postgresEnvFromUrl(
          'postgresql://user:secret@db.example.com:5439/app?sslmode=require',
        ),
      ).toEqual({
        PGDATABASE: 'app',
        PGHOST: 'db.example.com',
        PGPASSWORD: 'secret',
        PGPORT: '5439',
        PGSSLMODE: 'require',
        PGUSER: 'user',
      });
    });

    it('honors a database override', () => {
      expect(
        postgresEnvFromUrl(
          'postgresql://user:secret@db.example.com:5439/app',
          'postgres',
        ),
      ).toMatchObject({ PGDATABASE: 'postgres' });
    });

    it('rejects non-postgres protocols', () => {
      expect(() => postgresEnvFromUrl('mysql://user@localhost/app')).toThrow(
        /protocol/u,
      );
    });
  });

  describe('assertCanExportDatabase', () => {
    const local = 'postgresql://user:pass@localhost:5432/app';
    const remote = 'postgresql://user:pass@db.example.com:5432/app';

    it('blocks prod-flavored export against a local DB by default', () => {
      expect(() => assertCanExportDatabase(local, { prod: true })).toThrow(
        /production-flavored export against a local database/u,
      );
    });

    it('allows prod export against local when explicitly allowed', () => {
      expect(() =>
        assertCanExportDatabase(local, { prod: true, allowLocal: true }),
      ).not.toThrow();
    });

    it('blocks regular export against a non-local DB', () => {
      expect(() => assertCanExportDatabase(remote, { prod: false })).toThrow(
        /non-local database/u,
      );
    });

    it('allows non-local export when explicitly allowed', () => {
      expect(() =>
        assertCanExportDatabase(remote, { prod: false, allowProduction: true }),
      ).not.toThrow();
    });
  });

  describe('assertCanImportDatabase', () => {
    it('blocks non-local imports by default', () => {
      expect(() =>
        assertCanImportDatabase(
          'postgresql://user:pass@db.example.com/app',
          {},
        ),
      ).toThrow(/non-local database/u);
    });

    it('allows non-local imports when explicitly allowed', () => {
      expect(() =>
        assertCanImportDatabase('postgresql://user:pass@db.example.com/app', {
          allowProduction: true,
        }),
      ).not.toThrow();
    });

    it('allows local imports', () => {
      expect(() =>
        assertCanImportDatabase('postgresql://user:pass@localhost/app', {}),
      ).not.toThrow();
    });
  });
});
