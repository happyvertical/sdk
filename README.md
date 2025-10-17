# Happy Vertical SDK

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

TypeScript SDK for building AI-powered applications.

## Packages

- **[@have/ai](./packages/ai/README.md)** - Multi-provider AI client with builtin adapters for OpenAI, Anthropic, Gemini, Bedrock, HuggingFace
- **[@have/cache](./packages/cache/README.md)** - Caching interface with builtin adapters for Memory, File, Redis
- **[@have/config](./packages/config/README.md)** - Configuration management
- **[@have/documents](./packages/documents/README.md)** - Document processing for PDFs, HTML, and Markdown
- **[@have/files](./packages/files/README.md)** - File system operations with local and remote provider support
- **[@have/geo](./packages/geo/README.md)** - Geographic utilities and services
- **[@have/logger](./packages/logger/README.md)** - Logging infrastructure
- **[@have/ocr](./packages/ocr/README.md)** - OCR interface with builtin adapters for Tesseract, ONNX, Web OCR
- **[@have/pdf](./packages/pdf/README.md)** - PDF parsing and text extraction
- **[@have/spider](./packages/spider/README.md)** - Web crawling with builtin adapters for Simple, DOM, Crawlee
- **[@have/sql](./packages/sql/README.md)** - Database interface with builtin adapters for SQLite, PostgreSQL, DuckDB, JSON
- **[@have/translator](./packages/translator/README.md)** - Translation services integration
- **[@have/utils](./packages/utils/README.md)** - Shared utilities and helpers

## Installation

```bash
pnpm add @have/ai @have/sql @have/files
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
