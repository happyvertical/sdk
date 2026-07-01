# @happyvertical/utils

Foundation utilities for the HAVE SDK: ID generation, date parsing, URL handling, string conversion, error classes, logging, code extraction/validation/sandboxing, CLI argument parsing, and environment config loading.

## Installation

```bash
pnpm add @happyvertical/utils
```

A browser-safe entry point is available at `@happyvertical/utils/browser` (excludes Node.js-specific code like `node:vm` sandbox and `node:crypto` hashing).

## Usage

### ID Generation

```typescript
import { makeId, createId, isCuid } from '@happyvertical/utils';

const id = makeId();         // CUID2 (default)
const uuid = makeId('uuid'); // UUID via crypto.randomUUID()
const cuid = createId();     // CUID2 directly
isCuid(id);                  // true
```

### String & URL Utilities

```typescript
import { camelCase, snakeCase, keysToCamel, keysToSnake, makeSlug, urlFilename, isUrl } from '@happyvertical/utils';

camelCase('hello-world');      // "helloWorld"
snakeCase('helloWorld');       // "hello_world"
keysToCamel({ user_name: 'j' }); // { userName: 'j' } (recursive)
makeSlug('My Title & Co.');   // "my-title-38-co"
urlFilename('https://example.com/path/file.pdf'); // "file.pdf"
isUrl('https://example.com'); // true
```

### Date Utilities

```typescript
import { dateInString, formatDate, parseDate, parseAmazonDateString, addInterval } from '@happyvertical/utils';

dateInString('Report_January_15_2023.pdf'); // Date(2023, 0, 15)
formatDate(new Date(), 'yyyy-MM-dd');       // "2023-01-15"
parseDate('2023-01-15');                    // Date object (ISO)
parseDate('01/15/2023', 'MM/dd/yyyy');      // Date object (custom format)
parseAmazonDateString('20220223T215409Z');   // Date object
addInterval(new Date(), { days: 7 });       // Date 7 days from now
```

### Error Classes

All extend `BaseError` with `code`, `context`, and `timestamp` fields, plus `toJSON()`:

```typescript
import { ValidationError, ApiError, NetworkError, TimeoutError, ParsingError, FileError, DatabaseError } from '@happyvertical/utils';

throw new ValidationError('Invalid email', { field: 'email', value: input });
```

### Code Extraction & Sandbox

Extract code blocks from markdown/AI responses, validate, and execute in isolated `node:vm` contexts:

```typescript
import { extractCodeBlock, extractJSON, validateCode, executeInSandbox } from '@happyvertical/utils';

const code = extractCodeBlock(markdownText, 'javascript');
const data = extractJSON<{ name: string }>(aiResponse);

const result = validateCode(code, { maxLength: 10000 });
if (result.valid) {
  const output = executeInSandbox(code, { globals: { data }, timeout: 5000 });
}
```

### CLI Argument Parsing

```typescript
import { parseCliArgs } from '@happyvertical/utils';

const parsed = parseCliArgs(process.argv, [
  { name: 'build', description: 'Build project', options: { output: { type: 'string', description: 'Output dir' } } }
]);
// { command: 'build', args: [], options: { output: './dist' } }
```

### Environment Config

```typescript
import { loadEnvConfig } from '@happyvertical/utils';

// Loads HAVE_AI_* env vars, merged with user options (user options take precedence)
const config = loadEnvConfig({ provider: 'openai' }, {
  packageName: 'ai',
  schema: { provider: 'string', model: 'string', timeout: 'number' }
});
```

### Logging

```typescript
import { getLogger, setLogger, disableLogging } from '@happyvertical/utils';

const logger = getLogger();
logger.info('Started', { userId: 123 });
disableLogging(); // Switch to no-op logger
```

## API Reference

**IDs** — `makeId(type?)`, `createId()`, `isCuid(id)`

**Strings** — `camelCase(str)`, `snakeCase(str)`, `keysToCamel(obj)`, `keysToSnake(obj)`, `domainToCamel(str)`, `makeSlug(str)`

**URLs** — `urlFilename(url)`, `urlPath(url)`, `isUrl(str)`, `normalizeUrl(url)`, `generateScopeFromUrl(url)`, `hashPageContent(html)`

**Dates** — `dateInString(str)`, `prettyDate(str)`, `parseAmazonDateString(str)`, `formatDate(date, format?)`, `parseDate(str, format?)`, `isValidDate(date)`, `addInterval(date, duration)`

**Pluralization** — `pluralizeWord(word)`, `singularize(word)`, `isPlural(word)`, `isSingular(word)`

**Type Guards** — `isArray(obj)`, `isPlainObject(obj)`

**Async** — `waitFor(fn, options?)`, `sleep(ms)`

**Code** — `extractCodeBlock(text, lang?)`, `extractAllCodeBlocks(text, lang?)`, `extractJSON<T>(text)`, `extractFunctionDefinition(code, name)`, `validateCode(code, options?)`, `isSafeCode(code)`, `createSandbox(options?)`, `executeCode(code, sandbox, options?)`, `executeCodeAsync(code, sandbox, options?)`, `executeInSandbox(code, options?)`, `executeInSandboxAsync(code, options?)`

**CLI** — `parseCliArgs(argv, commands, builtInCommands?)`

**Config** — `loadEnvConfig<T>(userOptions?, options?)`, `toCamelCase(str)`, `toScreamingSnakeCase(str)`, `convertType(value, type)`

**Logging** — `getLogger()`, `setLogger(logger)`, `disableLogging()`, `enableLogging()`

**Misc** — `logTicker(tick, options?)`, `getTempDirectory(subfolder?)`

**Error Classes** — `BaseError`, `ValidationError`, `ApiError`, `FileError`, `NetworkError`, `DatabaseError`, `ParsingError`, `TimeoutError`

**Types** — `Logger`, `ErrorCode`, `Command`, `OptionConfig`, `ParsedArgs`, `ConfigOptions<T>`, `ValidationOptions`, `ValidationResult`, `SandboxOptions`, `ExecuteOptions`

## License

MIT
