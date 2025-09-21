---
id: triple-purpose-architecture
title: "Triple-Purpose Architecture: One Codebase, Three Deployments"
sidebar_label: Triple-Purpose Architecture
sidebar_position: 2
---

# Triple-Purpose Architecture: One Codebase, Three Deployments

Learn how to build sophisticated SMRT services that can be consumed in three different ways from a single codebase: as standalone applications, module federation providers, and traditional NPM packages.

## Overview

The SMRT triple-purpose architecture pattern allows you to:
- **🏗️ Standalone Application**: Complete web app with full UI and functionality
- **🔗 Module Federation**: Runtime component sharing across micro-frontends
- **📦 NPM Package**: Traditional build-time imports for maximum optimization

This tutorial uses the real `smrt/products` implementation as a comprehensive example.

## Architecture Benefits

### **Developer Experience**
- **Single codebase** to maintain instead of three separate projects
- **Consistent business logic** across all consumption patterns
- **Shared testing** and validation for all deployment modes
- **Unified CI/CD pipeline** for all build variants

### **Deployment Flexibility**
- **Monolithic deployment** when you need a complete standalone app
- **Micro-frontend architecture** for runtime composition and team autonomy
- **Library distribution** for performance-critical integrations

### **Performance Optimization**
- **Code splitting** optimized for each consumption pattern
- **Bundle size optimization** per deployment target
- **Runtime vs build-time** composition trade-offs

## Real Implementation: Products Service

Let's examine the complete implementation from `smrt/products`:

### Project Structure

```
smrt/products/
├── src/
│   ├── lib/
│   │   ├── models/Product.ts         # SMRT model with @smrt() decorator
│   │   ├── components/               # Reusable Svelte components
│   │   │   ├── ProductCard.svelte
│   │   │   └── ProductForm.svelte
│   │   ├── features/                 # Higher-level feature components
│   │   │   ├── ProductCatalog.svelte
│   │   │   └── CategoryManager.svelte
│   │   └── stores/                   # Svelte 5 runes-based state
│   │       └── product-store.svelte.ts
│   ├── app/                          # Standalone application
│   │   ├── pages/
│   │   └── App.svelte
│   └── federation/                   # Module federation configs
│       ├── expose.config.js
│       ├── consume.config.js
│       └── shared.config.js
├── vite.config.ts                    # Multi-mode Vite configuration
├── federation.config.ts              # Federation settings
└── package.json                      # Triple-purpose build scripts
```

## Step 1: Core Business Logic with SMRT

The foundation is a SMRT model that auto-generates APIs, tools, and types:

```typescript
// src/lib/models/Product.ts
import { BaseObject, smrt } from '@have/smrt';

@smrt({
  api: {
    include: ['list', 'get', 'create', 'update'] // Auto-generates REST endpoints
  },
  mcp: {
    include: ['list', 'get', 'search'] // Auto-generates AI tools
  },
  cli: true // Auto-generates CLI commands
})
export class Product extends BaseObject {
  name: string = '';
  description: string = '';
  category: string = '';
  manufacturer: string = '';
  specifications: Record<string, any> = {};
  tags: string[] = [];

  constructor(options: any = {}) {
    super(options);
    Object.assign(this, options);
  }

  // Business logic methods
  async getSpecification(key: string): Promise<any> {
    return this.specifications[key];
  }

  // AI-powered methods from BaseObject
  async summarize(): Promise<string> {
    return await this.do(`Create a brief summary of this product: ${this.name} - ${this.description}`);
  }

  async isCompatibleWith(otherProduct: Product): Promise<boolean> {
    return await this.is(`compatible with ${otherProduct.name} based on specifications and category`);
  }

  static async searchByText(query: string): Promise<Product[]> {
    // Auto-implemented by SMRT
    return [];
  }
}
```

## Step 2: Svelte 5 Components with Runes

Build reusable components using modern Svelte 5 patterns:

```typescript
// src/lib/stores/product-store.svelte.ts
import { getAIClient } from '@have/ai';
import createClient from '@smrt/client'; // Auto-generated client

interface ProductStore {
  items: Product[];
  loading: boolean;
  error: string | null;
}

export class ProductStoreClass {
  private data = $state<ProductStore>({
    items: [],
    loading: false,
    error: null
  });

  private api = createClient('/api/v1');

  // Reactive getters
  get items() { return this.data.items; }
  get loading() { return this.data.loading; }
  get error() { return this.data.error; }
  get inStockCount() {
    return this.data.items.filter(p => p.inStock).length;
  }

  // Actions with auto-generated API integration
  async loadProducts() {
    this.data.loading = true;
    try {
      const response = await this.api.products.list();
      this.data.items = response.data;
    } catch (err) {
      this.data.error = err.message;
    } finally {
      this.data.loading = false;
    }
  }

  async createProduct(productData: Partial<ProductData>) {
    const response = await this.api.products.create(productData);
    if (response.data) {
      this.data.items.push(response.data);
    }
    return response;
  }
}

export const productStore = new ProductStoreClass();
```

```svelte
<!-- src/lib/features/ProductCatalog.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { productStore } from '../stores/product-store.svelte.js';
  import ProductCard from '../components/ProductCard.svelte';

  // Props for different consumption contexts
  interface Props {
    readonly?: boolean;
    maxItems?: number;
    categories?: string[];
  }

  let { readonly = false, maxItems = 50, categories = [] }: Props = $props();

  // Reactive filtering
  const filteredProducts = $derived(() => {
    let products = productStore.items;

    if (categories.length > 0) {
      products = products.filter(p => categories.includes(p.category));
    }

    return products.slice(0, maxItems);
  });

  onMount(() => {
    productStore.loadProducts();
  });
</script>

<div class="product-catalog">
  <header>
    <h2>Product Catalog</h2>
    {#if productStore.loading}
      <div class="loading">Loading products...</div>
    {/if}
  </header>

  <div class="product-grid">
    {#each filteredProducts as product (product.id)}
      <ProductCard
        {product}
        editable={!readonly}
        on:update={() => productStore.loadProducts()}
      />
    {/each}
  </div>
</div>

<style>
  .product-catalog {
    container-type: inline-size;
  }

  .product-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
    padding: 1rem;
  }

  @container (max-width: 768px) {
    .product-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
```

## Step 3: Multi-Mode Vite Configuration

The core of triple-purpose architecture is the Vite configuration:

```typescript
// vite.config.ts
import { defineConfig, type UserConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { smrtPlugin } from '@have/smrt/vite-plugin';
import federation from '@originjs/vite-plugin-federation';
import federationConfig from './federation.config.js';

export default defineConfig(({ command, mode }): UserConfig => {
  // Base configuration shared by all modes
  const baseConfig: UserConfig = {
    plugins: [
      svelte(),
      smrtPlugin({
        include: ['src/lib/models/**/*.ts'],
        exclude: ['**/*.test.ts', '**/*.spec.ts'],
        baseClasses: ['BaseObject'],
        generateTypes: true,
        watch: command === 'serve',
        hmr: command === 'serve',
        mode: 'server'
      })
    ],
    resolve: {
      alias: {
        '$lib': '/src/lib'
      }
    }
  };

  // Mode-specific configurations
  switch (mode) {
    case 'library':
      return {
        ...baseConfig,
        build: {
          target: 'esnext',
          lib: {
            entry: {
              index: './src/lib/index.ts',
              models: './src/lib/models/index.ts',
              components: './src/lib/components/index.ts',
              features: './src/lib/features/index.ts',
              stores: './src/lib/stores/index.ts'
            },
            formats: ['es', 'cjs']
          },
          rollupOptions: {
            external: ['svelte', '@have/smrt', '@have/ai'],
            output: {
              globals: {
                svelte: 'Svelte',
                '@have/smrt': 'SMRT',
                '@have/ai': 'HaveAI'
              }
            }
          }
        }
      };

    case 'federation':
      return {
        ...baseConfig,
        plugins: [
          ...baseConfig.plugins!,
          federation(federationConfig)
        ],
        build: {
          target: 'esnext',
          minify: false,
          cssCodeSplit: false,
          rollupOptions: {
            external: ['svelte']
          }
        },
        server: {
          port: 3002,
          cors: true
        }
      };

    case 'standalone':
    default:
      return {
        ...baseConfig,
        build: {
          target: 'esnext',
          outDir: 'dist/standalone',
          rollupOptions: {
            input: {
              main: './index.html'
            }
          }
        },
        server: {
          port: 3001
        }
      };
  }
});
```

