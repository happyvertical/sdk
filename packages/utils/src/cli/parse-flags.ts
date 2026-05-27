/**
 * Lightweight flag/positional splitter for one-shot scripts.
 *
 * Distinct from `parseCliArgs`, which models multi-word commands and typed
 * options. `parseFlagArgs` is the bare-bones alternative for scripts that
 * just need `{ flags, positionals }` from `process.argv.slice(2)`.
 *
 * Flag forms supported:
 *   --foo            -> flags.foo = true
 *   --foo bar        -> flags.foo = 'bar'
 *   --foo=bar        -> flags.foo = 'bar'
 *   --foo-bar baz    -> flags.fooBar = 'baz'   (kebab -> camel)
 *   --               -> ignored (POSIX end-of-options marker)
 *
 * Anything not starting with `--` becomes a positional.
 */
export interface ParsedFlagArgs {
  flags: Record<string, string | true>;
  positionals: string[];
}

export function parseFlagArgs(args: string[]): ParsedFlagArgs {
  const flags: Record<string, string | true> = {};
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/su, 2);
    const key = rawKey.replace(/-([a-z])/gu, (_match, letter: string) =>
      letter.toUpperCase(),
    );
    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
      continue;
    }

    const next = args[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }

  return { flags, positionals };
}
