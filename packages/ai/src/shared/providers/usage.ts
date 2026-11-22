/**
 * Shared usage-event emission helper.
 *
 * Every provider delegates to this so the tag-merge + try/catch semantics
 * are defined in exactly one place.
 */

import type { BaseAIOptions, TokenUsage, UsageEvent } from '../types';
import { nextUsagePart, type UsagePartHints } from '../usage-parts';

/**
 * True when the provider reported at least one token counter. A missing or
 * empty usage object is not a report of zero tokens.
 */
export function hasUsageCount(...counters: unknown[]): boolean {
  return counters.some(
    (value) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0,
  );
}

/**
 * A token counter as reported: a finite non-negative number, otherwise
 * undefined (absent, or malformed such as a string, which is never used in
 * arithmetic).
 */
export function countOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/**
 * True when the token split is known: at least one token counter is a valid
 * count and none of them is present but malformed. Otherwise a usage event
 * that still carries other reported figures is marked `uncounted`.
 */
export function tokenCountsKnown(...counters: unknown[]): boolean {
  return (
    counters.some((value) => countOf(value) !== undefined) &&
    counters.every(
      (value) =>
        value === undefined || value === null || countOf(value) !== undefined,
    )
  );
}

/**
 * A request's total tokens: the provider's total when it reported one that
 * covers its parts, otherwise prompt plus completion. Never a zero (or
 * short) total over nonzero parts.
 */
export function totalTokensOf(
  reported: unknown,
  promptTokens: number,
  completionTokens: number,
): number {
  const sum = promptTokens + completionTokens;
  return typeof reported === 'number' &&
    Number.isFinite(reported) &&
    reported >= sum
    ? reported
    : sum;
}

/**
 * Emit a usage event to the `onUsage` callback configured on provider options.
 * Call it once per completed provider request, with or without counts.
 *
 * @param providerOptions  - The provider's stored options (for `onUsage` and global `usageTags`).
 * @param providerName     - Provider identifier (e.g. `'openai'`).
 * @param operation        - The operation type that generated this usage.
 * @param model            - Model that was used.
 * @param usage            - Token usage breakdown, if available.
 * @param startTime        - `Date.now()` captured before the API call.
 * @param callTags         - Per-call `usageTags` from the method's options.
 * @param callOptions      - The method's call options, which carry the
 *   invocation's usage-part recorder. The part is recorded even when no
 *   `onUsage` is configured, so the response's `usageParts` stays complete.
 * @param hints            - What the provider knows about this request: its
 *   finish reason (call this before `onFinishReason`, so a throwing callback
 *   cannot suppress the event) and whether the method sends another request.
 */
export function emitUsage(
  providerOptions: BaseAIOptions,
  providerName: string,
  operation: UsageEvent['operation'],
  model: string,
  usage: TokenUsage | undefined,
  startTime: number,
  callTags?: Record<string, string>,
  callOptions?: unknown,
  hints?: UsagePartHints,
): void {
  const part = nextUsagePart(callOptions, usage, hints);
  if (!providerOptions.onUsage) return;

  const globalTags = providerOptions.usageTags;
  const tags =
    globalTags || callTags ? { ...globalTags, ...callTags } : undefined;

  try {
    providerOptions.onUsage({
      provider: providerName,
      model,
      operation,
      usage,
      duration: Date.now() - startTime,
      timestamp: new Date(),
      tags,
      part,
    });
  } catch {
    // Silently swallow consumer errors
  }
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/**
 * Cache and cost fields for a {@link TokenUsage}, only the ones the provider
 * reported (a missing or malformed figure is omitted, never reported as 0).
 */
export function cacheUsageFields(
  cacheRead: unknown,
  cacheCreation: unknown,
  costUsd?: unknown,
): Pick<
  TokenUsage,
  'cacheReadInputTokens' | 'cacheCreationInputTokens' | 'costUsd'
> {
  const read = count(cacheRead);
  const creation = count(cacheCreation);
  const cost = count(costUsd);
  return {
    ...(read !== undefined ? { cacheReadInputTokens: read } : {}),
    ...(creation !== undefined ? { cacheCreationInputTokens: creation } : {}),
    ...(cost !== undefined ? { costUsd: cost } : {}),
  };
}
