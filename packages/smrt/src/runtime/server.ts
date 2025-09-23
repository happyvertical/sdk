/**
 * Runtime server implementation for SMRT auto-generated services
 */

import type { SmrtServerOptions, SmrtRequest, SmrtResponse } from './types.js';

export class SmrtServer {
  private options: Required<SmrtServerOptions>;
  private routes: Map<string, (req: SmrtRequest) => Promise<Response>> =
    new Map();

  constructor(options: SmrtServerOptions = {}) {
    this.options = {
      port: 3000,
      hostname: 'localhost',
      basePath: '/api/v1',
      cors: true,
      ...options,
    } as Required<SmrtServerOptions>;
  }

  /**
   * Add a route handler
   */
  addRoute(
    method: string,
    path: string,
    handler: (req: SmrtRequest) => Promise<Response>,
  ) {
    const key = `${method.toUpperCase()} ${path}`;
    this.routes.set(key, handler);
  }

  /**
   * Start the server
   */
  async start(): Promise<{ server: any; url: string }> {
    const server = Bun.serve({
      port: this.options.port,
      hostname: this.options.hostname,
      fetch: (req) => this.handleRequest(req),
    });

    const url = `http://${this.options.hostname}:${this.options.port}`;
    console.log(`[smrt] Server started at ${url}`);

    return { server, url };
  }

  /**
   * Handle incoming requests
   */
  private async handleRequest(request: Request): Promise<Response> {
    try {
      // Handle CORS
      if (this.options.cors && request.method === 'OPTIONS') {
        return this.createCorsResponse();
      }

      // Parse request
      const smrtRequest = await this.parseRequest(request);

      // Check authentication
      if (this.options.auth) {
        const authResult = await this.authenticate(smrtRequest);
        if (!authResult) {
          return new Response('Unauthorized', { status: 401 });
        }
      }

      // Find matching route
      const routeKey = `${request.method} ${smrtRequest.url}`;
      const handler = this.findRouteHandler(routeKey);

      if (!handler) {
        return new Response('Not Found', { status: 404 });
      }

      // Execute handler
      const response = await handler(smrtRequest);

      // Add CORS headers if needed
      if (this.options.cors) {
        this.addCorsHeaders(response);
      }

      return response;
    } catch (error) {
      console.error('[smrt] Request error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  /**
   * Parse incoming request into SmrtRequest format
   */
  private async parseRequest(request: Request): Promise<SmrtRequest> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Remove base path
    const routePath = pathname.startsWith(this.options.basePath)
      ? pathname.slice(this.options.basePath.length)
      : pathname;

    // Parse query parameters
    const query: Record<string, any> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });

    // Parse body if present
    let body: any;
    if (
      request.body &&
      (request.method === 'POST' ||
        request.method === 'PUT' ||
        request.method === 'PATCH')
    ) {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        body = await request.json();
      } else {
        body = await request.text();
      }
    }

    // Extract headers
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      params: {}, // Will be populated by route matching
      query,
      body,
      headers,
      method: request.method,
      url: routePath,
      json: async () => body,
    };
  }

  /**
   * Find route handler with parameter extraction
   */
  private findRouteHandler(
    routeKey: string,
  ): ((req: SmrtRequest) => Promise<Response>) | undefined {
    // First try exact match
    if (this.routes.has(routeKey)) {
      return this.routes.get(routeKey);
    }

    // Try parameter matching
    const [method, path] = routeKey.split(' ', 2);

    for (const [key, handler] of this.routes.entries()) {
      const [routeMethod, routePath] = key.split(' ', 2);

      if (method === routeMethod) {
        const params = this.matchRoute(path, routePath);
        if (params !== null) {
          // Return wrapped handler that injects params
          return async (req: SmrtRequest) => {
            req.params = params;
            return handler(req);
          };
        }
      }
    }

    return undefined;
  }

  /**
   * Match route path with parameters (e.g., /users/:id)
   */
  private matchRoute(
    requestPath: string,
    routePath: string,
  ): Record<string, string> | null {
    const requestSegments = requestPath.split('/').filter((s) => s);
    const routeSegments = routePath.split('/').filter((s) => s);

    if (requestSegments.length !== routeSegments.length) {
      return null;
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < routeSegments.length; i++) {
      const routeSegment = routeSegments[i];
      const requestSegment = requestSegments[i];

      if (routeSegment.startsWith(':')) {
        // Parameter segment
        const paramName = routeSegment.slice(1);
        params[paramName] = requestSegment;
      } else if (routeSegment !== requestSegment) {
        // Literal segment mismatch
        return null;
      }
    }

    return params;
  }

  /**
   * Handle authentication
   */
  private async authenticate(request: SmrtRequest): Promise<boolean> {
    if (!this.options.auth) return true;

    const authHeader = request.headers.authorization;
    if (!authHeader) return false;

    switch (this.options.auth.type) {
      case 'bearer': {
        const token = authHeader.replace('Bearer ', '');
        return this.options.auth.verify
          ? await this.options.auth.verify(token)
          : true;
      }

      case 'basic': {
        const credentials = authHeader.replace('Basic ', '');
        return this.options.auth.verify
          ? await this.options.auth.verify(credentials)
          : true;
      }

      case 'custom':
        return this.options.auth.verify
          ? await this.options.auth.verify(authHeader)
          : true;

      default:
        return false;
    }
  }

  /**
   * Create CORS preflight response
   */
  private createCorsResponse(): Response {
    return new Response(null, {
      status: 204,
      headers: this.getCorsHeaders(),
    });
  }

  /**
   * Add CORS headers to response
   */
  private addCorsHeaders(response: Response): void {
    const corsHeaders = this.getCorsHeaders();
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  /**
   * Get CORS headers
   */
  private getCorsHeaders(): Record<string, string> {
    const corsConfig = this.options.cors;

    if (typeof corsConfig === 'boolean') {
      return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      };
    }

    return {
      'Access-Control-Allow-Origin': Array.isArray(corsConfig.origin)
        ? corsConfig.origin.join(', ')
        : corsConfig.origin || '*',
      'Access-Control-Allow-Methods':
        corsConfig.methods?.join(', ') || 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
        corsConfig.headers?.join(', ') || 'Content-Type, Authorization',
    };
  }
}

/**
 * Create a new SMRT server instance
 */
export function createSmrtServer(options?: SmrtServerOptions): SmrtServer {
  return new SmrtServer(options);
}
