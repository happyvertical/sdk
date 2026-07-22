import { createId } from '@happyvertical/utils';
import { DEFAULT_RETRY_STRATEGY } from './retry.js';
import type {
  CleanupOptions,
  Job,
  JobCreateOptions,
  JobEvent,
  JobEventListener,
  JobEventType,
  JobFilter,
  JobPriority,
  JobStore,
  QueueStats,
  RetryStrategyConfig,
} from './types.js';

/**
 * Valid table name pattern: alphanumeric and underscores, must start with letter or underscore
 */
const TABLE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Directions accepted in an ORDER BY clause
 */
const VALID_DIRECTIONS = new Set(['ASC', 'DESC']);

/**
 * Validate table name to prevent SQL injection
 * @throws Error if table name contains invalid characters
 */
export function validateTableName(tableName: string): string {
  if (!tableName || tableName.length === 0) {
    throw new Error('Table name cannot be empty');
  }
  if (tableName.length > 128) {
    throw new Error('Table name cannot exceed 128 characters');
  }
  if (!TABLE_NAME_PATTERN.test(tableName)) {
    throw new Error(
      `Invalid table name "${tableName}": must contain only alphanumeric characters and underscores, and must start with a letter or underscore`,
    );
  }
  return tableName;
}

/**
 * Convert priority string to number
 */
export function priorityToNumber(
  priority: JobPriority | number | undefined,
): number {
  if (typeof priority === 'number') return priority;
  switch (priority) {
    case 'critical':
      return 100;
    case 'high':
      return 75;
    case 'normal':
      return 50;
    case 'low':
      return 25;
    default:
      return 50;
  }
}

/**
 * Base job store with common functionality
 */
export abstract class BaseJobStore implements JobStore {
  protected listeners: Set<JobEventListener> = new Set();
  protected initialized = false;

  /**
   * Initialize the store - must be implemented by subclasses
   */
  abstract initialize(): Promise<void>;

  /**
   * Create a new job record
   */
  protected createJobRecord(options: JobCreateOptions): Job {
    const now = new Date();
    const retryConfig: RetryStrategyConfig =
      options.retryStrategy && 'toConfig' in options.retryStrategy
        ? options.retryStrategy.toConfig()
        : ((options.retryStrategy as RetryStrategyConfig) ??
          DEFAULT_RETRY_STRATEGY.toConfig());

    return {
      id: createId(),
      queue: options.queue ?? 'default',
      payload: options.payload,
      status: 'pending',
      priority: priorityToNumber(options.priority),
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 3,
      runAt: options.runAt ?? now,
      startedAt: null,
      completedAt: null,
      timeout: options.timeout ?? 300000,
      timeoutBehavior: options.timeoutBehavior ?? 'fail',
      lastError: null,
      resultPointer: null,
      retryStrategy: retryConfig,
      workerId: null,
      workerHeartbeat: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Emit a job event to all listeners
   */
  protected async emitEvent(
    type: JobEventType,
    job: Job,
    extra?: { error?: string; resultPointer?: string },
  ): Promise<void> {
    const event: JobEvent = {
      type,
      job,
      timestamp: new Date(),
      ...extra,
    };

    const promises = Array.from(this.listeners).map((listener) =>
      Promise.resolve(listener(event)).catch((err) => {
        console.error('Job event listener error:', err);
      }),
    );

    await Promise.allSettled(promises);
  }

  /**
   * Subscribe to job events
   */
  subscribe(listener: JobEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Build WHERE clause for filters
   */
  protected buildFilterWhere(filter: JobFilter): {
    where: string;
    params: unknown[];
  } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.queue) {
      conditions.push('queue = ?');
      params.push(filter.queue);
    }

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        const placeholders = filter.status.map(() => '?').join(', ');
        conditions.push(`status IN (${placeholders})`);
        params.push(...filter.status);
      } else {
        conditions.push('status = ?');
        params.push(filter.status);
      }
    }

    if (filter.objectType) {
      conditions.push("json_extract(payload, '$.objectType') = ?");
      params.push(filter.objectType);
    }

    if (filter.method) {
      conditions.push("json_extract(payload, '$.method') = ?");
      params.push(filter.method);
    }

    if (filter.createdAfter) {
      conditions.push('created_at > ?');
      params.push(filter.createdAfter.toISOString());
    }

