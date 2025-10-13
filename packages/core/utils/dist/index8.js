import { basename } from "node:path";
import { parseArgs } from "node:util";
function parseCliArgs(argv, commands, builtInCommands = {}) {
  let args = argv;
  if (args.length > 0 && basename(args[0]) === "node") {
    args = args.slice(1);
  }
  if (args.length > 0 && args[0].endsWith(".js")) {
    args = args.slice(1);
  }
  if (args.length === 0) {
    return { args: [], options: {} };
  }
  if (args.includes("--help")) {
    return { command: "help", args: [], options: {} };
  }
  if (args.includes("--version")) {
    return { command: "version", args: [], options: {} };
  }
  let matchedCommand;
  let commandName;
  let commandWordCount = 0;
  for (let i = Math.min(3, args.length); i > 0; i--) {
    const possibleCommand = args.slice(0, i).join(" ");
    const found = builtInCommands[possibleCommand] || commands.find(
      (cmd) => cmd.name === possibleCommand || cmd.aliases?.includes(possibleCommand)
    );
    if (found) {
      matchedCommand = found;
      commandName = possibleCommand;
      commandWordCount = i;
      break;
    }
  }
  if (!commandName && args.length > 0) {
    commandName = args[0];
    commandWordCount = 1;
    matchedCommand = commands.find(
      (cmd) => cmd.name === commandName || cmd.aliases?.includes(commandName)
    );
  }
  if (!matchedCommand) {
    if (args.includes("-h")) {
      return { command: "help", args: [], options: {} };
    }
    if (args.includes("-v")) {
      return { command: "version", args: [], options: {} };
    }
    return {
      command: commandName,
      args: args.slice(1).filter((arg) => !arg.startsWith("-")),
      options: {}
    };
  }
  const parseConfig = {
    args: args.slice(commandWordCount),
    options: {},
    strict: false,
    // Allow unknown options
    allowPositionals: true
    // Required for mixing positional args and options
  };
  if (matchedCommand.options) {
    for (const [name, option] of Object.entries(matchedCommand.options)) {
      parseConfig.options[name] = {
        type: option.type === "boolean" ? "boolean" : "string",
        ...option.default !== void 0 && { default: option.default }
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
    return {
      command: commandName,
      args: args.slice(commandWordCount).filter((arg) => !arg.startsWith("-")),
      options: {}
    };
  }
}
export {
  parseCliArgs
};
//# sourceMappingURL=index8.js.map
