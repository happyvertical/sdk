import {
  type DatabaseInterface,
  getDatabase,
  type SqliteCapabilitiesOptions,
  syncSchema,
} from '@happyvertical/sql';
import { BaseJobStore, validateTableName } from '../base-store.js';
import type {
  CleanupOptions,
  Job,
  JobCreateOptions,
  JobFilter,
  QueueStats,
} from '../types.js';

/**
 * SQLite job store configuration
 */
export interface SqliteJobStoreConfig {
  /** Database URL or path (default: ':memory:') */
  url?: string;
  /** Existing database instance to use */
  db?: DatabaseInterface;
  /** Table name for jobs (default: '_jobs') */
  tableName?: string;
  /** Optional SQLite native capabilities for development/test modes */
  capabilities?: SqliteCapabilitiesOptions;
}

/**
 * SQLite-based job store
 *
 * Uses SQLite for job persistence. Supports polling-based job retrieval.
 * Good for single-instance deployments or development.
 */
export class SqliteJobStore extends BaseJobStore {
  private db: DatabaseInterface | null = null;
  private readonly url: string;
  private readonly externalDb: DatabaseInterface | null;
  private readonly tableName: string;
  private readonly capabilities: SqliteCapabilitiesOptions | undefined;

  constructor(config: SqliteJobStoreConfig = {}) {
    super();
    this.url = config.url ?? ':memory:';
    this.externalDb = config.db ?? null;
    this.tableName = validateTableName(config.tableName ?? '_jobs');
    this.capabilities = config.capabilities;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Use existing database or create new one
    this.db =
      this.externalDb ??
      (await getDatabase({
        type: 'sqlite',
        url: this.url,
        capabilities: this.capabilities,
      }));

    // Create jobs table and indexes using syncSchema
    const schema = `
      CREATE TABLE IF NOT EXISTS "${this.tableName}" (
        id TEXT PRIMARY KEY,
        queue TEXT NOT NULL DEFAULT 'default',
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        priority INTEGER NOT NULL DEFAULT 50,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        run_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        timeout INTEGER NOT NULL DEFAULT 300000,
        timeout_behavior TEXT NOT NULL DEFAULT 'fail',
        last_error TEXT,
        result_pointer TEXT,
        retry_strategy TEXT NOT NULL,
        worker_id TEXT,
        worker_heartbeat TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS "idx_${this.tableName}_status_queue" ON "${this.tableName}" (status, queue, run_at, priority DESC);
      CREATE INDEX IF NOT EXISTS "idx_${this.tableName}_created_at" ON "${this.tableName}" (created_at);
      CREATE INDEX IF NOT EXISTS "idx_${this.tableName}_queue" ON "${this.tableName}" (queue);
    `;

    await syncSchema({ db: this.db, schema });

    this.initialized = true;
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

    // Also emit ready if job should run immediately
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
    const queuePlaceholders = queues.map(() => '?').join(', ');

    // Find jobs ready to process
    const { rows } = await this.db.query(
      `
      SELECT * FROM ${this.tableName}
      WHERE status = 'pending'
        AND queue IN (${queuePlaceholders})
        AND run_at <= ?
      ORDER BY priority DESC, run_at ASC
      LIMIT ?
    `,
      [...queues, now, limit],
    );

    if (!rows.length) return [];

    // Claim the jobs by updating their status
    const jobIds = rows.map((r) => r.id as string);
    const idPlaceholders = jobIds.map(() => '?').join(', ');

    await this.db.query(
      `
      UPDATE ${this.tableName}
      SET status = 'running',
          worker_id = ?,
          worker_heartbeat = ?,
          started_at = ?,
          attempts = attempts + 1,
          updated_at = ?
      WHERE id IN (${idPlaceholders})
        AND status = 'pending'
    `,
      [workerId, now, now, now, ...jobIds],
    );

    // Return the claimed jobs
    const jobs = rows.map((row) => {
      const job = this.parseJobRow(row as Record<string, unknown>);
      job.status = 'running';
      job.workerId = workerId;
      job.workerHeartbeat = new Date();
      job.startedAt = new Date();
      job.attempts += 1;
      return job;
    });

    // Emit started events
    for (const job of jobs) {
      await this.emitEvent('job.started', job);
    }

    return jobs;
  }

