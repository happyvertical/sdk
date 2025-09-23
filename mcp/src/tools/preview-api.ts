/**
 * Preview API Endpoints Tool
 */

interface APIConfig {
  exclude?: string[];
  include?: string[];
  middleware?: string[];
}

interface PreviewAPIArgs {
  className: string;
  decoratorConfig?: {
    api?: APIConfig;
  };
}

interface EndpointInfo {
  method: string;
  path: string;
  description: string;
  parameters?: Record<string, any>;
  responses?: Record<string, any>;
  middleware?: string[];
}

export async function previewAPIEndpoints(
  args: PreviewAPIArgs,
): Promise<string> {
  const { className, decoratorConfig } = args;
  const apiConfig = decoratorConfig?.api || {};

  const endpoints = generateEndpoints(className, apiConfig);
  const openApiSpec = generateOpenAPISpec(className, endpoints);

  return formatAPIPreview(className, endpoints, openApiSpec);
}

function generateEndpoints(
  className: string,
  apiConfig: APIConfig,
): EndpointInfo[] {
  const basePath = `/${className.toLowerCase()}s`;
  const allEndpoints: EndpointInfo[] = [
    {
      method: 'GET',
      path: basePath,
      description: `List all ${className} objects with optional filtering and pagination`,
      parameters: {
        query: {
          limit: {
            type: 'integer',
            description: 'Maximum number of items to return',
          },
          offset: { type: 'integer', description: 'Number of items to skip' },
          orderBy: { type: 'string', description: 'Field to sort by' },
          where: { type: 'object', description: 'Filter conditions' },
        },
      },
      responses: {
        200: {
          description: 'List of objects',
          schema: {
            type: 'array',
            items: { $ref: `#/definitions/${className}` },
          },
        },
      },
    },
    {
      method: 'GET',
      path: `${basePath}/{id}`,
      description: `Get a specific ${className} by ID, slug, or name`,
      parameters: {
        path: {
          id: { type: 'string', description: 'Object ID, slug, or name' },
        },
      },
      responses: {
        200: {
          description: 'Object details',
          schema: { $ref: `#/definitions/${className}` },
        },
        404: { description: 'Object not found' },
      },
    },
    {
      method: 'POST',
      path: basePath,
      description: `Create a new ${className} object`,
      parameters: {
        body: {
          schema: { $ref: `#/definitions/${className}Input` },
        },
      },
      responses: {
        201: {
          description: 'Object created successfully',
          schema: { $ref: `#/definitions/${className}` },
        },
        400: { description: 'Invalid input data' },
      },
    },
    {
      method: 'PUT',
      path: `${basePath}/{id}`,
      description: `Update a ${className} object`,
      parameters: {
        path: {
          id: { type: 'string', description: 'Object ID, slug, or name' },
        },
        body: {
          schema: { $ref: `#/definitions/${className}Input` },
        },
      },
      responses: {
        200: {
          description: 'Object updated successfully',
          schema: { $ref: `#/definitions/${className}` },
        },
        404: { description: 'Object not found' },
        400: { description: 'Invalid input data' },
      },
    },
    {
      method: 'DELETE',
      path: `${basePath}/{id}`,
      description: `Delete a ${className} object`,
      parameters: {
        path: {
          id: { type: 'string', description: 'Object ID, slug, or name' },
        },
      },
      responses: {
        204: { description: 'Object deleted successfully' },
        404: { description: 'Object not found' },
      },
    },
  ];

  // Apply include/exclude filters
  let filteredEndpoints = allEndpoints;

  if (apiConfig.include?.length) {
    const includeMap = new Set(apiConfig.include);
    filteredEndpoints = allEndpoints.filter((endpoint) => {
      const operation = getOperationFromEndpoint(endpoint);
      return includeMap.has(operation);
    });
  }

  if (apiConfig.exclude?.length) {
    const excludeSet = new Set(apiConfig.exclude);
    filteredEndpoints = filteredEndpoints.filter((endpoint) => {
      const operation = getOperationFromEndpoint(endpoint);
      return !excludeSet.has(operation);
    });
  }

  // Add middleware information
  if (apiConfig.middleware?.length) {
    filteredEndpoints.forEach((endpoint) => {
      endpoint.middleware = apiConfig.middleware;
    });
  }

  return filteredEndpoints;
}

function getOperationFromEndpoint(endpoint: EndpointInfo): string {
  if (endpoint.method === 'GET' && endpoint.path.includes('{id}')) return 'get';
  if (endpoint.method === 'GET') return 'list';
  if (endpoint.method === 'POST') return 'create';
  if (endpoint.method === 'PUT') return 'update';
  if (endpoint.method === 'DELETE') return 'delete';
  return 'unknown';
}

