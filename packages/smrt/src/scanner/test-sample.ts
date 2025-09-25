/**
 * Sample SMRT classes for testing the AST scanner
 */

import { SmrtObject } from '../object';

// Mock decorator function for testing
function smrt(_config?: any) {
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
class Product extends SmrtObject {
  name = '';
  description?: string;
  price = 0;
  inStock = true;
  category = 'general';
  tags: string[] = [];

  async calculateDiscount(percentage: number): Promise<number> {
    return this.price * (percentage / 100);
  }

  static findByCategory(_category: string) {
    // Static method example
    return [];
  }

  private validatePrice(): boolean {
    return this.price >= 0;
  }
}

// Simple Category class
@smrt()
class Category extends SmrtObject {
  name = '';
  description?: string;
  active = true;

  constructor(options: any) {
    super(options);
    Object.assign(this, options);
  }
}

export { Product, Category };
