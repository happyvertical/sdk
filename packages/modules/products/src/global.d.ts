/**
 * Global type declarations for SMRT virtual modules
 */

// Object type definitions
export interface ProductData {
  id?: string;
  created_at?: string;
  updated_at?: string;
  name: string;
  description?: string;
  category?: string;
  manufacturer?: string;
  model?: string;
  price?: number;
  inStock?: boolean;
  specifications?: any;
  tags?: any;
}

export interface CategoryData {
  id?: string;
  created_at?: string;
  updated_at?: string;
  name: string;
  description?: string;
  slug?: string;
  parentId?: string;
  level?: number;
  productCount?: number;
  active?: boolean;
}

// API Client declarations
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
    products: CrudOperations<ProductData>;
    categories: CrudOperations<CategoryData>;
  }

  export function createClient(basePath?: string): ApiClient;
  export default createClient;
}

// Manifest declarations
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
      optional?: boolean;
      default?: any;
    }>;
    returnType: string;
    async: boolean;
    isStatic: boolean;
    isPublic: boolean;
  }

  export interface SmrtObjectDefinition {
    name: string;
    className: string;
    collection: string;
    filePath: string;
    fields: Record<string, SmrtObjectField>;
    methods: Record<string, SmrtObjectMethod>;
    decoratorConfig: any;
    extends?: string;
  }

  export interface SmrtManifest {
    version: string;
    timestamp: number;
    objects: Record<string, SmrtObjectDefinition>;
  }

  export const manifest: SmrtManifest;
  export default manifest;
}

// MCP declarations
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
  export function createMCPServer(): {
    name: string;
    version: string;
    tools: McpTool[]
  };
  export default createMCPServer;
}

// Routes declarations
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

// Types declarations
declare module '@smrt/types' {
  export type ProductData = ProductData;
  export type CategoryData = CategoryData;

  export interface Request {
    params: Record<string, string>;
    query: Record<string, any>;
    json(): Promise<any>;
  }

  export interface Response {
    json(data: any, init?: { status?: number }): Response;
    status(code: number): Response;
  }
}