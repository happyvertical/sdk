import { S as SmrtCollection } from "../chunks/collection-fcVk8Wh3.js";
import { O as ObjectRegistry } from "../chunks/registry-DirJKcgN.js";
class MCPGenerator {
  config;
  context;
  collections = /* @__PURE__ */ new Map();
  constructor(config = {}, context = {}) {
    this.config = {
      name: "smrt-mcp-server",
      version: "1.0.0",
      description: "Auto-generated MCP server from smrt objects",
      server: {
        name: "smrt-mcp",
        version: "1.0.0"
      },
      ...config
    };
    this.context = context;
  }
  /**
   * Generate all available tools from registered objects
   */
  generateTools() {
    const tools = [];
    const registeredClasses = ObjectRegistry.getAllClasses();
    for (const [name, _classInfo] of registeredClasses) {
      const config = ObjectRegistry.getConfig(name);
      const mcpConfig = config.mcp || {};
      const excluded = mcpConfig.exclude || [];
      const included = mcpConfig.include;
      const shouldInclude = (endpoint) => {
        if (included && !included.includes(endpoint)) return false;
        if (excluded.includes(endpoint)) return false;
        return true;
      };
      const objectTools = this.generateObjectTools(name, shouldInclude);
      tools.push(...objectTools);
    }
    return tools;
  }
  /**
   * Generate tools for a specific object
   */
  generateObjectTools(objectName, shouldInclude) {
    const tools = [];
    const fields = ObjectRegistry.getFields(objectName);
    const lowerName = objectName.toLowerCase();
    const classInfo = ObjectRegistry.getClass(objectName);
    if (shouldInclude("list")) {
      tools.push({
        name: `${lowerName}_list`,
        description: `List ${objectName} objects with optional filtering`,
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              description: "Maximum number of items to return",
              default: 50,
              minimum: 1,
              maximum: 1e3
            },
            offset: {
              type: "integer",
              description: "Number of items to skip",
              default: 0,
              minimum: 0
            },
            orderBy: {
              type: "string",
              description: 'Field to order by (e.g., "created_at DESC")'
            },
            where: {
              type: "object",
              description: "Filter conditions as key-value pairs",
              additionalProperties: true
            }
          }
        }
      });
    }
    if (shouldInclude("get")) {
      tools.push({
        name: `${lowerName}_get`,
        description: `Get a specific ${objectName} by ID or slug`,
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Unique identifier of the object"
            },
            slug: {
              type: "string",
              description: "URL-friendly identifier of the object"
            }
          },
          required: []
        }
      });
    }
    if (shouldInclude("create")) {
      const properties = {};
      const required = [];
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
          type: "object",
          properties,
          required
        }
      });
    }
    if (shouldInclude("update")) {
      const properties = {
        id: {
          type: "string",
          description: "ID of the object to update"
        }
      };
      for (const [fieldName, field] of fields) {
        properties[fieldName] = this.fieldToMCPSchema(field);
      }
      tools.push({
        name: `${lowerName}_update`,
        description: `Update an existing ${objectName}`,
        inputSchema: {
          type: "object",
          properties,
          required: ["id"]
        }
      });
    }
    if (shouldInclude("delete")) {
      tools.push({
        name: `${lowerName}_delete`,
        description: `Delete a ${objectName} by ID`,
        inputSchema: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "ID of the object to delete"
            }
          },
          required: ["id"]
        }
      });
    }
    if (classInfo) {
      const config = ObjectRegistry.getConfig(objectName);
      const mcpConfig = config.mcp || {};
      const included = mcpConfig.include;
      const excluded = mcpConfig.exclude || [];
      if (included) {
        for (const action of included) {
          if (["list", "get", "create", "update", "delete"].includes(action)) {
            continue;
          }
          if (excluded.includes(action)) {
            continue;
          }
          const isValid = this.validateCustomMethod(
            classInfo.constructor,
            action
          );
          if (isValid) {
            const toolName = `${lowerName}_${action}`;
            tools.push({
              name: toolName,
              description: `Execute ${action} action on ${objectName}`,
              inputSchema: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "ID of the object (optional for some actions)"
                  },
                  options: {
                    type: "object",
                    description: "Additional options for the custom action",
                    additionalProperties: true
                  }
                },
                required: []
              }
            });
          } else {
            console.warn(
              `Warning: Custom action '${action}' specified in MCP config for ${objectName}, but method ${action}() not found on class`
            );
          }
        }
      }
    }
    return tools;
  }
  /**
   * Convert field definition to MCP schema
   */
  fieldToMCPSchema(field) {
    const schema = {
      description: field.options?.description || `${field.type} field`
    };
    switch (field.type) {
      case "text":
        schema.type = "string";
        if (field.options?.maxLength)
          schema.maxLength = field.options.maxLength;
        if (field.options?.minLength)
          schema.minLength = field.options.minLength;
        break;
      case "integer":
        schema.type = "integer";
        if (field.options?.min !== void 0)
          schema.minimum = field.options.min;
        if (field.options?.max !== void 0)
          schema.maximum = field.options.max;
        break;
      case "decimal":
        schema.type = "number";
        if (field.options?.min !== void 0)
          schema.minimum = field.options.min;
        if (field.options?.max !== void 0)
          schema.maximum = field.options.max;
        break;
      case "boolean":
        schema.type = "boolean";
        break;
      case "datetime":
        schema.type = "string";
        schema.format = "date-time";
        break;
      case "json":
        schema.type = "object";
        break;
      case "foreignKey":
        schema.type = "string";
        schema.description = `ID of related ${field.options?.related || "object"}`;
        break;
      default:
        schema.type = "string";
    }
    if (field.options?.default !== void 0) {
      schema.default = field.options.default;
    }
    return schema;
  }
  /**
   * Validate that a custom method exists on a class
   */
  validateCustomMethod(classConstructor, methodName) {
    try {
      const prototype = classConstructor.prototype;
      if (typeof prototype[methodName] === "function") {
        return true;
      }
      if (typeof classConstructor[methodName] === "function") {
        return true;
      }
      return false;
    } catch (error) {
      console.warn(
        `Error validating method ${methodName} on class ${classConstructor.name}:`,
        error
      );
      return false;
    }
  }
  /**
   * Handle MCP tool calls
   */
  async handleToolCall(request) {
    const { name, arguments: args } = request.params;
    try {
      const [objectName, action] = name.split("_");
      if (!objectName || !action) {
        throw new Error(`Invalid tool name format: ${name}`);
      }
      const registeredClasses = ObjectRegistry.getAllClasses();
      let classInfo = null;
      let actualObjectName = "";
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
      const collection = this.getCollection(actualObjectName, classInfo);
      const result = await this.executeAction(collection, action, args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`
          }
        ]
      };
    }
  }
  /**
   * Get or create collection for an object
   */
  getCollection(objectName, classInfo) {
    if (!this.collections.has(objectName)) {
      if (!classInfo.collectionConstructor || typeof classInfo.collectionConstructor !== "function") {
        throw new Error(
          `No valid collection constructor found for ${objectName}`
        );
      }
      const collection2 = new classInfo.collectionConstructor({
        ai: this.context.ai,
        db: this.context.db
      });
      if (!(collection2 instanceof SmrtCollection)) {
        throw new Error(
          `Collection for ${objectName} must extend SmrtCollection`
        );
      }
      this.collections.set(objectName, collection2);
    }
    const collection = this.collections.get(objectName);
    if (!collection) {
      throw new Error(`Collection for ${objectName} not found`);
    }
    return collection;
  }
  /**
   * Execute action on collection
   */
  async executeAction(collection, action, args) {
    switch (action) {
      case "list": {
        const listOptions = {
          limit: Math.min(args.limit || 50, 1e3),
          offset: args.offset || 0
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
            count: results.length
          }
        };
      }
      case "get": {
        if (!args.id && !args.slug) {
          throw new Error("Either id or slug is required");
        }
        const filter = args.id ? args.id : args.slug;
        const item = await collection.get(filter);
        if (!item) {
          throw new Error("Object not found");
        }
        return item;
      }
      case "create": {
        const createData = { ...args };
        if (this.context.user) {
          createData.created_by = this.context.user.id;
          createData.owner_id = this.context.user.id;
        }
        const newItem = await collection.create(createData);
        await newItem.save();
        return newItem;
      }
      case "update": {
        const { id, ...updateData } = args;
        if (!id) {
          throw new Error("ID is required for update");
        }
        const existing = await collection.get(id);
        if (!existing) {
          throw new Error("Object not found");
        }
        Object.assign(existing, updateData);
        if (this.context.user) {
          existing.updated_by = this.context.user.id;
        }
        await existing.save();
        return existing;
      }
      case "delete": {
        if (!args.id) {
          throw new Error("ID is required for delete");
        }
        const toDelete = await collection.get(args.id);
        if (!toDelete) {
          throw new Error("Object not found");
        }
        await toDelete.delete();
        return { success: true, message: "Object deleted successfully" };
      }
      default:
        return this.executeCustomAction(collection, action, args);
    }
  }
  /**
   * Execute a custom action on a collection/object
   */
  async executeCustomAction(collection, action, args) {
    const { id, options = {}, ...directArgs } = args;
    try {
      if (id) {
        const object = await collection.get(id);
        if (!object) {
          throw new Error("Object not found");
        }
        if (typeof object[action] === "function") {
          const methodArgs = Object.keys(options).length > 0 ? options : directArgs;
          const result = await object[action](methodArgs);
          return result;
        } else {
          throw new Error(`Method '${action}' not found on object instance`);
        }
      } else {
        if (typeof collection[action] === "function") {
          const methodArgs = Object.keys(options).length > 0 ? options : directArgs;
          const result = await collection[action](methodArgs);
          return result;
        } else {
          throw new Error(
            `Method '${action}' not found on collection. For object-specific actions, provide an 'id' parameter.`
          );
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to execute custom action '${action}': ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
  /**
   * Generate MCP server info
   */
  getServerInfo() {
    return {
      name: this.config.server?.name,
      version: this.config.server?.version,
      description: this.config.description
    };
  }
}
export {
  MCPGenerator
};
//# sourceMappingURL=mcp.js.map
