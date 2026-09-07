import type { AIClientOptions } from './client';
import type { AIInterface, AIRateLimitOptions, GetAIOptions } from './types';
import { AIError, RateLimitError } from './types';

const RATE_LIMITED_METHODS = new Set<keyof AIInterface>([
  'chat',
  'complete',
  'message',
  'embed',
  'embedImage',
  'describeImage',
  'generateImage',
  'getModels',
  'synthesizeSpeech',
  'cloneVoice',
  'designVoice',
  'getVoices',
  'submitVideoGenerationJob',
]);

const MAX_BUDGET_COORDINATORS = 128;
const BUDGET_COORDINATOR_TTL_MS = 15 * 60 * 1000;

interface NormalizedRateLimitConfig {
  cooldownMs: number;
  initialDelayMs: number;
  key: string;
  maxAttempts: number;
}

class BudgetCoordinator {
  private nextAvailableAt = 0;
  private pendingSchedules = 0;
  private tail: Promise<void> = Promise.resolve();
  private lastUsedAt = Date.now();

  touch(): void {
    this.lastUsedAt = Date.now();
  }

  schedule<T>(work: () => Promise<T>): Promise<T> {
    this.pendingSchedules += 1;
    this.touch();

    const run = this.tail.then(work, work);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );

    return run.finally(() => {
      this.pendingSchedules = Math.max(0, this.pendingSchedules - 1);
      this.touch();
    });
  }

  async waitUntilReady(): Promise<void> {
    this.touch();
    const delayMs = this.nextAvailableAt - Date.now();
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  delayFor(delayMs: number): void {
    this.touch();
    if (delayMs <= 0) {
      return;
    }

    this.nextAvailableAt = Math.max(this.nextAvailableAt, Date.now() + delayMs);
  }

  isEvictable(now: number): boolean {
    return this.pendingSchedules === 0 && now >= this.nextAvailableAt;
  }

  isExpired(now: number): boolean {
    return (
      this.isEvictable(now) &&
      now - this.lastUsedAt >= BUDGET_COORDINATOR_TTL_MS
    );
  }

  getLastUsedAt(): number {
    return this.lastUsedAt;
  }
}

const budgetCoordinators = new Map<string, BudgetCoordinator>();

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function pruneBudgetCoordinators(): void {
  const now = Date.now();

  for (const [key, coordinator] of budgetCoordinators.entries()) {
    if (coordinator.isExpired(now)) {
      budgetCoordinators.delete(key);
    }
  }

  while (budgetCoordinators.size > MAX_BUDGET_COORDINATORS) {
    const evictableEntries = [...budgetCoordinators.entries()]
      .filter(([, coordinator]) => coordinator.isEvictable(now))
      .sort(
        ([, leftCoordinator], [, rightCoordinator]) =>
          leftCoordinator.getLastUsedAt() - rightCoordinator.getLastUsedAt(),
      );

    if (evictableEntries.length === 0) {
      break;
    }

    budgetCoordinators.delete(evictableEntries[0][0]);
  }
}

function getBudgetCoordinator(key: string): BudgetCoordinator {
  pruneBudgetCoordinators();

  let coordinator = budgetCoordinators.get(key);
  if (!coordinator) {
    coordinator = new BudgetCoordinator();
    budgetCoordinators.set(key, coordinator);
    pruneBudgetCoordinators();
  }

  coordinator.touch();
  return coordinator;
}

function hasPacingConfig(rateLimit?: AIRateLimitOptions): boolean {
  if (!rateLimit || rateLimit.enabled === false) {
    return false;
  }

  return (
    rateLimit.enabled === true ||
    rateLimit.key !== undefined ||
    rateLimit.cooldownMs !== undefined ||
    rateLimit.initialDelayMs !== undefined ||
    rateLimit.maxAttempts !== undefined
  );
}

function normalizeNonNegativeInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.trunc(value));
}

function hashKey(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function deriveBudgetKey(options: GetAIOptions | AIClientOptions): string {
  const type = (options as { type?: string }).type;
  const provider = typeof type === 'string' && type ? type : 'openai';

  const credentialLikeValues = [
    'apiKey' in options ? options.apiKey : undefined,
    'apiToken' in options ? options.apiToken : undefined,
    'credentials' in options ? options.credentials?.accessKeyId : undefined,
    'endpoint' in options ? options.endpoint : undefined,
    'baseUrl' in options ? options.baseUrl : undefined,
    'cliPath' in options ? options.cliPath : undefined,
  ];

  const seed = credentialLikeValues.find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );

  return seed ? `${provider}:${hashKey(seed)}` : `${provider}:default`;
}

function normalizeRateLimitConfig(
  options: GetAIOptions | AIClientOptions,
): NormalizedRateLimitConfig | null {
  const rateLimit = 'rateLimit' in options ? options.rateLimit : undefined;

  if (!hasPacingConfig(rateLimit)) {
    return null;
  }

  return {
    cooldownMs: normalizeNonNegativeInteger(rateLimit?.cooldownMs, 0),
    initialDelayMs: normalizeNonNegativeInteger(
      rateLimit?.initialDelayMs,
      5000,
    ),
    key: rateLimit?.key?.trim() || deriveBudgetKey(options),
    maxAttempts: Math.max(
      1,
      normalizeNonNegativeInteger(rateLimit?.maxAttempts, 1),
    ),
  };
}

