#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_URL_FILE = '/var/run/ci-services/postgres/url';
const MAX_AGE_SECONDS = 6 * 60 * 60;

export function databaseEpoch(name) {
  const match = /^sdk_ci_(\d+)_/.exec(name);
  return match ? Number(match[1]) : null;
}

export function expiredDatabaseNames(names, now = Math.floor(Date.now() / 1000)) {
  return names.filter((name) => {
    const epoch = databaseEpoch(name);
    return epoch !== null && now - epoch > MAX_AGE_SECONDS;
  });
}

function baseUrl() {
  if (process.env.CI_POSTGRES_BASE_URL) return process.env.CI_POSTGRES_BASE_URL;
  const file = process.env.CI_POSTGRES_BASE_URL_FILE || DEFAULT_URL_FILE;
  return readFileSync(file, 'utf8').trim();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
  return result.stdout;
}

export function main() {
  const url = baseUrl();
  if (process.env.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${url}`);
  const names = run('psql', [
    url,
    '--no-align',
    '--tuples-only',
    '--command',
    "SELECT datname FROM pg_database WHERE datname LIKE 'sdk_ci\\_%' ESCAPE '\\'",
  ])
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);

  for (const name of expiredDatabaseNames(names)) {
    console.log(`Dropping abandoned CI database ${name}`);
    run('dropdb', ['--force', `--maintenance-db=${url}`, name], { stdio: 'inherit' });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
