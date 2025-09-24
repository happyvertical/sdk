/**
 * MCP (Model Context Protocol) server generator for smrt objects
 *
 * Exposes smrt objects as AI tools for Claude, GPT, and other AI models
 */

import type { SmrtCollection } from '../collection';
import { ObjectRegistry } from '../registry';

export interface MCPConfig {
  name?: string;
  version?: string;
  description?: string;
  server?: {
    name: string;
    version: string;
  };
}

export interface MCPContext {
  db?: any;
  ai?: any;
  user?: {
    id: string;
    roles?: string[];
  };
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPRequest {
  method: string;
  params: {
    name: string;
    arguments: Record<string, any>;
  };
}

export interface MCPResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
}

/**
 * Generate MCP server from smrt objects
 */
export class MCPGenerator {
  private config: MCPConfig;
  private context: MCPContext;
  private collections = new Map<string, SmrtCollection<any>>();

  constructor(config: MCPConfig = {}, context: MCPContext = {}) {
    this.config = {
      name: 'smrt-mcp-server',
      version: '1.0.0',
      description: 'Auto-generated MCP server from smrt objects',
      server: {
        name: 'smrt-mcp',
        version: '1.0.0',
      },
      ...config,
    };
    this.context = context;
  }

  /**
   * Generate all available tools from registered objects
   */
  generateTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    const registeredClasses = ObjectRegistry.getAllClasses();

    for (const [name, _classInfo] of registeredClasses) {
      const config = ObjectRegistry.getConfig(name);
      const mcpConfig = config.mcp || {};

      // Skip excluded endpoints
      const excluded = mcpConfig.exclude || [];
      const included = mcpConfig.include;

      const shouldInclude = (
        endpoint: 'list' | 'get' | 'create' | 'update' | 'delete',
      ) => {
        if (included && !included.includes(endpoint)) return false;
        if (excluded.includes(endpoint)) return false;
        return true;
      };

      const objectTools = this.generateObjectTools(name, (endpoint: string) =>
        shouldInclude(
          endpoint as 'list' | 'get' | 'create' | 'update' | 'delete',
        ),
      );
      tools.push(...objectTools);
    }

