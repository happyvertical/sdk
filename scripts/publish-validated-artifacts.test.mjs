import assert from 'node:assert/strict';
import test from 'node:test';
import { publishRelease } from './publish-validated-artifacts.mjs';

const release = () => ({ releaseVersion: '0.80.0', packages: [
  { name: '@happyvertical/a', version: '0.80.0', path: '/a.tgz' },
  { name: '@happyvertical/b', version: '0.80.0', path: '/b.tgz' },
] });

test('skips a partial publication, publishes the missing tarball, and verifies all', () => {
  const published = new Set(['@happyvertical/a@0.80.0']);
  let publishCalls = 0;
  const runNpm = (args) => {
    if (args[0] === 'view') return published.has(args[1]) ? '0.80.0' : null;
    publishCalls += 1;
    published.add('@happyvertical/b@0.80.0');
    return '';
  };
  publishRelease(release(), { runNpm, log: () => {} });
  publishRelease(release(), { runNpm, log: () => {} });
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
  }), /Registry verification failed/);
});
