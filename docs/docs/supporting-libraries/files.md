---
id: files
title: "@have/files: File System Operations"
sidebar_label: "@have/files"
sidebar_position: 3
---

# @have/files: File System Operations

Tools for interacting with file systems (local and remote) with Node.js-focused operations.

## Overview

The `@have/files` package provides comprehensive file system operations:

- **📁 File Operations**: Read, write, copy, move, delete files
- **📂 Directory Management**: Create, list, traverse directories
- **🔍 File Search**: Find files by pattern, content, metadata
- **📊 File Analysis**: Size, type, metadata extraction
- **🔗 Path Utilities**: Cross-platform path handling

## Quick Start

```typescript
import { FilesTool } from '@have/files';

const files = new FilesTool();

// Read file content
const content = await files.readFile('/path/to/file.txt');

// Write file content
await files.writeFile('/path/to/output.txt', 'Hello World');

// List directory contents
const fileList = await files.listFiles('/path/to/directory');

// Search for files
const markdownFiles = await files.findFiles('**/*.md', '/project/docs');
```

## File Operations

```typescript
// Basic file operations
await files.copyFile(source, destination);
await files.moveFile(oldPath, newPath);
await files.deleteFile(filePath);

// Directory operations
await files.createDirectory('/new/path');
await files.deleteDirectory('/old/path', { recursive: true });

// File metadata
const stats = await files.getFileStats('/path/to/file');
const size = await files.getFileSize('/path/to/file');
const type = await files.getFileType('/path/to/file');
```

## Integration Examples

```typescript
// Export content to files
async function exportContentToMarkdown(content: Content, outputDir: string) {
  const files = new FilesTool();

  const filename = `${content.slug || content.id}.md`;
  const filepath = path.join(outputDir, filename);

  const markdown = `# ${content.title}\n\n${content.body}`;

  await files.writeFile(filepath, markdown);
  return filepath;
}
```

*Full documentation coming soon...*