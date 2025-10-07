# @have/agents Specification

## 1. Overview

This document outlines the specification for the `@have/agents` module. The goal is to create a framework for building agents that operate within the `@have/smrt` ecosystem. This module will provide a base `Agent` class that other agents can extend, abstracting away common functionalities and providing a consistent structure for agent development.

## 2. Core Concepts

### 2.1. Agent

An `Agent` is a `SmrtObject` that is designed to perform a specific set of tasks. Agents are configurable, observable, and can be run as a service. They are the primary actors in the `@have/smrt` ecosystem, responsible for orchestrating the various modules and libraries to achieve a specific goal. By extending `SmrtObject`, each agent instance is a persistent object in the database, allowing it to maintain state and have a memory.

### 2.2. Configuration

Agents use the `@have/config` module for configuration management. Each agent's configuration is loaded from `smrt.config.js` (or other supported formats) under the `modules` key. Configuration is hierarchical and can be overridden by environment variables.

## 3. The `Agent` Class

The `Agent` class will be a `SmrtObject` with the following features:

### 3.1. Persistence and Memory

By extending `SmrtObject`, each agent has a persistent representation in the database, automatically managed by `@have/smrt`. The agent's database record includes:

- **Standard fields**: `id`, `name`, `slug`, `createdAt`, `updatedAt`
- **`memory`**: JSON field for agent-specific state (e.g., last crawl timestamps, cached data)
- **`metadata`**: JSON field for agent metadata (e.g., configuration overrides)

All fields are automatically persisted to the database via SMRT's persistence layer. The agent can read/write to `this.memory` and changes are saved automatically.

### 3.2. Configuration Loading

Agents load their configuration using `getModuleConfig()` from `@have/config`:

```typescript
import { getModuleConfig } from '@have/config';

@smrt()
export class MyAgent extends Agent {
  private config = getModuleConfig('my-agent', {
    // Default values
    cronSchedule: '0 0 * * *',
    maxRetries: 3,
  });
}
```

Configuration is defined in `smrt.config.js`:

```javascript
export default {
  modules: {
    'my-agent': {
      cronSchedule: '0 2 * * *',
      maxRetries: 5,
    },
  },
};
```

### 3.3. Status Tracking

The `Agent` class will track its execution status:

```typescript
status: 'idle' | 'initializing' | 'running' | 'error' | 'shutdown'
```

This allows monitoring and prevents duplicate runs.

### 3.4. Run Metadata

The `Agent` class will track execution history in `lastRun`:

```typescript
lastRun: {
  startedAt: Date;
  completedAt: Date | null;
  duration: number | null; // milliseconds
  error: string | null;
  itemsProcessed: number;
}
```

### 3.5. Logging

The `Agent` class will have a pre-configured logger from the `@have/logger` module. This will provide a standardized way to log messages and errors.

### 3.6. Lifecycle Methods

The `Agent` class will have a set of lifecycle methods that can be overridden by the extending agent:

- `initialize()`: Called after the agent has been constructed and the configuration has been loaded. Sets status to 'initializing'.
- `validate()`: Called before `run()` to validate configuration and dependencies. Throws if validation fails. This prevents runtime errors from misconfiguration.
- `run()`: The main entry point for the agent's logic. Sets status to 'running'. Updates `lastRun` metadata on completion.
- `shutdown()`: Called when the agent is shutting down (e.g., SIGTERM), allowing for graceful cleanup. Sets status to 'shutdown'.

## 4. Agent Class Structure