    if (filter.createdBefore) {
      conditions.push('created_at < ?');
      params.push(filter.createdBefore.toISOString());
    }

    return {
      where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  /**
   * Build ORDER BY clause for filters
   *
   * Both halves are interpolated rather than bound, and `JobFilter`'s literal
   * types are erased at runtime, so both are resolved against an allowlist.
   *
   * @throws Error if the order direction is neither blank nor `asc`/`desc`
   */
  protected buildOrderBy(filter: JobFilter): string {
    const field = filter.orderBy ?? 'createdAt';
    const dir = filter.orderDir ?? 'desc';

    const fieldMap: Record<string, string> = {
      createdAt: 'created_at',
      runAt: 'run_at',
      priority: 'priority',
      attempts: 'attempts',
    };

    // `hasOwn`, not `fieldMap[field] ?? …`: a plain object literal inherits
    // from Object.prototype, so 'constructor' and friends resolve to a truthy
    // inherited value and never reach the fallback. The `typeof` conjunct
    // keeps the check and the read from coercing a non-string key twice — a
    // stateful `toString` could otherwise return a different key to each.
    const column =
      typeof field === 'string' && Object.hasOwn(fieldMap, field)
        ? fieldMap[field]
        : 'created_at';

    if (typeof dir !== 'string') {
      // Report the type, not the value: interpolating a symbol or a
      // null-prototype object would itself throw a TypeError.
      throw new Error(`Invalid job order direction: ${typeof dir}`);
    }

    // A blank direction — `?orderDir=` from an unfilled field — means
    // unspecified, not hostile; the `??` above only catches null/undefined.
    const trimmedDir = dir.trim();
    const normalizedDir = trimmedDir === '' ? 'DESC' : trimmedDir.toUpperCase();
    if (!VALID_DIRECTIONS.has(normalizedDir)) {
      // Quoted and bounded: the raw value reaches logs, where an unescaped
      // newline would let a caller forge a log line.
      throw new Error(
        `Invalid job order direction: ${JSON.stringify(trimmedDir.slice(0, 32))}`,
      );
    }

    return `ORDER BY ${column} ${normalizedDir}`;
  }

  /**
   * Build LIMIT/OFFSET clause
   */
  protected buildLimitOffset(filter: JobFilter): {
    clause: string;
    params: unknown[];
  } {
    const params: unknown[] = [];
    let clause = '';

    if (filter.limit) {
      clause = 'LIMIT ?';
      params.push(filter.limit);

      if (filter.offset) {
        clause += ' OFFSET ?';
        params.push(filter.offset);
      }
    }

    return { clause, params };
  }

  /**
   * Parse a job row from the database
   */
  protected parseJobRow(row: Record<string, unknown>): Job {
    return {
      id: row.id as string,
      queue: row.queue as string,
      payload:
        typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      status: row.status as Job['status'],
      priority: row.priority as number,
      attempts: row.attempts as number,
      maxAttempts: row.max_attempts as number,
      runAt: new Date(row.run_at as string),
      startedAt: row.started_at ? new Date(row.started_at as string) : null,
      completedAt: row.completed_at
        ? new Date(row.completed_at as string)
        : null,
      timeout: row.timeout as number,
      timeoutBehavior: row.timeout_behavior as Job['timeoutBehavior'],
      lastError: row.last_error as string | null,
      resultPointer: row.result_pointer as string | null,
      retryStrategy:
        typeof row.retry_strategy === 'string'
          ? JSON.parse(row.retry_strategy)
          : row.retry_strategy,
      workerId: row.worker_id as string | null,
      workerHeartbeat: row.worker_heartbeat
        ? new Date(row.worker_heartbeat as string)
        : null,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }

  // Abstract methods that must be implemented by subclasses
  abstract enqueue(options: JobCreateOptions): Promise<Job>;
  abstract dequeue(
    queues: string[],
    limit: number,
    workerId: string,
  ): Promise<Job[]>;
  abstract update(id: string, updates: Partial<Job>): Promise<Job>;
  abstract get(id: string): Promise<Job | null>;
  abstract list(filter: JobFilter): Promise<Job[]>;
  abstract cancel(id: string): Promise<void>;
  abstract cleanup(options: CleanupOptions): Promise<number>;
  abstract heartbeat(jobId: string, workerId: string): Promise<void>;
  abstract stats(queue?: string): Promise<QueueStats>;
  abstract close(): Promise<void>;
}
