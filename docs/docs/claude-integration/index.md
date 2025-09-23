# Claude Desktop Integration

The HAVE SDK includes a powerful MCP (Model Context Protocol) server that transforms Claude Desktop into an intelligent SMRT development environment. This integration provides AI-powered code generation, documentation access, and development tools directly within your Claude conversations.

## Overview

The MCP server provides three main categories of functionality:

- **Resources**: Instant access to SMRT documentation, examples, and schemas
- **Tools**: Code generation for SMRT objects, AI methods, and configurations
- **Prompts**: Development templates for common tasks and workflows

## Quick Setup

For projects using the HAVE SDK as a dependency:

### 1. Install the SDK

```bash
npm install @have/sdk
# or
bun add @have/sdk
```

### 2. Copy the Bridge Script

```bash
cp node_modules/@have/sdk/scripts/mcp-smrt.sh ./scripts/
chmod +x ./scripts/mcp-smrt.sh
```

### 3. Configure Claude Desktop

Create `.claude/mcp-config.json` in your project:

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

**Important**: Use absolute paths in the configuration.

### 4. Test and Verify

```bash
# Test the bridge script
./scripts/mcp-smrt.sh verify

# Test with MCP inspector
npx @modelcontextprotocol/inspector ./scripts/mcp-smrt.sh
```

### 5. Restart Claude Desktop

Restart Claude Desktop completely to load the MCP server. You should now have access to SMRT development tools in your conversations.

## What You Get

Once configured, Claude becomes a powerful SMRT development assistant with access to:

### Development Tools
- Generate complete SMRT objects with proper decorators
- Add AI-powered methods (do, is, describe)
- Validate code structure and best practices
- Preview generated REST APIs and MCP tools
- Configure decorators for different use cases

### Documentation Access
- Instant access to all SMRT framework documentation
- Field definition references and examples
- Package documentation for all @have/* libraries
- Real-world code examples and patterns

### Development Templates
- New project initialization
- Business object creation
- AI integration patterns
- API setup and configuration
- Code migration assistance

## Usage Examples

### Creating SMRT Objects

**You**: "Create a Product object for e-commerce with name, price, description, and inventory tracking."

**Claude**: Uses the `generate-smrt-class` tool to create a complete SMRT object with:
- Proper field definitions with validation
- @smrt decorator configuration
- Constructor and lifecycle hooks
- AI-powered methods for analysis

### Adding AI Capabilities

**You**: "Add AI methods to analyze product quality and generate descriptions."

**Claude**: Uses the `add-ai-methods` tool to add intelligent capabilities:
- Quality assessment methods
- Content generation functions
- Validation and analysis tools
- Error handling and fallbacks

### Getting Documentation

**You**: "How do I use foreign key relationships in SMRT?"

**Claude**: Accesses the field definitions resource to provide:
- Comprehensive examples
- Best practices
- Common patterns
- Troubleshooting tips

### API Preview

**You**: "Show me what REST API endpoints will be generated for my Product object."

**Claude**: Uses the `preview-api-endpoints` tool to display:
- Complete endpoint specifications
- Request/response examples
- Authentication requirements
- OpenAPI documentation

## Advanced Configuration

### Environment Variables

The bridge script supports several environment variables:

```bash
# Custom project root
PROJECT_ROOT=/path/to/project ./scripts/mcp-smrt.sh

# Custom SDK location
SDK_PATH=/custom/sdk/path ./scripts/mcp-smrt.sh

# Custom log file
LOG_FILE=/tmp/my-mcp.log ./scripts/mcp-smrt.sh
```

### Team Setup

For team environments, create a shared configuration:

1. **Add to `.gitignore`**:
   ```
   .claude/mcp-config.json
   scripts/mcp-smrt.sh
   ```

2. **Create example configuration**:
   ```bash
   cp .claude/mcp-config.json .claude/mcp-config.example.json
   ```

3. **Document in README**:
   ```markdown
   ## Claude Desktop Setup

   1. Copy configuration: `cp .claude/mcp-config.example.json .claude/mcp-config.json`
   2. Update PROJECT_ROOT to your absolute path
   3. Copy bridge script: `npm run mcp:setup-project`
   4. Restart Claude Desktop
   ```

### Custom Package Scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "mcp:setup": "cp node_modules/@have/sdk/scripts/mcp-smrt.sh ./scripts/ && chmod +x ./scripts/mcp-smrt.sh",
    "mcp:verify": "./scripts/mcp-smrt.sh verify",
    "mcp:status": "./scripts/mcp-smrt.sh status",
    "mcp:logs": "./scripts/mcp-smrt.sh logs",
    "postinstall": "npm run mcp:setup"
  }
}
```

## Troubleshooting

### Server Won't Start

1. **Check dependencies**:
   ```bash
   ./scripts/mcp-smrt.sh verify
   ```

2. **View logs**:
   ```bash
   ./scripts/mcp-smrt.sh logs
   ```

3. **Clean and rebuild**:
   ```bash
   ./scripts/mcp-smrt.sh clean
   ./scripts/mcp-smrt.sh build
   ```

### Tools Not Available in Claude

1. **Restart Claude Desktop completely**
2. **Check configuration syntax**:
   ```bash
   cat .claude/mcp-config.json | jq .
   ```
3. **Verify script permissions**:
   ```bash
   ls -la scripts/mcp-smrt.sh
   ```
4. **Test with inspector**:
   ```bash
   npx @modelcontextprotocol/inspector ./scripts/mcp-smrt.sh
   ```

### Generated Code Issues

1. **Validate input parameters** match tool schemas
2. **Check SMRT framework documentation** for latest patterns
3. **Test generated code** in isolation
4. **Review field definitions** and decorator configurations

### SDK Not Found

If you get "SDK not found" errors:

1. **Verify installation**:
   ```bash
   ls node_modules/@have/sdk/
   ```

2. **Check SDK_PATH**:
   ```bash
   SDK_PATH=$(pwd)/node_modules/@have/sdk ./scripts/mcp-smrt.sh status
   ```

3. **Reinstall if needed**:
   ```bash
   npm install @have/sdk
   ```

## Best Practices

### Development Workflow

1. **Start with documentation**: Ask Claude about SMRT patterns before coding
2. **Use validation tools**: Always validate generated code
3. **Iterate with AI**: Use AI methods to enhance and improve your objects
4. **Preview before generating**: Use preview tools to see APIs before implementation

### Code Organization

1. **Follow SMRT conventions**: Use proper field definitions and decorators
2. **Add lifecycle hooks**: Implement business logic in appropriate hooks
3. **Include AI methods**: Enhance objects with intelligent capabilities
4. **Test thoroughly**: Validate both functionality and AI behavior

### Team Collaboration

1. **Document MCP setup**: Include setup instructions in project README
2. **Share configurations**: Use example configs for team consistency
3. **Version control**: Keep bridge scripts and configs in version control
4. **Update regularly**: Keep SDK and MCP server updated

## Next Steps

- [Getting Started with SMRT](../getting-started/)
- [SMRT Framework Guide](../smrt-framework/)
- [API Generation](../smrt-framework/generators/)
- [AI Integration Patterns](../tutorials/ai-methods/)