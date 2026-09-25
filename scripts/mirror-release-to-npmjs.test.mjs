import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { mirrorRelease, reportMirror } from './mirror-release-to-npmjs.mjs';

const PRIMARY = 'https://npm.happyvertical.com/';
const NPMJS = 'https://registry.npmjs.org/';
const bytes = Buffer.from('tarball-bytes');
const sha1 = createHash('sha1').update(bytes).digest('hex');

// A fake pair of registries driven through the npm CLI argument shape.
function registries({ primary, npmjs, publishError, publishVisible = true }) {
  const state = { [PRIMARY]: primary, [NPMJS]: npmjs };
  const published = [];
  const runNpm = (args, { allowNotFound } = {}) => {
    const registry = args[args.indexOf('--registry') + 1];
    assert.ok(args.includes(`--@happyvertical:registry=${registry}`), `scope not pinned: ${args}`);
    if (args[0] === 'view' && args[2] === 'versions') {
      const versions = state[registry][args[1]];
      if (!versions) { assert.ok(allowNotFound); return null; }
      return JSON.stringify(versions);
    }
    if (args[0] === 'view' && args[2] === 'dist') {
      const [, name, version] = /^(.+)@(.+)$/.exec(args[1]);
      return JSON.stringify({ tarball: `${PRIMARY}${name}/-/${version}.tgz`, shasum: sha1 });
    }
    if (args[0] === 'view' && args[2] === 'dist.shasum') return sha1;
    if (args[0] === 'publish') {
      assert.equal(registry, NPMJS);
      if (publishError) throw new Error(publishError);
      const [, name, version] = /^.*\/(_happyvertical_.+)-(\d+\.\d+\.\d+)\.tgz$/.exec(args[1]);
      const pkg = name.replace('_happyvertical_', '@happyvertical/');
      published.push(`${pkg}@${version}`);
      if (publishVisible) state[NPMJS][pkg] = [...(state[NPMJS][pkg] ?? []), version];
      return '';
    }
    throw new Error(`unexpected npm ${args.join(' ')}`);
  };
  return { runNpm, published };
}

const fetchImpl = async () => ({ status: 200, ok: true, arrayBuffer: async () => bytes });
const base = { primary: PRIMARY, mirror: NPMJS, fetchImpl, log: () => {}, wait: async () => {}, verifyDelayMs: 0, canPublish: true };

test('mirrors versions newer than npmjs in order and reports complete', async () => {
  const { runNpm, published } = registries({
    primary: { '@happyvertical/a': ['0.89.12', '0.90.0', '0.90.1'], '@happyvertical/b': ['0.89.12'] },
    npmjs: { '@happyvertical/a': ['0.89.12'], '@happyvertical/b': ['0.89.12'] },
  });
  const result = await mirrorRelease({ ...base, packages: ['@happyvertical/a', '@happyvertical/b'], runNpm });
  assert.deepEqual(published, ['@happyvertical/a@0.90.0', '@happyvertical/a@0.90.1']);
  assert.equal(result.status, 'complete');
});

test('reports not-mirrored when npmjs refuses the publish (the suspended-account case)', async () => {
  const { runNpm } = registries({
    primary: { '@happyvertical/a': ['0.89.12', '0.90.0'] },
    npmjs: { '@happyvertical/a': ['0.89.12'] },
    publishError: 'npm error 404 Not Found - PUT https://registry.npmjs.org/@happyvertical%2fa',
  });
  const result = await mirrorRelease({ ...base, packages: ['@happyvertical/a'], runNpm });
  assert.equal(result.status, 'not-mirrored');
  assert.match(result.notMirrored[0], /@happyvertical\/a@0\.90\.0: npm error 404/);
});

test('reports the npm error line, not the leading npm notice lines (#1272)', async () => {
  const { runNpm } = registries({
    primary: { '@happyvertical/a': ['0.89.12', '0.90.0'] },
    npmjs: { '@happyvertical/a': ['0.89.12'] },
    publishError: [
      'npm notice',
      'npm notice 📦  @happyvertical/a@0.90.0',
      'npm notice Tarball Contents',
      'npm warn publish npm auto-corrected some errors in your package.json',
      'npm error code E404',
      'npm error 404 Not Found - PUT https://registry.npmjs.org/@happyvertical%2fa - Not found',
    ].join('\n'),
  });
  const result = await mirrorRelease({ ...base, packages: ['@happyvertical/a'], runNpm });
  assert.equal(result.status, 'not-mirrored');
  assert.equal(result.notMirrored[0], '@happyvertical/a@0.90.0: npm error code E404');
});

test('falls back to the first non-notice line when npm prints no error line (#1272)', async () => {
  const { runNpm } = registries({
    primary: { '@happyvertical/a': ['0.89.12', '0.90.0'] },
    npmjs: { '@happyvertical/a': ['0.89.12'] },
    publishError: 'npm notice\nnpm notice Tarball Details\nsocket hang up',
  });
  const result = await mirrorRelease({ ...base, packages: ['@happyvertical/a'], runNpm });
  assert.equal(result.notMirrored[0], '@happyvertical/a@0.90.0: socket hang up');
});

