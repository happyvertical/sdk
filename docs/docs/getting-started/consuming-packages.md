---
id: consuming-packages
title: "Consuming SMRT Packages"
sidebar_label: "Consuming Packages"
sidebar_position: 3
---

# Consuming SMRT Packages

Learn how to integrate existing SMRT packages into your applications using the consumer plugin for automatic type generation and API access.

## Overview

The SMRT consumer plugin enables you to:
- **🔌 Auto-discover** SMRT packages in your project
- **🎯 Generate types** automatically from package manifests
- **⚡ Access APIs** through unified virtual modules
- **🔄 Hot reload** with full TypeScript support

This approach is perfect when you want to use existing SMRT services without creating your own SMRT objects.

## Quick Setup

### 1. Install SMRT Consumer Tools

```bash
bun add @have/smrt
```

### 2. Install SMRT Packages

```bash
# Install the SMRT packages you want to use
bun add @my-org/products @my-org/content @my-org/users
```

### 3. Configure Consumer Plugin

```typescript
// vite.config.js
import { smrtConsumer } from '@have/smrt/consumer-plugin';

export default {
  plugins: [
    smrtConsumer({
      packages: ['@my-org/products', '@my-org/content'], // Optional: specify packages
      generateTypes: true,
      typesDir: 'src/types/smrt-generated'
    })
  ]
};
```

### 4. Use Generated APIs

```typescript
// TypeScript automatically discovers these virtual modules:
import { createClient } from '@smrt/client';
import type { ProductData, ContentData } from '@smrt/types';

const client = createClient('/api/v1');

// Type-safe API calls across all consumed packages
const products: ProductData[] = await client.products.list();
const content: ContentData[] = await client.content.list();
```

## Consumer Plugin Options

```typescript
interface SmrtConsumerOptions {
  /** SMRT packages to scan (auto-discovers if not specified) */
  packages?: string[];
  /** Generate TypeScript declarations (default: true) */
  generateTypes?: boolean;
  /** Output directory for generated types */
  typesDir?: string;
  /** Project root path */
  projectRoot?: string;
  /** SvelteKit integration mode */
  svelteKit?: boolean;
  /** Use static types only (for federation builds) */
  staticTypes?: boolean;
  /** Disable file scanning for performance */
  disableScanning?: boolean;
}
```

### Automatic Package Discovery

The consumer plugin can automatically find SMRT packages:

```typescript
// Scans node_modules for any packages with SMRT manifests
smrtConsumer({
  generateTypes: true,
  typesDir: 'src/types/smrt-generated'
})
```

### Explicit Package Specification

For better performance and control:

```typescript
// Only process specified packages
smrtConsumer({
  packages: ['@my-org/products', '@my-org/analytics'],
  generateTypes: true,
  typesDir: 'src/types/smrt-generated'
})
```

## Generated Virtual Modules

The consumer plugin creates virtual modules that provide unified access to all consumed SMRT packages:

### `@smrt/client` - Unified API Client

```typescript
import { createClient } from '@smrt/client';

const client = createClient('/api/v1');

// API methods available for all consumed packages
const products = await client.products.list();
const categories = await client.categories.list();
const users = await client.users.list();
const analytics = await client.analytics.query({});
```

### `@smrt/types` - TypeScript Definitions

```typescript
import type {
  ProductData,
  CategoryData,
  UserData
} from '@smrt/types';

// Use types in your application
function processProduct(product: ProductData) {
  console.log(`Processing ${product.name}`);
}

// Type-safe API responses
const products: ProductData[] = await client.products.list();
```

### `@smrt/routes` - Server Route Handlers

```typescript
import { setupRoutes } from '@smrt/routes';
import express from 'express';

const app = express();

// Auto-generated routes for all consumed packages
app.use('/api/v1', setupRoutes());

// Routes available:
// GET/POST /api/v1/products
// GET/POST /api/v1/categories
// GET/POST /api/v1/users
// etc.
```

### `@smrt/mcp` - AI Integration Tools

