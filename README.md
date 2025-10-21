# Happy Vertical SDK

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

TypeScript SDK for building AI-powered applications.

## Packages

- **[@happyvertical/ai](./packages/ai/README.md)** - Multi-provider AI client with builtin adapters for OpenAI, Anthropic, Gemini, Bedrock, HuggingFace
- **[@happyvertical/cache](./packages/cache/README.md)** - Caching interface with builtin adapters for Memory, File, Redis
- **[@happyvertical/config](./packages/config/README.md)** - Configuration management
- **[@happyvertical/documents](./packages/documents/README.md)** - Document processing for PDFs, HTML, and Markdown
- **[@happyvertical/files](./packages/files/README.md)** - File system operations with local and remote provider support
- **[@happyvertical/geo](./packages/geo/README.md)** - Geographic utilities and services
- **[@happyvertical/logger](./packages/logger/README.md)** - Logging infrastructure
- **[@happyvertical/ocr](./packages/ocr/README.md)** - OCR interface with builtin adapters for Tesseract, ONNX, Web OCR
- **[@happyvertical/pdf](./packages/pdf/README.md)** - PDF parsing and text extraction
- **[@happyvertical/spider](./packages/spider/README.md)** - Web crawling with builtin adapters for Simple, DOM, Crawlee
- **[@happyvertical/sql](./packages/sql/README.md)** - Database interface with builtin adapters for SQLite, PostgreSQL, DuckDB, JSON
- **[@happyvertical/translator](./packages/translator/README.md)** - Translation services integration
- **[@happyvertical/utils](./packages/utils/README.md)** - Shared utilities and helpers

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
