/**
 * CLI Argument Parsing Utility
 *
 * Provides robust parsing for multi-word commands, options, and arguments.
 * Supports Node.js util.parseArgs for option parsing with fallback.
 */

import { basename } from 'node:path';
import { parseArgs as nodeParseArgs } from 'node:util';

/**
 * Command option configuration
 */
export interface OptionConfig {
  type: 'string' | 'boolean' | 'number';
  description: string;
  default?: any;
  short?: string;
}

/**
 * Command definition
 */
export interface Command {
  name: string;
  description: string;
  aliases?: string[];
  options?: Record<string, OptionConfig>;
  args?: string[];
  handler?: (args: any, options: any) => Promise<void>;
}

/**
 * Parsed command line arguments
 */
export interface ParsedArgs {
  command?: string;
  args: string[];
  options: Record<string, any>;
}

/**
 * Parse command line arguments with support for multi-word commands
 *
 * Handles:
 * - Multi-word commands (up to 3 words: "gnode create", "foo bar baz")
 * - Command aliases
 * - Positional arguments
 * - Options using Node.js util.parseArgs
 * - Global flags (--help, --version)
 * - Automatic removal of node/script paths
 *
 * @param argv - Process argv or custom argument array
 * @param commands - Array of command definitions to match against
 * @param builtInCommands - Optional map of additional built-in commands
 * @returns Parsed arguments with command, args, and options
 *
 * @example
 * ```typescript
 * const parsed = parseCliArgs(
 *   ['node', 'cli.js', 'gnode', 'create', 'my-site', '--template=town'],
 *   commands
 * );
 * // { command: 'gnode create', args: ['my-site'], options: { template: 'town' } }
 * ```
 */
export function parseCliArgs(
  argv: string[],
  commands: Command[],
  builtInCommands: Record<string, Command> = {},
): ParsedArgs {
  // Remove node and script name if present
  // Be precise: only remove if it's actually the node executable or a .js file
  // Use basename to avoid matching commands like "gnode" which end with "node"
  let args = argv;

  // Check if first arg is node executable (check basename to avoid false matches)
  if (args.length > 0 && basename(args[0]) === 'node') {
    args = args.slice(1);
  }

  // Check if first arg is a .js file (script name)
  if (args.length > 0 && args[0].endsWith('.js')) {
    args = args.slice(1);
  }

  if (args.length === 0) {
    return { args: [], options: {} };
  }

  // Handle global --help flag (check for -h later to avoid conflict with command options)
  if (args.includes('--help')) {
    return { command: 'help', args: [], options: {} };
  }

  if (args.includes('--version')) {
    return { command: 'version', args: [], options: {} };
  }

  // Try to match multi-word commands (longest match wins)
  let matchedCommand: Command | undefined;
  let commandName: string | undefined;
  let commandWordCount = 0;

  // Try up to 3 words for command name (e.g., "foo bar baz")
  for (let i = Math.min(3, args.length); i > 0; i--) {
    const possibleCommand = args.slice(0, i).join(' ');
    const found =
      builtInCommands[possibleCommand] ||
      commands.find(
        (cmd) =>
          cmd.name === possibleCommand ||
          cmd.aliases?.includes(possibleCommand),
      );

    if (found) {
      matchedCommand = found;
      commandName = possibleCommand;
      commandWordCount = i;
      break;
    }
  }

  // If no multi-word match, try single word
  if (!commandName && args.length > 0) {
    commandName = args[0];
    commandWordCount = 1;
    matchedCommand = commands.find(
      (cmd) =>
        cmd.name === commandName ||
        cmd.aliases?.includes(commandName as string),
    );
  }

  // If no command matched, check for global short flags
  if (!matchedCommand) {
    if (args.includes('-h')) {
      return { command: 'help', args: [], options: {} };
    }
    if (args.includes('-v')) {
      return { command: 'version', args: [], options: {} };
    }
    // Return unknown command with args filtered
    return {
      command: commandName,
      args: args.slice(1).filter((arg) => !arg.startsWith('-')),
      options: {},
    };
  }

  // Build parseArgs config from command definition
  const parseConfig: any = {
    args: args.slice(commandWordCount),
    options: {},
    strict: false, // Allow unknown options
    allowPositionals: true, // Required for mixing positional args and options
  };

  // Track which options are numbers for post-processing
  const numberOptions: Set<string> = new Set();

  if (matchedCommand.options) {
    for (const [name, option] of Object.entries(matchedCommand.options)) {
      // Node.js parseArgs only supports 'string' and 'boolean'
      // Treat 'number' as 'string' and convert after parsing
      const nodeType = option.type === 'boolean' ? 'boolean' : 'string';

      if (option.type === 'number') {
        numberOptions.add(name);
      }

      parseConfig.options[name] = {
        type: nodeType,
      };

      // Handle default value - convert number defaults to string for parseArgs
      if (option.default !== undefined) {
        parseConfig.options[name].default =
          option.type === 'number' ? String(option.default) : option.default;
      }

      if (option.short) {
        parseConfig.options[name].short = option.short;
      }
    }
  }

  try {
    const parsed = nodeParseArgs(parseConfig);
    // Cast to Record<string, unknown> since we'll be adding number values
    // during post-processing of 'number' type options
    const options: Record<string, unknown> = parsed.values || {};

    // Post-process number options: convert strings to numbers
    for (const name of numberOptions) {
      if (name in options && options[name] !== undefined) {
        const rawValue = options[name];
        // Empty string should be treated as invalid, not as 0
        if (rawValue === '') {
          throw new Error(`Invalid number for --${name}: "${rawValue}"`);
        }
        const value = Number(rawValue);
        if (Number.isNaN(value)) {
          throw new Error(`Invalid number for --${name}: "${rawValue}"`);
        }
        options[name] = value;
      }
    }

    return {
      command: commandName,
      args: parsed.positionals || [],
      options,
    };
  } catch (error) {
    // Re-throw validation errors (invalid number conversion)
    if (error instanceof Error && error.message.startsWith('Invalid number')) {
      throw error;
    }
    // Fallback for parse errors - extract positional args manually
    return {
      command: commandName,
      args: args.slice(commandWordCount).filter((arg) => !arg.startsWith('-')),
      options: {},
    };
  }
}
