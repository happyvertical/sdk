/**
 * Job status enum
 */
export type JobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Timeout behavior when a job exceeds its timeout
 */
export type TimeoutBehavior = 'fail' | 'kill' | 'warn';

/**
 * Priority levels for jobs
 */
export type JobPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Retry strategy configuration
 */
export interface RetryStrategyConfig {
  type: 'exponential' | 'linear' | 'custom';
  config: Record<string, unknown>;
}

/**
 * Result of a retry strategy calculation
 */
export interface RetryDecision {
  shouldRetry: boolean;
  delay: number;
}

/**
 * Retry strategy interface
 */
export interface RetryStrategy {
  /**
   * Determine whether to retry and how long to wait
   * @param attempt Current attempt number (1-based)
   * @param error The error that caused the failure
   */
  shouldRetry(attempt: number, error: Error): RetryDecision;

  /**
   * Serialize the strategy for storage
   */
  toConfig(): RetryStrategyConfig;
}

/**
 * Job payload - what work to execute
 */
export interface JobPayload {
  /** The type of object (e.g., 'Document', 'Agent') */
  objectType: string;
  /** Instance ID (null for singleton/static methods) */
  objectId: string | null;
  /** Method name to execute */
  method: string;
  /** Arguments to pass to the method */
  args: Record<string, unknown>;
}

/**
 * Core job interface
 */
export interface Job {
  /** Unique job identifier */
  id: string;
  /** Queue name this job belongs to */
  queue: string;
  /** The work to execute */
  payload: JobPayload;
  /** Current job status */
  status: JobStatus;
  /** Priority (higher = more important) */
  priority: number;
  /** Number of execution attempts */
  attempts: number;
  /** Maximum attempts before giving up */
  maxAttempts: number;
  /** When to run the job (for delayed jobs) */
  runAt: Date;
  /** When the job started executing */
  startedAt: Date | null;
  /** When the job completed/failed */
  completedAt: Date | null;
  /** Timeout in milliseconds */
  timeout: number;
  /** What to do when timeout is exceeded */
  timeoutBehavior: TimeoutBehavior;
  /** Last error message if failed */
  lastError: string | null;
  /** URI pointer to result storage */
  resultPointer: string | null;
  /** Retry strategy configuration */
  retryStrategy: RetryStrategyConfig;
  /** Worker ID currently processing this job */
  workerId: string | null;
  /** Last heartbeat from worker */
  workerHeartbeat: Date | null;
  /** When the job was created */
  createdAt: Date;
  /** When the job was last updated */
  updatedAt: Date;
}

/**
 * Options for creating a new job
 */
export interface JobCreateOptions {
  /** Queue name (default: 'default') */
  queue?: string;
  /** Job payload */
  payload: JobPayload;
  /** Priority level or number */
  priority?: JobPriority | number;
  /** When to run (default: now) */
  runAt?: Date;
  /** Maximum attempts (default: 3) */
  maxAttempts?: number;
  /** Timeout in ms (default: 300000) */
  timeout?: number;
  /** Timeout behavior (default: 'fail') */
  timeoutBehavior?: TimeoutBehavior;
  /** Retry strategy */
  retryStrategy?: RetryStrategy | RetryStrategyConfig;
}

/**
 * Filter options for listing jobs
 */
export interface JobFilter {
  /** Filter by queue */
  queue?: string;
  /** Filter by status */
  status?: JobStatus | JobStatus[];
  /** Filter by object type */
  objectType?: string;
  /** Filter by method */
  method?: string;
  /** Jobs created after this date */
  createdAfter?: Date;
  /** Jobs created before this date */
  createdBefore?: Date;
  /** Maximum number of jobs to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Order by field */
  orderBy?: 'createdAt' | 'runAt' | 'priority' | 'attempts';
  /** Order direction */
  orderDir?: 'asc' | 'desc';
}

/**
 * Options for job cleanup
 */
export interface CleanupOptions {
  /** Delete completed jobs older than this */
  completedBefore?: Date;
  /** Delete failed jobs older than this */
  failedBefore?: Date;
  /** Delete cancelled jobs older than this */
  cancelledBefore?: Date;
  /** Maximum jobs to delete in one operation */
  limit?: number;
}

