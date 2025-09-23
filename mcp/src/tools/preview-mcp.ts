/**
 * Preview MCP Tools Tool
 */

interface MCPConfig {
  include?: string[];
  exclude?: string[];
}

interface PreviewMCPArgs {
  className: string;
  decoratorConfig?: {
    mcp?: MCPConfig;
  };
}

interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: any;
  examples?: Array<{
    description: string;
    arguments: Record<string, any>;
  }>;
}

export async function previewMCPTools(args: PreviewMCPArgs): Promise<string> {
  const { className, decoratorConfig } = args;
  const mcpConfig = decoratorConfig?.mcp || {};

  const tools = generateMCPTools(className, mcpConfig);
  const serverConfig = generateServerConfig(className);

  return formatMCPPreview(className, tools, serverConfig);
}

function generateMCPTools(
  className: string,
  mcpConfig: MCPConfig,
): MCPToolInfo[] {
  const objectName = className.toLowerCase();
  const pluralName = `${objectName}s`;

  const allTools: MCPToolInfo[] = [
    {
      name: `list-${pluralName}`,
      description: `List ${className} objects with optional filtering and pagination`,
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of items to return',
            default: 50,
          },
          offset: {
            type: 'number',
            description: 'Number of items to skip for pagination',
            default: 0,
          },
          orderBy: {
            type: 'string',
            description:
              'Field to sort by (e.g., "created_at DESC", "name ASC")',
          },
          where: {
            type: 'object',
            description:
              'Filter conditions (e.g., {"isActive": true, "name like": "%search%"})',
          },
        },
      },
      examples: [
        {
          description: 'List first 10 active items',
          arguments: {
            limit: 10,
            where: { isActive: true },
            orderBy: 'created_at DESC',
          },
        },
        {
          description: 'Search by name',
          arguments: {
            where: { 'name like': '%example%' },
          },
        },
      ],
    },
    {
      name: `get-${objectName}`,
      description: `Get a specific ${className} by ID, slug, or name`,
      inputSchema: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'Object ID, slug, or name to retrieve',
          },
        },
        required: ['identifier'],
      },
      examples: [
        {
          description: 'Get by ID',
          arguments: {
            identifier: 'abc123-def456-ghi789',
          },
        },
        {
          description: 'Get by slug',
          arguments: {
            identifier: 'example-object',
          },
        },
      ],
    },
    {
      name: `create-${objectName}`,
      description: `Create a new ${className} object`,
      inputSchema: {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            description: `${className} object data`,
            properties: {
              name: {
                type: 'string',
                description: 'Object name',
              },
              description: {
                type: 'string',
                description: 'Object description',
              },
            },
            required: ['name'],
          },
        },
        required: ['data'],
      },
      examples: [
        {
          description: 'Create basic object',
          arguments: {
            data: {
              name: `Example ${className}`,
              description: 'A sample object created via MCP',
            },
          },
        },
      ],
    },
    {
      name: `update-${objectName}`,
      description: `Update an existing ${className} object`,
      inputSchema: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'Object ID, slug, or name to update',
          },
          data: {
            type: 'object',
            description: 'Updated object data',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
        required: ['identifier', 'data'],
      },
      examples: [
        {
          description: 'Update object name',
          arguments: {
            identifier: 'example-object',
            data: {
              name: 'Updated Name',
            },
          },
        },
      ],
    },
    {
      name: `delete-${objectName}`,
      description: `Delete a ${className} object`,
      inputSchema: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'Object ID, slug, or name to delete',
          },
          confirm: {
            type: 'boolean',
            description: 'Confirmation flag to prevent accidental deletion',
            default: false,
          },
        },
        required: ['identifier', 'confirm'],
      },
      examples: [
        {
          description: 'Delete object with confirmation',
          arguments: {
            identifier: 'example-object',
            confirm: true,
          },
        },
      ],
    },
  ];

  // Apply include/exclude filters
  let filteredTools = allTools;

  if (mcpConfig.include?.length) {
    const includeSet = new Set(mcpConfig.include);
    filteredTools = allTools.filter((tool) => {
      const operation = getOperationFromTool(tool);
      return includeSet.has(operation);
    });
  }

  if (mcpConfig.exclude?.length) {
    const excludeSet = new Set(mcpConfig.exclude);
    filteredTools = filteredTools.filter((tool) => {
      const operation = getOperationFromTool(tool);
      return !excludeSet.has(operation);
    });
  }

  // Add AI-enhanced tools if any operations are included
  if (filteredTools.length > 0) {
    filteredTools.push(...generateAITools(className));
  }

  return filteredTools;
}

