# HAppy VErtical SDK (HAVE SDK)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A modular TypeScript SDK for building vertical AI agents with minimal dependencies and maximum flexibility.

## Overview

HAVE SDK is designed with these core principles:

- **Pure TypeScript** implementation to avoid CommonJS vs ESM compatibility issues
- **Minimal dependencies** through a carefully designed monorepo architecture
- **Compartmentalized code** to keep AI agents lean and focused
- **Easy testing and scaling** with minimal overhead
- **Standardized interfaces** across different packages

## Packages

| Package | Description |
|---------|-------------|
| [@have/ai](./packages/ai/) | Standardized interface for AI model interactions, currently supporting OpenAI |
| [@have/files](./packages/files/) | Tools for interacting with file systems (local and remote) |
| [@have/pdf](./packages/pdf/) | Utilities for parsing and processing PDF documents |
| [@have/smrt](./packages/smrt/) | Core library for building AI agents with standardized collections and objects |
| [@have/spider](./packages/spider/) | Web crawling and content parsing tools |
| [@have/sql](./packages/sql/) | Database interaction with support for SQLite and Postgres |
| [@have/utils](./packages/utils/) | Shared utility functions used across packages |

## Installation

```bash
# Install with npm
npm install @have/smrt

# Or with yarn
yarn add @have/smrt

# Or with pnpm
pnpm add @have/smrt
```

You can also install individual packages based on your needs:

```bash
pnpm add @have/ai @have/files @have/spider
```

## Getting Started

```typescript
import { Agent } from '@have/smrt';
import { OpenAIModel } from '@have/ai';

// Create a new agent
const agent = new Agent({
  model: new OpenAIModel({ apiKey: process.env.OPENAI_API_KEY }),
  // Configure additional tools as needed
});

// Use the agent
const result = await agent.run('Analyze this text and extract key insights');
console.log(result);
```

See each package's README for more detailed usage examples.

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build all packages in correct order
pnpm build

# Watch mode development
pnpm dev

# Lint code
pnpm lint

# Format code
pnpm format
```

## Documentation

### Local Documentation

The SDK provides automatically generated HTML documentation in the `docs/manual` directory.
This is generated during the build process and can be viewed by opening `docs/manual/index.html` in your browser.

You can generate the documentation separately by running:

```bash
pnpm docs
```

### Online Documentation

The latest API documentation is available online at:

[https://happyvertical.github.io/sdk/](https://happyvertical.github.io/sdk/)

This documentation is automatically updated whenever changes are merged to the master branch.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for details on how to submit pull requests, the development process, and coding standards.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.