---
id: installation
title: Installation
sidebar_label: Installation
sidebar_position: 1
---

# Installation

Get started with the SMRT Agent Framework in seconds. One command installs everything you need to build powerful AI agents.

## Prerequisites

Before installing SMRT, ensure you have:

- **Bun 1.0+** installed (our recommended JavaScript runtime)
- **TypeScript 5.0+** for type safety
- An **API key** from at least one AI provider (OpenAI, Anthropic, etc.)

## Installation Paths

SMRT supports two main usage patterns:

### Creating SMRT Objects (Framework Development)

If you're building new SMRT objects and agents:

```bash
pnpm add @have/smrt @have/ai
```

### Consuming SMRT Packages (Package Integration)

If you're using existing SMRT packages in your project:

```bash
# Install SMRT consumer tools
pnpm add @have/smrt

# Install SMRT packages you want to use
pnpm add @my-org/products @my-org/content
```

:::info
While other package managers work, we **strongly recommend Bun** for the best performance and compatibility with the HAVE SDK ecosystem.
:::

## What Gets Installed?

When you install `@have/smrt`, you automatically get:

- **Core Framework**: Agent, SmartObject, Collection classes
- **Database Integration**: SQLite for development, PostgreSQL support for production
- **AI Client**: Unified interface for multiple AI providers
- **Code Generators**: CLI, REST API, and MCP server generators
- **Consumer Plugin**: Vite plugin for consuming SMRT packages
- **Type Definitions**: Full TypeScript support out of the box

## Environment Setup

Create a `.env` file in your project root to configure AI providers:

```bash
# OpenAI (most common)
OPENAI_API_KEY=sk-...

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-...

# Google (Gemini)
GOOGLE_AI_API_KEY=...

# AWS Bedrock
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# Database (optional, defaults to SQLite)
DATABASE_URL=postgres://user:pass@localhost/dbname
```

<div className="callout info">
  <strong>💡 Tip:</strong> Start with just an OpenAI API key. You can add other providers later as needed.
</div>

## TypeScript Configuration

SMRT works best with these TypeScript settings. Add to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## Consumer Plugin Configuration

If you're consuming SMRT packages, configure the consumer plugin in your Vite config:

```typescript
// vite.config.js
import { smrtConsumer } from '@have/smrt/consumer-plugin';

export default {
  plugins: [
    smrtConsumer({
      packages: ['@my-org/products'], // SMRT packages to consume
      generateTypes: true,
      typesDir: 'src/types/smrt-generated'
    })
  ]
};
```

This automatically provides:
- **Type-safe API client** for consumed SMRT packages
- **TypeScript declarations** for virtual `@smrt/*` modules
- **Unified interface** across multiple SMRT packages

```typescript
// Use generated client and types
import { createClient } from '@smrt/client';
import type { ProductData } from '@smrt/types';

const client = createClient('/api/v1');
const products: ProductData[] = await client.products.list();
```

## Verify Installation

Create a simple test file to verify everything is working:

```typescript
// test-smrt.ts
import { Agent, SmartObject } from '@have/smrt';
import { getAIClient } from '@have/ai';

async function testInstallation() {
  console.log('✅ SMRT imported successfully');
  
  // Test AI client
  const ai = await getAIClient({ provider: 'openai' });
  console.log('✅ AI client created');
  
  // Test SmartObject
  class TestObject extends SmartObject {
    name: string = 'Test';
  }
  console.log('✅ SmartObject defined');
  
  // Test Agent
  const agent = new Agent({
    ai,
    name: 'TestAgent'
  });
  console.log('✅ Agent created');
  
  console.log('\n🎉 SMRT is ready to use!');
}

testInstallation().catch(console.error);
```

Run the test:

```bash
npm run test-smrt.ts
# or
ts-node test-smrt.ts
```

## Project Structure

Here's the recommended structure for a SMRT project:

```
my-agent-project/
├── src/
│   ├── agents/           # Your agent definitions
│   │   └── research-agent.ts
│   ├── objects/          # SmartObject models
│   │   ├── document.ts
│   │   └── task.ts
│   ├── tools/            # Custom tools for agents
│   │   └── web-search.ts
│   └── index.ts          # Main entry point
├── .env                  # Environment variables
├── tsconfig.json         # TypeScript config
└── package.json          # Project dependencies
```

## Installing Additional Capabilities

As your agents need more capabilities, install additional HAVE SDK packages:

### File System Operations
```bash
pnpm add @have/files
```

### PDF Processing
```bash
pnpm add @have/pdf
```

### Web Scraping
```bash
pnpm add @have/spider
```

### Advanced Database Features
```bash
pnpm add @have/sql
```

<div className="callout success">
  <strong>🎯 Pro Tip:</strong> Start with just @have/smrt. Add other packages only when you need specific capabilities. SMRT includes the essentials to get started.
</div>

## Platform-Specific Notes

### macOS
- Install Node.js: Use [official installer](https://nodejs.org/) or `brew install node`
- Install pnpm: `npm install -g pnpm`
- Native SQLite support included with Node.js

### Windows
- Use WSL2 for best compatibility with Node.js development
- Install Node.js in WSL2: Use [NodeSource](https://github.com/nodesource/distributions) or nvm
- Install pnpm: `npm install -g pnpm`

### Linux
- Install Node.js: Use package manager or [NodeSource](https://github.com/nodesource/distributions)
- Install pnpm: `npm install -g pnpm`
- Install build-essential for native module compilation:
  ```bash
  sudo apt-get install build-essential
  ```

### Docker
- Use Node.js in your Docker images:
  ```dockerfile
  FROM node:18-alpine
  RUN npm install -g pnpm
  RUN pnpm add -g @have/smrt
  ```

## Troubleshooting

### Common Issues

**Issue**: "Cannot find module '@have/smrt'"
- **Solution**: Ensure you're in the correct directory and packages are installed

**Issue**: "API key not found"
- **Solution**: Check your `.env` file and ensure environment variables are loaded

**Issue**: "Database connection failed"
- **Solution**: SMRT defaults to SQLite. Ensure write permissions in your project directory

**Issue**: "TypeScript errors"
- **Solution**: Update your `tsconfig.json` with the recommended settings above

## Next Steps

Now that SMRT is installed, you're ready to build your first agent!

<div className="row">
  <div className="col col--6">
    <a href="/docs/getting-started/your-first-agent" className="button button--primary button--block">
      Build Your First Agent →
    </a>
  </div>
  <div className="col col--6">
    <a href="/docs/smrt-framework/overview" className="button button--secondary button--block">
      Explore the Framework →
    </a>
  </div>
</div>

---

<div className="callout info">
  <strong>Need Help?</strong> Join our <a href="https://discord.gg/smrt-agents">Discord community</a> for support and discussions.
</div>