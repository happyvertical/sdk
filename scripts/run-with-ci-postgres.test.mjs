import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDatabaseName,
  databaseEnvironment,
  databaseUrl,
  resolveBaseUrl,
} from './run-with-ci-postgres.mjs';

// Synchronous bodies only: this restores as soon as `body` returns, so an async
// body would see the environment reset before it settled.
function withEnv(overrides, body) {
  const keys = ['CI_POSTGRES_BASE_URL', 'DATABASE_URL'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    Object.assign(process.env, overrides);
    return body();
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

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

// The only managed source is CI_POSTGRES_BASE_URL. Every CI run provisions its
// own throwaway container and sets it explicitly, so there must be no third
// source — in particular no runner-mounted credential file. A silent fallback
// to a shared server would create and drop databases there, and nothing
// reclaims what an interrupted run leaves behind.
test('resolves a managed connection only from CI_POSTGRES_BASE_URL', () => {
  const url = 'postgresql://postgres@localhost:5432/postgres';
  withEnv({ CI_POSTGRES_BASE_URL: url }, () => {
    assert.deepEqual(resolveBaseUrl(), { managed: true, url });
  });
});

test('treats DATABASE_URL as unmanaged and never outranks the CI URL', () => {
  withEnv({ DATABASE_URL: 'postgresql://dev@localhost:5432/dev' }, () => {
    assert.deepEqual(resolveBaseUrl(), {
      managed: false,
      url: 'postgresql://dev@localhost:5432/dev',
    });
  });
  withEnv(
    {
      CI_POSTGRES_BASE_URL: 'postgresql://ci@localhost:5432/ci',
      DATABASE_URL: 'postgresql://dev@localhost:5432/dev',
    },
    () => {
      assert.deepEqual(resolveBaseUrl(), {
        managed: true,
        url: 'postgresql://ci@localhost:5432/ci',
      });
    },
  );
});

test('fails closed when neither source is set', () => {
  withEnv({}, () => {
    assert.throws(resolveBaseUrl, {
      message: 'PostgreSQL tests require CI_POSTGRES_BASE_URL or DATABASE_URL',
    });
  });
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
