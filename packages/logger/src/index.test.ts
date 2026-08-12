/**
 * Tests for createLogger factory function
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleLogger } from './console.js';
import { createLogger } from './index.js';

describe('createLogger', () => {
  // Store original env value
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.HAVE_LOGGER_LEVEL;
    delete process.env.HAVE_LOGGER_LEVEL;

    // Mock console methods to avoid test output noise
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original env value
    if (originalEnv !== undefined) {
      process.env.HAVE_LOGGER_LEVEL = originalEnv;
    } else {
      delete process.env.HAVE_LOGGER_LEVEL;
    }

    vi.restoreAllMocks();
  });

  describe('basic functionality', () => {
    it('should create a logger when process is unavailable in a browser', () => {
      const nodeProcess = globalThis.process;
      vi.stubGlobal('process', undefined);

      try {
        const logger = createLogger(true);

        expect(logger).toBeInstanceOf(ConsoleLogger);
        expect(() => logger.info('browser log')).not.toThrow();
      } finally {
        vi.stubGlobal('process', nodeProcess);
      }
    });

    it('should create console logger with info level when config is true', () => {
      const logger = createLogger(true);

      expect(logger).toBeInstanceOf(ConsoleLogger);

      // Verify default info level (should not log debug)
      logger.debug('test debug');
      logger.info('test info');

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalled();
    });

    it('should create no-op logger when config is false', () => {
      const logger = createLogger(false);

      // NoopLogger is not exported, so we test behavior instead
      // No-op logger should have all methods but they should do nothing
      expect(logger.debug).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.error).toBeDefined();

      // Call methods to ensure they don't throw (no-ops)
      expect(() => logger.debug('test')).not.toThrow();
      expect(() => logger.info('test')).not.toThrow();
      expect(() => logger.warn('test')).not.toThrow();
      expect(() => logger.error('test')).not.toThrow();
    });

    it('should create console logger with specified level', () => {
      const logger = createLogger({ level: 'debug' });

      expect(logger).toBeInstanceOf(ConsoleLogger);

      // Verify debug level works
      logger.debug('test debug');
      expect(console.debug).toHaveBeenCalled();
    });

    it('should default to info level when level not specified', () => {
      const logger = createLogger({});

      expect(logger).toBeInstanceOf(ConsoleLogger);

      // Verify default info level
      logger.debug('test debug');
      logger.info('test info');

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalled();
    });
  });

  describe('environment variable integration', () => {
    it('should use HAVE_LOGGER_LEVEL when config is true and env var is set', () => {
      process.env.HAVE_LOGGER_LEVEL = 'debug';

      const logger = createLogger(true);

      expect(logger).toBeInstanceOf(ConsoleLogger);

      // Verify debug level from env var
      logger.debug('test debug');
      expect(console.debug).toHaveBeenCalled();
    });

    it('should use HAVE_LOGGER_LEVEL=warn when env var is set', () => {
      process.env.HAVE_LOGGER_LEVEL = 'warn';

      const logger = createLogger(true);

      expect(logger).toBeInstanceOf(ConsoleLogger);

      // Verify warn level from env var
      logger.debug('test debug');
      logger.info('test info');
      logger.warn('test warn');

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
    });

    it('should use HAVE_LOGGER_LEVEL=error when env var is set', () => {
      process.env.HAVE_LOGGER_LEVEL = 'error';

      const logger = createLogger(true);

      expect(logger).toBeInstanceOf(ConsoleLogger);

      // Verify error level from env var
      logger.debug('test debug');
      logger.info('test info');
      logger.warn('test warn');
      logger.error('test error');

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });

    it('should default to info when env var is not set', () => {
      // Explicitly ensure env var is not set
      delete process.env.HAVE_LOGGER_LEVEL;

      const logger = createLogger(true);

      expect(logger).toBeInstanceOf(ConsoleLogger);

      // Verify default info level
      logger.debug('test debug');
      logger.info('test info');

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).toHaveBeenCalled();
    });

    it('should merge env vars with object config when user level not specified', () => {
      process.env.HAVE_LOGGER_LEVEL = 'debug';

      const logger = createLogger({});

      expect(logger).toBeInstanceOf(ConsoleLogger);

      // Verify debug level from env var
      logger.debug('test debug');
      expect(console.debug).toHaveBeenCalled();
    });

    it('should prefer user config over env var when both are set', () => {
      process.env.HAVE_LOGGER_LEVEL = 'info';

      const logger = createLogger({ level: 'warn' });

      expect(logger).toBeInstanceOf(ConsoleLogger);

      // Verify warn level from user config (not info from env)
      logger.debug('test debug');
      logger.info('test info');
      logger.warn('test warn');

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
    });

    it('should ignore env var when config is false', () => {
      process.env.HAVE_LOGGER_LEVEL = 'debug';

      const logger = createLogger(false);

      // Should still be no-op logger
      logger.debug('test');
      logger.info('test');
      logger.warn('test');
      logger.error('test');

      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });
  });
});
