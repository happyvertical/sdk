/**
 * Product knowledge base category model
 *
 * SMRT auto-generates REST APIs, MCP tools, and TypeScript clients from this class.
 */

import { BaseObject } from '@have/smrt';
import { smrt } from '@have/smrt';

/**
 * Product knowledge base category for organizing product information
 */
@smrt({
  api: {
    include: ['list', 'get', 'create', 'update'] // Standard CRUD except delete
  },
  mcp: {
    include: ['list', 'get'] // AI tools for category discovery
  },
  cli: true // Enable CLI commands for admin
})
export class Category extends BaseObject {
  name: string = '';
  description: string = '';
  parentId?: string; // For hierarchical categories
  level: number = 0; // Category depth in hierarchy
  productCount: number = 0; // Number of products in this category

  constructor(options: any = {}) {
    super(options);
    Object.assign(this, options);
  }

  async getProducts() {
    // Returns products in this category - implementation auto-generated
    return [];
  }

  async getSubcategories() {
    // Returns child categories - implementation auto-generated
    return [];
  }

  async updateProductCount(): Promise<void> {
    // Updates the cached product count
    // Implementation will be auto-generated to count related products
  }

  static async getRootCategories(): Promise<Category[]> {
    // Returns top-level categories (parentId is null/empty)
    return [];
  }
}