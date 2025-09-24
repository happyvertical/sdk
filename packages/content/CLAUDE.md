# @have/content: Content Processing Module

## Purpose and Responsibilities

The `@have/content` package provides content processing capabilities for the HAVE SDK, specifically designed to work with the SMRT framework. It handles:

- **Document Processing**: Unified interface for working with documents of various types
- **Content Management**: Structured content objects with AI-powered analysis capabilities
- **Collection Management**: Batch operations and content organization
- **SMRT Integration**: Built on SMRT SmrtObject and SmrtCollection for consistent database operations

This package was separated from the core SMRT framework to provide modular content processing while keeping the SMRT core lean and focused.

## Key Components

### Content Class
Represents individual pieces of content with AI analysis capabilities:
- Extends SMRT SmrtObject for database persistence
- Content text processing and analysis
- AI-powered content operations via inherited `is()` and `do()` methods

### Contents Class
Collection management for Content objects:
- Extends SMRT SmrtCollection for CRUD operations
- Bulk content analysis and processing
- Content search and filtering

### Document Class
Specialized content type for document handling:
- File-based content processing
- Document metadata management
- Integration with PDF and spider packages for content extraction

### Utility Functions
- `contentToString()`: Convert content objects to string representation
- `stringToContent()`: Parse strings back to content objects

## Dependencies

### Internal HAVE SDK Dependencies
- **@have/smrt**: Core framework (SmrtObject, SmrtCollection)
- **@have/pdf**: PDF document processing capabilities
- **@have/spider**: Web content extraction and processing

### Development Dependencies
- **@types/node**: TypeScript definitions for Node.js
- **typescript**: TypeScript compiler
- **vitest**: Testing framework

## Usage Example

```typescript
import { Content, Contents, Document } from '@have/content';

// Create content instance
const content = new Content({
  text: 'Sample content text',
  source: 'manual-input',
  metadata: { author: 'user', type: 'article' }
});

// Use AI-powered analysis (inherited from SmrtObject)
const summary = await content.do('Summarize this content in one sentence');
const isImportant = await content.is('Contains important information');

// Save to database (inherited from SmrtObject)
await content.save();

// Work with collections
const contents = new Contents({});
await contents.add(content);

// Search and filter
const articles = await contents.list({
  where: { 'metadata.type': 'article' }
});
```

## Integration with SMRT

The content package is designed as a SMRT module, meaning:
- All classes extend SMRT base classes
- Database operations are handled automatically
- AI capabilities are built-in via SMRT's AI integration
- Follows SMRT patterns for consistency

## Development

```bash
# Build the package
bun run build

# Run tests
bun run test

# Development mode
bun run dev
```

This package enables powerful content processing workflows while maintaining the modular architecture and AI-first design principles of the HAVE SDK.