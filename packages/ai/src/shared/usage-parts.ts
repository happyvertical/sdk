/**
 * Part identity for usage events (sdk#1576).
 *
 * Every public method invocation on a client built by `getAI()` gets one
 * recorder, minted before its first provider request and carried to
 * `emitUsage` through the call's options under {@link AI_USAGE_PARTS} (the
 * way `AI_ATTEMPT_RECORDER` travels). The recorder names the invocation
 * (`call`), numbers its usage events (`index`) and keeps their counts so a
 * response can list them (`AIResponse.usageParts`).
 */

import type {
  AIInterface,
  AIResponse,
  AIUsageFeatures,
  AIUsagePart,
  AIUsageParts,
  TokenUsage,
  UsagePart,
} from './types';

/**
 * Internal per-call channel from the public method boundary to the usage
 * emitter. Enumerable so option spreads keep it; symbol-keyed so it is never
 * serialized into a provider request.
 * @internal
 */
export const AI_USAGE_PARTS = Symbol.for('@happyvertical/ai:usage-parts');

/** @internal */
export interface UsagePartRecorder {
  readonly call: string;
  /**
   * True when a further request of this invocation may follow a part
   * (continuation is on). Set by the continuation layer before the first
   * request; while false, every event is marked `last`.
   */
  mayContinue: boolean;
  /** Parts recorded so far, in index order, without `last`. */
  readonly parts: AIUsagePart[];
}