function getRetryDelayMs(
  error: RateLimitError,
  config: NormalizedRateLimitConfig,
): number {
  const hintedDelayMs =
    typeof error.retryAfter === 'number' && Number.isFinite(error.retryAfter)
      ? Math.max(0, Math.ceil(error.retryAfter * 1000))
      : undefined;

  if (hintedDelayMs !== undefined) {
    return Math.max(config.cooldownMs, hintedDelayMs);
  }

  return Math.max(config.cooldownMs, config.initialDelayMs);
}

async function invokeWithPacing<T>(
  execute: () => Promise<T>,
  coordinator: BudgetCoordinator,
  config: NormalizedRateLimitConfig,
  allowRetry = true,
): Promise<T> {
  let attempt = 1;

  while (true) {
    await coordinator.waitUntilReady();

    try {
      const result = await execute();
      coordinator.delayFor(config.cooldownMs);
      return result;
    } catch (error) {
      if (error instanceof RateLimitError) {
        coordinator.delayFor(getRetryDelayMs(error, config));

        if (allowRetry && error.retryable && attempt < config.maxAttempts) {
          attempt += 1;
          continue;
        }
      }

      throw error;
    }
  }
}

export function parseRetryAfterSeconds(
  retryAfter: number | string | null | undefined,
): number | undefined {
  if (typeof retryAfter === 'number' && Number.isFinite(retryAfter)) {
    return Math.max(0, retryAfter);
  }

  if (typeof retryAfter !== 'string') {
    return undefined;
  }

  const trimmed = retryAfter.trim();
  if (!trimmed) {
    return undefined;
  }

  const seconds = Number.parseFloat(trimmed);
  if (!Number.isNaN(seconds)) {
    return Math.max(0, seconds);
  }

  const retryAt = Date.parse(trimmed);
  if (Number.isNaN(retryAt)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
}

function getHeaderValue(
  headers: unknown,
  headerName: string,
): number | string | undefined {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  if ('get' in headers && typeof headers.get === 'function') {
    return headers.get(headerName) ?? headers.get(headerName.toLowerCase());
  }

  const objectHeaders = headers as Record<string, number | string | undefined>;
  return objectHeaders[headerName] ?? objectHeaders[headerName.toLowerCase()];
}

export function extractRetryAfterSeconds(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  if ('retryAfter' in error) {
    const retryAfter = parseRetryAfterSeconds(
      (error as { retryAfter?: number | string | null }).retryAfter,
    );
    if (retryAfter !== undefined) {
      return retryAfter;
    }
  }

  if ('headers' in error) {
    const retryAfter = parseRetryAfterSeconds(
      getHeaderValue((error as { headers?: unknown }).headers, 'retry-after'),
    );
    if (retryAfter !== undefined) {
      return retryAfter;
    }
  }

  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message
      : '';

  const retryAfterMatch =
    message.match(/retry after\s+(\d+(?:\.\d+)?)\s*s?/i) ??
    message.match(/retryDelay[^\d]*(\d+(?:\.\d+)?)s/i);

  return retryAfterMatch
    ? parseRetryAfterSeconds(retryAfterMatch[1])
    : undefined;
}

export function createRateLimitedAI<T extends AIInterface>(
  client: T,
  options: GetAIOptions | AIClientOptions,
): T {
  const config = normalizeRateLimitConfig(options);
  if (!config) {
    return client;
  }

  const wrappedMethods = new Map<PropertyKey, unknown>();
  // Seevio does not document idempotency for billed video-task submission.
  // Existing providers retain their established pacing-retry behavior.
  const allowSeevioSubmitRetry = options.type !== 'seevio';

  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (typeof value !== 'function') {
        return value;
      }

      if (!RATE_LIMITED_METHODS.has(property as keyof AIInterface)) {
        if (!wrappedMethods.has(property)) {
          wrappedMethods.set(property, value.bind(target));
        }

        return wrappedMethods.get(property);
      }

      if (!wrappedMethods.has(property)) {
        wrappedMethods.set(property, (...args: unknown[]) => {
          const coordinator = getBudgetCoordinator(config.key);
          return coordinator.schedule(() =>
            invokeWithPacing(
              () => Reflect.apply(value, target, args) as Promise<unknown>,
              coordinator,
              config,
              property !== 'submitVideoGenerationJob' || allowSeevioSubmitRetry,
            ),
          );
        });
      }

      return wrappedMethods.get(property);
    },
  }) as T;
}

export function __resetAIRateLimitStateForTests(): void {
  budgetCoordinators.clear();
}

export function __getAIRateLimitStateForTests(): {
  count: number;
  maxBudgetCoordinators: number;
  ttlMs: number;
} {
  return {
    count: budgetCoordinators.size,
    maxBudgetCoordinators: MAX_BUDGET_COORDINATORS,
    ttlMs: BUDGET_COORDINATOR_TTL_MS,
  };
}

export function isRetryableAIError(error: unknown): error is AIError {
  return error instanceof AIError && error.retryable;
}
