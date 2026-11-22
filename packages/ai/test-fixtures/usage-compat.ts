/**
 * Compile-time fixtures. They are type-checked by `pnpm typecheck` (see
 * tsconfig.fixtures.json) and never run or published.
 *
 * They prove that adding usage part identity (sdk#1576) leaves producers and
 * implementations written against the earlier usage contract compiling: a
 * host that builds `UsageEvent` without `part`, an `AIResponse` without
 * `usageParts`, and a third-party `AIInterface` without `usageFeatures`.
 */

import type {
  AIInterface,
  AIResponse,
  AIUsageFeatures,
  AIUsageParts,
  BaseAIOptions,
  PartedUsageEvent,
  UsageEvent,
  UsagePart,
} from '../src/shared/types';

function assertType<_T extends true>(): void {}

// A legacy producer: a host adapter or test fixture that builds an event
// without `part` still type-checks, and still reaches `onUsage`.
export function legacyProducer(options: BaseAIOptions): UsageEvent {
  const event: UsageEvent = {
    provider: 'host',
    model: 'host-model',
    operation: 'chat',
    usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    duration: 4,
    timestamp: new Date(0),
    tags: { app: 'host' },
  };
  options.onUsage?.(event);
  return event;
}

// Consumers that require identity narrow to PartedUsageEvent.
export function requireParts(event: UsageEvent): UsagePart | undefined {
  assertType<undefined extends UsageEvent['part'] ? true : false>();
  assertType<PartedUsageEvent['part'] extends UsagePart ? true : false>();
  // @ts-expect-error -- a PartedUsageEvent must carry its part
  const missing: PartedUsageEvent = { ...event, part: undefined };
  void missing;
  return event.part;
}

// Responses and clients built before sdk#1576 stay assignable.
export function legacyResponse(): AIResponse {
  assertType<undefined extends AIResponse['usageParts'] ? true : false>();
  return { content: 'ok' };
}

export function legacyClient(client: Omit<AIInterface, 'usageFeatures'>) {
  assertType<undefined extends AIInterface['usageFeatures'] ? true : false>();
  const asClient: AIInterface = client;
  return asClient;
}

// The declared shapes.
export const features: AIUsageFeatures = { parts: true };
export const parts: AIUsageParts = {
  call: 'c',
  parts: [{ index: 0, last: true }],
  complete: false,
};
