/**
 * Native JavaScript JSON adapter
 *
 * This adapter uses the built-in JSON object as a fallback when
 * the Rust SIMD-accelerated adapter is not available.
 */

import type {
  AdapterInfo,
  JSONAdapter,
  ParseError,
  Replacer,
  Result,
  Reviver,
  StringifyError,
} from '../types.js';

/**
 * Native JavaScript JSON adapter implementation
 *
 * Provides the same interface as the Rust adapter but uses
 * the built-in JSON object. Useful as a fallback and for
 * environments where native bindings can't be loaded.
 */
export class NativeAdapter implements JSONAdapter {
  readonly name = 'native' as const;
  readonly isNative = true;

  /**
   * Parse a JSON string using native JSON.parse
   */
  parse<T = unknown>(text: string, reviver?: Reviver): T {
    return JSON.parse(text, reviver) as T;
  }

  /**
   * Stringify a value using native JSON.stringify
   */
  stringify(
    value: unknown,
    replacer?: Replacer,
    space?: number | string,
  ): string {
    // Handle the replacer type properly - separate calls for each overload
    let result: string | undefined;

    if (typeof replacer === 'function') {
      result = JSON.stringify(value, replacer, space);
    } else if (Array.isArray(replacer)) {
      result = JSON.stringify(value, replacer, space);
    } else {
      result = JSON.stringify(value, null, space);
    }

    // JSON.stringify can return undefined for undefined, functions, symbols
    if (result === undefined) {
      throw new TypeError('Unable to stringify value');
    }

    return result;
  }

  /**
   * Deep clone via JSON round-trip
   */
  clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  /**
   * Parse without throwing
   */
  safeParse<T = unknown>(text: string): Result<T, ParseError> {
    try {
      const value = JSON.parse(text) as T;
      return { success: true, value };
    } catch (e) {
      const error = e as Error;
      const parseError: ParseError = {
        message: error.message,
      };

      // Try to extract position from error message
      const posMatch = error.message.match(/position (\d+)/i);
      if (posMatch) {
        // Calculate line and column from position
        const position = parseInt(posMatch[1], 10);
        let line = 1;
        let column = 1;
        for (let i = 0; i < position && i < text.length; i++) {
          if (text[i] === '\n') {
            line++;
            column = 1;
          } else {
            column++;
          }
        }
        parseError.line = line;
        parseError.column = column;
      }

      return { success: false, error: parseError };
    }
  }

  /**
   * Stringify without throwing
   */
  safeStringify(value: unknown): Result<string, StringifyError> {
    try {
      const result = JSON.stringify(value);
      if (result === undefined) {
        return {
          success: false,
          error: { message: 'Unable to stringify value' },
        };
      }
      return { success: true, value: result };
    } catch (e) {
      const error = e as Error;
      return {
        success: false,
        error: { message: error.message },
      };
    }
  }

  /**
   * Validate JSON string
   */
  isValid(text: string): boolean {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get adapter information
   */
  getInfo(): AdapterInfo {
    return {
      name: 'native',
      isNative: true,
      version: typeof process !== 'undefined' ? process.version : 'unknown',
      simdEnabled: false,
    };
  }
}

/**
 * Singleton instance of the native adapter
 */
export const nativeAdapter = new NativeAdapter();
