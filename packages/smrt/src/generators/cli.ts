/**
 * CLI command generator for smrt objects
 * 
 * Generates admin and development tools from object definitions
 */

import { parseArgs } from 'util';
import { createInterface } from 'readline';
import { ObjectRegistry } from '../registry.js';
import { BaseCollection } from '../collection.js';
import type { BaseObject } from '../object.js';

export interface CLIConfig {
  name?: string;
  version?: string;
  description?: string;
  prompt?: boolean; // Enable interactive prompts
  colors?: boolean; // Enable colored output
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
export class CLIGenerator {
  private config: CLIConfig;
  private context: CLIContext;
  private collections = new Map<string, BaseCollection<any>>();

  constructor(config: CLIConfig = {}, context: CLIContext = {}) {
    this.config = {
      name: 'smrt',
      version: '1.0.0',
      description: 'Admin CLI for smrt objects',
      prompt: true,
      colors: true,
      ...config
    };
    this.context = context;
  }

  /**
   * Check if running in test environment
   */
  private isTestMode(): boolean {
    return process.env.NODE_ENV === 'test' ||
           process.env.VITEST === 'true' ||
           typeof (global as any).it === 'function' ||
           typeof (global as any).describe === 'function';
  }

  /**
   * Handle exits safely in test mode
   */
  private exitWithError(message: string, code: number = 1): void {
    if (this.isTestMode()) {
      throw new Error(message);
    } else {
      console.error(message);
      process.exit(code);
    }
  }

  /**
   * Generate CLI handler function
   */
  generateHandler(): (argv: string[]) => Promise<void> {
    const commands = this.generateCommands();
    
    return async (argv: string[]) => {
      const parsed = this.parseArguments(argv, commands);
      await this.executeCommand(parsed, commands);
    };
  }

  /**
   * Generate all CLI commands
   */
  private generateCommands(): CLICommand[] {
    const commands: CLICommand[] = [];
    const registeredClasses = ObjectRegistry.getAllClasses();

    // Generate object commands
    for (const [name, classInfo] of registeredClasses) {
      commands.push(...this.generateObjectCommands(name, classInfo));
    }

    // Add utility commands
    commands.push(...this.generateUtilityCommands());

    return commands;
  }

