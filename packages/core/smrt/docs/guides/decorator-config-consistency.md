# Decorator Configuration Consistency Guide

This document outlines the consistent configuration pattern used across all SMRT generators (REST API, MCP, CLI, Swagger) to ensure uniform behavior and predictable results.

## Core Configuration Pattern

All generators follow the same configuration extraction and filtering logic:

```typescript
// 1. Get configuration from ObjectRegistry
const config = ObjectRegistry.getConfig(objectName);
const generatorConfig = config.generatorName || {};

// 2. Extract include/exclude lists
const excluded = generatorConfig.exclude || [];
const included = generatorConfig.include;

// 3. Define shouldInclude helper
const shouldInclude = (endpoint: string) => {
  // If include list specified, endpoint must be in it
  if (included && !included.includes(endpoint)) return false;

  // If endpoint is excluded, reject it
  if (excluded.includes(endpoint)) return false;

  // Otherwise, include it
  return true;
};

// 4. Apply filtering to CRUD operations
if (shouldInclude('list')) {
  // Generate list endpoint/tool/command
}
if (shouldInclude('get')) {
  // Generate get endpoint/tool/command
}
// ... and so on for create, update, delete
```

## Decorator Configuration Format

The `@smrt()` decorator accepts configuration for each generator:

```typescript
import { smrt, SmrtObject } from '@have/smrt';
import { text, decimal, foreignKey } from '@have/smrt/fields';

@smrt({
  api: {
    include: ['list', 'get', 'create', 'update'],
    exclude: ['delete']
  },
  mcp: {
    include: ['list', 'get', 'analyze'],
    exclude: ['create', 'update', 'delete']
  },
  cli: {
    include: ['list', 'get', 'create', 'update', 'delete'],
    exclude: []
  },
  swagger: true  // Boolean shorthand (true = generate, false = skip)
})
class Product extends SmrtObject {
  name = text({ required: true });
  price = decimal({ min: 0 });

  // Custom action method
  async analyze(options: any = {}) {
    return { analysis: 'results' };
  }
}
```

## Configuration Schema

Each generator configuration follows this schema:

```typescript
interface GeneratorConfig {
  // Explicit whitelist of operations to include
  include?: Array<'list' | 'get' | 'create' | 'update' | 'delete' | string>;

  // Blacklist of operations to exclude (higher priority than include)
  exclude?: string[];
}

interface SmartObjectConfig {
  // REST API configuration
  api?: GeneratorConfig | false;

  // MCP (Model Context Protocol) configuration
  mcp?: GeneratorConfig | false;

  // CLI configuration
  cli?: GeneratorConfig | false | true;

  // Swagger/OpenAPI documentation configuration
  swagger?: boolean | GeneratorConfig;
}
```

## Include/Exclude Priority Rules

All generators follow these consistent priority rules:

### Rule 1: Exclude Takes Priority

```typescript
@smrt({
  api: {
    include: ['list', 'get', 'delete'],
    exclude: ['delete']  // ← This wins
  }
})
// Result: Only 'list' and 'get' are generated (delete excluded despite being in include)
```

### Rule 2: Include is Whitelist (When Specified)

```typescript
@smrt({
  api: {
    include: ['list', 'get']  // Explicit whitelist
    // No exclude needed
  }
})
// Result: Only 'list' and 'get' (create, update, delete not included)
```

### Rule 3: No Include = All Operations (Except Excluded)

```typescript
@smrt({
  api: {
    exclude: ['delete']  // Only exclude delete
    // No include list = include everything else
  }
})
// Result: list, get, create, update (all except delete)
```

### Rule 4: Empty Config = All Operations

```typescript
@smrt({
  api: {}  // Empty object
})
// Result: list, get, create, update, delete (everything)
```

### Rule 5: False = Disable Generator

```typescript
@smrt({
  api: false,  // Completely disable REST API
  mcp: false,  // Completely disable MCP tools
  cli: false   // Completely disable CLI commands
})
// Result: No endpoints, tools, or commands generated
```

## Consistent Implementation Across Generators

### REST API Generator (rest.ts)

