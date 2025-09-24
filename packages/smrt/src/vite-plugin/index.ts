/**
 * Vite plugin for automatic SMRT service generation
 * Provides virtual modules for REST, MCP, and other services
 */

import type { Plugin, ViteDevServer } from 'vite';
import type { SmartObjectManifest } from '../scanner/types.js';

export interface SmrtPluginOptions {
  /** Glob patterns for SMRT source files */
  include?: string[];
  /** Patterns to exclude */
  exclude?: string[];
  /** Output directory for generated files */
  outDir?: string;
  /** Enable hot module replacement */
  hmr?: boolean;
  /** Watch for file changes */
  watch?: boolean;
  /** Generate types */
  generateTypes?: boolean;
  /** Custom base classes to scan for */
  baseClasses?: string[];
  /** Directory to write TypeScript declarations (relative to project root) */
  typeDeclarationsPath?: string;
  /** Plugin execution mode - controls Node.js vs browser compatibility */
  mode?: 'server' | 'client' | 'auto';
  /** Pre-generated manifest for client mode (avoids file scanning) */
  staticManifest?: SmartObjectManifest;
  /** Path to static manifest file for client mode */
  manifestPath?: string;
}

const VIRTUAL_MODULES = {
  '@smrt/routes': 'smrt:routes',
  '@smrt/client': 'smrt:client',
  '@smrt/mcp': 'smrt:mcp',
  '@smrt/types': 'smrt:types',
  '@smrt/manifest': 'smrt:manifest',
};

