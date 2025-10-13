# Generator Patterns: ObjectRegistry Usage Guide

This guide demonstrates how all SMRT generators use ObjectRegistry consistently to discover and process SMRT objects.

## Core Pattern: Discovery → Config → Fields → Generate

All generators follow this four-step pattern:

```typescript
// Step 1: Discover all registered objects
const registeredClasses = ObjectRegistry.getAllClasses();

// Step 2: For each class, get decorator configuration
for (const [name, classInfo] of registeredClasses) {
  const config = ObjectRegistry.getConfig(name);

  // Step 3: Get field definitions for schema generation
  const fields = ObjectRegistry.getFields(name);

  // Step 4: Generate code based on config and fields
  generateCodeForObject(name, config, fields);
}
```

This consistent pattern ensures all generators produce compatible outputs from the same source of truth.

## CLIGenerator: Zero-Config CLI Commands

**Location**: `src/generators/cli.ts`

### ObjectRegistry Usage

The CLIGenerator uses ObjectRegistry to discover objects and automatically generate CLI commands without manual registration:

```typescript
private generateCommands(): CLICommand[] {
  const commands: CLICommand[] = [];

  // ✅ Step 1: Discover all registered objects
  const registeredClasses = ObjectRegistry.getAllClasses();
  // Returns: Map<string, ClassInfo> with all @smrt() decorated classes

  // ✅ Step 2: Generate commands for each object
  for (const [name, classInfo] of registeredClasses) {
    commands.push(...this.generateObjectCommands(name, classInfo));
  }

  // Add utility commands (objects, schema, help, etc.)
  commands.push(...this.generateUtilityCommands());

  return commands;
}
```

**Location in code**: Lines 115-128

### Config-Driven Command Generation

```typescript
private generateObjectCommands(objectName: string, _classInfo: any): CLICommand[] {
  const commands: CLICommand[] = [];
  const lowerName = objectName.toLowerCase();

  // ✅ Get decorator configuration
  const config = ObjectRegistry.getConfig(objectName);
  const cliConfig = config.cli;

  // Skip if CLI is disabled
  if (cliConfig === false) return commands;

  // Check included/excluded commands
  const excluded = (typeof cliConfig === 'object' ? cliConfig.exclude : []) || [];
  const included = typeof cliConfig === 'object' ? cliConfig.include : null;

  const shouldInclude = (command: 'list' | 'get' | 'create' | 'update' | 'delete') => {
    if (included && !included.includes(command)) return false;
    if (excluded.includes(command)) return false;
    return true;
  };

  // Generate LIST command if included
  if (shouldInclude('list')) {
    commands.push({
      name: `${lowerName}:list`,
      description: `List ${objectName} objects`,
      // ... command configuration
    });
  }

  // Generate CREATE command if included
  if (shouldInclude('create')) {
    // ✅ Get field definitions for options
    const fields = ObjectRegistry.getFields(objectName);

    const options: Record<string, any> = {};
    for (const [fieldName, field] of fields) {
      const optionName = fieldName.replace(/_/g, '-');
      options[optionName] = {
        type: 'string',
        description: field.options?.description || `${objectName} ${fieldName}`
      };
    }

    commands.push({
      name: `${lowerName}:create`,
      description: `Create new ${objectName}`,
      options,
      handler: async (_args, options) => {
        await this.handleCreate(objectName, options);
      }
    });
  }

  // Similar for update, delete, etc...

  return commands;
}
```

**Location in code**: Lines 133-289

### Zero-Config Benefits

```bash
# Developer workflow:
# 1. Define SMRT object
@smrt({ cli: true })
class Product extends SmrtObject {
  name = text({ required: true });
  price = decimal({ min: 0 });
}

# 2. Run CLI (no configuration needed!)
npx smrt objects           # Auto-discovers Product
npx smrt product:list      # Auto-generated command
npx smrt product:create --name "Widget" --price 29.99
```

**Key Points**:
- ✅ No manual command registration required
- ✅ Field-based CLI options auto-generated
- ✅ Respects `cli` config (`include`, `exclude`)
- ✅ Works in any project with SMRT objects

