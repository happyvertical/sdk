/**
 * Shared usage-event emission helper.
 *
 * Every provider delegates to this so the tag-merge + try/catch semantics
 * are defined in exactly one place.
 */

import type { BaseAIOptions, TokenUsage, UsageEvent } from '../types';

/**
 * Emit a usage event to the `onUsage` callback configured on provider options.
 *
 * @param providerOptions  - The provider's stored options (for `onUsage` and global `usageTags`).
 * @param providerName     - Provider identifier (e.g. `'openai'`).
 * @param operation        - The operation type that generated this usage.
 * @param model            - Model that was used.
 * @param usage            - Token usage breakdown, if available.
 * @param startTime        - `Date.now()` captured before the API call.
 * @param callTags         - Per-call `usageTags` from the method's options.
 */
export function emitUsage(
  providerOptions: BaseAIOptions,
  providerName: string,
  operation: UsageEvent['operation'],
  model: string,
  usage: TokenUsage | undefined,
  startTime: number,
  callTags?: Record<string, string>,
): void {
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