export function smrtPlugin(options: SmrtPluginOptions = {}): Plugin {
  const {
    include = ['src/**/*.ts', 'src/**/*.js'],
    exclude = ['**/*.test.ts', '**/*.spec.ts', '**/node_modules/**'],
    outDir = 'dist/generated',
    hmr = true,
    watch = true,
    generateTypes = true,
    baseClasses = ['SmrtObject', 'SmartObject'],
    typeDeclarationsPath = 'src/types',
    mode = 'auto',
    staticManifest,
    manifestPath,
  } = options;

  let server: ViteDevServer | undefined;
  let manifest: SmartObjectManifest | null = null;
  let manifestGenerator: any = null; // Will be lazily created in server mode
  let pluginMode: 'server' | 'client' = 'server';

  return {
    name: 'smrt-auto-service',

    async configResolved(config) {
      // Detect plugin mode based on build configuration
      if (mode === 'auto') {
        const isSSRBuild = config.build?.ssr;
        const isFederationBuild = config.plugins.some((p) =>
          p.name?.includes('federation'),
        );
        const isClientBuild =
          isFederationBuild ||
          (!isSSRBuild && config.build?.target === 'esnext');

        pluginMode = isClientBuild ? 'client' : 'server';
      } else {
        pluginMode = mode;
      }

      console.log(`[smrt] Running in ${pluginMode} mode`);

      // Scan files and generate initial manifest in all modes
      manifest = await scanAndGenerateManifest();
    },

    async buildStart() {
      // Rescan files on build start in all modes
      manifest = await scanAndGenerateManifest();
    },

    configureServer(devServer) {
      server = devServer;

      // Set up file watching in all modes when enabled
      if (watch && hmr) {
        // Watch for file changes
        const watcher = devServer.watcher;

        watcher.on('change', async (file) => {
          if (await shouldRescan(file)) {
            console.log(`[smrt] Rescanning due to change in ${file}`);
            manifest = await scanAndGenerateManifest();

            // Invalidate virtual modules
            Object.values(VIRTUAL_MODULES).forEach((id) => {
              const module = server?.moduleGraph.getModuleById(id);
              if (module) {
                server?.reloadModule(module);
              }
            });
          }
        });

        watcher.on('add', async (file) => {
          if (await shouldRescan(file)) {
            console.log(`[smrt] Rescanning due to new file ${file}`);
            manifest = await scanAndGenerateManifest();
          }
        });
      }
    },

    resolveId(id) {
      // Resolve virtual module imports
      if (id in VIRTUAL_MODULES) {
        return `\0${VIRTUAL_MODULES[id as keyof typeof VIRTUAL_MODULES]}`;
      }
      return null;
    },

    async load(id) {
      // Load virtual modules (strip the \0 prefix)
      const cleanId = id.startsWith('\0') ? id.slice(1) : id;

      if (!manifest) {
        manifest = await scanAndGenerateManifest();
      }

      switch (cleanId) {
        case 'smrt:routes':
          // Routes module available in all modes
          return await generateRoutesModule(manifest);

        case 'smrt:client':
          // Client module available in both modes
          return generateClientModule(manifest);

        case 'smrt:mcp':
          // MCP module available in all modes
          return await generateMCPModule(manifest);

        case 'smrt:types':
          // Types module available in both modes
          return await generateTypesModule(manifest, pluginMode);

        case 'smrt:manifest':
          // Manifest module available in both modes
          return generateManifestModule(manifest);

        default:
          return null;
      }
    },
  };

  async function _loadStaticManifest(): Promise<SmartObjectManifest | null> {
    if (!manifestPath) return null;

    try {
      // Conditionally import fs for Node.js environments
      const { readFileSync } = await import('node:fs');
      const manifestContent = readFileSync(manifestPath, 'utf-8');
      return JSON.parse(manifestContent);
    } catch (error) {
      console.warn(
        `[smrt] Could not load static manifest from ${manifestPath}:`,
        error,
      );
      return null;
    }
  }

  function createEmptyManifest(): SmartObjectManifest {
    return {
      version: '1.0.0',
      timestamp: Date.now(),
      objects: {},
    };
  }

  async function scanAndGenerateManifest(): Promise<SmartObjectManifest> {
    // Generate manifest in all modes

    try {
      // Conditionally import Node.js dependencies
      const [{ default: fg }, { ASTScanner, ManifestGenerator }] =
        await Promise.all([import('fast-glob'), import('../scanner/index.js')]);

      // Create manifest generator if not already created
      if (!manifestGenerator) {
        manifestGenerator = new ManifestGenerator();
      }

      // Find all TypeScript files matching patterns
      const sourceFiles = fg.sync(include, {
        ignore: exclude,
        absolute: true,
      });

      if (sourceFiles.length === 0) {
        console.warn('[smrt] No source files found matching patterns');
        return createEmptyManifest();
      }

      // Scan files with AST scanner
      const scanner = new ASTScanner(sourceFiles, {
        baseClasses,
        includePrivateMethods: false,
        includeStaticMethods: true,
        followImports: false,
      });

      const scanResults = scanner.scanFiles();
      const newManifest = manifestGenerator.generateManifest(scanResults);

      // Log scan results
      const objectCount = Object.keys(newManifest.objects).length;
      if (objectCount > 0) {
        const names = Object.keys(newManifest.objects).join(', ');
        console.log(`[smrt] Found ${objectCount} SMRT objects: ${names}`);
      } else {
        console.log('[smrt] No SMRT objects found');
      }

      // Generate TypeScript declarations if enabled
      if (generateTypes && server) {
        await generateTypeDeclarationFile(
          newManifest,
          server.config.root,
          typeDeclarationsPath,
        );
      }

      return newManifest;
    } catch (error) {
      console.error('[smrt] Error scanning files:', error);
      return createEmptyManifest();
    }
  }

  async function shouldRescan(file: string): Promise<boolean> {
    // Only rescan in server mode
    if (pluginMode === 'client') {
      return false;
    }

    try {
      // Conditionally import minimatch
      const { minimatch } = await import('minimatch');

      const isIncluded = include.some((pattern) => minimatch(file, pattern));
      const isExcluded = exclude.some((pattern) => minimatch(file, pattern));

      return isIncluded && !isExcluded;
    } catch (error) {
      console.warn('[smrt] Error checking file patterns:', error);
      return false;
    }
  }
}

/**
 * Generate virtual routes module
 */
