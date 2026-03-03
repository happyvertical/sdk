# @happyvertical/utils

Foundation utilities shared across all HAVE SDK packages. No factory -- import functions directly.

## Modules

- **IDs** -- `makeId('cuid2'|'uuid')`, `createId()` (CUID2), `isCuid()`
- **Strings** -- `makeSlug()`, `camelCase()`, `snakeCase()`, `keysToCamel()`, `keysToSnake()`, `pluralizeWord()`, `singularize()`
- **Dates** -- `formatDate()`, `parseDate()`, `dateInString()`, `prettyDate()`, `parseAmazonDateString()`, `addInterval()`
- **URLs** -- `isUrl()`, `urlFilename()`, `urlPath()`, `normalizeUrl()`, `generateScopeFromUrl()`, `hashPageContent()`
- **Errors** -- `BaseError`, `ValidationError`, `ApiError`, `FileError`, `NetworkError`, `DatabaseError`, `ParsingError`, `TimeoutError` (all carry `code`, `context`, `timestamp`)
- **Env config** -- `loadEnvConfig(options, { packageName, schema })` reads `HAVE_{PACKAGE}_*` env vars
- **Async** -- `sleep()`, `waitFor()` (polling with timeout)
- **Code** -- `extractCodeBlock()`, `extractJSON()`, `validateCode()`, `isSafeCode()`

## Key patterns

- Dual entry points: main (`index.ts`) for Node.js, `browser.ts` for browser-safe subset (no `node:crypto`, `node:vm`)
- `loadEnvConfig` is the standard env-var loader used by most HAVE packages (`HAVE_{PKG}_*` prefix)
- All error classes extend `BaseError` with `ErrorCode` enum, serializable via `.toJSON()`

## Gotchas

- `makeSlug()` converts `&` to `-38-`, not `-and-`
- `dateInString()` defaults day to 1 when only month + year are found
- `waitFor()` returns `undefined` results as "keep polling"; return a defined value to resolve
- Browser entry excludes `node:crypto` and `node:vm` dependent code
