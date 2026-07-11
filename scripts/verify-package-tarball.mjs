#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function collectPaths(value, paths = []) {
  if (typeof value === 'string' && !value.includes('*')) paths.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectPaths(item, paths));
  else if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectPaths(item, paths));
  }
  return paths;
}

export function verifyPackageTarball(packageDir, tarballPath) {
  const manifest = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
  const result = spawnSync('tar', ['-tzf', resolve(tarballPath)], { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'Unable to inspect tarball');
  const members = new Set(result.stdout.trim().split('\n'));
  const declared = collectPaths({
    main: manifest.main,
    module: manifest.module,
    types: manifest.types,
    typings: manifest.typings,
    bin: manifest.bin,
    exports: manifest.exports,
  });
  for (const path of declared) {
    const member = `package/${path.replace(/^\.\//, '')}`;
    if (!members.has(member)) throw new Error(`${manifest.name}: ${member} missing from tarball`);
  }
  if (!members.has('package/package.json')) {
    throw new Error(`${manifest.name}: package/package.json missing from tarball`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('verify-package-tarball.mjs')) {
  try {
    verifyPackageTarball(process.argv[2], process.argv[3]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
