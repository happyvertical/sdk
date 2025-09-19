---
id: sql
title: "@have/sql: Database Operations"
sidebar_label: "@have/sql"
sidebar_position: 6
---

# @have/sql: Database Operations

Database interaction with support for SQLite and PostgreSQL, providing the persistence layer for SMRT applications.

## Overview

The `@have/sql` package provides database operations for SMRT:

- **🗄️ Multi-Database**: SQLite and PostgreSQL support
- **🔄 Migrations**: Automatic schema migrations
- **🔍 Query Builder**: Type-safe query construction
- **📊 Aggregations**: Complex data analysis queries
- **🔗 Relationships**: Foreign key management

## Quick Start

```typescript
import { initializeDatabase, Database } from '@have/sql';

// Initialize database connection
await initializeDatabase({
  type: 'sqlite',
  filename: './data.db'
});

// Get database instance
const db = Database.getInstance();

// Execute queries
const results = await db.query('SELECT * FROM products WHERE category = ?', ['electronics']);
```

## Query Builder

```typescript
// Type-safe queries
const products = await db
  .select(['id', 'name', 'price'])
  .from('products')
  .where('category', '=', 'electronics')
  .orderBy('price', 'DESC')
  .limit(10)
  .execute();

// Complex joins
const productStats = await db
  .select(['p.category', 'COUNT(*) as count', 'AVG(p.price) as avg_price'])
  .from('products', 'p')
  .leftJoin('orders', 'o', 'p.id = o.product_id')
  .groupBy('p.category')
  .having('count', '>', 5)
  .execute();
```

## SMRT Integration

The SQL package provides the foundation for SMRT BaseObject persistence:

```typescript
// Automatic database operations
class Product extends BaseObject {
  name: string = '';
  price: number = 0;
}

const product = new Product({ name: 'Widget', price: 29.99 });
await product.save(); // Automatically persisted to database

const products = await Product.list({ where: { price: { '<': 50 } } });
```

*Full documentation coming soon...*