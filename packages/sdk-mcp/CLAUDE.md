# @happyvertical/sdk-mcp

## Purpose and Responsibilities

The sdk-mcp package is an MCP (Model Context Protocol) server that provides AI agents with access to SDK package documentation. It uses RAG (Retrieval-Augmented Generation) patterns to route queries to relevant packages and synthesize answers using AI.

## Key Features

- **Query Routing**: Keyword-based matching to find relevant packages
- **RAG Pattern**: Loads CLAUDE.md files as knowledge base
- **AI Synthesis**: Uses @happyvertical/ai to generate contextual answers
- **Package Discovery**: Auto-discovers packages by scanning for CLAUDE.md files
- **MCP Tools**: Provides ask, list-packages, and get-docs tools
- **Self-Documenting**: Each package's CLAUDE.md serves as expert knowledge

## Architecture Overview

```
MCP Client (Claude Desktop/Code)
    ↓
ask(query) Tool
    ↓
Query Router (keyword scoring)
    ↓
CLAUDE.md Loader (top 3 packages)
    ↓
AI Synthesis (context + query)
    ↓
Response to Client
```

## MCP Tools

### 1. ask
Ask questions about SDK packages and get AI-powered answers.

**Input**:
```typescript
{
  query: string;           // The question to answer
  packages?: string[];     // Optional: specific packages to consult
}
```

**Output**: AI-generated answer with package context

### 2. list-packages
List all available SDK packages with descriptions.

**Output**: JSON array of packages with names, descriptions, and keywords

### 3. get-docs
Get raw CLAUDE.md content for specific packages.

**Input**:
```typescript
{
  packages: string[];  // Package names (without @happyvertical/ prefix)
}
```

**Output**: Raw markdown documentation

## Query Routing Algorithm

1. **Keyword Extraction**: Query lowercased and split on word boundaries (words >2 chars)
2. **Scoring**:
   - Exact keyword match: +10 points
   - Partial keyword match: +5 points
   - Package name match: +15 bonus points
3. **Filtering**: Packages with score <5 excluded
4. **Selection**: Top 3 packages by score consulted

**Example**:
- Query: "How do I query a SQLite database?"
- Keywords: ["how", "query", "sqlite", "database"]
- Match: `sql` package (keywords: ["database", "sql", "sqlite", "query"])
- Score: 10+10+10+10 = 40 points

## Configuration

### Environment Variables

```bash
# Required for ask tool (AI synthesis)
export HAVE_AI_API_KEY=your-api-key
export HAVE_AI_TYPE=openai

# Optional
export HAVE_AI_TIMEOUT=30000
export HAVE_AI_MAX_RETRIES=3
```

### Claude Desktop Configuration

Add to `.mcp.json` or Claude Desktop config:

```json
{
  "mcpServers": {
    "happyvertical-sdk-mcp": {
      "type": "stdio",
      "command": "/absolute/path/to/sdk/scripts/mcp-servers/sdk-dev-server.sh",
      "env": {
        "HAVE_AI_API_KEY": "your-key",
        "HAVE_AI_TYPE": "openai"
      }
    }
  }
}
```

## Package Registry

Located in `src/registry.ts`, maps package names to keywords for routing:

```typescript
export const PACKAGE_KEYWORDS: Record<string, string[]> = {
  sql: ['database', 'sql', 'sqlite', 'postgres', 'duckdb', 'query'],
  ai: ['ai', 'llm', 'gpt', 'claude', 'openai', 'anthropic'],
  spider: ['crawl', 'scrape', 'web', 'html', 'website'],
  // ... more packages
};
```

### Adding New Packages

1. Create `CLAUDE.md` file in package directory
2. Add keyword mapping to `src/registry.ts`
3. Keywords should include: technology names, action verbs, domain terms
4. Rebuild: `pnpm run build`

## Dependencies

- **Internal**:
  - `@happyvertical/ai` - AI synthesis
  - `@happyvertical/files` - Reading CLAUDE.md files
  - `@happyvertical/utils` - Utilities

- **External**:
  - `@modelcontextprotocol/sdk` - MCP protocol implementation

## Development Guidelines

- Keep keyword lists focused (5-15 keywords per package)
- CLAUDE.md files should be comprehensive but concise
- Scoring algorithm favors exact matches
- Maximum 3 packages consulted per query (token limits)
- AI synthesis uses maxTokens=2000

## Expert Agent Expertise

When working with sdk-mcp:

1. **Keyword Strategy**: Technology names, action verbs, domain terms
2. **Documentation Quality**: CLAUDE.md files are the knowledge base
3. **Routing Logic**: Exact matches score higher than partials
4. **Performance**: First query slow (filesystem scan), subsequent fast (cached)
5. **Token Management**: Limited to 3 packages to stay within context limits

## Performance Considerations

- **First Query**: ~100-500ms (scans filesystem)
- **Subsequent Queries**: ~10-50ms (uses cache)
- **AI Synthesis**: 1-5 seconds (depends on provider)
- **Context Size**: Up to 3 CLAUDE.md files per query
- **Cache Lifetime**: Registry persists for server lifetime

## Common Patterns

```typescript
// Example query workflow
ask("How do I connect to PostgreSQL?")
  → Keywords: ["connect", "postgresql"]
  → Matches: sql (score: 25)
  → Loads: packages/sql/CLAUDE.md
  → AI Synthesis with context
  → Returns: Answer with code examples
```

## Troubleshooting

**"AI client initialization failed"**
- Cause: No AI provider configured
- Fix: Set `HAVE_AI_API_KEY` and `HAVE_AI_TYPE` env vars

**"No relevant packages found"**
- Cause: Query keywords don't match any package
- Fix: Try domain-specific terms or use `list-packages` to see available packages

**Server won't start**
- Cause: Package not built or permissions issue
- Fix: Run `pnpm run build` and ensure bridge script is executable

## Related Packages

- **@happyvertical/ai**: Powers the AI synthesis
- **@happyvertical/files**: Reads CLAUDE.md documentation
- **All SDK packages**: Consumers of this MCP server

## Documentation Links

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Claude Desktop Configuration](https://docs.claude.com/)
