# @have/smrt: AI Agent Framework Package

## Purpose and Responsibilities

The `@have/smrt` package is the core framework for building vertical AI agents in the HAVE SDK. It integrates functionality from all other packages to provide:

- A coherent object model for AI agents with database persistence
- Collection-based management of objects
- Automatic schema generation and database table creation
- Standardized interfaces for AI interactions
- Utilities for working with different data sources

Despite its tongue-in-cheek name, this package is the central nervous system of the SDK, connecting database capabilities, file system operations, and AI model interactions.

## Key Concepts

### BaseClass

The foundation for all classes in the framework, providing:
- Initialization logic
- Access to AI client and database interfaces
- Shared utilities

### BaseObject

Extends BaseClass to represent individual entities that:
- Can be saved to a database
- Have unique identifiers (id, slug, etc.)
- Support property-based schema generation
- Include timestamps (created_at, updated_at)

### BaseCollection

Extends BaseClass to represent collections of objects that:
- Automatically set up database tables based on object schemas
- Provide CRUD operations for managing objects
- Support flexible querying with multiple operators
- Handle relationships between objects

## Key APIs

### Defining a Custom Object

```typescript
import { BaseObject } from '@have/smrt';

class Document extends BaseObject<any> {
  title: string = '';
  content: string = '';
  category: string = '';
  tags: string[] = [];
  isPriority: boolean = false;
  
  constructor(options: any) {
    super(options);
    // Copy properties from options to this instance
    Object.assign(this, options);
  }
  
  async summarize() {
    // Use AI to summarize the document
    if (this.options.ai && this.content) {
      return this.options.ai.textCompletion(
        `Summarize this document: ${this.content.substring(0, 2000)}`
      );
    }
    return null;
  }
}
```

### Defining a Collection

```typescript
import { BaseCollection } from '@have/smrt';
import { Document } from './document';

class DocumentCollection extends BaseCollection<Document> {
  static readonly _itemClass = Document;
  
  constructor(options: any) {
    super(options);
  }
  
  async findSimilar(documentId: string) {
    const document = await this.get(documentId);
    if (!document) return [];
    
    // Custom logic to find similar documents
    return this.list({
      where: { category: document.category },
      limit: 5
    });
  }
}
```

### Using Objects and Collections

```typescript
import { getAIClient } from '@have/ai';
import { getSqliteClient } from '@have/sql';
import { DocumentCollection } from './documentCollection';

async function main() {
  // Set up dependencies
  const ai = await getAIClient({ apiKey: 'your-api-key' });
  const db = await getSqliteClient({ filename: 'documents.db' });
  
  // Create and initialize collection
  const documents = new DocumentCollection({ ai, db });
  await documents.initialize();
  
  // Create and save an object
  const doc = await documents.create({
    title: 'Getting Started',
    content: 'This is a guide to getting started with the HAVE SDK...',
    category: 'Documentation'
  });
  await doc.save();
  
  // Query objects
  const docs = await documents.list({
    where: { category: 'Documentation' },
    limit: 10,
    orderBy: 'created_at DESC'
  });
  
  // Use AI capabilities
  const summary = await doc.summarize();
}
```

### Advanced Querying

```typescript
// Complex query example
const results = await collection.list({
  where: {
    'created_at >': '2023-01-01',
    'priority': 'high',
    'status in': ['pending', 'in-progress'],
    'title like': '%important%'
  },
  orderBy: ['priority DESC', 'created_at DESC'],
  limit: 20,
  offset: 0
});

// Count matching records
const count = await collection.count({
  where: { category: 'reports' }
});
```

## Internal Architecture

The package uses:
- Schema generation based on class properties
- SQLite triggers for automatic timestamp management
- A consistent pattern for database operations
- Integration with AI models via the `@have/ai` package

## Dependencies on Other Packages

`@have/smrt` depends on all other packages in the SDK:

- `@have/ai`: For AI model interactions
- `@have/files`: For file system operations
- `@have/pdf`: For PDF document processing
- `@have/sql`: For database operations
- `@have/spider`: For web content retrieval
- `@have/utils`: For utility functions

## Development Guidelines

### Extending the Framework

To extend the framework:

1. Create custom objects by extending `BaseObject`
2. Create custom collections by extending `BaseCollection`
3. Define properties on objects that will be persisted to the database
4. Implement custom methods that leverage AI capabilities when needed

### Database Schema Considerations

- Object properties define the database schema
- Initialize properties with default values in the constructor
- Use appropriate JavaScript types for proper schema generation
- Properties are converted to snake_case for database columns

### Testing

```bash
pnpm test        # Run tests once
pnpm test:watch  # Run tests in watch mode
```

### Building

```bash
pnpm build       # Build once
pnpm build:watch # Build in watch mode
```

### Best Practices

- Clearly define object schemas with appropriate defaults
- Use transactions for complex database operations
- Keep AI prompts clear and focused
- Handle failures gracefully, especially for AI and database operations
- Follow the collection pattern for managing groups of related objects
- Initialize properties in constructors to ensure proper schema generation

The `@have/smrt` package exemplifies the "fast and loose" approach mentioned in the README, prioritizing developer velocity while maintaining enough structure for consistent and reliable behavior.