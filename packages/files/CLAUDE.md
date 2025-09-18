# @have/files: File System Interface Package

## Purpose and Responsibilities

The `@have/files` package provides a standardized interface for file system operations with multi-provider support. It serves as the file system abstraction layer for the HAVE SDK and handles:

- **Local and Remote File Systems**: Unified API for local filesystem, S3-compatible services, Google Drive, WebDAV (Nextcloud/ownCloud), and browser storage
- **Cross-Platform Operations**: Consistent file operations across different platforms and storage backends
- **Stream Processing**: Efficient handling of large files through Node.js streams and Web Streams
- **Temporary File Management**: Secure temporary file creation with automatic cleanup
- **Caching and Performance**: Built-in caching for remote files and optimized data transfer
- **Legacy Compatibility**: Backward compatibility with existing @have/files APIs
- **Path Normalization**: Cross-platform path handling and URL-to-filesystem conversion

This package abstracts away the complexities of different file systems, allowing other packages to work with files consistently regardless of the underlying storage provider.

**Expert Agent Expertise**: When working with this package, always proactively check the latest Node.js LTS documentation for fs/promises, path, and stream modules as they frequently add new methods, performance improvements, and security enhancements that can benefit file operations.

## Key APIs

### Provider Factory and Configuration

```typescript
import { getFilesystem, getAvailableProviders } from '@have/files';

// Get local filesystem provider
const fs = await getFilesystem({ type: 'local', basePath: '/app/data' });

// Get S3-compatible provider
const s3fs = await getFilesystem({
  type: 's3',
  region: 'us-east-1',
  bucket: 'my-bucket',
  accessKeyId: 'your-key',
  secretAccessKey: 'your-secret'
});

// Get WebDAV provider (Nextcloud/ownCloud)
const webdavfs = await getFilesystem({
  type: 'webdav',
  baseUrl: 'https://cloud.example.com',
  username: 'user',
  password: 'pass',
  davPath: '/remote.php/dav/files/user/'
});

// List available providers
const providers = getAvailableProviders();
console.log(providers); // ['local', 's3', 'webdav', ...]
```

### Core File Operations

```typescript
import { getFilesystem } from '@have/files';

const fs = await getFilesystem({ type: 'local' });

// Read file with encoding options
const content = await fs.read('/path/to/file.txt', { encoding: 'utf-8' });

// Read binary data
const buffer = await fs.read('/path/to/image.png', { raw: true });

// Write file with parent directory creation
await fs.write('/path/to/new/file.txt', 'Content', { 
  createParents: true,
  encoding: 'utf-8'
});

// Check file existence
const exists = await fs.exists('/path/to/file.txt');

// Copy and move files
await fs.copy('/source/file.txt', '/dest/file.txt');
await fs.move('/old/path.txt', '/new/path.txt');

// Delete files and directories
await fs.delete('/path/to/file.txt');
```

### Directory Management

```typescript
// Create directory with options
await fs.createDirectory('/path/to/new/dir', {
  recursive: true,
  mode: 0o755
});

// List directory contents with filtering
const files = await fs.list('/path/to/dir', {
  recursive: true,
  filter: /\.js$/,
  detailed: true
});

// Access detailed file information
for (const file of files) {
  console.log(`${file.name}: ${file.size} bytes, modified: ${file.lastModified}`);
  console.log(`Type: ${file.isDirectory ? 'Directory' : 'File'}`);
  console.log(`MIME: ${file.mimeType}`);
}
```

### Stream Processing for Large Files

```typescript
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

// Stream large file processing
const readStream = createReadStream('/path/to/large/file.txt');
const writeStream = createWriteStream('/path/to/output.txt');

// Transform stream example
const transformStream = new Transform({
  transform(chunk, encoding, callback) {
    // Process chunk
    this.push(chunk.toString().toUpperCase());
    callback();
  }
});

await pipeline(readStream, transformStream, writeStream);

// Web Streams support (Node.js 22+)
const file = await fs.open('/path/to/file.txt');
for await (const chunk of file.readableWebStream()) {
  console.log(chunk);
}
await file.close();
```

### Temporary File Management

