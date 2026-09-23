#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { verifyPublishArtifacts } from './publish-artifacts-lib.mjs';
import { primaryRegistry, registryArgs } from './release-registry.mjs';

const registryVerificationAttempts = 12;
const registryVerificationDelayMs = 10_000;

function npm(args, { allowNotFound = false } = {}) {
  const result = spawnSync('npm', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (allowNotFound && /E404|404 Not Found/.test(result.stderr)) return null;
    throw new Error(result.stderr.trim() || `npm ${args.join(' ')} failed`);
  }
  return result.stdout.trim();
}

function exists(name, version, registry, runNpm) {
  return runNpm(['view', `${name}@${version}`, 'version', ...registryArgs(registry), '--prefer-online'], {
    allowNotFound: true,
  }) !== null;
}

function registryShasum(name, version, registry, runNpm) {
  return runNpm(['view', `${name}@${version}`, 'dist.shasum', ...registryArgs(registry), '--prefer-online'], {
    allowNotFound: true,
  });
}

function defaultArtifactShasum(artifact) {
  return createHash('sha1').update(readFileSync(artifact.path)).digest('hex');
}

function waitForRegistry(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function publishRelease(release, {
  registry = primaryRegistry(),
  runNpm = npm,
  log = console.log,
  wait = waitForRegistry,
  maxAttempts = registryVerificationAttempts,
  retryDelayMs = registryVerificationDelayMs,
  artifactShasum = defaultArtifactShasum,
} = {}) {
  const toPublish = [];
  for (const artifact of release.packages) {
    if (exists(artifact.name, artifact.version, registry, runNpm)) {
      const remote = registryShasum(artifact.name, artifact.version, registry, runNpm);
      const local = artifactShasum(artifact);
      if (remote && remote === local) {
        log(`Skipping existing ${artifact.name}@${artifact.version} (identical shasum ${local})`);
        continue;
      }
      throw new Error(
        `${artifact.name}@${artifact.version} is already on ${registry} with different content `
        + `(registry ${remote ?? 'unavailable'}, local ${local}). A previous run published this version `
        + 'from another head; add a changeset so the next release cuts a new version instead of republishing.',
      );
    }
    toPublish.push(artifact);
  }

  log(`Publishing ${toPublish.length} verified tarball(s) to ${registry}`);
  for (const artifact of toPublish) {
    runNpm(['publish', artifact.path, ...registryArgs(registry), '--access', 'public']);
  }

  let missing = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    missing = release.packages.filter((artifact) => !exists(artifact.name, artifact.version, registry, runNpm));
    if (missing.length === 0) return;
    if (attempt < maxAttempts) {
      log(
        `Waiting for ${registry} propagation (attempt ${attempt}/${maxAttempts}): `
        + missing.map((artifact) => `${artifact.name}@${artifact.version}`).join(', '),
      );
      wait(attempt * retryDelayMs);
    }
  }
  if (missing.length) throw new Error(`Registry verification on ${registry} failed for: ${missing.map((entry) => entry.name)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    publishRelease(verifyPublishArtifacts(process.argv[2]));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
