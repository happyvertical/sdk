# @happyvertical/sdk-mcp

MCP server for the HAVE SDK that routes developer queries to package documentation. It scans each package's `AGENT.md` file at startup, builds a keyword-indexed registry, and exposes three MCP tools: `ask` (AI-powered Q&A), `list-packages`, and `get-docs`.

## Installation

```bash
pnpm install @happyvertical/sdk-mcp
```

> Published to GitHub Packages (`npm.pkg.github.com`). Configure your `.npmrc` accordingly.

## Usage

### As an MCP Server

The package provides a stdio-based MCP server. Run it directly:

```bash
npx sdk-mcp
```

Or configure it in your MCP client (e.g., Claude Desktop) to launch as a subprocess.

### Claude Code Context CLI

Copy AGENT.md and metadata into your project's `.claude/` directory for AI-assisted development:

```bash
npx have-sdk-mcp-context
```

### Environment Variables

The `ask` tool requires an AI provider. Set one of:

- `HAVE_AI_API_KEY` — Fallback API key for any provider
- `HAVE_AI_TYPE` — Provider type (`openai`, `anthropic`, `gemini`)
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`

The `list-packages` and `get-docs` tools work without AI configuration.

## MCP Tools

### ask

Ask a question about the SDK. Routes to relevant packages via keyword matching and synthesizes a response using AI (top 3 matches).

```json
{
  "query": "How do I send an email with an attachment?",
  "packages": ["email", "messages"]
}
```

- `query` (required) — The question to ask
- `packages` (optional) — Explicit package names to consult instead of auto-routing

### list-packages

List all discovered SDK packages with descriptions and keywords. No parameters.

### get-docs

Get the full AGENT.md content for a specific package.

```json
{
  "packageName": "ai"
}
```

## How It Works

1. **Registry** — On first call, scans `packages/*/AGENT.md` and builds a `Map<string, PackageMetadata>` keyed by package name. Each entry includes the description (extracted from AGENT.md), keywords (from a static mapping in `registry.ts`), and the full documentation content.

2. **Routing** — Splits the user query into tokens and scores each package by keyword overlap (exact match = 10 pts, partial = 5 pts, name bonus = 15 pts). Packages below a minimum score threshold are excluded.

3. **Synthesis** — The `ask` tool loads AGENT.md for the top 3 matched packages, builds a system prompt with that context, and calls `@happyvertical/ai` to generate a response.

## Adding a New Package

1. Create an `AGENT.md` in the new package directory
2. Add a keyword entry in `src/registry.ts` (`PACKAGE_KEYWORDS`)
3. Rebuild: `pnpm run build`

The package will be discovered automatically on the next server startup.

## API

### Registry (`registry.ts`)

| Export | Description |
|--------|-------------|
| `PackageMetadata` | Interface: `name`, `path`, `description`, `claudeMd`, `keywords` |
| `PACKAGE_KEYWORDS` | Static keyword-to-package mapping used for routing |
| `buildPackageRegistry()` | Scans packages directory and returns cached `Map<string, PackageMetadata>` |
| `getPackage(name)` | Get metadata for a single package |
| `getAllPackages()` | Get all package metadata as an array |
| `getPackageDocs(name)` | Get raw AGENT.md content for a package |
| `clearCache()` | Clear the in-memory registry cache |

### Router (`router.ts`)

| Export | Description |
|--------|-------------|
| `PackageMatch` | Interface: `package`, `score`, `matchedKeywords` |
| `routeQuery(query, minScore?)` | Score and rank packages against a query string |
| `getPackagesByNames(names)` | Look up packages by explicit name list |
| `getTopPackages(query, limit?)` | Shorthand for `routeQuery` + slice |

### Tools (`tools/`)

| Export | Description |
|--------|-------------|
| `ask(input)` | AI-powered Q&A tool |
| `listPackages()` | List all packages |
| `getDocs(packageName)` | Get package documentation |

## Dependencies

- `@happyvertical/ai` — AI provider for the `ask` tool
- `@modelcontextprotocol/sdk` — MCP protocol implementation

## Development

```bash
pnpm run build       # Build
pnpm test            # Run tests
pnpm run dev         # Watch mode (build + test)
```

## License

MIT
