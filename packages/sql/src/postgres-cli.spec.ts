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

    it('redacts password supplied as a query parameter', () => {
      // Cloud providers (Neon/Supabase/Railway) emit URLs of this shape.
      // Without query-param redaction the password would persist in the
      // backup manifest and logs.
      const redacted = redactDatabaseUrl(
        'postgresql://user@host.example.com/app?password=s3cret&sslmode=require',
      );
      expect(redacted).not.toContain('s3cret');
      expect(redacted).toContain('password=***');
      expect(redacted).toContain('sslmode=require');
    });

    it('redacts variant query-param spellings (passwd, pass)', () => {
      expect(redactDatabaseUrl('postgresql://host/app?passwd=oops')).toContain(
        'passwd=***',
      );
      expect(redactDatabaseUrl('postgresql://host/app?pass=oops')).toContain(
        'pass=***',
      );
    });
  });

  describe('postgresEnvFromUrl', () => {
    it('maps URL components to libpq env vars', () => {
      expect(
        postgresEnvFromUrl(
          'postgresql://user:secret@db.example.com:5439/app?sslmode=require',
        ),
      ).toEqual({
        // Connection-target vars are always present and pinned to the
        // URL value (or empty) so PGHOST/PGSERVICE from the parent
        // process can't redirect the child to a different DB.
        PGDATABASE: 'app',
        PGHOST: 'db.example.com',
        PGHOSTADDR: '',
        PGPORT: '5439',
        PGUSER: 'user',
        PGPASSWORD: 'secret',
        PGSERVICE: '',
        PGSERVICEFILE: '',
        PGPASSFILE: '',
        PGSSLMODE: 'require',
      });
    });

    it('scrubs inherited libpq connection vars when URL omits them', () => {
      // postgresql:///app — no host, no port, no user, no password.
      // Without scrubbing, a parent process PGHOST=staging would silently
      // redirect pg_dump to staging even though the caller passed a
      // host-less URL clearly meant to be local.
      const env = postgresEnvFromUrl('postgresql:///app');
      expect(env.PGHOST).toBe('');
      expect(env.PGHOSTADDR).toBe('');
      expect(env.PGPORT).toBe('');
      expect(env.PGUSER).toBe('');
      expect(env.PGPASSWORD).toBe('');
      expect(env.PGSERVICE).toBe('');
      expect(env.PGSERVICEFILE).toBe('');
      expect(env.PGPASSFILE).toBe('');
      expect(env.PGDATABASE).toBe('app');
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

    it('gracefully handles raw percent characters in credentials', () => {
      expect(
        postgresEnvFromUrl('postgresql://user:p%ss@localhost:5432/app'),
      ).toMatchObject({
        PGUSER: 'user',
        PGPASSWORD: 'p%ss',
      });
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