```typescript
// Location: src/generators/rest.ts:206-265

private async handleObjectRoute(req: Request, url: URL): Promise<Response> {
  // ... route parsing ...

  // Check decorator configuration
  const config = ObjectRegistry.getConfig(objectType);
  const apiConfig = config.api || {};

  // Apply include/exclude filtering
  const excluded = apiConfig.exclude || [];
  const included = apiConfig.include;

  const shouldInclude = (endpoint: string) => {
    if (included && !included.includes(endpoint)) return false;
    if (excluded.includes(endpoint)) return false;
    return true;
  };

  // Route to appropriate CRUD operation (if included)
  switch (req.method) {
    case 'GET':
      if (!shouldInclude('list') && !objectId) {
        return this.createErrorResponse(403, 'List operation not allowed');
      }
      if (!shouldInclude('get') && objectId) {
        return this.createErrorResponse(403, 'Get operation not allowed');
      }
      return objectId
        ? await this.handleGet(collection, objectId)
        : await this.handleList(collection, url.searchParams);

    case 'POST':
      if (!shouldInclude('create')) {
        return this.createErrorResponse(403, 'Create operation not allowed');
      }
      return await this.handleCreate(collection, req);

    case 'PUT':
    case 'PATCH':
      if (!shouldInclude('update')) {
        return this.createErrorResponse(403, 'Update operation not allowed');
      }
      return await this.handleUpdate(collection, objectId, req);

    case 'DELETE':
      if (!shouldInclude('delete')) {
        return this.createErrorResponse(403, 'Delete operation not allowed');
      }
      return await this.handleDelete(collection, objectId);

    default:
      return this.createErrorResponse(405, 'Method not allowed');
  }
}
```

### MCP Generator (mcp.ts)

```typescript
// Location: src/generators/mcp.ts:80-102

generateTools(): MCPTool[] {
  const tools: MCPTool[] = [];
  const registeredClasses = ObjectRegistry.getAllClasses();

  for (const [name, _classInfo] of registeredClasses) {
    const config = ObjectRegistry.getConfig(name);
    const mcpConfig = config.mcp || {};

    // Extract include/exclude lists
    const excluded = mcpConfig.exclude || [];
    const included = mcpConfig.include;

    // Consistent filtering logic
    const shouldInclude = (endpoint: string) => {
      if (included && !included.includes(endpoint)) return false;
      if (excluded.includes(endpoint)) return false;
      return true;
    };

    const objectTools = this.generateObjectTools(name, shouldInclude);
    tools.push(...objectTools);
  }

  return tools;
}

private generateObjectTools(
  objectName: string,
  shouldInclude: (endpoint: string) => boolean
): MCPTool[] {
  const tools: MCPTool[] = [];
  const lowerName = objectName.toLowerCase();

  // LIST tool
  if (shouldInclude('list')) {
    tools.push({
      name: `${lowerName}_list`,
      description: `List ${objectName} objects with optional filtering`,
      // ... schema definition
    });
  }

  // GET tool
  if (shouldInclude('get')) {
    tools.push({
      name: `${lowerName}_get`,
      description: `Get a specific ${objectName} by ID or slug`,
      // ... schema definition
    });
  }

  // CREATE tool
  if (shouldInclude('create')) {
    tools.push({
      name: `${lowerName}_create`,
      description: `Create a new ${objectName}`,
      // ... schema definition
    });
  }

  // UPDATE tool
  if (shouldInclude('update')) {
    tools.push({
      name: `${lowerName}_update`,
      description: `Update an existing ${objectName}`,
      // ... schema definition
    });
  }

  // DELETE tool
  if (shouldInclude('delete')) {
    tools.push({
      name: `${lowerName}_delete`,
      description: `Delete a ${objectName} by ID`,
      // ... schema definition
    });
  }

  return tools;
}
```

### CLI Generator (cli.ts)