## Step 4: Module Federation Configuration

Configure what components are exposed and consumed:

```typescript
// federation.config.ts
export const federationConfig = {
  name: 'productService',
  filename: 'remoteEntry.js',

  // What this service exposes
  exposes: {
    // Individual components
    './ProductCard': './src/lib/components/ProductCard.svelte',
    './ProductForm': './src/lib/components/ProductForm.svelte',

    // Feature components
    './ProductCatalog': './src/lib/features/ProductCatalog.svelte',
    './CategoryManager': './src/lib/features/CategoryManager.svelte',

    // Complete applications
    './ProductsPage': './src/app/pages/ProductsPage.svelte',

    // Business logic
    './Product': './src/lib/models/Product.ts',
    './ProductStore': './src/lib/stores/product-store.svelte.ts'
  },

  // What this service consumes
  remotes: {
    userService: 'userService@http://localhost:3003/remoteEntry.js',
    orderService: 'orderService@http://localhost:3004/remoteEntry.js'
  },

  // Shared dependencies
  shared: {
    svelte: {
      singleton: true,
      strictVersion: true
    },
    '@have/smrt': {
      singleton: true
    }
  }
};
```

## Step 5: Package.json Scripts

Configure build scripts for all three modes:

```json
{
  "name": "@have/products",
  "scripts": {
    "dev": "concurrently \"npm run dev:standalone\" \"npm run dev:federation\"",
    "dev:standalone": "vite --mode standalone --port 3001",
    "dev:federation": "vite --mode federation --port 3002",
    "dev:library": "vite build --mode library --watch",

    "build": "npm run build:lib && npm run build:app && npm run build:federation",
    "build:lib": "vite build --mode library",
    "build:app": "vite build --mode standalone",
    "build:federation": "vite build --mode federation",

    "preview:app": "vite preview --mode standalone",
    "preview:federation": "vite preview --mode federation"
  }
}
```

## Consumption Patterns

### 1. NPM Package Library Usage

```typescript
// Consumer application
import { Product, ProductCard, productStore } from '@have/products';
import { createClient, setupRoutes } from '@have/products';
import type { ProductData } from '@have/products';

// Use model classes
const product = new Product({
  name: 'Example Product',
  description: 'High-quality example',
  category: 'electronics'
});

// Use generated client
const client = createClient('/api/v1');
const products = await client.products.list();

// Use Svelte components (in a Svelte app)
import ProductCard from '@have/products/components';
```

### 2. Module Federation Consumer

```svelte
<!-- Consumer application -->
<script>
  // Runtime imports from federation
  import ProductCatalog from 'productService/ProductCatalog';
  import ProductCard from 'productService/ProductCard';
  import UserProfile from 'userService/UserProfile';
  import OrderHistory from 'orderService/OrderHistory';
</script>

<!-- Compose application from multiple federated services -->
<div class="dashboard">
  <aside>
    <UserProfile userId={currentUser.id} />
  </aside>

  <main>
    <ProductCatalog readonly={true} maxItems={20} />
  </main>

  <aside>
    <OrderHistory userId={currentUser.id} />
  </aside>
</div>
```

