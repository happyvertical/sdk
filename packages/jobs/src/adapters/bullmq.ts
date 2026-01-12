/**
 * BullMQ (Redis) Job Store Adapter
 *
 * Uses BullMQ library for Redis-based job storage with real-time updates.
 * BullMQ is the successor to Bull with improved performance and TypeScript support.
 *
 * @example
 * ```typescript
 * import { BullMQJobStore } from '@happyvertical/jobs/adapters/bullmq';
 *
 * const store = new BullMQJobStore({
 *   connection: {
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
 * Note: This adapter requires the `bullmq` package as a peer dependency.
 * Install it with: npm install bullmq
 */

import { createId } from '@happyvertical/utils';
import type {
  Job as BullMQJob,
  JobsOptions as BullMQJobOptions,
  Queue as BullMQQueue,
  QueueEvents as BullMQQueueEvents,
  ConnectionOptions,
} from 'bullmq';
import { BaseJobStore, priorityToNumber } from '../base-store.js';
import type {
  CleanupOptions,
  Job,
  JobCreateOptions,
  JobFilter,
  QueueStats,
} from '../types.js';

/**
 * BullMQ adapter configuration
 */
export interface BullMQJobStoreConfig {
  /** Redis connection options */
  connection?: ConnectionOptions;
  /** Default queue name prefix */
  prefix?: string;
  /** Default job options */
  defaultJobOptions?: BullMQJobOptions;
}

/**
 * Job data stored in BullMQ
 */
interface BullMQJobData {
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
 * Queue wrapper to hold queue and events
 */
interface QueueWrapper {
  queue: BullMQQueue<BullMQJobData>;
  events: BullMQQueueEvents;
}

/**
 * BullMQ-based job store implementation
 */
export class BullMQJobStore extends BaseJobStore {
  private config: BullMQJobStoreConfig;
  private queues: Map<string, QueueWrapper> = new Map();
  // biome-ignore lint/style/useNamingConvention: bullmq module reference
  private bullmqModule: typeof import('bullmq') | null = null;

  constructor(config: BullMQJobStoreConfig = {}) {
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
   * Initialize the store - dynamically imports BullMQ
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import to avoid requiring bullmq as a hard dependency
      this.bullmqModule = await import('bullmq');
    } catch {
      throw new Error(
        'BullMQ is required for BullMQJobStore. Install it with: npm install bullmq',
      );
    }

    this.initialized = true;
  }

  /**
   * Get or create a BullMQ queue for a queue name
   */
  private getQueueWrapper(queueName: string): QueueWrapper {
    if (!this.bullmqModule) {
      throw new Error('BullMQJobStore not initialized');
    }

    if (!this.queues.has(queueName)) {
      // Build options conditionally - BullMQ types require connection but it can be omitted for local Redis
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const queueOptions: any = {
        prefix: this.config.prefix,
        defaultJobOptions: this.config.defaultJobOptions,
      };
      if (this.config.connection) {
        queueOptions.connection = this.config.connection;
      }

      const queue = new this.bullmqModule.Queue<BullMQJobData>(
        queueName,
        queueOptions,
      ) as BullMQQueue<BullMQJobData>;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventsOptions: any = {
        prefix: this.config.prefix,
      };
      if (this.config.connection) {
        eventsOptions.connection = this.config.connection;
      }

      const events = new this.bullmqModule.QueueEvents(
        queueName,
        eventsOptions,
      );

      // Set up event listeners
      events.on('completed', async ({ jobId }) => {
        const job = await this.get(jobId);
        if (job) {
          await this.emitEvent('job.completed', job);
        }
      });

      events.on('failed', async ({ jobId, failedReason }) => {
        const job = await this.get(jobId);
        if (job) {
          job.lastError = failedReason;
          await this.emitEvent('job.failed', job, { error: failedReason });
        }
      });

      this.queues.set(queueName, { queue, events });
    }

    return this.queues.get(queueName)!;
  }

