/**
 * MCP Resources for SMRT Framework Documentation
 */

import { type Resource } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { glob } from 'glob';
import matter from 'gray-matter';

// Base path for the SDK repository
const SDK_ROOT = resolve(process.cwd(), '..');

interface ResourceContent {
  text: string;
  mimeType?: string;
  metadata?: Record<string, any>;
}

class ResourceManager {
  private resources: Map<string, Resource> = new Map();
  private contentCache: Map<string, ResourceContent> = new Map();

  constructor() {
    this.loadResources();
  }

  private loadResources() {
    // Core SMRT documentation
    this.addResource({
      uri: 'smrt://docs/core/base-object',
      name: 'BaseObject Documentation',
      description: 'Core BaseObject class with persistence and AI methods',
      mimeType: 'text/markdown',
    });

    this.addResource({
      uri: 'smrt://docs/core/base-collection',
      name: 'BaseCollection Documentation',
      description: 'Collection management with CRUD operations',
      mimeType: 'text/markdown',
    });

    this.addResource({
      uri: 'smrt://docs/core/base-class',
      name: 'BaseClass Documentation',
      description:
        'Foundation class providing database, filesystem, and AI access',
      mimeType: 'text/markdown',
    });

    // Field definitions documentation
    this.addResource({
      uri: 'smrt://docs/fields/overview',
      name: 'Field Definitions Overview',
      description: 'Field types and validation patterns for SMRT objects',
      mimeType: 'text/markdown',
    });

    // Decorator documentation
    this.addResource({
      uri: 'smrt://docs/decorators/smrt',
      name: '@smrt Decorator',
      description: 'Configuration and usage of the @smrt decorator',
      mimeType: 'text/markdown',
    });

    // Generator documentation
    this.addResource({
      uri: 'smrt://docs/generators/cli',
      name: 'CLI Generator',
      description: 'Generate command-line tools from SMRT objects',
      mimeType: 'text/markdown',
    });

    this.addResource({
      uri: 'smrt://docs/generators/api',
      name: 'API Generator',
      description: 'Generate REST APIs with OpenAPI documentation',
      mimeType: 'text/markdown',
    });

    this.addResource({
      uri: 'smrt://docs/generators/mcp',
      name: 'MCP Generator',
      description: 'Generate MCP servers for AI integration',
      mimeType: 'text/markdown',
    });

    // Package documentation
    const packages = ['ai', 'files', 'sql', 'pdf', 'spider', 'ocr', 'utils'];
    for (const pkg of packages) {
      this.addResource({
        uri: `smrt://docs/packages/${pkg}`,
        name: `@have/${pkg} Documentation`,
        description: `Documentation for the @have/${pkg} package`,
        mimeType: 'text/markdown',
      });
    }

    // Examples and patterns
    this.addResource({
      uri: 'smrt://examples/basic-object',
      name: 'Basic SMRT Object Example',
      description: 'Example of creating a simple SMRT object',
      mimeType: 'text/typescript',
    });

    this.addResource({
      uri: 'smrt://examples/ai-methods',
      name: 'AI Methods Example',
      description: 'Using do(), is(), and describe() methods',
      mimeType: 'text/typescript',
    });

    this.addResource({
      uri: 'smrt://examples/collection-usage',
      name: 'Collection Usage Example',
      description: 'Working with BaseCollection for CRUD operations',
      mimeType: 'text/typescript',
    });

    // Schema definitions
    this.addResource({
      uri: 'smrt://schemas/field-types',
      name: 'Field Type Schemas',
      description: 'TypeScript interfaces for field definitions',
      mimeType: 'application/typescript',
    });

    this.addResource({
      uri: 'smrt://schemas/decorator-config',
      name: 'Decorator Configuration Schema',
      description: 'Configuration options for @smrt decorator',
      mimeType: 'application/typescript',
    });
  }

  private addResource(resource: Resource) {
    this.resources.set(resource.uri, resource);
  }

  list(): Resource[] {
    return Array.from(this.resources.values());
  }