  /**
   * Generate CRUD commands for a specific object
   */
  private generateObjectCommands(objectName: string, classInfo: any): CLICommand[] {
    const commands: CLICommand[] = [];
    const lowerName = objectName.toLowerCase();
    const config = ObjectRegistry.getConfig(objectName);
    const cliConfig = config.cli;
    
    // Skip if CLI is disabled
    if (cliConfig === false) return commands;
    
    // Check included/excluded commands
    const excluded = (typeof cliConfig === 'object' ? cliConfig.exclude : []) || [];
    const included = (typeof cliConfig === 'object' ? cliConfig.include : null);
    
    const shouldInclude = (command: 'list' | 'get' | 'create' | 'update' | 'delete') => {
      if (included && !included.includes(command)) return false;
      if (excluded.includes(command)) return false;
      return true;
    };

    // LIST command
    if (shouldInclude('list')) {
      commands.push({
        name: `${lowerName}:list`,
        description: `List ${objectName} objects`,
        aliases: [`${lowerName}:ls`],
        options: {
          limit: { type: 'string', description: 'limit number of results', default: '50', short: 'l' },
          offset: { type: 'string', description: 'offset for pagination', default: '0', short: 'o' },
          'order-by': { type: 'string', description: 'field to order by' },
          where: { type: 'string', description: 'filter conditions as JSON' },
          format: { type: 'string', description: 'output format (table|json)', default: 'table' }
        },
        handler: async (args, options) => {
          await this.handleList(objectName, options);
        }
      });
    }

    // GET command
    if (shouldInclude('get')) {
      commands.push({
        name: `${lowerName}:get`,
        description: `Get ${objectName} by ID or slug`,
        aliases: [`${lowerName}:show`],
        args: ['id'],
        options: {
          format: { type: 'string', description: 'output format (json|yaml)', default: 'json' }
        },
        handler: async (args, options) => {
          await this.handleGet(objectName, args[0], options);
        }
      });
    }

    // CREATE command
    if (shouldInclude('create')) {
      const options: Record<string, any> = {
        interactive: { type: 'boolean', description: 'interactive mode with prompts' },
        'from-file': { type: 'string', description: 'create from JSON file' }
      };

      // Add field options
      const fields = ObjectRegistry.getFields(objectName);
      for (const [fieldName, field] of fields) {
        const optionName = fieldName.replace(/_/g, '-');
        const description = field.options?.description || `${objectName} ${fieldName}`;
        options[optionName] = { type: 'string', description };
      }

      commands.push({
        name: `${lowerName}:create`,
        description: `Create new ${objectName}`,
        aliases: [`${lowerName}:new`],
        options,
        handler: async (args, options) => {
          await this.handleCreate(objectName, options);
        }
      });
    }

    // UPDATE command
    if (shouldInclude('update')) {
      const options: Record<string, any> = {
        interactive: { type: 'boolean', description: 'interactive mode with prompts' },
        'from-file': { type: 'string', description: 'update from JSON file' }
      };

      // Add field options
      const fields = ObjectRegistry.getFields(objectName);
      for (const [fieldName, field] of fields) {
        const optionName = fieldName.replace(/_/g, '-');
        const description = field.options?.description || `${objectName} ${fieldName}`;
        options[optionName] = { type: 'string', description };
      }

      commands.push({
        name: `${lowerName}:update`,
        description: `Update ${objectName}`,
        aliases: [`${lowerName}:edit`],
        args: ['id'],
        options,
        handler: async (args, options) => {
          await this.handleUpdate(objectName, args[0], options);
        }
      });
    }

    // DELETE command
    if (shouldInclude('delete')) {
      commands.push({
        name: `${lowerName}:delete`,
        description: `Delete ${objectName}`,
        aliases: [`${lowerName}:rm`],
        args: ['id'],
        options: {
          force: { type: 'boolean', description: 'skip confirmation prompt' }
        },
        handler: async (args, options) => {
          await this.handleDelete(objectName, args[0], options);
        }
      });
    }

    return commands;
  }

  /**
   * Parse command line arguments
   */
  parseArguments(argv: string[], commands: CLICommand[]): ParsedArgs {
    // Remove node and script name if present
    const args = argv.slice(0, 2).some(arg => arg.endsWith('node') || arg.endsWith('.js')) ? argv.slice(2) : argv;

    if (args.length === 0) {
      return { args: [], options: {} };
    }

    // Handle global flags first
    if (args.includes('--help') || args.includes('-h')) {
      return { command: 'help', args: [], options: {} };
    }

    if (args.includes('--version') || args.includes('-v')) {
      return { command: 'version', args: [], options: {} };
    }

    const commandName = args[0];
    const command = commands.find(cmd =>
      cmd.name === commandName || (cmd.aliases && cmd.aliases.includes(commandName))
    );

    if (!command) {
      return { command: commandName, args: args.slice(1), options: {} };
    }

    // Build parseArgs config from command definition
    const parseConfig: any = {
      args: args.slice(1),
      options: {},
      strict: false // Allow unknown options
    };

    if (command.options) {
      for (const [name, option] of Object.entries(command.options)) {
        parseConfig.options[name] = {
          type: option.type === 'boolean' ? 'boolean' : 'string',
          ...(option.default !== undefined && { default: option.default })
        };
        if (option.short) {
          parseConfig.options[name].short = option.short;
        }
      }
    }

    try {
      const parsed = parseArgs(parseConfig);
      return {
        command: commandName,
        args: parsed.positionals || [],
        options: parsed.values || {}
      };
    } catch (error) {
      // Fallback for parse errors
      console.warn('Argument parsing failed, using fallback:', error);
      return {
        command: commandName,
        args: args.slice(1).filter(arg => !arg.startsWith('-')),
        options: {}
      };
    }
  }