### 3. Standalone Application

```bash
# Development
npm run dev:standalone
# Standalone app: http://localhost:3001

# Production deployment
docker run -p 3001:3001 product-service
```

## Development Workflow

### Multi-Mode Development

```bash
# Start all modes simultaneously
npm run dev
# Standalone: http://localhost:3001
# Federation: http://localhost:3002

# Individual mode development
npm run dev:standalone   # Standalone app only
npm run dev:federation   # Federation server only
npm run dev:library      # Library build with watch
```

### Testing Across Modes

```typescript
// test/integration.test.ts
import { test, expect } from 'vitest';
import { Product } from '../src/lib/models/Product';
import { productStore } from '../src/lib/stores/product-store.svelte';

test('Product model works across all modes', async () => {
  const product = new Product({
    name: 'Test Product',
    category: 'electronics'
  });

  // Test business logic
  await product.save();
  expect(product.id).toBeDefined();

  // Test AI capabilities
  const summary = await product.summarize();
  expect(summary).toContain('Test Product');
});

test('Store works in different contexts', async () => {
  // Test store in standalone context
  await productStore.loadProducts();
  expect(productStore.items.length).toBeGreaterThan(0);

  // Test store in federation context
  // (Federation-specific tests)
});
```

## Production Deployment

### Standalone Deployment

```dockerfile
# Dockerfile.standalone
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/standalone ./dist
EXPOSE 3001
CMD ["npm", "run", "preview:app"]
```

### Federation Deployment

```yaml
# docker-compose.federation.yml
version: '3.8'
services:
  product-service:
    build:
      context: .
      dockerfile: Dockerfile.federation
    ports:
      - "3002:3002"
    environment:
      - FEDERATION_PORT=3002

  user-service:
    image: user-service:latest
    ports:
      - "3003:3003"

  order-service:
    image: order-service:latest
    ports:
      - "3004:3004"
```

### NPM Package Publishing

```bash
# Build and publish library
npm run build:lib
npm publish --access public
```

## Key Benefits Demonstrated

### **🎯 Code Reuse**
- **100% code sharing** across all consumption patterns
- **Single source of truth** for business logic
- **Unified testing** and validation

### **⚡ Performance Optimization**
- **Bundle splitting** optimized per consumption pattern
- **Tree shaking** for library consumers
- **Runtime composition** for federation

### **🔧 Developer Experience**
- **Hot module replacement** across all modes
- **TypeScript support** with shared type definitions
- **Consistent tooling** and build processes

### **🚀 Deployment Flexibility**
- **Monolithic** for simple deployments
- **Micro-frontend** for complex architectures
- **Library distribution** for performance-critical use cases

## Next Steps

<div className="row">
  <div className="col col--4">
    <div className="feature-card">
      <h3>🔗 Module Federation Deep Dive</h3>
      <p>Master advanced federation patterns, shared state, and micro-frontend architecture</p>
      <a href="/docs/tutorials/module-federation-advanced" className="nav-pill">Learn Federation →</a>
    </div>
  </div>
  <div className="col col--4">
    <div className="feature-card">
      <h3>📦 Library Best Practices</h3>
      <p>Optimize bundle size, API design, and distribution for NPM packages</p>
      <a href="/docs/tutorials/library-optimization" className="nav-pill">Optimize Libraries →</a>
    </div>
  </div>
  <div className="col col--4">
    <div className="feature-card">
      <h3>🏗️ Production Deployment</h3>
      <p>Deploy triple-purpose services with Docker, Kubernetes, and CI/CD</p>
      <a href="/docs/advanced/deployment" className="nav-pill">Deploy to Production →</a>
    </div>
  </div>
</div>

---

<div className="callout success">
  <strong>🎉 Architectural Mastery!</strong> You now understand how to build sophisticated services that work as standalone apps, federated modules, and NPM packages from a single codebase. This pattern enables unprecedented flexibility and code reuse.
</div>