/**
 * @have/smrt - Core library for building AI agents
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
 * - Human: Simple user/person representation
 */

export * from './human.js';
export * from './document.js';
export * from './content.js';
export * from './contents.js';
export * from './class.js';
export * from './object.js';
export * from './collection.js';
export * from './pleb.js';
