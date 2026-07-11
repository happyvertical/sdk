import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDatabaseName,
  databaseEnvironment,
  databaseUrl,
} from './run-with-ci-postgres.mjs';

test('creates a safe, bounded SDK database name with run and attempt identity', () => {
  const name = createDatabaseName({
    epoch: 1_700_000_000,
    runId: '123',
    attempt: '2',
    packageName: '@happyvertical/sql',
    pid: 42,
  });
  assert.equal(name, 'sdk_ci_1700000000_123_2_happyvertical_sql_42');
  assert.match(name, /^[a-z0-9_]+$/);
  assert.ok(name.length <= 63);
});

test('replaces only the database path in a PostgreSQL URL', () => {
  assert.equal(
    databaseUrl(
      'postgresql://ci_runner:secret@db:5432/ci?sslmode=require',
      'sdk_ci_1_2_3_sql_4',
    ),
    'postgresql://ci_runner:secret@db:5432/sdk_ci_1_2_3_sql_4?sslmode=require',
  );
});

test('exports the isolated URL for SDK, SQLOO, and libpq clients', () => {
  const url =
    'postgresql://ci_runner:secret%20value@authority:5433/sdk_ci_1' +
    '?host=query-host&port=6543&sslmode=verify-full&application_name=sdk%20ci';
  const environment = databaseEnvironment(url, { KEEP_ME: 'yes' });
  assert.equal(environment.KEEP_ME, 'yes');
  assert.equal(environment.DATABASE_URL, url);
  assert.equal(environment.HAVE_SQL_URL, url);
  assert.equal(environment.SQLOO_URL, url);
  assert.equal(environment.SQLOO_DATABASE, 'sdk_ci_1');
  assert.equal(environment.PGHOST, 'query-host');
  assert.equal(environment.PGPORT, '6543');
  assert.equal(environment.PGUSER, 'ci_runner');
  assert.equal(environment.PGPASSWORD, 'secret value');
  assert.equal(environment.PGDATABASE, 'sdk_ci_1');
  assert.equal(environment.PGSSLMODE, 'verify-full');
  assert.equal(environment.PGAPPNAME, 'sdk ci');
});
