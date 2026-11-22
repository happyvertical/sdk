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
  AIFinishReason,
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
  /**
   * With continuation on: set by the continuation layer before the final
   * request it may make (the `maxContinuations` cap), so that request's
   * part is known to be last.
   */
  capped?: boolean;
  /**
   * Requests the current method still has to make after the one in flight
   * (for example `embedImage()`'s embedding after its image description).
   * While above zero, no event is marked `last`.
   */
  followers: number;
  /** Parts recorded so far, in index order, without `last`. */
  readonly parts: AIUsagePart[];
}

/**
 * What the emitting provider knows about the request it reports. @internal
 */
export interface UsagePartHints {
  /**
   * The finish reason the provider reports for this request (the same value
   * it passes to `onFinishReason`). Anything but `'length'` means a continued
   * reply stops here.
   */
  finishReason?: AIFinishReason;
  /** The method makes another request after this one (a batch loop). */
  more?: boolean;
  /**
   * `usage` carries reported figures (cost, cache, part of a split) but no
   * known token counts; the part is marked `uncounted`.
   */
  uncounted?: boolean;
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
  return {
    call: mintUsageCallId(),
    mayContinue: false,
    followers: 0,
    parts: [],
  };
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

/**
 * Every option name a public method of this package reads (from the
 * `*Options` interfaces and `AIRequestControls`). Only these are read from
 * an options object's prototype chain, so unrelated getters never run.
 */
const OPTION_KEYS: readonly string[] = [
  'aspectRatio',
  'chatTemplateKwargs',
  'continueOnLength',
  'detail',
  'dimensions',
  'durationSeconds',
  'encodingFormat',
  'fps',
  'frequencyPenalty',
  'generateAudio',
  'history',
  'imageInput',
  'includeThoughts',
  'includeWordTimings',
  'language',
  'maxLen',
  'maxTokens',
  'model',
  'n',
  'negativePrompt',
  'onFinishReason',
  'onProgress',
  'onReasoning',
  'onRefusal',
  'outputFormat',
  'pitch',
  'presencePenalty',
  'prompt',
  'quality',
  'reasoning',
  'referenceImages',
  'referenceMedia',
  'resolution',
  'responseFormat',
  'responseSchema',
  'returnLastFrame',
  'role',
  'seed',
  'signal',
  'size',
  'speed',
  'stop',
  'stream',
  'style',
  'temperature',
  'thinkingLevel',
  'timeout',
  'toolChoice',
  'tools',
  'topP',
  'usageTags',
  'user',
  'voice',
];

/**
 * A plain copy of a call's options. Besides its own enumerable properties
 * (a spread) it keeps the recognised option values an options class
 * exposes through its prototype (getters, inherited fields, and methods used
 * as callbacks, bound to the original object), which a spread would drop.
 * Other prototype members are never read. The original is not modified.
 * @internal
 */
export function copyCallOptions<T extends object>(options: T | undefined): T {
  const copy: Record<PropertyKey, unknown> = { ...(options as object) };
  if (!options || typeof options !== 'object') return copy as T;
  for (const key of OPTION_KEYS) {
    if (Object.hasOwn(copy, key) || !(key in options)) continue;
    const value = (options as Record<string, unknown>)[key];
    if (value === undefined) continue;
    copy[key] = typeof value === 'function' ? value.bind(options) : value;
  }
  return copy as T;
}

/** A copy of `options` carrying `recorder`. @internal */
export function withUsagePartRecorder<T extends object>(
  options: T | undefined,
  recorder: UsagePartRecorder,
): T {
  return { ...copyCallOptions(options), [AI_USAGE_PARTS]: recorder };
}

/**
 * `options` carrying a recorder: the one it already has, or a new one. A
 * method that makes several requests calls this first, so a provider used
 * without `getAI()` still reports them as one call.
 * @internal
 */
export function ensureUsagePartRecorder<T extends object>(
  options: T | undefined,
): T {
  return usagePartRecorder(options)
    ? (options as T)
    : withUsagePartRecorder(options, createUsagePartRecorder());
}

/**
 * Hold `last` off the events of the request(s) run inside `run`, because the
 * calling method makes another request afterwards.
 * @internal
 */
export async function withFollowUpRequest<R>(
  options: unknown,
  run: () => Promise<R>,
): Promise<R> {
  const recorder = usagePartRecorder(options);
  if (recorder) recorder.followers++;
  try {
    return await run();
  } finally {
    if (recorder) recorder.followers--;
  }
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
  hints: UsagePartHints = {},
): UsagePart {
  const recorder = usagePartRecorder(options);
  const uncounted =
    usage && hints.uncounted ? { uncounted: true as const } : {};
  if (!recorder) {
    return {
      call: mintUsageCallId(),
      index: 0,
      ...(hints.more ? {} : { last: true as const }),
      ...uncounted,
    };
  }
  const index = recorder.parts.length;
  recorder.parts.push(
    usage ? { index, usage: { ...usage }, ...uncounted } : { index },
  );
  return {
    call: recorder.call,
    index,
    ...(isLastPart(recorder, hints) ? { last: true as const } : {}),
    ...uncounted,
  };
}

function isLastPart(
  recorder: UsagePartRecorder,
  hints: UsagePartHints,
): boolean {
  if (hints.more || recorder.followers > 0) return false;
  if (!recorder.mayContinue) return true;
  // A continued reply requests another part only after a part that stopped
  // on the output limit, and never after the request the continuation layer
  // flagged as its final permitted one.
  if (hints.finishReason !== undefined && hints.finishReason !== 'length') {
    return true;
  }
  return recorder.capped === true;
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
    ...(part.uncounted ? { uncounted: true as const } : {}),
  }));
  return {
    call: recorder.call,
    parts,
    complete:
      parts.length > 0 &&
      parts.every((part) => part.usage !== undefined && !part.uncounted),
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
  synthesizeSpeech: 1,
  streamSpeech: 1,
  submitVideoGenerationJob: 0,
};

/** Methods that return an async iterable. */
const STREAM_METHODS = new Set<PropertyKey>(['stream', 'streamSpeech']);

/**
 * An invocation that fails after it already reported usage has billed
 * parts; replaying it would bill them again. Its error says
 * `retryable: false`, whatever the failure was (a later request's rate
 * limit, a caller's callback).
 */
function notRetryableAfterUsage(
  error: unknown,
  recorder: UsagePartRecorder,
): unknown {
  if (
    recorder.parts.length > 0 &&
    error &&
    typeof error === 'object' &&
    'retryable' in error
  ) {
    try {
      (error as { retryable: boolean }).retryable = false;
    } catch {
      // A frozen error keeps its flag.
    }
  }
  return error;
}

async function* guardStream<C>(
  source: AsyncIterable<C>,
  recorder: UsagePartRecorder,
): AsyncIterable<C> {
  try {
    yield* source;
  } catch (error) {
    throw notRetryableAfterUsage(error, recorder);
  }
}

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
            if (STREAM_METHODS.has(property)) {
              return guardStream(result as AsyncIterable<unknown>, recorder);
            }
            const settled = Promise.resolve(result).catch((error: unknown) => {
              throw notRetryableAfterUsage(error, recorder);
            });
            if (!RESPONSE_METHODS.has(property)) return settled;
            return settled.then((response: unknown) => {
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
