/**
 * @happyvertical/jobs - Job queue abstraction with multiple backend adapters
 *
 * @packageDocumentation
 */

// External adapters (require peer dependencies)
export {
  BullJobStore,
  type BullJobStoreConfig,
  type RedisOptions,
} from './adapters/bull.js';
export {
  BullMQJobStore,
  type BullMQJobStoreConfig,
} from './adapters/bullmq.js';
export {
  CloudTasksJobStore,
  type CloudTasksJobStoreConfig,
} from './adapters/cloud-tasks.js';
// Built-in adapters (zero-config)
export {
  PostgresJobStore,
  type PostgresJobStoreConfig,
} from './adapters/postgres.js';
export {
  SqliteJobStore,
  type SqliteJobStoreConfig,
} from './adapters/sqlite.js';
export {
  SQSJobStore,
  type SQSJobStoreConfig,
} from './adapters/sqs.js';

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