/**
 * Job event types
 */
export type JobEventType =
  | 'job.created'
  | 'job.ready'
  | 'job.started'
  | 'job.completed'
  | 'job.failed'
  | 'job.cancelled'
  | 'job.retrying';

/**
 * Job event payload
 */
export interface JobEvent {
  type: JobEventType;
  job: Job;
  timestamp: Date;
  /** Error details for failed events */
  error?: string;
  /** Result pointer for completed events */
  resultPointer?: string;
}

/**
 * Job event listener callback
 */
export type JobEventListener = (event: JobEvent) => void | Promise<void>;

/**
 * Unsubscribe function returned by subscribe
 */
export type Unsubscribe = () => void;

/**
 * Job handle returned from enqueue operations
 */
export interface JobHandle {
  /** Job ID */
  id: string;
  /** Get current job status */
  status(): Promise<JobStatus>;
  /** Get full job details */
  get(): Promise<Job | null>;
  /** Wait for job completion */
  wait(options?: { timeout?: number }): Promise<unknown>;
  /** Cancel the job */
  cancel(): Promise<void>;
}

/**
 * Abstract job store interface that adapters implement
 */
export interface JobStore {
  /**
   * Initialize the store (create tables, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Enqueue a new job
   */
  enqueue(options: JobCreateOptions): Promise<Job>;

  /**
   * Dequeue jobs ready for processing
   * @param queues Queue names to dequeue from (in priority order)
   * @param limit Maximum jobs to dequeue
   * @param workerId Worker ID claiming the jobs
   */
  dequeue(queues: string[], limit: number, workerId: string): Promise<Job[]>;

  /**
   * Update a job
   */
  update(id: string, updates: Partial<Job>): Promise<Job>;

  /**
   * Get a job by ID
   */
  get(id: string): Promise<Job | null>;

  /**
   * List jobs with filtering
   */
  list(filter: JobFilter): Promise<Job[]>;

  /**
   * Cancel a job
   */
  cancel(id: string): Promise<void>;

  /**
   * Clean up old jobs
   */
  cleanup(options: CleanupOptions): Promise<number>;

  /**
   * Subscribe to job events
   */
  subscribe(listener: JobEventListener): Unsubscribe;

  /**
   * Wait for a store-level update signal, if the adapter supports one.
   * Adapters without push notifications may omit this and rely on polling.
   */
  waitForUpdate?(timeoutMs?: number): Promise<boolean>;

  /**
   * Update worker heartbeat for a job
   */
  heartbeat(jobId: string, workerId: string): Promise<void>;

  /**
   * Get queue statistics
   */
  stats(queue?: string): Promise<QueueStats>;

  /**
   * Close the store and release resources
   */
  close(): Promise<void>;
}

/**
 * Queue statistics
 */
export interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  avgDuration: number | null;
}

/**
 * Worker configuration
 */
export interface WorkerConfig {
  /** Unique worker ID */
  id?: string;
  /** Number of concurrent jobs */
  concurrency?: number;
  /** Queues to process (in priority order) */
  queues?: string[];
  /** Poll interval for non-push stores (ms) */
  pollInterval?: number;
  /** Heartbeat interval (ms) */
  heartbeatInterval?: number;
  /** Shutdown timeout (ms) */
  shutdownTimeout?: number;
}

/**
 * Job handler function
 */
export type JobHandler = (
  job: Job,
) => Promise<{ result?: unknown; resultPointer?: string }>;

/**
 * Worker interface
 */
export interface Worker {
  /** Worker ID */
  id: string;
  /** Start processing jobs */
  start(): Promise<void>;
  /** Stop processing jobs (graceful shutdown) */
  stop(): Promise<void>;
  /** Check if worker is running */
  isRunning(): boolean;
  /** Register event listener */
  on(event: string, listener: (...args: unknown[]) => void): void;
  /** Remove event listener */
  off(event: string, listener: (...args: unknown[]) => void): void;
}
