import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function discoverExpectedPackages(repoRoot) {
  const packagesDir = join(repoRoot, 'packages');
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const path = join(packagesDir, entry.name, 'package.json');
      if (!existsSync(path)) return [];
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      return manifest.private === true || !manifest.publishConfig ? [] : [manifest.name];
    })
    .sort();
}

function findFiles(root, predicate) {
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...findFiles(path, predicate));
    else if (predicate(entry.name)) found.push(path);
  }
  return found;
}

export function verifyPublishArtifacts(artifactDir, repoRoot = process.cwd()) {
  const root = resolve(artifactDir);
  const manifests = findFiles(root, (name) => /^manifest-\d+-of-\d+\.json$/.test(name));
  if (manifests.length === 0) throw new Error(`No publish manifests found under ${root}`);

  const packages = [];
  const versions = new Set();
  for (const path of manifests) {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.packages)) {
      throw new Error(`Invalid publish manifest: ${path}`);
    }
    versions.add(manifest.releaseVersion);
    for (const artifact of manifest.packages) {
      if (artifact.version !== manifest.releaseVersion) {
        throw new Error(`${artifact.name} version does not match its release manifest`);
      }
      const expectedFilename = `${artifact.name.replace(/^@/, '').replace('/', '-')}-${artifact.version}.tgz`;
      if (artifact.filename !== expectedFilename) {
        throw new Error(`Unexpected filename for ${artifact.name}: ${artifact.filename}`);
      }
      packages.push(artifact);
    }
  }
  if (versions.size !== 1) throw new Error('Publish manifests contain multiple release versions');

  const names = packages.map((artifact) => artifact.name);
  if (new Set(names).size !== names.length) {
    throw new Error('Publish manifests contain duplicate package names');
  }
  const expected = discoverExpectedPackages(repoRoot);
  const actual = [...names].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const missing = expected.filter((name) => !actual.includes(name));
    const extra = actual.filter((name) => !expected.includes(name));
    throw new Error(`Publish artifact membership mismatch; missing=[${missing}] extra=[${extra}]`);
  }

  for (const artifact of packages) {
    const matches = findFiles(root, (name) => name === artifact.filename);
    if (matches.length !== 1) {
      throw new Error(`Expected one ${artifact.filename} tarball, found ${matches.length}`);
    }
    const sha256 = createHash('sha256').update(readFileSync(matches[0])).digest('hex');
    if (sha256 !== artifact.sha256) throw new Error(`SHA-256 mismatch for ${artifact.name}`);
    artifact.path = matches[0];
  }
  return {
    releaseVersion: [...versions][0],
    packages: packages.sort((a, b) => a.name.localeCompare(b.name)),
  };
}
