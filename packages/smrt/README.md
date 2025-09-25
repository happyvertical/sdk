# @have/smrt

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Core AI agent framework with standardized collections, object-relational mapping, and code generators in the HAVE SDK.

## Overview

The `@have/smrt` package provides the foundation for building vertical AI agents. It offers a comprehensive framework with object-relational mapping, AI-powered operations, code generation capabilities, and seamless integration with other HAVE SDK packages.

## Key Features

- **AI-First Object Framework**: Objects with built-in AI operations (`is()`, `do()` methods)
- **Object-Relational Mapping**: Automatic database schema generation from TypeScript classes
- **Standardized Collections**: Advanced CRUD operations with flexible querying
- **Code Generation**: CLI tools, REST APIs, and MCP servers generated from objects
- **Field System**: Type-safe field definitions with validation and constraints
- **Vite Plugin Integration**: Virtual modules for automatic service generation
- **AST Scanning**: Automatic discovery of SMRT objects in codebases
- **Cross-Package Integration**: Unified access to AI, files, database, and web capabilities

## Installation

```bash
# Install with npm
npm install @have/smrt

# Or with yarn
yarn add @have/smrt

# Or with bun
bun add @have/smrt
```

## Usage

### Define SMRT Objects with Fields

```typescript
import { SmrtObject } from '@have/smrt';
import { text, integer, boolean, datetime } from '@have/smrt/fields';

// Define a document object with typed fields
class Document extends SmrtObject {
  title = text({ required: true, maxLength: 200 });
  content = text({ required: true });
  wordCount = integer({ min: 0, default: 0 });
  isPublished = boolean({ default: false });
  publishedAt = datetime();

  constructor(options: any = {}) {
    super(options);
    Object.assign(this, options);
  }

  // AI-powered content validation
  async isHighQuality() {
    return await this.is(`
      - Contains more than 500 words
      - Has clear structure and headings
      - Uses professional language
    `);
  }

  // AI-powered content transformation
  async generateSummary() {
    return await this.do(`
      Create a 2-sentence summary of this document.
      Focus on the key points and main conclusions.
    `);
  }
}
```

### Create and Manage Collections

```typescript
import { SmrtCollection } from '@have/smrt';

class DocumentCollection extends SmrtCollection<Document> {
  static readonly _itemClass = Document;

  constructor(options: any = {}) {
    super({
      db: { url: 'documents.sqlite', type: 'sqlite' },
      ai: { provider: 'openai', apiKey: process.env.OPENAI_API_KEY },
      ...options
    });
  }

  // Custom query methods
  async findPublished() {
    return this.list({
      where: { isPublished: true },
      orderBy: 'publishedAt DESC'
    });
  }

  // Advanced filtering with AI
  async findByQuality(qualityCriteria: string) {
    const docs = await this.list({});
    const qualityDocs = [];

    for (const doc of docs) {
      if (await doc.is(qualityCriteria)) {
        qualityDocs.push(doc);
      }
    }

    return qualityDocs;
  }
}
```

### Initialize and Use the System

```typescript
// Create collection instance
const documents = new DocumentCollection();
await documents.initialize();

// Create and save a document
const doc = documents.create({
  title: 'AI Agent Development Guide',
  content: 'This guide covers the fundamentals of building AI agents...',
  wordCount: 1250
});
await doc.save();

// Advanced querying with operators
const recentDocs = await documents.list({
  where: {
    'wordCount >': 1000,
    'publishedAt >': '2024-01-01',
    'title like': '%AI%'
  },
  limit: 10,
  orderBy: ['wordCount DESC', 'publishedAt DESC']
});

// Use AI-powered operations
const isQuality = await doc.isHighQuality();
const summary = await doc.generateSummary();
```

## Code Generation

Generate CLI tools, REST APIs, and MCP servers automatically from your SMRT objects:

### CLI Generation

```typescript
import { CLIGenerator } from '@have/smrt/generators';

const generator = new CLIGenerator({
  collections: [DocumentCollection],
  outputDir: './cli',
  includeAI: true
});

await generator.generate();
// Creates: ./cli/documents-cli.js with full CRUD operations
```