function getOperationFromTool(tool: MCPToolInfo): string {
  if (tool.name.startsWith('list-')) return 'list';
  if (tool.name.startsWith('get-')) return 'get';
  if (tool.name.startsWith('create-')) return 'create';
  if (tool.name.startsWith('update-')) return 'update';
  if (tool.name.startsWith('delete-')) return 'delete';
  return 'other';
}

function generateAITools(className: string): MCPToolInfo[] {
  const objectName = className.toLowerCase();

  return [
    {
      name: `analyze-${objectName}`,
      description: `Use AI to analyze and provide insights about a ${className} object`,
      inputSchema: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'Object ID, slug, or name to analyze',
          },
          criteria: {
            type: 'string',
            description: 'Specific analysis criteria or focus area',
          },
        },
        required: ['identifier'],
      },
      examples: [
        {
          description: 'General analysis',
          arguments: {
            identifier: 'example-object',
          },
        },
        {
          description: 'Quality assessment',
          arguments: {
            identifier: 'example-object',
            criteria: 'Assess the quality and completeness of this object',
          },
        },
      ],
    },
    {
      name: `search-${objectName}s-semantic`,
      description: `Use AI to perform semantic search across ${className} objects`,
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language search query',
          },
          threshold: {
            type: 'number',
            description: 'Relevance threshold (1-10)',
            default: 7,
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results',
            default: 10,
          },
        },
        required: ['query'],
      },
      examples: [
        {
          description: 'Find relevant items',
          arguments: {
            query: 'high-quality content related to technology',
            threshold: 8,
          },
        },
      ],
    },
    {
      name: `suggest-improvements-${objectName}`,
      description: `Get AI-powered suggestions for improving a ${className} object`,
      inputSchema: {
        type: 'object',
        properties: {
          identifier: {
            type: 'string',
            description: 'Object ID, slug, or name',
          },
          focus: {
            type: 'string',
            description: 'Specific area to focus improvements on',
          },
        },
        required: ['identifier'],
      },
      examples: [
        {
          description: 'General improvements',
          arguments: {
            identifier: 'example-object',
          },
        },
        {
          description: 'Focus on content quality',
          arguments: {
            identifier: 'example-object',
            focus: 'content quality and readability',
          },
        },
      ],
    },
  ];
}

function generateServerConfig(className: string): any {
  return {
    name: `${className.toLowerCase()}-mcp-server`,
    version: '1.0.0',
    description: `MCP server for ${className} object management`,
    server: {
      command: 'node',
      args: [`dist/${className.toLowerCase()}-mcp-server.js`],
      env: {
        NODE_ENV: 'production',
      },
    },
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
    },
  };
}

