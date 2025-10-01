/**
 * Tests for REST persistence adapter
 *
 * These tests validate the full REST persistence flow:
 * 1. Server: SMRT object with SQL persistence exposed via REST API
 * 2. Client: SMRT object with REST persistence consuming the API
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SmrtObject } from '../object';
import { SmrtCollection } from '../collection';
import { APIGenerator } from '../generators/rest';
import type { Server } from 'node:http';

/**
 * Test object definition using simple declarations
 * Framework automatically converts these to Field instances and handles initialization
 */
class Product extends SmrtObject {
  name: string = '';
  title: string = '';
  price: number = 0;
  category: string = '';
  inStock: string = '';
}

/**
 * Collection for managing products
 */
class ProductCollection extends SmrtCollection<Product> {
  static readonly _itemClass = Product;
}

describe('REST Persistence Adapter Integration', () => {
  let server: Server;
  let serverUrl: string;
  const testPort = 3999;

  // Server-side collection (SQL persistence)
  let serverCollection: ProductCollection;

  // Client-side collection (REST persistence)
  let clientCollection: ProductCollection;

  beforeAll(async () => {
    // Setup server with SQL-backed SMRT object
    serverCollection = new ProductCollection({
      db: {
        url: ':memory:',
        type: 'sqlite',
      },
    });

    await serverCollection.initialize();

    // Create REST API server
    const apiGenerator = new APIGenerator(
      {
        basePath: '/api',
        enableCors: true,
        port: testPort,
        hostname: 'localhost',
      },
      {
        db: serverCollection.db,
      },
    );

    // Register the collection
    apiGenerator.registerCollection('products', serverCollection);

    // Start server
    const serverInfo = apiGenerator.createServer();
    server = serverInfo.server;
    serverUrl = `http://localhost:${testPort}`;

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Setup client with REST persistence
    clientCollection = new ProductCollection({
      persistence: {
        type: 'rest',
        baseUrl: `${serverUrl}/api/products`,
        timeout: 5000,
      },
    });

    await clientCollection.initialize();
  });

  afterAll(async () => {
    // Cleanup
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  describe('CRUD Operations via REST', () => {
    it('should create a product via REST API', async () => {
      const product = await clientCollection.create({
        name: 'Test Widget',
        title: 'Test Widget',
        price: 99,
        category: 'Electronics',
      });

      await product.save();

      expect(product.id).toBeDefined();
      expect(product.title).toBe('Test Widget');
      expect(product.price).toBe(99);
    });

    it('should retrieve a product by ID via REST API', async () => {
      // Create via server (SQL)
      const serverProduct = await serverCollection.create({
        name: 'Server Product',
        title: 'Server Product',
        price: 150,
        category: 'Tools',
      });
      await serverProduct.save();

      // Retrieve via client (REST)
      const clientProduct = await clientCollection.get(serverProduct.id!);

      expect(clientProduct).not.toBeNull();
      expect(clientProduct?.title).toBe('Server Product');
      expect(clientProduct?.price).toBe(150);
      expect(clientProduct?.category).toBe('Tools');
    });

    it('should retrieve a product by slug via REST API', async () => {
      // Create via server (SQL)
      const serverProduct = await serverCollection.create({
        name: 'Slugged Product',
        title: 'Slugged Product',
        slug: 'slugged-product',
        price: 200,
      });
      await serverProduct.save();

      // Retrieve via client (REST) using slug
      const clientProduct = await clientCollection.get('slugged-product');

      expect(clientProduct).not.toBeNull();
      expect(clientProduct?.title).toBe('Slugged Product');
      expect(clientProduct?.slug).toBe('slugged-product');
    });

    it('should list products via REST API', async () => {
      // Create multiple products via server
      for (let i = 1; i <= 5; i++) {
        const product = await serverCollection.create({
          name: `Product ${i}`,
          title: `Product ${i}`,
          price: i * 10,
          category: i % 2 === 0 ? 'Even' : 'Odd',
        });
        await product.save();
      }

      // List via client (REST)
      const products = await clientCollection.list({
        limit: 10,
      });

      expect(products.length).toBeGreaterThanOrEqual(5);
      expect(products[0]).toBeInstanceOf(Product);
    });

    it('should list products with filtering via REST API', async () => {
      // Create test products
      const expensiveProduct = await serverCollection.create({
        name: 'Expensive Item',
        title: 'Expensive Item',
        price: 500,
        category: 'Premium',
      });
      await expensiveProduct.save();

      const cheapProduct = await serverCollection.create({
        name: 'Cheap Item',
        title: 'Cheap Item',
        price: 10,
        category: 'Budget',
      });
      await cheapProduct.save();

      // List with filter via client (REST)
      const expensiveProducts = await clientCollection.list({
        where: {
          'price >': 100,
        },
      });

      expect(expensiveProducts.length).toBeGreaterThan(0);
      expect(expensiveProducts.every((p) => (p.price as number) > 100)).toBe(
        true,
      );
    });

    it('should update a product via REST API', async () => {
      // Create via server
      const product = await serverCollection.create({
        name: 'Original Title',
        title: 'Original Title',
        price: 100,
      });
      await product.save();
      const productId = product.id!;

      // Load via client (REST)
      const clientProduct = await clientCollection.get(productId);
      expect(clientProduct).not.toBeNull();

      // Update via client (REST)
      clientProduct!.title = 'Updated Title';
      clientProduct!.price = 150;
      await clientProduct!.save();

      // Verify update on server
      const verifyProduct = await serverCollection.get(productId);
      expect(verifyProduct?.title).toBe('Updated Title');
      expect(verifyProduct?.price).toBe(150);
    });

    it('should delete a product via REST API', async () => {
      // Create via server
      const product = await serverCollection.create({
        name: 'To Be Deleted',
        title: 'To Be Deleted',
        price: 75,
      });
      await product.save();
      const productId = product.id!;

      // Delete via client (REST)
      const clientProduct = await clientCollection.get(productId);
      expect(clientProduct).not.toBeNull();
      await clientProduct!.delete();

      // Verify deletion on server
      const deletedProduct = await serverCollection.get(productId);
      expect(deletedProduct).toBeNull();
    });

    it('should count products via REST API', async () => {
      // Create products with specific category
      for (let i = 0; i < 3; i++) {
        const product = await serverCollection.create({
          name: `Countable ${i}`,
          title: `Countable ${i}`,
          price: 50,
          category: 'Countable',
        });
        await product.save();
      }

      // Count via client (REST)
      const count = await clientCollection.count({
        where: {
          category: 'Countable',
        },
      });

      expect(count).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle not found errors', async () => {
      const nonExistent = await clientCollection.get(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(nonExistent).toBeNull();
    });

    it('should handle validation errors', async () => {
      const product = await clientCollection.create({
        title: '', // Required field
        price: 0,
      });

      await expect(product.save()).rejects.toThrow();
    });
  });

  describe('Advanced Querying', () => {
    it('should support ordering via REST API', async () => {
      // Create products with different prices
      const prices = [300, 100, 200];
      for (const price of prices) {
        const product = await serverCollection.create({
          name: `Product ${price}`,
          title: `Product ${price}`,
          price,
        });
        await product.save();
      }

      // List ordered by price ascending
      const productsAsc = await clientCollection.list({
        where: {
          'price >=': 100,
          'price <=': 300,
        },
        orderBy: 'price ASC',
        limit: 3,
      });

      expect(productsAsc.length).toBeGreaterThan(0);
      // Verify ascending order
      for (let i = 1; i < productsAsc.length; i++) {
        expect(productsAsc[i].price).toBeGreaterThanOrEqual(
          productsAsc[i - 1].price as number,
        );
      }
    });

    it('should support pagination via REST API', async () => {
      // Create many products
      for (let i = 0; i < 10; i++) {
        const product = await serverCollection.create({
          name: `Paginated ${i}`,
          title: `Paginated ${i}`,
          price: i,
          category: 'Pagination',
        });
        await product.save();
      }

      // Get first page
      const page1 = await clientCollection.list({
        where: { category: 'Pagination' },
        limit: 5,
        offset: 0,
      });

      // Get second page
      const page2 = await clientCollection.list({
        where: { category: 'Pagination' },
        limit: 5,
        offset: 5,
      });

      expect(page1.length).toBe(5);
      expect(page2.length).toBeGreaterThan(0);

      // Ensure pages don't overlap
      const page1Ids = page1.map((p) => p.id);
      const page2Ids = page2.map((p) => p.id);
      const overlap = page1Ids.filter((id) => page2Ids.includes(id));
      expect(overlap.length).toBe(0);
    });

    it('should support IN operator via REST API', async () => {
      // Create products with different categories
      const categories = ['A', 'B', 'C', 'D'];
      for (const category of categories) {
        const product = await serverCollection.create({
          name: `Product ${category}`,
          title: `Product ${category}`,
          price: 100,
          category,
        });
        await product.save();
      }

      // Query with IN operator
      const products = await clientCollection.list({
        where: {
          'category in': ['A', 'B'],
        },
      });

      expect(products.length).toBeGreaterThanOrEqual(2);
      expect(products.every((p) => ['A', 'B'].includes(p.category!))).toBe(
        true,
      );
    });
  });

  describe('Adapter Metadata', () => {
    it('should report correct adapter capabilities', async () => {
      const product = await clientCollection.create({
        name: 'Metadata Test',
        title: 'Metadata Test',
        price: 50,
      });

      // Access adapter through internal property (for testing)
      const adapter = (product as any)._persistenceAdapter;

      expect(adapter).toBeDefined();
      expect(adapter.metadata.type).toBe('rest');
      expect(adapter.metadata.supportsTransactions).toBe(false);
      expect(adapter.metadata.supportsSchemaGeneration).toBe(false);
      expect(adapter.metadata.supportsBatchOperations).toBe(false);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent creates via REST API', async () => {
      // Create multiple products concurrently
      const creates = Array.from({ length: 5 }, async (_, i) => {
        const product = await clientCollection.create({
          name: `Concurrent ${i}`,
          title: `Concurrent ${i}`,
          price: i * 10,
        });
        await product.save();
        return product;
      });

      const products = await Promise.all(creates);

      expect(products).toHaveLength(5);
      expect(products.every((p) => p.id)).toBe(true);
    });

    it('should handle concurrent reads via REST API', async () => {
      // Create a product
      const product = await serverCollection.create({
        name: 'Concurrent Read Test',
        title: 'Concurrent Read Test',
        price: 999,
      });
      await product.save();
      const productId = product.id!;

      // Read it concurrently multiple times
      const reads = Array.from({ length: 5 }, () =>
        clientCollection.get(productId),
      );

      const results = await Promise.all(reads);

      expect(results).toHaveLength(5);
      expect(results.every((r) => r?.title === 'Concurrent Read Test')).toBe(
        true,
      );
    });
  });
});
