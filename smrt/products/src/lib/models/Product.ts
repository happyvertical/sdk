/**
 * Product knowledge base model
 *
 * SMRT auto-generates REST APIs, MCP tools, and TypeScript clients from this class.
 */

import { BaseObject } from '@have/smrt';
import { smrt } from '@have/smrt';

/**
 * Product information for knowledge base queries
 */
@smrt({
  api: {
    include: ['list', 'get', 'create', 'update'] // Standard CRUD except delete
  },
  mcp: {
    include: ['list', 'get', 'search'] // AI tools for product discovery
  },
  cli: true // Enable CLI commands for admin
})
export class Product extends BaseObject {
  name: string = '';
  description: string = '';
  category: string = ''; // Reference to category
  manufacturer: string = '';
  model: string = '';
  specifications: Record<string, any> = {};
  tags: string[] = [];

  constructor(options: any = {}) {
    super(options);
    Object.assign(this, options);
  }

  async getSpecification(key: string): Promise<any> {
    return this.specifications[key];
  }

  async updateSpecification(key: string, value: any): Promise<void> {
    this.specifications[key] = value;
  }

  static async searchByText(query: string): Promise<Product[]> {
    // Search implementation will be auto-generated
    return [];
  }

  static async findByManufacturer(manufacturer: string): Promise<Product[]> {
    // Manufacturer search will be auto-generated
    return [];
  }
}