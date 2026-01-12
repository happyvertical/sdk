/**
 * Bull (Redis) Job Store Adapter
 *
 * Uses Bull queue library for Redis-based job storage with real-time updates.
 * Bull provides robust job processing with features like priority queues,
 * delayed jobs, retries, and job events.
 *
 * @example
 * ```typescript
 * import { BullJobStore } from '@happyvertical/jobs/adapters/bull';
 *
 * const store = new BullJobStore({
 *   redis: {
 *     host: 'localhost',
 *     port: 6379,
 *   },
 *   defaultJobOptions: {
 *     removeOnComplete: 100,
 *     removeOnFail: 500,
 *   },
 * });
 *
 * await store.initialize();
 * ```
 *
 * Note: This adapter requires the `bull` package as a peer dependency.
 * Install it with: npm install bull @types/bull
 */

import { createId } from '@happyvertical/utils';
import type {
  Job as BullJob,
  JobOptions as BullJobOptions,
  Queue as BullQueue,
} from 'bull';
import { BaseJobStore, priorityToNumber } from '../base-store.js';
import type {
  CleanupOptions,
  Job,
  JobCreateOptions,
  JobFilter,
  QueueStats,
} from '../types.js';

/**
 * Redis connection options
 */
export interface RedisOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  url?: string;
}

/**
 * Bull adapter configuration
 */
export interface BullJobStoreConfig {
  /** Redis connection options */
  redis?: RedisOptions;
  /** Default queue name prefix */
  prefix?: string;
  /** Default job options */
  defaultJobOptions?: BullJobOptions;
}

/**
 * Job data stored in Bull
 */
interface BullJobData {
  /** Original job payload */
  payload: Job['payload'];
  /** Additional metadata */
  meta: {
    maxAttempts: number;
    timeout: number;
    timeoutBehavior: Job['timeoutBehavior'];
    retryStrategy: Job['retryStrategy'];
    workerId: string | null;
  };
}

/**
 * Bull-based job store implementation
 */
export class BullJobStore extends BaseJobStore {
  private config: BullJobStoreConfig;
  private queues: Map<string, BullQueue<BullJobData>> = new Map();
  // biome-ignore lint/style/useNamingConvention: bull module reference
  private bullModule: typeof import('bull') | null = null;

