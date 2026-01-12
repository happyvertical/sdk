import { EventEmitter } from 'node:events';
import { createId } from '@happyvertical/utils';
import { fromConfig } from './retry.js';
import type {
  Worker as IWorker,
  Job,
  JobHandler,
  JobStore,
  WorkerConfig,
} from './types.js';

/**
 * Worker events
 */
export interface WorkerEvents {
  'job:started': (job: Job) => void;
  'job:completed': (job: Job, result: unknown) => void;
  'job:failed': (job: Job, error: Error) => void;
  'job:retrying': (job: Job, error: Error, delay: number) => void;
  'worker:started': () => void;
  'worker:stopped': () => void;
  'worker:error': (error: Error) => void;
}

/**
 * Default worker configuration
 */
const DEFAULT_CONFIG: Required<WorkerConfig> = {
  id: '',
  concurrency: 5,
  queues: ['default'],
  pollInterval: 1000,
  heartbeatInterval: 30000,
  shutdownTimeout: 30000,
};

/**
 * Job worker that processes jobs from a store
 */
export class JobWorker extends EventEmitter implements IWorker {
  readonly id: string;
  private readonly store: JobStore;
  private readonly handler: JobHandler;
  private readonly config: Required<WorkerConfig>;
  private running = false;
  private activeJobs = new Map<string, Job>();
  private pollTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private shutdownPromise: Promise<void> | null = null;

  constructor(store: JobStore, handler: JobHandler, config: WorkerConfig = {}) {
    super();
    this.store = store;
    this.handler = handler;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      id: config.id || `worker_${createId().slice(0, 8)}`,
    };
    this.id = this.config.id;
  }

  /**
   * Start processing jobs
   */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;

    // Subscribe to store events for push-based notifications
    this.store.subscribe(async (event) => {
      if (event.type === 'job.ready' && this.running) {
        // Immediately try to dequeue when a job becomes ready
        await this.poll();
      }
    });

    // Start polling loop
    this.startPolling();

    // Start heartbeat loop
    this.startHeartbeat();

    this.emit('worker:started');
  }

  /**
   * Stop processing jobs (graceful shutdown)
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    if (this.shutdownPromise) return this.shutdownPromise;

    this.running = false;

    // Stop timers
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Wait for active jobs to complete (with timeout)
    this.shutdownPromise = this.waitForActiveJobs();

    try {
      await this.shutdownPromise;
    } finally {
      this.shutdownPromise = null;
      this.emit('worker:stopped');
    }
  }

  /**
   * Check if worker is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get count of active jobs
   */
  activeJobCount(): number {
    return this.activeJobs.size;
  }

  /**
   * Start the polling loop
   */
  private startPolling(): void {
    const poll = async () => {
      if (!this.running) return;

      try {
        await this.poll();
      } catch (error) {
        this.emit('worker:error', error as Error);
      }

      // Schedule next poll
      if (this.running) {
        this.pollTimer = setTimeout(poll, this.config.pollInterval);
      }
    };

    // Start immediately
    poll();
  }

  /**
   * Poll for and process jobs
   */
  private async poll(): Promise<void> {
    // Calculate how many jobs we can take
    const available = this.config.concurrency - this.activeJobs.size;
    if (available <= 0) return;

    // Dequeue jobs
    const jobs = await this.store.dequeue(
      this.config.queues,
      available,
      this.id,
    );

    // Process each job concurrently
    for (const job of jobs) {
      this.processJob(job);
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job): Promise<void> {
    this.activeJobs.set(job.id, job);
    this.emit('job:started', job);

    try {
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Job timeout after ${job.timeout}ms`));
        }, job.timeout);
      });

      // Execute handler with timeout
      const result = await Promise.race([this.handler(job), timeoutPromise]);

      // Job completed successfully
      await this.store.update(job.id, {
        status: 'completed',
        completedAt: new Date(),
        resultPointer: result.resultPointer ?? null,
      });

      this.emit('job:completed', job, result.result);
    } catch (error) {
      await this.handleJobError(job, error as Error);
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Handle job execution error
   */
  private async handleJobError(job: Job, error: Error): Promise<void> {
    const strategy = fromConfig(job.retryStrategy);
    const decision = strategy.shouldRetry(job.attempts, error);

    if (decision.shouldRetry && job.attempts < job.maxAttempts) {
      // Schedule retry
      const nextRunAt = new Date(Date.now() + decision.delay);

      await this.store.update(job.id, {
        status: 'pending',
        lastError: error.message,
        runAt: nextRunAt,
        workerId: null,
        workerHeartbeat: null,
      });

      this.emit('job:retrying', job, error, decision.delay);
    } else {
      // Job failed permanently
      await this.store.update(job.id, {
        status: 'failed',
        completedAt: new Date(),
        lastError: error.message,
      });

      this.emit('job:failed', job, error);
    }
  }

  /**
   * Start heartbeat loop to keep jobs alive
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      for (const [jobId] of this.activeJobs) {
        try {
          await this.store.heartbeat(jobId, this.id);
        } catch (error) {
          // Ignore heartbeat errors
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Wait for active jobs to complete with timeout
   */
  private async waitForActiveJobs(): Promise<void> {
    if (this.activeJobs.size === 0) return;

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.activeJobs.size === 0) {
          clearInterval(checkInterval);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);

      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        console.warn(
          `Shutdown timeout: ${this.activeJobs.size} jobs still active`,
        );
        resolve();
      }, this.config.shutdownTimeout);
    });
  }
}

/**
 * Create a job worker
 */
export function createWorker(
  store: JobStore,
  handler: JobHandler,
  config?: WorkerConfig,
): JobWorker {
  return new JobWorker(store, handler, config);
}
