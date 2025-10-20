/**
 * Example tests demonstrating common logger usage patterns
 *
 * These tests verify the examples from the README and serve as
 * executable documentation for logger usage.
 *
 * Following organization-wide testing standard:
 * - Tests tell a story about how to use the logger
 * - Real Logger implementations (TestLogger), not mocks
 * - Each test demonstrates a practical use case
 * - Tests serve as documentation and examples
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoggerAdapter } from './adapter.js';
import { createLogger } from './index.js';
import type { Logger, LogLevel } from './logger.js';
import type { Signal } from './signal-types.js';
import { TestLogger } from './test-logger.js';

describe('Logger Examples', () => {
  describe('Example 1: Signal Adapter Integration', () => {
    /**
     * Demonstrates automatic logging of SMRT framework operations
     * via the LoggerAdapter signal handler.
     *
     * README: Lines 170-188
     */
    it('should log SMRT operation signals automatically', async () => {
      // Create logger
      const logger = new TestLogger('info');

      // Create signal adapter
      const loggerAdapter = new LoggerAdapter(logger);

      // Simulate SMRT operation signals (normally from SignalBus)
      const startSignal: Signal = {
        id: 'sig-123',
        objectId: 'prod-456',
        className: 'Product',
        method: 'save',
        type: 'start',
        timestamp: new Date(),
      };

      const endSignal: Signal = {
        id: 'sig-123',
        objectId: 'prod-456',
        className: 'Product',
        method: 'save',
        type: 'end',
        duration: 42,
        result: { id: 'prod-456', name: 'Widget' },
        timestamp: new Date(),
      };

      // Handle signals (normally done by SignalBus)
      await loggerAdapter.handle(startSignal);
      await loggerAdapter.handle(endSignal);

      // Verify automatic logging
      // Note: Only 1 entry because TestLogger filters debug-level start signal
      expect(logger.entries).toHaveLength(1);

      // Start signal logged at debug level (filtered by 'info' level)
      const debugEntries = logger.getEntriesByLevel('debug');
      expect(debugEntries).toHaveLength(0); // Filtered out by level

      // End signal logged at info level
      const infoEntries = logger.getEntriesByLevel('info');
      expect(infoEntries).toHaveLength(1);
      expect(infoEntries[0].message).toBe('Product.save() completed in 42ms');
      expect(infoEntries[0].context).toMatchObject({
        id: 'sig-123',
        objectId: 'prod-456',
        className: 'Product',
        method: 'save',
        duration: 42,
      });
    });

    it('should log all signal types with appropriate levels', async () => {
      const logger = new TestLogger('debug'); // Capture all levels
      const adapter = new LoggerAdapter(logger);

      // Start signal → debug level
      await adapter.handle({
        id: 'op-1',
        objectId: 'obj-1',
        className: 'Order',
        method: 'process',
        type: 'start',
        timestamp: new Date(),
      });

      // Step signal → debug level
      await adapter.handle({
        id: 'op-1',
        objectId: 'obj-1',
        className: 'Order',
        method: 'process',
        type: 'step',
        step: 'validation',
        timestamp: new Date(),
      });

      // End signal → info level
      await adapter.handle({
        id: 'op-1',
        objectId: 'obj-1',
        className: 'Order',
        method: 'process',
        type: 'end',
        duration: 150,
        result: { status: 'completed' },
        timestamp: new Date(),
      });

      // Error signal → error level
      await adapter.handle({
        id: 'op-2',
        objectId: 'obj-2',
        className: 'Order',
        method: 'process',
        type: 'error',
        error: new Error('Payment declined'),
        duration: 50,
        timestamp: new Date(),
      });

      // Verify correct log levels
      expect(logger.getEntriesByLevel('debug')).toHaveLength(2);
      expect(logger.getEntriesByLevel('info')).toHaveLength(1);
      expect(logger.getEntriesByLevel('error')).toHaveLength(1);
    });
  });

  describe('Example 2: Custom Logger Implementation', () => {
    /**
     * Demonstrates implementing the Logger interface for custom backends
     * like file logging, remote services, or custom log aggregation.
     *
     * README: Lines 341-382
     */
    it('should support custom logger implementations', () => {
      // Custom in-memory logger (simpler than file logging for tests)
      class MemoryLogger implements Logger {
        public logs: Array<{
          level: string;
          message: string;
          context?: Record<string, unknown>;
        }> = [];

        debug(message: string, context?: Record<string, unknown>): void {
          this.logs.push({ level: 'DEBUG', message, context });
        }

        info(message: string, context?: Record<string, unknown>): void {
          this.logs.push({ level: 'INFO', message, context });
        }

        warn(message: string, context?: Record<string, unknown>): void {
          this.logs.push({ level: 'WARN', message, context });
        }

        error(message: string, context?: Record<string, unknown>): void {
          this.logs.push({ level: 'ERROR', message, context });
        }
      }

      // Use custom logger
      const logger = new MemoryLogger();
      logger.info('Application started');
      logger.error('Database connection failed', {
        host: 'localhost',
        port: 5432,
      });

      // Verify custom logger captured logs
      expect(logger.logs).toHaveLength(2);
      expect(logger.logs[0]).toEqual({
        level: 'INFO',
        message: 'Application started',
      });
      expect(logger.logs[1]).toEqual({
        level: 'ERROR',
        message: 'Database connection failed',
        context: { host: 'localhost', port: 5432 },
      });
    });
  });

  describe('Example 3: Request Logging Pattern', () => {
    /**
     * Demonstrates HTTP request logging with structured metadata
     * and dynamic log level selection based on response status.
     *
     * README: Lines 390-411
     */
    it('should log HTTP requests with appropriate levels', () => {
      const logger = new TestLogger();

      // Simulate Express middleware pattern
      function logRequest(
        method: string,
        path: string,
        statusCode: number,
        duration: number,
      ) {
        const level: LogLevel =
          statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

        logger[level](`${method} ${path}`, {
          method,
          path,
          statusCode,
          duration,
          userAgent: 'Mozilla/5.0',
          ip: '127.0.0.1',
        });
      }

      // Successful request → info
      logRequest('GET', '/api/users', 200, 45);

      // Client error → warn
      logRequest('POST', '/api/users', 400, 12);

      // Server error → error
      logRequest('GET', '/api/orders', 500, 5000);

      // Verify log levels match status codes
      expect(logger.getEntriesByLevel('info')).toHaveLength(1);
      expect(logger.getEntriesByLevel('warn')).toHaveLength(1);
      expect(logger.getEntriesByLevel('error')).toHaveLength(1);

      // Verify structured metadata
      const errorEntry = logger.getEntriesByLevel('error')[0];
      expect(errorEntry.context).toMatchObject({
        method: 'GET',
        path: '/api/orders',
        statusCode: 500,
        duration: 5000,
      });
    });
  });

  describe('Example 4: Operation Tracking Pattern', () => {
    /**
     * Demonstrates tracking multi-step operations with detailed logging
     * at each step and proper error handling.
     *
     * README: Lines 417-441
     */
    it('should track multi-step operations', async () => {
      const logger = new TestLogger();

      async function processOrder(orderId: string) {
        logger.info('Processing order', { orderId, step: 'start' });

        try {
          logger.debug('Validating order', { orderId, step: 'validate' });
          // await validateOrder(orderId);

          logger.debug('Charging payment', { orderId, step: 'payment' });
          // await chargePayment(orderId);

          logger.debug('Updating inventory', { orderId, step: 'inventory' });
          // await updateInventory(orderId);

          logger.info('Order processed successfully', {
            orderId,
            step: 'complete',
          });
        } catch (error: unknown) {
          logger.error('Order processing failed', {
            orderId,
            step: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }

      // Process order successfully
      await processOrder('ord-123');

      // Verify operation tracking
      expect(logger.entries).toHaveLength(5);

      // Start and complete logged at info
      expect(logger.getEntriesByLevel('info')).toHaveLength(2);

      // Steps logged at debug
      expect(logger.getEntriesByLevel('debug')).toHaveLength(3);

      // Verify step progression in metadata
      const steps = logger.entries.map((e) => e.context?.step);
      expect(steps).toEqual([
        'start',
        'validate',
        'payment',
        'inventory',
        'complete',
      ]);
    });

    it('should log errors during operation tracking', async () => {
      const logger = new TestLogger();

      async function processOrder(orderId: string) {
        logger.info('Processing order', { orderId, step: 'start' });

        try {
          logger.debug('Validating order', { orderId, step: 'validate' });

          // Simulate payment failure
          throw new Error('Payment declined');
        } catch (error: unknown) {
          logger.error('Order processing failed', {
            orderId,
            step: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }

      // Process order with error
      await expect(processOrder('ord-456')).rejects.toThrow('Payment declined');

      // Verify error logging
      const errorEntries = logger.getEntriesByLevel('error');
      expect(errorEntries).toHaveLength(1);
      expect(errorEntries[0].context).toMatchObject({
        orderId: 'ord-456',
        step: 'error',
        error: 'Payment declined',
      });
    });
  });

  describe('Example 5: Performance Monitoring Pattern', () => {
    /**
     * Demonstrates performance monitoring with automatic warnings
     * for slow operations based on configurable thresholds.
     *
     * README: Lines 447-478
     */
    it('should log performance metrics with slow operation warnings', async () => {
      const logger = new TestLogger();

      async function expensiveOperation(duration: number) {
        const startTime = Date.now();

        // Simulate operation
        await new Promise((resolve) => setTimeout(resolve, duration));

        const actualDuration = Date.now() - startTime;
        const threshold = 100;

        if (actualDuration > threshold) {
          logger.warn('Slow operation detected', {
            operation: 'expensiveOperation',
            duration: actualDuration,
            threshold,
          });
        } else {
          logger.debug('Operation completed', {
            operation: 'expensiveOperation',
            duration: actualDuration,
          });
        }
      }

      // Fast operation → debug
      await expensiveOperation(10);

      // Slow operation → warn
      await expensiveOperation(150);

      // Verify performance logging
      expect(logger.getEntriesByLevel('debug')).toHaveLength(1);
      expect(logger.getEntriesByLevel('warn')).toHaveLength(1);

      // Verify slow operation warning
      const warnEntry = logger.getEntriesByLevel('warn')[0];
      expect(warnEntry.message).toBe('Slow operation detected');
      expect(warnEntry.context?.operation).toBe('expensiveOperation');
      expect(warnEntry.context?.threshold).toBe(100);
    });
  });

  describe('Example 6: Multiple Logger Instances', () => {
    /**
     * Demonstrates creating specialized loggers for different subsystems
     * with independent log level configuration.
     *
     * README: Lines 327-335
     */
    it('should support multiple independent logger instances', () => {
      // Create specialized loggers with different levels
      const httpLogger = new TestLogger('info');
      const dbLogger = new TestLogger('warn'); // Only warnings and errors
      const cacheLogger = new TestLogger('debug'); // Verbose debugging

      // Log to different loggers
      httpLogger.info('HTTP request received', {
        method: 'GET',
        path: '/api/users',
      });
      httpLogger.debug('Request details', { headers: {} }); // Filtered by level

      dbLogger.info('Query executed', { duration: 50 }); // Filtered by level
      dbLogger.warn('Slow query detected', {
        duration: 1500,
        query: 'SELECT * FROM ...',
      });

      cacheLogger.debug('Cache miss', { key: 'user:123' });
      cacheLogger.info('Cache hit', { key: 'user:456' });

      // Verify independent filtering
      expect(httpLogger.entries).toHaveLength(1); // Only info (debug filtered)
      expect(dbLogger.entries).toHaveLength(1); // Only warn (info filtered)
      expect(cacheLogger.entries).toHaveLength(2); // Both debug and info

      // Verify logger isolation
      expect(httpLogger.entries[0].context).toMatchObject({
        method: 'GET',
        path: '/api/users',
      });
      expect(dbLogger.entries[0].context?.duration).toBe(1500);
      expect(cacheLogger.entries[0].context?.key).toBe('user:123');
    });
  });

  describe('Additional Examples: createLogger factory', () => {
    let consoleDebugSpy: ReturnType<typeof vi.spyOn>;
    let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // Spy on console methods to verify createLogger output
      consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleDebugSpy.mockRestore();
      consoleInfoSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should create console logger with boolean config', () => {
      const logger = createLogger(true);

      logger.info('Test message', { key: 'value' });

      expect(consoleInfoSpy).toHaveBeenCalledWith(
        '[INFO] Test message {"key":"value"}',
      );
    });

    it('should create no-op logger when disabled', () => {
      const logger = createLogger(false);

      logger.info('This should not log');
      logger.error('This should not log either');

      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should create logger with specific log level', () => {
      const logger = createLogger({ level: 'warn' });

      logger.debug('Debug message'); // Filtered
      logger.info('Info message'); // Filtered
      logger.warn('Warning message'); // Logged
      logger.error('Error message'); // Logged

      expect(consoleDebugSpy).not.toHaveBeenCalled();
      expect(consoleInfoSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith('[WARN] Warning message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[ERROR] Error message');
    });
  });
});