  async read(uri: string): Promise<ResourceContent | null> {
    // Check cache first
    if (this.contentCache.has(uri)) {
      return this.contentCache.get(uri)!;
    }

    let content: ResourceContent | null = null;

    // Parse URI to determine resource type
    if (uri.startsWith('smrt://docs/core/')) {
      content = await this.readCoreDocumentation(uri);
    } else if (uri.startsWith('smrt://docs/fields/')) {
      content = await this.readFieldDocumentation(uri);
    } else if (uri.startsWith('smrt://docs/decorators/')) {
      content = await this.readDecoratorDocumentation(uri);
    } else if (uri.startsWith('smrt://docs/generators/')) {
      content = await this.readGeneratorDocumentation(uri);
    } else if (uri.startsWith('smrt://docs/packages/')) {
      content = await this.readPackageDocumentation(uri);
    } else if (uri.startsWith('smrt://examples/')) {
      content = await this.readExample(uri);
    } else if (uri.startsWith('smrt://schemas/')) {
      content = await this.readSchema(uri);
    }

    if (content) {
      this.contentCache.set(uri, content);
    }

    return content;
  }

  private async readCoreDocumentation(
    uri: string,
  ): Promise<ResourceContent | null> {
    const type = uri.split('/').pop();
    let filePath: string;
    let content = '';

    switch (type) {
      case 'base-object':
        filePath = join(SDK_ROOT, 'packages/smrt/src/object.ts');
        if (existsSync(filePath)) {
          const sourceCode = readFileSync(filePath, 'utf-8');
          content = this.extractDocumentation(sourceCode, 'BaseObject');
        }
        break;

      case 'base-collection':
        filePath = join(SDK_ROOT, 'packages/smrt/src/collection.ts');
        if (existsSync(filePath)) {
          const sourceCode = readFileSync(filePath, 'utf-8');
          content = this.extractDocumentation(sourceCode, 'BaseCollection');
        }
        break;

      case 'base-class':
        filePath = join(SDK_ROOT, 'packages/smrt/src/class.ts');
        if (existsSync(filePath)) {
          const sourceCode = readFileSync(filePath, 'utf-8');
          content = this.extractDocumentation(sourceCode, 'BaseClass');
        }
        break;

      default:
        return null;
    }

    return { text: content, mimeType: 'text/markdown' };
  }

  private async readFieldDocumentation(
    uri: string,
  ): Promise<ResourceContent | null> {
    const filePath = join(SDK_ROOT, 'packages/smrt/src/fields/index.ts');
    if (!existsSync(filePath)) return null;

    const content = readFileSync(filePath, 'utf-8');
    return {
      text: this.extractFieldDocumentation(content),
      mimeType: 'text/markdown',
    };
  }

  private async readDecoratorDocumentation(
    uri: string,
  ): Promise<ResourceContent | null> {
    const filePath = join(SDK_ROOT, 'packages/smrt/src/registry.ts');
    if (!existsSync(filePath)) return null;

    const content = readFileSync(filePath, 'utf-8');
    return {
      text: this.extractDecoratorDocumentation(content),
      mimeType: 'text/markdown',
    };
  }

  private async readGeneratorDocumentation(
    uri: string,
  ): Promise<ResourceContent | null> {
    const generator = uri.split('/').pop();
    const filePath = join(
      SDK_ROOT,
      `packages/smrt/src/generators/${generator}.ts`,
    );

    if (!existsSync(filePath)) return null;

    const content = readFileSync(filePath, 'utf-8');
    return {
      text: this.extractGeneratorDocumentation(content),
      mimeType: 'text/markdown',
    };
  }

  private async readPackageDocumentation(
    uri: string,
  ): Promise<ResourceContent | null> {
    const pkg = uri.split('/').pop();
    const readmePath = join(SDK_ROOT, `packages/${pkg}/README.md`);
    const claudePath = join(SDK_ROOT, `packages/${pkg}/CLAUDE.md`);

    let content = '';

    if (existsSync(claudePath)) {
      content = readFileSync(claudePath, 'utf-8');
    } else if (existsSync(readmePath)) {
      content = readFileSync(readmePath, 'utf-8');
    } else {
      return null;
    }

    return { text: content, mimeType: 'text/markdown' };
  }

  private async readExample(uri: string): Promise<ResourceContent | null> {
    const example = uri.split('/').pop();
    let content = '';

    switch (example) {
      case 'basic-object':
        content = this.generateBasicObjectExample();
        break;
      case 'ai-methods':
        content = this.generateAIMethodsExample();
        break;
      case 'collection-usage':
        content = this.generateCollectionExample();
        break;
      default:
        return null;
    }

    return { text: content, mimeType: 'text/typescript' };
  }

