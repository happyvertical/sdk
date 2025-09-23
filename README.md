# Happy Vertical SDK

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Build powerful AI agents in TypeScript with the SMRT framework. Define your business logic once and get REST APIs, AI tools, and CLI commands automatically generated.

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

## Core Packages

| Package | Purpose |
|---------|---------|
| **[@have/smrt](./packages/smrt/)** | Core framework with agents, smart objects, and code generation |
| **[@have/ai](./packages/ai/)** | Multi-provider AI client (OpenAI, Anthropic, Google, AWS) |
| **[@have/files](./packages/files/)** | File system operations and utilities |
| **[@have/spider](./packages/spider/)** | Web crawling and content extraction |
| **[@have/sql](./packages/sql/)** | Database operations for SQLite and Postgres |
| **[@have/pdf](./packages/pdf/)** | PDF parsing and text extraction |
| **[@have/ocr](./packages/ocr/)** | Optical Character Recognition |
| **[@have/utils](./packages/utils/)** | Shared utilities and helpers |

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
bun install

# Run tests
bun test

# Build packages
bun build

# Development mode
bun dev
```

## License

MIT License - see [LICENSE](./LICENSE) file for details.