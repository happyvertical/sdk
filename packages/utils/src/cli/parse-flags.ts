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
 *   --               -> stop parsing flags; rest are positionals
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
    if (arg === '--') {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/su, 2);
    if (rawKey === '') {
      // `--=value` or just `--` followed by garbage — the empty key
      // would be unreachable to any sensible caller. Throw rather than
      // silently producing `flags[''] = value`.
      throw new Error(
        `Invalid flag token "${arg}": flag name is empty. Use --key=value or --key value.`,
      );
    }
    const key = rawKey.replace(/-([a-z])/gu, (_match, letter: string) =>
      letter.toUpperCase(),
    );
    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
      continue;
    }

    const next = args[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }

  return { flags, positionals };
}
