import type {
  RetryDecision,
  RetryStrategy,
  RetryStrategyConfig,
} from './types.js';

/**
 * Options for exponential backoff retry strategy
 */
export interface ExponentialBackoffOptions {
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 300000 = 5 minutes) */
  maxDelay?: number;
  /** Multiplier for each attempt (default: 2) */
  multiplier?: number;
  /** Add random jitter to prevent thundering herd (default: true) */
  jitter?: boolean;
  /** Maximum attempts (optional, can also be set on job) */
  maxAttempts?: number;
}

/**
 * Exponential backoff retry strategy
 *
 * Delay increases exponentially: initialDelay * multiplier^(attempt-1)
 * With optional jitter to prevent thundering herd problem.
 */
class ExponentialBackoffStrategy implements RetryStrategy {
  private readonly initialDelay: number;
  private readonly maxDelay: number;
  private readonly multiplier: number;
  private readonly jitter: boolean;
  private readonly maxAttempts: number | null;

  constructor(options: ExponentialBackoffOptions = {}) {
    this.initialDelay = options.initialDelay ?? 1000;
    this.maxDelay = options.maxDelay ?? 300000;
    this.multiplier = options.multiplier ?? 2;
    this.jitter = options.jitter ?? true;
    this.maxAttempts = options.maxAttempts ?? null;
  }

  shouldRetry(attempt: number, _error: Error): RetryDecision {
    // Check max attempts if configured
    if (this.maxAttempts !== null && attempt >= this.maxAttempts) {
      return { shouldRetry: false, delay: 0 };
    }

    // Calculate base delay: initialDelay * multiplier^(attempt-1)
    let delay = this.initialDelay * this.multiplier ** (attempt - 1);

    // Cap at maxDelay
    delay = Math.min(delay, this.maxDelay);

    // Add jitter (±25% randomization)
    if (this.jitter) {
      const jitterRange = delay * 0.25;
      delay = delay - jitterRange + Math.random() * jitterRange * 2;
    }

    return { shouldRetry: true, delay: Math.round(delay) };
  }

  toConfig(): RetryStrategyConfig {
    return {
      type: 'exponential',
      config: {
        initialDelay: this.initialDelay,
        maxDelay: this.maxDelay,
        multiplier: this.multiplier,
        jitter: this.jitter,
        maxAttempts: this.maxAttempts,
      },
    };
  }
}

/**
 * Options for linear retry strategy
 */
export interface LinearBackoffOptions {
  /** Fixed delay between retries in milliseconds (default: 5000) */
  delay?: number;
  /** Maximum attempts (optional) */
  maxAttempts?: number;
}

/**
 * Linear retry strategy
 *
 * Uses a fixed delay between all retry attempts.
 */
class LinearBackoffStrategy implements RetryStrategy {
  private readonly delay: number;
  private readonly maxAttempts: number | null;

  constructor(options: LinearBackoffOptions = {}) {
    this.delay = options.delay ?? 5000;
    this.maxAttempts = options.maxAttempts ?? null;
  }

  shouldRetry(attempt: number, _error: Error): RetryDecision {
    if (this.maxAttempts !== null && attempt >= this.maxAttempts) {
      return { shouldRetry: false, delay: 0 };
    }

    return { shouldRetry: true, delay: this.delay };
  }

  toConfig(): RetryStrategyConfig {
    return {
      type: 'linear',
      config: {
        delay: this.delay,
        maxAttempts: this.maxAttempts,
      },
    };
  }
}

/**
 * Custom retry decision function
 */
export type CustomRetryFn = (attempt: number, error: Error) => RetryDecision;

/**
 * Custom retry strategy
 *
 * Allows full control over retry logic via a custom function.
 */
class CustomRetryStrategy implements RetryStrategy {
  private readonly fn: CustomRetryFn;
  private readonly fnString: string;

  constructor(fn: CustomRetryFn) {
    this.fn = fn;
    // Store string representation for serialization
    this.fnString = fn.toString();
  }

  shouldRetry(attempt: number, error: Error): RetryDecision {
    return this.fn(attempt, error);
  }

  toConfig(): RetryStrategyConfig {
    return {
      type: 'custom',
      config: {
        fn: this.fnString,
      },
    };
  }
}

/**
 * No retry strategy - never retry
 */
class NoRetryStrategy implements RetryStrategy {
  shouldRetry(_attempt: number, _error: Error): RetryDecision {
    return { shouldRetry: false, delay: 0 };
  }

  toConfig(): RetryStrategyConfig {
    return {
      type: 'linear',
      config: { maxAttempts: 1 },
    };
  }
}

// Factory functions

/**
 * Create an exponential backoff retry strategy
 *
 * @example
 * ```typescript
 * const strategy = exponential({
 *   initialDelay: 1000,
 *   maxDelay: 300000,
 *   multiplier: 2,
 *   jitter: true,
 * });
 * ```
 */
export function exponential(
  options?: ExponentialBackoffOptions,
): RetryStrategy {
  return new ExponentialBackoffStrategy(options);
}

/**
 * Create a linear retry strategy with fixed delay
 *
 * @example
 * ```typescript
 * const strategy = linear({ delay: 5000 });
 * ```
 */
export function linear(options?: LinearBackoffOptions): RetryStrategy {
  return new LinearBackoffStrategy(options);
}

/**
 * Create a custom retry strategy
 *
 * @example
 * ```typescript
 * const strategy = custom((attempt, error) => {
 *   if (error.message.includes('RATE_LIMITED')) {
 *     return { shouldRetry: true, delay: 60000 };
 *   }
 *   return { shouldRetry: attempt < 3, delay: attempt * 1000 };
 * });
 * ```
 */
export function custom(fn: CustomRetryFn): RetryStrategy {
  return new CustomRetryStrategy(fn);
}

/**
 * Create a no-retry strategy
 *
 * @example
 * ```typescript
 * const strategy = noRetry();
 * ```
 */
export function noRetry(): RetryStrategy {
  return new NoRetryStrategy();
}

/**
 * Reconstruct a retry strategy from its config
 */
export function fromConfig(config: RetryStrategyConfig): RetryStrategy {
  switch (config.type) {
    case 'exponential':
      return new ExponentialBackoffStrategy(
        config.config as ExponentialBackoffOptions,
      );
    case 'linear':
      return new LinearBackoffStrategy(config.config as LinearBackoffOptions);
    case 'custom':
      // For custom strategies loaded from config, we can't reconstruct the function
      // So we fall back to exponential
      console.warn(
        'Custom retry strategy cannot be reconstructed from config, using exponential',
      );
      return new ExponentialBackoffStrategy();
    default:
      return new ExponentialBackoffStrategy();
  }
}

/**
 * Default retry strategy
 */
export const DEFAULT_RETRY_STRATEGY = exponential({
  initialDelay: 1000,
  maxDelay: 300000,
  multiplier: 2,
  jitter: true,
});
