---
id: cache
title: "@happyvertical/cache: Standardized Caching Interface"
sidebar_label: "@happyvertical/cache"
sidebar_position: 3
---

# @happyvertical/cache: Standardized Caching Interface

Unified caching interface supporting Memory, File, and Redis backends with a consistent API.

## Overview

The `@happyvertical/cache` package provides a standardized caching layer that works seamlessly across different storage backends:

- **🔌 Multiple Backends**: Memory, File, and Redis adapters
- **🔒 Type Safety**: Full TypeScript support with proper typing
- **⚡ Performance**: Optimized for speed with TTL support
- **🛡️ Consistent API**: Same interface across all backends
- **📊 Key-Value Store**: Simple get/set operations with optional expiration

## Quick Start

```typescript
import { getCache } from '@happyvertical/cache';

// In-memory cache (fastest, non-persistent)
const memoryCache = await getCache({
  type: 'memory',
  maxSize: 1000
});

// File-based cache (persistent, simple)
const fileCache = await getCache({
  type: 'file',
  directory: './cache'
});

// Redis cache (distributed, scalable)
const redisCache = await getCache({
  type: 'redis',
  host: 'localhost',
  port: 6379
});

// Use consistent API across all backends
await cache.set('user:123', { name: 'Alice', email: 'alice@example.com' });
const user = await cache.get('user:123');

// Set with TTL (time-to-live in seconds)
await cache.set('session:abc', sessionData, 3600); // Expires in 1 hour

// Check existence
const exists = await cache.has('user:123');

// Delete
await cache.delete('user:123');

// Clear all
await cache.clear();
```

## Backend Comparison

### Memory Cache
- **Best for**: Development, testing, single-process apps
- **Persistence**: No (data lost on restart)
- **Performance**: Fastest
- **Use when**: Speed is critical and persistence not required

### File Cache
- **Best for**: Small applications, simple persistence
- **Persistence**: Yes (survives restarts)
- **Performance**: Moderate (disk I/O)
- **Use when**: Simple persistence without external dependencies

### Redis Cache
- **Best for**: Production, distributed systems, high concurrency
- **Persistence**: Configurable
- **Performance**: Very fast with network overhead
- **Use when**: Multiple processes or servers need shared cache

*Full documentation coming soon...*
