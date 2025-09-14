# @have/smrt

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Core library for building AI agents with standardized collections and objects in the HAVE SDK.

## Overview

The `@have/smrt` package provides the foundation for building vertical AI agents. It integrates all other HAVE SDK packages into a cohesive framework with standardized collections, object models, and persistence capabilities.

## Features

- Agent framework with built-in AI model integration
- Object-relational mapping with automatic database persistence
- Standardized collections with CRUD operations
- Context-aware object identification (by id, slug, name, or title)
- Built-in support for database operations, file handling, and web interactions
- Extensible plugin architecture
- Efficient resource management

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

### Creating an Agent

```typescript
import { Agent } from '@have/smrt';
import { OpenAIModel } from '@have/ai';

// Create a new agent
const agent = new Agent({
  model: new OpenAIModel({ 
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4-turbo'
  }),
  tools: [
    // Add tools as needed
  ]
});

// Run a task with the agent
const result = await agent.run('Research the latest developments in quantum computing');
console.log(result);
```

### Working with Smart Objects

```typescript
import { SmartObject, initializeDatabase } from '@have/smrt';

// Initialize the database
await initializeDatabase({
  file: 'my-database.sqlite', // Use SQLite
  // Or for PostgreSQL:
  // host: 'localhost',
  // port: 5432,
  // database: 'my_database',
  // user: 'username',
  // password: 'password'
});

// Define a smart object class
class Article extends SmartObject {
  title: string;
  content: string;
  author: string;
  publishedDate: Date;
  
  constructor(data: Partial<Article>) {
    super();
    Object.assign(this, data);
  }
}

// Create and save an article
const article = new Article({
  title: 'Understanding TypeScript',
  content: 'TypeScript is a superset of JavaScript that adds...',
  author: 'Jane Doe',
  publishedDate: new Date()
});

await article.save();

// Retrieve an article by title
const retrievedArticle = await Article.findByTitle('Understanding TypeScript');
console.log(retrievedArticle);

// Or by id
const articleById = await Article.findById(article.id);
console.log(articleById);
```

### Using Collections

```typescript
import { Collection } from '@have/smrt';
import { Article } from './article';

// Create a collection of articles
const articles = new Collection<Article>('articles');

// Add filtering capabilities
const recentArticles = await articles.find({
  author: 'Jane Doe',
  publishedDate: { $gt: new Date('2023-01-01') }
});

// Sort articles
const sortedArticles = await articles.find({}, {
  sort: { publishedDate: 'desc' },
  limit: 10
});

console.log(sortedArticles);
```

## API Reference

See the [API documentation](https://happyvertical.github.io/sdk/modules/_have_smrt.html) for detailed information on all available methods and options.

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.