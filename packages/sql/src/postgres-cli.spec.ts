import { describe, expect, it } from 'vitest';
import {
  assertCanExportDatabase,
  assertCanImportDatabase,
  databaseNameFromUrl,
  isLocalDatabaseUrl,
  postgresEnvFromUrl,
  redactDatabaseUrl,
  runCommand,
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

  describe('runCommand env scrubbing', () => {
    it('scrubs inherited routing vars like PGHOST', async () => {
      const previous = process.env.PGHOST;
      process.env.PGHOST = 'staging.example.com';
      try {
        await expect(
          runCommand(
            process.execPath,
            ['-e', 'if (process.env.PGHOST) process.exit(1)'],
            { stdio: 'pipe' },
          ),
        ).resolves.toBeUndefined();
      } finally {
        if (previous === undefined) delete process.env.PGHOST;
        else process.env.PGHOST = previous;
      }
    });

    it('preserves inherited auth vars like PGPASSFILE', async () => {
      const previous = process.env.PGPASSFILE;
      process.env.PGPASSFILE = '/tmp/test-pgpass';
      try {
        await expect(
          runCommand(
            process.execPath,
            ['-e', 'if (!process.env.PGPASSFILE) process.exit(1)'],
            { stdio: 'pipe' },
          ),
        ).resolves.toBeUndefined();
      } finally {
        if (previous === undefined) delete process.env.PGPASSFILE;
        else process.env.PGPASSFILE = previous;
      }
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
        // Only vars with URL-derived values are SET. Inherited
        // libpq vars are scrubbed by `runCommand` separately —
        // setting them to empty string here would break libpq
        // (PGSERVICE='' is treated as "service named empty string"
        // and produces "definition of service \"\" not found").
        PGDATABASE: 'app',
        PGHOST: 'db.example.com',
        PGPORT: '5439',
        PGUSER: 'user',
        PGPASSWORD: 'secret',
        PGSSLMODE: 'require',
      });
    });

    it('omits libpq vars when the URL has no value for them', () => {
      // postgresql:///app — no host, no port, no user, no password.
      // The returned env contains only PGDATABASE; the rest are absent
      // entirely (NOT empty strings). The scrubbing of inherited
      // PGHOST/PGSERVICE from the parent process happens in
      // `runCommand`, not here.
      const env = postgresEnvFromUrl('postgresql:///app');
      expect(env).toEqual({ PGDATABASE: 'app' });
      expect('PGHOST' in env).toBe(false);
      expect('PGSERVICE' in env).toBe(false);
      expect('PGPASSFILE' in env).toBe(false);
    });

    it('reads password from a ?password= query parameter', () => {
      // Neon/Supabase emit URLs that put the password in the query
      // string. `redactDatabaseUrl` already masks these in logs; the
      // env builder also needs to honor them so the connection works.
      expect(
        postgresEnvFromUrl(
          'postgresql://user@host.example.com/app?password=s3cret&sslmode=require',
        ),
      ).toMatchObject({
        PGPASSWORD: 's3cret',
        PGUSER: 'user',
      });
    });

    it('reads password from ?passwd= and ?pass= aliases', () => {
      expect(
        postgresEnvFromUrl('postgresql://user@host/app?passwd=x'),
      ).toMatchObject({ PGPASSWORD: 'x' });
      expect(
        postgresEnvFromUrl('postgresql://user@host/app?pass=y'),
      ).toMatchObject({ PGPASSWORD: 'y' });
    });

    it('prefers userinfo password over query-param when both are set', () => {
      // Defensive precedence — userinfo is the canonical form.
      expect(
        postgresEnvFromUrl(
          'postgresql://user:fromuserinfo@host/app?password=fromquery',
        ),
      ).toMatchObject({ PGPASSWORD: 'fromuserinfo' });
    });

    it('strips IPv6 brackets when assigning PGHOST', () => {
      // URL.hostname returns '[::1]' (with brackets) for IPv6 literals,
      // but libpq expects the bare address. The locality check correctly
      // strips brackets; the env builder must do the same or pg_dump
      // fails to resolve the host.
      expect(
        postgresEnvFromUrl('postgresql://user:pass@[::1]:5432/app'),
      ).toMatchObject({ PGHOST: '::1', PGPORT: '5432' });

      expect(
        postgresEnvFromUrl('postgresql://user:pass@[2001:db8::1]/app'),
      ).toMatchObject({ PGHOST: '2001:db8::1' });
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
