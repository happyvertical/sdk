# @happyvertical/jobs

## Purpose and Responsibilities

The jobs package provides a job queue abstraction with multiple backend adapters. It enables background job processing with features like retry strategies, priority queues, and worker management.

## Key Features

- **Multiple Adapters**: SQLite, PostgreSQL, Bull, BullMQ, SQS, Cloud Tasks
- **Retry Strategies**: Exponential, linear, custom, and no-retry options
- **Priority Queues**: Support for job priorities
- **Worker Management**: Create and manage workers with event listeners
- **Zero-Config Built-ins**: SQLite and PostgreSQL require no external dependencies

## Architecture Overview

```
JobStore Interface
    ├── SqliteJobStore (built-in)
    ├── PostgresJobStore (built-in)
    ├── BullJobStore (Redis-based)
    ├── BullMQJobStore (Redis-based)
    ├── SQSJobStore (AWS)
    └── CloudTasksJobStore (GCP)
```

## Key APIs

### Creating a Job Store

```typescript
import { SqliteJobStore, PostgresJobStore } from '@happyvertical/jobs';
import { getDatabase } from '@happyvertical/sql';

// SQLite (zero-config)
const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
const sqliteStore = new SqliteJobStore({ db, queueName: 'my-queue' });

// PostgreSQL
const pgDb = await getDatabase({ type: 'postgres', url: process.env.DATABASE_URL });
const pgStore = new PostgresJobStore({ db: pgDb, queueName: 'my-queue' });

// Bull (requires Redis)
import { BullJobStore } from '@happyvertical/jobs';
const bullStore = new BullJobStore({
  queueName: 'my-queue',
  redis: { host: 'localhost', port: 6379 }
});
```

### Creating and Processing Jobs

```typescript
// Create a job
const job = await store.add({
  data: { userId: '123', action: 'send-email' },
  priority: 'high',
  delay: 5000, // 5 seconds delay
});

// Create a worker
import { createWorker } from '@happyvertical/jobs';

const worker = createWorker(store, {
  handler: async (job) => {
    console.log('Processing job:', job.data);
    // Do work...
    return { success: true };
  },
  concurrency: 5,
  pollInterval: 1000,
});

// Start processing
await worker.start();

// Stop gracefully
await worker.stop();
```

### Retry Strategies

```typescript
import { exponential, linear, noRetry, custom } from '@happyvertical/jobs';

// Exponential backoff (default)
const expStrategy = exponential({ maxAttempts: 5, baseDelay: 1000, maxDelay: 60000 });

// Linear backoff
const linearStrategy = linear({ maxAttempts: 3, delay: 5000 });

// No retry
const noRetryStrategy = noRetry();

// Custom strategy
const customStrategy = custom((attempt, error) => {
  if (error.message.includes('rate limit')) {
    return { retry: true, delay: 60000 };
  }
  return { retry: attempt < 3, delay: 1000 * attempt };
});
```

### Event Handling

```typescript
// Listen for job events
store.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

store.on('failed', (job, error) => {
  console.log(`Job ${job.id} failed:`, error);
});

store.on('progress', (job, progress) => {
  console.log(`Job ${job.id} progress:`, progress);
});
```

## Dependencies

- **Internal**:
  - `@happyvertical/sql` - For SQLite and PostgreSQL adapters
  - `@happyvertical/utils` - Utilities

- **Peer Dependencies** (optional):
  - `bull` - For Bull adapter
  - `bullmq` - For BullMQ adapter
  - `@aws-sdk/client-sqs` - For SQS adapter
  - `@google-cloud/tasks` - For Cloud Tasks adapter

## Development Guidelines

- Use SQLite adapter for development and testing
- Use PostgreSQL or Redis-based adapters for production
- Always implement graceful shutdown for workers
- Use appropriate retry strategies based on job type
- Monitor failed jobs and implement dead-letter handling

## Expert Agent Expertise

When working with jobs:

1. **Adapter Selection**: SQLite for dev, PostgreSQL for persistent queues, Redis for high-throughput
2. **Retry Strategy**: Match to failure mode (network errors vs validation errors)
3. **Concurrency**: Tune based on job type and system resources
4. **Monitoring**: Listen to events for observability
5. **Cleanup**: Implement job cleanup to prevent storage growth

## Related Packages

- **@happyvertical/sql**: Database adapters use this package
- **@happyvertical/utils**: Shared utilities
