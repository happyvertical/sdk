/**
 * @happyvertical/json - TypeScript type definitions
 *
 * High-performance JSON parsing and serialization with Rust SIMD acceleration
 */

/**
 * Standard JSON reviver function type (same as native JSON.parse)
 */
export type Reviver = (key: string, value: unknown) => unknown;

/**
 * Standard JSON replacer function type (same as native JSON.stringify)
 */
export type Replacer =
  | ((key: string, value: unknown) => unknown)
  | (string | number)[]
  | null;

/**
 * Result type for safe (non-throwing) operations
 */
export type Result<T, E> =
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Error information for parse failures
 */
export interface ParseError {
  /** Error message */
  message: string;
  /** Line number where error occurred (if available) */
  line?: number;
  /** Column number where error occurred (if available) */
  column?: number;
}

/**
 * Error information for stringify failures
 */
export interface StringifyError {
  /** Error message */
  message: string;
  /** Path to the problematic value (if available) */
  path?: string[];
}

/**
 * Adapter selection options
 */
export type AdapterType = 'sonic' | 'simd' | 'native' | 'auto';

/**
 * Information about the active JSON adapter
 */
export interface AdapterInfo {
  /** Name of the adapter */
  name: 'sonic' | 'native';
  /** Whether this is the native JavaScript fallback */
  isNative: boolean;
  /** Version of the underlying library */
  version: string;
  /** Whether SIMD acceleration is available */
  simdEnabled: boolean;
}

/**
 * Configuration options for creating a JSON adapter
 */
export interface JSONOptions {
  /**
   * Which adapter to use
   * - 'sonic': Force Rust sonic-rs adapter (throws if unavailable)
   * - 'simd': Alias for sonic (for API consistency)
   * - 'native': Force native JavaScript JSON
   * - 'auto': Try sonic first, fall back to native (default)
   */
  adapter?: AdapterType;

  /**
   * Whether to fall back to native JSON if the requested adapter is unavailable
   * Only applies when adapter is 'sonic' or 'simd'
   * @default true
   */
  fallback?: boolean;
}

/**
 * Interface for JSON adapters
 *
 * All adapters implement this interface, ensuring consistent behavior
 * regardless of the underlying implementation.
 */
export interface JSONAdapter {
  /**
   * Name of this adapter
   */
  readonly name: 'sonic' | 'native';

  /**
   * Whether this is the native JavaScript implementation
   */
  readonly isNative: boolean;

  /**
   * Parse a JSON string into a JavaScript value
   *
   * @param text - The JSON string to parse
   * @param reviver - Optional function to transform values during parsing
   * @returns The parsed JavaScript value
   * @throws {SyntaxError} If the input is not valid JSON
   */
  parse<T = unknown>(text: string, reviver?: Reviver): T;

  /**
   * Convert a JavaScript value to a JSON string
   *
   * @param value - The value to stringify
   * @param replacer - Optional function or array to filter/transform values
   * @param space - Number of spaces for indentation (0-10) or string
   * @returns The JSON string
   * @throws {TypeError} If the value contains circular references or BigInt
   */
  stringify(
    value: unknown,
    replacer?: Replacer,
    space?: number | string,
  ): string;

  /**
   * Deep clone a value via JSON round-trip
   *
   * Equivalent to JSON.parse(JSON.stringify(value)) but optimized.
   * Note: This only clones JSON-serializable values.
   *
   * @param value - The value to clone
   * @returns A deep clone of the value
   */
  clone<T>(value: T): T;

  /**
   * Parse a JSON string without throwing on errors
   *
   * @param text - The JSON string to parse
   * @returns A Result object with either the parsed value or error details
   */
  safeParse<T = unknown>(text: string): Result<T, ParseError>;

  /**
   * Stringify a value without throwing on errors
   *
   * @param value - The value to stringify
   * @returns A Result object with either the JSON string or error details
   */
  safeStringify(value: unknown): Result<string, StringifyError>;

  /**
   * Check if a string is valid JSON without parsing
   *
   * @param text - The string to validate
   * @returns true if the string is valid JSON
   */
  isValid(text: string): boolean;

  /**
   * Get detailed information about this adapter
   */
  getInfo(): AdapterInfo;
}

/**
 * Native bindings from the Rust module (when available)
 * @internal
 */
export interface NativeBindings {
  parse(input: string): unknown;
  parseSafe(input: string): {
    success: boolean;
    value?: unknown;
    error?: string;
    errorPosition?: { line: number; column: number };
  };
  stringify(value: unknown): string;
  stringifyPretty(value: unknown, indent?: number): string;
  stringifySafe(value: unknown): {
    success: boolean;
    value?: string;
    error?: string;
  };
  clone(value: unknown): unknown;
  isValid(input: string): boolean;
  getType(input: string): string;
  getAdapterInfo(): {
    name: string;
    isNative: boolean;
    version: string;
    simdEnabled: boolean;
  };
}
