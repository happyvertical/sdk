import type {
  AIGenerationLimits,
  AIInterface,
  AIReasoningOptions,
  AIRequestControls,
  AIRequestEvent,
  AIRequestOperation,
  AIRequestStatus,
  BaseAIOptions,
  ChatOptions,
  ImageGenerationOptions,
} from './types';
import { AIError } from './types';

export const DEFAULT_AI_TIMEOUT_MS = 120_000;
export const DEFAULT_AI_MAX_RETRIES = 0;

export const DEFAULT_AI_GENERATION_LIMITS: Readonly<AIGenerationLimits> =
  Object.freeze({
    maxOutputTokens: 4096,
    maxReasoningTokens: 1024,
    maxImagesPerRequest: 1,
    onExceeded: 'error',
  });

export interface NormalizedBaseAIOptions extends BaseAIOptions {
  timeout: number;
  maxRetries: number;
  generationLimits: AIGenerationLimits;
}

export interface PreparedRequestControls {
  signal: AbortSignal;
  timeout: number;
  cleanup(): void;
  didTimeout(): boolean;
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  field: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new AIError(
      `${field} must be a positive finite number`,
      'AI_LIMIT_INVALID',
    );
  }
  return Math.trunc(value);
}

export function normalizeBaseAIOptions<T extends BaseAIOptions>(
  options: T,
): T & NormalizedBaseAIOptions {
  const configuredLimits = options.generationLimits || {};
  const generationLimits: AIGenerationLimits = {
    maxOutputTokens: positiveInteger(
      configuredLimits.maxOutputTokens,
      DEFAULT_AI_GENERATION_LIMITS.maxOutputTokens,
      'generationLimits.maxOutputTokens',
    ),
    maxReasoningTokens: positiveInteger(
      configuredLimits.maxReasoningTokens,
      DEFAULT_AI_GENERATION_LIMITS.maxReasoningTokens,
      'generationLimits.maxReasoningTokens',
    ),
    maxImagesPerRequest: positiveInteger(
      configuredLimits.maxImagesPerRequest,
      DEFAULT_AI_GENERATION_LIMITS.maxImagesPerRequest,
      'generationLimits.maxImagesPerRequest',
    ),
    onExceeded:
      configuredLimits.onExceeded || DEFAULT_AI_GENERATION_LIMITS.onExceeded,
  };

  if (!['error', 'clamp'].includes(generationLimits.onExceeded)) {
    throw new AIError(
      'generationLimits.onExceeded must be "error" or "clamp"',
      'AI_LIMIT_INVALID',
    );
  }

  return {
    ...options,
    timeout: positiveInteger(options.timeout, DEFAULT_AI_TIMEOUT_MS, 'timeout'),
    maxRetries: (() => {
      if (options.maxRetries === undefined) return DEFAULT_AI_MAX_RETRIES;
      if (!Number.isFinite(options.maxRetries) || options.maxRetries < 0) {
        throw new AIError(
          'maxRetries must be a non-negative finite number',
          'AI_LIMIT_INVALID',
        );
      }
      return Math.trunc(options.maxRetries);
    })(),
    generationLimits,
  };
}

function reasoningTokensForEffort(
  effort: AIReasoningOptions['effort'] | false | undefined,
): number | undefined {
  switch (effort) {
    case false:
    case 'none':
      return 0;
    case 'minimal':
      return 1024;
    case 'low':
      return 2048;
    case 'medium':
      return 4096;
    case 'high':
      return 8192;
    default:
      return undefined;
  }
}

function enforceLimit(
  requested: number,
  limit: number,
  behavior: AIGenerationLimits['onExceeded'],
  label: string,
  provider?: string,
  model?: string,
): number {
  if (!Number.isFinite(requested) || requested < 0) {
    throw new AIError(
      `${label} must be a non-negative finite number`,
      'AI_LIMIT_INVALID',
      provider,
      model,
    );
  }
  const normalized = Math.trunc(requested);
  if (normalized <= limit) return normalized;
  if (behavior === 'clamp') return limit;
  throw new AIError(
    `${label} ${normalized} exceeds configured ceiling ${limit}`,
    'AI_LIMIT_EXCEEDED',
    provider,
    model,
  );
}

export function normalizeChatOptions<
  T extends AIRequestControls & {
    maxTokens?: number;
    thinkingLevel?: ChatOptions['thinkingLevel'];
    includeThoughts?: boolean;
  },