async function generateRoutesModule(
  manifest: SmartObjectManifest,
): Promise<string> {
  try {
    const { ManifestGenerator } = await import('../scanner/index.js');
    const generator = new ManifestGenerator();
    const routes = generator.generateRestEndpoints(manifest);

    return `
// Auto-generated REST routes from SMRT objects
// This file is generated automatically - do not edit

export function setupRoutes(app) {
${routes}
}

export { setupRoutes as default };
`;
  } catch (error) {
    console.warn('[smrt] Error generating routes module:', error);
    return 'export function setupRoutes() { console.warn("Routes generation failed"); }';
  }
}

/**
 * Generate virtual client module
 */
function generateClientModule(manifest: SmartObjectManifest): string {
  const objects = Object.entries(manifest.objects);

  const clientMethods = objects
    .map(([name, obj]) => {
      const { collection } = obj;
      return `
  ${name}: {
    list: (params) => fetch(basePath + '/${collection}', { 
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    }).then(r => r.json()),
    
    get: (id) => fetch(basePath + '/${collection}/' + id, {
      method: 'GET', 
      headers: { 'Content-Type': 'application/json' }
    }).then(r => r.json()),
    
    create: (data) => fetch(basePath + '/${collection}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()),
    
    update: (id, data) => fetch(basePath + '/${collection}/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(r => r.json()),
    
    delete: (id) => fetch(basePath + '/${collection}/' + id, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    }).then(r => r.ok)
  }`;
    })
    .join(',');

  return `
// Auto-generated API client from SMRT objects
// This file is generated automatically - do not edit

export function createClient(basePath = '/api/v1') {
  return {${clientMethods}
  };
}

export { createClient as default };
`;
}

/**
 * Generate virtual MCP module
 */
async function generateMCPModule(
  manifest: SmartObjectManifest,
): Promise<string> {
  try {
    const { ManifestGenerator } = await import('../scanner/index.js');
    const generator = new ManifestGenerator();
    const tools = generator.generateMCPTools(manifest);

    return `
// Auto-generated MCP tools from SMRT objects  
// This file is generated automatically - do not edit

export const tools = ${tools};

export function createMCPServer() {
  return {
    name: 'smrt-auto-generated',
    version: '1.0.0',
    tools
  };
}

export { createMCPServer as default };
`;
  } catch (error) {
    console.warn('[smrt] Error generating MCP module:', error);
    return 'export const tools = []; export function createMCPServer() { console.warn("MCP generation failed"); return { name: "smrt-client", version: "1.0.0", tools: [] }; }';
  }
}

/**
 * Generate client-mode types without server dependencies
 */
function generateClientModeTypes(manifest: SmartObjectManifest): string {
  const typeDefinitions: string[] = [];

  // Generate interfaces for each object in the manifest
  for (const [objectName, objectMeta] of Object.entries(manifest.objects)) {
    const fields = objectMeta.fields || {};
    const propertyLines: string[] = [];

    for (const [fieldName, fieldDef] of Object.entries(fields)) {
      let type = 'any';

      // Map SMRT field types to TypeScript types
      switch (fieldDef.type) {
        case 'text':
          type = 'string';
          break;
        case 'decimal':
        case 'integer':
          type = 'number';
          break;
        case 'boolean':
          type = 'boolean';
          break;
        case 'datetime':
          type = 'string';
          break;
        case 'json':
          type = 'any';
          break;
        case 'foreignKey':
          type = 'string';
          break;
        default:
          type = 'any';
      }

      const optional = !fieldDef.required ? '?' : '';
      propertyLines.push(`  ${fieldName}${optional}: ${type};`);
    }

    // Add common SmrtObject properties
    propertyLines.unshift(
      '  id?: string;',
      '  created_at?: string;',
      '  updated_at?: string;',
    );

    const interfaceDef = `export interface ${objectName}Data {\n${propertyLines.join('\n')}\n}`;
    typeDefinitions.push(interfaceDef);
  }

  return typeDefinitions.join('\n\n');
}

