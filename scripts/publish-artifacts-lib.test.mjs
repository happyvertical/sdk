import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifyPublishArtifacts } from './publish-artifacts-lib.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sdk-publish-artifacts-'));
  const artifacts = join(root, 'artifacts');
  mkdirSync(join(root, 'packages', 'fixture'), { recursive: true });
  mkdirSync(artifacts);
  writeFileSync(
    join(root, 'packages', 'fixture', 'package.json'),
    JSON.stringify({ name: '@example/fixture', version: '0.1.0', publishConfig: { access: 'public' } }),
  );
  const filename = 'example-fixture-0.1.0.tgz';
  const tarball = Buffer.from('fixture tarball');
  writeFileSync(join(artifacts, filename), tarball);
  writeFileSync(join(artifacts, 'manifest-1-of-1.json'), JSON.stringify({
    schemaVersion: 1,
    releaseVersion: '0.1.0',
    packages: [{
      name: '@example/fixture', version: '0.1.0', filename,
      sha256: createHash('sha256').update(tarball).digest('hex'),
    }],
  }));
  return { root, artifacts, filename };
}

function updateManifest(artifacts, update) {
  const path = join(artifacts, 'manifest-1-of-1.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  update(manifest);
  writeFileSync(path, JSON.stringify(manifest));
}

test('verifies complete unique membership, version, filename, and hash', () => {
  const fixtureData = fixture();
  try {
    const result = verifyPublishArtifacts(fixtureData.artifacts, fixtureData.root);
    assert.equal(result.releaseVersion, '0.1.0');
    assert.equal(result.packages[0].name, '@example/fixture');
  } finally {
    rmSync(fixtureData.root, { recursive: true, force: true });
  }
});

test('rejects a tarball changed after validation', () => {
  const fixtureData = fixture();
  try {
    writeFileSync(join(fixtureData.artifacts, fixtureData.filename), 'tampered');
    assert.throws(
      () => verifyPublishArtifacts(fixtureData.artifacts, fixtureData.root),
      /SHA-256 mismatch/,
    );
  } finally {
    rmSync(fixtureData.root, { recursive: true, force: true });
  }
});

test('rejects missing and duplicate package membership', () => {
  const missing = fixture();
  try {
    updateManifest(missing.artifacts, (manifest) => {
      manifest.packages = [];
    });
    assert.throws(
      () => verifyPublishArtifacts(missing.artifacts, missing.root),
      /membership mismatch/,
    );
  } finally {
    rmSync(missing.root, { recursive: true, force: true });
  }

  const duplicate = fixture();
  try {
    updateManifest(duplicate.artifacts, (manifest) => {
      manifest.packages.push({ ...manifest.packages[0] });
    });
    assert.throws(
      () => verifyPublishArtifacts(duplicate.artifacts, duplicate.root),
      /duplicate package names/,
    );
  } finally {
    rmSync(duplicate.root, { recursive: true, force: true });
  }
});

test('rejects mixed versions and unexpected filenames', () => {
  const mixed = fixture();
  try {
    writeFileSync(
      join(mixed.artifacts, 'manifest-2-of-2.json'),
      JSON.stringify({ schemaVersion: 1, releaseVersion: '0.2.0', packages: [] }),
    );
    assert.throws(
      () => verifyPublishArtifacts(mixed.artifacts, mixed.root),
      /multiple release versions/,
    );
  } finally {
    rmSync(mixed.root, { recursive: true, force: true });
  }

  const filename = fixture();
  try {
    updateManifest(filename.artifacts, (manifest) => {
      manifest.packages[0].filename = 'surprise.tgz';
    });
    assert.throws(
      () => verifyPublishArtifacts(filename.artifacts, filename.root),
      /Unexpected filename/,
    );
  } finally {
    rmSync(filename.root, { recursive: true, force: true });
  }
});
