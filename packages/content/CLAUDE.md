# @have/content: Content Processing Module

## Purpose and Responsibilities

The `@have/content` package is a SMRT-specific module that provides comprehensive content processing capabilities for the HAVE SDK. It is **not part of the main build pipeline** and is designed specifically for use with the SMRT framework. The package handles:

- **Document Processing**: Unified interface for working with documents (PDFs, text files, web content)
- **Content Management**: Structured content objects with metadata, versioning, and references
- **AI Integration**: Built-in AI-powered content analysis via SMRT's inherited methods
- **Collection Operations**: Batch processing, querying, and content organization
- **File System Integration**: Content mirroring, caching, and markdown export
- **Web Content Processing**: URL-based content extraction and analysis

This package was intentionally separated from the core SMRT framework to maintain modularity while providing specialized content processing capabilities.

## Architecture and Status

**Package Location**: `smrt/content/` (SMRT-specific module)
**Build Status**: Excluded from main build pipeline
**Integration**: Requires SMRT framework for full functionality
**Target Environment**: Node.js only

## Core Components

### Content Class (`content.ts`)
Represents structured content objects with comprehensive metadata:

- **Extends**: `SmrtObject` (database persistence, AI methods)
- **Features**: Full CRUD operations, reference management, JSON serialization
- **Properties**: Type classification, author, title, description, body, publish_date, URL, source, status, state, tags, metadata
- **AI Integration**: Inherits `do()` and `is()` methods for content analysis
- **API Exposure**: Full REST API with list, get, create, update, delete endpoints
- **MCP Tools**: AI-accessible tools for content management

### Contents Class (`contents.ts`)
Collection management for Content objects with advanced features:

- **Extends**: `SmrtCollection<Content>` (batch operations, querying)
- **Features**: Content mirroring from URLs, filesystem export, markdown generation
- **Methods**: `mirror()`, `writeContentFile()`, `syncContentDir()`
- **Integration**: Direct integration with Document class for content extraction
- **Caching**: Built-in loading cache for performance optimization

### Document Class (`document.ts`)
Specialized document handler for file-based content:

- **Features**: Local and remote file processing, automatic caching, MIME type detection
- **Supported Types**: PDFs (via @have/pdf), text files, web content
- **Methods**: `getText()` for content extraction, `initialize()` for setup
- **Caching**: Automatic extraction result caching to avoid reprocessing
- **Integration**: Works with downloadFileWithCache from @have/files

### Utility Functions (`utils.ts`)
Content serialization and parsing utilities:

- **`contentToString()`**: Converts Content objects to YAML frontmatter + body format
- **`stringToContent()`**: Parses YAML frontmatter strings back to content data
- **Format**: Standard markdown file format with YAML frontmatter

## Dependencies

### Internal HAVE SDK Dependencies
- **@have/smrt**: Core framework (SmrtObject, SmrtCollection, decorators)
- **@have/pdf**: PDF text extraction capabilities
- **@have/spider**: Web content scraping (via Document class)
- **@have/files**: File system operations, caching, download management
- **@have/utils**: Utility functions (makeSlug, etc.)

### External Dependencies
- **yaml**: YAML parsing and stringification for frontmatter handling

### Development Dependencies
- **@faker-js/faker**: Test data generation
- **@types/node**: TypeScript Node.js definitions
- **typescript**: TypeScript compiler
- **vitest**: Testing framework
- **svelte**: Development UI framework

## Usage Examples

### Basic Content Management

```typescript
import { Content, Contents } from '@have/content';

// Initialize collection with database and AI config
const contents = await Contents.create({
  db: { url: 'sqlite:./content.db' },
  ai: { type: 'openai', apiKey: process.env.OPENAI_API_KEY }
});

// Create content with comprehensive metadata
const article = new Content({
  title: 'AI in Content Processing',
  body: 'Large language models have revolutionized how we process and analyze content...',
  type: 'article',
  author: 'Research Team',
  source: 'research_paper',
  status: 'published',
  state: 'active',
  tags: ['ai', 'nlp', 'content-processing'],
  metadata: {
    category: 'technology',
    difficulty: 'intermediate',
    readingTime: 15
  }
});

// Initialize and save (sets up database record)
await article.initialize();
await article.save();

// Use inherited AI capabilities for analysis
const summary = await article.do('Create a 2-sentence summary');
const isAcademic = await article.is('written in academic style');
const topics = await article.do('Extract key topics as JSON array');

// Add to collection
await contents.add(article);
```