```typescript
import { createTempFile, createTempDirectory } from '@have/files';

// Create temporary file with auto-cleanup
const { path: tempFile, cleanup: cleanupFile } = await createTempFile({
  prefix: 'data-',
  extension: '.json',
  content: JSON.stringify({ key: 'value' })
});

try {
  // Use temporary file
  const data = await fs.read(tempFile);
  console.log(JSON.parse(data));
} finally {
  // Always clean up
  await cleanupFile();
}

// Create temporary directory
const { path: tempDir, cleanup: cleanupDir } = await createTempDirectory('processing');
try {
  // Use temporary directory for batch operations
  await fs.write(`${tempDir}/file1.txt`, 'data1');
  await fs.write(`${tempDir}/file2.txt`, 'data2');
} finally {
  await cleanupDir();
}
```

### Cross-Platform Path Utilities

```typescript
import path from 'path';

// Modern path handling with Node.js built-ins
const absolutePath = path.resolve('~/documents/file.txt');
const normalizedPath = path.normalize('./folder/../file.txt');

// Cross-platform path joining
const filePath = path.join(process.cwd(), 'data', 'files', 'document.pdf');

// Path analysis
const pathInfo = path.parse('/home/user/documents/file.txt');
console.log(pathInfo);
// {
//   root: '/',
//   dir: '/home/user/documents',
//   base: 'file.txt',
//   ext: '.txt',
//   name: 'file'
// }

// Platform-specific operations
const isAbsolute = path.isAbsolute('/home/user/file.txt'); // true
const relativePath = path.relative('/home/user', '/home/user/documents/file.txt'); // documents/file.txt

// Extract components
const extension = path.extname('/path/to/document.pdf'); // '.pdf'
const filename = path.basename('/path/to/document.pdf'); // 'document.pdf'
const directory = path.dirname('/path/to/document.pdf'); // '/path/to'
```

### Remote File Operations

```typescript
// Upload local file to remote storage
await fs.upload('/local/file.txt', '/remote/path/file.txt', {
  contentType: 'text/plain',
  overwrite: true,
  metadata: { author: 'user', version: '1.0' },
  onProgress: (progress) => {
    console.log(`Upload: ${progress.loaded}/${progress.total} bytes`);
  }
});

// Download with caching
const localPath = await fs.download('/remote/file.txt', null, {
  force: false, // Use cache if available
  onProgress: (progress) => {
    console.log(`Download: ${progress.loaded}/${progress.total} bytes`);
  }
});

// Download with cache control
const cachedPath = await fs.downloadWithCache('/remote/large-file.zip', {
  expiry: 24 * 60 * 60 * 1000, // 24 hours
  force: false
});
```

### Caching Operations

```typescript
// Manual cache management
await fs.cache.set('user-data', JSON.stringify(userData));

const cachedData = await fs.cache.get('user-data', 300000); // 5 minutes expiry
if (cachedData) {
  const userData = JSON.parse(cachedData);
}

// Clear specific cache entry
await fs.cache.clear('user-data');

// Clear all cache
await fs.cache.clear();
```

### Legacy API Compatibility

```typescript
// Legacy functions still available for backward compatibility
import { 
  isFile, 
  isDirectory, 
  ensureDirectoryExists,
  download,
  upload,
  listFiles,
  getCached,
  setCached 
} from '@have/files';

// Check file type (legacy)
const fileStats = await isFile('/path/to/file.txt');
if (fileStats) {
  console.log('File size:', fileStats.size);
}

// Directory operations (legacy)
const isDir = await isDirectory('/path/to/dir');
await ensureDirectoryExists('/path/to/new/dir');

// File listing (legacy)
const files = await listFiles('/path/to/dir', { match: /\.txt$/ });
```

## Dependencies

The package has carefully chosen dependencies for optimal performance:

### Internal Dependencies
- **@have/utils**: Core utilities for path handling, temporary directory management, and cross-platform operations

### Runtime Dependencies
- **Node.js fs/promises**: Modern async file system operations
- **Node.js path**: Cross-platform path manipulation and normalization
- **Node.js stream**: Efficient large file processing through streams

### Provider-Specific Dependencies (Optional)
- **AWS SDK v3**: For S3-compatible storage providers
- **Google APIs**: For Google Drive integration
- **WebDAV clients**: For Nextcloud/ownCloud/Apache WebDAV servers
- **Browser APIs**: IndexedDB for browser-based storage

The core package uses only Node.js built-ins for local filesystem operations, with optional external dependencies loaded dynamically when specific providers are used.

## Development Guidelines

### Multi-Provider Architecture

The package uses a provider pattern for different storage backends:

