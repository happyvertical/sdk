# @have/smrt: AI Agent Framework Package

## Purpose and Responsibilities

The `@have/smrt` package is the core framework for building vertical AI agents in the HAVE SDK. It provides a comprehensive foundation for creating intelligent agents with persistent storage, cross-package integration, and automatic code generation capabilities:

### Core Framework Architecture
- **Object-Relational Mapping**: Automatic schema generation from TypeScript class properties
- **AI-First Design**: Native integration with multiple AI providers via `@have/ai`
- **Collection Management**: Standardized CRUD operations with advanced querying
- **Cross-Package Integration**: Unified access to all HAVE SDK capabilities

### Advanced Code Generation
- **CLI Generators**: Create administrative command-line tools from SMRT objects
- **REST API Generators**: Auto-generate complete REST APIs with OpenAPI documentation
- **MCP Server Generators**: Generate Model Context Protocol servers for AI integration
- **Vite Plugin Integration**: Automatic service generation during development

### Runtime Environment Support
- **Universal Deployment**: Node.js server environments and browser/edge runtimes
- **AST Scanning**: Automatic discovery of SMRT objects in codebases
- **Virtual Module System**: Dynamic code generation through Vite plugins
- **Type Safety**: Automatic TypeScript declaration generation

**Expert Agent Expertise**: When working with this package, always proactively check the latest documentation using WebFetch for foundational libraries (@langchain/community, cheerio, yaml) as they frequently add new features that can enhance agent capabilities. Recent updates include:
- **@langchain/community**: Advanced retrieval strategies, multimodal tool calling, streaming events, and LangGraph for stateful multi-actor applications
- **cheerio**: Blazingly fast HTML parsing with jQuery-like syntax for server-side content processing
- **yaml**: Full YAML 1.1/1.2 support with AST manipulation and custom tag resolution for flexible configuration management

The SMRT framework is designed to leverage the latest capabilities from its dependencies for optimal agent performance.

## Key Concepts

### SmrtClass

The foundation for all classes in the framework, providing:
- Initialization logic
- Access to AI client and database interfaces
- Shared utilities

### SmrtObject

Extends SmrtClass to represent individual entities that:
- Can be saved to a database
- Have unique identifiers (id, slug, etc.)
- Support property-based schema generation
- Include timestamps (created_at, updated_at)

### SmrtCollection

Extends SmrtClass to represent collections of objects that:
- Automatically set up database tables based on object schemas
- Provide CRUD operations for managing objects
- Support flexible querying with multiple operators
- Handle relationships between objects

## Key APIs

### Defining Custom SMRT Objects

```typescript
import { SmrtObject } from '@have/smrt';
import { Field } from '@have/smrt/fields';

class Document extends SmrtObject<any> {
  // Schema properties with Field definitions
  title: string = '';
  content: string = '';
  category: string = '';
  tags: string[] = [];
  isPriority: boolean = false;
  wordCount: number = 0;
  
  constructor(options: any) {
    super(options);
    Object.assign(this, options);
  }
  
  // AI-powered content analysis
  async summarize() {
    if (this.ai && this.content) {
      return await this.ai.message(
        `Summarize this document in 2-3 sentences: ${this.content.substring(0, 2000)}`
      );
    }
    return null;
  }
  
  // Smart content validation using AI
  async isValid(criteria: string) {
    return await this.is(criteria);
  }
  
  // AI-driven content transformation
  async transform(instructions: string) {
    return await this.do(instructions);
  }
  
  // Lifecycle hooks
  async beforeSave() {
    this.wordCount = this.content.split(/\s+/).length;
    if (!this.slug && this.title) {
      this.slug = await this.getSlug();
    }
  }
}
```

### Advanced Collection Management

```typescript
import { SmrtCollection } from '@have/smrt';
import { Document } from './document';

class DocumentCollection extends SmrtCollection<Document> {
  static readonly _itemClass = Document;
  
  // Advanced querying with AI assistance
  async findSimilar(documentId: string, threshold: number = 0.8) {
    const document = await this.get(documentId);
    if (!document) return [];
    
    // Use vector similarity or AI-based classification
    return this.list({
      where: { 
        category: document.category,
        'wordCount >': document.wordCount * 0.5,
        'wordCount <': document.wordCount * 1.5
      },
      limit: 5,
      orderBy: 'created_at DESC'
    });
  }
  
  // Bulk operations with AI processing
  async bulkAnalyze(criteria: string) {
    const documents = await this.list({ limit: 100 });
    const results = await Promise.all(
      documents.map(async (doc) => ({
        id: doc.id,
        title: doc.title,
        meetscriteria: await doc.isValid(criteria)
      }))
    );
    return results.filter(r => r.meetsCategories);
  }
  
  // Advanced filtering with AI
  async searchBySemantics(query: string) {
    // Use AI to enhance search beyond simple text matching
    const allDocs = await this.list({});
    const relevantDocs = [];
    
    for (const doc of allDocs) {
      const relevance = await doc.do(`Rate the relevance of this content to "${query}" on a scale of 1-10. Respond with only the number.`);
      if (parseInt(relevance) >= 7) {
        relevantDocs.push(doc);
      }
    }
    
    return relevantDocs;
  }
}
```