### REST API Generation

```typescript
import { APIGenerator } from '@have/smrt/generators';

const generator = new APIGenerator({
  collections: [DocumentCollection],
  outputDir: './api',
  includeSwagger: true,
  middleware: ['auth', 'validation']
});

await generator.generate();
// Creates: ./api/documents-routes.js with OpenAPI documentation
```

### MCP Server Generation

```typescript
import { MCPGenerator } from '@have/smrt/generators';

const generator = new MCPGenerator({
  collections: [DocumentCollection],
  outputDir: './mcp',
  tools: ['list', 'get', 'create', 'update', 'delete', 'search']
});

await generator.generate();
// Creates: ./mcp/documents-mcp-server.js for AI model integration
```

## Vite Plugin Integration

Use the Vite plugin for automatic service generation during development:

```typescript
// vite.config.js
import { smrtPlugin } from '@have/smrt/vite-plugin';

export default {
  plugins: [
    smrtPlugin({
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      generateTypes: true,
      hmr: true
    })
  ]
};

// Access virtual modules in your code:
import { setupRoutes } from '@smrt/routes';        // REST routes
import { createClient } from '@smrt/client';       // API client
import { tools } from '@smrt/mcp';                 // MCP tools
import { manifest } from '@smrt/manifest';         // Object manifest
```

## Field Types

The field system provides type-safe database schema generation:

```typescript
import {
  text, integer, decimal, boolean, datetime, json,
  foreignKey, oneToMany, manyToMany
} from '@have/smrt/fields';

class Product extends SmrtObject {
  name = text({ required: true, maxLength: 100 });
  price = decimal({ min: 0, required: true });
  inStock = boolean({ default: true });
  tags = json({ default: [] });
  createdAt = datetime({ required: true });

  // Relationships
  categoryId = foreignKey(Category, { onDelete: 'restrict' });
  reviews = oneToMany(Review);
  relatedProducts = manyToMany(Product);
}
```

## Advanced Querying

Collections support flexible querying with multiple operators:

```typescript
const results = await collection.list({
  where: {
    'price >': 10,              // Greater than
    'price <=': 100,            // Less than or equal
    'name like': '%widget%',    // Pattern matching
    'category in': ['A', 'B'],  // IN operator
    'active': true,             // Equals (default)
    'deleted_at !=': null       // Not equals
  },
  orderBy: ['price DESC', 'name ASC'],
  limit: 20,
  offset: 0
});

// Count records with same filtering
const total = await collection.count({
  where: { 'price >': 50 }
});
```

## Cross-Package Integration

SMRT integrates seamlessly with other HAVE SDK packages:

```typescript
// With @have/spider for web content
import { SpiderAdapter } from '@have/spider';

class WebDocument extends SmrtObject {
  url = text({ required: true });
  content = text();

  async scrapeContent() {
    const spider = new SpiderAdapter(this.options.spider);
    this.content = await spider.getTextContent(this.url);
    await this.save();
  }
}

// With @have/pdf for document processing
import { PDFProcessor } from '@have/pdf';

class PDFDocument extends SmrtObject {
  filePath = text({ required: true });
  extractedText = text();

  async extractText() {
    const pdf = new PDFProcessor(this.options.pdf);
    this.extractedText = await pdf.extractText(this.filePath);
    await this.save();
  }
}

// With @have/files for file management
class FileDocument extends SmrtObject {
  async saveToFile(filename: string) {
    await this.fs.writeText(filename, this.content);
  }
}
```

## Error Handling

SMRT provides comprehensive error handling with specific error types:

```typescript
import { ValidationError, DatabaseError, RuntimeError } from '@have/smrt';

try {
  await document.save();
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Validation failed:', error.field, error.value);
  } else if (error instanceof DatabaseError) {
    console.log('Database error:', error.operation, error.sql);
  } else if (error instanceof RuntimeError) {
    console.log('Runtime error:', error.operation, error.target);
  }
}
```

## API Reference

See the [API documentation](https://happyvertical.github.io/sdk/modules/_have_smrt.html) for detailed information on all available methods and options.

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.