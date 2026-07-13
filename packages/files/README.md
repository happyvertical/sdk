# @happyvertical/files

Unified filesystem interface for the HAVE SDK. Provides a consistent API across local filesystem (Node.js `fs/promises`) and Google Drive, with rate-limited fetch utilities and legacy compatibility helpers.

## Installation

```bash
pnpm add @happyvertical/files
```

> Published to public npm. Depends on `@happyvertical/utils`.

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

### Secure ZIP Manifest Inspection

Inspect untrusted ZIP metadata before deciding whether to accept an upload:

```typescript
import {
  inspectZipManifest,
  ZipManifestError,
  ZipManifestLimitError,
} from '@happyvertical/files';

try {
  const manifest = inspectZipManifest(zipBytes, {
    maxEntries: 2_000,
    maxEntryUncompressedBytes: 50 * 1024 * 1024,
    maxTotalUncompressedBytes: 500 * 1024 * 1024,
  });

  const files = manifest.entries
    .filter((entry) => entry.type === 'file')
    .map(({ path, size }) => ({ path, size }));
} catch (error) {
  if (error instanceof ZipManifestLimitError) {
    console.error(error.limit, error.actual, error.maximum);
  } else if (error instanceof ZipManifestError) {
    console.error(error.code, error.message);
  }
}
```

`inspectZipManifest()` reads and cross-checks central-directory and local-header
metadata only. It does not decompress or materialize file bodies. Paths are
returned with `/` separators and `.`/empty segments removed; names containing
ordinary spaces remain valid. The whole archive is rejected for parent
traversal, absolute/drive-qualified paths, NUL bytes, symlinks, Unix special
files, normalized path collisions, or file/descendant path conflicts.

Default limits are 10,000 entries, 200 MiB per entry, 2 GiB aggregate declared
uncompressed size, and 1,024 encoded path bytes. Entry count includes directory
entries, and aggregate size includes every entry. All limits are configurable
with non-negative safe integers. The entry limit also bounds cumulative
central-directory work while disambiguating end records in hostile comments.

Policy is deliberately strict: ZIP64, encrypted, multi-disk, malformed,
truncated, and non-UTF-8-name archives are rejected with typed errors. Stored
entries must also declare identical compressed and uncompressed sizes. Entry
names use strict UTF-8 decoding whether or not the UTF-8 flag is set, so
common macOS ZIPs with valid names remain compatible. Info-ZIP and Xceed
Unicode path extra fields are rejected so an extractor cannot select a
different path from the one inspected. PKWARE and ASi Unix extra fields are
likewise rejected because they can supply link targets; libarchive's `xl`
field is rejected because it can override the inspected file type. These
alternate-metadata cases, along with contradictory Unix file and directory
attributes, use
`UnsupportedZipFeatureError` with the `ambiguous-metadata` feature. This API is
a metadata preflight, not an extraction API; consumers that later extract an
accepted archive must still use an extraction destination and library with
equivalent path and symlink protections.

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

**Archive inspection**: `inspectZipManifest`, `DEFAULT_ZIP_MANIFEST_LIMITS`, `ZipManifestError`, `InvalidZipArchiveError`, `UnsafeZipEntryError`, `ZipManifestLimitError`, `UnsupportedZipFeatureError`

**Errors**: `FilesystemError`, `FileNotFoundError`, `PermissionError`, `DirectoryNotEmptyError`, `InvalidPathError`

**Legacy**: `isFile`, `isDirectory`, `ensureDirectoryExists`, `download`, `upload`, `downloadFileWithCache`, `listFiles`, `getCached`, `setCached`, `getMimeType`

## Dependencies

- `@happyvertical/utils` — temp directory management
- `googleapis` / `google-auth-library` — Google Drive provider
