# @happyvertical/cache

Unified caching interface supporting Memory, File, Redis, and S3 backends with TTL, eviction policies, batch operations, and compression. All providers implement the same `CacheProvider` interface, so you can swap backends without changing application code.

## Installation

```bash
pnpm add @happyvertical/cache
# Requires @happyvertical/utils as a peer
# redis and @aws-sdk/client-s3 are bundled
```

## Quick Start

```typescript
import { getCache } from '@happyvertical/cache';

const cache = await getCache({
  provider: 'memory',
  maxSize: 100 * 1024 * 1024,
  evictionPolicy: 'lru',
});

await cache.set('user:123', { name: 'Alice' }, 3600); // TTL in seconds
const user = await cache.get('user:123');
await cache.delete('user:123');
await cache.close();
```

## Providers

### Memory

In-process `Map`-based cache. No external dependencies. Data lost on restart.

```typescript
const cache = await getCache({
  provider: 'memory',
  namespace: 'app',
  defaultTTL: 3600,          // seconds
  maxSize: 100 * 1024 * 1024, // bytes (default 100MB)
  maxEntries: 10000,          // default 10k
  evictionPolicy: 'lru',      // 'lru' | 'lfu' | 'fifo'
  checkPeriod: 60000,          // expiration sweep interval in ms
});
```

### File

Stores entries as files on disk with optional gzip compression. Persists across restarts.

```typescript
const cache = await getCache({
  provider: 'file',
  cacheDir: './cache',         // required
  compression: true,           // gzip (default false)
  maxSize: 500 * 1024 * 1024,  // bytes (default 500MB)
  fileExtension: '.cache',
  checkPeriod: 300000,         // cleanup interval in ms
});
```

### Redis

Distributed cache using the `redis` npm client. Supports optional gzip compression for large values.

```typescript
const cache = await getCache({
  provider: 'redis',
  host: 'localhost',
  port: 6379,
  password: 'secret',
  db: 0,
  namespace: 'app',
  enableCompression: true,
  compressionThreshold: 1024, // bytes — only compress values larger than this
  connectTimeout: 5000,       // ms
});
```

### S3

Stores entries as S3 objects. Useful for CI caches that must persist between runs. Compression enabled by default to reduce egress costs.

```typescript
const cache = await getCache({
  provider: 's3',
  bucket: 'my-cache-bucket',
  prefix: 'cache/',
  region: 'us-east-1',
  compression: true,           // default true
  compressionThreshold: 1024,  // bytes
});
```

## API

All providers implement `CacheProvider`:

```typescript
interface CacheProvider {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  clear(namespace?: string): Promise<void>;
  keys(pattern?: string): Promise<string[]>;
  getMany<T>(keys: string[]): Promise<Map<string, T>>;
  setMany<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void>;
  deleteMany(keys: string[]): Promise<number>;
  touch(key: string, ttl: number): Promise<boolean>;
  getStats(): Promise<CacheStats>;
  close(): Promise<void>;
}
```

- **TTL** is always in seconds. Omit for no expiration.
- **`keys()`** accepts glob patterns (`user:*`, `report:2024*`).
- **`touch()`** updates TTL without modifying the value. Returns `false` if the key doesn't exist.
- **Batch ops** (`getMany`, `setMany`, `deleteMany`) reduce round-trips, especially for Redis.

## Environment Variables

Configuration can be loaded from `HAVE_CACHE_*` environment variables via `@happyvertical/utils/loadEnvConfig`. Programmatic options always take precedence.

| Variable | Maps to | Notes |
|----------|---------|-------|
| `HAVE_CACHE_PROVIDER` | `provider` | `memory`, `file`, `redis`, `s3` |
| `HAVE_CACHE_NAMESPACE` | `namespace` | |
| `HAVE_CACHE_DEFAULT_TTL` | `defaultTTL` | seconds |
| `HAVE_CACHE_MAX_SIZE` | `maxSize` | bytes (memory/file) |
| `HAVE_CACHE_MAX_ENTRIES` | `maxEntries` | memory only |
| `HAVE_CACHE_EVICTION_POLICY` | `evictionPolicy` | memory only |
| `HAVE_CACHE_CACHE_DIR` | `cacheDir` | file only |
| `HAVE_CACHE_COMPRESSION` | `compression` | file/s3 |
| `HAVE_CACHE_HOST` | `host` | redis only |
| `HAVE_CACHE_PORT` | `port` | redis only |
| `HAVE_CACHE_PASSWORD` | `password` | redis only |
| `HAVE_CACHE_BUCKET` | `bucket` | s3 only |
| `HAVE_CACHE_PREFIX` | `prefix` | s3 only |
| `HAVE_CACHE_REGION` | `region` | s3 only |

## Error Classes

All errors extend `CacheError(message, code, provider)`:

- `CacheKeyError` — invalid key (empty or >250 chars)
- `CacheConnectionError` — backend unreachable (Redis)
- `CacheSizeError` — entry would exceed `maxSize`
- `CacheSerializationError` — JSON serialize/deserialize failure

## Exported Utilities

Low-level helpers re-exported from `shared/utils`:

- `isValidKey(key)` — check key length constraints
- `calculateSize(value)` — approximate JSON byte size
- `matchesPattern(pattern, str)` — glob matching
- `formatKey(namespace, key)` / `extractKey(namespace, fullKey)` — namespace prefixing
- `isExpired(expiresAt)` / `calculateExpiration(ttl)` — TTL math
- `serialize(value)` / `deserialize(json)` — JSON wrappers
