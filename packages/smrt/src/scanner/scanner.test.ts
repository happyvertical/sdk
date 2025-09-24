/**
 * Tests for AST scanner functionality
 */

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASTScanner, ManifestGenerator } from './index';

describe('AST Scanner', () => {
  const testFilePath = resolve(__dirname, 'test-sample.ts');

  it('should scan and find SMRT classes', () => {
    const scanner = new ASTScanner([testFilePath]);
    const results = scanner.scanFiles();

    expect(results).toHaveLength(1);
    expect(results[0].objects).toHaveLength(2);

    const productObj = results[0].objects.find(
      (obj) => obj.className === 'Product',
    );
    const categoryObj = results[0].objects.find(
      (obj) => obj.className === 'Category',
    );

    expect(productObj).toBeDefined();
    expect(categoryObj).toBeDefined();
  });

  it('should parse Product class correctly', () => {
    const scanner = new ASTScanner([testFilePath]);
    const results = scanner.scanFiles();
    const productObj = results[0].objects.find(
      (obj) => obj.className === 'Product',
    );

    expect(productObj).toMatchObject({
      name: 'product',
      className: 'Product',
      collection: 'products',
      decoratorConfig: {
        api: { exclude: ['delete'] },
        mcp: { include: ['list', 'get', 'create'] },
        cli: true,
      },
    });

    // Check fields
    expect(productObj?.fields.name).toMatchObject({
      type: 'text',
      required: true,
      default: '',
    });

    expect(productObj?.fields.price).toMatchObject({
      type: 'decimal',
      required: true,
      default: 0,
    });

    expect(productObj?.fields.inStock).toMatchObject({
      type: 'boolean',
      required: true,
      default: true,
    });

    expect(productObj?.fields.description).toMatchObject({
      type: 'text',
      required: false,
    });
  });

  it('should parse methods correctly', () => {
    const scanner = new ASTScanner([testFilePath], {
      includePrivateMethods: true,
      includeStaticMethods: true,
    });
    const results = scanner.scanFiles();
    const productObj = results[0].objects.find(
      (obj) => obj.className === 'Product',
    );

    expect(productObj?.methods.calculateDiscount).toMatchObject({
      name: 'calculateDiscount',
      async: true,
      isStatic: false,
      isPublic: true,
      returnType: 'Promise<number>',
      parameters: [{ name: 'percentage', type: 'number', optional: false }],
    });

    expect(productObj?.methods.findByCategory).toMatchObject({
      name: 'findByCategory',
      isStatic: true,
      isPublic: true,
    });

    expect(productObj?.methods.validatePrice).toMatchObject({
      name: 'validatePrice',
      isStatic: false,
      isPublic: false,
    });
  });

  it('should generate manifest correctly', () => {
    const scanner = new ASTScanner([testFilePath]);
    const results = scanner.scanFiles();
    const generator = new ManifestGenerator();
    const manifest = generator.generateManifest(results);

    expect(manifest.version).toBe('1.0.0');
    expect(manifest.timestamp).toBeGreaterThan(0);
    expect(Object.keys(manifest.objects)).toEqual(['product', 'category']);
  });

  it('should generate TypeScript interfaces', () => {
    const scanner = new ASTScanner([testFilePath]);
    const results = scanner.scanFiles();
    const generator = new ManifestGenerator();
    const manifest = generator.generateManifest(results);
    const interfaces = generator.generateTypeDefinitions(manifest);

    expect(interfaces).toContain('export interface ProductData');
    expect(interfaces).toContain('name: string;');
    expect(interfaces).toContain('description?: string;');
    expect(interfaces).toContain('price: number;');
    expect(interfaces).toContain('inStock: boolean;');
  });

  it('should generate REST endpoints', () => {
    const scanner = new ASTScanner([testFilePath]);
    const results = scanner.scanFiles();
    const generator = new ManifestGenerator();
    const manifest = generator.generateManifest(results);
    const endpoints = generator.generateRestEndpoints(manifest);

    expect(endpoints).toContain('GET /products');
    expect(endpoints).toContain('POST /products');
    expect(endpoints).toContain('GET /products/:id');
    expect(endpoints).not.toContain('DELETE /products'); // Excluded in config
  });

  it('should generate MCP tools', () => {
    const scanner = new ASTScanner([testFilePath]);
    const results = scanner.scanFiles();
    const generator = new ManifestGenerator();
    const manifest = generator.generateManifest(results);
    const tools = generator.generateMCPTools(manifest);

    expect(tools).toContain('list_products');
    expect(tools).toContain('get_product');
    expect(tools).toContain('create_product');
    expect(tools).not.toContain('delete_product'); // Not in include list
  });
});
