/**
 * Integration test for SMRT Template auto-generation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from './server.js';
import { demonstrateClient } from './client.js';

describe('SMRT Template Integration', () => {
  let server: any;

  beforeAll(async () => {
    // Start server for testing
    server = await startServer();
    // Give server time to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Cleanup server
    if (server?.close) {
      server.close();
    }
  });

  it('should generate REST endpoints from SMRT objects', async () => {
    // Test that we can reach the auto-generated endpoints
    const response = await fetch('http://localhost:3000/api/v1/products');
    
    // Should return 200 even if empty (auto-generated endpoint exists)
    expect(response.status).toBe(200);
  });

  it('should generate TypeScript client', async () => {
    // The client demo should run without errors
    await expect(demonstrateClient()).resolves.not.toThrow();
  });

  it('should include auto-generated virtual modules', async () => {
    // These imports should work due to Vite plugin virtual modules
    const { default: setupRoutes } = await import('@smrt/routes');
    const { default: createClient } = await import('@smrt/client');
    const { manifest } = await import('@smrt/manifest');
    
    expect(typeof setupRoutes).toBe('function');
    expect(typeof createClient).toBe('function');
    expect(typeof manifest).toBe('object');
    expect(manifest.objects).toBeDefined();
  });

  it('should discover SMRT objects in manifest', async () => {
    const { manifest } = await import('@smrt/manifest');
    
    // Should find our Product and Category objects
    expect(manifest.objects.product).toBeDefined();
    expect(manifest.objects.category).toBeDefined();
    
    // Product should have the right configuration
    const product = manifest.objects.product;
    expect(product.decoratorConfig.api?.exclude).toContain('delete');
    expect(product.decoratorConfig.mcp?.include).toContain('create');
    expect(product.decoratorConfig.cli).toBe(true);
  });
});