## APIGenerator: Auto-Discovered REST Endpoints

**Location**: `src/generators/rest.ts`

### ObjectRegistry Usage

The APIGenerator uses ObjectRegistry as a fallback when no explicit collection is registered:

```typescript
private async handleObjectRoute(req: Request, url: URL): Promise<Response> {
  const pathParts = url.pathname
    .replace(this.config.basePath!, '')
    .split('/')
    .filter(Boolean);

  const objectType = pathParts[0];  // e.g., 'products'
  const objectId = pathParts[1];     // e.g., '123'

  // Check for explicitly registered collection first
  if (this.collections.has(objectType)) {
    const collection = this.collections.get(objectType)!;
    return await this.executeCrudOperation(req, collection, objectId, url);
  }

  // ✅ Fall back to auto-discovery via ObjectRegistry
  const registeredClasses = ObjectRegistry.getAllClasses();
  const pluralName = this.pluralize(objectType);

  let classInfo: any = null;
  for (const [name, info] of registeredClasses) {
    if (this.pluralize(name.toLowerCase()) === pluralName) {
      classInfo = info;
      break;
    }
  }

  if (!classInfo) {
    return this.createErrorResponse(404, `Object type '${objectType}' not found`);
  }

  // Get or create collection
  const collection = this.getCollection(classInfo);

  return await this.executeCrudOperation(req, collection, objectId, url);
}
```

**Location in code**: Lines 193-265

### Dual Pattern: Explicit + Auto-Discovery

The APIGenerator supports two patterns:

**Pattern 1: Explicit Registration** (manual control):
```typescript
const api = new APIGenerator({ basePath: '/api/v1' });

// Manually register collection
const productCollection = await ProductCollection.create({ db, ai });
api.registerCollection('products', productCollection);

// Manually register another collection
const categoryCollection = await CategoryCollection.create({ db, ai });
api.registerCollection('categories', categoryCollection);
```

**Pattern 2: Auto-Discovery** (zero-config):
```typescript
// Just start the server - ObjectRegistry discovers all objects
const { shutdown } = await startRestServer(
  [Product, Category],  // Classes are registered via @smrt() decorator
  {},                   // context
  { port: 3000 }        // config
);

// Automatically generates:
// GET    /api/v1/products
// POST   /api/v1/products
// GET    /api/v1/products/:id
// PUT    /api/v1/products/:id
// DELETE /api/v1/products/:id
```

### Config-Driven Endpoint Generation

```typescript
// The API respects decorator configuration
@smrt({
  api: {
    include: ['list', 'get', 'create', 'update'],
    exclude: ['delete']  // No DELETE endpoint generated
  }
})
class Product extends SmrtObject { }

// Generated endpoints:
// ✅ GET    /api/v1/products       (list)
// ✅ GET    /api/v1/products/:id   (get)
// ✅ POST   /api/v1/products       (create)
// ✅ PUT    /api/v1/products/:id   (update)
// ❌ DELETE /api/v1/products/:id   (excluded)
```

**Key Points**:
- ✅ Explicit registration for fine-grained control
- ✅ Auto-discovery for zero-config REST APIs
- ✅ Respects `api` config (`include`, `exclude`)
- ✅ Collection caching for performance

## MCPGenerator: AI Tool Generation

**Location**: `src/generators/mcp.ts`

### ObjectRegistry Usage

The MCPGenerator generates MCP tools by discovering objects and respecting their `mcp` configuration:

```typescript
generateTools(): MCPTool[] {
  const tools: MCPTool[] = [];

  // ✅ Step 1: Discover all registered objects
  const registeredClasses = ObjectRegistry.getAllClasses();

  for (const [name, _classInfo] of registeredClasses) {
    // ✅ Step 2: Get decorator configuration
    const config = ObjectRegistry.getConfig(name);
    const mcpConfig = config.mcp || {};

    // Skip excluded endpoints
    const excluded = mcpConfig.exclude || [];
    const included = mcpConfig.include;

    const shouldInclude = (endpoint: string) => {
      if (included && !included.includes(endpoint)) return false;
      if (excluded.includes(endpoint)) return false;
      return true;
    };

    // ✅ Step 3: Generate tools for this object
    const objectTools = this.generateObjectTools(name, shouldInclude);
    tools.push(...objectTools);
  }

  return tools;
}
```

