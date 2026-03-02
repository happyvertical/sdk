# @happyvertical/jobs

Job queue abstraction. Direct class instantiation (no factory): `new SqliteJobStore(config)`, etc.

## Adapters

SqliteJobStore, PostgresJobStore, BullJobStore, BullMQJobStore, SQSJobStore, CloudTasksJobStore. All fully implemented.

## Key patterns

- Retry strategies: exponential, linear, noRetry, custom
- Worker with event handling, concurrent processing, graceful shutdown
- SQLite/Postgres use polling; Bull/BullMQ use Redis events

## Gotchas

- SQS jobs are immutable after enqueue — no update after creation
- Cloud Tasks requires HTTP handler URL for execution
- BullMQ requires Redis; no fallback
