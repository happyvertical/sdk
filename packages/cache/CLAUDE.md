# @happyvertical/cache

Caching with multiple backends. Factory: `getCache({ provider, ...config })`.

## Providers

memory (in-process Map + LRU), file (JSON + optional compression), redis (ioredis), s3 (AWS S3).

## Gotchas

- Config key is `provider`, not `type` (differs from other SDK packages)
- TTL in seconds (Redis convention)
- Values are JSON-serialized — non-JSON types lose type info
- Memory provider uses LRU eviction; file provider uses periodic cleanup
- Env vars use `HAVE_CACHE_*` prefix
