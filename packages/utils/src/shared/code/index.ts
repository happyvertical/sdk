/**
 * Code utilities for extraction, validation, and safe execution
 *
 * Provides tools for working with generated code (e.g., from AI responses):
 * - Extract code blocks from markdown and text
 * - Validate code for security and syntax
 * - Execute code safely in isolated sandboxes
 *
 * @module code
 */

// Export extraction utilities
export {
  extractAllCodeBlocks,
  extractCodeBlock,
  extractFunctionDefinition,
  extractJSON,
} from './extraction';

// Export sandbox utilities
export {
  createSandbox,
  type ExecuteOptions,
  executeCode,
  executeCodeAsync,
  executeInSandbox,
  executeInSandboxAsync,
  type SandboxOptions,
} from './sandbox';

// Export validation utilities
export {
  isSafeCode,
  type ValidationOptions,
  type ValidationResult,
  validateCode,
} from './validation';