  /**
   * Execute a parsed command
   */
  async executeCommand(parsed: ParsedArgs, commands: CLICommand[]): Promise<void> {
    if (!parsed.command) {
      this.showHelp(commands);
      return;
    }

    const command = commands.find(cmd => 
      cmd.name === parsed.command || (parsed.command && cmd.aliases && cmd.aliases.includes(parsed.command))
    );

    if (!command) {
      this.exitWithError(`Unknown command '${parsed.command}'`);
      return;
    }

    // Validate required arguments
    if (command.args && parsed.args.length < command.args.length) {
      this.exitWithError(`Missing required arguments: ${command.args.slice(parsed.args.length).join(', ')}`);
      return;
    }

    try {
      await command.handler(parsed.args, parsed.options);
    } catch (error) {
      this.exitWithError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate utility commands
   */
  generateUtilityCommands(): CLICommand[] {
    const commands: CLICommand[] = [];

    // List all registered objects
    commands.push({
      name: 'objects',
      description: 'List all registered smrt objects',
      aliases: ['ls'],
      handler: async (args, options) => {
        const registeredClasses = ObjectRegistry.getAllClasses();
        console.log('Registered smrt objects:');
        for (const [name] of registeredClasses) {
          console.log(`  • ${name}`);
        }
      }
    });

    // Schema information
    commands.push({
      name: 'schema',
      description: 'Show schema for an object',
      args: ['object'],
      handler: this.createSchemaHandler()
    });

    // Help command
    commands.push({
      name: 'help',
      description: 'Show help information',
      aliases: ['h'],
      handler: async (args, options) => {
        this.showHelp(commands);
      }
    });

    // Version command
    commands.push({
      name: 'version',
      description: 'Show version information',
      aliases: ['v'],
      handler: async (args, options) => {
        console.log(`${this.config.name} v${this.config.version}`);
      }
    });

    // Status command
    commands.push({
      name: 'status',
      description: 'Show system status',
      handler: async (args, options) => {
        console.log('System Status:');
        console.log(`- CLI: ${this.config.name} v${this.config.version}`);
        console.log(`- Database: ${this.context.db ? 'Connected' : 'Not connected'}`);
        console.log(`- AI: ${this.context.ai ? 'Available' : 'Not available'}`);
        console.log(`- User: ${this.context.user?.id || 'Not authenticated'}`);
      }
    });

    return commands;
  }

  /**
   * Create schema command handler
   */
  private createSchemaHandler(): (args: any, options: any) => Promise<void> {
    return async (args: any, options: any) => {
      const objectName = args[0];
      const fields = ObjectRegistry.getFields(objectName);
      if (fields.size === 0) {
        this.exitWithError(`Object ${objectName} not found`);
        return;
      }

      console.log(`Schema for ${objectName}:`);
      for (const [fieldName, field] of fields) {
        console.log(`  ${fieldName}: ${field.type}${field.options?.required ? ' (required)' : ''}`);
        if (field.options?.description) {
          console.log(`    ${field.options.description}`);
        }
      }
    };
  }

  /**
   * Show help information
   */
  showHelp(commands: CLICommand[]): void {
    console.log(`${this.config.name} v${this.config.version}`);
    console.log(this.config.description);
    console.log();
    console.log('Commands:');
    
    for (const command of commands) {
      const aliases = command.aliases ? ` (${command.aliases.join(', ')})` : '';
      const args = command.args ? ` ${command.args.map(arg => `<${arg}>`).join(' ')}` : '';
      console.log(`  ${command.name}${args}${aliases}`);
      console.log(`    ${command.description}`);
      
      if (command.options) {
        for (const [name, option] of Object.entries(command.options)) {
          const short = option.short ? `-${option.short}, ` : '';
          console.log(`    ${short}--${name}: ${option.description}`);
        }
      }
      console.log();
    }
  }

  /**
   * Create a simple spinner
   */
  private createSpinner(text: string): { succeed: (text?: string) => void; fail: (text?: string) => void } {
    if (this.config.colors) {
      process.stdout.write(`⠋ ${text}`);
      return {
        succeed: (successText?: string) => {
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          console.log(`✅ ${successText || text}`);
        },
        fail: (errorText?: string) => {
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          console.log(`❌ ${errorText || text}`);
        }
      };
    } else {
      console.log(text);
      return {
        succeed: (successText?: string) => console.log(successText || 'Done'),
        fail: (errorText?: string) => console.log(errorText || 'Failed')
      };
    }
  }

  /**
   * Stop a spinner
   */
  private stopSpinner(): void {
    if (this.config.colors) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }
  }

  /**
   * Prompt for input
   */
  private async prompt(message: string): Promise<string> {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve) => {
      rl.question(message + ' ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });
  }

  /**
   * Confirm prompt
   */
  private async confirm(message: string): Promise<boolean> {
    const answer = await this.prompt(message + ' (y/n)');
    return answer.toLowerCase().startsWith('y');
  }

  /**
   * Handle LIST command
   */
  private async handleList(objectName: string, options: any): Promise<void> {
    const spinner = this.createSpinner(`Listing ${objectName} objects...`);
    
    try {
      const collection = await this.getCollection(objectName);
      
      const listOptions: any = {
        limit: parseInt(options.limit),
        offset: parseInt(options.offset)
      };

      if (options.orderBy) {
        listOptions.orderBy = options.orderBy;
      }

      if (options.where) {
        listOptions.where = JSON.parse(options.where);
      }

      const results = await collection.list(listOptions);
      
      spinner.succeed(`Found ${results.length} ${objectName} objects`);

      if (options.format === 'json') {
        console.log(JSON.stringify(results, null, 2));
      } else {
        this.displayTable(results, objectName);
      }
    } catch (error) {
      spinner.fail(`Failed to list ${objectName} objects`);
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Handle GET command
   */
  private async handleGet(objectName: string, id: string, options: any): Promise<void> {
    const spinner = this.createSpinner(`Getting ${objectName}...`);
    
    try {
      const collection = await this.getCollection(objectName);
      const result = await collection.get(id);

      if (!result) {
        spinner.fail(`${objectName} not found`);
        this.exitWithError(`${objectName} not found`);
        return;
      }

      spinner.succeed(`Found ${objectName}`);

      if (options.format === 'yaml') {
        // Simple YAML-like output
        console.log(this.toYamlString(result));
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      spinner.fail(`Failed to get ${objectName}`);
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Handle CREATE command
   */
  private async handleCreate(objectName: string, options: any): Promise<void> {
    try {
      let data: any = {};

      if (options.fromFile) {
        // Load from file
        const fs = await import('fs/promises');
        const content = await fs.readFile(options.fromFile, 'utf-8');
        data = JSON.parse(content);
      } else if (options.interactive && this.config.prompt) {
        // Interactive mode
        data = await this.promptForFields(objectName, {});
      } else {
        // From command line options
        const fields = ObjectRegistry.getFields(objectName);
        for (const [fieldName] of fields) {
          const optionName = fieldName.replace(/_/g, '-');
          if (options[optionName] !== undefined) {
            data[fieldName] = this.parseFieldValue(options[optionName]);
          }
        }
      }

      const spinner = this.createSpinner(`Creating ${objectName}...`);

      const collection = await this.getCollection(objectName);
      const result = await collection.create(data);
      await result.save();

      spinner.succeed(`Created ${objectName} with ID: ${result.id}`);
      
      if (!options.quiet) {
        console.log(JSON.stringify(result, null, 2));
      }
    } catch (error) {
      this.exitWithError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Handle UPDATE command
   */
  private async handleUpdate(objectName: string, id: string, options: any): Promise<void> {
    try {
      const collection = await this.getCollection(objectName);
      const existing = await collection.get(id);

      if (!existing) {
        this.exitWithError(`${objectName} not found`);
        return;
      }

      let data: any = {};

      if (options.fromFile) {
        // Load from file
        const fs = await import('fs/promises');
        const content = await fs.readFile(options.fromFile, 'utf-8');
        data = JSON.parse(content);
      } else if (options.interactive && this.config.prompt) {
        // Interactive mode with current values
        data = await this.promptForFields(objectName, existing);
      } else {
        // From command line options
        const fields = ObjectRegistry.getFields(objectName);
        for (const [fieldName] of fields) {
          const optionName = fieldName.replace(/_/g, '-');
          if (options[optionName] !== undefined) {
            data[fieldName] = this.parseFieldValue(options[optionName]);
          }
        }
      }

      const spinner = this.createSpinner(`Updating ${objectName}...`);

      Object.assign(existing, data);
      await existing.save();

      spinner.succeed(`Updated ${objectName}`);
      
      if (!options.quiet) {
        console.log(JSON.stringify(existing, null, 2));
      }
    } catch (error) {
      this.exitWithError(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Handle DELETE command
   */
  private async handleDelete(objectName: string, id: string, options: any): Promise<void> {
    try {
      const collection = await this.getCollection(objectName);
      const existing = await collection.get(id);

      if (!existing) {
        this.exitWithError(`${objectName} not found`);
        return;
      }

      // Confirmation prompt
      if (!options.force && this.config.prompt) {
        const confirmed = await this.confirm(`Are you sure you want to delete ${objectName} "${existing.name || existing.id}"?`);
        if (!confirmed) {
          console.log('Cancelled');
          return;
        }
      }

      const spinner = this.createSpinner(`Deleting ${objectName}...`);

      await existing.delete();

      spinner.succeed(`Deleted ${objectName}`);
    } catch (error) {
      this.exitWithError(error instanceof Error ? error.message : 'Unknown error');
    }
  }


  /**
   * Get or create collection for an object
   */
  private async getCollection(objectName: string): Promise<BaseCollection<any>> {
    if (!this.collections.has(objectName)) {
      const classInfo = ObjectRegistry.getClass(objectName);
      if (!classInfo || !classInfo.collectionConstructor) {
        throw new Error(`Object ${objectName} not found or has no collection constructor`);
      }

      const collection = new classInfo.collectionConstructor({
        ai: this.context.ai,
        db: this.context.db
      });
      
      await collection.initialize();
      this.collections.set(objectName, collection);
    }
    return this.collections.get(objectName)!;
  }

  /**
   * Interactive field prompts
   */
  private async promptForFields(objectName: string, current: any): Promise<any> {
    const fields = ObjectRegistry.getFields(objectName);
    const result: any = {};

    for (const [fieldName, field] of fields) {
      const currentValue = current[fieldName];
      let message = `${fieldName}`;
      if (field.options?.description) {
        message += ` (${field.options.description})`;
      }
      if (currentValue !== undefined) {
        message += ` [${currentValue}]`;
      }
      message += ': ';

      if (field.type === 'boolean') {
        result[fieldName] = await this.confirm(message);
      } else {
        const input = await this.prompt(message);
        if (input.trim()) {
          result[fieldName] = this.parseFieldValue(input);
        } else if (currentValue !== undefined) {
          result[fieldName] = currentValue;
        }
      }
    }

    return result;
  }

  /**
   * Parse field value from string
   */
  private parseFieldValue(value: string): any {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // Return as string
      return value;
    }
  }

  /**
   * Display results as table
   */
  private displayTable(results: any[], objectName: string): void {
    if (results.length === 0) {
      console.log(`No ${objectName} objects found`);
      return;
    }

    // Simple table display
    const keys = ['id', 'name', 'slug', 'created_at'];
    const rows = results.map(item => 
      keys.map(key => String(item[key] || '').substring(0, 30))
    );

    console.log();
    console.log(keys.join('\t'));
    console.log('-'.repeat(80));
    rows.forEach(row => console.log(row.join('\t')));
    console.log();
  }

  /**
   * Convert object to YAML-like string
   */
  private toYamlString(obj: any, indent = 0): string {
    const spaces = '  '.repeat(indent);
    let result = '';

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        result += `${spaces}${key}: null\n`;
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        result += `${spaces}${key}:\n${this.toYamlString(value, indent + 1)}`;
      } else if (Array.isArray(value)) {
        result += `${spaces}${key}:\n`;
        value.forEach(item => {
          result += `${spaces}  - ${item}\n`;
        });
      } else {
        result += `${spaces}${key}: ${value}\n`;
      }
    }

    return result;
  }
}

// CLI Binary Entry Point
async function main() {
  const config: CLIConfig = {
    name: 'smrt',
    version: '1.0.0',
    description: 'Admin CLI for smrt objects',
    prompt: !process.env.CI, // Disable prompts in CI
    colors: !process.env.NO_COLOR && process.stdout.isTTY
  };

  const context: CLIContext = {
    // db and ai can be configured via environment or initialized here
  };

  const cli = new CLIGenerator(config, context);
  const handler = cli.generateHandler();
  
  // Remove 'node' and script name from argv
  const args = process.argv.slice(2);
  
  try {
    await handler(args);
  } catch (error) {
    console.error('CLI Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}