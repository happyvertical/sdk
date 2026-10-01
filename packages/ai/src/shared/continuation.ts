import type {
  AIFinishReason,
  AIInterface,
  AIMessage,
  AIResponse,
  BaseAIOptions,
  ChatOptions,
  ContinueOnLengthOption,
  TokenUsage,
} from './types';
import { AIError } from './types';

/** Default number of extra requests allowed after the first one. */
export const DEFAULT_MAX_CONTINUATIONS = 3;

/** Shortest seam overlap (in characters) that is trimmed as a repeat. */
const MIN_OVERLAP = 12;
/** Longest seam overlap (in characters) that is searched for. */
const MAX_OVERLAP = 400;

export const CONTINUE_PROMPT =
  'Continue exactly where you stopped. Do not repeat anything you already wrote and do not add an introduction.';

interface ResolvedContinuation {
  maxContinuations: number;
}

/**
 * Resolve the per-call option over the client default. Returns undefined when
 * continuation is off. Structured output and tool use never continue because
 * stitching two JSON documents or tool-call turns is not safe.
 */
export function resolveContinuation(
  providerOptions: BaseAIOptions,
  options: Pick<ChatOptions, 'tools' | 'responseFormat'> & {
    continueOnLength?: ContinueOnLengthOption;
  },
): ResolvedContinuation | undefined {
  const setting = options.continueOnLength ?? providerOptions.continueOnLength;
  if (!setting) return undefined;
  if (options.tools?.length || options.responseFormat?.type === 'json_object') {
    return undefined;
  }
  const requested =
    typeof setting === 'object'
      ? (setting.maxContinuations ?? DEFAULT_MAX_CONTINUATIONS)
      : DEFAULT_MAX_CONTINUATIONS;
  if (!Number.isFinite(requested) || requested < 0) {
    throw new AIError(
      'continueOnLength.maxContinuations must be a non-negative finite number',
      'AI_LIMIT_INVALID',
    );
  }
  const maxContinuations = Math.trunc(requested);
  return maxContinuations > 0 ? { maxContinuations } : undefined;
}

/**
 * The text to append after `accumulated`: `next` minus any leading run that
 * repeats the end of `accumulated`. Whitespace already emitted is kept.
 */
export function continuationAddition(
  accumulated: string,
  next: string,
): string {
  const tail = accumulated.trimEnd();
  const head = next.trimStart();
  const max = Math.min(tail.length, head.length, MAX_OVERLAP);
  for (let length = max; length >= MIN_OVERLAP; length--) {
    if (tail.endsWith(head.slice(0, length))) return head.slice(length);
  }
  return next;
}

function continuationMessages(
  messages: AIMessage[],
  accumulated: string,
): AIMessage[] {
  return [
    ...messages,
    // Some providers reject an assistant turn that ends in whitespace.
    { role: 'assistant', content: accumulated.trimEnd() },
    { role: 'user', content: CONTINUE_PROMPT },
  ];
}

function addUsage(
  a: TokenUsage | undefined,
  b: TokenUsage | undefined,
): TokenUsage | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

/**
 * Run a chat call and, when the reply stopped on the output limit, keep asking
 * the model to continue and stitch the pieces together.
 */
export async function chatWithContinuation(
  chat: (messages: AIMessage[], options?: ChatOptions) => Promise<AIResponse>,
  providerOptions: BaseAIOptions,
  messages: AIMessage[],
  options: ChatOptions & { continueOnLength?: ContinueOnLengthOption } = {},
): Promise<AIResponse> {
  const config = resolveContinuation(providerOptions, options);
  const first = await chat(messages, options);
  const hitLimit = (response: AIResponse) =>
    response.finishReason === 'length' && !response.toolCalls?.length;

  if (!config || !hitLimit(first)) {
    return first.finishReason === 'length'
      ? { ...first, truncated: true }
      : first;
  }

  // Parts after the first are deduplicated, so progress is reported once with
  // the stitched text instead of with each raw chunk.
  const { onProgress, ...partOptions } = options;
  let content = first.content;
  let usage = first.usage;
  let last = first;
  let parts = 1;

  while (parts <= config.maxContinuations && hitLimit(last)) {
    const next = await chat(continuationMessages(messages, content), {
      ...partOptions,
      stream: false,
    });
    parts++;
    usage = addUsage(usage, next.usage);
    last = next;
    const addition = continuationAddition(content, next.content);
    if (!addition) break; // no new text: stop looping
    content += addition;
    if (onProgress) onProgress(addition);
  }

  return {
    ...last,
    content,
    usage,
    model: last.model ?? first.model,
    parts,
    truncated: hitLimit(last),
  };
}

