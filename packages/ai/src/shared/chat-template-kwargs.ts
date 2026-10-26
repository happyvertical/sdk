/**
 * Validation for the per-request `chatTemplateKwargs` chat option.
 *
 * The value is forwarded as the `chat_template_kwargs` request field that
 * vLLM (and SGLang) apply to the model's chat template, for example
 * `{ enable_thinking: false }`. It is caller data, so it is bounded and copied
 * here in one pass: every property is read exactly once, and the value that is
 * validated is the value that is sent, so a getter cannot answer differently
 * between validation and transport. Error messages locate the offending entry
 * by position (`{#2}` is an object's third key, `[0]` an array's first item)
 * and never include a key name or a value.
 */
import { AIError } from './types';

/** Largest accepted `chatTemplateKwargs`, measured as serialized JSON bytes. */
export const MAX_CHAT_TEMPLATE_KWARGS_BYTES = 8192;
/** Deepest accepted nesting of objects and arrays (the top level is 1). */
export const MAX_CHAT_TEMPLATE_KWARGS_DEPTH = 4;
/** Most keys accepted in any one object, and items in any one array. */
export const MAX_CHAT_TEMPLATE_KWARGS_ENTRIES = 32;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const ROOT = 'chatTemplateKwargs';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function invalid(reason: string, provider?: string, model?: string): AIError {
  return new AIError(
    `chatTemplateKwargs ${reason}`,
    'AI_INVALID_CHAT_TEMPLATE_KWARGS',
    provider,
    model,
  );
}

/** Validate `value` and return its JSON copy, reading each property once. */
function copy(
  value: unknown,
  path: string,
  depth: number,
  provider?: string,
  model?: string,
): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw invalid(`${path} must be a finite number`, provider, model);
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw invalid(`${path} must be JSON data`, provider, model);
  }
  if (depth > MAX_CHAT_TEMPLATE_KWARGS_DEPTH) {
    throw invalid(
      `${path} nests deeper than ${MAX_CHAT_TEMPLATE_KWARGS_DEPTH} levels`,
      provider,
      model,
    );
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_CHAT_TEMPLATE_KWARGS_ENTRIES) {
      throw invalid(
        `${path} has more than ${MAX_CHAT_TEMPLATE_KWARGS_ENTRIES} items`,
        provider,
        model,
      );
    }
    const items: JsonValue[] = [];
    for (let index = 0; index < value.length; index++) {
      items.push(
        copy(value[index], `${path}[${index}]`, depth + 1, provider, model),
      );
    }
    return items;
  }
  if (!isPlainObject(value)) {
    throw invalid(`${path} must be a plain JSON object`, provider, model);
  }
  const keys = Object.keys(value);
  if (keys.length > MAX_CHAT_TEMPLATE_KWARGS_ENTRIES) {
    throw invalid(
      `${path} has more than ${MAX_CHAT_TEMPLATE_KWARGS_ENTRIES} keys`,
      provider,
      model,
    );
  }
  const result: { [key: string]: JsonValue } = {};
  keys.forEach((key, index) => {
    const entryPath = `${path}{#${index}}`;
    if (FORBIDDEN_KEYS.has(key)) {
      throw invalid(`${entryPath} uses a reserved key`, provider, model);
    }
    result[key] = copy(value[key], entryPath, depth + 1, provider, model);
  });
  return result;
}

/**
 * Validate `chatTemplateKwargs` and return a detached JSON copy to send as
 * `chat_template_kwargs`, or `undefined` when the option is absent or empty.
 *
 * @throws {AIError} `AI_INVALID_CHAT_TEMPLATE_KWARGS` when the value is not a
 *   plain JSON object within the size, depth, and entry bounds.
 */
export function prepareChatTemplateKwargs(
  value: unknown,
  provider?: string,
  model?: string,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isPlainObject(value)) {
    throw invalid('must be a plain JSON object', provider, model);
  }
  const prepared = copy(value, ROOT, 1, provider, model) as {
    [key: string]: JsonValue;
  };
  if (Object.keys(prepared).length === 0) return undefined;
  const bytes = new TextEncoder().encode(JSON.stringify(prepared)).byteLength;
  if (bytes > MAX_CHAT_TEMPLATE_KWARGS_BYTES) {
    throw invalid(
      `exceeds ${MAX_CHAT_TEMPLATE_KWARGS_BYTES} bytes of JSON`,
      provider,
      model,
    );
  }
  return prepared;
}
