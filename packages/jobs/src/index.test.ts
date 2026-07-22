import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createWorker,
  custom,
  exponential,
  type Job,
  type JobStore,
  linear,
  noRetry,
  SqliteJobStore,
} from './index.js';

describe('@happyvertical/jobs', () => {
  describe('Retry Strategies', () => {
    describe('exponential', () => {
      it('should calculate exponential delays', () => {
        const strategy = exponential({
          initialDelay: 1000,
          multiplier: 2,
          jitter: false,
        });

        const r1 = strategy.shouldRetry(1, new Error('test'));
        expect(r1.shouldRetry).toBe(true);
        expect(r1.delay).toBe(1000); // 1000 * 2^0

        const r2 = strategy.shouldRetry(2, new Error('test'));
        expect(r2.shouldRetry).toBe(true);
        expect(r2.delay).toBe(2000); // 1000 * 2^1

        const r3 = strategy.shouldRetry(3, new Error('test'));
        expect(r3.shouldRetry).toBe(true);
        expect(r3.delay).toBe(4000); // 1000 * 2^2
      });

      it('should respect maxDelay', () => {
        const strategy = exponential({
          initialDelay: 1000,
          maxDelay: 5000,
          multiplier: 10,
          jitter: false,
        });

        const result = strategy.shouldRetry(3, new Error('test'));
        expect(result.delay).toBe(5000);
      });

      it('should respect maxAttempts', () => {
        const strategy = exponential({
          initialDelay: 1000,
          maxAttempts: 3,
          jitter: false,
        });

        const r2 = strategy.shouldRetry(2, new Error('test'));
        expect(r2.shouldRetry).toBe(true);

        const r3 = strategy.shouldRetry(3, new Error('test'));
        expect(r3.shouldRetry).toBe(false);
      });

      it('should serialize to config', () => {
        const strategy = exponential({
          initialDelay: 1000,
          maxDelay: 60000,
          multiplier: 2,
          jitter: true,
        });

        const config = strategy.toConfig();
        expect(config.type).toBe('exponential');
        expect(config.config).toEqual({
          initialDelay: 1000,
          maxDelay: 60000,
          multiplier: 2,
          jitter: true,
          maxAttempts: null,
        });
      });
    });

    describe('linear', () => {
      it('should return fixed delay', () => {
        const strategy = linear({ delay: 5000 });

        const r1 = strategy.shouldRetry(1, new Error('test'));
        expect(r1.shouldRetry).toBe(true);
        expect(r1.delay).toBe(5000);

        const r5 = strategy.shouldRetry(5, new Error('test'));
        expect(r5.shouldRetry).toBe(true);
        expect(r5.delay).toBe(5000);
      });

      it('should respect maxAttempts', () => {
        const strategy = linear({ delay: 1000, maxAttempts: 2 });

        const r1 = strategy.shouldRetry(1, new Error('test'));
        expect(r1.shouldRetry).toBe(true);

        const r2 = strategy.shouldRetry(2, new Error('test'));
        expect(r2.shouldRetry).toBe(false);
      });
    });

    describe('custom', () => {
      it('should use custom function', () => {
        const strategy = custom((attempt, error) => {
          if (error.message.includes('RATE_LIMIT')) {
            return { shouldRetry: true, delay: 60000 };
          }
          return { shouldRetry: attempt < 3, delay: attempt * 1000 };
        });

        const r1 = strategy.shouldRetry(1, new Error('some error'));
        expect(r1.shouldRetry).toBe(true);
        expect(r1.delay).toBe(1000);

        const r3 = strategy.shouldRetry(3, new Error('some error'));
        expect(r3.shouldRetry).toBe(false);

        const rateLimit = strategy.shouldRetry(
          1,
          new Error('RATE_LIMIT exceeded'),
        );
        expect(rateLimit.shouldRetry).toBe(true);
        expect(rateLimit.delay).toBe(60000);
      });
    });

    describe('noRetry', () => {
      it('should never retry', () => {
        const strategy = noRetry();

        const result = strategy.shouldRetry(1, new Error('test'));
        expect(result.shouldRetry).toBe(false);
        expect(result.delay).toBe(0);
      });
    });
  });

  describe('SqliteJobStore', () => {
    let store: SqliteJobStore;

    beforeEach(async () => {
      store = new SqliteJobStore({ url: ':memory:' });
      await store.initialize();
    });

    afterEach(async () => {
      await store.close();
    });

    describe('enqueue', () => {
      it('should create a job with defaults', async () => {
        const job = await store.enqueue({
          payload: {
            objectType: 'Document',
            objectId: 'doc_123',
            method: 'generateSummary',
            args: { format: 'md' },
          },
        });

        expect(job.id).toBeDefined();
        expect(job.queue).toBe('default');
        expect(job.status).toBe('pending');
        expect(job.priority).toBe(50);
        expect(job.attempts).toBe(0);
        expect(job.maxAttempts).toBe(3);
        expect(job.payload.objectType).toBe('Document');
      });

      it('should create a job with custom options', async () => {
        const runAt = new Date(Date.now() + 60000);
        const job = await store.enqueue({
          queue: 'high-priority',
          payload: {
            objectType: 'Agent',
            objectId: null,
            method: 'run',
            args: {},
          },
          priority: 'high',
          runAt,
          maxAttempts: 5,
          timeout: 600000,
          timeoutBehavior: 'kill',
          retryStrategy: linear({ delay: 10000 }),
        });

        expect(job.queue).toBe('high-priority');
        expect(job.priority).toBe(75);
        expect(job.runAt.getTime()).toBe(runAt.getTime());
        expect(job.maxAttempts).toBe(5);
        expect(job.timeout).toBe(600000);
        expect(job.timeoutBehavior).toBe('kill');
        expect(job.retryStrategy.type).toBe('linear');
      });

      it('should emit job.created event', async () => {
        const events: string[] = [];
        store.subscribe((event) => {
          events.push(event.type);
        });

        await store.enqueue({
          payload: {
            objectType: 'Test',
            objectId: null,
            method: 'test',
            args: {},
          },
        });

        expect(events).toContain('job.created');
        expect(events).toContain('job.ready');
      });
    });

    describe('dequeue', () => {
      it('should dequeue pending jobs', async () => {
        // Create multiple jobs
        await store.enqueue({
          payload: { objectType: 'A', objectId: null, method: 'a', args: {} },
        });
        await store.enqueue({
          payload: { objectType: 'B', objectId: null, method: 'b', args: {} },
        });

        const jobs = await store.dequeue(['default'], 10, 'worker_1');

        expect(jobs).toHaveLength(2);
        expect(jobs[0].status).toBe('running');
        expect(jobs[0].workerId).toBe('worker_1');
        expect(jobs[0].attempts).toBe(1);
      });

      it('should respect queue filter', async () => {
        await store.enqueue({
          queue: 'queue-a',
          payload: { objectType: 'A', objectId: null, method: 'a', args: {} },
        });
        await store.enqueue({
          queue: 'queue-b',
          payload: { objectType: 'B', objectId: null, method: 'b', args: {} },
        });

        const jobs = await store.dequeue(['queue-a'], 10, 'worker_1');

        expect(jobs).toHaveLength(1);
        expect(jobs[0].queue).toBe('queue-a');
      });

      it('should respect limit', async () => {
        for (let i = 0; i < 5; i++) {
          await store.enqueue({
            payload: { objectType: 'X', objectId: null, method: 'x', args: {} },
          });
        }

        const jobs = await store.dequeue(['default'], 2, 'worker_1');
        expect(jobs).toHaveLength(2);
      });

      it('should order by priority', async () => {
        await store.enqueue({
          payload: { objectType: 'Low', objectId: null, method: 'l', args: {} },
          priority: 'low',
        });
        await store.enqueue({
          payload: {
            objectType: 'High',
            objectId: null,
            method: 'h',
            args: {},
          },
          priority: 'high',
        });
        await store.enqueue({
          payload: {
            objectType: 'Critical',
            objectId: null,
            method: 'c',
            args: {},
          },
          priority: 'critical',
        });

        const jobs = await store.dequeue(['default'], 10, 'worker_1');

        expect(jobs[0].payload.objectType).toBe('Critical');
        expect(jobs[1].payload.objectType).toBe('High');
        expect(jobs[2].payload.objectType).toBe('Low');
      });

      it('should not dequeue delayed jobs', async () => {
        await store.enqueue({
          payload: { objectType: 'Now', objectId: null, method: 'n', args: {} },
        });
        await store.enqueue({
          payload: {
            objectType: 'Later',
            objectId: null,
            method: 'l',
            args: {},
          },
          runAt: new Date(Date.now() + 60000),
        });

        const jobs = await store.dequeue(['default'], 10, 'worker_1');

        expect(jobs).toHaveLength(1);
        expect(jobs[0].payload.objectType).toBe('Now');
      });
    });

    describe('get', () => {
      it('should retrieve a job by id', async () => {
        const created = await store.enqueue({
          payload: {
            objectType: 'Test',
            objectId: null,
            method: 't',
            args: {},
          },
        });

        const job = await store.get(created.id);

        expect(job).not.toBeNull();
        expect(job!.id).toBe(created.id);
      });

      it('should return null for non-existent job', async () => {
        const job = await store.get('non_existent_id');
        expect(job).toBeNull();
      });
    });

    describe('update', () => {
      it('should update job fields', async () => {
        const job = await store.enqueue({
          payload: {
            objectType: 'Test',
            objectId: null,
            method: 't',
            args: {},
          },
        });

        const updated = await store.update(job.id, {
          status: 'completed',
          completedAt: new Date(),
          resultPointer: 'db:results:123',
        });

        expect(updated.status).toBe('completed');
        expect(updated.resultPointer).toBe('db:results:123');
        expect(updated.completedAt).not.toBeNull();
      });

      it('should emit completion event', async () => {
        const job = await store.enqueue({
          payload: {
            objectType: 'Test',
            objectId: null,
            method: 't',
            args: {},
          },
        });

        const events: string[] = [];
        store.subscribe((event) => {
          events.push(event.type);
        });

        await store.update(job.id, {
          status: 'completed',
          completedAt: new Date(),
        });

        expect(events).toContain('job.completed');
      });

      it('should ignore update keys that resolve only through the prototype chain', async () => {
        const job = await store.enqueue({
          queue: 'original',
          payload: {
            objectType: 'Test',
            objectId: null,
            method: 't',
            args: {},
          },
        });

        // constructor / __proto__ / toString are absent from the fieldMap
        // literal's own keys but resolve to truthy inherited members. A falsy
        // guard would interpolate e.g. `function Object() {…} = ?` into the SET
        // clause; the own-property guard treats them as unknown fields and
        // drops them. Parsed from JSON so the collisions are real own keys.
        const updated = await store.update(
          job.id,
          JSON.parse(
            '{"constructor": 1, "__proto__": 1, "toString": 1}',
          ) as Partial<Job>,
        );

        expect(updated.id).toBe(job.id);
        expect(updated.queue).toBe('original');
        expect(updated.status).toBe('pending');
      });

      it('should not let a polluted Object.prototype reach the update SET clause', async () => {
        const job = await store.enqueue({
          queue: 'original',
          payload: {
            objectType: 'Test',
            objectId: null,
            method: 't',
            args: {},
          },
        });

        // Simulate prototype pollution elsewhere in the process: an inherited
        // key whose value is a crafted SQL fragment. A bracket lookup reads it
        // through the chain, so a falsy guard would splice it straight into the
        // SET clause and rewrite an unrelated column. Kept non-enumerable so
        // the pollution cannot leak into unrelated iteration mid-test.
        Object.defineProperty(Object.prototype, 'evilCol', {
          value: "queue = 'pwned', status",
          configurable: true,
          enumerable: false,
          writable: true,
        });
        try {
          await store.update(job.id, {
            evilCol: 'x',
          } as unknown as Partial<Job>);

          const reread = await store.get(job.id);
          expect(reread?.queue).toBe('original');
        } finally {
          delete (Object.prototype as { evilCol?: unknown }).evilCol;
        }
      });

      it('should keep valid update fields while dropping inherited keys', async () => {
        const job = await store.enqueue({
          queue: 'original',
          payload: {
            objectType: 'Test',
            objectId: null,
            method: 't',
            args: {},
          },
        });

        // A real field alongside an inherited-only key exercises the executed
        // SQL path (not the empty-SET early return): the valid column is
        // written and the inherited key is dropped rather than injected.
        const updated = await store.update(
          job.id,
          JSON.parse(
            '{"status": "completed", "constructor": 1}',
          ) as Partial<Job>,
        );

        expect(updated.status).toBe('completed');
        expect(updated.queue).toBe('original');
      });

      it('should not emit a status event for a status from the prototype chain', async () => {
        const job = await store.enqueue({
          payload: {
            objectType: 'Test',
            objectId: null,
            method: 't',
            args: {},
          },
        });

        const events: string[] = [];
        store.subscribe((event) => {
          events.push(event.type);
        });

        // The event branch reads `updates.status`, which traverses the
        // prototype chain. A polluted Object.prototype.status must not make an
        // unrelated update (no own `status` key) look like a completion.
        Object.defineProperty(Object.prototype, 'status', {
          value: 'completed',
          configurable: true,
          enumerable: false,
          writable: true,
        });
        try {
          await store.update(job.id, { priority: 10 });
        } finally {
          delete (Object.prototype as { status?: unknown }).status;
        }

        expect(events).not.toContain('job.completed');
      });
    });

    describe('list', () => {
      beforeEach(async () => {
        await store.enqueue({
          queue: 'a',
          payload: { objectType: 'X', objectId: null, method: 'x', args: {} },
        });
        await store.enqueue({
          queue: 'b',
          payload: { objectType: 'Y', objectId: null, method: 'y', args: {} },
        });
      });

      it('should list all jobs', async () => {
        const jobs = await store.list({});
        expect(jobs).toHaveLength(2);
      });

      it('should filter by queue', async () => {
        const jobs = await store.list({ queue: 'a' });
        expect(jobs).toHaveLength(1);
        expect(jobs[0].queue).toBe('a');
      });

      it('should filter by status', async () => {
        const jobs = await store.list({ status: 'pending' });
        expect(jobs).toHaveLength(2);
      });

      it('should support pagination', async () => {
        const page1 = await store.list({ limit: 1 });
        expect(page1).toHaveLength(1);

        const page2 = await store.list({ limit: 1, offset: 1 });
        expect(page2).toHaveLength(1);
        expect(page2[0].id).not.toBe(page1[0].id);
      });

      // Queue 'c' is enqueued last but sorts lowest, so ordering by priority
      // is distinguishable from ordering by created_at — otherwise a mapping
      // that collapsed to the created_at fallback would still look correct.
      // The other two jobs tie at the default priority, and ORDER BY on a
      // tied key is not defined across adapters, so nothing asserts on them.
      const enqueueLowest = () =>
        store.enqueue({
          queue: 'c',
          payload: { objectType: 'Z', objectId: null, method: 'z', args: {} },
          priority: 'low',
        });

      it('should actually reverse order between asc and desc', async () => {
        await enqueueLowest();

        const asc = await store.list({ orderBy: 'priority', orderDir: 'asc' });
        const desc = await store.list({
          orderBy: 'priority',
          orderDir: 'desc',
        });

        expect(asc).toHaveLength(3);
        expect(asc[0].queue).toBe('c');
        expect(desc.at(-1)?.queue).toBe('c');
      });

      it('should treat a blank order direction as unspecified', async () => {
        await enqueueLowest();

        // Blank sorts the same as omitted. It previously emitted no direction
        // token, which both engines default to ASC, so blank and omitted
        // disagreed; they now agree on DESC.
        const omitted = await store.list({ orderBy: 'priority' });
        expect(omitted.at(-1)?.queue).toBe('c');

        for (const orderDir of ['', '   ', '\t\n']) {
          const blank = await store.list({
            orderBy: 'priority',
            orderDir: orderDir as never,
          });
          expect(blank.at(-1)?.queue).toBe('c');
        }

        // Padding around a real direction is tolerated.
        const padded = await store.list({
          orderBy: 'priority',
          orderDir: ' asc ' as never,
        });
        expect(padded[0].queue).toBe('c');
      });

      it('should reject an order direction outside the allowlist', async () => {
        // orderDir is typed 'asc' | 'desc', but the type is erased at runtime:
        // a JavaScript caller or a `parsedJson as JobFilter` cast can supply
        // anything, and the direction is interpolated rather than bound.
        // The first three execute as valid SQL against the unfixed code.
        const hostile = [
          'asc, 1=1',
          'desc; DROP TABLE _jobs--',
          'desc, (SELECT name FROM sqlite_master)',
          'DESCENDING',
        ];

        for (const orderDir of hostile) {
          await expect(
            store.list({ orderDir: orderDir as never }),
          ).rejects.toThrow('Invalid job order direction');
        }

        // Non-string input is reported as a bad direction rather than
        // surfacing a TypeError from coercing it.
        for (const orderDir of [1, Symbol('evil'), Object.create(null)]) {
          await expect(
            store.list({ orderDir: orderDir as never }),
          ).rejects.toThrow('Invalid job order direction');
        }

        // The table the injected payload targeted is still intact.
        await expect(store.list({})).resolves.toHaveLength(2);
      });

      it('should not resolve the order field through the prototype chain', async () => {
        // orderBy is looked up in a plain object literal, so inherited keys
        // like 'constructor' resolve to a truthy value and would bypass a
        // `?? 'created_at'` fallback.
        for (const orderBy of ['constructor', '__proto__', 'toString']) {
          await expect(
            store.list({ orderBy: orderBy as never }),
          ).resolves.toHaveLength(2);
        }
      });
    });

    describe('cancel', () => {
      it('should cancel a pending job', async () => {
        const job = await store.enqueue({
          payload: {
            objectType: 'Test',
            objectId: null,
            method: 't',
            args: {},
          },
        });

        await store.cancel(job.id);

        const updated = await store.get(job.id);
        expect(updated!.status).toBe('cancelled');
      });

      it('should throw when cancelling completed job', async () => {
        const job = await store.enqueue({
          payload: {
            objectType: 'Test',
            objectId: null,
            method: 't',
            args: {},
          },
        });
        await store.update(job.id, {
          status: 'completed',
          completedAt: new Date(),
        });

        await expect(store.cancel(job.id)).rejects.toThrow(
          'Cannot cancel job with status: completed',
        );
      });
    });

    describe('stats', () => {
      it('should return queue statistics', async () => {
        // Create jobs with different statuses
        await store.enqueue({
          payload: { objectType: 'A', objectId: null, method: 'a', args: {} },
        });

        const job2 = await store.enqueue({
          payload: { objectType: 'B', objectId: null, method: 'b', args: {} },
        });
        await store.update(job2.id, {
          status: 'completed',
          startedAt: new Date(Date.now() - 1000),
          completedAt: new Date(),
        });

        const stats = await store.stats();

        expect(stats.pending).toBe(1);
        expect(stats.completed).toBe(1);
        expect(stats.failed).toBe(0);
      });
    });

    describe('cleanup', () => {
      it('should delete old completed jobs', async () => {
        const job = await store.enqueue({
          payload: {
            objectType: 'Test',
            objectId: null,
            method: 't',
            args: {},
          },
        });

        // Complete the job with an old timestamp
        await store.update(job.id, {
          status: 'completed',
          completedAt: new Date(Date.now() - 86400000 * 8), // 8 days ago
        });

        const deleted = await store.cleanup({
          completedBefore: new Date(Date.now() - 86400000 * 7), // 7 days ago
        });

        expect(deleted).toBe(1);

        const remaining = await store.list({});
        expect(remaining).toHaveLength(0);
      });
    });
  });

  describe('JobWorker', () => {
    let store: SqliteJobStore;

    beforeEach(async () => {
      store = new SqliteJobStore({ url: ':memory:' });
      await store.initialize();
    });

    afterEach(async () => {
      await store.close();
    });

    it('should process jobs', async () => {
      const results: string[] = [];

      const worker = createWorker(
        store,
        async (job) => {
          results.push(job.payload.objectType);
          return { result: 'done' };
        },
        { concurrency: 1, pollInterval: 50 },
      );

      await store.enqueue({
        payload: { objectType: 'Job1', objectId: null, method: 'm', args: {} },
      });
      await store.enqueue({
        payload: { objectType: 'Job2', objectId: null, method: 'm', args: {} },
      });

      await worker.start();

      // Wait for jobs to process
      await new Promise((resolve) => setTimeout(resolve, 200));

      await worker.stop();

      expect(results).toContain('Job1');
      expect(results).toContain('Job2');
    });

    it('should emit events', async () => {
      const events: string[] = [];

      const worker = createWorker(store, async () => ({ result: 'done' }), {
        concurrency: 1,
        pollInterval: 50,
      });

      worker.on('job:started', () => events.push('started'));
      worker.on('job:completed', () => events.push('completed'));

      await store.enqueue({
        payload: { objectType: 'Test', objectId: null, method: 'm', args: {} },
      });

      await worker.start();
      await new Promise((resolve) => setTimeout(resolve, 200));
      await worker.stop();

      expect(events).toContain('started');
      expect(events).toContain('completed');
    });

    it('should retry failed jobs', async () => {
      let attempts = 0;

      const worker = createWorker(
        store,
        async () => {
          attempts++;
          if (attempts < 3) {
            throw new Error('Temporary failure');
          }
          return { result: 'success' };
        },
        { concurrency: 1, pollInterval: 50 },
      );

      await store.enqueue({
        payload: { objectType: 'Test', objectId: null, method: 'm', args: {} },
        retryStrategy: linear({ delay: 10 }), // Short delay for testing
      });

      await worker.start();
      await new Promise((resolve) => setTimeout(resolve, 500));
      await worker.stop();

      expect(attempts).toBe(3);

      const jobs = await store.list({ status: 'completed' });
      expect(jobs).toHaveLength(1);
    });
  });
});
