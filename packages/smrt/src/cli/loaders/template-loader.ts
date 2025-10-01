/**
 * Template Loader - Resolves and loads templates from various sources
 *
 * Supports:
 * - npm packages (@org/pkg/templates/name)
 * - Git repositories (github:user/repo, https://github.com/user/repo.git)
 * - Local filesystem paths (../path/to/template, /absolute/path)
 */

export interface TemplateConfig {
  name: string;
  description: string;
  framework: string;
  baseGenerator?: {
    command: string;
    args: string[];
    skipPrompts?: boolean;
  };
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface TemplateSource {
  type: 'npm' | 'git' | 'local';
  location: string;
  resolved: string;
}

/**
 * Resolve a template name to a specific source
 *
 * @param name - Template name or path
 *   - @org/pkg/templates/name (npm package)
 *   - github:user/repo (git shorthand)
 *   - https://github.com/user/repo.git (git URL)
 *   - ../path/to/template (local path)
 *   - short-name (searches installed packages)
 *
 * @returns Template source information
 */
export async function resolveTemplate(name: string): Promise<TemplateSource> {
  // Check for npm package (contains @ or /)
  if (name.includes('@') || name.includes('/')) {
    return {
      type: 'npm',
      location: name,
      resolved: await resolveNpmPackage(name),
    };
  }

  // Check for git repository
  if (
    name.startsWith('github:') ||
    name.startsWith('gitlab:') ||
    name.startsWith('git@') ||
    name.endsWith('.git') ||
    name.startsWith('https://github.com') ||
    name.startsWith('https://gitlab.com')
  ) {
    return {
      type: 'git',
      location: name,
      resolved: name,
    };
  }

  // Check for local filesystem path
  if (name.startsWith('/') || name.startsWith('.') || name.startsWith('~')) {
    return {
      type: 'local',
      location: name,
      resolved: await resolveLocalPath(name),
    };
  }

  // Short name - search installed packages
  const npmPath = await findTemplateInPackages(name);
  if (npmPath) {
    return {
      type: 'npm',
      location: npmPath,
      resolved: await resolveNpmPackage(npmPath),
    };
  }

  throw new Error(
    `Template '${name}' not found. Tried:\n` +
      `  - npm package: @*/${name}, @*/templates/${name}\n` +
      `  - local path: ./${name}, ../${name}\n` +
      `\n` +
      `Use one of:\n` +
      `  - npm package: @org/pkg/templates/name\n` +
      `  - git repo: github:user/repo\n` +
      `  - local path: ../path/to/template`,
  );
}

/**
 * Load template configuration from resolved source
 */
export async function loadTemplate(
  source: TemplateSource,
): Promise<TemplateConfig> {
  switch (source.type) {
    case 'npm':
      return loadNpmTemplate(source.resolved);
    case 'git':
      return loadGitTemplate(source.resolved);
    case 'local':
      return loadLocalTemplate(source.resolved);
    default:
      throw new Error(`Unknown template type: ${source.type}`);
  }
}

import { loadGitTemplate } from './git-loader.js';
import { loadLocalTemplate, resolveLocalPath } from './local-loader.js';
// Import loaders (will be implemented in separate files)
import {
  findTemplateInPackages,
  loadNpmTemplate,
  resolveNpmPackage,
} from './npm-loader.js';