### Code Generation and Automation

```typescript
import { CLIGenerator, APIGenerator, MCPGenerator } from '@have/smrt/generators';
import { DocumentCollection } from './documentCollection';

// Generate CLI tools automatically
const cliGenerator = new CLIGenerator({
  collections: [DocumentCollection],
  outputDir: './cli',
  includeAI: true
});

await cliGenerator.generate();
// Creates: ./cli/documents-cli.js with CRUD operations

// Generate REST API server
const apiGenerator = new APIGenerator({
  collections: [DocumentCollection],
  outputDir: './api',
  includeSwagger: true,
  middleware: ['auth', 'validation']
});

await apiGenerator.generate();
// Creates: ./api/documents-routes.js with full REST endpoints

// Generate MCP server for AI integration
const mcpGenerator = new MCPGenerator({
  collections: [DocumentCollection],
  outputDir: './mcp',
  tools: ['list', 'get', 'create', 'update', 'delete', 'search']
});

await mcpGenerator.generate();
// Creates: ./mcp/documents-mcp-server.js for Claude/AI integration
```

### Vite Plugin Integration

```typescript
// vite.config.js
import { smrtPlugin } from '@have/smrt/vite-plugin';

export default {
  plugins: [
    smrtPlugin({
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      generateTypes: true,
      hmr: true,
      baseClasses: ['SmrtObject', 'SmartObject']
    })
  ]
};

// Auto-generated virtual modules available:
import { setupRoutes } from '@smrt/routes';        // REST routes
import { createClient } from '@smrt/client';       // API client
import { tools } from '@smrt/mcp';                 // MCP tools
import { manifest } from '@smrt/manifest';         // Object manifest
```

### Advanced Querying and Relationships

```typescript
// Complex queries with multiple operators
const results = await collection.list({
  where: {
    'created_at >': '2023-01-01',
    'wordCount >=': 1000,
    'category in': ['research', 'analysis'],
    'title like': '%AI%',
    'isPriority': true
  },
  orderBy: ['wordCount DESC', 'created_at DESC'],
  limit: 20,
  offset: 0
});

// Relationship management
class Author extends SmrtObject<any> {
  name: string = '';
  email: string = '';
  
  async getDocuments() {
    const docCollection = new DocumentCollection(this.options);
    return docCollection.list({
      where: { authorId: this.id }
    });
  }
}

// Cross-collection operations
const authorDocs = await author.getDocuments();
const summaries = await Promise.all(
  authorDocs.map(doc => doc.summarize())
);
```

### AI-Powered Object Operations

```typescript
// Use built-in AI methods for smart operations
const document = await documents.get('doc-123');

// Validate against complex criteria
const isHighQuality = await document.is(`
  - Contains more than 1000 words
  - Has clear structure with headings
  - Includes references or citations
  - Uses professional language
`);

// Transform content based on instructions
const summary = await document.do(`
  Create a 3-sentence executive summary of this document.
  Focus on key findings and actionable insights.
  Use business-appropriate language.
`);

// Batch AI operations
const qualityCheck = await documents.bulkAnalyze(`
  Document meets publication standards:
  - Proper grammar and spelling
  - Clear argument structure
  - Adequate supporting evidence
`);
```

## Internal Architecture

The package uses:
- Schema generation based on class properties
- SQLite triggers for automatic timestamp management
- A consistent pattern for database operations
- Integration with AI models via the `@have/ai` package

## Dependencies

The SMRT framework integrates with multiple packages to provide comprehensive agent capabilities:

### Internal HAVE SDK Dependencies
- **@have/ai**: AI model interactions and completions across multiple providers
- **@have/files**: File system operations and content management
- **@have/pdf**: PDF document processing and text extraction
- **@have/sql**: Database operations with SQLite and PostgreSQL support
- **@have/spider**: Web content extraction and processing
- **@have/utils**: Shared utility functions and type definitions