### Document Processing Workflow

```typescript
import { Document, Content, Contents } from '@have/content';

// Process PDF document
const doc = await Document.create({
  url: 'https://example.com/research.pdf',
  cacheDir: './cache'
});

// Extract text content
const extractedText = await doc.getText();

// Create content from document
const content = new Content({
  title: 'Extracted Research Paper',
  body: extractedText,
  type: 'document',
  fileKey: doc.localPath,
  source: 'pdf_extraction',
  original_url: 'https://example.com/research.pdf'
});

await content.initialize();
await content.save();
```

### Web Content Mirroring

```typescript
import { Contents } from '@have/content';

const contents = await Contents.create({
  db: { url: 'sqlite:./mirrors.db' }
});

// Mirror content from URL
const mirrored = await contents.mirror({
  url: 'https://example.com/article',
  context: 'research_sources',
  mirrorDir: './mirrors'
});

// Content is automatically extracted, processed, and saved
console.log(mirrored.title); // Auto-generated from URL
console.log(mirrored.body);  // Extracted text content
```

### Content Export and Synchronization

```typescript
import { Contents } from '@have/content';

const contents = await Contents.create({
  db: { url: 'sqlite:./content.db' },
  contentDir: './content-export'
});

// Export article-type content to filesystem as markdown
await contents.syncContentDir({
  contentDir: './exported-content'
});

// Individual file writing with YAML frontmatter
await contents.writeContentFile({
  content: article,
  contentDir: './markdown-files'
});
```

### Content Utilities

```typescript
import { contentToString, stringToContent } from '@have/content';

// Serialize content to markdown with YAML frontmatter
const markdownString = contentToString(article);
console.log(markdownString);
/*
---
title: AI in Content Processing
author: Research Team
type: article
status: published
---
Large language models have revolutionized how we process...
*/

// Parse markdown string back to content data
const contentData = stringToContent(markdownString);
const restoredContent = new Content(contentData);
```

## Advanced Integration Patterns

### Reference Management

```typescript
// Add references between content pieces
const sourceArticle = new Content({ title: 'Source Material' });
const derivedArticle = new Content({ title: 'Analysis Based on Source' });

await derivedArticle.addReference(sourceArticle);
await derivedArticle.addReference('https://external-source.com');

// Load reference network
const references = await derivedArticle.getReferences();
```

### Collection Querying

```typescript
// Advanced querying with SMRT collection methods
const recentArticles = await contents.list({
  where: {
    type: 'article',
    status: 'published',
    state: 'active'
  },
  limit: 10,
  offset: 0
});

// Get or create pattern
const content = await contents.getOrUpsert({
  title: 'Unique Title',
  body: 'Content body'
});
```

## Integration with SMRT Framework

The @have/content package is a full SMRT module with:

### SMRT Decorators
```typescript
@smrt({
  api: { include: ['list', 'get', 'create', 'update', 'delete'] },
  mcp: { include: ['list', 'get', 'create', 'update'] },
  cli: true
})
export class Content extends SmrtObject {
  // Automatic REST API generation
  // MCP tool integration for AI access
  // CLI command support
}
```

### Inherited SMRT Capabilities
- **Database Operations**: Automatic schema management and CRUD operations
- **AI Integration**: Built-in `do()` and `is()` methods for content analysis
- **API Generation**: Automatic REST API endpoints
- **MCP Tools**: AI-accessible tools for content management
- **CLI Support**: Command-line interface for content operations

## Development and Testing

```bash
# Install dependencies
bun install

# Run tests (requires OPENAI_API_KEY for AI integration tests)
bun test

# Build package
bun run build

# Development mode with auto-rebuild
bun run build:watch

# Run development server (Svelte UI)
bun run dev
```

## Key Features Summary

✅ **SMRT Integration**: Full SMRT module with automatic API generation
✅ **AI-Powered Analysis**: Built-in content analysis and transformation
✅ **Document Processing**: PDF and text file content extraction
✅ **Web Content**: URL mirroring and content extraction
✅ **Filesystem Export**: Markdown generation with YAML frontmatter
✅ **Reference System**: Content linking and relationship management
✅ **Caching**: Automatic extraction result caching
✅ **Collection Operations**: Batch processing and advanced querying
✅ **TypeScript**: Full type safety and IntelliSense support

This package enables sophisticated content processing workflows while maintaining the modular architecture and AI-first design principles of the HAVE SDK.