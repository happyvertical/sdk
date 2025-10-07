/**
 * Universal logging utilities that work in both browser and Node.js
 *
 * Provides a configurable logging system with console and no-op implementations.
 * The global logger can be swapped out for custom implementations as needed.
 */
import type { Logger } from './types';
/**
 * Replace the global logger with a custom implementation
 *
 * @param logger - Custom logger implementation
 * @example
 * ```typescript
 * setLogger(new CustomLogger());
 * ```
 */
export declare const setLogger: (logger: Logger) => void;
/**
 * Get the current global logger instance
 *
 * @returns Current logger implementation
 * @example
 * ```typescript
 * const logger = getLogger();
 * logger.info('Application started');
 * ```
 */
export declare const getLogger: () => Logger;
/**
 * Disable all logging by switching to no-op logger
 *
 * @example
 * ```typescript
 * if (process.env.NODE_ENV === 'production') {
 *   disableLogging();
 * }
 * ```
 */
export declare const disableLogging: () => void;
/**
 * Enable console logging by switching to console logger
 *
 * @example
 * ```typescript
 * enableLogging(); // Re-enable after disabling
 * ```
 */
export declare const enableLogging: () => void;