  /**
   * Convert BullMQ job to our Job format
   */
  private async bullMQJobToJob(
    bullMQJob: BullMQJob<BullMQJobData>,
    queueName: string,
  ): Promise<Job> {
    const data = bullMQJob.data;
    const state = await bullMQJob.getState();
    const status = this.mapBullMQStatus(state);

    return {
      id: bullMQJob.id ?? createId(),
      queue: queueName,
      payload: data.payload,
      status,
      priority: bullMQJob.opts.priority ?? 50,
      attempts: bullMQJob.attemptsMade,
      maxAttempts: data.meta.maxAttempts,
      runAt: bullMQJob.opts.delay
        ? new Date(bullMQJob.timestamp + bullMQJob.opts.delay)
        : new Date(bullMQJob.timestamp),
      startedAt: bullMQJob.processedOn ? new Date(bullMQJob.processedOn) : null,
      completedAt: bullMQJob.finishedOn ? new Date(bullMQJob.finishedOn) : null,
      timeout: data.meta.timeout,
      timeoutBehavior: data.meta.timeoutBehavior,
      lastError: bullMQJob.failedReason ?? null,
      resultPointer: bullMQJob.returnvalue?.resultPointer ?? null,
      retryStrategy: data.meta.retryStrategy,
      workerId: data.meta.workerId,
      workerHeartbeat: null,
      createdAt: new Date(bullMQJob.timestamp),
      updatedAt: new Date(),
    };
  }

  /**
   * Map BullMQ job state to our JobStatus
   */
  private mapBullMQStatus(
    state:
      | 'completed'
      | 'failed'
      | 'delayed'
      | 'active'
      | 'waiting'
      | 'waiting-children'
      | 'prioritized'
      | 'unknown',
  ): Job['status'] {
    switch (state) {
      case 'completed':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'active':
        return 'running';
      case 'waiting':
      case 'delayed':
      case 'prioritized':
      case 'waiting-children':
      default:
        return 'pending';
    }
  }

  /**
   * Enqueue a new job
   */
  async enqueue(options: JobCreateOptions): Promise<Job> {
    if (!this.initialized) {
      throw new Error('BullMQJobStore not initialized');
    }

    const queueName = options.queue ?? 'default';
    const { queue } = this.getQueueWrapper(queueName);

    const jobData: BullMQJobData = {
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

    const bullMQJobOptions: BullMQJobOptions = {
      priority: priorityToNumber(options.priority),
      attempts: options.maxAttempts ?? 3,
      delay: options.runAt
        ? Math.max(0, options.runAt.getTime() - Date.now())
        : undefined,
      jobId: createId(),
    };

    const bullMQJob = await queue.add(
      options.payload.method,
      jobData,
      bullMQJobOptions,
    );
    const job = await this.bullMQJobToJob(bullMQJob, queueName);

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
      throw new Error('BullMQJobStore not initialized');
    }

    // BullMQ handles job claiming internally through its Worker
    // This method is primarily for compatibility with the interface

    const jobs: Job[] = [];

    for (const queueName of queues) {
      if (jobs.length >= limit) break;

      const { queue } = this.getQueueWrapper(queueName);
      const waiting = await queue.getWaiting(0, limit - jobs.length - 1);

      for (const bullMQJob of waiting) {
        // Update worker ID in job data
        bullMQJob.data.meta.workerId = workerId;
        await bullMQJob.updateData(bullMQJob.data);

        jobs.push(await this.bullMQJobToJob(bullMQJob, queueName));
      }
    }

    return jobs;
  }

  /**
   * Update a job
   */
  async update(id: string, updates: Partial<Job>): Promise<Job> {
    if (!this.initialized) {
      throw new Error('BullMQJobStore not initialized');
    }

    // Find the job across queues
    for (const [queueName, { queue }] of this.queues) {
      const bullMQJob = await queue.getJob(id);
      if (bullMQJob) {
        // Update the job data
        const newData = { ...bullMQJob.data };
        if (updates.payload) {
          newData.payload = updates.payload;
        }
        if (updates.maxAttempts !== undefined) {
          newData.meta.maxAttempts = updates.maxAttempts;
        }
        if (updates.timeout !== undefined) {
          newData.meta.timeout = updates.timeout;
        }
        if (updates.workerId !== undefined) {
          newData.meta.workerId = updates.workerId;
        }

        await bullMQJob.updateData(newData);
        return await this.bullMQJobToJob(bullMQJob, queueName);
      }
    }

    throw new Error(`Job ${id} not found`);
  }

