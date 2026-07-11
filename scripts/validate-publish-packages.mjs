#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverExpectedPackages } from './publish-artifacts-lib.mjs';
import { verifyPackageTarball } from './verify-package-tarball.mjs';

function positive(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? fallback, 10);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be positive`);
  return value;
}

export function packPackage(packageDir, outputDir, run = spawnSync) {
  const result = run('pnpm', ['pack', '--json', '--pack-destination', outputDir], {
    cwd: packageDir,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `pnpm pack failed in ${packageDir}`);
  }
  const packed = JSON.parse(result.stdout);
  if (!packed || Array.isArray(packed) || typeof packed.filename !== 'string') {
    throw new Error(`Expected exactly one tarball from pnpm pack in ${packageDir}`);
  }
  const filename = basename(packed.filename);
  const tarball = join(outputDir, filename);
  verifyPackageTarball(packageDir, tarball);
  return { filename, tarball };
}

export function main() {
  const root = process.cwd();
  const shardCount = positive('PUBLISH_PACK_SHARD_COUNT', '1');
  const shardIndex = positive('PUBLISH_PACK_SHARD_INDEX', '1');
  if (shardIndex > shardCount) throw new Error('PUBLISH_PACK_SHARD_INDEX exceeds shard count');
  const outputDir = resolve(process.env.PUBLISH_PACK_OUTPUT_DIR ?? '.artifacts/publish-pack');
  mkdirSync(outputDir, { recursive: true });

  const expected = new Set(discoverExpectedPackages(root));
  const packages = readdirSync(join(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const dir = join(root, 'packages', entry.name);
      const path = join(dir, 'package.json');
      if (!existsSync(path)) return [];
      const manifest = JSON.parse(readFileSync(path, 'utf8'));
      return expected.has(manifest.name) ? [{ dir, manifest }] : [];
    })
    .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
    .filter((_entry, index) => index % shardCount === shardIndex - 1);

  const artifacts = [];
  for (const pkg of packages) {
    const { filename, tarball } = packPackage(pkg.dir, outputDir);
    artifacts.push({
      name: pkg.manifest.name,
      version: pkg.manifest.version,
      filename,
      sha256: createHash('sha256').update(readFileSync(tarball)).digest('hex'),
    });
  }

  const versions = new Set(artifacts.map((artifact) => artifact.version));
  if (versions.size > 1) throw new Error(`Pack shard contains mixed versions: ${[...versions]}`);
  writeFileSync(
    join(outputDir, `manifest-${shardIndex}-of-${shardCount}.json`),
    `${JSON.stringify({
      schemaVersion: 1,
      releaseVersion: artifacts[0]?.version ?? null,
      packages: artifacts,
    }, null, 2)}\n`,
  );
  console.log(`Validated ${artifacts.length} package tarballs in shard ${shardIndex}/${shardCount}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
