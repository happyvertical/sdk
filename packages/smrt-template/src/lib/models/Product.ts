/**
 * E-commerce product model with inventory tracking
 * 
 * SMRT auto-generates REST APIs, MCP tools, and TypeScript clients from this class.
 */

import { BaseObject } from '@have/smrt';

// Mock decorator for AST scanning (the real one comes from SMRT but this helps with intellisense)
function smrt(config?: any) {
  return function (target: any) {
    return target;
  };
}

/**
 * E-commerce product with inventory tracking
 */
@smrt({
  api: {
    exclude: ['delete'] // Don't allow deleting products via API
  },
  mcp: {
    include: ['list', 'get', 'create'] // Only expose these as AI tools
  },
  cli: true // Enable all CLI commands
})
export class Product extends BaseObject {
  name: string = '';
  description?: string;
  price: number = 0;
  inStock: boolean = true;
  category: string = ''; // Reference to category ID
  tags: string[] = [];
  
  constructor(options: any = {}) {
    super(options);
    Object.assign(this, options);
  }

  async calculateDiscount(percentage: number): Promise<number> {
    return this.price * (percentage / 100);
  }

  async updateInventory(quantity: number): Promise<void> {
    // Update inventory logic
    this.inStock = quantity > 0;
  }

  static async findByCategory(categoryId: string): Promise<Product[]> {
    // Static method to find products by category
    return [];
  }
}