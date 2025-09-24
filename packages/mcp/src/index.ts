#!/usr/bin/env node

/**
 * MCP Server for SMRT Framework Development
 *
 * Provides tools, resources, and prompts for building AI-powered
 * TypeScript applications using the SMRT framework.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { setupPrompts } from './prompts/index.js';
import { setupResources } from './resources/index.js';
import { setupTools } from './tools/index.js';

// Server metadata
const SERVER_INFO = {
  name: 'smrt-dev-server',
  version: '0.0.1',
  description:
    'MCP server for SMRT framework development - AI-powered TypeScript applications',
};

// Initialize MCP server
const server = new Server(SERVER_INFO, {
  capabilities: {
    resources: {},
    tools: {},
    prompts: {},
  },
});

// Setup resources (documentation, examples, schemas)
const resources = setupResources();

// Setup tools (code generators, validators, previewers)
const tools = setupTools();

// Setup prompts (templates for common tasks)
const prompts = setupPrompts();

// Handle resource listing
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: resources.list(),
  };
});

// Handle resource reading
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  const content = await resources.read(uri);

  if (!content) {
    throw new Error(`Resource not found: ${uri}`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: content.mimeType || 'text/plain',
        text: content.text,
      },
    ],
  };
});

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.list(),
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await tools.execute(name, args || {});

    return {
      content: [
        {
          type: 'text',
          text:
            typeof result === 'string'
              ? result
              : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool ${name}: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Handle prompt listing
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: prompts.list(),
  };
});

// Handle prompt retrieval
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const prompt = await prompts.get(name, args || {});

  if (!prompt) {
    throw new Error(`Prompt not found: ${name}`);
  }

  return {
    description: prompt.description,
    messages: prompt.messages,
  };
});

// Error handling
server.onerror = (error) => {
  console.error('[MCP Server Error]', error);
};

// Start the server
async function main() {
  console.error('Starting SMRT MCP Development Server...');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`Server running: ${SERVER_INFO.name} v${SERVER_INFO.version}`);
  console.error('Ready to assist with SMRT framework development!');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('Shutting down SMRT MCP server...');
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down SMRT MCP server...');
  await server.close();
  process.exit(0);
});

// Run the server
main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
