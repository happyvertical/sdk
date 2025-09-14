/**
 * @have/smrt - Core library for building AI agents with code generators
 * 
 * This package provides standardized collections and objects for building 
 * vertical AI agents. It brings together multiple HAVE SDK packages 
 * (ai, files, pdf, spider, sql) to provide a unified interface.
 * 
 * Key components:
 * - BaseClass: Foundation class providing access to database, filesystem, and AI
 * - BaseObject: Persistent object with unique identifiers and database storage
 * - BaseCollection: Collection interface for managing sets of BaseObjects
 * - Content: Structured content object with metadata and body text
 * - Document: Handler for document files with text extraction capabilities
 * 
 * Generators:
 * - CLIGenerator: Create admin CLI tools from SMRT objects
 * - APIGenerator: Generate REST APIs for SMRT objects
 * - MCPGenerator: Create MCP servers for AI model integration
 */

// Core SMRT framework
export * from './document.js';
export * from './content.js';
export * from './contents.js';
export * from './class.js';
export * from './object.js';
export * from './collection.js';
export * from './pleb.js';
export * from './fields/index.js';
export * from './registry.js';

// Code generators (tree-shakeable)
export * from './generators/index.js';

// AST scanning and manifest generation
export * from './scanner/index.js';

// Vite plugin for auto-service generation
export { smrtPlugin } from './vite-plugin/index.js';

// Runtime utilities
export * from './runtime/index.js';
