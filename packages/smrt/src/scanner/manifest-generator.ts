/**
 * Manifest generator for creating service manifests from AST scan results
 */

import type { 
  SmartObjectManifest, 
  SmartObjectDefinition, 
  ScanResult 
} from './types.js';

export class ManifestGenerator {
  /**
   * Generate manifest from scan results
   */
  generateManifest(scanResults: ScanResult[]): SmartObjectManifest {
    const manifest: SmartObjectManifest = {
      version: '1.0.0',
      timestamp: Date.now(),
      objects: {}
    };

    for (const result of scanResults) {
      for (const objectDef of result.objects) {
        manifest.objects[objectDef.name] = objectDef;
      }
    }

    return manifest;
  }

  /**
   * Generate TypeScript interfaces from manifest
   */
  generateTypeDefinitions(manifest: SmartObjectManifest): string {
    const interfaces: string[] = [];

    for (const [name, obj] of Object.entries(manifest.objects)) {
      interfaces.push(this.generateInterface(obj));
    }

    return interfaces.join('\n\n');
  }

  /**
   * Generate a single interface definition
   */
  private generateInterface(obj: SmartObjectDefinition): string {
    const fields = Object.entries(obj.fields).map(([name, field]) => {
      const optional = !field.required ? '?' : '';
      const type = this.mapFieldTypeToTS(field.type);
      return `  ${name}${optional}: ${type};`;
    }).join('\n');

    return `export interface ${obj.className}Data {
${fields}
}`;
  }

  /**
   * Map field types to TypeScript types
   */
  private mapFieldTypeToTS(fieldType: string): string {
    switch (fieldType) {
      case 'text': return 'string';
      case 'decimal': return 'number';
      case 'integer': return 'number';
      case 'boolean': return 'boolean';
      case 'datetime': return 'Date | string';
      case 'json': return 'any';
      case 'foreignKey': return 'string';
      default: return 'any';
    }
  }

  /**
   * Generate REST endpoint definitions
   */
  generateRestEndpoints(manifest: SmartObjectManifest): string {
    const endpoints: string[] = [];

    for (const [name, obj] of Object.entries(manifest.objects)) {
      const apiConfig = obj.decoratorConfig.api;
      if (apiConfig !== false) {
        endpoints.push(this.generateRestEndpoint(obj));
      }
    }

    return endpoints.join('\n\n');
  }

  /**
   * Generate a single REST endpoint
   */
  private generateRestEndpoint(obj: SmartObjectDefinition): string {
    const { collection, className } = obj;
    const config = obj.decoratorConfig.api;
    const exclude = (typeof config === 'object' && config?.exclude) || [];
    const include = (typeof config === 'object' && config?.include) || undefined;

    const operations = [];

    // Determine which operations to include
    const shouldInclude = (op: string) => {
      if (include && !include.includes(op)) return false;
      if (exclude.includes(op)) return false;
      return true;
    };

    if (shouldInclude('list')) {
      operations.push(`  // GET /${collection} - List ${collection}`);
      operations.push(`  app.get('/${collection}', async (req: Request) => {`);
      operations.push(`    const collection = await get${className}Collection();`);
      operations.push(`    const items = await collection.list(req.query);`);
      operations.push(`    return Response.json(items);`);
      operations.push(`  });`);
    }

    if (shouldInclude('get')) {
      operations.push(`  // GET /${collection}/:id - Get ${className}`);
      operations.push(`  app.get('/${collection}/:id', async (req: Request) => {`);
      operations.push(`    const collection = await get${className}Collection();`);
      operations.push(`    const item = await collection.get(req.params.id);`);
      operations.push(`    if (!item) return new Response('Not found', { status: 404 });`);
      operations.push(`    return Response.json(item);`);
      operations.push(`  });`);
    }

    if (shouldInclude('create')) {
      operations.push(`  // POST /${collection} - Create ${className}`);
      operations.push(`  app.post('/${collection}', async (req: Request) => {`);
      operations.push(`    const collection = await get${className}Collection();`);
      operations.push(`    const data = await req.json();`);
      operations.push(`    const item = await collection.create(data);`);
      operations.push(`    return Response.json(item, { status: 201 });`);
      operations.push(`  });`);
    }

    if (shouldInclude('update')) {
      operations.push(`  // PUT /${collection}/:id - Update ${className}`);
      operations.push(`  app.put('/${collection}/:id', async (req: Request) => {`);
      operations.push(`    const collection = await get${className}Collection();`);
      operations.push(`    const data = await req.json();`);
      operations.push(`    const item = await collection.update(req.params.id, data);`);
      operations.push(`    if (!item) return new Response('Not found', { status: 404 });`);
      operations.push(`    return Response.json(item);`);
      operations.push(`  });`);
    }

    if (shouldInclude('delete')) {
      operations.push(`  // DELETE /${collection}/:id - Delete ${className}`);
      operations.push(`  app.delete('/${collection}/:id', async (req: Request) => {`);
      operations.push(`    const collection = await get${className}Collection();`);
      operations.push(`    const success = await collection.delete(req.params.id);`);
      operations.push(`    if (!success) return new Response('Not found', { status: 404 });`);
      operations.push(`    return new Response('', { status: 204 });`);
      operations.push(`  });`);
    }

    return `// ${className} endpoints\n${operations.join('\n')}`;
  }

