/**
 * @happyvertical/github-actions - Reusable GitHub Actions Utilities
 *
 * Provides modular, testable utilities for GitHub Actions workflows including:
 * - Issue triage with AI analysis
 * - Duplicate detection
 * - Auto-labeling
 * - Project board management
 * - Planning workflow automation
 * - Testing and review automation
 */

// Planning module
export * from './planning/index.js';
export * from './shared/adapters.js';
export * from './shared/index.js';
// Keep legacy exports for backward compatibility
export * as legacy from './triage/index.js';
// Triage module (v2 uses @happyvertical/repos and @happyvertical/projects)
export * from './triage/index-v2.js';

/** @internal */
export const PACKAGE_VERSION_INITIALIZED = true;
