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

### Defining Custom SMRT Objects with Custom Actions

```typescript
import { SmrtObject } from '@have/smrt';
import { Field } from '@have/smrt/fields';

@smrt({
  api: {
    include: ['list', 'get', 'create', 'update'],
    exclude: ['delete'] // Don't expose delete via REST API
  },
  mcp: {
    include: ['list', 'get', 'create', 'analyze', 'summarize', 'transform'],
    exclude: ['update', 'delete'] // AI can't modify or delete content
  },
  cli: true
})
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

  // Custom Action: AI-powered content analysis
  async analyze(options: any = {}) {
    if (this.ai && this.content) {
      const analysisType = options.type || 'general';
      const prompt = `Analyze this document for ${analysisType} insights: ${this.content.substring(0, 2000)}`;
      return {
        action: 'analyze',
        type: analysisType,
        results: await this.ai.message(prompt),
        wordCount: this.wordCount,
        timestamp: new Date()
      };
    }
    return { error: 'AI service not available' };
  }

  // Custom Action: Document summarization
  async summarize(options: any = {}) {
    if (this.ai && this.content) {
      const length = options.length || 'medium';
      const sentences = length === 'short' ? '1-2' : length === 'long' ? '4-5' : '2-3';
      return {
        action: 'summarize',
        summary: await this.ai.message(
          `Summarize this document in ${sentences} sentences: ${this.content.substring(0, 2000)}`
        ),
        length,
        timestamp: new Date()
      };
    }
    return null;
  }

  // Custom Action: Content transformation
  async transform(options: any = {}) {
    if (this.ai && options.instructions) {
      return {
        action: 'transform',
        original: this.content.substring(0, 500),
        transformed: await this.do(options.instructions),
        instructions: options.instructions,
        timestamp: new Date()
      };
    }
    throw new Error('Instructions required for content transformation');
  }

  // Smart content validation using AI
  async isValid(criteria: string) {
    return await this.is(criteria);
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

This automatically generates:
- **REST API endpoints**: `GET/POST /documents` (list, get, create, update)
- **MCP tools for AI**: `document_list`, `document_get`, `document_create`, `document_analyze`, `document_summarize`, `document_transform`
- **CLI commands**: `documents list`, `documents create`, `documents analyze`, etc.

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

The SMRT framework provides two Vite plugins for different use cases:

#### SMRT Plugin (for SMRT Object Creators)

Use `smrtPlugin` when creating SMRT objects in your project:

```typescript
// vite.config.js - For projects defining SMRT objects
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

#### Consumer Plugin (for SMRT Package Users)

Use `smrtConsumer` when consuming packages that contain SMRT objects:

```typescript
// vite.config.js - For projects consuming SMRT packages
import { smrtConsumer } from '@have/smrt/consumer-plugin';

export default {
  plugins: [
    smrtConsumer({
      packages: ['@my-org/products', '@my-org/content'], // SMRT packages to scan
      generateTypes: true,
      typesDir: 'src/types/smrt-generated',
      projectRoot: process.cwd(),
      disableScanning: false
    })
  ]
};

// Resolves virtual modules from consumed SMRT packages:
import { createClient } from '@smrt/client';       // Generated from consumed packages
import { setupRoutes } from '@smrt/routes';        // Combined routes from all packages
import type { ProductData } from '@smrt/types';    // Generated TypeScript types
```

#### Dual Plugin Usage

For projects that both define and consume SMRT objects:

