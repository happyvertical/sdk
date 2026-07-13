import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from 'vitest/node';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packagesRoot = join(repositoryRoot, 'packages');
const packageConfigArgument = '../../vitest.package.config.ts';

function readPackageJson(packageDirectory) {
  return JSON.parse(
    readFileSync(join(packagesRoot, packageDirectory, 'package.json'), 'utf8'),
  );
}

test('every package-local Vitest command loads the shared package config', () => {
  const violations = [];

  for (const packageDirectory of readdirSync(packagesRoot)) {
    if (!existsSync(join(packagesRoot, packageDirectory, 'package.json'))) {
      continue;
    }
    const packageJson = readPackageJson(packageDirectory);
    for (const [scriptName, command] of Object.entries(packageJson.scripts ?? {})) {
      if (!/(?:^|\s)(?:npx\s+)?vitest(?:\s|$)/.test(command)) {
        continue;
      }
      if (!command.includes(`--config ${packageConfigArgument}`)) {
        violations.push(`${packageJson.name}:${scriptName}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test('package-local config resolves shared timeouts and local overrides', async () => {
  const resolvedConfigs = new Map();

  for (const packageDirectory of ['sql', 'messages', 'weather']) {
    const packageRoot = join(packagesRoot, packageDirectory);
    const originalWorkingDirectory = process.cwd();
    process.chdir(packageRoot);
    const { viteConfig, vitestConfig } = await resolveConfig({
      config: packageConfigArgument,
    }).finally(() => process.chdir(originalWorkingDirectory));

    assert.equal(
      viteConfig.configFile,
      resolve(repositoryRoot, 'vitest.package.config.ts'),
    );
    assert.equal(vitestConfig.testTimeout, 30000);
    assert.equal(vitestConfig.hookTimeout, 30000);
    assert.equal(vitestConfig.fileParallelism, false);
    assert.equal(vitestConfig.maxWorkers, 1);
    assert.deepEqual(vitestConfig.setupFiles, [
      resolve(repositoryRoot, 'vitest.setup.ts'),
    ]);
    resolvedConfigs.set(packageDirectory, { viteConfig, vitestConfig });
  }

  const messages = resolvedConfigs.get('messages').vitestConfig;
  assert.equal(messages.passWithNoTests, true);
  assert.deepEqual(messages.include, ['test/**/*.{test,spec}.ts']);

  const weather = resolvedConfigs.get('weather');
  assert.equal(weather.vitestConfig.globals, true);
  assert.deepEqual(weather.vitestConfig.include, [
    'src/**/*.{test,spec}.ts',
  ]);
  assert.deepEqual(weather.vitestConfig.exclude, [
    'src/**/*.optional.test.ts',
  ]);
  assert.equal(weather.viteConfig.build.target, 'node18');
});