```typescript
import { tools } from '@smrt/mcp';

// MCP tools for AI integration from all packages
console.log(tools);
// [
//   { name: 'list_products', handler: ... },
//   { name: 'search_content', handler: ... },
//   { name: 'get_user', handler: ... }
// ]
```

### `@smrt/manifest` - Package Metadata

```typescript
import { manifest } from '@smrt/manifest';

// Combined manifest from all consumed packages
console.log(manifest.objects);
// {
//   Product: { fields: {...}, methods: {...} },
//   Category: { fields: {...}, methods: {...} },
//   User: { fields: {...}, methods: {...} }
// }
```

## Integration Patterns

### Svelte/SvelteKit Projects

```typescript
// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { smrtConsumer } from '@have/smrt/consumer-plugin';

export default {
  plugins: [
    sveltekit(),
    smrtConsumer({
      svelteKit: true,
      typesDir: 'src/lib/types/smrt-generated'
    })
  ]
};
```

```svelte
<!-- src/routes/products/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { createClient } from '@smrt/client';
  import type { ProductData } from '@smrt/types';

  let products: ProductData[] = [];
  const client = createClient('/api/v1');

  onMount(async () => {
    const response = await client.products.list();
    products = response.data || [];
  });
</script>

<div class="products">
  {#each products as product (product.id)}
    <div class="product-card">
      <h3>{product.name}</h3>
      <p>{product.description}</p>
      <span class="price">${product.price}</span>
    </div>
  {/each}
</div>
```

### React Projects

```typescript
// vite.config.js
import react from '@vitejs/plugin-react';
import { smrtConsumer } from '@have/smrt/consumer-plugin';

export default {
  plugins: [
    react(),
    smrtConsumer({
      generateTypes: true,
      typesDir: 'src/types/smrt-generated'
    })
  ]
};
```

```typescript
// src/hooks/useProducts.ts
import { useState, useEffect } from 'react';
import { createClient } from '@smrt/client';
import type { ProductData } from '@smrt/types';

export function useProducts() {
  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = createClient('/api/v1');

    client.products.list()
      .then(response => setProducts(response.data || []))
      .finally(() => setLoading(false));
  }, []);

  return { products, loading };
}
```

### Micro-frontend Architecture

```typescript
// Host application consuming multiple SMRT microservices
smrtConsumer({
  packages: [
    '@company/products-service',
    '@company/users-service',
    '@company/analytics-service',
    '@company/orders-service'
  ],
  generateTypes: true,
  typesDir: 'src/types/microservices'
})

// Unified API access across all microservices
const client = createClient('/api/v1');

// Each service's APIs are available
const products = await client.products.list();
const users = await client.users.list();
const analytics = await client.analytics.dashboard();
const orders = await client.orders.recent();
```

### Node.js/Express Applications

```typescript
// server.js
import express from 'express';
import { setupRoutes } from '@smrt/routes';
import { createClient } from '@smrt/client';

const app = express();

// Auto-generated API routes from consumed packages
app.use('/api/v1', setupRoutes());

// Use client in server-side logic
const client = createClient('/api/v1');

app.get('/dashboard', async (req, res) => {
  const [products, users, analytics] = await Promise.all([
    client.products.list(),
    client.users.list(),
    client.analytics.summary()
  ]);

  res.json({ products, users, analytics });
});

app.listen(3000);
```

## Advanced Configuration

### Federation Builds

For module federation with static types:

```typescript
smrtConsumer({
  packages: ['@company/shared-models'],
  staticTypes: true,        // Use static manifest only
  disableScanning: true,    // Skip dynamic scanning for performance
  typesDir: 'src/types/static'
})
```

### Library Development

When building libraries that extend SMRT:

```typescript
smrtConsumer({
  packages: ['@have/smrt-core-models'],
  generateTypes: true,
  typesDir: 'src/types/core',
  disableScanning: true  // Faster builds
})
```

### Monorepo Workspaces

For monorepos with internal SMRT packages:

```typescript
smrtConsumer({
  packages: [
    '@workspace/products',
    '@workspace/users',
    '@workspace/shared'
  ],
  generateTypes: true,
  projectRoot: process.cwd(),
  typesDir: 'packages/app/src/types/workspace'
})
```

