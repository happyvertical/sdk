import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
import { packPackage } from './validate-publish-packages.mjs';

test('pnpm pack rewrites workspace and catalog dependency specs', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdk-pnpm-pack-'));
  const dependencyDir = join(root, 'packages', 'dependency');
  const secondDependencyDir = join(root, 'packages', 'second-dependency');
  const targetDir = join(root, 'packages', 'target');
  const outputDir = join(root, 'artifacts');
  mkdirSync(dependencyDir, { recursive: true });
  mkdirSync(secondDependencyDir, { recursive: true });
  mkdirSync(targetDir, { recursive: true });
  mkdirSync(outputDir);

  try {
    writeFileSync(join(root, 'pnpm-workspace.yaml'), [
      'packages:',
      "  - 'packages/*'",
      'linkWorkspacePackages: true',
      'catalog:',
      "  '@example/dependency': '1.2.3'",
      '',
    ].join('\n'));
    writeFileSync(join(dependencyDir, 'package.json'), JSON.stringify({
      name: '@example/dependency',
      version: '1.2.3',
    }));
    writeFileSync(join(secondDependencyDir, 'package.json'), JSON.stringify({
      name: '@example/second-dependency',
      version: '3.2.1',
    }));
    writeFileSync(join(targetDir, 'package.json'), JSON.stringify({
      name: '@example/target',
      version: '2.0.0',
      main: 'index.js',
      dependencies: {
        '@example/dependency': 'catalog:',
        '@example/second-dependency': 'workspace:*',
      },
    }));
    writeFileSync(join(targetDir, 'index.js'), 'export default true;\n');
    const install = spawnSync('pnpm', ['install', '--ignore-scripts'], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(install.status, 0, install.stderr || install.stdout);

    const { tarball } = packPackage(targetDir, outputDir);
    const extracted = spawnSync('tar', ['-xOf', tarball, 'package/package.json'], {
      encoding: 'utf8',
    });
    assert.equal(extracted.status, 0, extracted.stderr);
    const manifest = JSON.parse(extracted.stdout);
    assert.deepEqual(manifest.dependencies, {
      '@example/dependency': '1.2.3',
      '@example/second-dependency': '3.2.1',
    });
    assert.doesNotMatch(extracted.stdout, /(?:workspace|catalog):/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
