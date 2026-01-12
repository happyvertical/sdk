import { type DatabaseInterface, getDatabase } from '@happyvertical/sql';
import { BaseJobStore } from '../base-store.js';
import type {
  CleanupOptions,
  Job,
  JobCreateOptions,
  JobEventListener,
  JobFilter,
  QueueStats,
} from '../types.js';

/**
 * PostgreSQL job store configuration
 */
export interface PostgresJobStoreConfig {
  /** Database connection URL */
  url?: string;
  /** Existing database instance to use */
  db?: DatabaseInterface;
  /** Table name for jobs (default: '_jobs') */
  tableName?: string;
  /** Enable NOTIFY/LISTEN for push-based job retrieval */
  enableNotify?: boolean;
  /** Channel name for notifications (default: 'job_events') */
  notifyChannel?: string;
}

/**
 * PostgreSQL-based job store with NOTIFY/LISTEN support
 *
 * Uses PostgreSQL for job persistence with optional push-based
 * notifications via NOTIFY/LISTEN for efficient job retrieval.
 */
export class PostgresJobStore extends BaseJobStore {
  private db: DatabaseInterface | null = null;
  private readonly url: string;
  private readonly externalDb: DatabaseInterface | null;
  private readonly tableName: string;
  private readonly enableNotify: boolean;
  private readonly notifyChannel: string;
  private notifyListeners: Set<JobEventListener> = new Set();
  private listening = false;