  constructor(config: BullJobStoreConfig = {}) {
    super();
    this.config = {
      prefix: 'smrt_jobs',
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
      },
      ...config,
    };
  }

  /**
   * Initialize the store - dynamically imports Bull
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import to avoid requiring bull as a hard dependency
      this.bullModule = (await import('bull')).default;
    } catch {
      throw new Error(
        'Bull is required for BullJobStore. Install it with: npm install bull',
      );
    }

    this.initialized = true;
  }

  /**
   * Get or create a Bull queue for a queue name
   */
  private getQueue(queueName: string): BullQueue<BullJobData> {
    if (!this.bullModule) {
      throw new Error('BullJobStore not initialized');
    }

    if (!this.queues.has(queueName)) {
      const queue = new this.bullModule<BullJobData>(queueName, {
        redis: this.config.redis,
        prefix: this.config.prefix,
        defaultJobOptions: this.config.defaultJobOptions,
      });

      // Set up event listeners
      queue.on('completed', (bullJob) => {
        this.handleJobCompleted(bullJob, queueName);
      });

      queue.on('failed', (bullJob, error) => {
        this.handleJobFailed(bullJob, error, queueName);
      });

      this.queues.set(queueName, queue);
    }

    const result = this.queues.get(queueName);
    if (!result) {
      throw new Error(`Queue ${queueName} was not found after initialization`);
    }
    return result;
  }

  /**
   * Handle Bull job completed event
   */
  private async handleJobCompleted(
    bullJob: BullJob<BullJobData>,
    queueName: string,
  ): Promise<void> {
    const job = this.bullJobToJob(bullJob, queueName);
    await this.emitEvent('job.completed', job);
  }

  /**
   * Handle Bull job failed event
   */
  private async handleJobFailed(
    bullJob: BullJob<BullJobData>,
    error: Error,
    queueName: string,
  ): Promise<void> {
    const job = this.bullJobToJob(bullJob, queueName);
    job.lastError = error.message;
    await this.emitEvent('job.failed', job, { error: error.message });
  }

  /**
   * Convert Bull job to our Job format
   */
  private bullJobToJob(bullJob: BullJob<BullJobData>, queueName: string): Job {
    const data = bullJob.data;
    const status = this.mapBullStatus(bullJob);

    return {
      id: String(bullJob.id),
      queue: queueName,
      payload: data.payload,
      status,
      priority: bullJob.opts.priority ?? 50,
      attempts: bullJob.attemptsMade,
      maxAttempts: data.meta.maxAttempts,
      runAt: bullJob.opts.delay
        ? new Date(bullJob.timestamp + bullJob.opts.delay)
        : new Date(bullJob.timestamp),
      startedAt: bullJob.processedOn ? new Date(bullJob.processedOn) : null,
      completedAt: bullJob.finishedOn ? new Date(bullJob.finishedOn) : null,
      timeout: data.meta.timeout,
      timeoutBehavior: data.meta.timeoutBehavior,
      lastError: bullJob.failedReason ?? null,
      resultPointer: bullJob.returnvalue?.resultPointer ?? null,
      retryStrategy: data.meta.retryStrategy,
      workerId: data.meta.workerId,
      workerHeartbeat: null,
      createdAt: new Date(bullJob.timestamp),
      updatedAt: new Date(),
    };
  }

  /**
   * Map Bull job state to our JobStatus
   */
  private mapBullStatus(bullJob: BullJob<BullJobData>): Job['status'] {
    // Bull doesn't expose state directly, so we check various properties
    if (bullJob.finishedOn) {
      return bullJob.failedReason ? 'failed' : 'completed';
    }
    if (bullJob.processedOn) {
      return 'running';
    }
    return 'pending';
  }

  /**
   * Enqueue a new job
   */
  async enqueue(options: JobCreateOptions): Promise<Job> {
    if (!this.initialized) {
      throw new Error('BullJobStore not initialized');
    }

    const queueName = options.queue ?? 'default';
    const queue = this.getQueue(queueName);

    const jobData: BullJobData = {
      payload: options.payload,
      meta: {
        maxAttempts: options.maxAttempts ?? 3,
        timeout: options.timeout ?? 300000,
        timeoutBehavior: options.timeoutBehavior ?? 'fail',
        retryStrategy:
          options.retryStrategy && 'toConfig' in options.retryStrategy
            ? options.retryStrategy.toConfig()
            : ((options.retryStrategy as Job['retryStrategy']) ?? {
                type: 'exponential',
                config: { initialDelay: 1000, multiplier: 2 },
              }),
        workerId: null,
      },
    };

    const bullJobOptions: BullJobOptions = {
      priority: priorityToNumber(options.priority),
      attempts: options.maxAttempts ?? 3,
      timeout: options.timeout ?? 300000,
      delay: options.runAt
        ? Math.max(0, options.runAt.getTime() - Date.now())
        : undefined,
      jobId: createId(),
    };

    const bullJob = await queue.add(jobData, bullJobOptions);
    const job = this.bullJobToJob(bullJob, queueName);

    await this.emitEvent('job.created', job);
    return job;
  }

  /**
   * Dequeue jobs ready for processing
   */
  async dequeue(
    queues: string[],
    limit: number,
    workerId: string,
  ): Promise<Job[]> {
    if (!this.initialized) {
      throw new Error('BullJobStore not initialized');
    }

    // Bull handles job claiming internally through its processor
    // This method is primarily for compatibility with the interface
    // In Bull, you would use queue.process() instead

    const jobs: Job[] = [];

    for (const queueName of queues) {
      if (jobs.length >= limit) break;

      const queue = this.getQueue(queueName);
      const waiting = await queue.getWaiting(0, limit - jobs.length - 1);

      for (const bullJob of waiting) {
        // Update worker ID
        bullJob.data.meta.workerId = workerId;
        await bullJob.update(bullJob.data);

        jobs.push(this.bullJobToJob(bullJob, queueName));
      }
    }

    return jobs;
  }

  /**
   * Update a job
   */
  async update(id: string, updates: Partial<Job>): Promise<Job> {
    if (!this.initialized) {
      throw new Error('BullJobStore not initialized');
    }

    // Find the job across queues
    for (const [queueName, queue] of this.queues) {
      const bullJob = await queue.getJob(id);
      if (bullJob) {
        // Update the job data
        if (updates.payload) {
          bullJob.data.payload = updates.payload;
        }
        if (updates.maxAttempts !== undefined) {
          bullJob.data.meta.maxAttempts = updates.maxAttempts;
        }
        if (updates.timeout !== undefined) {
          bullJob.data.meta.timeout = updates.timeout;
        }
        if (updates.workerId !== undefined) {
          bullJob.data.meta.workerId = updates.workerId;
        }

        await bullJob.update(bullJob.data);
        return this.bullJobToJob(bullJob, queueName);
      }
    }

    throw new Error(`Job ${id} not found`);
  }

  /**
   * Get a job by ID
   */
  async get(id: string): Promise<Job | null> {
    if (!this.initialized) {
      throw new Error('BullJobStore not initialized');
    }

    // Search across all queues
    for (const [queueName, queue] of this.queues) {
      const bullJob = await queue.getJob(id);
      if (bullJob) {
        return this.bullJobToJob(bullJob, queueName);
      }
    }

    return null;
  }

  /**
   * List jobs with filtering
   */
  async list(filter: JobFilter): Promise<Job[]> {
    if (!this.initialized) {
      throw new Error('BullJobStore not initialized');
    }

    const jobs: Job[] = [];
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;

    const targetQueues = filter.queue
      ? [this.getQueue(filter.queue)]
      : Array.from(this.queues.values());

    for (const queue of targetQueues) {
      const queueName =
        Array.from(this.queues.entries()).find(([, q]) => q === queue)?.[0] ??
        'unknown';

      // Get jobs by status
      const statuses = filter.status
        ? Array.isArray(filter.status)
          ? filter.status
          : [filter.status]
        : ['pending', 'running', 'completed', 'failed'];

      for (const status of statuses) {
        let bullJobs: BullJob<BullJobData>[] = [];

        switch (status) {
          case 'pending':
            bullJobs = await queue.getWaiting(offset, offset + limit - 1);
            break;
          case 'running':
            bullJobs = await queue.getActive(offset, offset + limit - 1);
            break;
          case 'completed':
            bullJobs = await queue.getCompleted(offset, offset + limit - 1);
            break;
          case 'failed':
            bullJobs = await queue.getFailed(offset, offset + limit - 1);
            break;
        }

        for (const bullJob of bullJobs) {
          const job = this.bullJobToJob(bullJob, queueName);

          // Apply additional filters
          if (filter.objectType && job.payload.objectType !== filter.objectType)
            continue;
          if (filter.method && job.payload.method !== filter.method) continue;
          if (filter.createdAfter && job.createdAt < filter.createdAfter)
            continue;
          if (filter.createdBefore && job.createdAt > filter.createdBefore)
            continue;

          jobs.push(job);

          if (jobs.length >= limit) break;
        }

        if (jobs.length >= limit) break;
      }
    }

    return jobs.slice(0, limit);
  }

  /**
   * Cancel a job
   */
  async cancel(id: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('BullJobStore not initialized');
    }

    for (const [queueName, queue] of this.queues) {
      const bullJob = await queue.getJob(id);
      if (bullJob) {
        await bullJob.remove();
        const job = this.bullJobToJob(bullJob, queueName);
        job.status = 'cancelled';
        await this.emitEvent('job.cancelled', job);
        return;
      }
    }

    throw new Error(`Job ${id} not found`);
  }

  /**
   * Clean up old jobs
   */
  async cleanup(options: CleanupOptions): Promise<number> {
    if (!this.initialized) {
      throw new Error('BullJobStore not initialized');
    }

    let cleaned = 0;

    for (const queue of this.queues.values()) {
      if (options.completedBefore) {
        const grace = Date.now() - options.completedBefore.getTime();
        const result = await queue.clean(grace, 'completed', options.limit);
        cleaned += result.length;
      }

      if (options.failedBefore) {
        const grace = Date.now() - options.failedBefore.getTime();
        const result = await queue.clean(grace, 'failed', options.limit);
        cleaned += result.length;
      }
    }

    return cleaned;
  }

  /**
   * Update worker heartbeat (no-op for Bull - handled internally)
   */
  async heartbeat(_jobId: string, _workerId: string): Promise<void> {
    // Bull handles heartbeat/stalled job detection internally
  }

  /**
   * Get queue statistics
   */
  async stats(queue?: string): Promise<QueueStats> {
    if (!this.initialized) {
      throw new Error('BullJobStore not initialized');
    }

    const totals: QueueStats = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      avgDuration: null,
    };

    const targetQueues = queue
      ? [this.getQueue(queue)]
      : Array.from(this.queues.values());

    for (const q of targetQueues) {
      const counts = await q.getJobCounts();
      totals.pending += counts.waiting + counts.delayed;
      totals.running += counts.active;
      totals.completed += counts.completed;
      totals.failed += counts.failed;
    }

    return totals;
  }

  /**
   * Close all queues
   */
  async close(): Promise<void> {
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    this.queues.clear();
    this.initialized = false;
  }
}

/**
 * Create a Bull job store instance
 */
export function createBullJobStore(config?: BullJobStoreConfig): BullJobStore {
  return new BullJobStore(config);
}

export default BullJobStore;
