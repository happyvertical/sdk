/**
 * Product catalog category model
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
 * Product catalog category
 */
@smrt()
export class Category extends BaseObject {
  name: string = '';
  description?: string;
  active: boolean = true;
  
  constructor(options: any = {}) {
    super(options);
    Object.assign(this, options);
  }

  async getProducts() {
    // Custom method - could fetch related products
    return [];
  }
}