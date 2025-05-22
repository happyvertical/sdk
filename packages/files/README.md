# @have/files

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

File system interface abstraction layer for the HAVE SDK.

## Overview

The `@have/files` package provides a unified interface for working with file systems, supporting both local and remote file operations. It simplifies common file operations with a consistent API regardless of the underlying storage system.

## Features

- Unified API for local and remote file systems
- Promise-based interface for all operations
- Support for reading, writing, and manipulating files and directories
- Stream support for efficient handling of large files
- Metadata and attribute handling
- Extensible adapter system

## Installation

```bash
# Install with npm
npm install @have/files

# Or with yarn
yarn add @have/files

# Or with pnpm
pnpm add @have/files
```

## Usage

### Local File System

```typescript
import { LocalFileSystem } from '@have/files';

// Create a file system instance
const fs = new LocalFileSystem();

// Read a file
const content = await fs.readFile('/path/to/file.txt');
console.log(content);

// Write a file
await fs.writeFile('/path/to/output.txt', 'Hello, world!');

// Check if a file exists
const exists = await fs.exists('/path/to/file.txt');
console.log(`File exists: ${exists}`);

// List files in a directory
const files = await fs.readDir('/path/to/directory');
console.log(files);
```

### Remote File System (example with S3)

```typescript
import { S3FileSystem } from '@have/files';

// Create an S3 file system instance
const s3fs = new S3FileSystem({
  bucket: 'my-bucket',
  region: 'us-west-2',
  // Credentials are loaded from environment or AWS configuration
});

// Read a file from S3
const content = await s3fs.readFile('path/to/file.txt');
console.log(content);

// Write a file to S3
await s3fs.writeFile('path/to/output.txt', 'Hello, world!');

// List files in an S3 directory
const files = await s3fs.readDir('path/to/directory');
console.log(files);
```

## API Reference

See the [API documentation](https://happyvertical.github.io/sdk/modules/_have_files.html) for detailed information on all available methods and options.

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.