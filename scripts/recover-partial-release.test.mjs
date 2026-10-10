import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { recoverPartialRelease, recoveries, recovery, versionExists } from './recover-partial-release.mjs';

function fixture(t, candidate = recovery.occupied) {
  const root = mkdtempSync(join(tmpdir(), 'sdk-release-recovery-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, value) => writeFileSync(join(root, path), typeof value === 'string' ? value : JSON.stringify(value));
  mkdirSync(join(root, '.changeset'));
  for (const name of ['utils', 'speech']) {
    mkdirSync(join(root, 'packages', name), { recursive: true });
    put(`packages/${name}/package.json`, { name: `@happyvertical/${name}`, version: candidate,
      publishConfig: { access: 'public' }, ...(name === 'speech' ? { dependencies: { '@happyvertical/utils': candidate } } : {}) });
  }
  put('package.json', { name: 'fixture', private: true, version: '0.100.3', workspaces: ['packages/*'] });
  put('pnpm-workspace.yaml', 'packages:\n  - packages/*\n');
  put('.changeset/config.json', { changelog: '@changesets/cli/changelog', commit: false,
    fixed: [['@happyvertical/*']], linked: [], access: 'public', baseBranch: 'main',
    updateInternalDependencies: 'patch', ignore: [] });
  return { root, put, read: (path) => readFileSync(join(root, path), 'utf8') };
}

for (const candidate of ['0.100.4', '0.101.1', '0.101.3', '0.102.0']) {
  test(`leaves unreserved candidate ${candidate} untouched`, (t) => {
    const { root } = fixture(t, candidate);
    assert.equal(recoverPartialRelease(root, { exists: () => assert.fail('lookup'), version: () => assert.fail('version') }), false);
  });
}

test('requires consistent family and recorded primary before registry lookups', (t) => {
  const { root, put } = fixture(t);
  assert.throws(() => recoverPartialRelease(root, { registry: 'https://registry.npmjs.org/' }), /recorded primary/);
  put('packages/speech/package.json', { name: '@happyvertical/speech', version: '0.100.3', publishConfig: {} });
  assert.throws(() => recoverPartialRelease(root, { exists: () => assert.fail('lookup') }), /Inconsistent/);
});

test('occupied or failed target lookup leaves workspace unchanged', (t) => {
  const { root, read } = fixture(t);
  for (const exists of [() => true, () => { throw new Error('offline'); }]) {
    assert.throws(() => recoverPartialRelease(root, { exists, version: () => assert.fail('version') }), /occupied|offline/);
    assert.throws(() => read('.changeset/partial-release-recovery.md'), /ENOENT/);
    assert.equal(JSON.parse(read('packages/utils/package.json')).version, recovery.occupied);
  }
});

test('registry lookup pins scope, accepts only exact version or structured E404, and redacts failures', () => {
  const run = (result) => (command, args, options) => {
    assert.equal(command, 'npm');
    assert.ok(args.includes('--@happyvertical:registry=https://npm.happyvertical.com/'));
    assert.equal(options.timeout, 30_000);
    return result;
  };
  const lookup = (result) => versionExists('@happyvertical/utils', recovery.target, recovery.registry, run(result));
  assert.equal(lookup({ status: 0, stdout: JSON.stringify(recovery.target) }), true);
  assert.equal(lookup({ status: 1, stdout: JSON.stringify({ error: { code: 'E404' } }) }), false);
  for (const result of [
    { status: 0, stdout: 'null' }, { status: 0, stdout: '"0.100.3"' },
    { status: 0, stdout: '{bad json' }, { status: 1, stdout: '{"error":{"code":"E401"}}', stderr: 'SECRET' },
    { status: null, stdout: '{"error":{"code":"E404"}}' },
    { error: new Error('SECRET') }, { status: 1, stdout: '', stderr: 'E404 SECRET' },
  ]) {
    assert.throws(() => lookup(result), (error) => /registry lookup/i.test(error.message) && !error.message.includes('SECRET'));
  }
});

test('real Changesets preserves feature notes and exact internal versions while skipping occupied candidate', (t) => {
  const { root, put, read } = fixture(t, '0.100.3');
  put('.changeset/pending-feature.md', '---\n"@happyvertical/speech": minor\n---\n\nPreserve response queue fix and pending feature.\n');
  const version = () => {
    const result = spawnSync(process.execPath, [resolve('node_modules/@changesets/cli/bin.js'), 'version'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  // Regression baseline: the unchanged normal preparation selects the occupied version.
  version();
  assert.equal(JSON.parse(read('packages/utils/package.json')).version, recovery.occupied);
  const lookups = [];
  assert.equal(recoverPartialRelease(root, { exists: (name, target, registry) => {
    lookups.push([name, target, registry]); return false;
  }, version }), true);
  assert.deepEqual(lookups.map(([name]) => name), ['@happyvertical/speech', '@happyvertical/utils']);
  assert.ok(lookups.every(([, target, registry]) => target === recovery.target && registry === recovery.registry));
  for (const name of ['utils', 'speech']) {
    assert.equal(JSON.parse(read(`packages/${name}/package.json`)).version, recovery.target);
  }
  assert.match(read('packages/utils/CHANGELOG.md'), /repository release never completed/);
  assert.match(read('packages/speech/CHANGELOG.md'), /repository release never completed/);
  assert.equal(JSON.parse(read('packages/speech/package.json')).dependencies['@happyvertical/utils'], recovery.target);
  assert.match(read('packages/speech/CHANGELOG.md'), /Preserve response queue fix and pending feature/);
  assert.equal(recoverPartialRelease(root, { exists: () => assert.fail('retry lookup'), version }), false);
});

test('versioning errors and unexpected targets fail closed', (t) => {
  const { root } = fixture(t);
  assert.throws(() => recoverPartialRelease(root, { exists: () => false, version: () => {} }), /did not produce/);
  assert.throws(() => recoverPartialRelease(root, { exists: () => false, version: () => assert.fail('overwrite') }), /EEXIST/);
});

test('workflow performs recovery after first Changesets pass and before exposing candidate', () => {
  const workflow = readFileSync('.github/workflows/publish.yml', 'utf8');
  assert.match(workflow, /pnpm run changeset:version\s+node scripts\/recover-partial-release\.mjs\s+after=/);
});

 test('Changesets failure stops recovery', (t) => {
  const { root } = fixture(t);
  assert.throws(() => recoverPartialRelease(root, { exists: () => false, version: () => { throw new Error('version command failed'); } }), /version command failed/);
});

 test('recovers occupied 0.101.2 through real Changesets without dropping merged fixes', (t) => {
  const { root, put, read } = fixture(t, '0.101.1');
  put('.changeset/merged-fixes.md', '---\n"@happyvertical/speech": patch\n---\n\nRetain Node OAuth and currency rounding fixes.\n');
  const version = () => {
    const result = spawnSync(process.execPath, [resolve('node_modules/@changesets/cli/bin.js'), 'version'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  version();
  assert.equal(JSON.parse(read('packages/utils/package.json')).version, '0.101.2');
  const lookups = [];
  assert.equal(recoverPartialRelease(root, { exists: (name, target, registry) => {
    lookups.push([name, target, registry]); return false;
  }, version }), true);
  assert.deepEqual(lookups, ['@happyvertical/speech', '@happyvertical/utils'].map((name) => [name, '0.101.3', recovery.registry]));
  for (const name of ['utils', 'speech']) {
    assert.equal(JSON.parse(read(`packages/${name}/package.json`)).version, '0.101.3');
    assert.match(read(`packages/${name}/CHANGELOG.md`), /37264164839/);
  }
  assert.equal(JSON.parse(read('packages/speech/package.json')).dependencies['@happyvertical/utils'], '0.101.3');
  assert.match(read('packages/speech/CHANGELOG.md'), /Retain Node OAuth and currency rounding fixes/);
  assert.equal(recoverPartialRelease(root, { exists: () => assert.fail('retry lookup'), version }), false);
});

test('0.101.2 reservation denies an occupied or unknown target before changing files', (t) => {
  const { root, read, put } = fixture(t, '0.101.2');
  for (const exists of [() => true, () => { throw new Error('offline'); }]) {
    assert.throws(() => recoverPartialRelease(root, { exists, version: () => assert.fail('version') }), /occupied|offline/);
    assert.throws(() => read('.changeset/partial-release-recovery.md'), /ENOENT/);
    assert.equal(JSON.parse(read('packages/utils/package.json')).version, '0.101.2');
  }
  assert.throws(() => recoverPartialRelease(root, { registry: 'https://registry.npmjs.org/' }), /recorded primary/);
  put('packages/speech/package.json', { name: '@happyvertical/speech', version: '0.101.1', publishConfig: {} });
  assert.throws(() => recoverPartialRelease(root, { exists: () => assert.fail('lookup') }), /Inconsistent/);
});

const release103Recovery = recoveries.find(({ occupied }) => occupied === '0.103.0');
assert.ok(release103Recovery, '0.103.0 recovery reservation must remain explicit');
assert.equal(release103Recovery.releaseNote, 'Preserve the DuckDB upsert conflict-key repair for referenced parent rows.');

test('recovers occupied 0.103.0 through real Changesets with the SQL fix retained', (t) => {
  const { root, put, read } = fixture(t, '0.102.7');
  for (const name of ['ai', 'sql']) {
    mkdirSync(join(root, 'packages', name));
    put(`packages/${name}/package.json`, {
      name: `@happyvertical/${name}`, version: '0.102.7', publishConfig: { access: 'public' },
    });
  }
  put('.changeset/laya-decision-provider.md', '---\n"@happyvertical/ai": minor\n---\n\nAdd the native Laya typed-decision provider.\n');
  const version = () => {
    const result = spawnSync(process.execPath, [resolve('node_modules/@changesets/cli/bin.js'), 'version'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  // Regression baseline: normal preparation alone reselects the immutable 0.103.0.
  version();
  assert.equal(JSON.parse(read('packages/utils/package.json')).version, '0.103.0');
  const lookups = [];
  assert.equal(recoverPartialRelease(root, { exists: (name, target, registry) => {
    lookups.push([name, target, registry]); return false;
  }, version }), true);
  assert.deepEqual(lookups, ['@happyvertical/ai', '@happyvertical/speech', '@happyvertical/sql', '@happyvertical/utils']
    .map((name) => [name, '0.103.1', release103Recovery.registry]));
  for (const name of ['ai', 'sql', 'utils', 'speech']) {
    assert.equal(JSON.parse(read(`packages/${name}/package.json`)).version, '0.103.1');
    assert.match(read(`packages/${name}/CHANGELOG.md`), /37977913268/);
  }
  assert.match(read('packages/ai/CHANGELOG.md'), /native Laya typed-decision provider/);
  assert.match(read('packages/sql/CHANGELOG.md'), /DuckDB upsert conflict-key repair for referenced parent rows/);
  assert.equal(JSON.parse(read('packages/speech/package.json')).dependencies['@happyvertical/utils'], '0.103.1');
  assert.equal(recoverPartialRelease(root, { exists: () => assert.fail('retry lookup'), version }), false);
});

test('0.103.0 reservation fails closed before mutation for occupied or unknown targets', (t) => {
  const { root, read } = fixture(t, '0.103.0');
  for (const exists of [() => true, () => { throw new Error('offline'); }]) {
    assert.throws(() => recoverPartialRelease(root, { exists, version: () => assert.fail('version') }), /occupied|offline/);
    assert.throws(() => read('.changeset/partial-release-recovery.md'), /ENOENT/);
    assert.equal(JSON.parse(read('packages/utils/package.json')).version, '0.103.0');
  }
});