```typescript
// Location: src/generators/cli.ts:132-289

private generateObjectCommands(
  objectName: string,
  _classInfo: any
): CLICommand[] {
  const commands: CLICommand[] = [];
  const lowerName = objectName.toLowerCase();
  const config = ObjectRegistry.getConfig(objectName);
  const cliConfig = config.cli;

  // Skip if CLI is completely disabled
  if (cliConfig === false) return commands;

  // Extract include/exclude lists
  const excluded =
    (typeof cliConfig === 'object' ? cliConfig.exclude : []) || [];
  const included = typeof cliConfig === 'object' ? cliConfig.include : null;

  // Consistent filtering logic
  const shouldInclude = (
    command: 'list' | 'get' | 'create' | 'update' | 'delete'
  ) => {
    if (included && !included.includes(command)) return false;
    if (excluded.includes(command)) return false;
    return true;
  };

  // LIST command
  if (shouldInclude('list')) {
    commands.push({
      name: `${lowerName}:list`,
      description: `List ${objectName} objects`,
      aliases: [`${lowerName}:ls`],
      options: { /* ... */ },
      handler: async (_args, options) => {
        await this.handleList(objectName, options);
      }
    });
  }

  // GET command
  if (shouldInclude('get')) {
    commands.push({
      name: `${lowerName}:get`,
      description: `Get ${objectName} by ID or slug`,
      aliases: [`${lowerName}:show`],
      args: ['id'],
      handler: async (args, options) => {
        await this.handleGet(objectName, args[0], options);
      }
    });
  }

  // CREATE command
  if (shouldInclude('create')) {
    commands.push({
      name: `${lowerName}:create`,
      description: `Create new ${objectName}`,
      aliases: [`${lowerName}:new`],
      handler: async (_args, options) => {
        await this.handleCreate(objectName, options);
      }
    });
  }

  // UPDATE command
  if (shouldInclude('update')) {
    commands.push({
      name: `${lowerName}:update`,
      description: `Update ${objectName}`,
      aliases: [`${lowerName}:edit`],
      args: ['id'],
      handler: async (args, options) => {
        await this.handleUpdate(objectName, args[0], options);
      }
    });
  }

  // DELETE command
  if (shouldInclude('delete')) {
    commands.push({
      name: `${lowerName}:delete`,
      description: `Delete ${objectName}`,
      aliases: [`${lowerName}:rm`],
      args: ['id'],
      handler: async (args, options) => {
        await this.handleDelete(objectName, args[0], options);
      }
    });
  }

  return commands;
}
```

### Swagger Generator (swagger.ts)

```typescript
// Location: src/generators/swagger.ts:195-196

const config = ObjectRegistry.getConfig(name);
const apiConfig = config.api || {};

// Uses same filtering logic as REST API generator
// Swagger only documents endpoints that API generator would expose
```

## Custom Actions Configuration

All generators support custom actions beyond CRUD operations:

### Defining Custom Actions

```typescript
@smrt({
  api: {
    include: ['list', 'get', 'analyze', 'summarize']  // Include custom actions
  },
  mcp: {
    include: ['list', 'get', 'analyze', 'transform']  // Different custom actions
  },
  cli: {
    include: ['list', 'get', 'create', 'analyze']  // CLI includes create + analyze
  }
})
class Document extends SmrtObject {
  title = text({ required: true });
  content = text({ required: true });

  // Custom action 1: AI analysis
  async analyze(options: any = {}) {
    const analysisType = options.type || 'general';
    return {
      action: 'analyze',
      type: analysisType,
      results: await this.ai.message(`Analyze: ${this.content}`)
    };
  }

  // Custom action 2: Summarization
  async summarize(options: any = {}) {
    const length = options.length || 'medium';
    return {
      action: 'summarize',
      summary: await this.ai.message(`Summarize: ${this.content}`),
      length
    };
  }

  // Custom action 3: Content transformation
  async transform(options: any = {}) {
    return {
      action: 'transform',
      transformed: await this.do(options.instructions),
      original: this.content
    };
  }
}
```

### Custom Action Validation

All generators validate that custom actions exist as methods:

```typescript
// MCP Generator: src/generators/mcp.ts:240-293

// If specific actions are included, check for custom actions
if (included) {
  for (const action of included) {
    // Skip standard CRUD actions (already handled)
    if (['list', 'get', 'create', 'update', 'delete'].includes(action)) {
      continue;
    }

    // Skip if excluded
    if (excluded.includes(action)) {
      continue;
    }

    // Validate that the method exists on the class
    const isValid = this.validateCustomMethod(classInfo.constructor, action);

    if (isValid) {
      // Generate tool for custom action
      tools.push({
        name: `${lowerName}_${action}`,
        description: `Execute ${action} action on ${objectName}`,
        inputSchema: { /* ... */ }
      });
    } else {
      console.warn(
        `Warning: Custom action '${action}' specified in MCP config for ${objectName}, ` +
        `but method ${action}() not found on class`
      );
    }
  }
}
```

