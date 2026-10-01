/**
 * Retry with exponential backoff for speech provider calls. Retries only
 * rate-limit (429) and server (5xx) responses, honours `Retry-After`, and
 * stops immediately when the caller aborts.
 */

import { SpeechConfigurationError, SpeechProviderError } from './errors.js';

export interface SpeechRetryOptions {
  /** Retries after the first attempt. Default `2`. `0` disables retries. */
  maxRetries?: number;
  /** First backoff delay in milliseconds. Default `500`. */
  initialDelayMs?: number;
  /**
   * Upper bound for any single wait in milliseconds. Default `30000`. A
   * `Retry-After` longer than this ends retrying rather than retrying early.
   */
  maxDelayMs?: number;
}

export const DEFAULT_SPEECH_RETRY: Required<SpeechRetryOptions> = {
  maxRetries: 2,
  initialDelayMs: 500,
  maxDelayMs: 30_000,
};

export function resolveRetryOptions(
  retry: SpeechRetryOptions | false | undefined,
  defaults: Required<SpeechRetryOptions> | false = DEFAULT_SPEECH_RETRY,
): Required<SpeechRetryOptions> | false {
  if (retry === false) {
    return false;
  }

  if (retry === undefined) {
    return defaults;
  }

  const base = defaults || DEFAULT_SPEECH_RETRY;
  return {
    maxRetries: Math.floor(
      finiteRetryValue('maxRetries', retry.maxRetries, base.maxRetries),
    ),
    initialDelayMs: finiteRetryValue(
      'initialDelayMs',
      retry.initialDelayMs,
      base.initialDelayMs,
    ),
    maxDelayMs: finiteRetryValue(
      'maxDelayMs',
      retry.maxDelayMs,
      base.maxDelayMs,
    ),
  };
}

/**
 * Rejects non-finite values (`NaN`, `Infinity`): they would make the retry
 * budget or delay cap unbounded. Negative values clamp to `0`.
 */
function finiteRetryValue(
  name: keyof SpeechRetryOptions,
  value: number | undefined,
  fallback: number,
): number {
  if (value === undefined) {
    return Math.max(0, fallback);
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SpeechConfigurationError(
      `Speech retry option ${name} must be a finite number`,
    );
  }

  return Math.max(0, value);
}

export function isRetryableStatus(status: number | undefined): boolean {
  return status === 429 || (status !== undefined && status >= 500);
}

/**
 * Parses a `Retry-After` header (delta-seconds or HTTP-date) into
 * milliseconds. Returns `undefined` when absent or unparseable.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Math.round(Number(trimmed) * 1000);
  }

  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/**
 * Runs `attempt` until it succeeds, throws a non-retryable error, or the
 * retry budget is exhausted. Retryable errors are {@link SpeechProviderError}
 * instances whose `status` is 429 or 5xx.
 */
export async function withSpeechRetry<T>(
  attempt: (attemptNumber: number) => Promise<T>,
  retry: Required<SpeechRetryOptions> | false,
  signal?: AbortSignal,
): Promise<T> {
  const maxRetries = retry ? retry.maxRetries : 0;

  for (let attemptNumber = 0; ; attemptNumber += 1) {
    try {
      return await attempt(attemptNumber);
    } catch (error) {
      if (
        !retry ||
        attemptNumber >= maxRetries ||
        signal?.aborted ||
        !(error instanceof SpeechProviderError) ||
        !isRetryableStatus(error.status)
      ) {
        throw error;
      }

      const backoff = Math.min(
        retry.maxDelayMs,
        retry.initialDelayMs * 2 ** attemptNumber,
      );
      const retryAfterMs = error.retryAfterMs;
      if (retryAfterMs !== undefined && retryAfterMs > retry.maxDelayMs) {
        throw error;
      }

      await sleep(Math.max(backoff, retryAfterMs ?? 0), signal);
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
