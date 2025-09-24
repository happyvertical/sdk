/**
 * @have/smrt generators - Create CLIs, REST APIs, and MCP servers from SMRT objects
 */

export type { CLICommand, CLIConfig, CLIContext, ParsedArgs } from './cli.js';
// CLI Generator (includes both library and executable)
export { CLIGenerator } from './cli.js';
export type {
  MCPConfig,
  MCPContext,
  MCPRequest,
  MCPResponse,
  MCPTool,
} from './mcp.js';
// MCP Server Generator
export { MCPGenerator } from './mcp.js';
export type { APIConfig, APIContext, RestServerConfig } from './rest.js';
// REST API Generator and server utilities
export { APIGenerator, createRestServer, startRestServer } from './rest.js';
export type { OpenAPIConfig } from './swagger.js';
// Swagger/OpenAPI documentation utilities
export {
  generateOpenAPISpec,
  setupSwaggerUI,
} from './swagger.js';
