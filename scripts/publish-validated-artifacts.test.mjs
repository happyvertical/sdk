import assert from 'node:assert/strict';
import test from 'node:test';
import { publishRelease } from './publish-validated-artifacts.mjs';

const release = () => ({ releaseVersion: '0.80.0', packages: [
  { name: '@happyvertical/a', version: '0.80.0', path: '/a.tgz' },
  { name: '@happyvertical/b', version: '0.80.0', path: '/b.tgz' },
] });

const localShasum = (artifact) => `local-sha-${artifact.name}`;

test('skips a partial publication, publishes the missing tarball, and verifies all', () => {
  const published = new Set(['@happyvertical/a@0.80.0']);
  let publishCalls = 0;
  const runNpm = (args) => {
    if (args[0] === 'view' && args[2] === 'version') return published.has(args[1]) ? '0.80.0' : null;
    if (args[0] === 'view' && args[2] === 'dist.shasum') {
      const name = args[1].slice(0, args[1].lastIndexOf('@'));
      return published.has(args[1]) ? `local-sha-${name}` : null;
    }
    publishCalls += 1;
    published.add('@happyvertical/b@0.80.0');
    return '';
  };
  publishRelease(release(), { runNpm, log: () => {}, artifactShasum: localShasum });
  publishRelease(release(), { runNpm, log: () => {}, artifactShasum: localShasum });
  assert.equal(publishCalls, 1);
});

test('propagates npm lookup failures without attempting publication', () => {
  let published = false;
  assert.throws(() => publishRelease(release(), { runNpm: (args) => {
    if (args[0] === 'view') throw new Error('registry unavailable');
    published = true;
  } }), /registry unavailable/);
  assert.equal(published, false);
});

test('fails final verification when a published version remains missing', () => {
  assert.throws(() => publishRelease({ releaseVersion: '0.80.0', packages: [release().packages[0]] }, {
    runNpm: (args) => (args[0] === 'publish' ? '' : null),
    log: () => {},
    maxAttempts: 1,
  }), /Registry verification on https:\/\/npm\.happyvertical\.com\/ failed/);
});

test('waits for eventual npm registry visibility after publishing', () => {
  let bVersionLookups = 0;
  const waits = [];
  publishRelease(release(), {
    runNpm: (args) => {
      if (args[0] === 'publish') return '';
      if (args[1] === '@happyvertical/a@0.80.0') {
        return args[2] === 'dist.shasum' ? 'local-sha-@happyvertical/a' : '0.80.0';
      }
      if (args[2] === 'dist.shasum') return null;
      bVersionLookups += 1;
      return bVersionLookups >= 3 ? '0.80.0' : null;
    },
    log: () => {},
    wait: (ms) => waits.push(ms),
    maxAttempts: 3,
    retryDelayMs: 25,
    artifactShasum: localShasum,
  });
  assert.deepEqual(waits, [25]);
});

test('skips republishing when the registry shasum matches the local artifact', () => {
  let publishCalls = 0;
  const runNpm = (args) => {
    if (args[0] === 'view' && args[2] === 'version') return '0.80.0';
    if (args[0] === 'view' && args[2] === 'dist.shasum') return 'local-sha-@happyvertical/a';
    publishCalls += 1;
    return '';
  };
  const log = [];
  publishRelease({ releaseVersion: '0.80.0', packages: [release().packages[0]] }, {
    runNpm,
    log: (message) => log.push(message),
    artifactShasum: localShasum,
  });
  assert.equal(publishCalls, 0);
  assert.ok(log.some((message) => /Skipping existing @happyvertical\/a@0.80.0 \(identical shasum/.test(message)));
});

test('fails the release when the registry version has different content', () => {
  let publishCalls = 0;
  const runNpm = (args) => {
    if (args[0] === 'view' && args[2] === 'version') return '0.80.0';
    if (args[0] === 'view' && args[2] === 'dist.shasum') return 'remote-sha-different';
    publishCalls += 1;
    return '';
  };
  assert.throws(
    () => publishRelease({ releaseVersion: '0.80.0', packages: [release().packages[0]] }, {
      runNpm,
      log: () => {},
      artifactShasum: localShasum,
    }),
    /@happyvertical\/a@0\.80\.0 is already on https:\/\/npm\.happyvertical\.com\/ with different content/,
  );
  assert.equal(publishCalls, 0);
});

test('publishes and verifies against the primary registry with the scope pinned', () => {
  const calls = [];
  const published = new Set();
  publishRelease({ releaseVersion: '0.80.0', packages: [release().packages[0]] }, {
    runNpm: (args) => {
      calls.push(args);
      if (args[0] === 'publish') { published.add('@happyvertical/a@0.80.0'); return ''; }
      if (args[2] === 'version') return published.has(args[1]) ? '0.80.0' : null;
      return null;
    },
    log: () => {},
    artifactShasum: localShasum,
  });
  for (const args of calls) {
    assert.ok(args.includes('https://npm.happyvertical.com/'), `missing --registry: ${args}`);
    assert.ok(args.includes('--@happyvertical:registry=https://npm.happyvertical.com/'), `missing scope pin: ${args}`);
    assert.ok(!args.some((arg) => arg.includes('registry.npmjs.org')), `leaked npmjs: ${args}`);
  }
  assert.equal(calls.filter((args) => args[0] === 'publish').length, 1);
});
