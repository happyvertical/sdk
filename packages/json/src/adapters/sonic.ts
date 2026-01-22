/**
 * Sonic (Rust SIMD) JSON adapter
 *
 * This adapter uses sonic-rs through napi-rs bindings for
 * SIMD-accelerated JSON parsing and serialization.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AdapterInfo,
  JSONAdapter,
  NativeBindings,
  ParseError,
  Replacer,
  Result,
  Reviver,
  StringifyError,
} from '../types.js';

// Create require function for loading native modules
const require = createRequire(import.meta.url);

/**
 * Try to load the native bindings
 * Returns null if not available (no Rust binary for this platform)
 */
function tryLoadNative(): NativeBindings | null {
  // Get the directory of this file
  const Filename = fileURLToPath(import.meta.url);
  const Dirname = dirname(Filename);

  // Try various paths where the native module might be
  const paths = [
    join(Dirname, '..', '..', 'json-native.node'), // dist/../json-native.node
    join(Dirname, '..', 'json-native.node'), // dist/json-native.node
    join(Dirname, 'json-native.node'), // In same directory
  ];

  for (const modulePath of paths) {
    try {
      const native = require(modulePath);
      return native as NativeBindings;
    } catch {
      // Try next path
    }
  }

  return null;
}

/**
 * Sonic (Rust SIMD) JSON adapter implementation
 *
 * Uses sonic-rs for SIMD-accelerated parsing and serialization.
 * On supported platforms, this can be 2-3x faster than native JSON.
 */
export class SonicAdapter implements JSONAdapter {
  readonly name = 'sonic' as const;
  readonly isNative = false;

  private native: NativeBindings;

  constructor(native: NativeBindings) {
    this.native = native;
  }

  /**
   * Parse a JSON string using sonic-rs
   */
  parse<T = unknown>(text: string, reviver?: Reviver): T {
    const result = this.native.parse(text);

    // Apply reviver if provided (need to walk the object)
    if (reviver) {
      return this.applyReviver(result, reviver) as T;
    }

    return result as T;
  }

  /**
   * Stringify a value using sonic-rs
   */
  stringify(
    value: unknown,
    replacer?: Replacer,
    space?: number | string,
  ): string {
    // Apply replacer if provided
    let processedValue = value;
    if (replacer) {
      processedValue = this.applyReplacer(value, replacer);
    }

    // Handle spacing
    if (space !== undefined && space !== null && space !== 0 && space !== '') {
      const indent =
        typeof space === 'string'
          ? Math.min(space.length, 10)
          : Math.min(Math.max(0, space), 10);
      return this.native.stringifyPretty(processedValue, indent);
    }

    return this.native.stringify(processedValue);
  }

  /**
   * Deep clone via sonic-rs round-trip
   */
  clone<T>(value: T): T {
    return this.native.clone(value) as T;
  }

  /**
   * Parse without throwing
   */
  safeParse<T = unknown>(text: string): Result<T, ParseError> {
    const result = this.native.parseSafe(text);

    if (result.success) {
      return { success: true, value: result.value as T };
    }

    const parseError: ParseError = {
      message: result.error || 'Unknown parse error',
    };

    if (result.errorPosition) {
      parseError.line = result.errorPosition.line;
      parseError.column = result.errorPosition.column;
    }

    return { success: false, error: parseError };
  }

  /**
   * Stringify without throwing
   */
  safeStringify(value: unknown): Result<string, StringifyError> {
    const result = this.native.stringifySafe(value);

    if (result.success && result.value !== undefined) {
      return { success: true, value: result.value };
    }

    return {
      success: false,
      error: { message: result.error || 'Unknown stringify error' },
    };
  }

  /**
   * Validate JSON string using sonic-rs
   */
  isValid(text: string): boolean {
    return this.native.isValid(text);
  }

  /**
   * Get adapter information
   */
  getInfo(): AdapterInfo {
    const info = this.native.getAdapterInfo();
    return {
      name: 'sonic',
      isNative: false,
      version: info.version,
      simdEnabled: info.simdEnabled,
    };
  }

  /**
   * Apply reviver function to parsed value
   * @internal
   */
  private applyReviver(value: unknown, reviver: Reviver): unknown {
    // Walk the object tree and apply reviver
    return this.walkReviver({ '': value }, '', reviver);
  }

  private walkReviver(
    holder: Record<string, unknown>,
    key: string,
    reviver: Reviver,
  ): unknown {
    const value = holder[key];

    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const newValue = this.walkReviver(
            value as unknown as Record<string, unknown>,
            String(i),
            reviver,
          );
          if (newValue === undefined) {
            value.splice(i, 1);
            i--;
          } else {
            value[i] = newValue;
          }
        }
      } else {
        for (const k of Object.keys(value)) {
          const newValue = this.walkReviver(
            value as Record<string, unknown>,
            k,
            reviver,
          );
          if (newValue === undefined) {
            delete (value as Record<string, unknown>)[k];
          } else {
            (value as Record<string, unknown>)[k] = newValue;
          }
        }
      }
    }

    return reviver.call(holder, key, value);
  }

  /**
   * Apply replacer to value before stringifying
   * @internal
   */
  private applyReplacer(value: unknown, replacer: Replacer): unknown {
    if (Array.isArray(replacer)) {
      // Filter object keys
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const filtered: Record<string, unknown> = {};
        for (const key of replacer) {
          const k = String(key);
          if (k in (value as Record<string, unknown>)) {
            filtered[k] = (value as Record<string, unknown>)[k];
          }
        }
        return filtered;
      }
      return value;
    }

    if (typeof replacer === 'function') {
      // Apply replacer function
      return this.walkReplacer({ '': value }, '', replacer);
    }

    return value;
  }

  private walkReplacer(
    holder: Record<string, unknown>,
    key: string,
    replacer: (key: string, value: unknown) => unknown,
  ): unknown {
    let value = holder[key];
    value = replacer.call(holder, key, value);

    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        const arr: unknown[] = [];
        for (let i = 0; i < value.length; i++) {
          const item = this.walkReplacer(
            value as unknown as Record<string, unknown>,
            String(i),
            replacer,
          );
          arr.push(item);
        }
        return arr;
      } else {
        const obj: Record<string, unknown> = {};
        for (const k of Object.keys(value)) {
          const item = this.walkReplacer(
            value as Record<string, unknown>,
            k,
            replacer,
          );
          if (item !== undefined) {
            obj[k] = item;
          }
        }
        return obj;
      }
    }

    return value;
  }
}

/**
 * Try to create a SonicAdapter instance
 * Returns null if native bindings are not available
 */
export function createSonicAdapter(): SonicAdapter | null {
  const native = tryLoadNative();
  if (native) {
    return new SonicAdapter(native);
  }
  return null;
}

/**
 * Check if sonic (Rust) adapter is available on this platform
 */
export function isSonicAvailable(): boolean {
  return tryLoadNative() !== null;
}
