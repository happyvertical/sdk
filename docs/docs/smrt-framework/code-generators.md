---
id: code-generators
title: "Code Generators"
sidebar_label: "Code Generators"
sidebar_position: 4
---

# Code Generators

SMRT's auto-generation capabilities powered by the `@smrt()` decorator.

## Overview

The SMRT framework includes powerful code generation capabilities that automatically create:

- **🚀 API Routes**: RESTful endpoints for your models
- **📱 Client Libraries**: Type-safe client code
- **🔌 MCP Servers**: Model Context Protocol integration
- **⚡ CLI Tools**: Command-line interfaces

## Auto-Generation with @smrt()

```typescript
import { BaseObject, smrt } from '@have/smrt';

@smrt({
  api: { include: ['list', 'get', 'create', 'update', 'delete'] },
  mcp: { include: ['list', 'get', 'search'] },
  cli: true,
  client: true
})
export class Product extends BaseObject {
  name: string = '';
  price: number = 0;
  category: string = '';
}
```

This single decorator generates:
- `/api/products` endpoints
- `ProductClient` for type-safe API calls
- MCP server for AI tool integration
- CLI commands for product management

## Generated API Routes

```typescript
// Auto-generated routes
GET    /api/products        // List products
GET    /api/products/:id    // Get product
POST   /api/products        // Create product
PUT    /api/products/:id    // Update product
DELETE /api/products/:id    // Delete product
```

## Generated Client

### For SMRT Object Creators

```typescript
import { createClient } from '@smrt/client'; // Auto-generated from local objects

const client = createClient('/api/v1');

// Type-safe API calls
const products = await client.products.list();
const product = await client.products.get('123');
await client.products.create({ name: 'Widget', price: 29.99 });
```

### For SMRT Package Consumers

```typescript
import { createClient } from '@smrt/client'; // Generated from consumed packages
import type { ProductData } from '@smrt/types';

const client = createClient('/api/v1');

// Type-safe API calls across all consumed SMRT packages
const products: ProductData[] = await client.products.list();
const categories = await client.categories.list();
```

## Generated MCP Integration

```typescript
// Auto-generated MCP tools
tools: [
  {
    name: 'list_products',
    description: 'List all products',
    handler: Product.list
  },
  {
    name: 'get_product',
    description: 'Get product by ID',
    handler: Product.get
  }
]
```

## Consumer Plugin for Package Users

The `smrtConsumer` plugin enables projects to consume SMRT packages without defining their own SMRT objects.

### Setup

```typescript
// vite.config.js
import { smrtConsumer } from '@have/smrt/consumer-plugin';

export default {
  plugins: [
    smrtConsumer({
      packages: ['@my-org/products', '@my-org/content'], // Packages to consume
      generateTypes: true,
      typesDir: 'src/types/smrt-generated'
    })
  ]
};
```

### Automatic Package Discovery

The consumer plugin automatically scans `node_modules` for SMRT packages:

```typescript
// Automatically finds all installed SMRT packages
smrtConsumer({
  generateTypes: true,
  typesDir: 'src/types/smrt-generated'
})

// Or explicitly specify packages
smrtConsumer({
  packages: ['@my-org/products', '@my-org/analytics'],
  generateTypes: true
})
```

### Generated Virtual Modules

The plugin generates virtual modules for consumed packages:

```typescript
// Virtual modules available after plugin setup:
import { createClient } from '@smrt/client';       // Unified API client
import { setupRoutes } from '@smrt/routes';        // Combined routes
import { tools } from '@smrt/mcp';                 // MCP tools
import type { ProductData } from '@smrt/types';    // Type definitions
import { manifest } from '@smrt/manifest';         // Package metadata
```

### Integration Patterns

#### SvelteKit Projects
```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { smrtConsumer } from '@have/smrt/consumer-plugin';

export default {
  plugins: [
    sveltekit(),
    smrtConsumer({
      typesDir: 'src/lib/types/smrt-generated'
    })
  ]
};
```

#### Micro-frontend Architecture
```typescript
// Host application consuming multiple SMRT microservices
smrtConsumer({
  packages: [
    '@company/products-service',
    '@company/users-service',
    '@company/analytics-service'
  ],
  generateTypes: true
})

// Access unified APIs from all services
const client = createClient('/api/v1');
const products = await client.products.list();
const users = await client.users.list();
```

*Learn more in our [Consuming SMRT Packages](/docs/getting-started/consuming-packages) guide.*