/**
 * Generate virtual types module
 */
async function generateTypesModule(
  manifest: SmartObjectManifest,
  mode: 'server' | 'client' = 'server',
): Promise<string> {
  let interfaces = '';

  try {
    // Only use scanner in server mode to avoid Node.js dependencies in browser builds
    if (mode !== 'client') {
      const { ManifestGenerator } = await import('../scanner/index.js');
      const generator = new ManifestGenerator();
      interfaces = generator.generateTypeDefinitions(manifest);
    } else {
      // In client mode, generate basic interfaces directly from manifest
      interfaces = generateClientModeTypes(manifest);
    }

    return `
// Auto-generated TypeScript types from SMRT objects
// This file is generated automatically - do not edit

${interfaces}

export interface Request {
  params: Record<string, string>;
  query: Record<string, any>;
  json(): Promise<any>;
}

export interface Response {
  json(data: any, init?: { status?: number }): Response;
  status(code: number): Response;
}
`;
  } catch (error) {
    console.warn('[smrt] Error generating types module:', error);
    return `
// Auto-generated TypeScript types from SMRT objects (fallback)
// This file is generated automatically - do not edit

export interface Request {
  params: Record<string, string>;
  query: Record<string, any>;
  json(): Promise<any>;
}

export interface Response {
  json(data: any, init?: { status?: number }): Response;
  status(code: number): Response;
}
`;
  }
}

/**
 * Generate virtual manifest module
 */
function generateManifestModule(manifest: SmartObjectManifest): string {
  return `
// Auto-generated manifest from SMRT objects
// This file is generated automatically - do not edit

export const manifest = ${JSON.stringify(manifest, null, 2)};

export { manifest as default };
`;
}

/**
 * Generate TypeScript declaration file for virtual modules
 * This eliminates the need for manual type maintenance
 */
