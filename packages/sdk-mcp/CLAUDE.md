# @happyvertical/sdk-mcp

MCP server routing queries to package CLAUDE.md files. No factory — direct MCP tool handlers.

## Tools

- `ask` — Routes queries by keyword scoring, calls AI for synthesis (top 3 packages)
- `list-packages` — Returns registry metadata
- `get-docs` — Reads raw CLAUDE.md files

## Key patterns

- Package registry hardcoded in `src/registry.ts` — must update when adding packages
- Query keywords <3 chars are filtered out
- AI synthesis uses `@happyvertical/ai` with lazy imports