### External Dependencies
- **@langchain/community**: Third-party integrations for LLM applications
  - Tools, chains, and retrieval strategies
  - Modular building blocks for AI applications
  - Extensive ecosystem integrations
- **cheerio**: Server-side HTML parsing and manipulation
  - jQuery-like syntax for content processing
  - Blazingly fast HTML/XML parsing
  - Removes browser inconsistencies for clean server-side processing
- **yaml**: Configuration management and data serialization
  - Full YAML 1.1 and 1.2 standard support
  - AST manipulation capabilities
  - Schema flexibility with custom tags

## Development Guidelines

### Framework Architecture Patterns

**Object-Relational Mapping**
- Properties automatically generate database schema with TypeScript types
- Use Field decorators for advanced schema configuration
- Implement lifecycle hooks (beforeSave, afterDelete) for data validation
- Leverage automatic timestamp management and indexing

**AI-First Development**
- Design objects with AI interaction as primary consideration
- Use built-in `is()` and `do()` methods for intelligent operations
- Implement semantic search and content analysis methods
- Cache AI responses for performance optimization

**Collection Patterns**
- Use collections for standardized CRUD operations
- Implement custom query methods for domain-specific searches
- Apply bulk operations for efficiency at scale
- Design relationships through collection methods

### Code Generation Workflows

**CLI Development**
```bash
# Generate CLI tools from SMRT objects
import { CLIGenerator } from '@have/smrt/generators';
const generator = new CLIGenerator({
  collections: [MyCollection],
  outputDir: './cli'
});
await generator.generate();
```

**API Generation**
```bash
# Create REST APIs with OpenAPI documentation
import { APIGenerator } from '@have/smrt/generators';
const generator = new APIGenerator({
  collections: [MyCollection],
  includeSwagger: true,
  middleware: ['auth', 'validation']
});
await generator.generate();
```

**MCP Server Generation**
```bash
# Generate Model Context Protocol servers
import { MCPGenerator } from '@have/smrt/generators';
const generator = new MCPGenerator({
  collections: [MyCollection],
  tools: ['list', 'search', 'analyze']
});
await generator.generate();
```

### Runtime Environment Considerations

**Universal Deployment**
- Use conditional imports for Node.js vs browser environments
- Leverage static manifests for client-side builds
- Implement proper error handling for missing dependencies
- Design for both SSR and CSR scenarios

**Performance Optimization**
- Use database indexes for frequently queried fields
- Implement pagination for large datasets
- Cache AI responses and computed values
- Apply lazy loading for related objects

**Schema Evolution**
- Plan for database migrations with schema changes
- Use backward-compatible field additions
- Implement proper validation for data integrity
- Handle legacy data gracefully

### Testing Strategies

```bash
bun test                    # Run all tests
bun test --watch           # Watch mode for development
bun test:integration       # Integration tests with dependencies
bun test:generators        # Test code generation functionality
```

**Testing Patterns**
- Mock AI responses for consistent testing
- Use in-memory databases for unit tests
- Test generated code with actual runtime scenarios
- Validate schema generation and migration scripts

### Building and Development

```bash
bun run build             # Production build
bun run build:watch       # Development watch mode
bun run dev               # Combined build and test watch
bun run clean             # Clean build artifacts
bun run docs              # Generate API documentation
```

### Agent Framework Best Practices

**Object Design**
- Initialize all properties with appropriate defaults
- Use descriptive property names that generate good schemas
- Implement domain-specific validation logic
- Design for AI interaction patterns

**Collection Management**
- Keep collections focused on single entity types
- Implement efficient querying with proper indexing
- Use bulk operations for performance at scale
- Design clear relationships between objects

**AI Integration**
- Write clear, specific prompts for consistent results
- Implement proper error handling for AI failures
- Use structured response formats when possible
- Cache expensive AI operations appropriately

**Cross-Package Integration**
- Leverage @have/spider for content ingestion
- Use @have/pdf for document processing workflows
- Integrate @have/files for asset management
- Apply @have/sql for complex querying needs

**Code Generation**
- Use AST scanning for automatic service discovery
- Implement proper TypeScript declaration generation
- Design for hot module replacement in development
- Generate comprehensive API documentation

### Expert Agent Development

When building agents with the SMRT framework:

1. **Design AI-First**: Plan object methods with AI capabilities in mind
2. **Use Code Generation**: Leverage generators for boilerplate reduction
3. **Implement Proper Schema**: Design database schemas for efficient querying
4. **Plan for Scale**: Use collections and bulk operations for large datasets
5. **Test Thoroughly**: Validate both generated code and runtime behavior
6. **Monitor Performance**: Track AI usage and database query efficiency

