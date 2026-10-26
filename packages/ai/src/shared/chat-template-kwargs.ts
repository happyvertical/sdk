/**
 * Validation for the per-request `chatTemplateKwargs` chat option.
 *
 * The value is forwarded verbatim as the `chat_template_kwargs` request field
 * that vLLM (and SGLang) apply to the model's chat template, for example
 * `{ enable_thinking: false }`. It is caller data, so it is bounded and
 * snapshotted here, and error messages name the offending path but never echo
 * a value.
 */
import { AIError } from './types';

/** Largest accepted `chatTemplateKwargs`, measured as serialized JSON bytes. */
export const MAX_CHAT_TEMPLATE_KWARGS_BYTES = 8192;
/** Deepest accepted nesting of objects and arrays (the top level is 1). */
export const MAX_CHAT_TEMPLATE_KWARGS_DEPTH = 4;
/** Most keys accepted in any one object, and items in any one array. */
export const MAX_CHAT_TEMPLATE_KWARGS_ENTRIES = 32;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

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

function check(
  value: unknown,
  path: string,
  depth: number,
  provider?: string,
  model?: string,
): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw invalid(`${path} must be a finite number`, provider, model);
    }
    return;
  }
  if (typeof value !== 'object') {
    throw invalid(`${path} must be JSON data`, provider, model);
  }
  if (depth > MAX_CHAT_TEMPLATE_KWARGS_DEPTH) {
    throw invalid(
      `nests deeper than ${MAX_CHAT_TEMPLATE_KWARGS_DEPTH} levels`,
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
    value.forEach((item, index) => {
      check(item, `${path}[${index}]`, depth + 1, provider, model);
    });
    return;
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
  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw invalid(`${path} uses a reserved key`, provider, model);
    }
    check(value[key], `${path}.${key}`, depth + 1, provider, model);
  }
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
  check(value, 'chatTemplateKwargs', 1, provider, model);
  if (Object.keys(value).length === 0) return undefined;
  const serialized = JSON.stringify(value);
  if (
    new TextEncoder().encode(serialized).byteLength >
    MAX_CHAT_TEMPLATE_KWARGS_BYTES
  ) {
    throw invalid(
      `exceeds ${MAX_CHAT_TEMPLATE_KWARGS_BYTES} bytes of JSON`,
      provider,
      model,
    );
  }
  return JSON.parse(serialized) as Record<string, unknown>;
}
