---
id: content
title: "@have/content: SMRT Content Processing Module"
sidebar_label: "@have/content"
sidebar_position: 1
---

# @have/content: SMRT Content Processing Module

The `@have/content` package is a specialized SMRT module that provides comprehensive content processing capabilities for the HAVE SDK. **This package is excluded from the main build pipeline** and serves as a SMRT-specific extension for advanced content management workflows.

## Architecture Overview

**Package Status**: SMRT-specific module (not part of main build)
**Location**: `smrt/content/` directory
**Integration**: Requires SMRT framework for full functionality
**Target**: Node.js environments only

`@have/content` provides enterprise-grade content processing with:

- **📄 Document Processing**: PDF and text file content extraction
- **🌐 Web Content**: URL mirroring and content scraping integration
- **🤖 AI Integration**: Built-in content analysis via SMRT's inherited methods
- **🔗 Reference Management**: Content linking and relationship tracking
- **📊 Collection Operations**: Advanced querying and batch processing
- **💾 Export Capabilities**: Markdown generation with YAML frontmatter
- **🗄️ Full SMRT Integration**: Automatic APIs, database operations, and MCP tools

## Core Classes

### Content Class

The `Content` class extends `SmrtObject` and represents structured content with comprehensive metadata and AI capabilities:

```typescript
import { Content } from '@have/content';

// Create content with full metadata support
const article = new Content({
  title: 'AI in Modern Applications',
  body: 'Large language models have revolutionized software development...',
  type: 'article',
  author: 'Tech Research Team',
  source: 'research_paper',
  status: 'published',
  state: 'active',
  tags: ['ai', 'development', 'automation'],
  metadata: {
    category: 'technology',
    readingTime: 12,
    difficulty: 'intermediate'
  }
});

// Initialize and save to database
await article.initialize();
await article.save();

// Use inherited SMRT AI capabilities
const summary = await article.do('Create a concise 2-sentence summary');
const isAcademic = await article.is('written in academic style');
const keyPoints = await article.do('Extract 5 key points as bullet list');
```

**Key Features:**
- **Full SMRT Integration**: Automatic REST APIs and MCP tools
- **Rich Metadata**: Comprehensive content properties and custom metadata
- **Reference System**: Link related content pieces
- **AI Analysis**: Built-in content analysis and transformation
- **Database Persistence**: Automatic schema management and CRUD operations

### Contents Collection

The `Contents` class extends `SmrtCollection<Content>` for advanced content management:

```typescript
import { Contents } from '@have/content';

// Initialize collection with database configuration
const contents = await Contents.create({
  db: { url: 'sqlite:./content.db' },
  ai: { type: 'openai', apiKey: process.env.OPENAI_API_KEY }
});

// Mirror content from URLs
const mirrored = await contents.mirror({
  url: 'https://example.com/article',
  context: 'research_sources'
});

// Advanced querying
const recentArticles = await contents.list({
  where: {
    type: 'article',
    status: 'published',
    state: 'active'
  },
  limit: 10
});

// Export to filesystem as markdown
await contents.syncContentDir({
  contentDir: './exported-content'
});
```

**Advanced Features:**
- **URL Mirroring**: Automatic content extraction from web sources
- **Markdown Export**: YAML frontmatter + content body format
- **Caching**: Built-in performance optimization
- **Batch Operations**: Collection-level content processing

### Document Class

The `Document` class handles file-based content processing with automatic caching:

```typescript
import { Document } from '@have/content';

// Process PDF document
const doc = await Document.create({
  url: 'https://example.com/research.pdf',
  cacheDir: './cache'
});

// Extract text content (supports PDFs and text files)
const extractedText = await doc.getText();

// Check file type
console.log(doc.isTextFile()); // true for .txt, .md, etc.
console.log(doc.type);         // 'application/pdf'
```

**Capabilities:**
- **Multi-format Support**: PDF extraction via `@have/pdf`, direct text file reading
- **Automatic Caching**: Extraction results cached to avoid reprocessing
- **Remote Files**: Automatic download and local caching
- **MIME Detection**: Automatic content type identification

## Content Schema and Properties

### ContentOptions Interface

The `Content` class supports comprehensive metadata through the `ContentOptions` interface:

```typescript
interface ContentOptions extends SmrtObjectOptions {
  // Content Classification
  type?: string | null;                    // Content type (article, document, etc.)

  // Core Metadata
  author?: string | null;                  // Content author
  title?: string | null;                   // Content title
  description?: string | null;             // Short summary/description
  body?: string | null;                    // Main content text

  // Publication Info
  publish_date?: Date | null;              // When content was published
  url?: string | null;                     // Source URL
  source?: string | null;                  // Origin identifier
  original_url?: string | null;            // Original URL if different from url
  language?: string | null;                // Content language

  // Status Management
  status?: 'published' | 'draft' | 'archived' | 'deleted' | null;
  state?: 'deprecated' | 'active' | 'highlighted' | null;

  // Organization
  tags?: string[];                         // Content tags array
  fileKey?: string | null;                 // Reference to file storage
  metadata?: Record<string, any>;          // Flexible additional metadata
}
```

