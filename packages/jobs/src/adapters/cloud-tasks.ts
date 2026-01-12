/**
 * Google Cloud Tasks Job Store Adapter
 *
 * Uses Google Cloud Tasks for serverless job execution with HTTP triggers.
 * Cloud Tasks provides automatic retries, scheduling, and rate limiting.
 *
 * @example
 * ```typescript
 * import { CloudTasksJobStore } from '@happyvertical/jobs/adapters/cloud-tasks';
 *
 * const store = new CloudTasksJobStore({
 *   projectId: 'my-project',
 *   location: 'us-central1',
 *   queuePrefix: 'myapp-',
 *   handlerUrl: 'https://myapp.run.app/jobs/handle',
 * });
 *
 * await store.initialize();
 * ```
 *
 * Note: This adapter requires `@google-cloud/tasks` as a peer dependency.
 * Install it with: npm install @google-cloud/tasks
 *
 * Important: Cloud Tasks is designed for HTTP-based job execution.
 * Jobs are sent to your handler URL when scheduled to run.
 */

import type { CloudTasksClient as CloudTasksClientType } from '@google-cloud/tasks';
import { createId } from '@happyvertical/utils';
import { BaseJobStore, priorityToNumber } from '../base-store.js';
import type {
  CleanupOptions,
  Job,
  JobCreateOptions,
  JobFilter,
  QueueStats,
} from '../types.js';

/**
 * Cloud Tasks adapter configuration
 */
export interface CloudTasksJobStoreConfig {
  /** GCP project ID */
  projectId: string;
  /** GCP location (e.g., 'us-central1') */
  location: string;
  /** Queue name prefix */
  queuePrefix?: string;
  /** HTTP handler URL for job execution */
  handlerUrl: string;
  /** Service account email for OIDC authentication */
  serviceAccountEmail?: string;
  /** Default retry configuration */
  defaultRetry?: {
    maxAttempts?: number;
    minBackoff?: string;
    maxBackoff?: string;
  };
}

/**
 * Job data sent to handler
 */
interface CloudTaskJobData {
  id: string;
  queue: string;
  payload: Job['payload'];
  priority: number;
  maxAttempts: number;
  timeout: number;
  timeoutBehavior: Job['timeoutBehavior'];
  retryStrategy: Job['retryStrategy'];
  createdAt: string;
}

/**
 * In-memory job state tracking
 */
interface JobState {
  job: Job;
  taskName?: string;
}

/**
 * Cloud Tasks-based job store implementation
 *
 * Note: Cloud Tasks operates differently from traditional job queues:
 * - Jobs are HTTP tasks sent to your handler URL
 * - No pull-based dequeue (Cloud Tasks pushes to your handler)
 * - Updates are limited (tasks can be deleted but not modified)
 */
export class CloudTasksJobStore extends BaseJobStore {
  private config: CloudTasksJobStoreConfig;
  private client: CloudTasksClientType | null = null;
  // biome-ignore lint/style/useNamingConvention: Google Cloud Tasks module reference
  private cloudTasksModule: typeof import('@google-cloud/tasks') | null = null;
  private jobStates: Map<string, JobState> = new Map();

  constructor(config: CloudTasksJobStoreConfig) {
    super();
    this.config = {
      queuePrefix: '',
      defaultRetry: {
        maxAttempts: 3,
        minBackoff: '1s',
        maxBackoff: '300s',
      },
      ...config,
    };
  }

  /**
   * Initialize the store - dynamically imports Google Cloud Tasks
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import to avoid requiring Cloud Tasks as a hard dependency
      this.cloudTasksModule = await import('@google-cloud/tasks');
    } catch {
      throw new Error(
        'Google Cloud Tasks is required for CloudTasksJobStore. ' +
          'Install it with: npm install @google-cloud/tasks',
      );
    }

    this.client = new this.cloudTasksModule.CloudTasksClient();
    this.initialized = true;
  }

  /**
   * Get the full queue path
   */
  private getQueuePath(queueName: string): string {
    return `projects/${this.config.projectId}/locations/${this.config.location}/queues/${this.config.queuePrefix}${queueName}`;
  }

  /**
   * Get the full task path
   */
  private getTaskPath(queueName: string, taskId: string): string {
    return `${this.getQueuePath(queueName)}/tasks/${taskId}`;
  }

