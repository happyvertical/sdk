# @happyvertical/sdk-mcp

MCP server for the HAVE SDK that acts as an orchestrator, routing developer queries to appropriate package experts using CLAUDE.md files.

## Overview

The SDK MCP Server implements a RAG (Retrieval-Augmented Generation) pattern where each SDK package's CLAUDE.md file serves as domain expertise. When you ask a question, the server:

1. Routes your query to relevant packages based on keyword matching
2. Loads the CLAUDE.md documentation for those packages
3. Uses AI to synthesize a response based on the expert documentation
4. Returns an answer with package references

## Installation

```bash
pnpm install @happyvertical/sdk-mcp
```

## Claude Code Context

Install Claude Code context files for AI-assisted development:

```bash
npx have-sdk-mcp-context
```

This copies the package's `CLAUDE.md` documentation and `.claude-meta.json` metadata to your project's `.claude/` directory, enabling Claude to provide better assistance when working with this package.

## Usage

### As an MCP Server

The server is designed to be run as an MCP server via the bridge script:

```bash
./scripts/mcp-servers/sdk-dev-server.sh
```

### Environment Variables

The `ask` tool requires an AI provider to be configured. Set one of:

- `HAVE_AI_API_KEY` - Fallback API key for any provider
- `HAVE_AI_TYPE` - Provider type ('openai', 'anthropic', 'gemini')
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `GEMINI_API_KEY` - Google Gemini API key

Other tools (`list-packages`, `get-docs`) work without AI configuration.

## Available Tools

### ask

Ask a question about the SDK. Automatically routes to relevant packages and synthesizes a response.

```typescript
{
  "query": "How do I crawl a website and save results to SQLite?",
  "packages": ["spider", "sql"]  // Optional: specify packages explicitly
}
```

### list-packages

List all available SDK packages with descriptions and keywords.

```typescript
{
  // No parameters required
}
```

### get-docs

Get the full CLAUDE.md documentation for a specific package.

```typescript
{
  "packageName": "ai"
}
```

## How It Works

### Package Registry

The registry scans `packages/*/CLAUDE.md` files at startup and builds a catalog of available packages with:
- Package name
- Description (extracted from CLAUDE.md)
- Keywords for routing
- Full documentation content

### Query Routing

When you ask a question, the router:
1. Extracts keywords from your query
2. Matches against package keyword lists
3. Scores packages by relevance
4. Returns top matches

### AI Synthesis

The `ask` tool:
1. Loads CLAUDE.md for relevant packages (top 3 matches)
2. Builds context from documentation
3. Uses AI (via `@happyvertical/ai`) to generate response
4. Includes package references in response

## Package Keywords

Each package has associated keywords for routing. See `src/registry.ts` for the complete mapping.

Example keywords:
- **ai**: ai, llm, gpt, claude, openai, anthropic, completion
- **sql**: database, sql, sqlite, postgres, query, table, schema
- **spider**: crawl, scrape, web, html, website, page, link

## Development

```bash
# Build the package
pnpm run build

# Run tests
pnpm test

# Watch mode
pnpm run dev
```

## Adding New Packages

When you add a new package to the SDK:

1. Create a `CLAUDE.md` file documenting the package
2. Update `src/registry.ts` to add keywords for the new package
3. Rebuild: `pnpm run build`

The package will be automatically discovered and included in the registry.

## Architecture

```
Developer Query → MCP Server (Orchestrator)
                      ↓
    ┌─────────────────┼─────────────────┐
    ↓                 ↓                 ↓
Package Expert    Package Expert    Package Expert
(@happyvertical/ai)        (@happyvertical/spider)    (@happyvertical/sql)
CLAUDE.md         CLAUDE.md         CLAUDE.md
    ↓                 ↓                 ↓
    └─────────────────┴─────────────────┘
                      ↓
            Synthesized Response
```

## License

MIT