**Location in code**: Lines 80-103

### Field-Driven Tool Schema

```typescript
private generateObjectTools(
  objectName: string,
  shouldInclude: (endpoint: string) => boolean
): MCPTool[] {
  const tools: MCPTool[] = [];

  // ✅ Get field definitions for schema generation
  const fields = ObjectRegistry.getFields(objectName);
  const lowerName = objectName.toLowerCase();
  const classInfo = ObjectRegistry.getClass(objectName);

  // CREATE tool with field-based schema
  if (shouldInclude('create')) {
    const properties: Record<string, any> = {};
    const required: string[] = [];

    // ✅ Convert fields to MCP schema
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
        required
      }
    });
  }

  // Similar for list, get, update, delete...

  return tools;
}
```

**Location in code**: Lines 108-296

### Custom Action Support

The MCPGenerator validates custom methods before generating tools:

```typescript
// CUSTOM ACTIONS
if (classInfo) {
  const config = ObjectRegistry.getConfig(objectName);
  const mcpConfig = config.mcp || {};
  const included = mcpConfig.include;
  const excluded = mcpConfig.exclude || [];

  // If specific actions are included, check for custom actions
  if (included) {
    for (const action of included) {
      // Skip standard CRUD actions (already handled above)
      if (['list', 'get', 'create', 'update', 'delete'].includes(action)) {
        continue;
      }

      // Skip if excluded
      if (excluded.includes(action)) {
        continue;
      }

      // ✅ Validate that the method exists on the class
      const isValid = this.validateCustomMethod(classInfo.constructor, action);

      if (isValid) {
        const toolName = `${lowerName}_${action}`;
        tools.push({
          name: toolName,
          description: `Execute ${action} action on ${objectName}`,
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'ID of the object (optional for some actions)'
              },
              options: {
                type: 'object',
                description: 'Additional options for the custom action',
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
```

**Location in code**: Lines 239-293

### Example: Custom Actions

```typescript
@smrt({
  mcp: {
    include: ['list', 'get', 'analyze', 'summarize']  // Custom actions
  }
})
class Document extends SmrtObject {
  content = text();

  // Custom action method
  async analyze(options: any = {}) {
    const analysisType = options.type || 'general';
    return {
      action: 'analyze',
      results: await this.ai.message(`Analyze: ${this.content}`),
      type: analysisType
    };
  }

  // Another custom action
  async summarize(options: any = {}) {
    const length = options.length || 'medium';
    return {
      action: 'summarize',
      summary: await this.ai.message(`Summarize in ${length} length: ${this.content}`)
    };
  }
}

// Generated MCP tools:
// ✅ document_list      (CRUD)
// ✅ document_get       (CRUD)
// ✅ document_analyze   (Custom - method exists)
// ✅ document_summarize (Custom - method exists)
```

**Key Points**:
- ✅ Auto-generates MCP tools from ObjectRegistry
- ✅ Respects `mcp` config (`include`, `exclude`)
- ✅ Validates custom methods before generating tools
- ✅ Field definitions converted to JSON Schema

## SwaggerGenerator: OpenAPI Spec Generation

**Location**: `src/generators/swagger.ts`

### ObjectRegistry Usage

The SwaggerGenerator creates OpenAPI specifications from registered objects:

