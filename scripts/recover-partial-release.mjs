#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverExpectedPackages } from './publish-artifacts-lib.mjs';
import { OWN_REGISTRY, primaryRegistry, registryArgs } from './release-registry.mjs';

// Audited reservation, not a completed release or permission to overwrite it.
// See docs/release-recovery.md and SDK #1342. Changesets still owns versioning.
export const recovery = Object.freeze({
  occupied: '0.101.0',
  target: '0.101.1',
  registry: OWN_REGISTRY,
  evidence: 'https://github.com/happyvertical/sdk/actions/runs/37237977423',
});

// Keep earlier reservations explicit so historical recovery remains reproducible.
export const recoveries = Object.freeze([
  recovery,
  Object.freeze({
    occupied: '0.101.2',
    target: '0.101.3',
    registry: OWN_REGISTRY,
    evidence: 'https://github.com/happyvertical/sdk/actions/runs/37264164839',
  }),
  Object.freeze({
    occupied: '0.103.0',
    target: '0.103.1',
    registry: OWN_REGISTRY,
    evidence: 'https://github.com/happyvertical/sdk/actions/runs/37977913268',
  }),
]);

export function versionExists(name, version, registry, run = spawnSync) {
  const result = run('npm', ['view', `${name}@${version}`, 'version', '--json',
    ...registryArgs(registry), '--prefer-online'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000,
  });
  // Do not echo subprocess output: npm errors can contain credentials.
  if (result.error) throw new Error(`Registry lookup failed for ${name}`);
  let body;
  try { body = JSON.parse(result.stdout); } catch {
    throw new Error(`Invalid registry lookup response for ${name}`);
  }
  if (result.status === 0 && body === version) return true;
  if (result.status !== 0 && result.status !== null && body?.error?.code === 'E404') return false;
  throw new Error(`Registry lookup failed for ${name}`);
}

export function recoverPartialRelease(root = process.cwd(), {
  registry = primaryRegistry(), exists = versionExists,
  version = () => {
    const result = spawnSync('pnpm', ['run', 'changeset:version'], { cwd: root, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error('Recovery Changesets version failed');
  },
} = {}) {
  const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
  const candidate = read(join(root, 'packages/utils/package.json')).version;
  const reservation = recoveries.find((entry) => entry.occupied === candidate);
  if (!reservation) return false;
  if (registry !== reservation.registry) throw new Error('Partial release recovery requires its recorded primary registry');
  const manifests = readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, 'packages', entry.name, 'package.json'))
    .filter(existsSync);
  const names = discoverExpectedPackages(root);
  if (names.length === 0 || !names.includes('@happyvertical/utils')) throw new Error('Missing release family');
  const family = manifests.map(read).filter((pkg) => names.includes(pkg.name));
  if (family.some((pkg) => pkg.version !== candidate)) throw new Error('Inconsistent recovery family versions');
  for (const name of names) {
    if (exists(name, reservation.target, registry)) {
      throw new Error(`${name}@${reservation.target} is occupied; a newly reviewed recovery is required`);
    }
  }
  // A second ordinary Changesets patch pass preserves pending release notes and
  // updates fixed-family dependencies/lockfile with the same supported tooling.
  const note = `SDK ${reservation.occupied} was published to the registry but its repository release never completed. `
    + `Supersede that reserved version with a fresh fixed-family release, retaining all pending changes. `
    + `Recovery evidence: ${reservation.evidence}.`;
  writeFileSync(join(root, '.changeset/partial-release-recovery.md'),
    `---\n${names.map((name) => `${JSON.stringify(name)}: patch`).join("\n")}\n---\n\n${note}\n`, { flag: 'wx' });
  version();
  if (manifests.map(read).filter((pkg) => names.includes(pkg.name))
    .some((pkg) => pkg.version !== reservation.target)) {
    throw new Error('Changesets did not produce the recorded recovery target');
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  recoverPartialRelease();
}
