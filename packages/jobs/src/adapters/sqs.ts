/**
 * AWS SQS Job Store Adapter
 *
 * Uses AWS SQS for cloud-based job storage with automatic scaling.
 * SQS provides managed message queuing with features like
 * visibility timeout, dead letter queues, and FIFO ordering.
 *
 * @example
 * ```typescript
 * import { SQSJobStore } from '@happyvertical/jobs/adapters/sqs';
 *
 * const store = new SQSJobStore({
 *   region: 'us-east-1',
 *   queueUrlPrefix: 'https://sqs.us-east-1.amazonaws.com/123456789/myapp-',
 *   // Or use credentials explicitly
 *   credentials: {
 *     accessKeyId: 'AKIA...',
 *     secretAccessKey: '...',
 *   },
 * });
 *
 * await store.initialize();
 * ```
 *
 * Note: This adapter requires the `@aws-sdk/client-sqs` package as a peer dependency.
 * Install it with: npm install @aws-sdk/client-sqs
 *
 * Important: SQS has some limitations for job storage:
 * - Jobs cannot be updated after enqueue (SQS messages are immutable)
 * - Job listing is limited (SQS doesn't support efficient listing)
 * - Cleanup is automatic via message retention policy
 * - Use DynamoDB alongside SQS for full job tracking if needed
 */

import type { Message, SQSClient as SQSClientType } from '@aws-sdk/client-sqs';
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
 * AWS credentials configuration
 */
export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

/**
 * SQS adapter configuration
 */
export interface SQSJobStoreConfig {
  /** AWS region */
  region?: string;
  /** AWS credentials (optional - uses default chain if not provided) */
  credentials?: AWSCredentials;
  /** Queue URL prefix (queues will be named {prefix}{queueName}) */
  queueUrlPrefix: string;
  /** Default visibility timeout in seconds */
  visibilityTimeout?: number;
  /** Message retention in days (1-14, default: 4) */
  messageRetentionDays?: number;
  /** Use FIFO queues for ordering guarantees */
  useFifo?: boolean;
}

/**
 * Job data stored in SQS message body
 */
interface SQSJobData {
  id: string;
  queue: string;
  payload: Job['payload'];
  priority: number;
  maxAttempts: number;
  timeout: number;
  timeoutBehavior: Job['timeoutBehavior'];
  retryStrategy: Job['retryStrategy'];
  runAt: string;
  createdAt: string;
}

/**
 * In-memory job state tracking (SQS messages are immutable)
 */
interface JobState {
  job: Job;
  receiptHandle?: string;
}

/**
 * SQS-based job store implementation
 *
 * Note: SQS has limitations that make some operations different:
 * - `update()` throws error (messages are immutable)
 * - `list()` only returns pending jobs from SQS
 * - `cancel()` requires the job to have been dequeued first
 * - For full job tracking, consider using DynamoDB alongside SQS
 */
export class SQSJobStore extends BaseJobStore {
  private config: SQSJobStoreConfig;
  private client: SQSClientType | null = null;
  // biome-ignore lint/style/useNamingConvention: AWS SDK module reference
  private awsSdkModule: typeof import('@aws-sdk/client-sqs') | null = null;
  private queueUrls: Map<string, string> = new Map();
  // In-memory state tracking for jobs that have been dequeued
  private jobStates: Map<string, JobState> = new Map();

  constructor(config: SQSJobStoreConfig) {
    super();
    this.config = {
      visibilityTimeout: 300, // 5 minutes default
      messageRetentionDays: 4,
      useFifo: false,
      ...config,
    };
  }

  /**
   * Initialize the store - dynamically imports AWS SDK
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import to avoid requiring AWS SDK as a hard dependency
      this.awsSdkModule = await import('@aws-sdk/client-sqs');
    } catch {
      throw new Error(
        'AWS SDK is required for SQSJobStore. Install it with: npm install @aws-sdk/client-sqs',
      );
    }

    this.client = new this.awsSdkModule.SQSClient({
      region: this.config.region,
      credentials: this.config.credentials,
    });

    this.initialized = true;
  }

  /**
   * Get or create queue URL for a queue name
   */
  private getQueueUrl(queueName: string): string {
    if (!this.queueUrls.has(queueName)) {
      const suffix = this.config.useFifo ? '.fifo' : '';
      this.queueUrls.set(
        queueName,
        `${this.config.queueUrlPrefix}${queueName}${suffix}`,
      );
    }
    return this.queueUrls.get(queueName)!;
  }