### Custom Action Endpoints

**REST API**:
- Standard CRUD: `GET /products`, `POST /products`, `PUT /products/:id`
- Custom actions: `POST /products/:id/analyze`, `POST /products/:id/summarize`

**MCP Tools**:
- Standard CRUD: `product_list`, `product_get`, `product_create`
- Custom actions: `product_analyze`, `product_summarize`, `product_transform`

**CLI Commands**:
- Standard CRUD: `products:list`, `products:get`, `products:create`
- Custom actions: `products:analyze`, `products:summarize`

## Configuration Examples

### Example 1: Read-Only Object

```typescript
@smrt({
  api: {
    include: ['list', 'get'],  // Only read operations
    exclude: []
  },
  mcp: {
    include: ['list', 'get'],  // AI can only read
    exclude: []
  },
  cli: {
    include: ['list', 'get'],  // Admin can only read
    exclude: []
  }
})
class AuditLog extends SmrtObject {
  timestamp = datetime({ required: true });
  action = text({ required: true });
  userId = foreignKey('User');
}
```

### Example 2: AI-Only Operations

```typescript
@smrt({
  api: false,  // No REST API
  mcp: {
    include: ['list', 'get', 'analyze', 'classify']  // AI-only tools
  },
  cli: false  // No CLI commands
})
class MLDataset extends SmrtObject {
  data = json({ required: true });

  async analyze(options: any) {
    return { analysis: 'results' };
  }

  async classify(options: any) {
    return { classification: 'category' };
  }
}
```

### Example 3: Admin-Only Management

```typescript
@smrt({
  api: {
    include: ['list', 'get'],  // Public API: read-only
    exclude: ['create', 'update', 'delete']
  },
  mcp: false,  // No AI access
  cli: {
    include: ['list', 'get', 'create', 'update', 'delete']  // Admin: full control
  }
})
class SystemConfig extends SmrtObject {
  key = text({ required: true, unique: true });
  value = text({ required: true });
  encrypted = boolean({ default: false });
}
```

### Example 4: Different Capabilities Per Interface

```typescript
@smrt({
  api: {
    // Public API: List, get, create (users can create accounts)
    include: ['list', 'get', 'create'],
    exclude: ['update', 'delete']
  },
  mcp: {
    // AI: Read and analyze only
    include: ['list', 'get', 'analyze'],
    exclude: ['create', 'update', 'delete']
  },
  cli: {
    // Admin CLI: Full control
    include: ['list', 'get', 'create', 'update', 'delete']
  }
})
class User extends SmrtObject {
  email = text({ required: true, unique: true });
  name = text({ required: true });
  role = text({ default: 'user' });

  async analyze(options: any) {
    return {
      accountAge: Date.now() - this.created_at.getTime(),
      role: this.role,
      activityScore: 0.85
    };
  }
}
```

## Testing Configuration Consistency

All generators should behave identically given the same configuration:

