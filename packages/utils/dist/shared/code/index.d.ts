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
export { extractAllCodeBlocks, extractCodeBlock, extractFunctionDefinition, extractJSON, } from './extraction';
export { createSandbox, type ExecuteOptions, executeCode, executeCodeAsync, executeInSandbox, executeInSandboxAsync, type SandboxOptions, } from './sandbox';
export { isSafeCode, type ValidationOptions, type ValidationResult, validateCode, } from './validation';
//# sourceMappingURL=index.d.ts.map