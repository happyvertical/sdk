/**
 * MCP Tools for SMRT Framework Code Generation
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { addAIMethods } from './add-ai-methods.js';
import { configureDecorators } from './configure-decorators.js';
import { generateSmrtClass } from './generate-class.js';
import { generateCollection } from './generate-collection.js';
import { generateFieldDefinitions } from './generate-fields.js';
import { previewAPIEndpoints } from './preview-api.js';
import { previewMCPTools } from './preview-mcp.js';
import { validateSmrtObject } from './validate-object.js';

export interface ToolExecutor {
  list(): Tool[];
  execute(name: string, args: Record<string, any>): Promise<any>;
}

class ToolManager implements ToolExecutor {
  private tools: Map<string, Tool> = new Map();
  private handlers: Map<string, (args: any) => Promise<any>> = new Map();

  constructor() {
    this.registerTools();
  }

  private registerTools() {
    // Generate SMRT class
    this.registerTool(
      {
        name: 'generate-smrt-class',
        description:
          'Generate a new SMRT object class with proper decorators and field definitions',
        inputSchema: {
          type: 'object',
          properties: {
            className: {
              type: 'string',
              description:
                'Name of the class to generate (e.g., "Product", "User")',
            },
            fields: {
              type: 'array',
              description: 'Array of field definitions',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: {
                    type: 'string',
                    enum: [
                      'text',
                      'integer',
                      'decimal',
                      'boolean',
                      'datetime',
                      'json',
                      'foreignKey',
                    ],
                  },
                  options: {
                    type: 'object',
                    properties: {
                      required: { type: 'boolean' },
                      unique: { type: 'boolean' },
                      default: {
                        type: ['string', 'number', 'boolean', 'null'],
                      },
                      maxLength: { type: 'number' },
                      min: { type: 'number' },
                      max: { type: 'number' },
                    },
                  },
                },
                required: ['name', 'type'],
              },
            },
            decoratorConfig: {
              type: 'object',
              description: 'Configuration for @smrt decorator',
              properties: {
                api: {
                  type: 'object',
                  properties: {
                    exclude: {
                      type: 'array',
                      items: {
                        type: 'string',
                        enum: ['list', 'get', 'create', 'update', 'delete'],
                      },
                    },
                  },
                },
                cli: { type: 'boolean' },
                mcp: {
                  type: 'object',
                  properties: {
                    include: {
                      type: 'array',
                      items: {
                        type: 'string',
                        enum: ['list', 'get', 'create', 'update', 'delete'],
                      },
                    },
                  },
                },
              },
            },
            includeAIMethods: {
              type: 'boolean',
              description:
                'Include AI-powered methods (summarize, validate, etc.)',
              default: false,
            },
          },
          required: ['className', 'fields'],
        },
      },
      generateSmrtClass,
    );

    // Add AI methods to existing class
    this.registerTool(
      {
        name: 'add-ai-methods',
        description:
          'Add AI-powered methods (do, is, describe) to a SMRT object',
        inputSchema: {
          type: 'object',
          properties: {
            className: {
              type: 'string',
              description: 'Name of the class',
            },
            methods: {
              type: 'array',
              description: 'AI methods to add',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: {
                    type: 'string',
                    enum: ['do', 'is', 'describe', 'custom'],
                  },
                  description: { type: 'string' },
                  prompt: { type: 'string' },
                },
                required: ['name', 'type'],
              },
            },
            existingCode: {
              type: 'string',
              description: 'Existing class code to modify',
            },
          },
          required: ['className', 'methods'],
        },
      },
      addAIMethods,
    );

    // Configure decorators
    this.registerTool(
      {
        name: 'configure-decorators',
        description:
          'Configure @smrt decorator options for API, CLI, and MCP generation',
        inputSchema: {
          type: 'object',
          properties: {
            className: { type: 'string' },
            api: {
              type: 'object',
              properties: {
                include: {
                  type: 'array',
                  items: { type: 'string' },
                },
                exclude: {
                  type: 'array',
                  items: { type: 'string' },
                },
                middleware: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
            cli: {
              type: ['boolean', 'object'],
            },
            mcp: {
              type: 'object',
              properties: {
                include: {
                  type: 'array',
                  items: { type: 'string' },
                },
                exclude: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
            hooks: {
              type: 'object',
              properties: {
                beforeSave: { type: 'boolean' },
                afterSave: { type: 'boolean' },
                beforeCreate: { type: 'boolean' },
                afterCreate: { type: 'boolean' },
              },
            },
          },
          required: ['className'],
        },
      },
      configureDecorators,
    );

    // Generate field definitions
    this.registerTool(
      {
        name: 'generate-field-definitions',
        description: 'Generate field definitions for a SMRT object',
        inputSchema: {
          type: 'object',
          properties: {
            fields: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: {
                    type: 'string',
                    enum: [
                      'text',
                      'integer',
                      'decimal',
                      'boolean',
                      'datetime',
                      'json',
                      'foreignKey',
                      'oneToMany',
                      'manyToMany',
                    ],
                  },
                  options: { type: 'object' },
                },
                required: ['name', 'type'],
              },
            },
          },
          required: ['fields'],
        },
      },
      generateFieldDefinitions,
    );

    // Validate SMRT object
    this.registerTool(
      {
        name: 'validate-smrt-object',
        description:
          'Validate a SMRT object class for correct structure and patterns',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'The SMRT object code to validate',
            },
          },
          required: ['code'],
        },
      },
      validateSmrtObject,
    );

    // Generate collection class
    this.registerTool(
      {
        name: 'generate-collection',
        description: 'Generate a collection class for managing SMRT objects',
        inputSchema: {
          type: 'object',
          properties: {
            objectClassName: {
              type: 'string',
              description: 'Name of the object class this collection manages',
            },
            collectionName: {
              type: 'string',
              description: 'Name of the collection class',
            },
            customMethods: {
              type: 'array',
              description: 'Custom query methods to include',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  parameters: { type: 'array' },
                },
              },
            },
          },
          required: ['objectClassName'],
        },
      },
      generateCollection,
    );

    // Preview API endpoints
    this.registerTool(
      {
        name: 'preview-api-endpoints',
        description:
          'Preview the REST API endpoints that would be generated for a SMRT object',
        inputSchema: {
          type: 'object',
          properties: {
            className: { type: 'string' },
            decoratorConfig: {
              type: 'object',
              properties: {
                api: { type: 'object' },
              },
            },
          },
          required: ['className'],
        },
      },
      previewAPIEndpoints,
    );

    // Preview MCP tools
    this.registerTool(
      {
        name: 'preview-mcp-tools',
        description:
          'Preview the MCP tools that would be generated for a SMRT object',
        inputSchema: {
          type: 'object',
          properties: {
            className: { type: 'string' },
            decoratorConfig: {
              type: 'object',
              properties: {
                mcp: { type: 'object' },
              },
            },
          },
          required: ['className'],
        },
      },
      previewMCPTools,
    );
  }

  private registerTool(tool: Tool, handler: (args: any) => Promise<any>) {
    this.tools.set(tool.name, tool);
    this.handlers.set(tool.name, handler);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, args: Record<string, any>): Promise<any> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      return await handler(args);
    } catch (error) {
      throw new Error(
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export function setupTools(): ToolExecutor {
  return new ToolManager();
}