```typescript
function generateSchemas(): Record<string, any> {
  const schemas: Record<string, any> = {};

  // ✅ Step 1: Discover all registered objects
  const registeredClasses = ObjectRegistry.getAllClasses();

  for (const [name] of registeredClasses) {
    // ✅ Step 2: Generate schema for this object
    schemas[name] = generateObjectSchema(name);

    // Also generate list response schema
    schemas[`${name}List`] = {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: `#/components/schemas/${name}` }
        },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
            count: { type: 'integer' }
          }
        }
      }
    };
  }

  return schemas;
}
```

### Field-Driven Schema Generation

```typescript
function generateObjectSchema(objectName: string) {
  // ✅ Get field definitions
  const fields = ObjectRegistry.getFields(objectName);

  const properties: Record<string, any> = {
    id: { type: 'string', format: 'uuid' },
    slug: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' }
  };

  const required = ['id'];

  // ✅ Convert fields to OpenAPI schema
  for (const [fieldName, field] of fields) {
    properties[fieldName] = fieldToOpenAPISchema(field);
    if (field.options?.required) {
      required.push(fieldName);
    }
  }

  return { type: 'object', properties, required };
}
```

### Config-Driven Path Generation

```typescript
function generatePaths(basePath: string) {
  const paths: Record<string, any> = {};

  // ✅ Discover all registered objects
  const registeredClasses = ObjectRegistry.getAllClasses();

  for (const [name] of registeredClasses) {
    const pluralName = pluralize(name.toLowerCase());
    const objectPath = `${basePath}/${pluralName}`;

    // ✅ Get decorator configuration
    const config = ObjectRegistry.getConfig(name);
    const apiConfig = config.api || {};

    const excluded = apiConfig.exclude || [];
    const included = apiConfig.include;

    const shouldInclude = (endpoint: string) => {
      if (included && !included.includes(endpoint)) return false;
      if (excluded.includes(endpoint)) return false;
      return true;
    };

    paths[objectPath] = {};

    // Generate LIST endpoint if included
    if (shouldInclude('list')) {
      paths[objectPath].get = {
        summary: `List ${name} objects`,
        tags: [name],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }
        ],
        responses: {
          '200': {
            description: 'Success',
            content: {
              'application/json': {
                schema: { $ref: `#/components/schemas/${name}List` }
              }
            }
          }
        }
      };
    }

    // Similar for create, get, update, delete...
  }

  return paths;
}
```

**Key Points**:
- ✅ Auto-generates OpenAPI spec from ObjectRegistry
- ✅ Respects `api` config (same as APIGenerator)
- ✅ Field definitions converted to OpenAPI schema
- ✅ Consistent with REST API structure

## Consistency Guarantees

### 1. Identical Discovery Pattern

All generators start the same way:

```typescript
// ✅ ALWAYS start with this
const registeredClasses = ObjectRegistry.getAllClasses();

// ✅ ALWAYS loop through classes
for (const [name, classInfo] of registeredClasses) {
  // Generator-specific logic
}
```

### 2. Unified Config Access

All generators check decorator config consistently:

```typescript
// ✅ ALWAYS get config
const config = ObjectRegistry.getConfig(objectName);

// ✅ ALWAYS check generator-specific config
const generatorConfig = config[generatorType] || {};
// where generatorType is 'api', 'mcp', 'cli', or 'swagger'

// ✅ ALWAYS implement shouldInclude logic
const shouldInclude = (endpoint: string) => {
  if (included && !included.includes(endpoint)) return false;
  if (excluded.includes(endpoint)) return false;
  return true;
};
```

### 3. Field Schema Consistency

All generators use identical field definitions:

```typescript
// ✅ ALWAYS get fields the same way
const fields = ObjectRegistry.getFields(objectName);

// ✅ ALWAYS iterate fields the same way
for (const [fieldName, field] of fields) {
  // Convert to generator-specific schema
  const schema = fieldToSchema(field);
  // Use field.options for metadata
  const required = field.options?.required;
  const description = field.options?.description;
}
```

### 4. Custom Action Pattern

All generators validate custom actions consistently:

```typescript
// ✅ ALWAYS check if action is standard CRUD
if (['list', 'get', 'create', 'update', 'delete'].includes(action)) {
  // Handle standard action
}

// ✅ ALWAYS validate custom methods exist
const isValid = validateCustomMethod(classConstructor, methodName);

if (isValid) {
  // Generate tool/endpoint/command
} else {
  console.warn(`Warning: Custom action '${action}' specified but method not found`);
}
```

## Best Practices for Generator Development

### 1. Always Use ObjectRegistry

```typescript
// ✅ DO THIS
const classes = ObjectRegistry.getAllClasses();
const config = ObjectRegistry.getConfig(name);
const fields = ObjectRegistry.getFields(name);