```typescript
// Each provider implements the FilesystemInterface
interface FilesystemInterface {
  exists(path: string): Promise<boolean>;
  read(path: string, options?: ReadOptions): Promise<string | Buffer>;
  write(path: string, content: string | Buffer, options?: WriteOptions): Promise<void>;
  // ... other methods
}

// Providers are registered and available based on runtime environment
const availableProviders = getAvailableProviders();
```

### Error Handling and Recovery

Implement comprehensive error handling for different failure modes:

```typescript
import { 
  FilesystemError, 
  FileNotFoundError, 
  PermissionError,
  DirectoryNotEmptyError 
} from '@have/files';

try {
  await fs.write('/protected/file.txt', 'content');
} catch (error) {
  if (error instanceof FileNotFoundError) {
    console.error('File not found:', error.path);
  } else if (error instanceof PermissionError) {
    console.error('Permission denied:', error.path);
  } else if (error.code === 'ENOSPC') {
    console.error('Disk full');
  } else if (error.code === 'ENOTEMPTY') {
    console.error('Directory not empty');
  } else {
    console.error('Unexpected error:', error.message);
  }
}
```

### Stream Processing Best Practices

Use streams for large files to manage memory efficiently:

```typescript
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';

// Compress large file without loading into memory
const input = createReadStream('/path/to/large/file.txt');
const gzip = createGzip();
const output = createWriteStream('/path/to/compressed.gz');

await pipeline(input, gzip, output);

// Process files in chunks
async function processLargeFile(filePath: string) {
  const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });
  
  for await (const chunk of stream) {
    // Process chunk without loading entire file
    await processChunk(chunk);
  }
}
```

### Cross-Platform Considerations

Always use path utilities for cross-platform compatibility:

```typescript
// ✅ Good - cross-platform
const configPath = path.join(process.cwd(), 'config', 'app.json');
const absolutePath = path.resolve('./data/files');

// ❌ Bad - platform-specific
const badPath = process.cwd() + '/config/app.json'; // Unix-only
const windowsPath = 'C:\\data\\files'; // Windows-only

// Handle different path separators
const normalizedPath = path.normalize(userProvidedPath);
const posixPath = path.posix.join('home', 'user', 'file.txt'); // Always forward slashes
const winPath = path.win32.join('C:', 'Users', 'file.txt'); // Always backslashes
```

### Security Considerations

Implement secure file operations:

```typescript
// Validate and sanitize file paths
function validatePath(userPath: string): string {
  const normalized = path.normalize(userPath);
  
  // Prevent directory traversal
  if (normalized.includes('..')) {
    throw new Error('Directory traversal not allowed');
  }
  
  // Ensure path is within allowed base directory
  const basePath = '/app/data';
  const fullPath = path.resolve(basePath, normalized);
  
  if (!fullPath.startsWith(path.resolve(basePath))) {
    throw new Error('Path outside allowed directory');
  }
  
  return fullPath;
}

// Set appropriate file permissions
await fs.write('/path/to/sensitive.txt', 'data', { mode: 0o600 }); // Owner read/write only
await fs.createDirectory('/path/to/private', { mode: 0o700 }); // Owner access only
```

### Testing Strategies

```typescript
// Use temporary directories for tests
import { describe, it, beforeEach, afterEach } from 'vitest';

describe('FileSystem Tests', () => {
  let tempDir: string;
  let cleanup: () => Promise<void>;
  
  beforeEach(async () => {
    const temp = await createTempDirectory('test-files');
    tempDir = temp.path;
    cleanup = temp.cleanup;
  });
  
  afterEach(async () => {
    await cleanup();
  });
  
  it('should write and read files', async () => {
    const testFile = path.join(tempDir, 'test.txt');
    await fs.write(testFile, 'test content');
    const content = await fs.read(testFile);
    expect(content).toBe('test content');
  });
});
```

### Performance Optimization

```typescript
// Batch operations for multiple files
async function processMultipleFiles(files: string[]) {
  // Use Promise.all for independent operations
  const contents = await Promise.all(
    files.map(file => fs.read(file))
  );
  
  // Use for...of for dependent operations
  for (const file of files) {
    const content = await fs.read(file);
    await processContent(content);
  }
}

// Cache file stats when doing multiple operations
const statsCache = new Map();
async function getFileInfo(filePath: string) {
  if (!statsCache.has(filePath)) {
    statsCache.set(filePath, await fs.getStats(filePath));
  }
  return statsCache.get(filePath);
}
```

### Building and Testing

