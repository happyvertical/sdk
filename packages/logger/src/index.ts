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

export { ConsoleLogger } from './console.js';
export { LoggerAdapter } from './adapter.js';
export type { Logger, LogLevel, LoggerConfig } from './logger.js';

import { ConsoleLogger } from './console.js';
import type { Logger, LoggerConfig } from './logger.js';

/**
 * Create a logger from configuration
 *
 * @param config - Logger configuration (boolean or object)
 * @returns Configured logger instance
 *
 * @example
 * ```typescript
 * // Default console logger with 'info' level
 * const logger1 = createLogger(true);
 *
 * // Console logger with 'debug' level
 * const logger2 = createLogger({ level: 'debug' });
 *
 * // Custom log level
 * const logger3 = createLogger({ level: 'warn' });
 * ```
 */
export function createLogger(config: LoggerConfig): Logger {
  if (typeof config === 'boolean') {
    return new ConsoleLogger(config ? 'info' : 'error');
  }

  const level = config.level || 'info';
  return new ConsoleLogger(level);
}