```typescript
import { SmrtObject, smrt } from '@have/smrt';
import { getModuleConfig } from '@have/config';
import { getLogger } from '@have/logger';

export interface AgentStatus {
  status: 'idle' | 'initializing' | 'running' | 'error' | 'shutdown';
  lastRun: {
    startedAt: Date | null;
    completedAt: Date | null;
    duration: number | null;
    error: string | null;
    itemsProcessed: number;
  };
}

@smrt()
export abstract class Agent extends SmrtObject {
  // Status tracking
  status: AgentStatus['status'] = 'idle';
  lastRun: AgentStatus['lastRun'] = {
    startedAt: null,
    completedAt: null,
    duration: null,
    error: null,
    itemsProcessed: 0,
  };

  // Memory (persisted via SmrtObject)
  memory: Record<string, unknown> = {};

  // Logger
  protected logger = getLogger(this.constructor.name);

  // Configuration (loaded by extending class)
  protected abstract config: unknown;

  /**
   * Initialize the agent
   * Override to perform setup after construction
   */
  async initialize(): Promise<void> {
    this.status = 'initializing';
    this.logger.info('Agent initializing');
  }

  /**
   * Validate configuration and dependencies
   * Override to check agent-specific requirements
   * @throws Error if validation fails
   */
  async validate(): Promise<void> {
    this.logger.info('Validating agent configuration');
    // Base implementation - extending agents should override
  }

  /**
   * Main agent logic
   * Must be implemented by extending class
   */
  abstract run(): Promise<void>;

  /**
   * Cleanup and shutdown
   * Override to perform graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.status = 'shutdown';
    this.logger.info('Agent shutting down');
  }

  /**
   * Execute agent with lifecycle management
   */
  async execute(): Promise<void> {
    try {
      await this.initialize();
      await this.validate();

      this.status = 'running';
      this.lastRun.startedAt = new Date();

      await this.run();

      this.lastRun.completedAt = new Date();
      this.lastRun.duration =
        this.lastRun.completedAt.getTime() - this.lastRun.startedAt.getTime();
      this.lastRun.error = null;
      this.status = 'idle';

    } catch (error) {
      this.status = 'error';
      this.lastRun.error = error instanceof Error ? error.message : String(error);
      this.logger.error('Agent execution failed', error);
      throw error;
    }
  }
}
```

## 5. Use Case: Praeco

`Praeco` will be refactored to be an `Agent`. It will extend the `Agent` class and implement the `run()` method to perform its crawling and processing logic.

### Example Implementation

```typescript
import { Agent } from '@have/agents';
import { getModuleConfig } from '@have/config';
import { smrt } from '@have/smrt';

interface PraecoConfig {
  sources: string[];
  cronSchedule: string;
  maxArticlesPerRun: number;
}

interface PraecoMemory {
  lastCrawl: Record<string, Date>;
  articlesSeen: string[];
}

@smrt()
export class Praeco extends Agent {
  protected config = getModuleConfig<PraecoConfig>('praeco', {
    sources: [],
    cronSchedule: '0 2 * * *',
    maxArticlesPerRun: 50,
  });

  // Type-safe memory access
  declare memory: PraecoMemory;

  async validate(): Promise<void> {
    if (!this.config.sources || this.config.sources.length === 0) {
      throw new Error('Praeco requires at least one source URL');
    }

    for (const source of this.config.sources) {
      try {
        new URL(source);
      } catch {
        throw new Error(`Invalid source URL: ${source}`);
      }
    }
  }

  async run(): Promise<void> {
    this.logger.info(`Starting Praeco crawl of ${this.config.sources.length} sources`);

    // Initialize memory if first run
    if (!this.memory.lastCrawl) {
      this.memory.lastCrawl = {};
      this.memory.articlesSeen = [];
    }

    let articlesProcessed = 0;

    for (const source of this.config.sources) {
      this.logger.info(`Crawling ${source}`);

      // Crawl logic here...
      const articles = await this.crawlSource(source);

      // Filter out already-seen articles
      const newArticles = articles.filter(
        article => !this.memory.articlesSeen.includes(article.url)
      );

      this.logger.info(`Found ${newArticles.length} new articles from ${source}`);

      // Process articles...
      for (const article of newArticles) {
        await this.processArticle(article);
        this.memory.articlesSeen.push(article.url);
        articlesProcessed++;

        if (articlesProcessed >= this.config.maxArticlesPerRun) {
          this.logger.info('Reached max articles limit');
          break;
        }
      }

      // Update last crawl time
      this.memory.lastCrawl[source] = new Date();

      if (articlesProcessed >= this.config.maxArticlesPerRun) {
        break;
      }
    }

    this.lastRun.itemsProcessed = articlesProcessed;
    this.logger.info(`Praeco completed: ${articlesProcessed} articles processed`);
  }

  private async crawlSource(source: string) {
    // Implementation...
    return [];
  }

  private async processArticle(article: any) {
    // Implementation...
  }
}
```

### Configuration

```javascript
// smrt.config.js
export default {
  modules: {
    praeco: {
      sources: [
        'https://example.com/city-council/meetings',
        'https://example.com/planning-board/agendas',
      ],
      cronSchedule: '0 2 * * *', // 2 AM daily
      maxArticlesPerRun: 100,
    },
  },
};
```