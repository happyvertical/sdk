---
id: persistence-collections
title: "Persistence & Collections"
sidebar_label: "Persistence & Collections"
sidebar_position: 4
---

# Persistence & Collections

Automatic database operations and intelligent data management.

## Overview

SMRT provides seamless persistence through:

- **🗄️ Auto-Schema**: Database tables from TypeScript classes
- **🔍 Query Builder**: Type-safe database queries
- **🔗 Relationships**: Foreign key management
- **📊 Migrations**: Automatic schema updates

## Automatic Persistence

```typescript
import { BaseObject } from '@have/smrt';

export class Product extends BaseObject {
  name: string = '';
  price: number = 0;
  categoryId: string = '';
}

// Usage - automatic database operations
const product = new Product({
  name: 'Widget',
  price: 29.99
});

await product.save();        // INSERT or UPDATE
await product.delete();      // DELETE
const found = await Product.get('123');  // SELECT by ID
```

## Advanced Queries

```typescript
// Type-safe query building
const products = await Product.list({
  where: {
    price: { '>': 20, '<': 100 },
    category: 'Electronics'
  },
  orderBy: [['price', 'ASC']],
  limit: 10,
  offset: 20
});

// Raw SQL when needed
const results = await Product.query(`
  SELECT p.*, c.name as category_name
  FROM products p
  JOIN categories c ON p.category_id = c.id
  WHERE p.price > ?
`, [50]);
```

## Schema Management

```typescript
// Automatic table creation
export class Product extends BaseObject {
  // Creates 'products' table with columns:
  // - id (primary key)
  // - name (varchar)
  // - price (decimal)
  // - created_at (timestamp)
  // - updated_at (timestamp)
}
```

*Full documentation coming soon...*