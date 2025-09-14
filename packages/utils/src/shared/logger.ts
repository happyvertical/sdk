/**
 * Universal logging utilities that work in both browser and Node.js
 */

import { Logger } from './types.js';

class ConsoleLogger implements Logger {
  debug(message: string, context?: Record<string, unknown>): void {
    if (context) {
      console.debug(message, context);
    } else {
      console.debug(message);
    }
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (context) {
      console.info(message, context);
    } else {
      console.info(message);
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (context) {
      console.warn(message, context);
    } else {
      console.warn(message);
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (context) {
      console.error(message, context);
    } else {
      console.error(message);
    }
  }
}

class NoOpLogger implements Logger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

let globalLogger: Logger = new ConsoleLogger();

export const setLogger = (logger: Logger): void => {
  globalLogger = logger;
};

export const getLogger = (): Logger => {
  return globalLogger;
};

export const disableLogging = (): void => {
  globalLogger = new NoOpLogger();
};

export const enableLogging = (): void => {
  globalLogger = new ConsoleLogger();
};