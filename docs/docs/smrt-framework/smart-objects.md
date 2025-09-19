---
id: smart-objects
title: "Smart Objects"
sidebar_label: "Smart Objects"
sidebar_position: 3
---

# Smart Objects

Data structures that combine persistence, AI capabilities, and auto-generation.

## Overview

Smart Objects in SMRT extend `BaseObject` with AI-powered methods:

- **🤖 AI Integration**: Built-in `do()` and `is()` methods
- **💾 Auto-Persistence**: Automatic database operations
- **🔗 Relationships**: Foreign key management
- **🎯 Type Safety**: Full TypeScript support

## BaseObject Foundation

```typescript
import { BaseObject } from '@have/smrt';

export class Product extends BaseObject {
  name: string = '';
  price: number = 0;
  category: string = '';
  description: string = '';

  // Automatic methods:
  // - save(), delete(), list(), get()
  // - do(), is() (when AI is configured)
}
```

## AI-Powered Methods

When connected to an AI client, Smart Objects gain powerful capabilities:

```typescript
const product = new Product({
  name: 'Wireless Headphones',
  description: 'High-quality Bluetooth headphones with noise cancellation'
});

// AI-powered analysis
const summary = await product.do('Create a marketing summary');
const isElectronics = await product.is('an electronics product');
const tags = await product.do('Generate 5 relevant tags');
```

## Auto-Generated Collections

```typescript
// Automatic collection methods
const products = await Product.list();
const electronics = await Product.list({
  where: { category: 'Electronics' }
});
const expensive = await Product.list({
  where: { price: { '>': 100 } }
});
```

*Full documentation coming soon...*