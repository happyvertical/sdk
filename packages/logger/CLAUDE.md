# @happyvertical/logger

## Purpose and Responsibilities

The logger package provides a simple, flexible logging infrastructure for the SDK. It implements a minimal `Logger` interface that integrates with the SMRT framework's SignalBus for automated logging of object lifecycle events.

## Key Features

- **Minimal Interface**: Simple debug/info/warn/error methods
- **SignalBus Integration**: LoggerAdapter connects to SMRT framework signals
- **Flexible Output**: Can be implemented with any logging backend
- **Zero Dependencies**: Standalone package with no internal dependencies

## Architecture Overview

```
Logger Interface (minimal contract)
    ↓
LoggerAdapter (SignalBus integration)
    ↓
Console/File/Custom Implementation
```

## Key APIs

### Basic Logging

```typescript
import { createLogger } from '@happyvertical/logger';

const logger = createLogger({ level: 'debug' });

logger.debug('Debug message', { context: 'optional' });
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message', { error: new Error('details') });
```

### SMRT Framework Integration

```typescript
import { createLogger, LoggerAdapter } from '@happyvertical/logger';
import { SignalBus } from '@happyvertical/smrt';

const logger = createLogger({ level: 'debug' });
const adapter = new LoggerAdapter(logger);
const bus = new SignalBus();

// Register adapter to receive all signals
bus.register(adapter);

// All SMRT operations now automatically log
// [DEBUG] Product.save() started {...}
// [INFO] Product.save() completed in 42ms {...}
```

## Dependencies

- **Internal**: None
- **External**: None (zero dependencies)

## Development Guidelines

- Keep the Logger interface minimal (4 methods: debug/info/warn/error)
- LoggerAdapter should handle signal-to-log-level mapping
- Support structured logging (context objects)
- Allow custom log formatters

## Expert Agent Expertise

This package defines the logging contract used throughout the SDK. When working with logger:

1. Maintain the minimal Logger interface - resist adding methods
2. LoggerAdapter is the bridge to SMRT framework - keep it focused
3. Encourage composition over configuration
4. Support common logging patterns (context, structured data)

## Related Packages

- **@happyvertical/utils**: May use logger for internal warnings
- **@happyvertical/smrt**: Primary consumer via LoggerAdapter
