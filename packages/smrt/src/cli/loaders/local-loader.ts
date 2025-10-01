/**
 * Local Filesystem Template Loader
 *
 * Loads templates from local directories.
 * Useful for development and testing.
 */

import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TemplateConfig } from './template-loader.js';

/**
 * Resolve local path to absolute path
 *
 * Handles:
 * - Relative paths (./path, ../path)
 * - Absolute paths (/path)
 * - Home directory (~/)
 */
export async function resolveLocalPath(localPath: string): Promise<string> {
  let absolutePath: string;

  // Expand home directory
  if (localPath.startsWith('~/')) {
    absolutePath = join(homedir(), localPath.slice(2));
  } else if (localPath.startsWith('~')) {
    absolutePath = join(homedir(), localPath.slice(1));
  } else if (localPath.startsWith('/')) {
    // Already absolute
    absolutePath = localPath;
  } else {
    // Relative to current working directory
    absolutePath = resolve(process.cwd(), localPath);
  }

  // Verify directory exists
  try {
    await access(absolutePath);
  } catch {
    throw new Error(`Local template path does not exist: ${absolutePath}`);
  }

  return absolutePath;
}

/**
 * Load template configuration from local directory
 */
export async function loadLocalTemplate(
  resolvedPath: string,
): Promise<TemplateConfig> {
  // Look for template.config.{js,ts}
  let configPath: string | null = null;

  for (const ext of ['js', 'ts']) {
    const testPath = join(resolvedPath, `template.config.${ext}`);
    try {
      await access(testPath);
      configPath = testPath;
      break;
    } catch {
      // Try next extension
    }
  }

  if (!configPath) {
    throw new Error(
      `No template.config.js or template.config.ts found in ${resolvedPath}`,
    );
  }

  // Load the configuration
  try {
    const configUrl = pathToFileURL(configPath).href;
    const module = await import(configUrl);
    const config = module.default || module;

    // Validate required fields
    validateTemplateConfig(config, configPath);

    return config;
  } catch (error) {
    throw new Error(
      `Failed to load template config from ${configPath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Validate template configuration has required fields
 */
function validateTemplateConfig(config: any, source: string): void {
  const required = ['name', 'description', 'dependencies'];

  for (const field of required) {
    if (!config[field]) {
      throw new Error(
        `Invalid template config at ${source}: missing required field '${field}'`,
      );
    }
  }

  if (typeof config.dependencies !== 'object') {
    throw new Error(
      `Invalid template config at ${source}: 'dependencies' must be an object`,
    );
  }

  if (config.devDependencies && typeof config.devDependencies !== 'object') {
    throw new Error(
      `Invalid template config at ${source}: 'devDependencies' must be an object`,
    );
  }
}