## API Documentation

The @have/smrt package generates comprehensive API documentation in both HTML and markdown formats using TypeDoc:

### Generated Documentation Formats

**HTML Documentation** (recommended for browsing):
- Generated in `docs/` directory for public website
- Full API reference with interactive navigation
- Cross-linked type definitions and examples
- Accessible via development server at `http://localhost:3030/`

**Markdown Documentation** (great for development):
- Generated in `packages/smrt/docs/` directory
- Markdown format perfect for IDE integration
- Accessible via development server at `http://localhost:3030/packages/smrt/`

### Generating Documentation

```bash
# Generate documentation for this package
npm run docs

# Generate and watch for changes during development
npm run docs:watch

# Start development server to browse documentation
npm run dev  # Serves docs at http://localhost:3030
```

### Development Workflow

Documentation is automatically generated during the build process and can be viewed alongside development:

1. **During Development**: Use `npm run docs:watch` to regenerate docs as you code
2. **Local Browsing**: Access HTML docs at `http://localhost:3030/` or markdown at `http://localhost:3030/packages/smrt/`
3. **IDE Integration**: Point your editor to `packages/smrt/docs/` for offline markdown reference

The documentation includes complete API coverage, usage examples, and cross-references to related HAVE SDK packages.

## Documentation Links

Always reference the latest documentation when developing AI agents with the SMRT framework, as foundational libraries frequently add new features that can enhance agent capabilities:

### Core Agent Libraries
- **@langchain/community**: [LangChain.js Documentation](https://js.langchain.com/docs/introduction/)
  - Third-party integrations for LLM applications
  - Tools, chains, and retrieval strategies for building stateful agents
  - Check for new modules and platform integrations regularly

- **cheerio**: [Official Documentation](https://cheerio.js.org/)
  - Server-side jQuery implementation for HTML processing
  - Review for new selectors, traversal methods, and parsing optimizations
  - Essential for web content processing in agent workflows

- **yaml**: [Documentation](https://eemeli.org/yaml/)
  - YAML parsing and manipulation with AST support
  - Monitor for schema enhancements and parsing improvements
  - Critical for configuration management in agent deployments

### HAVE SDK Integration Points
- **@have/ai**: AI model interactions and completions
- **@have/files**: File system operations and content management
- **@have/pdf**: PDF processing and document analysis
- **@have/sql**: Database operations and schema management
- **@have/spider**: Web content extraction and processing
- **@have/utils**: Utility functions and type definitions

### Expert Agent Instructions

When working with @have/smrt:

1. **Always check latest documentation** before implementing agent solutions using WebFetch tool
2. **Stay current with framework updates** - agent frameworks evolve rapidly with new AI capabilities
3. **Review new code generation features** that could improve development workflow
4. **Check for breaking changes** in major version updates across dependencies
5. **Look for new AI integration patterns** and cross-package capabilities
6. **Monitor performance improvements** in database operations and AI processing

### Documentation Lookup Protocol

Before implementing solutions, use WebFetch to verify current capabilities:

**Core Libraries to Check**:
- **@langchain/community**: https://js.langchain.com/docs/introduction/
  - Monitor for new tools, chains, retrieval strategies
  - Check for LangGraph updates (stateful multi-actor applications)
  - Look for streaming and multimodal capabilities
- **cheerio**: https://cheerio.js.org/
  - Review for new selectors and traversal methods
  - Check parsing performance improvements
  - Monitor jQuery compatibility updates
- **yaml**: https://eemeli.org/yaml/
  - Check for schema enhancements
  - Review AST manipulation features
  - Monitor custom tag resolution improvements

**Verification Workflow**:
```typescript
// Before implementing agent solutions, verify current best practices
await WebFetch.get('https://js.langchain.com/docs/introduction/',
  'What new LangChain.js features would enhance AI agent development?');
await WebFetch.get('https://cheerio.js.org/',
  'What are the latest Cheerio features for HTML content processing?');
await WebFetch.get('https://eemeli.org/yaml/',
  'What new YAML parsing features support agent configuration?');
```

### Agent Framework Resources

The SMRT package serves as the central orchestrator for building intelligent agents that leverage:
- **Persistent object storage** with automatic schema generation
- **AI-powered operations** through built-in methods
- **Code generation tools** for rapid prototyping and deployment
- **Cross-package integration** for comprehensive agent capabilities
- **Runtime flexibility** across server and browser environments

This framework enables rapid development of vertical AI agents while maintaining production-ready scalability and performance.