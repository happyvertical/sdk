/**
 * @have/smrt generators - Create CLIs, REST APIs, and MCP servers from SMRT objects
 */

// CLI Generator (includes both library and executable)
export { CLIGenerator } from './cli.js';
export type { CLIConfig, CLIContext, CLICommand, ParsedArgs } from './cli.js';

// REST API Generator and server utilities
export { APIGenerator, createRestServer, startRestServer } from './rest.js';
export type { APIConfig, APIContext, RestServerConfig } from './rest.js';

// MCP Server Generator
export { MCPGenerator } from './mcp.js';
export type { 
  MCPConfig, 
  MCPContext, 
  MCPTool, 
  MCPRequest, 
  MCPResponse 
} from './mcp.js';

// Swagger/OpenAPI documentation utilities
export {
  generateOpenAPISpec,
  setupSwaggerUI
} from './swagger.js';
export type { OpenAPIConfig } from './swagger.js';