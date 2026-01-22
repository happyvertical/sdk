/**
 * JSON Factory
 *
 * Factory for creating JSON adapters with automatic fallback support.
 */

import { NativeAdapter, nativeAdapter } from './adapters/native.js';
import { createSonicAdapter, isSonicAvailable } from './adapters/sonic.js';
import type { AdapterType, JSONAdapter, JSONOptions } from './types.js';

/**
 * Cached default adapter instance
 */
let defaultAdapter: JSONAdapter | null = null;

/**
 * Factory for creating JSON adapters
 *
 * @example
 * ```typescript
 * // Auto-select best available adapter
 * const json = JSONFactory.create();
 *
 * // Force native adapter
 * const native = JSONFactory.create({ adapter: 'native' });
 *
 * // Force sonic, throw if unavailable
 * const sonic = JSONFactory.create({ adapter: 'sonic', fallback: false });
 * ```
 */
export class JSONFactory {
  /**
   * Create a new JSON adapter instance
   *
   * @param options - Configuration options
   * @returns A JSON adapter instance
   * @throws Error if requested adapter is unavailable and fallback is false
   */
  static create(options: JSONOptions = {}): JSONAdapter {
    const { adapter = 'auto', fallback = true } = options;

    // Handle explicit native request
    if (adapter === 'native') {
      return new NativeAdapter();
    }

    // Handle auto or sonic/simd request
    if (adapter === 'auto' || adapter === 'sonic' || adapter === 'simd') {
      const sonicAdapter = createSonicAdapter();

      if (sonicAdapter) {
        return sonicAdapter;
      }

      // Sonic not available
      if (adapter !== 'auto' && !fallback) {
        throw new Error(
          `Sonic adapter is not available on this platform. ` +
            `Set fallback: true to use native JSON, or use adapter: 'native'.`,
        );
      }

      // Fall back to native
      return new NativeAdapter();
    }

    // Unknown adapter type
    throw new Error(
      `Unknown adapter type: ${adapter}. ` +
        `Valid options are: 'auto', 'sonic', 'simd', 'native'.`,
    );
  }

  /**
   * Get the default adapter instance (cached singleton)
   *
   * Uses 'auto' mode to select the best available adapter.
   * The instance is cached for subsequent calls.
   */
  static getDefault(): JSONAdapter {
    if (!defaultAdapter) {
      defaultAdapter = JSONFactory.create({ adapter: 'auto', fallback: true });
    }
    return defaultAdapter;
  }

  /**
   * Reset the default adapter (useful for testing)
   * @internal
   */
  static resetDefault(): void {
    defaultAdapter = null;
  }

  /**
   * Check if a specific adapter type is available
   */
  static isAvailable(adapter: AdapterType): boolean {
    switch (adapter) {
      case 'native':
        return true;
      case 'sonic':
      case 'simd':
        return isSonicAvailable();
      case 'auto':
        return true; // Always available (falls back to native)
      default:
        return false;
    }
  }

  /**
   * Get the name of the adapter that would be used with given options
   */
  static getAdapterName(options: JSONOptions = {}): 'sonic' | 'native' {
    const { adapter = 'auto' } = options;

    if (adapter === 'native') {
      return 'native';
    }

    if (isSonicAvailable()) {
      return 'sonic';
    }

    return 'native';
  }
}

/**
 * Get the default JSON adapter
 *
 * Convenience function that returns JSONFactory.getDefault()
 */
export function getDefaultAdapter(): JSONAdapter {
  return JSONFactory.getDefault();
}

/**
 * Create a new JSON adapter
 *
 * Convenience function that calls JSONFactory.create()
 */
export function createAdapter(options?: JSONOptions): JSONAdapter {
  return JSONFactory.create(options);
}
