# Happy Vertical SDK

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

TypeScript SDK for building AI-powered applications.

## Packages

### Core Foundation
- **[@happyvertical/utils](./packages/utils/README.md)** - Shared utilities and helpers
- **[@happyvertical/logger](./packages/logger/README.md)** - Logging infrastructure
- **[@happyvertical/files](./packages/files/README.md)** - File system operations with local and remote provider support
- **[@happyvertical/sql](./packages/sql/README.md)** - Database interface with builtin adapters for SQLite, PostgreSQL, DuckDB, JSON
- **[@happyvertical/ai](./packages/ai/README.md)** - Multi-provider AI client with builtin adapters for OpenAI, Anthropic, Gemini, Bedrock, HuggingFace

### Infrastructure
- **[@happyvertical/cache](./packages/cache/README.md)** - Caching interface with builtin adapters for Memory, File, Redis
- **[@happyvertical/geo](./packages/geo/README.md)** - Geographic utilities and services
- **[@happyvertical/translator](./packages/translator/README.md)** - Translation services integration
- **[@happyvertical/ocr](./packages/ocr/README.md)** - OCR interface with builtin adapters for Tesseract, ONNX, Web OCR
- **[@happyvertical/pdf](./packages/pdf/README.md)** - PDF parsing and text extraction
- **[@happyvertical/spider](./packages/spider/README.md)** - Web crawling with builtin adapters for Simple, DOM, Crawlee
- **[@happyvertical/documents](./packages/documents/README.md)** - Document processing for PDFs, HTML, and Markdown

### Developer Tools
- **[@happyvertical/sdk-mcp](./packages/sdk-mcp/README.md)** - MCP server for SDK package documentation
- **[@happyvertical/github-actions](./packages/github-actions/README.md)** - Reusable GitHub Actions workflows

### Experimental (In Development)
- **[@happyvertical/email](./packages/email/)** - Email utilities (stub)
- **[@happyvertical/languages](./packages/languages/)** - Language detection and processing (stub)

## Installation

### Installing from GitHub Packages

All SDK packages are published to GitHub Packages. To install them, you need to configure npm to use GitHub Packages for the `@have` scope.

#### 1. Create a GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate a new token with `read:packages` scope
3. Copy the token

#### 2. Configure npm registry

Create or update `.npmrc` in your project root:

```bash
@have:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Or set the token via environment variable:

```bash
echo "@have:registry=https://npm.pkg.github.com" >> .npmrc
echo "//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}" >> .npmrc
```

#### 3. Install packages

```bash
pnpm add @happyvertical/ai @happyvertical/sql @happyvertical/files
```

### Available Packages

All SDK packages are available:

```bash
# Core packages
pnpm add @happyvertical/utils @happyvertical/logger @happyvertical/files @happyvertical/sql @happyvertical/ai

# Infrastructure packages
pnpm add @happyvertical/cache @happyvertical/geo @happyvertical/translator @happyvertical/ocr @happyvertical/pdf @happyvertical/spider @happyvertical/documents
```

## Claude Code Context

Each SDK package ships with Claude Code context files for AI-assisted development. Install them in your project to help Claude understand the SDK packages you're using.

### Install Context for Individual Packages

```bash
# Install context for packages you use
npx have-ai-context
npx have-sql-context
npx have-files-context
```

This copies the package's documentation and metadata to your project's `.claude/` directory:

```
.claude/
├── have-ai.md           # Full documentation
├── have-ai.meta.json    # Concise metadata (exports, patterns, pitfalls)
├── have-sql.md
├── have-sql.meta.json
└── ...
```

### Automate with package.json

Add a setup script to install context for all SDK packages your project uses:

```json
{
  "scripts": {
    "setup:claude": "npx have-ai-context && npx have-sql-context && npx have-files-context"
  }
}
```

### Available Context Commands

| Package | Command |
|---------|---------|
| @happyvertical/ai | `npx have-ai-context` |
| @happyvertical/sql | `npx have-sql-context` |
| @happyvertical/files | `npx have-files-context` |
| @happyvertical/utils | `npx have-utils-context` |
| @happyvertical/cache | `npx have-cache-context` |
| @happyvertical/documents | `npx have-documents-context` |
| @happyvertical/geo | `npx have-geo-context` |
| @happyvertical/spider | `npx have-spider-context` |
| @happyvertical/pdf | `npx have-pdf-context` |
| @happyvertical/translator | `npx have-translator-context` |

All SDK packages include a context command following the pattern `have-{pkgname}-context`.

## Development

```bash
# Install dependencies
pnpm install

# Build packages
npm run build

# Run tests
npm test

# Development mode
npm run dev
```

## License

MIT License - see [LICENSE](./LICENSE) file for details.
