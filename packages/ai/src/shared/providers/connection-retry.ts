/**
 * One-shot retry for stale keep-alive connections in the OpenAI-compatible
 * providers (#1467).
 *
 * A pooled socket the server closed while idle fails the next request before
 * any response bytes arrive (ECONNRESET, EPIPE, undici `UND_ERR_SOCKET`,
 * "socket hang up"). Such a request never reached the model, so resending it
 * once is safe. Everything else — HTTP status responses, timeouts, caller
 * aborts — is surfaced unchanged.
 */

import OpenAI from 'openai';
import { AI_ATTEMPT_RECORDER, type AIAttemptRecorder } from '../safety';

const STALE_SOCKET_CODES = new Set(['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET']);
const MAX_CAUSE_DEPTH = 8;

/**
 * True when `error` (or anything on its `cause` chain) is a pre-response
 * connection failure: the OpenAI SDK's `APIConnectionError` (not its timeout
 * subclass) or a socket error coded ECONNRESET / EPIPE / UND_ERR_SOCKET /
 * "socket hang up". Any timeout, abort, or HTTP status on the chain wins and
 * makes the error non-retryable.
 */
export function isStaleConnectionError(error: unknown): boolean {
  let matched = false;
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (
    let depth = 0;
    depth < MAX_CAUSE_DEPTH && current && typeof current === 'object';
    depth += 1
  ) {
    if (seen.has(current)) break;
    seen.add(current);
    if (
      current instanceof OpenAI.APIConnectionTimeoutError ||
      current instanceof OpenAI.APIUserAbortError
    ) {
      return false;
    }
    if (current instanceof OpenAI.APIError && current.status !== undefined) {
      return false;
    }
    const { name, code, message } = current as {
      name?: unknown;
      code?: unknown;
      message?: unknown;
    };
    if (name === 'AbortError' || name === 'TimeoutError') return false;
    if (
      current instanceof OpenAI.APIConnectionError ||
      (typeof code === 'string' && STALE_SOCKET_CODES.has(code)) ||
      (typeof message === 'string' && /socket hang up/i.test(message))
    ) {
      matched = true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return matched;
}

/**
 * Decide whether a failed attempt gets its single transparent retry, and
 * record it on the per-call attempt recorder when it does.
 */
export function shouldRetryConnection(
  error: unknown,
  state: {
    enabled: boolean | undefined;
    alreadyRetried: boolean;
    signal: AbortSignal;
    callerSignal?: AbortSignal;
    didTimeout: () => boolean;
    recorder?: AIAttemptRecorder;
  },
): boolean {
  if (
    state.enabled === false ||
    state.alreadyRetried ||
    state.signal.aborted ||
    state.callerSignal?.aborted ||
    state.didTimeout() ||
    !isStaleConnectionError(error)
  ) {
    return false;
  }
  if (state.recorder) state.recorder.connectionRetries += 1;
  return true;
}

/** The per-call attempt recorder the observed client attaches, if any. */
export function attemptRecorderFrom(
  options: object,
): AIAttemptRecorder | undefined {
  return (options as { [AI_ATTEMPT_RECORDER]?: AIAttemptRecorder })[
    AI_ATTEMPT_RECORDER
  ];
}
