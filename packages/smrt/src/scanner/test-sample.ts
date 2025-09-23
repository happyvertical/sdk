/**
 * Sample SMRT classes for testing the AST scanner
 */

import { BaseObject } from '../object.js';

// Mock decorator function for testing
function smrt(config?: any) {
  return (target: any) => target;
}

// Simple Product class
@smrt({
  api: {
    exclude: ['delete'],
  },
  mcp: {
    include: ['list', 'get', 'create'],
  },
  cli: true,
})
class Product extends BaseObject {
  name: string = '';
  description?: string;
  price: number = 0;
  inStock: boolean = true;
  category: string = 'general';
  tags: string[] = [];

  async calculateDiscount(percentage: number): Promise<number> {
    return this.price * (percentage / 100);
  }

  static findByCategory(category: string) {
    // Static method example
    return [];
  }

  private validatePrice(): boolean {
    return this.price >= 0;
  }
}

// Simple Category class
@smrt()
class Category extends BaseObject {
  name: string = '';
  description?: string;
  active: boolean = true;

  constructor(options: any) {
    super(options);
    Object.assign(this, options);
  }
}

export { Product, Category };