### Utility Functions

The package includes content serialization utilities:

```typescript
import { contentToString, stringToContent } from '@have/content';

// Convert Content object to markdown with YAML frontmatter
const markdown = contentToString(content);
/*
---
title: Article Title
author: Author Name
type: article
status: published
---
Content body text here...
*/

// Parse markdown string back to content data
const contentData = stringToContent(markdown);
const newContent = new Content(contentData);
```

### AI-Powered Analysis

Content objects inherit SMRT's AI capabilities through `do()` and `is()` methods:

**Content Analysis**:
```typescript
// Analyze content characteristics
const isFactual = await content.is('presenting factual information');
const isAcademic = await content.is('written in academic style');
const hasEvidence = await content.is('supported by citations');

// Extract structured information
const topics = await content.do('Extract main topics as JSON array');
const sentiment = await content.do('Analyze sentiment: positive, negative, neutral');
const summary = await content.do('Create a 2-sentence summary');
```

**Content Transformation**:
```typescript
// Generate derivatives
const outline = await content.do('Create a hierarchical outline');
const bullets = await content.do('Convert to bullet points');
const abstract = await content.do('Write a 150-word abstract');

// Quality enhancement
const improved = await content.do('Improve clarity and readability');
const keywords = await content.do('Extract 10 relevant keywords');
```

**Reference Analysis**:
```typescript
// Work with content references
await content.addReference(relatedContent);
await content.addReference('https://external-source.com');

const references = await content.getReferences();
const networkAnalysis = await content.do(
  'Analyze how this content relates to its references'
);
```

## Content Processing Workflows

### Web Content Mirroring

The `Contents.mirror()` method provides automated web content extraction:

```typescript
import { Contents } from '@have/content';

const contents = await Contents.create({
  db: { url: 'sqlite:./content.db' }
});

// Mirror content from URL - automatically extracts and saves
const mirrored = await contents.mirror({
  url: 'https://example.com/article',
  context: 'research_sources',
  mirrorDir: './cache'
});

// Content is automatically processed:
console.log(mirrored.title);  // Generated from URL path
console.log(mirrored.body);   // Extracted text content
console.log(mirrored.type);   // Set to 'mirror'
```

### Document Processing Pipeline

Complete workflow for processing documents:

```typescript
import { Document, Content, Contents } from '@have/content';

// Process PDF document
const doc = await Document.create({
  url: 'https://example.com/research.pdf',
  cacheDir: './document-cache'
});

// Extract text (cached for performance)
const extractedText = await doc.getText();

// Create content from extracted text
const content = new Content({
  title: 'Research Paper Analysis',
  body: extractedText,
  type: 'document',
  fileKey: doc.localPath,
  source: 'pdf_extraction',
  original_url: 'https://example.com/research.pdf',
  status: 'published'
});

await content.initialize();
await content.save();

// AI-powered document analysis
const documentType = await content.do('Classify document type: academic, legal, technical, business');
const keyFindings = await content.do('Extract top 5 key findings as JSON array');
const hasPersonalInfo = await content.is('containing personal or sensitive information');
```

### Markdown Export and Synchronization

Export content collections to filesystem:

```typescript
import { Contents } from '@have/content';

const contents = await Contents.create({
  db: { url: 'sqlite:./content.db' },
  contentDir: './content-export'
});

// Export all article-type content to filesystem
await contents.syncContentDir({
  contentDir: './exported-content'
});

// Manual file writing with custom structure
await contents.writeContentFile({
  content: article,
  contentDir: './custom-export'
});
```

**Generated File Structure:**
```
exported-content/
├── research_sources/
│   ├── ai-trends/
│   │   └── index.md
│   └── machine-learning/
│       └── index.md
└── articles/
    └── content-processing/
        └── index.md
```

**File Format (YAML frontmatter + content):**
```yaml
---
title: AI in Content Processing
slug: ai-content-processing
context: research_sources
author: Research Team
publish_date: 2024-01-15T10:00:00.000Z
---
# AI in Content Processing

Large language models have revolutionized how we process...
```

## Integration with SMRT Framework

### SMRT Decorator Configuration

The `Content` class uses SMRT decorators for automatic feature generation:

```typescript
@smrt({
  api: {
    include: ['list', 'get', 'create', 'update', 'delete'], // Full CRUD REST API
  },
  mcp: {
    include: ['list', 'get', 'create', 'update'], // AI-accessible MCP tools
  },
  cli: true, // Enable CLI commands for content management
})
export class Content extends SmrtObject {
  // Automatic REST API endpoints
  // MCP tool integration for AI systems
  // CLI command support
}
```

