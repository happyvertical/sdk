#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const LIBPQ_PARAMETER_ENV = {
  application_name: 'PGAPPNAME',
  channel_binding: 'PGCHANNELBINDING',
  client_encoding: 'PGCLIENTENCODING',
  connect_timeout: 'PGCONNECT_TIMEOUT',
  dbname: 'PGDATABASE',
  gssencmode: 'PGGSSENCMODE',
  gsslib: 'PGGSSLIB',
  host: 'PGHOST',
  hostaddr: 'PGHOSTADDR',
  keepalives: 'PGKEEPALIVES',
  keepalives_count: 'PGKEEPALIVESCOUNT',
  keepalives_idle: 'PGKEEPALIVESIDLE',
  keepalives_interval: 'PGKEEPALIVESINTERVAL',
  krbsrvname: 'PGKRBSRVNAME',
  load_balance_hosts: 'PGLOADBALANCEHOSTS',
  options: 'PGOPTIONS',
  passfile: 'PGPASSFILE',
  password: 'PGPASSWORD',
  port: 'PGPORT',
  requirepeer: 'PGREQUIREPEER',
  service: 'PGSERVICE',
  servicefile: 'PGSERVICEFILE',
  sslcert: 'PGSSLCERT',
  sslcrl: 'PGSSLCRL',
  sslcrldir: 'PGSSLCRLDIR',
  sslkey: 'PGSSLKEY',
  ssl_max_protocol_version: 'PGSSLMAXPROTOCOLVERSION',
  ssl_min_protocol_version: 'PGSSLMINPROTOCOLVERSION',
  sslmode: 'PGSSLMODE',
  sslrootcert: 'PGSSLROOTCERT',
  sslsni: 'PGSSLSNI',
  target_session_attrs: 'PGTARGETSESSIONATTRS',
  tcp_user_timeout: 'PGTCPUSER_TIMEOUT',
  user: 'PGUSER',
};

export function createDatabaseName({
  epoch = Math.floor(Date.now() / 1000),
  runId = process.env.GITHUB_RUN_ID || 'local',
  attempt = process.env.GITHUB_RUN_ATTEMPT || '1',
  packageName = process.env.npm_package_name || 'package',
  pid = process.pid,
} = {}) {
  const safe = `${packageName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `sdk_ci_${epoch}_${runId}_${attempt}_${safe}_${pid}`.slice(0, 63);
}

export function databaseUrl(baseUrl, databaseName) {
  const url = new URL(baseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

export function databaseEnvironment(testUrl, environment = process.env) {
  const url = new URL(testUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  const libpqEnvironment = {
    PGHOST: url.hostname,
    PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database,
  };

  for (const [parameter, value] of url.searchParams) {
    const environmentName = LIBPQ_PARAMETER_ENV[parameter];
    if (environmentName) libpqEnvironment[environmentName] = value;
  }

  return {
    ...environment,
    DATABASE_URL: testUrl,
    TEST_DB_URL: testUrl,
    TEST_DB_ADAPTER: 'postgres',
    HAVE_SQL_URL: testUrl,
    SQLOO_URL: testUrl,
    SQLOO_HOST: libpqEnvironment.PGHOST,
    SQLOO_PORT: libpqEnvironment.PGPORT,
    SQLOO_USER: libpqEnvironment.PGUSER,
    SQLOO_PASSWORD: libpqEnvironment.PGPASSWORD,
    SQLOO_DATABASE: libpqEnvironment.PGDATABASE,
    ...libpqEnvironment,
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

// `CI_POSTGRES_BASE_URL` is a maintenance connection we may create and drop
// databases on; `DATABASE_URL` is used exactly as given. There is deliberately
// no runner-mounted-file fallback: every CI run provisions its own throwaway
// PostgreSQL container and sets the variable explicitly, so a silent fallback
// to a shared server would leak databases that nothing reclaims.
export function resolveBaseUrl() {
  if (process.env.CI_POSTGRES_BASE_URL) {
    return { managed: true, url: process.env.CI_POSTGRES_BASE_URL };
  }
  if (process.env.DATABASE_URL) {
    return { managed: false, url: process.env.DATABASE_URL };
  }
  throw new Error(
    'PostgreSQL tests require CI_POSTGRES_BASE_URL or DATABASE_URL',
  );
}

export async function main(argv = process.argv.slice(2)) {
  const separator = argv.indexOf('--');
  const commandArgs = separator === -1 ? argv : argv.slice(separator + 1);
  if (commandArgs.length === 0) {
    throw new Error('Usage: run-with-ci-postgres.mjs -- <command> [args...]');
  }

  const [command, ...args] = commandArgs;
  const base = resolveBaseUrl();
  let databaseName;
  let testUrl = base.url;

  if (process.env.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${base.url}`);

  try {
    if (base.managed) {
      databaseName = createDatabaseName();
      const status = run('createdb', [`--maintenance-db=${base.url}`, databaseName]);
      if (status !== 0) throw new Error(`createdb failed with status ${status}`);
      testUrl = databaseUrl(base.url, databaseName);
    }
    if (process.env.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${testUrl}`);
    return run(command, args, { env: databaseEnvironment(testUrl) });
  } finally {
    if (databaseName) {
      const status = run('dropdb', [
        '--force',
        `--maintenance-db=${base.url}`,
        databaseName,
      ]);
      if (status !== 0) {
        console.error(
          `Failed to drop ${databaseName}; nothing will reclaim it later. ` +
            'CI discards the service container with the job; drop it by hand ' +
            'on a local server.',
        );
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then((status) => process.exit(status))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
