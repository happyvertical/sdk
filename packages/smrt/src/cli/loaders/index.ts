/**
 * Template Loaders - Export all template loading functionality
 */

export {
  type TemplateConfig,
  type TemplateSource,
  resolveTemplate,
  loadTemplate,
} from './template-loader.js';

export {
  resolveNpmPackage,
  loadNpmTemplate,
  findTemplateInPackages,
  discoverInstalledTemplates,
} from './npm-loader.js';

export {
  resolveLocalPath,
  loadLocalTemplate,
} from './local-loader.js';

export {
  loadGitTemplate,
  getGitTemplateDir,
  cleanupGitTemplate,
} from './git-loader.js';