  /**
   * Generate MCP tool definitions
   */
  generateMCPTools(manifest: SmartObjectManifest): string {
    const tools: string[] = [];

    for (const [name, obj] of Object.entries(manifest.objects)) {
      const mcpConfig = obj.decoratorConfig.mcp;
      if (mcpConfig !== false) {
        tools.push(this.generateMCPTool(obj));
      }
    }

    return `[\n${tools.join(',\n')}\n]`;
  }

  /**
   * Generate a single MCP tool
   */
  private generateMCPTool(obj: SmartObjectDefinition): string {
    const { collection, className, name } = obj;
    const config = obj.decoratorConfig.mcp;
    const exclude = (typeof config === 'object' && config?.exclude) || [];
    const include = (typeof config === 'object' && config?.include) || undefined;

    const tools = [];

    const shouldInclude = (op: string) => {
      if (include && !include.includes(op)) return false;
      if (exclude.includes(op)) return false;
      return true;
    };

    if (shouldInclude('list')) {
      tools.push(`  {
    name: "list_${collection}",
    description: "List ${collection}",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
        offset: { type: "number" },
        where: { type: "object" }
      }
    }
  }`);
    }

    if (shouldInclude('get')) {
      tools.push(`  {
    name: "get_${name}",
    description: "Get a ${name} by ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The ${name} ID" }
      },
      required: ["id"]
    }
  }`);
    }

    if (shouldInclude('create')) {
      const requiredFields = Object.entries(obj.fields)
        .filter(([_, field]) => field.required)
        .map(([fieldName]) => fieldName);

      tools.push(`  {
    name: "create_${name}",
    description: "Create a new ${name}",
    inputSchema: {
      type: "object",
      properties: ${JSON.stringify(this.generateSchemaProperties(obj.fields), null, 6)},
      required: ${JSON.stringify(requiredFields)}
    }
  }`);
    }

    return tools.join(',\n');
  }

  /**
   * Generate JSON schema properties for fields
   */
  private generateSchemaProperties(fields: Record<string, any>): Record<string, any> {
    const properties: Record<string, any> = {};

    for (const [name, field] of Object.entries(fields)) {
      properties[name] = {
        type: this.mapFieldTypeToJSON(field.type),
        description: field.description || `The ${name} field`
      };

      if (field.min !== undefined) properties[name].minimum = field.min;
      if (field.max !== undefined) properties[name].maximum = field.max;
      if (field.minLength !== undefined) properties[name].minLength = field.minLength;
      if (field.maxLength !== undefined) properties[name].maxLength = field.maxLength;
    }

    return properties;
  }

  /**
   * Map field types to JSON Schema types
   */
  private mapFieldTypeToJSON(fieldType: string): string {
    switch (fieldType) {
      case 'text': return 'string';
      case 'decimal': return 'number';
      case 'integer': return 'integer';
      case 'boolean': return 'boolean';
      case 'datetime': return 'string';
      case 'json': return 'object';
      case 'foreignKey': return 'string';
      default: return 'string';
    }
  }

  /**
   * Save manifest to file
   */
  saveManifest(manifest: SmartObjectManifest, filePath: string): void {
    const fs = require('fs');
    fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Load manifest from file
   */
  loadManifest(filePath: string): SmartObjectManifest {
    const fs = require('fs');
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }
}

/**
 * Convenience function to generate manifest
 */
export function generateManifest(scanResults: ScanResult[]): SmartObjectManifest {
  const generator = new ManifestGenerator();
  return generator.generateManifest(scanResults);
}