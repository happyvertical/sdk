/**
 * @happyvertical/jobs - Job queue abstraction with multiple backend adapters
 *
 * @packageDocumentation
 */

export {
  PostgresJobStore,
  type PostgresJobStoreConfig,
} from './adapters/postgres.js';
// Re-export adapters for convenience (they can also be imported directly)
export {
  SqliteJobStore,
  type SqliteJobStoreConfig,
} from './adapters/sqlite.js';

// Base store (for custom adapters)
export { BaseJobStore, priorityToNumber } from './base-store.js';
// Retry strategies
export {
  type CustomRetryFn,
  custom,
  DEFAULT_RETRY_STRATEGY,
  type ExponentialBackoffOptions,
  exponential,
  fromConfig,
  type LinearBackoffOptions,
  linear,
  noRetry,
} from './retry.js';
// Core types
export type {
  CleanupOptions,
  Job,
  JobCreateOptions,
  JobEvent,
  JobEventListener,
  JobEventType,
  JobFilter,
  JobHandle,
  JobHandler,
  JobPayload,
  JobPriority,
  JobStatus,
  JobStore,
  QueueStats,
  RetryDecision,
  RetryStrategy,
  RetryStrategyConfig,
  TimeoutBehavior,
  Unsubscribe,
  Worker,
  WorkerConfig,
} from './types.js';
// Worker
export { createWorker, JobWorker, type WorkerEvents } from './worker.js';
