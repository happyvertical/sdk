/**
 * SMRT Template MCP Server
 *
 * Demonstrates auto-generated MCP tools from SMRT objects.
 * No manual tool definitions needed - everything is generated from @smrt() decorated classes.
 */

import { createMCPServer } from '@have/smrt';
import { manifest } from '@smrt/manifest'; // Virtual module from Vite plugin
import { createMCPServer as createGeneratedMCPServer, tools } from '@smrt/mcp'; // Virtual module from Vite plugin

async function startMCPServer() {
  console.log('🤖 Starting SMRT Template MCP Server...');

  // Create MCP server with auto-generated tools
  const mcp = createMCPServer({
    name: 'smrt-template',
    version: '1.0.0',
  });

  // Get auto-generated tools from virtual module
  const generatedServerInfo = createGeneratedMCPServer();

  // Add all generated tools to our MCP server
  tools.forEach((tool: any) => {
    mcp.addTool(tool, async (params) => {
      // This would be implemented with actual collection logic
      console.log(`Executing tool: ${tool.name}`, params);

      // Mock implementation for demonstration
      switch (tool.name) {
        case 'list_products':
          return [
            { id: '1', name: 'Demo Product', price: 29.99, inStock: true },
            { id: '2', name: 'Another Product', price: 49.99, inStock: false },
          ];

        case 'get_product':
          return {
            id: params.id,
            name: `Product ${params.id}`,
            price: 29.99,
            inStock: true,
          };

        case 'create_product':
          return { id: 'new-id', ...params };

        case 'list_categories':
          return [
            { id: '1', name: 'Demo Category', active: true },
            { id: '2', name: 'Another Category', active: true },
          ];

        case 'get_category':
          return { id: params.id, name: `Category ${params.id}`, active: true };

        case 'create_category':
          return { id: 'new-id', ...params };

        default:
          throw new Error(`Tool ${tool.name} not implemented`);
      }
    });
  });

  // Log discovered tools
  const toolCount = generatedServer.tools.length;
  const toolNames = generatedServer.tools.map((t: any) => t.name).join(', ');
  console.log(`🔧 Discovered ${toolCount} MCP tools: ${toolNames}`);

  // Start the MCP server
  await mcp.start();

  console.log('✅ MCP Server ready!');
  console.log('🔗 Tools available for AI model integration');

  // Log available tools for each object
  Object.entries(manifest.objects).forEach(([name, obj]) => {
    const config = obj.decoratorConfig.mcp;
    if (config !== false) {
      console.log(`\n📊 ${obj.className} tools:`);

      const include = config?.include;
      const exclude = config?.exclude || [];

      const operations = ['list', 'get', 'create', 'update', 'delete'];
      operations.forEach((op) => {
        const shouldInclude = include ? include.includes(op) : true;
        const shouldExclude = exclude.includes(op);

        if (shouldInclude && !shouldExclude) {
          const toolName =
            op === 'list' ? `list_${obj.collection}` : `${op}_${name}`;
          console.log(
            `   🔧 ${toolName} - ${op.charAt(0).toUpperCase() + op.slice(1)} ${name}`,
          );
        }
      });
    }
  });

  return mcp;
}

// Start if running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startMCPServer().catch(console.error);
}

export { startMCPServer };
