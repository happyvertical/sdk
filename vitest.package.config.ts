import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type ConfigEnv,
  loadConfigFromFile,
  mergeConfig,
  type UserConfig,
} from 'vite';
import { defineConfig } from 'vitest/config';
import { sharedVitestConfig } from './vitest.shared';

async function loadOptionalConfig(
  env: ConfigEnv,
  path: string,
  packageRoot: string,
): Promise<UserConfig> {
  if (!existsSync(path)) {
    return {};
  }

  return (await loadConfigFromFile(env, path, packageRoot))?.config ?? {};
}

/**
 * Package-local Vitest entry point.
 *
 * Vitest otherwise discovers only the package's vite.config.ts and silently
 * falls back to its 5-second test timeout. Preserve that Vite config and any
 * package-specific vitest.config.ts, while applying the SDK defaults between
 * them so local test discovery can still override shared include/exclude rules.
 */
export default defineConfig(async (env) => {
  const packageRoot = process.cwd();
  const viteConfig = await loadOptionalConfig(
    env,
    resolve(packageRoot, 'vite.config.ts'),
    packageRoot,
  );
  const packageVitestConfig = await loadOptionalConfig(
    env,
    resolve(packageRoot, 'vitest.config.ts'),
    packageRoot,
  );

  return mergeConfig(
    mergeConfig(viteConfig, sharedVitestConfig),
    packageVitestConfig,
  );
});