  /**
   * Convert SQS message to Job format
   */
  private sqsMessageToJob(message: Message, queueName: string): Job | null {
    if (!message.Body) return null;

    try {
      const data: SQSJobData = JSON.parse(message.Body);
      const now = new Date();

      // Check if we have state for this job
      const state = this.jobStates.get(data.id);
      if (state) {
        // Update receipt handle
        state.receiptHandle = message.ReceiptHandle;
        return state.job;
      }

      const job: Job = {
        id: data.id,
        queue: queueName,
        payload: data.payload,
        status: 'pending',
        priority: data.priority,
        attempts: Number(message.Attributes?.ApproximateReceiveCount ?? 0),
        maxAttempts: data.maxAttempts,
        runAt: new Date(data.runAt),
        startedAt: null,
        completedAt: null,
        timeout: data.timeout,
        timeoutBehavior: data.timeoutBehavior,
        lastError: null,
        resultPointer: null,
        retryStrategy: data.retryStrategy,
        workerId: null,
        workerHeartbeat: null,
        createdAt: new Date(data.createdAt),
        updatedAt: now,
      };

      // Store state with receipt handle
      this.jobStates.set(data.id, {
        job,
        receiptHandle: message.ReceiptHandle,
      });

      return job;
    } catch {
      return null;
    }
  }

  /**
   * Enqueue a new job
   */
  async enqueue(options: JobCreateOptions): Promise<Job> {
    if (!this.initialized || !this.client || !this.awsSdkModule) {
      throw new Error('SQSJobStore not initialized');
    }

    const queueName = options.queue ?? 'default';
    const queueUrl = this.getQueueUrl(queueName);
    const now = new Date();
    const jobId = createId();

    const jobData: SQSJobData = {
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
      runAt: (options.runAt ?? now).toISOString(),
      createdAt: now.toISOString(),
    };

    const messageParams: import('@aws-sdk/client-sqs').SendMessageCommandInput =
      {
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(jobData),
        // Use delay for scheduled jobs (max 15 minutes in SQS)
        DelaySeconds: options.runAt
          ? Math.min(
              900,
              Math.max(
                0,
                Math.floor((options.runAt.getTime() - now.getTime()) / 1000),
              ),
            )
          : undefined,
      };

    // Add FIFO-specific parameters
    if (this.config.useFifo) {
      messageParams.MessageGroupId = queueName;
      messageParams.MessageDeduplicationId = jobId;
    }

    await this.client.send(
      new this.awsSdkModule.SendMessageCommand(messageParams),
    );

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
    this.jobStates.set(jobId, { job });

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
    if (!this.initialized || !this.client || !this.awsSdkModule) {
      throw new Error('SQSJobStore not initialized');
    }

    const jobs: Job[] = [];

    for (const queueName of queues) {
      if (jobs.length >= limit) break;

      const queueUrl = this.getQueueUrl(queueName);

      const result = await this.client.send(
        new this.awsSdkModule.ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: Math.min(10, limit - jobs.length), // SQS max is 10
          VisibilityTimeout: this.config.visibilityTimeout,
          MessageSystemAttributeNames: ['ApproximateReceiveCount'],
          WaitTimeSeconds: 0, // Short poll for compatibility
        }),
      );

