# @have/files: File System Interface Package

## Purpose and Responsibilities

The `@have/files` package provides a standardized interface for file system operations, supporting both local and potentially remote file systems. Its core responsibilities include:

- Reading and writing files with consistent APIs
- Managing directory creation and navigation
- Handling file paths across different platforms
- Supporting temporary file operations
- Providing utilities for common file operations

This package abstracts away the complexities of different file systems, allowing other packages to work with files in a consistent way regardless of the underlying storage.

## Key APIs

### Basic File Operations

```typescript
import { readFile, writeFile, fileExists } from '@have/files';

// Read a file
const content = await readFile('/path/to/file.txt');

// Write a file (creates directories if needed)
await writeFile('/path/to/new/file.txt', 'File content');

// Check if a file exists
const exists = await fileExists('/path/to/file.txt');
```

### Directory Operations

```typescript
import { 
  createDirectory, 
  ensureDirectory, 
  listDirectory 
} from '@have/files';

// Create a directory
await createDirectory('/path/to/new/dir');

// Ensure a directory exists (creates if it doesn't)
await ensureDirectory('/path/to/another/dir');

// List directory contents
const files = await listDirectory('/path/to/dir');
```

### Temporary Files

```typescript
import { 
  getTempDirectory, 
  createTempFile, 
  createTempDirectory 
} from '@have/files';

// Get path to a temporary directory
const tempDir = getTempDirectory('my-app');

// Create a temporary file
const { path, cleanup } = await createTempFile({ 
  prefix: 'data-', 
  extension: '.json',
  content: '{"key": "value"}'
});
// Use the file...
// Then clean it up
await cleanup();

// Create a temporary directory
const { path, cleanup } = await createTempDirectory('temp-data');
// Use the directory...
// Then clean it up
await cleanup();
```

### Path Utilities

```typescript
import { 
  resolvePath, 
  getExtension, 
  getFilename, 
  getDirectory 
} from '@have/files';

// Resolve a path (handles relative paths)
const absolutePath = resolvePath('~/documents/file.txt');

// Get file extension
const ext = getExtension('/path/to/document.pdf'); // => 'pdf'

// Get filename
const filename = getFilename('/path/to/document.pdf'); // => 'document.pdf'

// Get directory path
const dir = getDirectory('/path/to/document.pdf'); // => '/path/to'
```

### Content Handling

```typescript
import { 
  readJson, 
  writeJson, 
  readLines,
  appendFile
} from '@have/files';

// Read JSON file
const data = await readJson('/path/to/config.json');

// Write JSON file
await writeJson('/path/to/data.json', { key: 'value' });

// Read file line by line
const lines = await readLines('/path/to/log.txt');

// Append to file
await appendFile('/path/to/log.txt', 'New log entry\n');
```

## Dependencies

The package has minimal dependencies:

- `@have/utils`: For utility functions like path handling and temporary directory management

No external file system libraries are used, leveraging Node.js's built-in `fs/promises` module for most operations.

## Development Guidelines

### Error Handling

File operations can fail for various reasons (permissions, disk space, etc.). Handle these cases appropriately:

```typescript
try {
  await writeFile('/path/to/file.txt', 'content');
} catch (error) {
  if (error.code === 'ENOENT') {
    // Handle "no such file or directory" error
  } else if (error.code === 'EACCES') {
    // Handle permission error
  } else {
    // Handle other errors
  }
}
```

### Path Normalization

Always normalize paths to ensure consistency across different platforms:

```typescript
// Using built-in functions
const normalizedPath = resolvePath('~/documents/file.txt');
```

### Testing

The package includes tests for verifying file operations:

```bash
pnpm test        # Run tests once
pnpm test:watch  # Run tests in watch mode
```

Tests use temporary directories to avoid affecting the real file system.

### Building

Build the package with:

```bash
pnpm build       # Build once
pnpm build:watch # Build in watch mode
```

### Best Practices

- Always clean up temporary files and directories
- Use async/await with file operations to avoid blocking the event loop
- Prefer streaming for large files to manage memory usage
- Handle path separators carefully for cross-platform compatibility
- Use appropriate file permissions when creating files
- Consider file locking for operations that need exclusive access
- Dont include branding in commit messages

This package provides the foundation for file operations across the HAVE SDK, ensuring consistent behavior regardless of the environment.