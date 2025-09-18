/**
 * @have/smrt - Core AI agent framework with standardized collections and code generators
 *
 * This package provides the foundational framework for building vertical AI agents.
 * It provides core abstractions and integrates with other HAVE SDK packages
 * (ai, files, sql) to provide a unified interface.
 *
 * Key components:
 * - BaseClass: Foundation class providing access to database, filesystem, and AI
 * - BaseObject: Persistent object with unique identifiers and database storage
 * - BaseCollection: Collection interface for managing sets of BaseObjects
 *
 * Generators:
 * - CLIGenerator: Create admin CLI tools from SMRT objects
 * - APIGenerator: Generate REST APIs for SMRT objects
 * - MCPGenerator: Create MCP servers for AI model integration
 */

// Core SMRT framework
export * from './class.js';
export * from './object.js';
export * from './collection.js';
export * from './pleb.js';
export * from './fields/index.js';
export * from './registry.js';
export { smrt } from './registry.js';
export * from './errors.js';

// Code generators (tree-shakeable)
export * from './generators/index.js';

// AST scanning and manifest generation
export * from './scanner/index.js';

// Vite plugin for auto-service generation
export { smrtPlugin } from './vite-plugin/index.js';

// Runtime utilities
export * from './runtime/index.js';
