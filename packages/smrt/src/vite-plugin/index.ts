/**
 * Vite plugin for automatic SMRT service generation
 * Provides virtual modules for REST, MCP, and other services
 */

import type { Plugin, ViteDevServer } from 'vite';
import type { SmartObjectManifest } from '../scanner/types';

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
  '@smrt/schema': 'smrt:schema',
  '@smrt/ui': 'smrt:ui',
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

      // Resolve virtual index.html for dev UI (only in dev mode)
      if (id === '/index.html' && server) {
        return `\0smrt:index-html`;
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

        case 'smrt:schema':
          // Schema module available in both modes
          return await generateSchemaModule(manifest);

        case 'smrt:ui':
          // UI module for default development interface
          return await loadDefaultUI();

        case 'smrt:index-html':
          // Virtual index.html for projects without one
          return await loadDefaultHTML();

        default:
          return null;
      }
    },

    transformIndexHtml: {
      order: 'pre',
      handler: async (html, ctx) => {
        // Only provide default HTML if no index.html exists in project
        if (!server) return html;

        try {
          const { existsSync } = await import('node:fs');
          const { join } = await import('node:path');

          const projectRoot = server.config.root;
          const indexPath = join(projectRoot, 'index.html');

          // If index.html exists, use it as-is
          if (existsSync(indexPath)) {
            return html;
          }

          // Otherwise, provide default SMRT UI
          return await loadDefaultHTML();
        } catch (error) {
          console.error('[smrt] Error checking for index.html:', error);
          return html;
        }
      },
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
    // In production build, try to use static manifest first
    if (process.env.NODE_ENV === 'production') {
      try {
        const { staticManifest } = await import(
          '../manifest/static-manifest.js'
        );
        if (staticManifest && Object.keys(staticManifest.objects).length > 0) {
          console.log('[smrt] Using pre-generated static manifest');
          return staticManifest;
        }
      } catch (error) {
        console.warn(
          '[smrt] Static manifest not found, falling back to dynamic scanning',
        );
      }
    }

    // Development mode or fallback: use dynamic scanning
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

/**
 * Get default HTML template (inlined for distribution)
 */
function getDefaultHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SMRT Development UI</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #f5f5f5;
      color: #333;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 0;
      margin-bottom: 30px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 { font-size: 2em; font-weight: 600; margin-bottom: 10px; }
    .subtitle { opacity: 0.9; font-size: 1.1em; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .stat-value { font-size: 2.5em; font-weight: 700; color: #667eea; margin-bottom: 5px; }
    .stat-label { color: #666; font-size: 0.9em; text-transform: uppercase; letter-spacing: 0.5px; }
    .collections { display: grid; gap: 20px; }
    .collection-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .collection-header {
      background: #667eea;
      color: white;
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .collection-title { font-size: 1.3em; font-weight: 600; }
    .collection-count {
      background: rgba(255,255,255,0.2);
      padding: 5px 15px;
      border-radius: 20px;
      font-size: 0.9em;
    }
    .collection-body { padding: 20px; }
    .field-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    .field {
      padding: 10px;
      background: #f8f9fa;
      border-radius: 4px;
      border-left: 3px solid #667eea;
    }
    .field-name { font-weight: 600; color: #333; margin-bottom: 3px; }
    .field-type { font-size: 0.85em; color: #666; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      font-size: 0.9em;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      display: inline-block;
    }
    .btn-primary { background: #667eea; color: white; }
    .btn-primary:hover { background: #5568d3; transform: translateY(-1px); }
    .btn-secondary { background: #e0e0e0; color: #333; }
    .btn-secondary:hover { background: #d0d0d0; }
    .loading { text-align: center; padding: 40px; color: #666; }
    .error {
      background: #fee;
      border: 1px solid #fcc;
      color: #c33;
      padding: 15px;
      border-radius: 4px;
      margin-bottom: 20px;
    }
    .empty-state { text-align: center; padding: 60px 20px; color: #999; }
    .empty-state svg { width: 100px; height: 100px; margin-bottom: 20px; opacity: 0.3; }
  </style>
</head>
<body>
  <div id="app">
    <div class="loading">Loading SMRT UI...</div>
  </div>
  <script type="module" src="/@smrt/ui"></script>
</body>
</html>`;
}

/**
 * Get default UI module (inlined for distribution)
 */
function getDefaultUIModule(): string {
  return `// SMRT Development UI - Auto-generated
async function createUI() {
  const app = document.getElementById('app');
  if (!app) return;

  try {
    const { manifest } = await import('@smrt/manifest');
    const { createClient } = await import('@smrt/client');
    const client = createClient('/api/v1');

    app.innerHTML = renderDashboard(manifest, client);
    attachEventListeners(manifest, client);
  } catch (error) {
    console.error('Error loading SMRT UI:', error);
    app.innerHTML = \`
      <div class="container">
        <div class="error">
          <strong>Error loading SMRT UI</strong>
          <p>\${error instanceof Error ? error.message : String(error)}</p>
        </div>
      </div>
    \`;
  }
}

function renderDashboard(manifest, client) {
  const objects = Object.entries(manifest.objects);
  const totalObjects = objects.length;
  const totalMethods = objects.reduce((sum, [, obj]) => sum + Object.keys(obj.methods).length, 0);
  const totalFields = objects.reduce((sum, [, obj]) => sum + Object.keys(obj.fields).length, 0);

  return \`
    <header>
      <div class="container">
        <h1>🎯 SMRT Development UI</h1>
        <div class="subtitle">Auto-generated dashboard for your SMRT objects</div>
      </div>
    </header>
    <div class="container">
      <div class="stats">
        <div class="stat-card"><div class="stat-value">\${totalObjects}</div><div class="stat-label">Objects</div></div>
        <div class="stat-card"><div class="stat-value">\${totalFields}</div><div class="stat-label">Fields</div></div>
        <div class="stat-card"><div class="stat-value">\${totalMethods}</div><div class="stat-label">Methods</div></div>
      </div>
      \${totalObjects === 0 ? renderEmptyState() : \`<div class="collections">\${objects.map(([name, obj]) => renderCollection(name, obj, client)).join('')}</div>\`}
    </div>
  \`;
}

function renderEmptyState() {
  return \`<div class="empty-state">
    <svg viewBox="0 0 100 100" fill="currentColor">
      <circle cx="50" cy="50" r="40" stroke="currentColor" stroke-width="2" fill="none"/>
      <text x="50" y="60" text-anchor="middle" font-size="50">?</text>
    </svg>
    <h2>No SMRT Objects Found</h2>
    <p>Create a class that extends SmrtObject and decorate it with @smrt()</p>
  </div>\`;
}

function renderCollection(name, obj, _client) {
  const fields = Object.entries(obj.fields);
  const methods = Object.entries(obj.methods);
  const customMethods = methods.filter(([methodName]) =>
    !['list', 'get', 'create', 'update', 'delete'].includes(methodName)
  );

  return \`<div class="collection-card" data-collection="\${obj.collection}">
    <div class="collection-header">
      <div class="collection-title">\${obj.className}</div>
      <div class="collection-count" data-count="\${obj.collection}">Loading...</div>
    </div>
    <div class="collection-body">
      \${fields.length > 0 ? \`
        <h3 style="margin-bottom: 15px; color: #555;">Fields</h3>
        <div class="field-list">
          \${fields.map(([fieldName, field]) => \`
            <div class="field">
              <div class="field-name">\${fieldName}</div>
              <div class="field-type">\${field.type}\${field.required ? ' (required)' : ''}</div>
            </div>
          \`).join('')}
        </div>
      \` : ''}
      \${customMethods.length > 0 ? \`
        <h3 style="margin-bottom: 15px; color: #555;">Custom Actions</h3>
        <div class="actions" style="margin-bottom: 20px;">
          \${customMethods.map(([methodName, method]) => \`
            <button class="btn btn-secondary" data-action="\${methodName}" data-collection="\${obj.collection}" title="\${method.name}">
              \${methodName}
            </button>
          \`).join('')}
        </div>
      \` : ''}
      <div class="actions">
        <button class="btn btn-primary" data-action="list" data-collection="\${obj.collection}">📋 List All</button>
        <button class="btn btn-primary" data-action="create" data-collection="\${obj.collection}">➕ Create New</button>
        <a href="/api/v1/\${obj.collection}" target="_blank" class="btn btn-secondary">🔗 API Endpoint</a>
      </div>
    </div>
  </div>\`;
}

function attachEventListeners(manifest, client) {
  Object.values(manifest.objects).forEach(async (obj) => {
    try {
      const response = await client[obj.collection].list();
      const count = Array.isArray(response) ? response.length : 0;
      const countEl = document.querySelector(\`[data-count="\${obj.collection}"]\`);
      if (countEl) countEl.textContent = \`\${count} items\`;
    } catch (error) {
      console.error(\`Error loading count for \${obj.collection}:\`, error);
    }
  });

  document.addEventListener('click', async (e) => {
    const target = e.target;
    if (!target.matches('[data-action]')) return;

    const action = target.getAttribute('data-action');
    const collection = target.getAttribute('data-collection');
    if (!action || !collection) return;

    try {
      if (action === 'list') await handleList(collection, client);
      else if (action === 'create') await handleCreate(collection, manifest, client);
      else await handleCustomAction(collection, action, client);
    } catch (error) {
      console.error(\`Error executing \${action} on \${collection}:\`, error);
      alert(\`Error: \${error instanceof Error ? error.message : String(error)}\`);
    }
  });
}

async function handleList(collection, client) {
  const items = await client[collection].list();
  const data = JSON.stringify(items, null, 2);
  const w = window.open('', \`\${collection} List\`, \`width=\${Math.min(800, window.innerWidth - 40)},height=\${Math.min(600, window.innerHeight - 40)}\`);
  if (w) {
    w.document.write(\`<!DOCTYPE html><html><head><title>\${collection}</title><style>body{font-family:monospace;padding:20px;background:#1e1e1e;color:#d4d4d4;}pre{white-space:pre-wrap;background:#2d2d2d;padding:15px;border-radius:4px;}</style></head><body><h1>\${collection}</h1><pre>\${data}</pre></body></html>\`);
  }
}

async function handleCreate(collection, manifest, client) {
  const obj = Object.values(manifest.objects).find(o => o.collection === collection);
  if (!obj) return;

  const fields = Object.entries(obj.fields).filter(([name]) => !['id', 'created_at', 'updated_at'].includes(name));
  const formFields = fields.map(([name, field]) => \`
    <div style="margin-bottom:15px;">
      <label style="display:block;margin-bottom:5px;font-weight:600;">\${name}\${field.required ? ' *' : ''}</label>
      <input type="\${getInputType(field.type)}" name="\${name}" \${field.required ? 'required' : ''} style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;"/>
    </div>
  \`).join('');

  const w = window.open('', \`Create \${collection}\`, \`width=\${Math.min(500, window.innerWidth - 40)},height=\${Math.min(600, window.innerHeight - 40)}\`);
  if (!w) return;

  w.document.write(\`<!DOCTYPE html><html><head><title>Create \${obj.className}</title><style>body{font-family:sans-serif;padding:20px;background:#f5f5f5;}form{background:white;padding:20px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);}button{padding:10px 20px;background:#667eea;color:white;border:none;border-radius:4px;cursor:pointer;font-size:1em;}button:hover{background:#5568d3;}</style></head><body><h1>Create \${obj.className}</h1><form id="createForm">\${formFields}<button type="submit">Create</button></form><script>document.getElementById('createForm').addEventListener('submit',async(e)=>{e.preventDefault();const formData=new FormData(e.target);const data=Object.fromEntries(formData);try{const response=await fetch('/api/v1/\${collection}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});if(response.ok){alert('Created successfully!');window.close();window.opener.location.reload();}else{const error=await response.json();alert('Error: '+(error.message||'Failed to create'));}}catch(error){alert('Error: '+error.message);}});</script></body></html>\`);
}

async function handleCustomAction(collection, action, client) {
  if (!confirm(\`Execute '\${action}' on first item in \${collection}?\`)) return;
  const items = await client[collection].list();
  if (items.length === 0) return alert('No items found');
  console.log(\`Executing \${action} on:\`, items[0]);
  alert(\`Action '\${action}' would execute here. Check console.\`);
}

function getInputType(fieldType) {
  switch (fieldType) {
    case 'integer':
    case 'decimal':
      return 'number';
    case 'boolean':
      return 'checkbox';
    case 'datetime':
      return 'datetime-local';
    default:
      return 'text';
  }
}

createUI();`;
}

/**
 * Load default HTML template for projects without index.html
 */
async function loadDefaultHTML(): Promise<string> {
  return getDefaultHTML();
}

/**
 * Load default UI module for development interface
 */
async function loadDefaultUI(): Promise<string> {
  return getDefaultUIModule();
}

/**
 * Generate virtual schema module with JSON manifests
 */
async function generateSchemaModule(
  manifest: SmartObjectManifest,
): Promise<string> {
  try {
    const { SchemaGenerator } = await import('../schema/index.js');

    const schemaGenerator = new SchemaGenerator();
    const schemas: Record<string, any> = {};

    // Generate schemas for all SMRT objects
    for (const [className, objectDef] of Object.entries(manifest.objects)) {
      const schema = schemaGenerator.generateSchema(objectDef);
      schemas[className] = schema;
    }

    // Create JSON manifest for schemas
    const schemaManifest = {
      version: '1.0.0',
      timestamp: Date.now(),
      packageName: manifest.packageName || 'unknown',
      schemas: schemas,
      dependencies: Array.from(
        new Set(
          Object.values(schemas).flatMap((s: any) => s.dependencies || []),
        ),
      ),
    };

    return `// Auto-generated schema manifest from SMRT objects
// This file is generated automatically - do not edit

// Schema manifest as JSON for SQL adapters
export const schemaManifest = ${JSON.stringify(schemaManifest, null, 2)};

// Schema registry for runtime access
export const schemas = schemaManifest.schemas;

// Schema lookup function
export function getSchema(className: string) {
  return schemas[className];
}

// All schemas as array for dependency resolution
export const allSchemas = Object.values(schemas);

// Package information
export const packageName = schemaManifest.packageName;
export const dependencies = schemaManifest.dependencies;

export default schemaManifest;`;
  } catch (error) {
    console.error('[smrt] Error generating schema module:', error);
    return `// Error generating schema module
export const schemaManifest = { schemas: {}, dependencies: [] };
export const schemas = {};
export function getSchema() { return null; }
export const allSchemas = [];
export default {};`;
  }
}
