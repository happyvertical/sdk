/**
 * CLI command generator for smrt objects
 *
 * Generates admin and development tools from object definitions
 */
export interface CLIConfig {
    name?: string;
    version?: string;
    description?: string;
    prompt?: boolean;
    colors?: boolean;
}
export interface CLIContext {
    db?: any;
    ai?: any;
    user?: {
        id: string;
        roles?: string[];
    };
}
export interface CLICommand {
    name: string;
    description: string;
    aliases?: string[];
    options?: Record<string, {
        type: 'string' | 'boolean';
        description: string;
        default?: any;
        short?: string;
    }>;
    args?: string[];
    handler: (args: any, options: any) => Promise<void>;
}
export interface ParsedArgs {
    command?: string;
    args: string[];
    options: Record<string, any>;
}
/**
 * Generate CLI commands for smrt objects
 */
export declare class CLIGenerator {
    private config;
    private context;
    private collections;
    constructor(config?: CLIConfig, context?: CLIContext);
    /**
     * Check if running in test environment
     */
    private isTestMode;
    /**
     * Handle exits safely in test mode
     */
    private exitWithError;
    /**
     * Generate CLI handler function
     */
    generateHandler(): (argv: string[]) => Promise<void>;
    /**
     * Generate all CLI commands
     */
    private generateCommands;
    /**
     * Generate CRUD commands for a specific object
     */
    private generateObjectCommands;
    /**
     * Parse command line arguments
     */
    parseArguments(argv: string[], commands: CLICommand[]): ParsedArgs;
    /**
     * Execute a parsed command
     */
    executeCommand(parsed: ParsedArgs, commands: CLICommand[]): Promise<void>;
    /**
     * Generate utility commands
     */
    generateUtilityCommands(): CLICommand[];
    /**
     * Create schema command handler
     */
    private createSchemaHandler;
    /**
     * Show help information
     */
    showHelp(commands: CLICommand[]): void;
    /**
     * Create a simple spinner
     */
    private createSpinner;
    /**
     * Prompt for input
     */
    private prompt;
    /**
     * Confirm prompt
     */
    private confirm;
    /**
     * Handle LIST command
     */
    private handleList;
    /**
     * Handle GET command
     */
    private handleGet;
    /**
     * Handle CREATE command
     */
    private handleCreate;
    /**
     * Handle UPDATE command
     */
    private handleUpdate;
    /**
     * Handle DELETE command
     */
    private handleDelete;
    /**
     * Get or create collection for an object
     */
    private getCollection;
    /**
     * Interactive field prompts
     */
    private promptForFields;
    /**
     * Parse field value from string
     */
    private parseFieldValue;
    /**
     * Display results as table
     */
    private displayTable;
    /**
     * Convert object to YAML-like string
     */
    private toYamlString;
}