function generateOpenAPISpec(
  className: string,
  endpoints: EndpointInfo[],
): any {
  const paths: Record<string, any> = {};

  endpoints.forEach((endpoint) => {
    if (!paths[endpoint.path]) {
      paths[endpoint.path] = {};
    }

    const operation = {
      summary: endpoint.description,
      tags: [className],
      parameters: [] as any[],
      responses: endpoint.responses || {},
    };

    // Add path parameters
    if (endpoint.parameters?.path) {
      for (const [name, param] of Object.entries(endpoint.parameters.path)) {
        operation.parameters.push({
          name,
          in: 'path',
          required: true,
          ...(param as any),
        });
      }
    }

    // Add query parameters
    if (endpoint.parameters?.query) {
      for (const [name, param] of Object.entries(endpoint.parameters.query)) {
        operation.parameters.push({
          name,
          in: 'query',
          required: false,
          ...(param as any),
        });
      }
    }

    // Add body parameters
    if (endpoint.parameters?.body) {
      operation.parameters.push({
        name: 'body',
        in: 'body',
        required: true,
        ...endpoint.parameters.body,
      });
    }

    paths[endpoint.path][endpoint.method.toLowerCase()] = operation;
  });

  return {
    swagger: '2.0',
    info: {
      title: `${className} API`,
      version: '1.0.0',
      description: `Auto-generated API for ${className} SMRT objects`,
    },
    basePath: '/api',
    produces: ['application/json'],
    consumes: ['application/json'],
    tags: [
      {
        name: className,
        description: `${className} management operations`,
      },
    ],
    paths,
    definitions: {
      [className]: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Unique identifier' },
          slug: { type: 'string', description: 'URL-friendly identifier' },
          name: { type: 'string', description: 'Human-readable name' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      [`${className}Input`]: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Human-readable name' },
        },
        required: ['name'],
      },
    },
  };
}

function formatAPIPreview(
  className: string,
  endpoints: EndpointInfo[],
  openApiSpec: any,
): string {
  let output = `# ${className} API Preview\n\n`;

  output += `This preview shows the REST API endpoints that would be generated for the ${className} SMRT object.\n\n`;

  output += `## Generated Endpoints\n\n`;

  endpoints.forEach((endpoint) => {
    output += `### ${endpoint.method} ${endpoint.path}\n\n`;
    output += `${endpoint.description}\n\n`;

    if (endpoint.middleware?.length) {
      output += `**Middleware:** ${endpoint.middleware.join(', ')}\n\n`;
    }

    if (endpoint.parameters) {
      output += `**Parameters:**\n`;

      if (endpoint.parameters.path) {
        output += `- Path Parameters:\n`;
        for (const [name, param] of Object.entries(endpoint.parameters.path)) {
          const p = param as any;
          output += `  - \`${name}\` (${p.type}): ${p.description}\n`;
        }
      }

      if (endpoint.parameters.query) {
        output += `- Query Parameters:\n`;
        for (const [name, param] of Object.entries(endpoint.parameters.query)) {
          const p = param as any;
          output += `  - \`${name}\` (${p.type}, optional): ${p.description}\n`;
        }
      }

      if (endpoint.parameters.body) {
        output += `- Body: JSON object matching the ${className} schema\n`;
      }
    }

    output += `\n**Example Request:**\n`;
    output += `\`\`\`bash\n`;
    output += generateCurlExample(endpoint);
    output += `\`\`\`\n\n`;

    output += `---\n\n`;
  });

  output += `## Usage Examples\n\n`;

  output += `### List Objects with Filtering\n`;
  output += `\`\`\`bash\n`;
  output += `curl -X GET "http://localhost:3000/api/${className.toLowerCase()}s?limit=10&orderBy=created_at DESC&where[isActive]=true"\n`;
  output += `\`\`\`\n\n`;

  output += `### Create New Object\n`;
  output += `\`\`\`bash\n`;
  output += `curl -X POST "http://localhost:3000/api/${className.toLowerCase()}s" \\\n`;
  output += `  -H "Content-Type: application/json" \\\n`;
  output += `  -d '{"name": "Example ${className}", "description": "A sample object"}';\n`;
  output += `\`\`\`\n\n`;

  output += `## OpenAPI Specification\n\n`;
  output += `The complete OpenAPI/Swagger specification would be:\n\n`;
  output += `\`\`\`json\n`;
  output += `${JSON.stringify(openApiSpec, null, 2)}\n`;
  output += `\`\`\`\n\n`;

  output += `## Implementation Notes\n\n`;
  output += `- All endpoints support CORS for browser integration\n`;
  output += `- Automatic input validation based on field definitions\n`;
  output += `- Built-in error handling with consistent error responses\n`;
  output += `- Support for complex queries using the \`where\` parameter\n`;
  output += `- Pagination using \`limit\` and \`offset\` parameters\n`;
  output += `- Sorting using the \`orderBy\` parameter\n`;
  output += `- Objects can be accessed by ID, slug, or name in single-object endpoints\n\n`;

  output += `## Generating the Actual API\n\n`;
  output += `To generate this API server, use:\n\n`;
  output += `\`\`\`typescript\n`;
  output += `import { APIGenerator } from '@have/smrt/generators';\n`;
  output += `import { ${className} } from './${className.toLowerCase()}';\n\n`;
  output += `const generator = new APIGenerator({\n`;
  output += `  collections: [${className}],\n`;
  output += `  outputDir: './api',\n`;
  output += `  includeSwagger: true,\n`;
  output += `  middleware: ['cors', 'json', 'validation']\n`;
  output += `});\n\n`;
  output += `await generator.generate();\n`;
  output += `\`\`\`\n`;

  return output;
}

function generateCurlExample(endpoint: EndpointInfo): string {
  const baseUrl = 'http://localhost:3000/api';
  let curl = `curl -X ${endpoint.method} "${baseUrl}${endpoint.path}"`;

  if (endpoint.method === 'POST' || endpoint.method === 'PUT') {
    curl += ` \\\n  -H "Content-Type: application/json"`;
    curl += ` \\\n  -d '{"name": "Example Object"}'`;
  }

  // Replace path parameters with example values
  curl = curl.replace(/{id}/g, 'example-id');

  return curl + '\n';
}
