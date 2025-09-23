# SMRT Development MCP Server

This MCP server provides tools, resources, and prompts for building AI-powered TypeScript applications using the SMRT framework.

## Features

### Resources (Documentation Access)
- **Core SMRT Documentation**: BaseObject, BaseCollection, BaseClass patterns
- **Field Definitions**: All field types with validation patterns
- **Decorator Configuration**: @smrt decorator options and usage
- **Generator Documentation**: CLI, API, and MCP generator guides
- **Package References**: Documentation for all @have/* packages
- **Code Examples**: Real-world usage patterns and samples

### Tools (Code Generation)
- **generate-smrt-class**: Create complete SMRT objects with decorators
- **add-ai-methods**: Add AI-powered methods (do, is, describe)
- **configure-decorators**: Set up @smrt decorator options
- **generate-field-definitions**: Create field schemas with validation
- **validate-smrt-object**: Check code structure and patterns
- **generate-collection**: Create collection classes for CRUD operations
- **preview-api-endpoints**: Show generated REST API structure
- **preview-mcp-tools**: Display MCP server tools

### Prompts (Development Templates)
- **new-smrt-project**: Initialize new project structure
- **business-object**: Create domain-specific business objects
- **ai-integration**: Add AI capabilities to existing objects
- **api-setup**: Configure REST API generation
- **migrate-to-smrt**: Migrate existing classes to SMRT framework

## Installation

### 1. Build the MCP Server

```bash
cd mcp
bun install
bun run build
```

### 2. Configure Claude Desktop

Add to your Claude Desktop configuration (`~/.claude/mcp-config.json`):

```json
{
  "mcpServers": {
    "smrt-dev-server": {
      "command": "/path/to/sdk/scripts/mcp-servers/smrt-dev-server.sh",
      "args": [],
      "env": {
        "NODE_ENV": "development",
        "SDK_ROOT": "/path/to/sdk"
      }
    }
  }
}
```

### 3. Start Claude Desktop

Restart Claude Desktop to load the MCP server. You should see the SMRT development tools available in your conversations.

## Usage Examples

### Creating a New SMRT Object

**User**: "Create a Product object for an e-commerce system with name, price, description, and inventory tracking."

**Claude**: Uses the `generate-smrt-class` tool to create a complete SMRT object with proper fields, decorators, and AI methods.

### Adding AI Capabilities

**User**: "Add AI methods to analyze product quality and generate descriptions."

**Claude**: Uses the `add-ai-methods` tool to add intelligent analysis capabilities to your existing object.

### API Configuration

**User**: "Set up a REST API for my Product objects with authentication."

**Claude**: Uses the `preview-api-endpoints` and configuration tools to show you exactly what endpoints will be generated.

### Getting Documentation

**User**: "How do I use foreign key relationships in SMRT?"

**Claude**: Accesses the field definitions resource to provide comprehensive examples and best practices.

## Development

### Project Structure

```
mcp/
├── src/
│   ├── index.ts          # Main MCP server
│   ├── resources/        # Documentation providers
│   │   └── index.ts
│   ├── tools/           # Code generation tools
│   │   ├── index.ts
│   │   ├── generate-class.ts
│   │   ├── add-ai-methods.ts
│   │   └── ...
│   └── prompts/         # Development templates
│       ├── index.ts
│       └── ...
├── package.json
├── tsconfig.json
└── README.md
```

### Adding New Tools

1. Create a new tool in `src/tools/`
2. Register it in `src/tools/index.ts`
3. Add input schema validation
4. Implement the tool handler
5. Build and test

Example:
```typescript
// src/tools/my-new-tool.ts
export async function myNewTool(args: any): Promise<string> {
  // Implementation
  return 'Generated code or result';
}

// src/tools/index.ts
this.registerTool(
  {
    name: 'my-new-tool',
    description: 'Description of what the tool does',
    inputSchema: {
      type: 'object',
      properties: {
        // Define required parameters
      },
      required: ['param1']
    }
  },
  myNewTool
);
```

### Testing

```bash
# Run tests
bun test

# Test MCP server directly
bun run build
npx @modelcontextprotocol/inspector dist/index.js

# Test with Claude Desktop
# Use the bridge script
./scripts/mcp-servers/smrt-dev-server.sh status
./scripts/mcp-servers/smrt-dev-server.sh logs
```

### Building

```bash
# Development build
bun run build

# Watch mode for development
bun run build:watch

# Clean build
bun run clean && bun run build
```

## Troubleshooting

### Server Won't Start

1. Check Node.js and Bun are installed
2. Verify the SDK_ROOT environment variable
3. Check build output for errors
4. Review server logs: `./scripts/mcp-servers/smrt-dev-server.sh logs`

### Tools Not Available in Claude

1. Restart Claude Desktop completely
2. Check MCP configuration file syntax
3. Verify script paths are absolute
4. Check server status: `./scripts/mcp-servers/smrt-dev-server.sh status`

### Generated Code Issues

1. Validate input parameters match tool schemas
2. Check SMRT framework documentation for latest patterns
3. Test generated code in isolation
4. Review field definitions and decorator configurations

## Contributing

1. Follow TypeScript and SMRT framework conventions
2. Add comprehensive input validation
3. Include error handling and helpful error messages
4. Test tools with various input combinations
5. Update documentation for new features

## License

Part of the HAVE SDK - MIT License