**Generated Capabilities:**
- **REST API**: Automatic endpoints for all CRUD operations
- **MCP Tools**: AI systems can directly manage content via tools
- **CLI Commands**: Command-line interface for content operations
- **Database Schema**: Automatic table creation and migration

### Dependencies and Integration

The content package integrates with multiple HAVE SDK packages:

```typescript
// Internal dependencies (from package.json)
"@have/smrt": "workspace:*",      // Core framework
"@have/pdf": "workspace:*",       // PDF text extraction
"@have/spider": "workspace:*",    // Web content extraction (via Document)
"@have/files": "workspace:*",     // File operations, caching
"@have/utils": "workspace:*",     // Utility functions (makeSlug, etc.)

// External dependencies
"yaml": "^2.8.1"                  // YAML frontmatter processing
```

### Collection Operations

Advanced querying and batch operations through SMRT collections:

```typescript
import { Contents } from '@have/content';

const contents = await Contents.create({
  db: { url: 'sqlite:./content.db' }
});

// SMRT collection methods
const content = await contents.get({ id: 'content-id' });
const created = await contents.create({ title: 'New Content' });
await contents.update('content-id', { status: 'published' });
await contents.delete('content-id');

// Advanced querying
const results = await contents.list({
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
  title: 'Unique Content Title',
  body: 'Content body'
});
```

## Development and Testing

### Package Setup

```bash
# Navigate to content package
cd packages/content

# Install dependencies
bun install

# Run tests (requires OPENAI_API_KEY for AI integration tests)
OPENAI_API_KEY=your_key bun test

# Build package
bun run build

# Development mode with auto-rebuild
bun run build:watch

# Run development server (includes Svelte UI)
bun run dev
```

### Testing Strategy

The package includes comprehensive tests:

```typescript
// Example from contents.spec.ts
it('should be able to getOrInsert a content item', async () => {
  const contents = await Contents.create({
    ai: {
      type: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
    },
    db: {
      url: getTestDbUrl('getOrInsert'),
    },
  });

  const fakeContentData = {
    title: faker.lorem.sentence(),
    body: faker.lorem.paragraph(),
    author: faker.person.fullName(),
    publish_date: faker.date.recent(),
  };

  const content = await contents.getOrUpsert(fakeContentData);
  expect(content.id).toBeDefined();
});
```

### Performance Considerations

**Caching**: The Document class automatically caches extraction results to avoid reprocessing large files.

**Batch Operations**: Use Contents collection methods for efficient batch processing of multiple content items.

**Database Optimization**: SMRT handles database schema creation and optimization automatically.

## Key Features Summary

✅ **SMRT-Specific Module**: Excluded from main build, requires SMRT framework
✅ **Comprehensive Metadata**: Rich content properties with flexible schema
✅ **Document Processing**: PDF and text file content extraction with caching
✅ **Web Content Mirroring**: Automated URL content extraction and storage
✅ **AI Integration**: Built-in content analysis via inherited SMRT methods
✅ **Markdown Export**: YAML frontmatter + content body filesystem sync
✅ **Reference Management**: Content linking and relationship tracking
✅ **Full CRUD Operations**: Database persistence with automatic schema management
✅ **REST API Generation**: Automatic endpoints via SMRT decorators
✅ **MCP Tool Integration**: AI-accessible content management tools
✅ **CLI Support**: Command-line interface for content operations
✅ **TypeScript Support**: Full type safety and IntelliSense

## Integration Examples

<div className="row">
  <div className="col col--4">
    <div className="feature-card">
      <h3>📄 PDF Processing</h3>
      <p>Extract and analyze content from PDF documents with automatic caching</p>
      <a href="/docs/supporting-libraries/pdf" className="nav-pill">Explore PDF →</a>
    </div>
  </div>
  <div className="col col--4">
    <div className="feature-card">
      <h3>🕷️ Web Scraping</h3>
      <p>Integrate with Spider for comprehensive web content processing</p>
      <a href="/docs/supporting-libraries/spider" className="nav-pill">Explore Spider →</a>
    </div>
  </div>
  <div className="col col--4">
    <div className="feature-card">
      <h3>🗄️ SMRT Framework</h3>
      <p>Learn about the core framework that powers content processing</p>
      <a href="/docs/smrt-framework/overview" className="nav-pill">SMRT Overview →</a>
    </div>
  </div>
</div>

---

<div className="callout info">
  <strong>💡 SMRT Module:</strong> The @have/content package is specifically designed as a SMRT module and is not part of the main SDK build pipeline. It provides specialized content processing capabilities for SMRT-based applications with full AI integration and automatic API generation.
</div>