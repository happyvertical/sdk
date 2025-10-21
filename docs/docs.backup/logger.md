---
id: logger
title: "@happyvertical/logger: Logging Infrastructure"
sidebar_label: "@happyvertical/logger"
sidebar_position: 8
---

# @happyvertical/logger: Logging Infrastructure

Structured logging for HAVE SDK with signal adapter and observability support.

## Overview

The `@happyvertical/logger` package provides enterprise-grade logging capabilities:

- **📊 Structured Logging**: JSON-formatted logs with context
- **📡 Signal Adapter**: Integration with observability platforms
- **🎯 Log Levels**: Debug, info, warn, error with filtering
- **🔍 Context Preservation**: Automatic context tracking across async operations
- **⚡ Performance**: Minimal overhead with async logging
- **🛡️ Type Safety**: Full TypeScript support

## Quick Start

```typescript
import { createLogger } from '@happyvertical/logger';

// Create a logger instance
const logger = createLogger({
  name: 'my-app',
  level: 'info'
});

// Basic logging
logger.info('Application started');
logger.debug('Debug information', { userId: 123 });
logger.warn('Warning message', { code: 'WARN_001' });
logger.error('Error occurred', { error: err });

// Structured logging with context
logger.info('User action', {
  action: 'login',
  userId: 123,
  timestamp: new Date(),
  metadata: {
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0...'
  }
});
```

## Log Levels

```typescript
// Set minimum log level
const logger = createLogger({
  name: 'my-app',
  level: 'warn'  // Only warn and error will be logged
});

logger.debug('Not logged');  // Filtered out
logger.info('Not logged');   // Filtered out
logger.warn('Logged');       // Appears
logger.error('Logged');      // Appears
```

Available levels (lowest to highest):
- `debug`: Detailed debugging information
- `info`: General informational messages
- `warn`: Warning messages
- `error`: Error messages

## Context Tracking

```typescript
// Create logger with default context
const logger = createLogger({
  name: 'api-server',
  context: {
    service: 'user-service',
    version: '1.0.0'
  }
});

// Context is automatically included in all logs
logger.info('Request received');
// Output: { level: 'info', service: 'user-service', version: '1.0.0', message: 'Request received' }

// Add request-specific context
const requestLogger = logger.child({
  requestId: 'abc-123',
  userId: 456
});

requestLogger.info('Processing request');
// Output includes both default and request context
```

## Child Loggers

```typescript
// Create child logger with inherited context
const parentLogger = createLogger({ name: 'app' });
const childLogger = parentLogger.child({ module: 'auth' });

childLogger.info('Authentication attempt');
// Includes both parent and child context
```

## Signal Integration

```typescript
import { createLogger, SignalAdapter } from '@happyvertical/logger';

// Create logger with signal adapter for observability
const logger = createLogger({
  name: 'my-app',
  adapters: [
    new SignalAdapter({
      endpoint: 'https://observability.example.com',
      apiKey: process.env.SIGNAL_API_KEY
    })
  ]
});

// Logs are automatically sent to observability platform
logger.error('Critical error', {
  error: err,
  stack: err.stack
});
```

## Custom Formatting

```typescript
const logger = createLogger({
  name: 'my-app',
  format: 'json',  // 'json' or 'pretty'
  timestamp: true,
  colorize: process.env.NODE_ENV === 'development'
});
```

*Full documentation coming soon...*