```typescript
// vite.config.js - Using both plugins together
import { smrtPlugin } from '@have/smrt/vite-plugin';
import { smrtConsumer } from '@have/smrt/consumer-plugin';

export default {
  plugins: [
    // Generate from local SMRT objects
    smrtPlugin({
      include: ['src/lib/models/**/*.ts'],
      exclude: ['**/*.test.ts'],
      baseClasses: ['SmrtObject', 'SmrtCollection'],
      generateTypes: true,
      watch: true,
      hmr: true,
    }),
    // Consume external SMRT packages
    smrtConsumer({
      packages: ['@my-org/shared-models'],
      generateTypes: true,
      typesDir: 'src/types/smrt-generated',
    }),
  ]
};

// Access both local and external virtual modules:
import { setupRoutes as localRoutes } from '@smrt/routes';    // From local objects
import { createClient } from '@smrt/client';                   // Combined client
import type { LocalModel, ExternalModel } from '@smrt/types'; // All types
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

## Consumer Plugin for Downstream Projects

The `smrtConsumer` plugin enables projects to consume SMRT packages without defining their own SMRT objects. It automatically discovers and resolves virtual modules from installed SMRT packages.

### Consumer Plugin Options

```typescript
import { smrtConsumer, type SmrtConsumerOptions } from '@have/smrt/consumer-plugin';

interface SmrtConsumerOptions {
  /** SMRT packages to scan (e.g., ['@my-org/products', '@my-org/content']) */
  packages?: string[];
  /** Generate TypeScript declarations (default: true) */
  generateTypes?: boolean;
  /** Output directory for generated types (default: 'src/types/smrt-generated') */
  typesDir?: string;
  /** Project root path (default: process.cwd()) */
  projectRoot?: string;
  /** SvelteKit integration mode (default: false) */
  svelteKit?: boolean;
  /** Use static types only for federation builds (default: false) */
  staticTypes?: boolean;
  /** Disable file scanning (default: false) */
  disableScanning?: boolean;
}
```

### Automatic Package Discovery

The consumer plugin automatically scans `node_modules` for packages containing SMRT manifests:

```typescript
// Automatically finds and processes all installed SMRT packages
smrtConsumer({
  generateTypes: true,
  typesDir: 'src/types/smrt-generated'
})

// Or explicitly specify which packages to process
smrtConsumer({
  packages: ['@my-org/products', '@my-org/analytics'],
  generateTypes: true
})
```

### Generated Type Declarations

The plugin generates comprehensive TypeScript declarations for consumed SMRT packages:

```typescript
// Generated in src/types/smrt-generated/
├── smrt-client.d.ts      // API client interfaces
├── smrt-manifest.d.ts    // Manifest metadata
├── smrt-mcp.d.ts        // MCP tool definitions
├── smrt-routes.d.ts     // Route handler types
├── smrt-types.d.ts      // Object type definitions
└── smrt-objects.d.ts    // Individual object interfaces

// Auto-imported virtual modules:
import { createClient } from '@smrt/client';
import { setupRoutes } from '@smrt/routes';
import { tools } from '@smrt/mcp';
import type { ProductData, CategoryData } from '@smrt/types';
```

### Pre-build Type Generation

For projects requiring standalone TypeScript compilation (without Vite), use the pre-build system:

```bash
# Generate types before TypeScript compilation
npx smrt-prebuild generate-types ./manifest.json src/types

# Alternative using the main CLI
npx smrt generate-types ./manifest.json src/types

# Or via package.json script
{
  "scripts": {
    "prebuild": "smrt-prebuild generate-types ./static-manifest.js src/types/generated",
    "build": "npm run prebuild && tsc"
  }
}
```

### Federation and Library Builds

For module federation or library builds that require static types:

```typescript
smrtConsumer({
  packages: ['@my-org/shared-models'],
  staticTypes: true,        // Use static manifest only
  disableScanning: true,    // Skip dynamic scanning
  typesDir: 'src/types/smrt-static'
})
```

### Integration Patterns

#### SvelteKit Projects
```typescript
// vite.config.js for SvelteKit
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

#### Micro-frontend Architecture
```typescript
// Host application consuming multiple SMRT microservices
smrtConsumer({
  packages: [
    '@company/products-service',
    '@company/users-service',
    '@company/analytics-service'
  ],
  generateTypes: true,
  typesDir: 'src/types/microservices'
})

// Access combined APIs from all services
import { createClient } from '@smrt/client';
const client = createClient('/api/v1');

// Type-safe access to all service APIs
const products = await client.products.list();
const users = await client.users.list();
const analytics = await client.analytics.query({});
```