// ❌ DON'T DO THIS
const classes = [Product, Category];  // Hardcoded
const config = Product.config;         // Direct access
const fields = Product.fields;         // Not registry
```

### 2. Respect Decorator Configuration

```typescript
// ✅ DO THIS - Check config
const config = ObjectRegistry.getConfig(name);
if (config.cli === false) return;  // Skip if disabled

const included = config.cli?.include;
const excluded = config.cli?.exclude || [];

// ❌ DON'T DO THIS - Ignore config
generateAllCommands();  // Generates even if excluded
```

### 3. Validate Custom Actions

```typescript
// ✅ DO THIS - Validate before generating
const isValid = this.validateCustomMethod(classConstructor, action);
if (isValid) {
  generateTool(action);
} else {
  console.warn(`Method '${action}' not found`);
}

// ❌ DON'T DO THIS - Assume method exists
generateTool(action);  // Will fail at runtime if missing
```

### 4. Use Field Definitions for Schema

```typescript
// ✅ DO THIS - Use registry fields
const fields = ObjectRegistry.getFields(objectName);
for (const [fieldName, field] of fields) {
  const schema = fieldToSchema(field);
  // Use field.options for validation rules
}

// ❌ DON'T DO THIS - Hardcode schema
const schema = {
  name: { type: 'string' },
  price: { type: 'number' }
};
```

### 5. Implement shouldInclude Helper

```typescript
// ✅ DO THIS - Standard pattern
const shouldInclude = (endpoint: string) => {
  if (included && !included.includes(endpoint)) return false;
  if (excluded.includes(endpoint)) return false;
  return true;
};

// Use consistently
if (shouldInclude('list')) {
  generateListOperation();
}

// ❌ DON'T DO THIS - Inconsistent logic
if (config.api?.include?.includes('list')) {
  generateListOperation();
}
if (!config.api?.exclude?.includes('get')) {
  generateGetOperation();
}
```

## Creating Custom Generators

Follow this template for new generators:

```typescript
import { ObjectRegistry } from '../registry';

export class CustomGenerator {
  generateCustomArtifacts(): CustomArtifact[] {
    const artifacts: CustomArtifact[] = [];

    // ✅ Step 1: Discover all registered objects
    const registeredClasses = ObjectRegistry.getAllClasses();

    for (const [name, classInfo] of registeredClasses) {
      // ✅ Step 2: Get decorator configuration
      const config = ObjectRegistry.getConfig(name);
      const customConfig = config.custom || {};  // Your custom config

      // Skip if disabled
      if (customConfig === false) continue;

      // ✅ Step 3: Get field definitions
      const fields = ObjectRegistry.getFields(name);

      // ✅ Step 4: Check included/excluded operations
      const excluded = customConfig.exclude || [];
      const included = customConfig.include;

      const shouldInclude = (operation: string) => {
        if (included && !included.includes(operation)) return false;
        if (excluded.includes(operation)) return false;
        return true;
      };

      // ✅ Step 5: Generate your custom artifact
      if (shouldInclude('myOperation')) {
        artifacts.push(this.generateForObject(name, fields, config));
      }
    }

    return artifacts;
  }

  private generateForObject(
    objectName: string,
    fields: Map<string, FieldDefinition>,
    config: any
  ): CustomArtifact {
    // Your custom generation logic
    return {
      objectName,
      // ... generated artifact
    };
  }
}
```

## Summary

All SMRT generators follow the **Discovery → Config → Fields → Generate** pattern:

1. **Discovery**: `ObjectRegistry.getAllClasses()` - Find all registered objects
2. **Config**: `ObjectRegistry.getConfig(name)` - Get decorator configuration
3. **Fields**: `ObjectRegistry.getFields(name)` - Get field definitions
4. **Generate**: Use config and fields to generate code

This consistency ensures:
- ✅ All generators produce compatible outputs
- ✅ Decorator configuration is respected everywhere
- ✅ Field definitions are used identically
- ✅ Custom actions are validated consistently
- ✅ Zero-config consumption just works

**Key Takeaway**: The ObjectRegistry is the single source of truth that enables the SMRT framework's core value proposition: **Define once, generate everywhere.**
