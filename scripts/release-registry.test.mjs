import assert from 'node:assert/strict';
import test from 'node:test';
import { NPMJS_REGISTRY, OWN_REGISTRY, normalizeRegistry, primaryRegistry, registryArgs } from './release-registry.mjs';

test('defaults the primary to our own registry', () => {
  assert.equal(primaryRegistry({}), OWN_REGISTRY);
  assert.equal(primaryRegistry({ RELEASE_PRIMARY_REGISTRY: 'https://npm.happyvertical.com' }), OWN_REGISTRY);
  assert.equal(primaryRegistry({ RELEASE_PRIMARY_REGISTRY: NPMJS_REGISTRY }), NPMJS_REGISTRY);
  assert.equal(primaryRegistry({ RELEASE_PRIMARY_REGISTRY: 'http://localhost:4873' }), 'http://localhost:4873/');
});

test('refuses hosts outside the reviewed allowlist', () => {
  assert.throws(() => primaryRegistry({ RELEASE_PRIMARY_REGISTRY: 'https://evil.example.com/' }), /not an allowed release registry/);
  assert.throws(() => primaryRegistry({ RELEASE_PRIMARY_REGISTRY: 'https://npm.happyvertical.com.evil.example/' }), /not an allowed/);
});

test('rejects plain http, credentials, and queries without echoing secrets', () => {
  assert.throws(() => normalizeRegistry('http://npm.happyvertical.com/'), /must be https/);
  assert.throws(() => normalizeRegistry('https://u:secret@npm.happyvertical.com/'), (error) => !error.message.includes('secret'));
  assert.throws(() => normalizeRegistry('https://npm.happyvertical.com/?t=1'), /must not carry/);
  assert.throws(() => normalizeRegistry('not a url secret'), (error) => !error.message.includes('secret'));
});

test('pins the scope alongside --registry', () => {
  assert.deepEqual(registryArgs('https://npm.happyvertical.com'), [
    '--registry', OWN_REGISTRY, `--@happyvertical:registry=${OWN_REGISTRY}`,
  ]);
});
