import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDir = resolve(workspaceRoot, 'packages/accounting');
const fixture = mkdtempSync(resolve(tmpdir(), 'accounting-packed-node-'));

try {
  run('pnpm', ['pack', '--pack-destination', fixture], packageDir);
  const tarballs = readdirSync(fixture).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1)
    throw new Error(`Expected one accounting tarball, found ${tarballs.length}`);

  const accountingDir = resolve(
    fixture,
    'consumer/node_modules/@happyvertical/accounting',
  );
  mkdirSync(accountingDir, { recursive: true });
  run(
    'tar',
    ['-xzf', resolve(fixture, tarballs[0]), '--strip-components=1'],
    accountingDir,
  );

  linkDependency(
    resolve(packageDir, 'node_modules/intuit-oauth'),
    resolve(fixture, 'consumer/node_modules/intuit-oauth'),
  );
  linkDependency(
    resolve(workspaceRoot, 'packages/utils'),
    resolve(fixture, 'consumer/node_modules/@happyvertical/utils'),
  );

  writeFileSync(
    resolve(fixture, 'consumer/smoke.mjs'),
    `import assert from 'node:assert/strict';
import OAuthClient from 'intuit-oauth';

const noHttp = new Error('NO_HTTP_REFRESH_SENTINEL');
let refreshReached = false;
OAuthClient.prototype.refresh = async function () {
  refreshReached = true;
  throw noHttp;
};

const accounting = await import('@happyvertical/accounting');
const oauth = await accounting.createQuickBooksOAuthClient({
  clientId: 'packed-client',
  clientSecret: 'packed-secret',
  environment: 'sandbox',
  redirectUri: 'https://app.example.test/api/accounting/quickbooks/callback',
});
assert.match(
  oauth.authorizationUrl({ state: 'packed-state' }),
  /^https:\\/\\/appcenter\\.intuit\\.com\\/connect\\/oauth2\\?/,
);

const provider = await accounting.getAccountingProvider({
  type: 'quickbooks',
  clientId: 'packed-client',
  clientSecret: 'packed-secret',
  realmId: 'packed-realm',
  refreshToken: 'packed-refresh',
  environment: 'sandbox',
});
await assert.rejects(provider.ensureAccessToken(), (error) => error === noHttp);
assert.equal(refreshReached, true);
console.log('packed accounting Node OAuth and refresh dependency smoke passed');
`,
  );

  run(process.execPath, ['smoke.mjs'], resolve(fixture, 'consumer'));
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

function linkDependency(source, destination) {
  mkdirSync(dirname(destination), { recursive: true });
  symlinkSync(realpathSync(source), destination, 'dir');
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || `${command} failed`);
  if (result.stdout) process.stdout.write(result.stdout);
}
