---
id: files
title: "@happyvertical/files: File System Operations"
sidebar_label: "@happyvertical/files"
sidebar_position: 3
---

# @happyvertical/files: File System Operations

Tools for interacting with file systems (local and remote) with Node.js-focused operations.

## Overview

The `@happyvertical/files` package provides comprehensive file system operations:

- **📁 File Operations**: Read, write, copy, move, delete files
- **📂 Directory Management**: Create, list, traverse directories
- **🔍 File Search**: Find files by pattern, content, metadata
- **📊 File Analysis**: Size, type, metadata extraction
- **🔗 Path Utilities**: Cross-platform path handling

## Quick Start

```typescript
import { getFilesystem } from '@happyvertical/files';

// Create a local filesystem instance
const fs = await getFilesystem({ type: 'local', basePath: '/app/data' });

// Read file content
const content = await fs.read('file.txt');

// Write file content
await fs.write('output.txt', 'Hello World');

// List directory contents
const fileList = await fs.list('.');

// List with filter
const markdownFiles = await fs.list('.', { filter: /\.md$/, recursive: true });
```

## File Operations

```typescript
import { getFilesystem } from '@happyvertical/files';

const fs = await getFilesystem({ type: 'local' });

// Basic file operations
await fs.copy('/source/file.txt', '/dest/file.txt');
await fs.move('/old/path.txt', '/new/path.txt');
await fs.delete('/path/to/file.txt');

// Directory operations
await fs.createDirectory('/new/path', { recursive: true });

// File metadata
const stats = await fs.getStats('/path/to/file');
console.log('Size:', stats.size, 'bytes');
console.log('Modified:', stats.mtime);
```

## Integration Examples

```typescript
import { getFilesystem } from '@happyvertical/files';
import path from 'path';

// Export content to files
async function exportContentToMarkdown(content: Content, outputDir: string) {
  const fs = await getFilesystem({ type: 'local', basePath: outputDir });

  const filename = `${content.slug || content.id}.md`;
  const markdown = `# ${content.title}\n\n${content.body}`;

  await fs.write(filename, markdown);
  return path.join(outputDir, filename);
}
```

*Full documentation coming soon...*