async function generateTypeDeclarationFile(
  manifest: SmartObjectManifest,
  projectRoot: string,
  typeDeclarationsPath: string,
): Promise<void> {
  try {
    // Conditionally import path and fs modules
    const [{ join }, { existsSync, mkdirSync, writeFileSync }] =
      await Promise.all([import('node:path'), import('node:fs')]);

    const declarationsDir = join(projectRoot, typeDeclarationsPath);
    const declarationsFile = join(declarationsDir, 'virtual-modules.d.ts');

    // Create directory if it doesn't exist
    if (!existsSync(declarationsDir)) {
      mkdirSync(declarationsDir, { recursive: true });
    }

    // Generate interface definitions for each discovered SMRT object
    const objectInterfaces = Object.entries(manifest.objects)
      .map(([_name, obj]) => {
        const interfaceName = `${obj.className}Data`;
        const fields = Object.entries(obj.fields)
          .map(([fieldName, field]) => {
            const optional = field.required === false ? '?' : '';
            const type = mapTypeScriptType(field.type);
            return `    ${fieldName}${optional}: ${type};`;
          })
          .join('\n');

        return `  export interface ${interfaceName} {
    id?: string;
${fields}
    createdAt?: string;
    updatedAt?: string;
  }`;
      })
      .join('\n\n');

    // Generate CRUD operations interface for each collection
    const collectionNames = [
      ...new Set(Object.values(manifest.objects).map((obj) => obj.collection)),
    ];
    const apiClientInterface = collectionNames
      .map((collection) => {
        const dataType = Object.entries(manifest.objects).find(
          ([, obj]) => obj.collection === collection,
        )?.[1].className;
        const interfaceName = dataType ? `${dataType}Data` : 'any';
        return `    ${collection}: CrudOperations<${interfaceName}>;`;
      })
      .join('\n');

    // Generate MCP tool interfaces based on discovered methods
    const _mcpTools = Object.entries(manifest.objects).flatMap(([_name, obj]) =>
      Object.entries(obj.methods).map(([methodName, method]) => ({
        name: `${methodName}_${obj.collection}`,
        description: `${method.name} operation on ${obj.collection}`,
        inputSchema: {
          type: 'object',
          properties: Object.fromEntries(
            method.parameters.map((param) => [
              param.name,
              { type: mapJsonSchemaType(param.type) },
            ]),
          ),
          required: method.parameters
            .filter((p) => p.optional !== true)
            .map((p) => p.name),
        },
      })),
    );

    const typeDeclarations = `/**
 * Auto-generated TypeScript declarations for SMRT virtual modules
 * Generated from discovered @smrt() decorated classes
 * 
 * DO NOT EDIT THIS FILE MANUALLY
 * This file is automatically regenerated when SMRT objects change
 */

// Manifest module - Contains discovered SMRT objects metadata
declare module '@smrt/manifest' {
  export interface SmrtObjectField {
    type: string;
    required?: boolean;
    default?: any;
  }

  export interface SmrtObjectMethod {
    name: string;
    parameters: Array<{
      name: string;
      type: string;
      required?: boolean;
    }>;
    returnType: string;
    isAsync: boolean;
  }

  export interface SmrtObjectDefinition {
    className: string;
    collection: string;
    fields: Record<string, SmrtObjectField>;
    methods: Record<string, SmrtObjectMethod>;
    decoratorConfig: any;
  }

  export interface SmrtManifest {
    version: string;
    timestamp: number;
    objects: Record<string, SmrtObjectDefinition>;
  }

  export const manifest: SmrtManifest;
}

// Routes module - Auto-generated REST route setup
declare module '@smrt/routes' {
  export interface RouteApp {
    get(path: string, handler: (req: any, res: any) => void): void;
    post(path: string, handler: (req: any, res: any) => void): void;
    put(path: string, handler: (req: any, res: any) => void): void;
    delete(path: string, handler: (req: any, res: any) => void): void;
  }

  export function setupRoutes(app: RouteApp): void;
  export default setupRoutes;
}

// Client module - Auto-generated API client  
declare module '@smrt/client' {
  export interface ApiResponse<T = any> {
    id?: string;
    data?: T;
    error?: string;
    message?: string;
  }

  export interface CrudOperations<T = any> {
    list(params?: Record<string, any>): Promise<ApiResponse<T[]>>;
    get(id: string): Promise<ApiResponse<T>>;
    create(data: Partial<T>): Promise<ApiResponse<T>>;
    update(id: string, data: Partial<T>): Promise<ApiResponse<T>>;
    delete(id: string): Promise<boolean>;
  }

  export interface ApiClient {
${apiClientInterface}
  }

  export function createClient(basePath?: string): ApiClient;
  export default createClient;
}

// MCP module - Auto-generated Model Context Protocol tools
declare module '@smrt/mcp' {
  export interface McpTool {
    name: string;
    description: string;
    inputSchema: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
    };
  }

  export const tools: McpTool[];
  export function createMCPServer(): { name: string; version: string; tools: McpTool[] };
  export default tools;
}

// Types module - Auto-generated TypeScript interfaces
declare module '@smrt/types' {
  export const types: string;
  
  // Auto-generated interfaces for discovered SMRT objects
${objectInterfaces}

  export default types;
}`;

    // Write the declarations file
    writeFileSync(declarationsFile, typeDeclarations);
    console.log(
      `[smrt] Generated TypeScript declarations: ${declarationsFile}`,
    );
  } catch (error) {
    console.error('[smrt] Error generating TypeScript declarations:', error);
  }
}

/**
 * Map SMRT field types to TypeScript types
 */
function mapTypeScriptType(smrtType: string): string {
  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    array: 'any[]',
    object: 'Record<string, any>',
    date: 'string',
    Date: 'string',
  };
  return typeMap[smrtType] || 'any';
}

/**
 * Map TypeScript types to JSON Schema types for MCP tools
 */
function mapJsonSchemaType(tsType: string): string {
  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    array: 'array',
    object: 'object',
    any: 'string',
  };
  return typeMap[tsType] || 'string';
}
