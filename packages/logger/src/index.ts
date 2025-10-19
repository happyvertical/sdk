/**
 * @have/logger - Structured logging for HAVE SDK
 *
 * Provides a structured logging interface with signal adapter integration.
 * Supports configurable log levels and console output.
 *
 * @example
 * ```typescript
 * import { createLogger, LoggerAdapter } from '@have/logger';
 * import { SignalBus } from '@have/smrt';
 *
 * // Create logger
 * const logger = createLogger('info');
 * logger.info('Application started');
 *
 * // Integrate with signals
 * const signalBus = new SignalBus();
 * signalBus.register(new LoggerAdapter(logger));
 * ```
 */

export { LoggerAdapter } from './adapter.js';
export { ConsoleLogger } from './console.js';
export type { Logger, LoggerConfig, LogLevel } from './logger.js';
export type { Signal, SignalAdapter, SignalType } from './signal-types.js';

import { loadEnvConfig } from '@have/utils';
import { ConsoleLogger } from './console.js';
import type { Logger, LoggerConfig, LogLevel } from './logger.js';

/**
 * No-op logger that discards all log messages
 *
 * Used when logging is disabled (config: false)
 */
class NoopLogger implements Logger {
  debug(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  info(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  warn(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }

  error(_message: string, _context?: Record<string, unknown>): void {
    // No-op
  }
}

/**
 * Create a logger from configuration
 *
 * Supports environment variable configuration via HAVE_LOGGER_LEVEL.
 * User-provided options take precedence over environment variables.
 *
 * @param config - Logger configuration (boolean or object)
 * @returns Configured logger instance
 *
 * @example
 * ```typescript
 * // Console logger with 'info' level (default)
 * const logger1 = createLogger(true);
 *
 * // Console logger with level from HAVE_LOGGER_LEVEL env var
 * process.env.HAVE_LOGGER_LEVEL = 'debug';
 * const logger2 = createLogger(true); // Uses 'debug' from env
 *
 * // No-op logger (all log calls are discarded)
 * const logger3 = createLogger(false);
 *
 * // Console logger with 'debug' level (overrides env)
 * const logger4 = createLogger({ level: 'debug' });
 *
 * // Custom log level (user options take precedence)
 * process.env.HAVE_LOGGER_LEVEL = 'info';
 * const logger5 = createLogger({ level: 'warn' }); // Uses 'warn' not 'info'
 * ```
 */
export function createLogger(config: LoggerConfig): Logger {
  if (typeof config === 'boolean') {
    // When false, return no-op logger that discards all messages
    if (!config) {
      return new NoopLogger();
    }

    // Check HAVE_LOGGER_LEVEL env var when config is true
    const envConfig = loadEnvConfig<{ level?: LogLevel }>(
      {},
      {
        packageName: 'logger',
        schema: { level: 'string' },
      },
    );

    return new ConsoleLogger(envConfig.level || 'info');
  }

  // Merge user config with env vars (user options take precedence)
  const mergedConfig = loadEnvConfig<{ level?: LogLevel }>(config, {
    packageName: 'logger',
    schema: { level: 'string' },
  });

  const level = mergedConfig.level || 'info';
  return new ConsoleLogger(level);
}