  async update(id: string, updates: Partial<Job>): Promise<Job> {
    if (!this.db) throw new Error('Store not initialized');

    const setClause: string[] = [];
    const params: unknown[] = [];

    // Map Job fields to database columns
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

      setClause.push(`${column} = ?`);

      if (value instanceof Date) {
        params.push(value.toISOString());
      } else if (typeof value === 'object' && value !== null) {
        params.push(JSON.stringify(value));
      } else {
        params.push(value);
      }
    }

    if (setClause.length === 0) {
      const job = await this.get(id);
      if (!job) throw new Error(`Job not found: ${id}`);
      return job;
    }

    // Always update updated_at
    setClause.push('updated_at = ?');
    params.push(new Date().toISOString());

    params.push(id);

    await this.db.query(
      `UPDATE ${this.tableName} SET ${setClause.join(', ')} WHERE id = ?`,
      params,
    );

    const job = await this.get(id);
    if (!job) throw new Error(`Job not found after update: ${id}`);

    // Emit events based on status changes
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

    const { where, params: whereParams } = this.buildFilterWhere(filter);
    const orderBy = this.buildOrderBy(filter);
    const { clause: limitOffset, params: limitParams } =
      this.buildLimitOffset(filter);

    const { rows } = await this.db.query(
      `SELECT * FROM ${this.tableName} ${where} ${orderBy} ${limitOffset}`,
      [...whereParams, ...limitParams],
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

    if (options.completedBefore) {
      conditions.push("(status = 'completed' AND completed_at < ?)");
      params.push(options.completedBefore.toISOString());
    }

    if (options.failedBefore) {
      conditions.push("(status = 'failed' AND completed_at < ?)");
      params.push(options.failedBefore.toISOString());
    }

    if (options.cancelledBefore) {
      conditions.push("(status = 'cancelled' AND completed_at < ?)");
      params.push(options.cancelledBefore.toISOString());
    }

    if (conditions.length === 0) return 0;

    let query = `DELETE FROM ${this.tableName} WHERE (${conditions.join(' OR ')})`;

    if (options.limit) {
      // SQLite doesn't support LIMIT in DELETE directly, so we need a subquery
      query = `
        DELETE FROM ${this.tableName}
        WHERE id IN (
          SELECT id FROM ${this.tableName}
          WHERE (${conditions.join(' OR ')})
          LIMIT ?
        )
      `;
      params.push(options.limit);
    }

    const result = await this.db.query(query, params);

    return result.rowCount ?? 0;
  }

  async heartbeat(jobId: string, workerId: string): Promise<void> {
    if (!this.db) throw new Error('Store not initialized');

    await this.db.query(
      `
      UPDATE ${this.tableName}
      SET worker_heartbeat = ?, updated_at = ?
      WHERE id = ? AND worker_id = ? AND status = 'running'
    `,
      [new Date().toISOString(), new Date().toISOString(), jobId, workerId],
    );
  }

  async stats(queue?: string): Promise<QueueStats> {
    if (!this.db) throw new Error('Store not initialized');

    const queueFilter = queue ? 'WHERE queue = ?' : '';
    const params = queue ? [queue] : [];

    // Get status counts
    const { rows: countRows } = await this.db.query(
      `
      SELECT status, COUNT(*) as count
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

    // Get average duration for completed jobs
    const { rows: durationRows } = await this.db.query(
      `
      SELECT AVG(
        (julianday(completed_at) - julianday(started_at)) * 86400000
      ) as avg_duration
      FROM ${this.tableName}
      WHERE status = 'completed'
        AND started_at IS NOT NULL
        AND completed_at IS NOT NULL
        ${queue ? 'AND queue = ?' : ''}
    `,
      params,
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
    if (this.db && !this.externalDb) {
      await this.db.close?.();
    }
    this.db = null;
    this.initialized = false;
  }

  async waitForUpdate(timeoutMs?: number): Promise<boolean> {
    if (!this.db?.notifications) {
      if (timeoutMs && timeoutMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, timeoutMs));
      }
      return false;
    }

    return this.db.notifications.waitForUpdate({ timeoutMs });
  }
}

export default SqliteJobStore;
