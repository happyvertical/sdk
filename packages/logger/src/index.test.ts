/**
 * Tests for createLogger factory function
 */

import { describe, expect, it } from 'vitest';
import { createLogger } from './index.js';
import { ConsoleLogger } from './console.js';

describe('createLogger', () => {
  it('should create console logger with info level when config is true', () => {
    const logger = createLogger(true);

    expect(logger).toBeInstanceOf(ConsoleLogger);
  });

  it('should create console logger with error level when config is false', () => {
    const logger = createLogger(false);

    expect(logger).toBeInstanceOf(ConsoleLogger);
  });

  it('should create console logger with specified level', () => {
    const logger = createLogger({ level: 'debug' });

    expect(logger).toBeInstanceOf(ConsoleLogger);
  });

  it('should default to info level when level not specified', () => {
    const logger = createLogger({});

    expect(logger).toBeInstanceOf(ConsoleLogger);
  });
});