    return tools;
  }

  /**
   * Generate tools for a specific object
   */
  private generateObjectTools(
    objectName: string,
    shouldInclude: (endpoint: string) => boolean,
  ): MCPTool[] {
    const tools: MCPTool[] = [];
    const fields = ObjectRegistry.getFields(objectName);
    const lowerName = objectName.toLowerCase();

    // LIST tool
    if (shouldInclude('list')) {
      tools.push({
        name: `${lowerName}_list`,
        description: `List ${objectName} objects with optional filtering`,
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'integer',
              description: 'Maximum number of items to return',
              default: 50,
              minimum: 1,
              maximum: 1000,
            },
            offset: {
              type: 'integer',
              description: 'Number of items to skip',
              default: 0,
              minimum: 0,
            },
            orderBy: {
              type: 'string',
              description: 'Field to order by (e.g., "created_at DESC")',
            },
            where: {
              type: 'object',
              description: 'Filter conditions as key-value pairs',
              additionalProperties: true,
            },
          },
        },
      });
    }

    // GET tool
    if (shouldInclude('get')) {
      tools.push({
        name: `${lowerName}_get`,
        description: `Get a specific ${objectName} by ID or slug`,
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier of the object',
            },
            slug: {
              type: 'string',
              description: 'URL-friendly identifier of the object',
            },
          },
          required: [],
        },
      });
    }

    // CREATE tool
    if (shouldInclude('create')) {
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [fieldName, field] of fields) {
        properties[fieldName] = this.fieldToMCPSchema(field);
        if (field.options?.required) {
          required.push(fieldName);
        }
      }

      tools.push({
        name: `${lowerName}_create`,
        description: `Create a new ${objectName}`,
        inputSchema: {
          type: 'object',
          properties,
          required,
        },
      });
    }

    // UPDATE tool
    if (shouldInclude('update')) {
      const properties: Record<string, any> = {
        id: {
          type: 'string',
          description: 'ID of the object to update',
        },
      };

      for (const [fieldName, field] of fields) {
        properties[fieldName] = this.fieldToMCPSchema(field);
      }

      tools.push({
        name: `${lowerName}_update`,
        description: `Update an existing ${objectName}`,
        inputSchema: {
          type: 'object',
          properties,
          required: ['id'],
        },
      });
    }

    // DELETE tool
    if (shouldInclude('delete')) {
      tools.push({
        name: `${lowerName}_delete`,
        description: `Delete a ${objectName} by ID`,
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'ID of the object to delete',
            },
          },
          required: ['id'],
        },
      });
    }

    return tools;
  }

  /**
   * Convert field definition to MCP schema
   */
  private fieldToMCPSchema(field: any): any {
    const schema: any = {
      description: field.options?.description || `${field.type} field`,
    };

    switch (field.type) {
      case 'text':
        schema.type = 'string';
        if (field.options?.maxLength)
          schema.maxLength = field.options.maxLength;
        if (field.options?.minLength)
          schema.minLength = field.options.minLength;
        break;
      case 'integer':
        schema.type = 'integer';
        if (field.options?.min !== undefined)
          schema.minimum = field.options.min;
        if (field.options?.max !== undefined)
          schema.maximum = field.options.max;
        break;
      case 'decimal':
        schema.type = 'number';
        if (field.options?.min !== undefined)
          schema.minimum = field.options.min;
        if (field.options?.max !== undefined)
          schema.maximum = field.options.max;
        break;
      case 'boolean':
        schema.type = 'boolean';
        break;
      case 'datetime':
        schema.type = 'string';
        schema.format = 'date-time';
        break;
      case 'json':
        schema.type = 'object';
        break;
      case 'foreignKey':
        schema.type = 'string';
        schema.description = `ID of related ${field.options?.related || 'object'}`;
        break;
      default:
        schema.type = 'string';
    }

    if (field.options?.default !== undefined) {
      schema.default = field.options.default;
    }

    return schema;
  }

  /**
   * Handle MCP tool calls
   */
  async handleToolCall(request: MCPRequest): Promise<MCPResponse> {
    const { name, arguments: args } = request.params;

    try {
      // Parse tool name: objectname_action
      const [objectName, action] = name.split('_');

      if (!objectName || !action) {
        throw new Error(`Invalid tool name format: ${name}`);
      }

      // Find the registered class (case-insensitive)
      const registeredClasses = ObjectRegistry.getAllClasses();
      let classInfo = null;
      let actualObjectName = '';

      for (const [registeredName, info] of registeredClasses) {
        if (registeredName.toLowerCase() === objectName.toLowerCase()) {
          classInfo = info;
          actualObjectName = registeredName;
          break;
        }
      }

      if (!classInfo) {
        throw new Error(`Object type '${objectName}' not found`);
      }

      // Get or create collection
      const collection = this.getCollection(actualObjectName, classInfo);

      // Execute the action
      const result = await this.executeAction(collection, action, args);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Get or create collection for an object
   */
  private getCollection(
    objectName: string,
    classInfo: any,
  ): SmrtCollection<any> {
    if (!this.collections.has(objectName)) {
      const collection = new classInfo.collectionConstructor({
        ai: this.context.ai,
        db: this.context.db,
      });
      this.collections.set(objectName, collection);
    }
    return this.collections.get(objectName)!;
  }

  /**
   * Execute action on collection
   */
  private async executeAction(
    collection: SmrtCollection<any>,
    action: string,
    args: any,
  ): Promise<any> {
    switch (action) {
      case 'list': {
        const listOptions: any = {
          limit: Math.min(args.limit || 50, 1000),
          offset: args.offset || 0,
        };

        if (args.where) {
          listOptions.where = args.where;
        }

        if (args.orderBy) {
          listOptions.orderBy = args.orderBy;
        }

        const results = await collection.list(listOptions);
        const total = await collection.count({ where: args.where || {} });

        return {
          data: results,
          meta: {
            total,
            limit: listOptions.limit,
            offset: listOptions.offset,
            count: results.length,
          },
        };
      }

      case 'get': {
        if (!args.id && !args.slug) {
          throw new Error('Either id or slug is required');
        }

        const filter = args.id ? args.id : args.slug;
        const item = await collection.get(filter);

        if (!item) {
          throw new Error('Object not found');
        }

        return item;
      }

      case 'create': {
        // Add user context if available
        const createData = { ...args };
        if (this.context.user) {
          createData.created_by = this.context.user.id;
          createData.owner_id = this.context.user.id;
        }

        const newItem = await collection.create(createData);
        await newItem.save();

        return newItem;
      }

      case 'update': {
        const { id, ...updateData } = args;
        if (!id) {
          throw new Error('ID is required for update');
        }

        const existing = await collection.get(id);
        if (!existing) {
          throw new Error('Object not found');
        }

        // Update properties
        Object.assign(existing, updateData);

        // Add user context
        if (this.context.user) {
          (existing as any).updated_by = this.context.user.id;
        }

        await existing.save();

        return existing;
      }

      case 'delete': {
        if (!args.id) {
          throw new Error('ID is required for delete');
        }

        const toDelete = await collection.get(args.id);
        if (!toDelete) {
          throw new Error('Object not found');
        }

        await toDelete.delete();

        return { success: true, message: 'Object deleted successfully' };
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Generate MCP server info
   */
  getServerInfo() {
    return {
      name: this.config.server?.name,
      version: this.config.server?.version,
      description: this.config.description,
    };
  }
}
