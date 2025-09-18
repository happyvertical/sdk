/**
 * SMRT Template Models
 * 
 * Domain models that demonstrate SMRT auto-generation capabilities.
 * These classes are decorated with @smrt() and automatically generate:
 * - REST APIs
 * - TypeScript clients  
 * - MCP tools for AI
 * - UI components
 */

export { Product } from './Product.js';
export { Category } from './Category.js';

// Re-export types for convenience
export type { ProductData, CategoryData } from '@smrt/types';