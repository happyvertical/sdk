/**
 * MCP (Model Context Protocol) server generator for smrt objects
 *
 * Exposes smrt objects as AI tools for Claude, GPT, and other AI models
 */
export interface MCPConfig {
    name?: string;
    version?: string;
    description?: string;
    server?: {
        name: string;
        version: string;
    };
}
export interface MCPContext {
    db?: any;
    ai?: any;
    user?: {
        id: string;
        roles?: string[];
    };
}
export interface MCPTool {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
}
export interface MCPRequest {
    method: string;
    params: {
        name: string;
        arguments: Record<string, any>;
    };
}
export interface MCPResponse {
    content: Array<{
        type: 'text';
        text: string;
    }>;
}
/**
 * Generate MCP server from smrt objects
 */
export declare class MCPGenerator {
    private config;
    private context;
    private collections;
    constructor(config?: MCPConfig, context?: MCPContext);
    /**
     * Generate all available tools from registered objects
     */
    generateTools(): MCPTool[];
    /**
     * Generate tools for a specific object
     */
    private generateObjectTools;
    /**
     * Convert field definition to MCP schema
     */
    private fieldToMCPSchema;
    /**
     * Handle MCP tool calls
     */
    handleToolCall(request: MCPRequest): Promise<MCPResponse>;
    /**
     * Get or create collection for an object
     */
    private getCollection;
    /**
     * Execute action on collection
     */
    private executeAction;
    /**
     * Generate MCP server info
     */
    getServerInfo(): {
        name: string | undefined;
        version: string | undefined;
        description: string | undefined;
    };
}
