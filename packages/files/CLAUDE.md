# @happyvertical/files

Filesystem operations. Factory: `getFilesystem(options): Promise<FilesystemInterface>`.

## Providers

local, gdrive. S3 and WebDAV are type-validated but not registered by default.
Custom providers: `registerProvider(type, asyncFactory)`.

## Key patterns

- Providers registered via `initializeProviders()` in `src/shared/factory.ts`
- Auto-detection: omitting `type` infers from options shape (defaults to `local` in Node.js)
- Google Drive accepts 3 auth paths: OAuth2, serviceAccountKey, or accessToken

## Gotchas

- Path normalization strips leading slashes — surprising with absolute paths
- Provider import errors are silently swallowed at init — fails only on use
- Legacy API exists in `src/legacy.ts` and `src/filesystem.ts` — prefer `src/shared/factory.ts`
