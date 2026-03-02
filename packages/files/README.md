# @happyvertical/files

Unified filesystem interface for the HAVE SDK. Provides a consistent API across local filesystem (Node.js `fs/promises`) and Google Drive, with rate-limited fetch utilities and legacy compatibility helpers.

## Installation

```bash
pnpm add @happyvertical/files
```

> Published to GitHub Packages (`npm.pkg.github.com`). Requires `@happyvertical/utils` as a workspace dependency.

## Usage

### Factory Function

```typescript
import { getFilesystem } from '@happyvertical/files';

// Local filesystem (default)
const fs = await getFilesystem({ type: 'local', basePath: '/app/data' });

await fs.write('output/result.txt', 'Hello, world!');
const content = await fs.read('config.json');
const exists = await fs.exists('config.json');

// List files with filtering
const files = await fs.list('.', { filter: /\.json$/, detailed: true });
for (const file of files) {
  console.log(`${file.name}: ${file.size} bytes, ${file.mimeType}`);
}
```

### Google Drive

```typescript
import { getFilesystem } from '@happyvertical/files';

const fs = await getFilesystem({
  type: 'gdrive',
  clientId: 'xxx',
  clientSecret: 'yyy',
  refreshToken: 'zzz',
});

await fs.write('documents/readme.txt', 'Hello from Drive');
const content = await fs.read('documents/readme.txt');
```

Supports OAuth2, service account keys, and short-lived access tokens. Google Docs native formats are automatically exported (Docs → text, Sheets → CSV, etc.).

### File Operations

```typescript
await fs.copy('source.txt', 'backup/source-copy.txt');
await fs.move('temp.txt', 'archive/temp.txt');
await fs.createDirectory('secure-data', { mode: 0o700 });
await fs.delete('temporary-file.txt');

const stats = await fs.getStats('document.pdf');
console.log(`${stats.size} bytes, modified ${stats.mtime}`);
```

### Fetch Utilities

Rate-limited HTTP fetch helpers for downloading remote content:

```typescript
import { fetchText, fetchJSON, fetchBuffer, fetchToFile, addRateLimit } from '@happyvertical/files';

// Set per-domain rate limits
addRateLimit('api.github.com', 30, 60000);

const html = await fetchText('https://example.com');
const data = await fetchJSON('https://api.example.com/data');
const buf = await fetchBuffer('https://example.com/image.png');
await fetchToFile('https://example.com/file.zip', './downloads/file.zip');
```

### Error Handling

```typescript
import { FileNotFoundError, PermissionError, DirectoryNotEmptyError } from '@happyvertical/files';

try {
  await fs.read('missing.txt');
} catch (error) {
  if (error instanceof FileNotFoundError) {
    console.error('Not found:', error.path);
  } else if (error instanceof PermissionError) {
    console.error('Permission denied:', error.path);
  }
}
```

### Legacy Functions

Standalone functions from the original API, still exported for backward compatibility:

```typescript
import { isFile, isDirectory, ensureDirectoryExists, download, listFiles } from '@happyvertical/files';

const fileStats = isFile('/path/to/file.txt'); // synchronous
const isDir = isDirectory('/path/to/dir');     // synchronous
await ensureDirectoryExists('/path/to/new/dir');
await download('https://example.com/file.pdf', './file.pdf');
const files = await listFiles('/path/to/dir', { match: /\.json$/ });
```

## Providers

| Provider | Status | Options |
|----------|--------|---------|
| Local | Implemented | `basePath?` |
| Google Drive | Implemented | `clientId`, `clientSecret`, `refreshToken` (or `serviceAccountKey` / `accessToken`) |
| S3 | Types only | `region`, `bucket`, `accessKeyId?`, `secretAccessKey?` |
| WebDAV | Types only | `baseUrl`, `username`, `password` |

## API Overview

**Factory**: `getFilesystem(options)`, `registerProvider(type, factory)`, `getAvailableProviders()`, `isProviderAvailable(type)`, `getProviderInfo(type)`

**Provider classes**: `LocalFilesystemProvider`, `GoogleDriveProvider`

**Interface methods**: `exists`, `read`, `write`, `delete`, `copy`, `move`, `createDirectory`, `list`, `getStats`, `getMimeType`, `upload`, `download`, `downloadWithCache`, `cache.get/set/clear`, `getCapabilities`

**Fetch**: `fetchText`, `fetchJSON`, `fetchBuffer`, `fetchToFile`, `addRateLimit`, `getRateLimit`

**Errors**: `FilesystemError`, `FileNotFoundError`, `PermissionError`, `DirectoryNotEmptyError`, `InvalidPathError`

**Legacy**: `isFile`, `isDirectory`, `ensureDirectoryExists`, `download`, `upload`, `downloadFileWithCache`, `listFiles`, `getCached`, `setCached`, `getMimeType`

## Dependencies

- `@happyvertical/utils` — temp directory management
- `googleapis` / `google-auth-library` — Google Drive provider
