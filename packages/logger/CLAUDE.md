# @happyvertical/logger

Structured logging with signal adapter. Factory: `createLogger(config): Logger`.

## Key patterns

- `LoggerConfig`: `true` = console at info level, `false` = no-op, `{ level }` = specific level
- Log levels: `debug`, `info`, `warn`, `error` (severity order)
- All methods accept `(message, context?)` where context is `Record<string, unknown>`
- `LoggerAdapter` converts SMRT framework signals to log entries (start/step→debug, end→info, error→error)
- `SentryAdapter` (via `@happyvertical/logger/sentry`) routes signals to Sentry/GlitchTip
- Env var: `HAVE_LOGGER_LEVEL` sets default log level (user options override)

## Gotchas

- `@sentry/node` is an optional peer dep — only needed for `SentryAdapter`
- Sentry sub-path export: `import { createSentryAdapter } from '@happyvertical/logger/sentry'`
- `createLogger(false)` returns a `NoopLogger` that silently discards all messages
- Signal types are defined locally (copied from `@happyvertical/types`) to keep logger independent
- Used by most other SDK packages — avoid circular dependencies
