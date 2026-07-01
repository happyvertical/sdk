# @happyvertical/logger

Structured logging for HAVE SDK with signal adapter integration and optional Sentry error tracking. Provides a `Logger` interface with four severity levels, a console implementation with level filtering, and adapters that convert SMRT framework signals into log entries or Sentry breadcrumbs/exceptions.

## Installation

```bash
pnpm add @happyvertical/logger

# Optional: for Sentry integration
pnpm add @sentry/node
```

Depends on `@happyvertical/utils`. Optional peer dependency on `@sentry/node` (for the `/sentry` subpath).

## Basic Usage

```typescript
import { createLogger } from '@happyvertical/logger';

// Console logger with default 'info' level
const logger = createLogger(true);

logger.info('Application started');
logger.debug('Verbose detail'); // Not output (below 'info')
logger.warn('High memory usage', { memoryMB: 512 });
logger.error('Connection failed', { host: 'localhost', port: 5432 });

// Configure a specific level
const debugLogger = createLogger({ level: 'debug' });

// No-op logger — all calls discarded, zero overhead
const silent = createLogger(false);
```

### Environment Variable

Set `HAVE_LOGGER_LEVEL` to `debug`, `info`, `warn`, or `error`. Applies when using `createLogger(true)` or `createLogger({})`. Explicit config takes precedence:

```typescript
process.env.HAVE_LOGGER_LEVEL = 'debug';
const logger = createLogger(true); // uses 'debug' from env

const explicit = createLogger({ level: 'warn' }); // uses 'warn', ignores env
```

## Log Levels

`debug < info < warn < error` — messages below the configured threshold are discarded.

```typescript
const logger = createLogger({ level: 'warn' });
logger.debug('ignored');  // not output
logger.info('ignored');   // not output
logger.warn('output');    // output
logger.error('output');   // output
```

Output format: `[LEVEL] message {"key":"value"}`

## Signal Adapter

`LoggerAdapter` converts SMRT framework signals into structured log entries:

```typescript
import { createLogger, LoggerAdapter } from '@happyvertical/logger';

const logger = createLogger({ level: 'info' });
const adapter = new LoggerAdapter(logger);
// Register adapter with a signal bus to log operations automatically
```

Signal type mapping: `start` → debug, `step` → debug, `end` → info, `error` → error.

## Sentry Adapter

The `/sentry` subpath routes signals to Sentry/GlitchTip. Requires `@sentry/node` as a peer dependency.

```typescript
import { createSentryAdapter } from '@happyvertical/logger/sentry';

const adapter = createSentryAdapter({ category: 'myapp' });
// Register adapter with a signal bus

// Error signals → Sentry.captureException with scope tags
// Non-error signals → Sentry.addBreadcrumb for debugging trail
```

## API Overview

### Factory

| Function | Description |
|----------|-------------|
| `createLogger(config)` | Returns a `Logger` — `ConsoleLogger` when enabled, no-op when `false` |
| `createSentryAdapter(config?)` | Returns a `SentryAdapter` (from `/sentry` subpath) |

### Classes

| Class | Description |
|-------|-------------|
| `ConsoleLogger` | Logger implementation with level filtering, writes to `console.*` |
| `LoggerAdapter` | Signal adapter that converts signals to structured log messages |
| `SentryAdapter` | Signal adapter that routes errors to Sentry and adds breadcrumbs |

### Types

| Type | Description |
|------|-------------|
| `Logger` | Interface with `debug`, `info`, `warn`, `error` methods |
| `LogLevel` | `'debug' \| 'info' \| 'warn' \| 'error'` |
| `LoggerConfig` | `boolean \| { level?: LogLevel }` |
| `Signal` | Signal event from operation execution |
| `SignalAdapter` | Interface for handling signals |
| `SignalType` | `'start' \| 'step' \| 'end' \| 'error'` |
| `SentryAdapterConfig` | `{ category?: string }` |

### Custom Logger

Implement the `Logger` interface for custom backends:

```typescript
import type { Logger } from '@happyvertical/logger';

class MyLogger implements Logger {
  debug(message: string, context?: Record<string, unknown>): void { /* ... */ }
  info(message: string, context?: Record<string, unknown>): void { /* ... */ }
  warn(message: string, context?: Record<string, unknown>): void { /* ... */ }
  error(message: string, context?: Record<string, unknown>): void { /* ... */ }
}
```

## License

MIT