```typescript
import { describe, it, expect } from 'vitest';
import { ObjectRegistry } from '@have/smrt';
import { APIGenerator, MCPGenerator, CLIGenerator } from '@have/smrt/generators';

describe('Configuration Consistency', () => {
  it('should apply include filter consistently', () => {
    @smrt({
      api: { include: ['list', 'get'] },
      mcp: { include: ['list', 'get'] },
      cli: { include: ['list', 'get'] }
    })
    class TestObject extends SmrtObject {
      name = text({ required: true });
    }

    // REST API
    const apiGen = new APIGenerator();
    const apiEndpoints = getGeneratedEndpoints(apiGen, 'TestObject');
    expect(apiEndpoints).toEqual(['GET /testobjects', 'GET /testobjects/:id']);

    // MCP
    const mcpGen = new MCPGenerator();
    const mcpTools = mcpGen.generateTools();
    const testObjectTools = mcpTools.filter(t => t.name.startsWith('testobject_'));
    expect(testObjectTools.map(t => t.name)).toEqual(['testobject_list', 'testobject_get']);

    // CLI
    const cliGen = new CLIGenerator();
    const cliCommands = getGeneratedCommands(cliGen, 'TestObject');
    expect(cliCommands).toEqual(['testobject:list', 'testobject:get']);
  });

  it('should apply exclude filter consistently', () => {
    @smrt({
      api: { exclude: ['delete'] },
      mcp: { exclude: ['delete'] },
      cli: { exclude: ['delete'] }
    })
    class TestObject extends SmrtObject {
      name = text({ required: true });
    }

    // All generators should include list, get, create, update
    // None should include delete

    // REST API
    const apiGen = new APIGenerator();
    const apiEndpoints = getGeneratedEndpoints(apiGen, 'TestObject');
    expect(apiEndpoints).not.toContain('DELETE /testobjects/:id');

    // MCP
    const mcpGen = new MCPGenerator();
    const mcpTools = mcpGen.generateTools();
    const deleteTools = mcpTools.filter(t => t.name === 'testobject_delete');
    expect(deleteTools).toHaveLength(0);

    // CLI
    const cliGen = new CLIGenerator();
    const cliCommands = getGeneratedCommands(cliGen, 'TestObject');
    expect(cliCommands).not.toContain('testobject:delete');
  });

  it('should handle custom actions consistently', () => {
    @smrt({
      api: { include: ['list', 'get', 'analyze'] },
      mcp: { include: ['list', 'get', 'analyze'] },
      cli: { include: ['list', 'get', 'analyze'] }
    })
    class TestObject extends SmrtObject {
      name = text({ required: true });

      async analyze(options: any) {
        return { result: 'analyzed' };
      }
    }

    // REST API
    const apiEndpoints = getGeneratedEndpoints(new APIGenerator(), 'TestObject');
    expect(apiEndpoints).toContain('POST /testobjects/:id/analyze');

    // MCP
    const mcpTools = new MCPGenerator().generateTools();
    expect(mcpTools.some(t => t.name === 'testobject_analyze')).toBe(true);

    // CLI
    const cliCommands = getGeneratedCommands(new CLIGenerator(), 'TestObject');
    expect(cliCommands).toContain('testobject:analyze');
  });
});
```

## Validation Rules

All generators enforce these validation rules consistently:

### Rule V1: Invalid Method Names

```typescript
@smrt({
  mcp: { include: ['list', 'nonexistent'] }  // ← Warning logged
})
class Product extends SmrtObject {
  // Method 'nonexistent' does not exist
}

// Console output:
// "Warning: Custom action 'nonexistent' specified in MCP config for Product,
//  but method nonexistent() not found on class"
```

### Rule V2: Conflicting Include/Exclude

```typescript
@smrt({
  api: {
    include: ['list', 'delete'],
    exclude: ['delete']  // ← Exclude wins (consistent behavior)
  }
})
class Product extends SmrtObject { }

// Result: Only 'list' is generated (delete excluded)
```

### Rule V3: Empty Include Array

```typescript
@smrt({
  api: { include: [] }  // ← Explicit empty whitelist
})
class Product extends SmrtObject { }

// Result: No endpoints generated (empty whitelist means include nothing)
```

## Summary: Configuration Consistency Checklist

✅ **All generators use identical include/exclude logic**:
- Exclude takes priority over include
- Include is a whitelist (when specified)
- No include = all operations (except excluded)
- Empty config = all operations
- False = disable generator

✅ **All generators support custom actions**:
- Custom actions validated against class methods
- Warning logged if method doesn't exist
- Custom actions work across REST, MCP, and CLI

✅ **All generators use ObjectRegistry**:
- `ObjectRegistry.getConfig(name)` for configuration
- `ObjectRegistry.getFields(name)` for field metadata
- `ObjectRegistry.getClass(name)` for class information

✅ **All generators handle edge cases consistently**:
- Case-insensitive class name lookups
- Pluralization for REST endpoints
- Method validation for custom actions
- Error messages follow same format

This consistency ensures that developers can predict behavior across all interfaces when configuring SMRT objects.