>(
  providerOptions: BaseAIOptions,
  options: T,
  provider?: string,
  model?: string,
): T & { maxTokens: number; reasoning: AIReasoningOptions } {
  const normalizedProvider = normalizeBaseAIOptions(providerOptions);
  const limits = normalizedProvider.generationLimits;
  const requestedOutput = options.maxTokens ?? limits.maxOutputTokens;
  const legacyEffort =
    options.thinkingLevel ??
    (
      providerOptions as BaseAIOptions & {
        thinkingLevel?: ChatOptions['thinkingLevel'];
      }
    ).thinkingLevel;
  const requestedReasoning =
    options.reasoning?.maxTokens ??
    reasoningTokensForEffort(options.reasoning?.effort ?? legacyEffort) ??
    limits.maxReasoningTokens;

  return {
    ...options,
    maxTokens: enforceLimit(
      requestedOutput,
      limits.maxOutputTokens,
      limits.onExceeded,
      'maxTokens',
      provider,
      model,
    ),
    reasoning: {
      ...options.reasoning,
      maxTokens: enforceLimit(
        requestedReasoning,
        limits.maxReasoningTokens,
        limits.onExceeded,
        'reasoning.maxTokens',
        provider,
        model,
      ),
      includeThoughts:
        options.reasoning?.includeThoughts ?? options.includeThoughts,
    },
  };
}

export function normalizeImageGenerationOptions<
  T extends ImageGenerationOptions,
>(
  providerOptions: BaseAIOptions,
  options: T,
  provider?: string,
  model?: string,
): T & { n: number } {
  const normalizedProvider = normalizeBaseAIOptions(providerOptions);
  const limits = normalizedProvider.generationLimits;
  return {
    ...options,
    n: enforceLimit(
      options.n ?? 1,
      limits.maxImagesPerRequest,
      limits.onExceeded,
      'n',
      provider,
      model,
    ),
  };
}

export function prepareRequestControls(
  providerOptions: BaseAIOptions,
  requestOptions: AIRequestControls = {},
): PreparedRequestControls {
  const normalized = normalizeBaseAIOptions(providerOptions);
  const timeout = positiveInteger(
    requestOptions.timeout,
    normalized.timeout,
    'timeout',
  );
  const controller = new AbortController();
  let timedOut = false;

  const abortFromCaller = () => controller.abort(requestOptions.signal?.reason);
  if (requestOptions.signal?.aborted) {
    abortFromCaller();
  } else {
    requestOptions.signal?.addEventListener('abort', abortFromCaller, {
      once: true,
    });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error(`AI request timed out after ${timeout}ms`));
  }, timeout);

  return {
    signal: controller.signal,
    timeout,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      requestOptions.signal?.removeEventListener('abort', abortFromCaller);
    },
  };
}

function mergeTags(
  providerOptions: BaseAIOptions,
  callTags?: Record<string, string>,
): Record<string, string> | undefined {
  return providerOptions.usageTags || callTags
    ? { ...providerOptions.usageTags, ...callTags }
    : undefined;
}

export function emitRequestEvent(
  providerOptions: BaseAIOptions,
  event: Omit<AIRequestEvent, 'tags'> & {
    tags?: Record<string, string>;
  },
): void {
  if (!providerOptions.onRequest) return;
  try {
    providerOptions.onRequest({
      ...event,
      tags: mergeTags(providerOptions, event.tags),
    });
  } catch {
    // Consumer telemetry must never affect an AI request.
  }
}

export function classifyRequestFailure(
  error: unknown,
  didTimeout = false,
): { status: AIRequestStatus; errorCode?: string } {
  const code = error instanceof AIError ? error.code : undefined;
  if (code === 'AI_LIMIT_EXCEEDED' || code === 'AI_LIMIT_INVALID') {
    return { status: 'rejected', errorCode: code };
  }
  if (didTimeout || code === 'AI_TIMEOUT' || code === 'TIMEOUT') {
    return { status: 'timed_out', errorCode: code || 'AI_TIMEOUT' };
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return { status: 'aborted', errorCode: 'ABORTED' };
  }
  if (code === 'AI_ABORTED') {
    return { status: 'aborted', errorCode: code };
  }
  return {
    status: 'failed',
    errorCode: code || (error instanceof Error ? error.name : undefined),
  };
}

export function requestEventBase(options: {
  providerOptions: BaseAIOptions;
  provider: string;
  model: string;
  operation: AIRequestOperation;
  callOptions?: { maxTokens?: number; usageTags?: Record<string, string> };
  effectiveMaxOutputTokens?: number;
}): Omit<AIRequestEvent, 'status' | 'duration'> & {
  tags?: Record<string, string>;
} {
  const normalized = normalizeBaseAIOptions(options.providerOptions);
  return {
    provider: options.provider,
    model: options.model,
    operation: options.operation,
    attempts: normalized.maxRetries + 1,
    requestedMaxOutputTokens: options.callOptions?.maxTokens,
    effectiveMaxOutputTokens:
      options.operation === 'generateImage'
        ? undefined
        : (options.effectiveMaxOutputTokens ??
          normalized.generationLimits.maxOutputTokens),
    tags: options.callOptions?.usageTags,
  };
}

