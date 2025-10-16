# Happy Vertical SDK

<p align="center">
  <img src="./smrt-homer.png" alt="SMRT Framework" width="400">
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Build powerful AI agents in TypeScript with the [SMRT framework](https://github.com/happyvertical/smrt). Define your business logic once and get REST APIs, AI tools, and CLI commands automatically generated.

> **Note**: The SMRT framework has been split into its own repository at [github.com/happyvertical/smrt](https://github.com/happyvertical/smrt). This SDK now provides infrastructure packages that work alongside SMRT for building complete AI agent applications.

## Quick Start

```bash
bun add @have/smrt @have/ai
```

## Define a Product

### Simple Definition

```typescript
import { BaseObject, smrt } from '@have/smrt';

@smrt()
export class Product extends BaseObject {
  name: string = '';
  description: string = '';
  price: number = 0;
  category: string = '';
}
```

### With Auto-Generated Features

```typescript
import { BaseObject, smrt } from '@have/smrt';

@smrt({
  api: {
    include: ['list', 'get', 'create', 'update']  // Auto-generates REST endpoints
  },
  mcp: {
    include: ['list', 'get', 'search']           // Auto-generates AI tools
  },
  cli: true                                      // Auto-generates CLI commands
})
export class Product extends BaseObject {
  name: string = '';
  description: string = '';
  price: number = 0;
  category: string = '';
  manufacturer: string = '';
  specifications: Record<string, any> = {};
  tags: string[] = [];

  // AI-powered business logic
  async summarize(): Promise<string> {
    return await this.do(`Create a brief summary of this product: ${this.name} - ${this.description}`);
  }

  async isCompatibleWith(other: Product): Promise<boolean> {
    return await this.is(`compatible with ${other.name} based on specifications and category`);
  }
}
```

That's it. Your `Product` class now automatically provides:
- **REST API** endpoints at `/api/products/*`
- **AI Tools** for Claude/GPT to manipulate products
- **CLI Commands** like `bun product create --name "Widget"`
- **Database persistence** with automatic schema generation
- **Type-safe operations** across all interfaces

## Using SMRT Packages

If you're consuming existing SMRT packages (rather than creating your own objects), use the consumer plugin:

```bash
bun add @my-org/products  # A package containing SMRT objects
```

```typescript
// vite.config.js
import { smrtConsumer } from '@have/smrt/consumer-plugin';

export default {
  plugins: [
    smrtConsumer({
      packages: ['@my-org/products'],  // Auto-discovers SMRT packages
      generateTypes: true,
      typesDir: 'src/types/smrt-generated'
    })
  ]
};

// Use auto-generated client and types
import { createClient } from '@smrt/client';
import type { ProductData } from '@smrt/types';

const client = createClient('/api/v1');
const products: ProductData[] = await client.products.list();
```

This automatically provides:
- **Type-safe API client** for all SMRT objects in consumed packages
- **TypeScript declarations** for virtual `@smrt/*` modules
- **Unified interface** across multiple SMRT packages

## Architecture

The SDK is organized into two main categories:

### SMRT Framework (External Dependency)
The [SMRT framework](https://github.com/happyvertical/smrt) provides the core agent capabilities:
- **[@have/smrt](https://github.com/happyvertical/smrt)** - Core framework with agents, smart objects, and code generation
- **[@have/ai](https://github.com/happyvertical/smrt)** - Multi-provider AI client (OpenAI, Anthropic, Google, AWS)
- **[@have/files](https://github.com/happyvertical/smrt)** - File system operations and utilities
- **[@have/sql](https://github.com/happyvertical/smrt)** - Database operations for SQLite, Postgres, and DuckDB
- **[@have/utils](https://github.com/happyvertical/smrt)** - Shared utilities and helpers
- **[@have/logger](https://github.com/happyvertical/smrt)** - Logging infrastructure
- **[@have/types](https://github.com/happyvertical/smrt)** - Shared TypeScript type definitions

### Infrastructure Packages (This SDK)
Infrastructure packages that extend SMRT capabilities:

| Package | Purpose |
|---------|---------|
| **[@have/cache](./packages/cache/)** | Caching utilities and abstractions |
| **[@have/config](./packages/config/)** | Configuration management |
| **[@have/documents](./packages/documents/)** | Document processing and management |
| **[@have/geo](./packages/geo/)** | Geographic utilities and services |
| **[@have/translator](./packages/translator/)** | Translation services integration |
| **[@have/ocr](./packages/ocr/)** | Optical Character Recognition providers |
| **[@have/pdf](./packages/pdf/)** | PDF parsing and text extraction |
| **[@have/spider](./packages/spider/)** | Web crawling and content extraction |

### SMRT Modules (Domain Models)
Domain-specific modules built on the SMRT framework:

| Module | Purpose |
|--------|---------|
| **[@have/agents](./packages/modules/agents/)** | Agent management system |
| **[@have/tags](./packages/modules/tags/)** | Tagging system with hierarchies and contexts |
| **[@have/places](./packages/modules/places/)** | Places and location management |
| **[@have/profiles](./packages/modules/profiles/)** | User profile management with relationships |
| **[@have/events](./packages/modules/events/)** | Event management and scheduling |
| **[@have/assets](./packages/modules/assets/)** | Asset management with versioning |
| **[@have/accounts](./packages/modules/accounts/)** | Account management system |
| **[@have/gnode](./packages/modules/gnode/)** | Federation module for distributed knowledge bases |
| **[@have/content](./packages/modules/content/)** | Content processing for documents and media |
| **[@have/products](./packages/modules/products/)** | Product catalog and microservice template |

## MCP Server for Claude Desktop

The SDK includes an MCP (Model Context Protocol) server that provides AI-powered development tools for building SMRT applications.

### Quick Setup for Projects Using the SDK

1. **Install the SDK** in your project:
   ```bash
   npm install @have/sdk
   ```

2. **Copy the bridge script**:
   ```bash
   cp node_modules/@have/sdk/scripts/mcp-smrt.sh ./scripts/
   chmod +x ./scripts/mcp-smrt.sh
   ```

3. **Configure Claude Desktop** with `.claude/mcp-config.json`:
   ```json
   {
     "mcpServers": {
       "smrt-dev-server": {
         "command": "./scripts/mcp-smrt.sh",
         "args": [],
         "env": {
           "NODE_ENV": "development",
           "PROJECT_ROOT": "/absolute/path/to/your/project"
         }
       }
     }
   }
   ```

4. **Test and start**:
   ```bash
   ./scripts/mcp-smrt.sh verify
   # Restart Claude Desktop
   ```

### Available Tools

Once configured, Claude will have access to:

- **generate-smrt-class**: Create complete SMRT objects with decorators
- **add-ai-methods**: Add AI-powered methods (do, is, describe)
- **validate-smrt-object**: Check code structure and best practices
- **preview-api-endpoints**: See generated REST API structure
- **configure-decorators**: Set up @smrt decorator options
- And many more development tools...

### Usage Examples

**Create a new SMRT object:**
> "Create a Product object for e-commerce with name, price, description, and inventory tracking."

**Add AI capabilities:**
> "Add AI methods to analyze product quality and generate descriptions."

**Get documentation:**
> "How do I use foreign key relationships in SMRT?"

For detailed setup instructions and troubleshooting, see [claude-desktop-setup.md](./claude-desktop-setup.md).

## Documentation

Full documentation available at [https://happyvertical.github.io/sdk/](https://happyvertical.github.io/sdk/)

## Development

```bash
# Install dependencies
pnpm install

# Run tests
npm test

# Build packages
npm run build

# Development mode
npm run dev
```

## License

MIT License - see [LICENSE](./LICENSE) file for details.