  /**
   * Enqueue a new job
   */
  async enqueue(options: JobCreateOptions): Promise<Job> {
    if (!this.initialized || !this.client) {
      throw new Error('CloudTasksJobStore not initialized');
    }

    const queueName = options.queue ?? 'default';
    const now = new Date();
    const jobId = createId();

    const jobData: CloudTaskJobData = {
      id: jobId,
      queue: queueName,
      payload: options.payload,
      priority: priorityToNumber(options.priority),
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
      createdAt: now.toISOString(),
    };

    const task: Parameters<typeof this.client.createTask>[0]['task'] = {
      name: this.getTaskPath(queueName, jobId),
      httpRequest: {
        httpMethod: 'POST',
        url: this.config.handlerUrl,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify(jobData)).toString('base64'),
      },
    };

    // Add OIDC authentication if service account is configured
    if (this.config.serviceAccountEmail) {
      task.httpRequest!.oidcToken = {
        serviceAccountEmail: this.config.serviceAccountEmail,
      };
    }

    // Set schedule time for delayed jobs
    if (options.runAt && options.runAt > now) {
      task.scheduleTime = {
        seconds: Math.floor(options.runAt.getTime() / 1000),
        nanos: (options.runAt.getTime() % 1000) * 1000000,
      };
    }

    // Set dispatch deadline (timeout)
    if (options.timeout) {
      task.dispatchDeadline = {
        seconds: Math.floor(options.timeout / 1000),
        nanos: (options.timeout % 1000) * 1000000,
      };
    }

    const [response] = await this.client.createTask({
      parent: this.getQueuePath(queueName),
      task,
    });

    const job: Job = {
      id: jobId,
      queue: queueName,
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
      retryStrategy: jobData.retryStrategy,
      workerId: null,
      workerHeartbeat: null,
      createdAt: now,
      updatedAt: now,
    };

    // Store job state
    this.jobStates.set(jobId, {
      job,
      taskName: response.name ?? undefined,
    });