## TypeScript Configuration

Ensure your `tsconfig.json` includes the generated types:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@smrt/*": ["src/types/smrt-generated/*"]
    }
  },
  "include": [
    "src/**/*",
    "src/types/smrt-generated/**/*"
  ]
}
```

## Development Workflow

### Hot Module Replacement

The consumer plugin supports HMR for consumed packages:

```bash
# Start development server
npm run dev

# Changes to consumed packages automatically update:
# - Virtual module exports
# - TypeScript declarations
# - API client methods
```

### Type Generation

```bash
# Generate types manually (useful for CI/CD)
npx smrt-prebuild generate-types ./node_modules/@my-org/products/manifest.json src/types/generated

# Or use package.json script
{
  "scripts": {
    "prebuild": "smrt-prebuild generate-types",
    "build": "npm run prebuild && vite build"
  }
}
```

### Debugging

Enable debug logging to troubleshoot package discovery:

```typescript
smrtConsumer({
  packages: ['@my-org/products'],
  generateTypes: true,
  // Add debug option in development
  debug: process.env.NODE_ENV === 'development'
})
```

## Best Practices

### Performance Optimization

**Specify packages explicitly** for better performance:
```typescript
// ✅ Good - explicit packages
smrtConsumer({
  packages: ['@my-org/products', '@my-org/users'],
  disableScanning: true
})

// ❌ Slower - scans all node_modules
smrtConsumer({
  generateTypes: true
})
```

**Use static types for production builds**:
```typescript
smrtConsumer({
  staticTypes: process.env.NODE_ENV === 'production',
  disableScanning: process.env.NODE_ENV === 'production'
})
```

### Type Safety

**Import types explicitly**:
```typescript
// ✅ Good - explicit type imports
import type { ProductData, UserData } from '@smrt/types';

// ❌ Avoid - runtime imports of types
import { ProductData } from '@smrt/types';
```

**Use TypeScript strict mode**:
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

### Error Handling

**Handle API errors gracefully**:
```typescript
const client = createClient('/api/v1');

try {
  const products = await client.products.list();
  return products.data || [];
} catch (error) {
  console.error('Failed to load products:', error);
  return [];
}
```

## Troubleshooting

### Common Issues

**Issue**: "Cannot find module '@smrt/client'"
- **Solution**: Ensure consumer plugin is configured and packages are installed

**Issue**: "Types not generated"
- **Solution**: Check `typesDir` path and ensure `generateTypes: true`

**Issue**: "Package not discovered"
- **Solution**: Verify package contains SMRT manifest and is installed in `node_modules`

**Issue**: "Build errors in CI/CD"
- **Solution**: Run `prebuild` step before TypeScript compilation

### Debug Steps

1. **Check package installation**:
   ```bash
   ls node_modules/@my-org/products
   # Should contain package.json and manifest files
   ```

2. **Verify plugin configuration**:
   ```typescript
   // Enable debug logging
   smrtConsumer({
     packages: ['@my-org/products'],
     debug: true
   })
   ```

3. **Inspect generated types**:
   ```bash
   ls src/types/smrt-generated/
   # Should contain .d.ts files
   ```

## Next Steps

<div className="row">
  <div className="col col--6">
    <div className="feature-card">
      <h3>🏗️ Build Your First Agent</h3>
      <p>Learn to create SMRT objects and agents from scratch</p>
      <a href="/docs/getting-started/your-first-agent" className="nav-pill">Create Agents →</a>
    </div>
  </div>
  <div className="col col--6">
    <div className="feature-card">
      <h3>🔗 Advanced Federation</h3>
      <p>Master micro-frontend architecture with SMRT packages</p>
      <a href="/docs/tutorials/module-federation-guide" className="nav-pill">Learn Federation →</a>
    </div>
  </div>
</div>

---

<div className="callout success">
  <strong>🎉 Package Integration Complete!</strong> You now understand how to seamlessly integrate existing SMRT packages into any application with automatic type generation and unified API access.
</div>