  /**
   * Get a job by ID
   */
  async get(id: string): Promise<Job | null> {
    if (!this.initialized) {
      throw new Error('BullMQJobStore not initialized');
    }

    // Search across all queues
    for (const [queueName, { queue }] of this.queues) {
      const bullMQJob = await queue.getJob(id);
      if (bullMQJob) {
        return await this.bullMQJobToJob(bullMQJob, queueName);
      }
    }

    return null;
  }

  /**
   * List jobs with filtering
   */
  async list(filter: JobFilter): Promise<Job[]> {
    if (!this.initialized) {
      throw new Error('BullMQJobStore not initialized');
    }

    const jobs: Job[] = [];
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;

    const targetQueues = filter.queue
      ? [
          {
            name: filter.queue,
            wrapper: this.getQueueWrapper(filter.queue),
          },
        ]
      : Array.from(this.queues.entries()).map(([name, wrapper]) => ({
          name,
          wrapper,
        }));

    for (const { name, wrapper } of targetQueues) {
      const { queue } = wrapper;

      // Get jobs by status
      const statuses = filter.status
        ? Array.isArray(filter.status)
          ? filter.status
          : [filter.status]
        : ['pending', 'running', 'completed', 'failed'];

      for (const status of statuses) {
        let bullMQJobs: BullMQJob<BullMQJobData>[] = [];

        switch (status) {
          case 'pending':
            bullMQJobs = [
              ...(await queue.getWaiting(offset, offset + limit - 1)),
              ...(await queue.getDelayed(offset, offset + limit - 1)),
            ];
            break;
          case 'running':
            bullMQJobs = await queue.getActive(offset, offset + limit - 1);
            break;
          case 'completed':
            bullMQJobs = await queue.getCompleted(offset, offset + limit - 1);
            break;
          case 'failed':
            bullMQJobs = await queue.getFailed(offset, offset + limit - 1);
            break;
        }

        for (const bullMQJob of bullMQJobs) {
          const job = await this.bullMQJobToJob(bullMQJob, name);

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
      throw new Error('BullMQJobStore not initialized');
    }

    for (const [queueName, { queue }] of this.queues) {
      const bullMQJob = await queue.getJob(id);
      if (bullMQJob) {
        await bullMQJob.remove();
        const job = await this.bullMQJobToJob(bullMQJob, queueName);
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
      throw new Error('BullMQJobStore not initialized');
    }

    let cleaned = 0;

    for (const { queue } of this.queues.values()) {
      if (options.completedBefore) {
        const grace = Date.now() - options.completedBefore.getTime();
        const result = await queue.clean(
          grace,
          options.limit ?? 1000,
          'completed',
        );
        cleaned += result.length;
      }

      if (options.failedBefore) {
        const grace = Date.now() - options.failedBefore.getTime();
        const result = await queue.clean(
          grace,
          options.limit ?? 1000,
          'failed',
        );
        cleaned += result.length;
      }
    }

    return cleaned;
  }

  /**
   * Update worker heartbeat (no-op for BullMQ - handled internally)
   */
  async heartbeat(_jobId: string, _workerId: string): Promise<void> {
    // BullMQ handles heartbeat/stalled job detection internally
  }

  /**
   * Get queue statistics
   */
  async stats(queue?: string): Promise<QueueStats> {
    if (!this.initialized) {
      throw new Error('BullMQJobStore not initialized');
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
      ? [this.getQueueWrapper(queue).queue]
      : Array.from(this.queues.values()).map((w) => w.queue);

    for (const q of targetQueues) {
      const counts = await q.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );
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
    for (const { queue, events } of this.queues.values()) {
      await events.close();
      await queue.close();
    }
    this.queues.clear();
    this.initialized = false;
  }
}

/**
 * Create a BullMQ job store instance
 */
export function createBullMQJobStore(
  config?: BullMQJobStoreConfig,
): BullMQJobStore {
  return new BullMQJobStore(config);
}

export default BullMQJobStore;