/**
 * Stream a reply across continuations as one continuous stream. A continuation
 * part's first characters are held back briefly so a repeated seam can be
 * trimmed before it reaches the consumer.
 */
export async function* streamWithContinuation(
  stream: (
    messages: AIMessage[],
    options?: ChatOptions,
  ) => AsyncIterable<string>,
  providerOptions: BaseAIOptions,
  messages: AIMessage[],
  options: ChatOptions & { continueOnLength?: ContinueOnLengthOption } = {},
): AsyncIterable<string> {
  const config = resolveContinuation(providerOptions, options);
  if (!config) {
    yield* stream(messages, options);
    return;
  }

  const { onProgress, onFinishReason, ...rest } = options;
  let accumulated = '';
  for (let part = 0; part <= config.maxContinuations; part++) {
    const finish: { reason?: AIFinishReason } = {};
    const partOptions: ChatOptions = {
      ...rest,
      onFinishReason: (value) => {
        finish.reason = value;
      },
    };
    const source = stream(
      part === 0 ? messages : continuationMessages(messages, accumulated),
      partOptions,
    );
    let pending = '';
    let seam = part > 0;
    const emit = (text: string) => {
      if (!text) return null;
      accumulated += text;
      onProgress?.(text);
      return text;
    };
    for await (const chunk of source) {
      if (!seam) {
        const out = emit(chunk);
        if (out) yield out;
        continue;
      }
      pending += chunk;
      if (pending.length >= MAX_OVERLAP + MIN_OVERLAP) {
        seam = false;
        const out = emit(continuationAddition(accumulated, pending));
        if (out) yield out;
        pending = '';
      }
    }
    if (seam && pending) {
      const out = emit(continuationAddition(accumulated, pending));
      if (out) yield out;
    }
    onFinishReason?.(finish.reason ?? 'stop');
    if (finish.reason !== 'length') return;
  }
}

/**
 * Wrap a provider so chat, complete, message and stream continue replies that
 * stop on the output limit. Continuation is off unless the call (or the
 * client's `continueOnLength` option) enables it.
 *
 * `client` is what each request goes through, normally the rate-limited
 * provider, so every continuation part is paced and retried on its own and a
 * rate-limit retry on part N never re-requests parts 1..N-1. `adapter` is the
 * unwrapped provider: a continued `complete`/`message` runs the adapter's own
 * method against this proxy so its internal `this.chat` reaches the continuing
 * (and per-part paced) chat instead of being paced as one opaque call.
 */
export function createContinuingAI<T extends AIInterface>(
  client: T,
  providerOptions: BaseAIOptions,
  adapter: AIInterface = client,
): T {
  const wrapped = new Map<PropertyKey, unknown>();
  const proxy: T = new Proxy(client, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      if (!wrapped.has(property)) {
        let fn: unknown;
        switch (property) {
          case 'chat':
            fn = (messages: AIMessage[], options?: ChatOptions) =>
              chatWithContinuation(
                (m, o) => value.call(target, m, o),
                providerOptions,
                messages,
                options,
              );
            break;
          case 'stream':
            fn = (messages: AIMessage[], options?: ChatOptions) =>
              streamWithContinuation(
                (m, o) => value.call(target, m, o),
                providerOptions,
                messages,
                options,
              );
            break;
          case 'complete':
          case 'message':
            fn = (...args: unknown[]) => {
              const options = (args[1] ?? {}) as Parameters<
                typeof resolveContinuation
              >[1];
              if (!resolveContinuation(providerOptions, options)) {
                return value.apply(target, args);
              }
              // Adapters implement these through this.chat, so run the
              // adapter's method against the proxy to reach the continuing
              // chat().
              const own = Reflect.get(adapter, property, adapter) as (
                ...a: unknown[]
              ) => unknown;
              return own.apply(proxy, args);
            };
            break;
          default:
            fn = value.bind(target);
        }
        wrapped.set(property, fn);
      }
      return wrapped.get(property);
    },
  });
  return proxy;
}