const OBSERVED_OPERATIONS = new Set<AIRequestOperation>([
  'chat',
  'complete',
  'message',
  'describeImage',
  'generateImage',
  'stream',
]);

function callOptionsFor(
  operation: AIRequestOperation,
  args: unknown[],
):
  | (AIRequestControls & {
      model?: string;
      maxTokens?: number;
      usageTags?: Record<string, string>;
    })
  | undefined {
  const index = operation === 'describeImage' ? 2 : 1;
  const value = args[index];
  return value && typeof value === 'object'
    ? (value as AIRequestControls & {
        model?: string;
        maxTokens?: number;
        usageTags?: Record<string, string>;
      })
    : undefined;
}

function providerName(options: BaseAIOptions): string {
  const configured = (options as BaseAIOptions & { type?: string }).type;
  return configured || 'openai';
}

function effectiveOutputTokens(
  operation: AIRequestOperation,
  providerOptions: BaseAIOptions,
  callOptions:
    | (AIRequestControls & {
        model?: string;
        maxTokens?: number;
        n?: number;
      })
    | undefined,
): number | undefined {
  if (operation === 'generateImage') {
    normalizeImageGenerationOptions(
      providerOptions,
      callOptions || {},
      providerName(providerOptions),
      callOptions?.model,
    );
    return undefined;
  }

  return normalizeChatOptions(
    providerOptions,
    callOptions || {},
    providerName(providerOptions),
    callOptions?.model || providerOptions.defaultModel,
  ).maxTokens;
}

/**
 * Wrap a public provider instance with prompt-free lifecycle observation.
 * Provider adapters still enforce limits internally so direct construction is
 * protected; this wrapper adds one terminal event to the public getAI() path.
 */
export function createObservedAI<T extends AIInterface>(
  client: T,
  providerOptions: BaseAIOptions,
): T {
  if (!providerOptions.onRequest) return client;

  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (
        typeof property !== 'string' ||
        typeof value !== 'function' ||
        !OBSERVED_OPERATIONS.has(property as AIRequestOperation)
      ) {
        return typeof value === 'function' ? value.bind(target) : value;
      }

      const operation = property as AIRequestOperation;
      if (operation === 'stream') {
        return async function* (...args: unknown[]) {
          const startedAt = Date.now();
          const callOptions = callOptionsFor(operation, args);
          let base: ReturnType<typeof requestEventBase> | undefined;
          try {
            base = requestEventBase({
              providerOptions,
              provider: providerName(providerOptions),
              model:
                callOptions?.model || providerOptions.defaultModel || 'unknown',
              operation,
              callOptions,
              effectiveMaxOutputTokens: effectiveOutputTokens(
                operation,
                providerOptions,
                callOptions,
              ),
            });
            const iterable = Reflect.apply(
              value,
              target,
              args,
            ) as AsyncIterable<string>;
            for await (const chunk of iterable) yield chunk;
            emitRequestEvent(providerOptions, {
              ...base,
              status: 'succeeded',
              duration: Date.now() - startedAt,
            });
          } catch (error) {
            const failure = classifyRequestFailure(error);
            base ||= requestEventBase({
              providerOptions,
              provider: providerName(providerOptions),
              model:
                callOptions?.model || providerOptions.defaultModel || 'unknown',
              operation,
              callOptions,
            });
            emitRequestEvent(providerOptions, {
              ...base,
              ...failure,
              duration: Date.now() - startedAt,
            });
            throw error;
          }
        };
      }

      return async (...args: unknown[]) => {
        const startedAt = Date.now();
        const callOptions = callOptionsFor(operation, args);
        let base: ReturnType<typeof requestEventBase> | undefined;
        try {
          base = requestEventBase({
            providerOptions,
            provider: providerName(providerOptions),
            model:
              callOptions?.model || providerOptions.defaultModel || 'unknown',
            operation,
            callOptions,
            effectiveMaxOutputTokens: effectiveOutputTokens(
              operation,
              providerOptions,
              callOptions,
            ),
          });
          const result = await Reflect.apply(value, target, args);
          emitRequestEvent(providerOptions, {
            ...base,
            status: 'succeeded',
            duration: Date.now() - startedAt,
          });
          return result;
        } catch (error) {
          const failure = classifyRequestFailure(error);
          base ||= requestEventBase({
            providerOptions,
            provider: providerName(providerOptions),
            model:
              callOptions?.model || providerOptions.defaultModel || 'unknown',
            operation,
            callOptions,
          });
          emitRequestEvent(providerOptions, {
            ...base,
            ...failure,
            duration: Date.now() - startedAt,
          });
          throw error;
        }
      };
    },
  });
}