/** What clients built by this version declare (R6). */
export const AI_USAGE_FEATURES: AIUsageFeatures = Object.freeze({
  parts: true,
});

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(values);
  } else {
    for (let i = 0; i < bytes; i++) values[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(values, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A fresh, unguessable invocation id. */
export function mintUsageCallId(): string {
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  // randomUUID needs a secure context in browsers; fall back to random bytes.
  if (typeof webCrypto?.randomUUID === 'function') {
    try {
      return webCrypto.randomUUID();
    } catch {
      // fall through
    }
  }
  return randomHex(16);
}

/** @internal */
export function createUsagePartRecorder(): UsagePartRecorder {
  return { call: mintUsageCallId(), mayContinue: false, parts: [] };
}

function isRecorder(value: unknown): value is UsagePartRecorder {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as UsagePartRecorder).call === 'string' &&
    Array.isArray((value as UsagePartRecorder).parts)
  );
}

/** The recorder an options object carries, if any. @internal */
export function usagePartRecorder(
  options: unknown,
): UsagePartRecorder | undefined {
  if (!options || typeof options !== 'object') return undefined;
  const value = (options as { [AI_USAGE_PARTS]?: unknown })[AI_USAGE_PARTS];
  return isRecorder(value) ? value : undefined;
}

/**
 * Spread into the options an adapter rebuilds for an internal call (for
 * example `complete()` or `message()` delegating to `chat()`), so every
 * usage event of the public invocation keeps its one `call` id.
 * @internal
 */
export function forwardUsageParts(options: unknown): {
  [AI_USAGE_PARTS]?: UsagePartRecorder;
} {
  const recorder = usagePartRecorder(options);
  return recorder ? { [AI_USAGE_PARTS]: recorder } : {};
}

/** A copy of `options` carrying `recorder`. @internal */
export function withUsagePartRecorder<T extends object>(
  options: T | undefined,
  recorder: UsagePartRecorder,
): T {
  return { ...(options as T), [AI_USAGE_PARTS]: recorder };
}

/**
 * The recorder to use for a request layer: the one the options already carry
 * when nothing has been recorded on it yet (it was minted by the public
 * method boundary for this invocation), otherwise a new one.
 * @internal
 */
export function adoptUsagePartRecorder(options: unknown): UsagePartRecorder {
  const existing = usagePartRecorder(options);
  return existing && existing.parts.length === 0
    ? existing
    : createUsagePartRecorder();
}

/**
 * Record one completed provider request and return the `part` its usage
 * event carries. Without a recorder (a provider class used directly, which
 * never continues) the event is its own single, last part.
 * @internal
 */
export function nextUsagePart(
  options: unknown,
  usage: TokenUsage | undefined,
): UsagePart {
  const recorder = usagePartRecorder(options);
  if (!recorder) return { call: mintUsageCallId(), index: 0, last: true };
  const index = recorder.parts.length;
  recorder.parts.push(usage ? { index, usage: { ...usage } } : { index });
  return recorder.mayContinue
    ? { call: recorder.call, index }
    : { call: recorder.call, index, last: true };
}

/**
 * Record a count-less part for a completed request whose provider path
 * emitted no usage event, so `usageParts.complete` cannot claim a total that
 * misses it.
 * @internal
 */
export function padUsagePart(recorder: UsagePartRecorder): void {
  recorder.parts.push({ index: recorder.parts.length });
}

/**
 * The response-side view of a finished invocation: its parts with the final
 * one marked `last` (the invocation has returned, so nothing follows it).
 * @internal
 */
export function usagePartsOf(recorder: UsagePartRecorder): AIUsageParts {
  const lastIndex = recorder.parts.length - 1;
  const parts: AIUsagePart[] = recorder.parts.map((part, position) => ({
    index: part.index,
    ...(position === lastIndex ? { last: true as const } : {}),
    ...(part.usage ? { usage: { ...part.usage } } : {}),
  }));
  return {
    call: recorder.call,
    parts,
    complete:
      parts.length > 0 && parts.every((part) => part.usage !== undefined),
  };
}

/** Argument position of each method's options object. */
const OPTIONS_INDEX: Partial<Record<keyof AIInterface, number>> = {
  chat: 1,
  complete: 1,
  message: 1,
  stream: 1,
  embed: 1,
  embedImage: 1,
  describeImage: 2,
  generateImage: 1,
  decide: 1,
  submitVideoGenerationJob: 0,
};

/** Methods whose result is an {@link AIResponse} that gets `usageParts`. */
const RESPONSE_METHODS = new Set<PropertyKey>(['chat', 'complete']);

function isResponse(value: unknown): value is AIResponse {
  return !!value && typeof value === 'object' && 'content' in value;
}

/**
 * Wrap a client so each public method invocation mints its usage-part
 * recorder, `chat()`/`complete()` responses carry `usageParts`, and the
 * client declares {@link AIUsageFeatures}.
 */
export function createUsagePartsAI<T extends AIInterface>(client: T): T {
  const wrapped = new Map<PropertyKey, unknown>();
  return new Proxy(client, {
    has(target, property) {
      return property === 'usageFeatures' || Reflect.has(target, property);
    },
    get(target, property) {
      if (property === 'usageFeatures') return AI_USAGE_FEATURES;
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      if (!wrapped.has(property)) {
        const index = OPTIONS_INDEX[property as keyof AIInterface];
        let fn: unknown;
        if (index === undefined) {
          fn = value.bind(target);
        } else {
          fn = (...args: unknown[]) => {
            const current = args[index];
            if (
              current !== undefined &&
              (current === null || typeof current !== 'object')
            ) {
              return value.apply(target, args);
            }
            // Always a fresh recorder: options reused from an earlier call
            // must not continue that call's numbering.
            const recorder = createUsagePartRecorder();
            const next = [...args];
            next[index] = withUsagePartRecorder(
              current as object | undefined,
              recorder,
            );
            const result = value.apply(target, next);
            if (!RESPONSE_METHODS.has(property)) return result;
            return Promise.resolve(result).then((response: unknown) => {
              if (!isResponse(response) || response.usageParts) {
                return response;
              }
              if (recorder.parts.length === 0) padUsagePart(recorder);
              return { ...response, usageParts: usagePartsOf(recorder) };
            });
          };
        }
        wrapped.set(property, fn);
      }
      return wrapped.get(property);
    },
  });
}