  private async readSchema(uri: string): Promise<ResourceContent | null> {
    const schema = uri.split('/').pop();
    let content = '';

    switch (schema) {
      case 'field-types':
        content = this.generateFieldTypeSchema();
        break;
      case 'decorator-config':
        content = this.generateDecoratorConfigSchema();
        break;
      default:
        return null;
    }

    return { text: content, mimeType: 'application/typescript' };
  }

  // Helper methods for extracting and generating documentation
  private extractDocumentation(sourceCode: string, className: string): string {
    const lines = sourceCode.split('\n');
    const docs: string[] = [];
    let inClass = false;
    let depth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.includes(`class ${className}`)) {
        // Extract JSDoc above class
        let j = i - 1;
        const jsdoc: string[] = [];
        while (j >= 0 && (lines[j].includes('*') || lines[j].includes('/**'))) {
          jsdoc.unshift(lines[j]);
          j--;
        }
        docs.push(...jsdoc);
        docs.push('');
        inClass = true;
      }

      if (inClass) {
        docs.push(line);
        if (line.includes('{')) depth++;
        if (line.includes('}')) {
          depth--;
          if (depth === 0) break;
        }
      }
    }

    return docs.join('\n');
  }

  private extractFieldDocumentation(content: string): string {
    // Extract field documentation and examples
    const docs = `# SMRT Field Definitions

## Overview
Field definitions in SMRT provide a type-safe way to define database schemas and validation rules.

## Available Field Types

${content}`;

    return docs;
  }

  private extractDecoratorDocumentation(content: string): string {
    // Extract decorator documentation
    const docs = `# @smrt Decorator

## Overview
The @smrt decorator registers classes with the global registry for automatic API/CLI/MCP generation.

## Configuration Options

${content}`;

    return docs;
  }

  private extractGeneratorDocumentation(content: string): string {
    // Extract generator documentation
    return content;
  }

  private generateBasicObjectExample(): string {
    return `import { BaseObject, smrt, text, integer, boolean } from '@have/smrt';

@smrt({
  api: { exclude: ['delete'] },
  cli: true,
  mcp: { include: ['list', 'get', 'create'] }
})
export class Product extends BaseObject {
  name = text({ required: true, maxLength: 100 });
  description = text({ maxLength: 500 });
  price = integer({ min: 0, required: true });
  inStock = boolean({ default: true });
  quantity = integer({ default: 0, min: 0 });

  constructor(options: any) {
    super(options);
    Object.assign(this, options);
  }

  // Lifecycle hooks
  async beforeSave() {
    // Validate or transform data before saving
    if (!this.slug && this.name) {
      this.slug = await this.getSlug();
    }
  }

  // Custom business logic
  async adjustInventory(amount: number) {
    this.quantity = Math.max(0, this.quantity + amount);
    this.inStock = this.quantity > 0;
    await this.save();
  }
}`;
  }

  private generateAIMethodsExample(): string {
    return `import { BaseObject, smrt, text } from '@have/smrt';

@smrt()
export class Document extends BaseObject {
  title = text({ required: true });
  content = text({ required: true });
  category = text();

  constructor(options: any) {
    super(options);
    Object.assign(this, options);
  }

  // AI-powered content analysis
  async summarize(): Promise<string> {
    return await this.do(\`
      Summarize this document in 2-3 sentences:
      Title: \${this.title}
      Content: \${this.content.substring(0, 1000)}
    \`);
  }

  // AI-powered validation
  async isHighQuality(): Promise<boolean> {
    return await this.is(\`
      This document meets high quality standards:
      - Clear and concise title
      - Well-structured content
      - Proper grammar and spelling
      - Informative and relevant
    \`);
  }

  // AI-powered description
  async getDescription(): Promise<string> {
    return await this.describe(\`
      Generate a brief description of this document's
      main topics and key points.
    \`);
  }

  // Complex AI operation
  async improveContent(instructions: string): Promise<string> {
    const improved = await this.do(\`
      Improve this content based on these instructions:
      Instructions: \${instructions}

      Current content:
      \${this.content}

      Return only the improved content.
    \`);

    this.content = improved;
    await this.save();
    return improved;
  }
}`;
  }

  private generateCollectionExample(): string {
    return `import { BaseCollection } from '@have/smrt';
import { Product } from './product';

export class ProductCollection extends BaseCollection<Product> {
  static readonly _itemClass = Product;

  constructor(options: any) {
    super(options);
  }

  // Custom query methods
  async findInStock() {
    return this.list({
      where: { inStock: true },
      orderBy: 'quantity DESC'
    });
  }

  async findByPriceRange(min: number, max: number) {
    return this.list({
      where: {
        'price >=': min,
        'price <=': max
      },
      orderBy: 'price ASC'
    });
  }

  // Bulk operations
  async updatePrices(percentage: number) {
    const products = await this.list({});

    for (const product of products) {
      product.price = Math.round(product.price * (1 + percentage / 100));
      await product.save();
    }

    return products;
  }

  // AI-enhanced search
  async searchSemantic(query: string) {
    const products = await this.list({});
    const results = [];

    for (const product of products) {
      const relevance = await product.do(\`
        Rate the relevance of this product to the query "\${query}"
        on a scale of 1-10. Consider the name and description.
        Product: \${product.name} - \${product.description}
        Respond with only the number.
      \`);

      if (parseInt(relevance) >= 7) {
        results.push(product);
      }
    }

    return results;
  }
}`;
  }

  private generateFieldTypeSchema(): string {
    return `// Field Type Definitions for SMRT Framework

export interface FieldOptions {
  required?: boolean;
  default?: any;
  unique?: boolean;
  index?: boolean;
  description?: string;
}

export interface TextFieldOptions extends FieldOptions {
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  encrypted?: boolean;
}

export interface NumericFieldOptions extends FieldOptions {
  min?: number;
  max?: number;
}

export interface RelationshipFieldOptions extends FieldOptions {
  onDelete?: 'cascade' | 'restrict' | 'set_null';
  related?: string;
}

// Field factory functions
export function text(options?: TextFieldOptions): Field;
export function integer(options?: NumericFieldOptions): Field;
export function decimal(options?: NumericFieldOptions): Field;
export function boolean(options?: FieldOptions): Field;
export function datetime(options?: FieldOptions): Field;
export function json(options?: FieldOptions): Field;
export function foreignKey(relatedClass: any, options?: RelationshipFieldOptions): Field;
export function oneToMany(relatedClass: any, options?: RelationshipFieldOptions): Field;
export function manyToMany(relatedClass: any, options?: RelationshipFieldOptions): Field;`;
  }

  private generateDecoratorConfigSchema(): string {
    return `// @smrt Decorator Configuration Schema

export interface SmartObjectConfig {
  // Custom name for the object (defaults to class name)
  name?: string;

  // API configuration
  api?: {
    // Exclude specific endpoints
    exclude?: ('list' | 'get' | 'create' | 'update' | 'delete')[];

    // Include only specific endpoints
    include?: ('list' | 'get' | 'create' | 'update' | 'delete')[];

    // Custom middleware for this object's endpoints
    middleware?: any[];

    // Custom endpoint handlers
    customize?: {
      list?: (req: any, collection: any) => Promise<any>;
      get?: (req: any, collection: any) => Promise<any>;
      create?: (req: any, collection: any) => Promise<any>;
      update?: (req: any, collection: any) => Promise<any>;
      delete?: (req: any, collection: any) => Promise<any>;
    };
  };

  // MCP server configuration
  mcp?: {
    // Include specific tools
    include?: ('list' | 'get' | 'create' | 'update' | 'delete')[];

    // Exclude specific tools
    exclude?: ('list' | 'get' | 'create' | 'update' | 'delete')[];
  };

  // CLI configuration
  cli?: boolean | {
    // Include specific commands
    include?: ('list' | 'get' | 'create' | 'update' | 'delete')[];

    // Exclude specific commands
    exclude?: ('list' | 'get' | 'create' | 'update' | 'delete')[];
  };

  // Lifecycle hooks
  hooks?: {
    beforeSave?: string | ((instance: any) => Promise<void>);
    afterSave?: string | ((instance: any) => Promise<void>);
    beforeCreate?: string | ((instance: any) => Promise<void>);
    afterCreate?: string | ((instance: any) => Promise<void>);
    beforeUpdate?: string | ((instance: any) => Promise<void>);
    afterUpdate?: string | ((instance: any) => Promise<void>);
    beforeDelete?: string | ((instance: any) => Promise<void>);
    afterDelete?: string | ((instance: any) => Promise<void>);
  };
}

// Usage
@smrt(config: SmartObjectConfig)
class MyObject extends BaseObject {
  // ...
}`;
  }
}

export function setupResources(): ResourceManager {
  return new ResourceManager();
}
