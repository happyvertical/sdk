# Claude Desktop MCP Setup for Projects Using HAVE SDK

## Quick Setup

### 1. Copy the Bridge Script

Copy the bridge script to your project:

```bash
# From your project root
cp node_modules/@have/sdk/scripts/mcp-smrt.sh ./scripts/
chmod +x ./scripts/mcp-smrt.sh
```

### 2. Configure Claude Desktop

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

### 3. Test the Setup

```bash
# Test the bridge script
./scripts/mcp-smrt.sh verify

# Test with MCP inspector
npx @modelcontextprotocol/inspector ./scripts/mcp-smrt.sh
```

### 4. Restart Claude Desktop

Restart Claude Desktop to load the MCP server. You should now have access to SMRT development tools in your conversations.

## Available Tools

Once configured, you'll have access to:

- **generate-smrt-class**: Create complete SMRT objects
- **add-ai-methods**: Add AI-powered methods
- **validate-smrt-object**: Check code structure
- **preview-api-endpoints**: See generated REST APIs
- And many more...

## Troubleshooting

### Server Won't Start

1. Check dependencies: `./scripts/mcp-smrt.sh verify`
2. View logs: `./scripts/mcp-smrt.sh logs`
3. Clean and rebuild: `./scripts/mcp-smrt.sh clean && ./scripts/mcp-smrt.sh build`

### Tools Not Available

1. Restart Claude Desktop completely
2. Check configuration file syntax
3. Verify script permissions: `ls -la scripts/mcp-smrt.sh`

For more help, see the full documentation in the HAVE SDK repository.