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

```typescript
import { ProductClient } from '@smrt/client';

const client = new ProductClient();

// Type-safe API calls
const products = await client.list();
const product = await client.get('123');
await client.create({ name: 'Widget', price: 29.99 });
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

*Full documentation coming soon...*