#### Library Development
```typescript
// Creating a library that extends SMRT functionality
smrtConsumer({
  packages: ['@have/smrt-core-models'],
  staticTypes: true,
  typesDir: 'src/types/core',
  disableScanning: true  // Faster builds for libraries
})
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

## Custom Action Configuration

The SMRT framework supports custom actions beyond standard CRUD operations (list, get, create, update, delete). Custom actions allow you to expose domain-specific methods as REST API endpoints, MCP tools for AI integration, and CLI commands.

### Configuration Options

```typescript
@smrt({
  api: {
    include: ['list', 'get', 'create', 'update', 'analyze', 'transform'],
    exclude: ['delete'] // Hide dangerous operations
  },
  mcp: {
    include: ['list', 'get', 'analyze', 'summarize', 'research'],
    exclude: ['create', 'update', 'delete'] // AI read-only access
  },
  cli: true // Enable all actions via CLI
})
class MyAgent extends SmrtObject {
  // Custom action methods
  async analyze(options: any = {}) {
    return {
      action: 'analyze',
      results: await this.performAnalysis(options),
      timestamp: new Date()
    };
  }

  async research(options: any = {}) {
    return {
      action: 'research',
      findings: await this.conductResearch(options.query),
      confidence: 0.85
    };
  }
}
```

### Generated Endpoints

For the configuration above, SMRT automatically generates:

**REST API Endpoints:**
- `GET /myagents` → list action
- `GET /myagents/:id` → get action
- `POST /myagents` → create action
- `PUT /myagents/:id` → update action
- `POST /myagents/:id/analyze` → **custom analyze action**
- `POST /myagents/:id/transform` → **custom transform action**

**MCP Tools for AI:**
- `myagent_list` → AI can list agents
- `myagent_get` → AI can get specific agents
- `myagent_analyze` → **AI can analyze agents**
- `myagent_summarize` → **AI can summarize agents**
- `myagent_research` → **AI can research topics**

**CLI Commands:**
- `myagents list` → list all agents
- `myagents get <id>` → get specific agent
- `myagents analyze <id>` → **run analysis**
- `myagents research --query="topic"` → **conduct research**

### Method Validation

SMRT automatically validates that custom action methods exist on your class:

```typescript
// ✅ Valid - method exists
@smrt({ mcp: { include: ['research'] } })
class Agent extends SmrtObject {
  async research(options: any) { /* implementation */ }
}

// ❌ Invalid - warns and skips
@smrt({ mcp: { include: ['nonexistent'] } })
class Agent extends SmrtObject {
  // Warning: Custom action 'nonexistent' specified but method not found
}
```

### Custom Action Arguments

Custom actions receive arguments from API calls, MCP tool calls, or CLI parameters:

```typescript
async analyze(options: any = {}) {
  // From REST API: POST /agents/123/analyze { "type": "detailed" }
  // From MCP: myagent_analyze with arguments { id: "123", options: { type: "detailed" } }
  // From CLI: agents analyze 123 --type detailed

  const analysisType = options.type || 'general';
  const criteria = options.criteria || [];

  return {
    action: 'analyze',
    type: analysisType,
    results: await this.performAnalysis(analysisType, criteria),
    timestamp: new Date()
  };
}
```

### Best Practices

**Method Design:**
- Always provide default values for options: `async method(options: any = {})`
- Return structured objects with action metadata
- Include timestamps for audit trails
- Handle errors gracefully with try/catch

**Security Considerations:**
- Use `exclude` to hide sensitive operations from AI access
- Validate input parameters within custom methods
- Implement proper authentication in generated APIs
- Consider rate limiting for expensive operations

**Documentation:**
- Add JSDoc comments to custom methods for auto-generated API docs
- Describe expected options and return formats
- Include usage examples in method comments

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