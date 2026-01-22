/**
 * @happyvertical/json
 *
 * High-performance JSON parsing and serialization with Rust SIMD acceleration
 * and automatic fallback to native JavaScript.
 *
 * @example
 * ```typescript
 * import { parse, stringify, clone } from '@happyvertical/json';
 *
 * // Drop-in replacements for JSON.parse/stringify
 * const data = parse<MyType>('{"key": "value"}');
 * const json = stringify(data);
 *
 * // Deep clone (optimized)
 * const copy = clone(data);
 *
 * // Safe variants (don't throw)
 * const result = safeParse<MyType>(maybeInvalidJson);
 * if (result.success) {
 *   console.log(result.value);
 * } else {
 *   console.error(result.error.message);
 * }
 * ```
 *
 * @example
 * ```typescript
 * import { JSONFactory } from '@happyvertical/json';
 *
 * // Create adapter with specific options
 * const json = JSONFactory.create({ adapter: 'sonic', fallback: true });
 *
 * // Check adapter info
 * console.log(json.name);       // 'sonic' or 'native'
 * console.log(json.isNative);   // false if using Rust
 * ```
 *
 * @packageDocumentation
 */

// Re-export adapters for advanced use cases
export {
  createSonicAdapter,
  isSonicAvailable,
  NativeAdapter,
  nativeAdapter,
  SonicAdapter,
} from './adapters/index.js';

// Re-export factory
export { createAdapter, getDefaultAdapter, JSONFactory } from './factory.js';
// Re-export types
export type {
  AdapterInfo,
  AdapterType,
  JSONAdapter,
  JSONOptions,
  ParseError,
  Replacer,
  Result,
  Reviver,
  StringifyError,
} from './types.js';

// Import for internal use
import { getDefaultAdapter } from './factory.js';
import type {
  ParseError,
  Replacer,
  Result,
  Reviver,
  StringifyError,
} from './types.js';

// =============================================================================
// Drop-in replacement functions
// =============================================================================

/**
 * Parse a JSON string into a JavaScript value
 *
 * Drop-in replacement for JSON.parse with optional SIMD acceleration.
 *
 * @param text - The JSON string to parse
 * @param reviver - Optional function to transform values during parsing
 * @returns The parsed JavaScript value
 * @throws {SyntaxError} If the input is not valid JSON
 *
 * @example
 * ```typescript
 * const data = parse<User>('{"name": "Alice", "age": 30}');
 * console.log(data.name); // "Alice"
 * ```
 */
export function parse<T = unknown>(text: string, reviver?: Reviver): T {
  return getDefaultAdapter().parse<T>(text, reviver);
}

/**
 * Convert a JavaScript value to a JSON string
 *
 * Drop-in replacement for JSON.stringify with optional SIMD acceleration.
 *
 * @param value - The value to stringify
 * @param replacer - Optional function or array to filter/transform values
 * @param space - Number of spaces for indentation (0-10) or string
 * @returns The JSON string
 * @throws {TypeError} If the value contains circular references or BigInt
 *
 * @example
 * ```typescript
 * const json = stringify({ name: "Alice", age: 30 });
 * console.log(json); // '{"name":"Alice","age":30}'
 *
 * // With pretty printing
 * const pretty = stringify(data, null, 2);
 * ```
 */
export function stringify(
  value: unknown,
  replacer?: Replacer,
  space?: number | string,
): string {
  return getDefaultAdapter().stringify(value, replacer, space);
}

/**
 * Deep clone a value via JSON round-trip
 *
 * Optimized alternative to JSON.parse(JSON.stringify(value)).
 * Note: Only clones JSON-serializable values (no functions, symbols, etc).
 *
 * @param value - The value to clone
 * @returns A deep clone of the value
 *
 * @example
 * ```typescript
 * const original = { nested: { deep: [1, 2, 3] } };
 * const copy = clone(original);
 * copy.nested.deep.push(4);
 * console.log(original.nested.deep); // [1, 2, 3] - unchanged
 * ```
 */
export function clone<T>(value: T): T {
  return getDefaultAdapter().clone(value);
}

/**
 * Parse a JSON string without throwing on errors
 *
 * Returns a Result type with either the parsed value or error details.
 *
 * @param text - The JSON string to parse
 * @returns A Result object with either the parsed value or error details
 *
 * @example
 * ```typescript
 * const result = safeParse<User>(userInput);
 * if (result.success) {
 *   console.log(result.value.name);
 * } else {
 *   console.error(`Parse error at line ${result.error.line}: ${result.error.message}`);
 * }
 * ```
 */
export function safeParse<T = unknown>(text: string): Result<T, ParseError> {
  return getDefaultAdapter().safeParse<T>(text);
}

/**
 * Stringify a value without throwing on errors
 *
 * Returns a Result type with either the JSON string or error details.
 *
 * @param value - The value to stringify
 * @returns A Result object with either the JSON string or error details
 *
 * @example
 * ```typescript
 * const result = safeStringify(data);
 * if (result.success) {
 *   console.log(result.value);
 * } else {
 *   console.error(`Stringify error: ${result.error.message}`);
 * }
 * ```
 */
export function safeStringify(value: unknown): Result<string, StringifyError> {
  return getDefaultAdapter().safeStringify(value);
}

/**
 * Check if a string is valid JSON without parsing
 *
 * Faster than try/catch with parse() when you only need validation.
 *
 * @param text - The string to validate
 * @returns true if the string is valid JSON
 *
 * @example
 * ```typescript
 * if (isValid(userInput)) {
 *   const data = parse(userInput);
 * }
 * ```
 */
export function isValid(text: string): boolean {
  return getDefaultAdapter().isValid(text);
}

/**
 * Get information about the current JSON adapter
 *
 * @returns Adapter information including name, version, and SIMD status
 *
 * @example
 * ```typescript
 * const info = getAdapterInfo();
 * console.log(`Using ${info.name} adapter`);
 * console.log(`SIMD enabled: ${info.simdEnabled}`);
 * ```
 */
export function getAdapterInfo() {
  return getDefaultAdapter().getInfo();
}

/**
 * Check if SIMD-accelerated parsing is available
 *
 * @returns true if the Rust SIMD adapter is loaded
 *
 * @example
 * ```typescript
 * if (isSIMDAvailable()) {
 *   console.log('Using SIMD-accelerated JSON parsing');
 * }
 * ```
 */
export function isSIMDAvailable(): boolean {
  return !getDefaultAdapter().isNative;
}
