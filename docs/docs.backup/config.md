---
id: config
title: "@have/config: Configuration Management"
sidebar_label: "@have/config"
sidebar_position: 4
---

# @have/config: Configuration Management

Centralized configuration management for SMRT modules with support for multiple configuration sources.

## Overview

The `@have/config` package provides flexible configuration management using cosmiconfig:

- **📁 Multiple Sources**: Load from package.json, config files, or environment
- **🔍 Auto-discovery**: Automatically finds configuration files
- **🔒 Type Safety**: TypeScript support for configuration schemas
- **⚙️ Flexible Formats**: Supports JSON, YAML, JS, and TypeScript config files
- **🎯 SMRT Integration**: Designed for SMRT module configuration

## Quick Start

```typescript
import { loadConfig } from '@have/config';

// Auto-discover configuration
const config = await loadConfig('myapp');

// Config will be loaded from (in order of precedence):
// - package.json "myapp" property
// - .myapprc (JSON or YAML)
// - .myapprc.json
// - .myapprc.yaml
// - .myapprc.yml
// - .myapprc.js
// - .myapprc.ts
// - myapp.config.js
// - myapp.config.ts

console.log(config);
```

## Configuration File Examples

### package.json
```json
{
  "name": "my-project",
  "myapp": {
    "apiKey": "...",
    "timeout": 5000
  }
}
```

### .myapprc.json
```json
{
  "apiKey": "...",
  "timeout": 5000,
  "retries": 3
}
```

### myapp.config.js
```javascript
export default {
  apiKey: process.env.API_KEY,
  timeout: 5000,
  retries: 3
};
```

### myapp.config.ts
```typescript
import type { MyAppConfig } from './types';

const config: MyAppConfig = {
  apiKey: process.env.API_KEY!,
  timeout: 5000,
  retries: 3
};

export default config;
```

## Type-Safe Configuration

```typescript
import { loadConfig } from '@have/config';

interface AppConfig {
  apiKey: string;
  timeout: number;
  retries?: number;
}

const config = await loadConfig<AppConfig>('myapp');

// TypeScript knows the shape of config
console.log(config.apiKey); // string
console.log(config.timeout); // number
```

*Full documentation coming soon...*
