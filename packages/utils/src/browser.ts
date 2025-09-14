/**
 * Browser entry point for @have/utils
 * Exports universal utilities that work in browser environments
 */

export * from './shared/types.js';
export * from './shared/universal.js';
export * from './shared/logger.js';

// Browser-specific utilities
export * from './browser/path.js';