    await this.emitEvent('job.created', job);
    return job;
  }

  /**
   * Dequeue jobs - NOT SUPPORTED in Cloud Tasks
   * Cloud Tasks is push-based; jobs are delivered to your handler URL
   */
  async dequeue(
    _queues: string[],
    _limit: number,
    _workerId: string,
  ): Promise<Job[]> {
    throw new Error(
      'Cloud Tasks does not support pull-based dequeue. ' +
        'Jobs are pushed to your handler URL. ' +
        'Use the HTTP handler to receive jobs.',
    );
  }

  /**
   * Update a job - LIMITED SUPPORT in Cloud Tasks
   */
  async update(_id: string, _updates: Partial<Job>): Promise<Job> {
    throw new Error(
      'Cloud Tasks does not support updating tasks after creation. ' +
        'Cancel and recreate the job instead.',
    );
  }

  /**
   * Get a job by ID
   */
  async get(id: string): Promise<Job | null> {
    // Check in-memory state first
    const state = this.jobStates.get(id);
    if (state) {
      return state.job;
    }

    // Cloud Tasks doesn't support getting task details easily after creation
    return null;
  }

  /**
   * List jobs with filtering
   * Note: Only returns jobs from in-memory state
   */
  async list(filter: JobFilter): Promise<Job[]> {
    const jobs: Job[] = [];
    const limit = filter.limit ?? 100;

    for (const state of this.jobStates.values()) {
      const job = state.job;

      // Apply filters
      if (filter.queue && job.queue !== filter.queue) continue;
      if (filter.status) {
        const statuses = Array.isArray(filter.status)
          ? filter.status
          : [filter.status];
        if (!statuses.includes(job.status)) continue;
      }
      if (filter.objectType && job.payload.objectType !== filter.objectType)
        continue;
      if (filter.method && job.payload.method !== filter.method) continue;
      if (filter.createdAfter && job.createdAt < filter.createdAfter) continue;
      if (filter.createdBefore && job.createdAt > filter.createdBefore)
        continue;

      jobs.push(job);
      if (jobs.length >= limit) break;
    }

    return jobs;
  }

  /**
   * Cancel a job by deleting its Cloud Task
   */
  async cancel(id: string): Promise<void> {
    if (!this.initialized || !this.client) {
      throw new Error('CloudTasksJobStore not initialized');
    }

    const state = this.jobStates.get(id);
    if (!state || !state.taskName) {
      throw new Error(`Job ${id} not found`);
    }

    try {
      await this.client.deleteTask({ name: state.taskName });
    } catch (error: unknown) {
      // Task may already be executed or deleted
      const err = error as { code?: number };
      if (err.code !== 5) {
        // NOT_FOUND
        throw error;
      }
    }

    state.job.status = 'cancelled';
    state.job.completedAt = new Date();

    await this.emitEvent('job.cancelled', state.job);
  }

  /**
   * Mark job as started (called by your handler when it receives the job)
   */
  async markStarted(id: string, workerId: string): Promise<void> {
    const state = this.jobStates.get(id);
    if (!state) {
      throw new Error(`Job ${id} not found`);
    }

    state.job.status = 'running';
    state.job.workerId = workerId;
    state.job.startedAt = new Date();
    state.job.attempts++;

    await this.emitEvent('job.started', state.job);
  }

  /**
   * Mark job as completed (called by your handler after successful execution)
   */
  async markCompleted(id: string, resultPointer?: string): Promise<void> {
    const state = this.jobStates.get(id);
    if (!state) {
      throw new Error(`Job ${id} not found`);
    }

    state.job.status = 'completed';
    state.job.completedAt = new Date();
    state.job.resultPointer = resultPointer ?? null;

    await this.emitEvent('job.completed', state.job, { resultPointer });
  }

  /**
   * Mark job as failed (called by your handler after failed execution)
   */
  async markFailed(id: string, error: string): Promise<void> {
    const state = this.jobStates.get(id);
    if (!state) {
      throw new Error(`Job ${id} not found`);
    }

    state.job.status = 'failed';
    state.job.completedAt = new Date();
    state.job.lastError = error;

    await this.emitEvent('job.failed', state.job, { error });
  }

  /**
   * Clean up old jobs from in-memory state
   */
  async cleanup(options: CleanupOptions): Promise<number> {
    let cleaned = 0;

    for (const [id, state] of this.jobStates) {
      const { job } = state;

      if (
        options.completedBefore &&
        job.status === 'completed' &&
        job.completedAt &&
        job.completedAt < options.completedBefore
      ) {
        this.jobStates.delete(id);
        cleaned++;
        continue;
      }

      if (
        options.failedBefore &&
        job.status === 'failed' &&
        job.completedAt &&
        job.completedAt < options.failedBefore
      ) {
        this.jobStates.delete(id);
        cleaned++;
        continue;
      }

      if (
        options.cancelledBefore &&
        job.status === 'cancelled' &&
        job.completedAt &&
        job.completedAt < options.cancelledBefore
      ) {
        this.jobStates.delete(id);
        cleaned++;
        continue;
      }

      if (options.limit && cleaned >= options.limit) break;
    }

    return cleaned;
  }

  /**
   * Update worker heartbeat - stored in memory only
   */
  async heartbeat(jobId: string, _workerId: string): Promise<void> {
    const state = this.jobStates.get(jobId);
    if (state) {
      state.job.workerHeartbeat = new Date();
    }
  }

  /**
   * Get queue statistics from in-memory state
   */
  async stats(queue?: string): Promise<QueueStats> {
    const totals: QueueStats = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      avgDuration: null,
    };

    for (const state of this.jobStates.values()) {
      if (queue && state.job.queue !== queue) continue;

      switch (state.job.status) {
        case 'pending':
          totals.pending++;
          break;
        case 'running':
          totals.running++;
          break;
        case 'completed':
          totals.completed++;
          break;
        case 'failed':
          totals.failed++;
          break;
        case 'cancelled':
          totals.cancelled++;
          break;
      }
    }

    return totals;
  }

  /**
   * Close the Cloud Tasks client
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.jobStates.clear();
    this.initialized = false;
  }
}

/**
 * Create a Cloud Tasks job store instance
 */
export function createCloudTasksJobStore(
  config: CloudTasksJobStoreConfig,
): CloudTasksJobStore {
  return new CloudTasksJobStore(config);
}

export default CloudTasksJobStore;
