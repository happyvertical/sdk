/**
 * Test logger implementation that captures log entries for testing
 *
 * This logger implements the Logger interface and captures all log entries
 * in memory, allowing tests to verify logging behavior without mocking.
 *
 * @example
 * ```typescript
 * const logger = new TestLogger();
 * logger.info('Hello', { user: 'Alice' });
 * logger.error('Error occurred');
 *
 * expect(logger.entries).toHaveLength(2);
 * expect(logger.entries[0]).toEqual({
 *   level: 'info',
 *   message: 'Hello',
 *   context: { user: 'Alice' }
 * });
 * ```
 */

import type { Logger, LogLevel } from './logger.js';

/**
 * Log entry captured by TestLogger
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Test logger that captures log entries in memory
 *
 * Useful for testing code that uses loggers without:
 * - Mocking logger methods with vi.fn()
 * - Spying on console output
 * - Writing to actual log files
 *
 * Provides a real Logger implementation that can be inspected in tests.
 */
export class TestLogger implements Logger {
  /**
   * All log entries captured by this logger
   */
  public readonly entries: LogEntry[] = [];

  /**
   * Minimum log level to capture (optional filtering)
   */
  private level?: LogLevel;

  constructor(level?: LogLevel) {
    this.level = level;
  }

  /**
   * Get entries of a specific level
   */
  getEntriesByLevel(level: LogLevel): LogEntry[] {
    return this.entries.filter((entry) => entry.level === level);
  }

  /**
   * Get the most recent entry
   */
  getLastEntry(): LogEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /**
   * Check if a log level should be captured
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.level) return true;

    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentIndex = levels.indexOf(this.level);
    const messageIndex = levels.indexOf(level);
    return messageIndex >= currentIndex;
  }

  /**
   * Capture a log entry
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    if (!this.shouldLog(level)) return;

    this.entries.push({
      level,
      message,
      context,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear all captured entries
   */
  clear(): void {
    this.entries.length = 0;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }
}