function formatMCPPreview(
  className: string,
  tools: MCPToolInfo[],
  serverConfig: any,
): string {
  let output = `# ${className} MCP Tools Preview\n\n`;

  output += `This preview shows the MCP tools that would be generated for the ${className} SMRT object.\n\n`;

  output += `## Generated Tools\n\n`;

  tools.forEach((tool) => {
    output += `### ${tool.name}\n\n`;
    output += `${tool.description}\n\n`;

    output += `**Input Schema:**\n`;
    output += `\`\`\`json\n`;
    output += `${JSON.stringify(tool.inputSchema, null, 2)}\n`;
    output += `\`\`\`\n\n`;

    if (tool.examples?.length) {
      output += `**Examples:**\n\n`;
      tool.examples.forEach((example, index) => {
        output += `${index + 1}. ${example.description}\n`;
        output += `   \`\`\`json\n`;
        output += `   ${JSON.stringify(example.arguments, null, 2)}\n`;
        output += `   \`\`\`\n\n`;
      });
    }

    output += `---\n\n`;
  });

  output += `## Usage in Claude\n\n`;

  output += `Once the MCP server is running, you can use these tools in Claude:\n\n`;

  output += `### Basic CRUD Operations\n\n`;
  output += `- **"List all ${className.toLowerCase()}s"** → Uses \`list-${className.toLowerCase()}s\` tool\n`;
  output += `- **"Get the product with ID abc123"** → Uses \`get-${className.toLowerCase()}\` tool\n`;
  output += `- **"Create a new ${className.toLowerCase()} called 'Example'"** → Uses \`create-${className.toLowerCase()}\` tool\n`;
  output += `- **"Update the description of item xyz"** → Uses \`update-${className.toLowerCase()}\` tool\n`;
  output += `- **"Delete the ${className.toLowerCase()} named 'old-item'"** → Uses \`delete-${className.toLowerCase()}\` tool\n\n`;

  output += `### AI-Enhanced Operations\n\n`;
  output += `- **"Analyze the quality of this ${className.toLowerCase()}"** → Uses \`analyze-${className.toLowerCase()}\` tool\n`;
  output += `- **"Find ${className.toLowerCase()}s related to machine learning"** → Uses \`search-${className.toLowerCase()}s-semantic\` tool\n`;
  output += `- **"How can I improve this ${className.toLowerCase()}?"** → Uses \`suggest-improvements-${className.toLowerCase()}\` tool\n\n`;

  output += `## Server Configuration\n\n`;
  output += `The MCP server would be configured as:\n\n`;
  output += `\`\`\`json\n`;
  output += `${JSON.stringify(serverConfig, null, 2)}\n`;
  output += `\`\`\`\n\n`;

  output += `## Implementation Notes\n\n`;
  output += `- All tools support error handling with detailed error messages\n`;
  output += `- Complex queries can be performed using the \`where\` parameter in list operations\n`;
  output += `- Objects can be identified by ID, slug, or name for flexibility\n`;
  output += `- AI tools leverage the SMRT framework's built-in AI methods\n`;
  output += `- Delete operations require confirmation to prevent accidents\n`;
  output += `- All operations respect the object's lifecycle hooks\n\n`;

  output += `## Generating the Actual MCP Server\n\n`;
  output += `To generate this MCP server, use:\n\n`;
  output += `\`\`\`typescript\n`;
  output += `import { MCPGenerator } from '@have/smrt/generators';\n`;
  output += `import { ${className} } from './${className.toLowerCase()}';\n\n`;
  output += `const generator = new MCPGenerator({\n`;
  output += `  collections: [${className}],\n`;
  output += `  outputDir: './mcp',\n`;
  output += `  tools: ['list', 'get', 'create', 'update', 'delete'],\n`;
  output += `  includeAI: true\n`;
  output += `});\n\n`;
  output += `await generator.generate();\n`;
  output += `\`\`\`\n\n`;

  output += `## Claude Desktop Integration\n\n`;
  output += `Add to your Claude Desktop configuration:\n\n`;
  output += `\`\`\`json\n`;
  output += `{\n`;
  output += `  "mcpServers": {\n`;
  output += `    "${className.toLowerCase()}-manager": {\n`;
  output += `      "command": "node",\n`;
  output += `      "args": ["./mcp/dist/${className.toLowerCase()}-mcp-server.js"],\n`;
  output += `      "env": {\n`;
  output += `        "NODE_ENV": "production"\n`;
  output += `      }\n`;
  output += `    }\n`;
  output += `  }\n`;
  output += `}\n`;
  output += `\`\`\`\n`;

  return output;
}
