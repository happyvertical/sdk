---
id: the-agent
title: "The Agent"
sidebar_label: "The Agent"
sidebar_position: 2
---

# The Agent

Core agent architecture and lifecycle management in SMRT.

## Overview

Every SMRT agent is built around a central `Agent` class that orchestrates:

- **🧠 AI Integration**: Connection to language models
- **📊 Data Management**: Smart object collections
- **🔧 Tool Access**: Built-in and custom capabilities
- **🔄 Lifecycle Management**: Startup, execution, and cleanup

## Basic Agent Structure

```typescript
import { Agent, BaseObject } from '@have/smrt';
import { OpenAIClient } from '@have/ai';

export class ProductAgent extends Agent {
  private ai = new OpenAIClient();

  async initialize() {
    // Agent setup
    await this.ai.connect();
    await this.loadModels();
  }

  async process(input: string) {
    // Core agent logic
    return await this.ai.chat([
      { role: 'user', content: input }
    ]);
  }
}
```

## Agent Capabilities

Agents automatically gain access to:
- All registered BaseObject collections
- File system operations via `@have/files`
- Database queries via `@have/sql`
- Web scraping via `@have/spider`
- PDF processing via `@have/pdf`

*Full documentation coming soon...*