```bash
# Development workflow
bun test                    # Run tests once
bun test:watch             # Run tests in watch mode
bun run build              # Build both browser and node versions
bun run build:watch        # Build in watch mode
bun run dev                # Build and test in watch mode

# Build targets
bun run build:browser      # Browser-compatible build
bun run build:node         # Node.js-specific build
bun run clean              # Clean build artifacts
```

### Best Practices Summary

- **Always use path utilities** for cross-platform compatibility
- **Implement proper error handling** for all file operations
- **Use streams for large files** to manage memory efficiently
- **Clean up temporary files** promptly to avoid resource leaks
- **Validate file paths** to prevent security issues
- **Use appropriate file permissions** for sensitive data
- **Cache wisely** to improve performance without stale data
- **Test with temporary directories** to avoid side effects
- **Handle encoding explicitly** when working with text files
- **Use atomic operations** when data integrity is critical

## API Documentation

The @have/files package generates comprehensive API documentation in both HTML and markdown formats using TypeDoc:

### Generated Documentation Formats

**HTML Documentation** (recommended for browsing):
- Generated in `docs/` directory for public website
- Full API reference with interactive navigation
- Cross-linked type definitions and examples
- Accessible via development server at `http://localhost:3030/`

**Markdown Documentation** (great for development):
- Generated in `packages/files/docs/` directory
- Markdown format perfect for IDE integration
- Accessible via development server at `http://localhost:3030/packages/files/`

### Generating Documentation

```bash
# Generate documentation for this package
npm run docs

# Generate and watch for changes during development
npm run docs:watch

# Start development server to browse documentation
npm run dev  # Serves docs at http://localhost:3030
```

### Development Workflow

Documentation is automatically generated during the build process and can be viewed alongside development:

1. **During Development**: Use `npm run docs:watch` to regenerate docs as you code
2. **Local Browsing**: Access HTML docs at `http://localhost:3030/` or markdown at `http://localhost:3030/packages/files/`
3. **IDE Integration**: Point your editor to `packages/files/docs/` for offline markdown reference

The documentation includes complete API coverage, usage examples, and cross-references to related HAVE SDK packages.

## Documentation Links

Always reference the latest Node.js LTS documentation when implementing file system solutions, as the core modules frequently receive performance improvements and new features:

### Core Node.js Modules
- **Node.js fs/promises API**: [https://nodejs.org/api/fs.html](https://nodejs.org/api/fs.html)
  - Complete async file system operations including new Web Streams support
  - Check for new methods like `filehandle.readableWebStream()` and async disposal patterns
  
- **Node.js path module**: [https://nodejs.org/api/path.html](https://nodejs.org/api/path.html)
  - Cross-platform path manipulation and normalization utilities
  - Review for new methods like `path.matchesGlob()` (Node.js 22+)
  
- **Node.js stream API**: [https://nodejs.org/api/stream.html](https://nodejs.org/api/stream.html)
  - Stream processing for efficient large file operations
  - Monitor for Web Streams integration and performance improvements

- **Complete Node.js API**: [https://nodejs.org/api/all.html](https://nodejs.org/api/all.html)
  - Comprehensive reference for all Node.js APIs and recent additions

### Expert Agent Instructions

When working with @have/files:

1. **Always check latest Node.js LTS documentation** before implementing solutions using WebFetch tool
2. **Stay current with fs/promises API changes** - new methods are regularly added
3. **Review stream module updates** for performance and memory optimization opportunities
4. **Check for new path manipulation methods** that can simplify cross-platform operations
5. **Look for security improvements** in file handling and permission management
6. **Monitor Web Streams integration** for modern async patterns

Example workflow:
```typescript
// Before implementing a file solution, check latest docs
await WebFetch('https://nodejs.org/api/fs.html', 'What are the latest fs/promises methods in Node.js LTS?');
// Then implement with current best practices using async/await
const content = await fs.promises.readFile(filePath, { encoding: 'utf-8' });
```

### Provider-Specific Documentation

When implementing or debugging specific providers:

- **AWS S3 SDK**: Latest S3 client documentation and best practices
- **Google Drive API**: Current API reference and authentication methods
- **WebDAV Protocol**: RFC 4918 and server-specific implementation guides
- **Browser Storage APIs**: IndexedDB and File System Access API documentation

This package provides the essential file system abstraction needed by AI agents and applications to work with data consistently across different storage environments while maintaining security, performance, and cross-platform compatibility.