test('a permanent refusal after npm notice lines is still recognized (#1272)', async () => {
  const older = registries({
    primary: { '@happyvertical/a': ['0.89.12', '0.90.0', '0.90.1'] },
    npmjs: { '@happyvertical/a': ['0.89.12'] },
  });
  const run = (args, options) => {
    if (args[0] === 'publish' && args[1].endsWith('-0.90.0.tgz')) {
      throw new Error('npm notice Tarball Details\nnpm error code E403\nnpm error 403 You cannot publish over the previously published versions: 0.90.0.');
    }
    return older.runNpm(args, options);
  };
  const result = await mirrorRelease({ ...base, packages: ['@happyvertical/a'], runNpm: run });
  assert.equal(result.status, 'complete');
  assert.equal(result.skipped.length, 1);
});

test('does not trust a successful publish call: end state decides (smrt#3086)', async () => {
  const { runNpm, published } = registries({
    primary: { '@happyvertical/a': ['0.89.12', '0.90.0'] },
    npmjs: { '@happyvertical/a': ['0.89.12'] },
    publishVisible: false,
  });
  const result = await mirrorRelease({ ...base, packages: ['@happyvertical/a'], runNpm, verifyAttempts: 2 });
  assert.deepEqual(published, ['@happyvertical/a@0.90.0']);
  assert.equal(result.status, 'not-mirrored');
  assert.deepEqual(result.notMirrored, ['@happyvertical/a@0.90.0: not on npmjs']);
});

test('reports not-mirrored without publishing when NPM_TOKEN is unavailable', async () => {
  const { runNpm, published } = registries({
    primary: { '@happyvertical/a': ['0.90.0'] },
    npmjs: {},
  });
  const result = await mirrorRelease({ ...base, canPublish: false, packages: ['@happyvertical/a'], runNpm });
  assert.deepEqual(published, []);
  assert.equal(result.status, 'not-mirrored');
  assert.match(result.notMirrored[0], /NPM_TOKEN is unavailable/);
});

test('an unreadable npmjs is not an empty one', async () => {
  const runNpm = (args) => {
    if (args.includes(NPMJS)) throw new Error('ETIMEDOUT');
    return JSON.stringify(['0.90.0']);
  };
  const result = await mirrorRelease({ ...base, packages: ['@happyvertical/a'], runNpm });
  assert.equal(result.status, 'not-mirrored');
  assert.match(result.notMirrored[0], /could not read versions \(ETIMEDOUT\)/);
});

test('never publishes older gaps and still completes', async () => {
  const { runNpm, published } = registries({
    primary: { '@happyvertical/a': ['0.88.0', '0.89.0', '0.89.12'] },
    npmjs: { '@happyvertical/a': ['0.89.0', '0.89.12'] },
  });
  const result = await mirrorRelease({ ...base, packages: ['@happyvertical/a'], runNpm });
  assert.deepEqual(published, []);
  assert.equal(result.status, 'complete');
});

test('a permanently refused older version is skipped, but a refused newest is NOT MIRRORED', async () => {
  const refusal = 'You cannot publish over the previously published versions: 0.90.0.';
  const older = registries({
    primary: { '@happyvertical/a': ['0.89.12', '0.90.0', '0.90.1'] },
    npmjs: { '@happyvertical/a': ['0.89.12'] },
  });
  const olderRun = (args, options) => {
    if (args[0] === 'publish' && args[1].endsWith('-0.90.0.tgz')) throw new Error(refusal);
    return older.runNpm(args, options);
  };
  const skipped = await mirrorRelease({ ...base, packages: ['@happyvertical/a'], runNpm: olderRun });
  assert.deepEqual(older.published, ['@happyvertical/a@0.90.1']);
  assert.equal(skipped.status, 'complete');
  assert.equal(skipped.skipped.length, 1);

  const newest = registries({
    primary: { '@happyvertical/a': ['0.89.12', '0.90.0'] },
    npmjs: { '@happyvertical/a': ['0.89.12'] },
    publishError: refusal,
  });
  const result = await mirrorRelease({ ...base, packages: ['@happyvertical/a'], runNpm: newest.runNpm });
  assert.equal(result.status, 'not-mirrored');
  assert.match(result.notMirrored[0], /permanently refuses.*only a new version can fix npmjs/);
});

test('refuses a tarball the primary serves from another origin', async () => {
  const { runNpm } = registries({
    primary: { '@happyvertical/a': ['0.90.0'] },
    npmjs: {},
  });
  const hostile = (args, options) => (args[0] === 'view' && args[2] === 'dist'
    ? JSON.stringify({ tarball: 'https://evil.example/a.tgz', shasum: sha1 })
    : runNpm(args, options));
  const result = await mirrorRelease({ ...base, packages: ['@happyvertical/a'], runNpm: hostile });
  assert.equal(result.status, 'not-mirrored');
  assert.match(result.notMirrored[0], /outside itself/);
});

test('report writes status output, an error annotation, and a NOT MIRRORED summary', () => {
  const writes = [];
  const lines = [];
  reportMirror(
    { status: 'not-mirrored', mirrored: [], skipped: [], notMirrored: ['@happyvertical/a@0.90.0: npm error 404'] },
    { env: { GITHUB_OUTPUT: 'out', GITHUB_STEP_SUMMARY: 'sum' }, append: (file, text) => writes.push([file, text]), log: (line) => lines.push(line) },
  );
  assert.ok(lines.some((line) => line.startsWith('::error')));
  assert.ok(writes.some(([file, text]) => file === 'sum' && text.includes('NOT MIRRORED')));
  assert.deepEqual(writes.find(([file]) => file === 'out'), ['out', 'status=not-mirrored\n']);
});
