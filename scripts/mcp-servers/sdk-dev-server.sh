#!/usr/bin/env bash

# SDK MCP Server Bridge Script
# Provides access to SDK package documentation via MCP protocol

set -euo pipefail

# Get script directory and SDK root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Server location
SERVER_DIR="$SDK_ROOT/packages/sdk-mcp"
SERVER_BIN="$SERVER_DIR/dist/index.js"

# Health check
if [ ! -f "$SERVER_BIN" ]; then
  echo "Error: SDK MCP server not built. Run 'pnpm run build' first." >&2
  exit 1
fi

# Check for AI provider configuration
if [ -z "${HAVE_AI_API_KEY:-}" ] && [ -z "${OPENAI_API_KEY:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "Warning: No AI provider configured. Set one of:" >&2
  echo "  - HAVE_AI_API_KEY (fallback for any provider)" >&2
  echo "  - OPENAI_API_KEY" >&2
  echo "  - ANTHROPIC_API_KEY" >&2
  echo "  - GEMINI_API_KEY" >&2
  echo "" >&2
  echo "The 'ask' tool will not work without an AI provider." >&2
  echo "Other tools (list-packages, get-docs) will still function." >&2
  echo "" >&2
fi

# Run server
exec node "$SERVER_BIN"