      if (result.Messages) {
        for (const message of result.Messages) {
          const job = this.sqsMessageToJob(message, queueName);
          if (job) {
            job.status = 'running';
            job.workerId = workerId;
            job.startedAt = new Date();
            jobs.push(job);

            await this.emitEvent('job.started', job);
          }
        }
      }
    }

    return jobs;
  }

  /**
   * Update a job - NOT SUPPORTED in SQS (messages are immutable)
   */
  async update(_id: string, _updates: Partial<Job>): Promise<Job> {
    throw new Error(
      'SQS does not support updating jobs. Messages are immutable. ' +
        'Consider using DynamoDB alongside SQS for full job state tracking.',
    );
  }

  /**
   * Get a job by ID (from in-memory state only)
   */
  async get(id: string): Promise<Job | null> {
    const state = this.jobStates.get(id);
    return state?.job ?? null;
  }

  /**
   * List jobs with filtering
   * Note: SQS doesn't support efficient listing - this only returns in-memory state
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
   * Cancel a job by deleting its message from SQS
   */
  async cancel(id: string): Promise<void> {
    if (!this.initialized || !this.client || !this.awsSdkModule) {
      throw new Error('SQSJobStore not initialized');
    }

    const state = this.jobStates.get(id);
    if (!state) {
      throw new Error(`Job ${id} not found or not yet received from queue`);
    }

    if (!state.receiptHandle) {
      throw new Error(
        `Job ${id} has no receipt handle - cannot delete from SQS`,
      );
    }

    const queueUrl = this.getQueueUrl(state.job.queue);

    await this.client.send(
      new this.awsSdkModule.DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: state.receiptHandle,
      }),
    );

    state.job.status = 'cancelled';
    state.job.completedAt = new Date();

    await this.emitEvent('job.cancelled', state.job);
  }

  /**
   * Mark job as completed
   */
  async markCompleted(id: string, resultPointer?: string): Promise<void> {
    if (!this.initialized || !this.client || !this.awsSdkModule) {
      throw new Error('SQSJobStore not initialized');
    }

    const state = this.jobStates.get(id);
    if (!state || !state.receiptHandle) {
      throw new Error(`Job ${id} not found or has no receipt handle`);
    }

    const queueUrl = this.getQueueUrl(state.job.queue);

    // Delete message from queue (marks as processed)
    await this.client.send(
      new this.awsSdkModule.DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: state.receiptHandle,
      }),
    );

    state.job.status = 'completed';
    state.job.completedAt = new Date();
    state.job.resultPointer = resultPointer ?? null;

    await this.emitEvent('job.completed', state.job, { resultPointer });
  }

  /**
   * Mark job as failed
   */
  async markFailed(id: string, error: string): Promise<void> {
    const state = this.jobStates.get(id);
    if (!state) {
      throw new Error(`Job ${id} not found`);
    }

    state.job.status = 'failed';
    state.job.completedAt = new Date();
    state.job.lastError = error;

    // Message will become visible again after visibility timeout
    // or go to DLQ if configured

    await this.emitEvent('job.failed', state.job, { error });
  }

  /**
   * Clean up old jobs from in-memory state
   * Note: SQS handles message retention automatically
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
   * Update visibility timeout for a job (extends processing time)
   */
  async heartbeat(jobId: string, _workerId: string): Promise<void> {
    if (!this.initialized || !this.client || !this.awsSdkModule) {
      throw new Error('SQSJobStore not initialized');
    }

    const state = this.jobStates.get(jobId);
    if (!state || !state.receiptHandle) {
      return; // Job not found or no receipt handle
    }

    const queueUrl = this.getQueueUrl(state.job.queue);

    await this.client.send(
      new this.awsSdkModule.ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: state.receiptHandle,
        VisibilityTimeout: this.config.visibilityTimeout,
      }),
    );

    state.job.workerHeartbeat = new Date();
  }

  /**
   * Get queue statistics
   */
  async stats(queue?: string): Promise<QueueStats> {
    if (!this.initialized || !this.client || !this.awsSdkModule) {
      throw new Error('SQSJobStore not initialized');
    }

    const totals: QueueStats = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      avgDuration: null,
    };

    // Count from in-memory state
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
   * Close the SQS client
   */
  async close(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.jobStates.clear();
    this.queueUrls.clear();
    this.initialized = false;
  }
}

/**
 * Create an SQS job store instance
 */
export function createSQSJobStore(config: SQSJobStoreConfig): SQSJobStore {
  return new SQSJobStore(config);
}

export default SQSJobStore;