  constructor(config: PostgresJobStoreConfig = {}) {
    super();
    this.url = config.url ?? process.env.DATABASE_URL ?? '';
    this.externalDb = config.db ?? null;
    this.tableName = config.tableName ?? '_jobs';
    this.enableNotify = config.enableNotify ?? true;
    this.notifyChannel = config.notifyChannel ?? 'job_events';
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Use existing database or create new one
    this.db =
      this.externalDb ??
      (await getDatabase({ type: 'postgres', url: this.url }));

    // Create jobs table using raw query
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        queue TEXT NOT NULL DEFAULT 'default',
        payload JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        priority INTEGER NOT NULL DEFAULT 50,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        run_at TIMESTAMPTZ NOT NULL,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        timeout INTEGER NOT NULL DEFAULT 300000,
        timeout_behavior TEXT NOT NULL DEFAULT 'fail',
        last_error TEXT,
        result_pointer TEXT,
        retry_strategy JSONB NOT NULL,
        worker_id TEXT,
        worker_heartbeat TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `);

    // Create indexes
    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_dequeue
      ON ${this.tableName} (status, queue, run_at, priority DESC)
      WHERE status = 'pending'
    `);

    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_created_at
      ON ${this.tableName} (created_at)
    `);

    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_queue
      ON ${this.tableName} (queue)
    `);

    // Create notify functions and triggers if enabled
    if (this.enableNotify) {
      await this.setupNotifyTriggers();
    }

    this.initialized = true;
  }

  private async setupNotifyTriggers(): Promise<void> {
    if (!this.db) return;

    // Create notify function for job creation
    await this.db.query(`
      CREATE OR REPLACE FUNCTION ${this.tableName}_notify_created()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM pg_notify('${this.notifyChannel}', json_build_object(
          'event', 'created',
          'id', NEW.id,
          'queue', NEW.queue,
          'priority', NEW.priority,
          'run_at', NEW.run_at
        )::text);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Create trigger for inserts
    await this.db.query(
      `DROP TRIGGER IF EXISTS ${this.tableName}_created_trigger ON ${this.tableName}`,
    );
    await this.db.query(`
      CREATE TRIGGER ${this.tableName}_created_trigger
      AFTER INSERT ON ${this.tableName}
      FOR EACH ROW EXECUTE FUNCTION ${this.tableName}_notify_created()
    `);

    // Create notify function for job ready (when run_at passes)
    await this.db.query(`
      CREATE OR REPLACE FUNCTION ${this.tableName}_notify_ready()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.status = 'pending' AND NEW.run_at <= NOW() AND
           (OLD.run_at > NOW() OR OLD IS NULL) THEN
          PERFORM pg_notify('${this.notifyChannel}', json_build_object(
            'event', 'ready',
            'id', NEW.id,
            'queue', NEW.queue,
            'priority', NEW.priority
          )::text);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Create trigger for updates
    await this.db.query(
      `DROP TRIGGER IF EXISTS ${this.tableName}_ready_trigger ON ${this.tableName}`,
    );
    await this.db.query(`
      CREATE TRIGGER ${this.tableName}_ready_trigger
      AFTER UPDATE ON ${this.tableName}
      FOR EACH ROW EXECUTE FUNCTION ${this.tableName}_notify_ready()
    `);
  }

  /**
   * Start listening for PostgreSQL notifications
   * This enables push-based job retrieval
   */
  async startListening(): Promise<void> {
    if (!this.db || !this.enableNotify || this.listening) return;

    // Note: This requires the underlying pg client to support LISTEN
    // The @happyvertical/sql package may need to expose this functionality
    try {
      await this.db.query(`LISTEN ${this.notifyChannel}`);
      this.listening = true;
    } catch (error) {
      console.warn('Could not start LISTEN, falling back to polling:', error);
    }
  }

  async stopListening(): Promise<void> {
    if (!this.db || !this.listening) return;

    try {
      await this.db.query(`UNLISTEN ${this.notifyChannel}`);
      this.listening = false;
    } catch (error) {
      // Ignore errors when stopping
    }
  }

  async enqueue(options: JobCreateOptions): Promise<Job> {
    if (!this.db) throw new Error('Store not initialized');

    const job = this.createJobRecord(options);

    await this.db.insert(this.tableName, {
      id: job.id,
      queue: job.queue,
      payload: JSON.stringify(job.payload),
      status: job.status,
      priority: job.priority,
      attempts: job.attempts,
      max_attempts: job.maxAttempts,
      run_at: job.runAt.toISOString(),
      started_at: job.startedAt?.toISOString() ?? null,
      completed_at: job.completedAt?.toISOString() ?? null,
      timeout: job.timeout,
      timeout_behavior: job.timeoutBehavior,
      last_error: job.lastError,
      result_pointer: job.resultPointer,
      retry_strategy: JSON.stringify(job.retryStrategy),
      worker_id: job.workerId,
      worker_heartbeat: job.workerHeartbeat?.toISOString() ?? null,
      created_at: job.createdAt.toISOString(),
      updated_at: job.updatedAt.toISOString(),
    });

    await this.emitEvent('job.created', job);

    if (job.runAt <= new Date()) {
      await this.emitEvent('job.ready', job);
    }

    return job;
  }

  async dequeue(
    queues: string[],
    limit: number,
    workerId: string,
  ): Promise<Job[]> {
    if (!this.db) throw new Error('Store not initialized');

    const now = new Date().toISOString();

    // Use FOR UPDATE SKIP LOCKED for concurrent-safe dequeue
    // Build PostgreSQL parameterized query
    const queuePlaceholders = queues.map((_, i) => `$${i + 1}`).join(', ');

    const { rows } = await this.db.query(
      `
      UPDATE ${this.tableName}
      SET status = 'running',
          worker_id = $${queues.length + 1},
          worker_heartbeat = $${queues.length + 2},
          started_at = $${queues.length + 2},
          attempts = attempts + 1,
          updated_at = $${queues.length + 2}
      WHERE id IN (
        SELECT id FROM ${this.tableName}
        WHERE status = 'pending'
          AND queue IN (${queuePlaceholders})
          AND run_at <= $${queues.length + 2}
        ORDER BY priority DESC, run_at ASC
        LIMIT $${queues.length + 3}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `,
      [...queues, workerId, now, limit],
    );

    const jobs = rows.map((row) =>
      this.parseJobRow(row as Record<string, unknown>),
    );

    for (const job of jobs) {
      await this.emitEvent('job.started', job);
    }

    return jobs;
  }

  async update(id: string, updates: Partial<Job>): Promise<Job> {
    if (!this.db) throw new Error('Store not initialized');

    const setClause: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      queue: 'queue',
      payload: 'payload',
      status: 'status',
      priority: 'priority',
      attempts: 'attempts',
      maxAttempts: 'max_attempts',
      runAt: 'run_at',
      startedAt: 'started_at',
      completedAt: 'completed_at',
      timeout: 'timeout',
      timeoutBehavior: 'timeout_behavior',
      lastError: 'last_error',
      resultPointer: 'result_pointer',
      retryStrategy: 'retry_strategy',
      workerId: 'worker_id',
      workerHeartbeat: 'worker_heartbeat',
    };

    for (const [key, value] of Object.entries(updates)) {
      const column = fieldMap[key];
      if (!column) continue;

      setClause.push(`${column} = $${paramIndex}`);

      if (value instanceof Date) {
        params.push(value.toISOString());
      } else if (typeof value === 'object' && value !== null) {
        params.push(JSON.stringify(value));
      } else {
        params.push(value);
      }
      paramIndex++;
    }

    if (setClause.length === 0) {
      const job = await this.get(id);
      if (!job) throw new Error(`Job not found: ${id}`);
      return job;
    }

    setClause.push(`updated_at = $${paramIndex}`);
    params.push(new Date().toISOString());
    paramIndex++;

    params.push(id);

    await this.db.query(
      `UPDATE ${this.tableName} SET ${setClause.join(', ')} WHERE id = $${paramIndex}`,
      params,
    );

    const job = await this.get(id);
    if (!job) throw new Error(`Job not found after update: ${id}`);

    if (updates.status === 'completed') {
      await this.emitEvent('job.completed', job, {
        resultPointer: job.resultPointer ?? undefined,
      });
    } else if (updates.status === 'failed') {
      await this.emitEvent('job.failed', job, {
        error: job.lastError ?? undefined,
      });
    } else if (updates.status === 'cancelled') {
      await this.emitEvent('job.cancelled', job);
    }

    return job;
  }

  async get(id: string): Promise<Job | null> {
    if (!this.db) throw new Error('Store not initialized');

    const row = await this.db.get(this.tableName, { id });
    if (!row) return null;

    return this.parseJobRow(row as Record<string, unknown>);
  }

  async list(filter: JobFilter): Promise<Job[]> {
    if (!this.db) throw new Error('Store not initialized');

    // Build query with PostgreSQL parameter syntax
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filter.queue) {
      conditions.push(`queue = $${paramIndex++}`);
      params.push(filter.queue);
    }

    if (filter.status) {
      if (Array.isArray(filter.status)) {
        const placeholders = filter.status
          .map(() => `$${paramIndex++}`)
          .join(', ');
        conditions.push(`status IN (${placeholders})`);
        params.push(...filter.status);
      } else {
        conditions.push(`status = $${paramIndex++}`);
        params.push(filter.status);
      }
    }

    if (filter.objectType) {
      conditions.push(`payload->>'objectType' = $${paramIndex++}`);
      params.push(filter.objectType);
    }

    if (filter.method) {
      conditions.push(`payload->>'method' = $${paramIndex++}`);
      params.push(filter.method);
    }

    if (filter.createdAfter) {
      conditions.push(`created_at > $${paramIndex++}`);
      params.push(filter.createdAfter.toISOString());
    }

    if (filter.createdBefore) {
      conditions.push(`created_at < $${paramIndex++}`);
      params.push(filter.createdBefore.toISOString());
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = this.buildOrderBy(filter);

    let limitOffset = '';
    if (filter.limit) {
      limitOffset = `LIMIT $${paramIndex++}`;
      params.push(filter.limit);

      if (filter.offset) {
        limitOffset += ` OFFSET $${paramIndex++}`;
        params.push(filter.offset);
      }
    }

    const { rows } = await this.db.query(
      `SELECT * FROM ${this.tableName} ${where} ${orderBy} ${limitOffset}`,
      params,
    );

    return rows.map((row) => this.parseJobRow(row as Record<string, unknown>));
  }

  async cancel(id: string): Promise<void> {
    if (!this.db) throw new Error('Store not initialized');

    const job = await this.get(id);
    if (!job) throw new Error(`Job not found: ${id}`);

    if (job.status === 'completed' || job.status === 'cancelled') {
      throw new Error(`Cannot cancel job with status: ${job.status}`);
    }

    await this.update(id, {
      status: 'cancelled',
      completedAt: new Date(),
    });
  }

  async cleanup(options: CleanupOptions): Promise<number> {
    if (!this.db) throw new Error('Store not initialized');

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (options.completedBefore) {
      conditions.push(
        `(status = 'completed' AND completed_at < $${paramIndex++})`,
      );
      params.push(options.completedBefore.toISOString());
    }

    if (options.failedBefore) {
      conditions.push(
        `(status = 'failed' AND completed_at < $${paramIndex++})`,
      );
      params.push(options.failedBefore.toISOString());
    }

    if (options.cancelledBefore) {
      conditions.push(
        `(status = 'cancelled' AND completed_at < $${paramIndex++})`,
      );
      params.push(options.cancelledBefore.toISOString());
    }

    if (conditions.length === 0) return 0;

    let query = `DELETE FROM ${this.tableName} WHERE (${conditions.join(' OR ')})`;

    if (options.limit) {
      query = `
        DELETE FROM ${this.tableName}
        WHERE id IN (
          SELECT id FROM ${this.tableName}
          WHERE (${conditions.join(' OR ')})
          LIMIT $${paramIndex}
        )
      `;
      params.push(options.limit);
    }

    const result = await this.db.query(query, params);

    return result.rowCount ?? 0;
  }

  async heartbeat(jobId: string, workerId: string): Promise<void> {
    if (!this.db) throw new Error('Store not initialized');

    const now = new Date().toISOString();
    await this.db.query(
      `
      UPDATE ${this.tableName}
      SET worker_heartbeat = $1, updated_at = $1
      WHERE id = $2 AND worker_id = $3 AND status = 'running'
    `,
      [now, jobId, workerId],
    );
  }

  async stats(queue?: string): Promise<QueueStats> {
    if (!this.db) throw new Error('Store not initialized');

    const params: unknown[] = [];
    let paramIndex = 1;
    const queueFilter = queue ? `WHERE queue = $${paramIndex++}` : '';
    if (queue) params.push(queue);

    const { rows: countRows } = await this.db.query(
      `
      SELECT status, COUNT(*)::int as count
      FROM ${this.tableName}
      ${queueFilter}
      GROUP BY status
    `,
      params,
    );

    const counts: Record<string, number> = {};
    for (const row of countRows) {
      counts[row.status as string] = row.count as number;
    }

    const { rows: durationRows } = await this.db.query(
      `
      SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000)::float as avg_duration
      FROM ${this.tableName}
      WHERE status = 'completed'
        AND started_at IS NOT NULL
        AND completed_at IS NOT NULL
        ${queue ? `AND queue = $1` : ''}
    `,
      queue ? [queue] : [],
    );

    const avgDuration =
      (durationRows[0] as { avg_duration: number | null })?.avg_duration ??
      null;

    return {
      pending: counts['pending'] ?? 0,
      running: counts['running'] ?? 0,
      completed: counts['completed'] ?? 0,
      failed: counts['failed'] ?? 0,
      cancelled: counts['cancelled'] ?? 0,
      avgDuration: avgDuration ? Math.round(avgDuration) : null,
    };
  }

  async close(): Promise<void> {
    await this.stopListening();
    // The SDK's DatabaseInterface doesn't have a close method
    this.db = null;
    this.initialized = false;
  }
}

export default PostgresJobStore;
