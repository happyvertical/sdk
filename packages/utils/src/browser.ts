/**
 * Browser-safe utilities
 *
 * This entry point only exports utilities that work in browser environments.
 * It excludes Node.js-specific code like:
 * - cli/parse-args (uses node:path, node:util)
 * - shared/code/sandbox (uses node:vm)
 * - web.ts hash functions (uses node:crypto)
 *
 * For Node.js environments, use the main entry point instead.
 */

// Export config utilities (browser-safe)
export * from './config/env-config';
// Export code utilities that don't require Node.js
export {
  extractAllCodeBlocks,
  extractCodeBlock,
  extractFunctionDefinition,
  extractJSON,
} from './shared/code/extraction';
export {
  isSafeCode,
  type ValidationOptions,
  type ValidationResult,
  validateCode,
} from './shared/code/validation';
// Export logger utilities (browser-safe)
export * from './shared/logger';
// Export types (browser-safe)
export * from './shared/types';
// Export all universal utilities (browser-safe)
export * from './shared/universal';

/** @internal */
export const PACKAGE_VERSION_INITIALIZED = true;
