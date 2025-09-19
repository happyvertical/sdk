# @have/files

## Namespaces

- [default](@have/namespaces/default.md)

## Classes

### DirectoryNotEmptyError

Defined in: [packages/files/src/shared/types.ts:528](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L528)

Error types for filesystem operations

#### Extends

- [`FilesystemError`](#filesystemerror)

#### Constructors

##### Constructor

> **new DirectoryNotEmptyError**(`path`, `provider?`): [`DirectoryNotEmptyError`](#directorynotemptyerror)

Defined in: [packages/files/src/shared/types.ts:529](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L529)

###### Parameters

###### path

`string`

###### provider?

`string`

###### Returns

[`DirectoryNotEmptyError`](#directorynotemptyerror)

###### Overrides

[`FilesystemError`](#filesystemerror).[`constructor`](#constructor-3)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`FilesystemError`](#filesystemerror).[`cause`](#cause-2)

##### code

> **code**: `string`

Defined in: [packages/files/src/shared/types.ts:505](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L505)

###### Inherited from

[`FilesystemError`](#filesystemerror).[`code`](#code-2)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`FilesystemError`](#filesystemerror).[`message`](#message-2)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`FilesystemError`](#filesystemerror).[`name`](#name-2)

##### path?

> `optional` **path**: `string`

Defined in: [packages/files/src/shared/types.ts:506](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L506)

###### Inherited from

[`FilesystemError`](#filesystemerror).[`path`](#path-2)

##### provider?

> `optional` **provider**: `string`

Defined in: [packages/files/src/shared/types.ts:507](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L507)

###### Inherited from

[`FilesystemError`](#filesystemerror).[`provider`](#provider-2)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`FilesystemError`](#filesystemerror).[`stack`](#stack-2)

##### prepareStackTrace()?

> `static` `optional` **prepareStackTrace**: (`err`, `stackTraces`) => `any`

Defined in: node\_modules/@types/node/globals.d.ts:143

Optional override for formatting stack traces

###### Parameters

###### err

`Error`

###### stackTraces

`CallSite`[]

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

[`FilesystemError`](#filesystemerror).[`prepareStackTrace`](#preparestacktrace-2)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`FilesystemError`](#filesystemerror).[`stackTraceLimit`](#stacktracelimit-2)

#### Methods

##### captureStackTrace()

###### Call Signature

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node\_modules/bun-types/globals.d.ts:985

Create .stack property on a target object

###### Parameters

###### targetObject

`object`

###### constructorOpt?

`Function`

###### Returns

`void`

###### Inherited from

[`FilesystemError`](#filesystemerror).[`captureStackTrace`](#capturestacktrace-6)

###### Call Signature

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node\_modules/@types/node/globals.d.ts:136

Create .stack property on a target object

###### Parameters

###### targetObject

`object`

###### constructorOpt?

`Function`

###### Returns

`void`

###### Inherited from

[`FilesystemError`](#filesystemerror).[`captureStackTrace`](#capturestacktrace-6)

##### isError()

> `static` **isError**(`value`): `value is Error`

Defined in: node\_modules/bun-types/globals.d.ts:980

Check if a value is an instance of Error

###### Parameters

###### value

`unknown`

The value to check

###### Returns

`value is Error`

True if the value is an instance of Error, false otherwise

###### Inherited from

[`FilesystemError`](#filesystemerror).[`isError`](#iserror-4)

***

### FileNotFoundError

Defined in: [packages/files/src/shared/types.ts:514](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L514)

Error types for filesystem operations

#### Extends

- [`FilesystemError`](#filesystemerror)

#### Constructors

##### Constructor

> **new FileNotFoundError**(`path`, `provider?`): [`FileNotFoundError`](#filenotfounderror)

Defined in: [packages/files/src/shared/types.ts:515](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L515)

###### Parameters

###### path

`string`

###### provider?

`string`

###### Returns

[`FileNotFoundError`](#filenotfounderror)

###### Overrides

[`FilesystemError`](#filesystemerror).[`constructor`](#constructor-3)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`FilesystemError`](#filesystemerror).[`cause`](#cause-2)

##### code

> **code**: `string`

Defined in: [packages/files/src/shared/types.ts:505](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L505)

###### Inherited from

[`FilesystemError`](#filesystemerror).[`code`](#code-2)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`FilesystemError`](#filesystemerror).[`message`](#message-2)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`FilesystemError`](#filesystemerror).[`name`](#name-2)

##### path?

> `optional` **path**: `string`

Defined in: [packages/files/src/shared/types.ts:506](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L506)

###### Inherited from

[`FilesystemError`](#filesystemerror).[`path`](#path-2)

##### provider?

> `optional` **provider**: `string`

Defined in: [packages/files/src/shared/types.ts:507](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L507)

###### Inherited from

[`FilesystemError`](#filesystemerror).[`provider`](#provider-2)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`FilesystemError`](#filesystemerror).[`stack`](#stack-2)

##### prepareStackTrace()?

> `static` `optional` **prepareStackTrace**: (`err`, `stackTraces`) => `any`

Defined in: node\_modules/@types/node/globals.d.ts:143

Optional override for formatting stack traces

###### Parameters

###### err

`Error`

###### stackTraces

`CallSite`[]

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

[`FilesystemError`](#filesystemerror).[`prepareStackTrace`](#preparestacktrace-2)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`FilesystemError`](#filesystemerror).[`stackTraceLimit`](#stacktracelimit-2)

#### Methods

##### captureStackTrace()

###### Call Signature

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node\_modules/bun-types/globals.d.ts:985

Create .stack property on a target object

###### Parameters

###### targetObject

`object`

###### constructorOpt?

`Function`

###### Returns

`void`

###### Inherited from

[`FilesystemError`](#filesystemerror).[`captureStackTrace`](#capturestacktrace-6)

###### Call Signature

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node\_modules/@types/node/globals.d.ts:136

Create .stack property on a target object

###### Parameters

###### targetObject

`object`

###### constructorOpt?

`Function`

###### Returns

`void`

###### Inherited from

[`FilesystemError`](#filesystemerror).[`captureStackTrace`](#capturestacktrace-6)

##### isError()

> `static` **isError**(`value`): `value is Error`

Defined in: node\_modules/bun-types/globals.d.ts:980

Check if a value is an instance of Error

###### Parameters

###### value

`unknown`

The value to check

###### Returns

`value is Error`

True if the value is an instance of Error, false otherwise

###### Inherited from

[`FilesystemError`](#filesystemerror).[`isError`](#iserror-4)

***

### FilesystemAdapter

Defined in: [packages/files/src/filesystem.ts:78](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L78)

Base class for filesystem adapters providing common functionality

#### Constructors

##### Constructor

> **new FilesystemAdapter**(`options`): [`FilesystemAdapter`](#filesystemadapter)

Defined in: [packages/files/src/filesystem.ts:94](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L94)

Creates a new FilesystemAdapter instance

###### Parameters

###### options

[`FilesystemAdapterOptions`](#filesystemadapteroptions-1)

Configuration options

###### Returns

[`FilesystemAdapter`](#filesystemadapter)

#### Properties

##### cacheDir

> `protected` **cacheDir**: `string`

Defined in: [packages/files/src/filesystem.ts:87](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L87)

Cache directory path

##### options

> `protected` **options**: [`FilesystemAdapterOptions`](#filesystemadapteroptions-1)

Defined in: [packages/files/src/filesystem.ts:82](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L82)

Configuration options

#### Methods

##### delete()

> **delete**(`path`): `Promise`\<`void`\>

Defined in: [packages/files/src/filesystem.ts:179](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L179)

Deletes a file or directory

###### Parameters

###### path

`string`

Path to delete

###### Returns

`Promise`\<`void`\>

Promise that resolves when the deletion is complete

##### download()

> **download**(`url`, `options`): `Promise`\<`string`\>

Defined in: [packages/files/src/filesystem.ts:129](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L129)

Downloads a file from a URL

###### Parameters

###### url

`string`

URL to download from

###### options

Download options

###### force

`boolean`

Whether to force download even if cached

###### Returns

`Promise`\<`string`\>

Promise resolving to the path of the downloaded file

##### exists()

> **exists**(`path`): `Promise`\<`boolean`\>

Defined in: [packages/files/src/filesystem.ts:146](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L146)

Checks if a file or directory exists

###### Parameters

###### path

`string`

Path to check

###### Returns

`Promise`\<`boolean`\>

Promise resolving to boolean indicating existence

##### getCached()

> **getCached**(`file`, `expiry`): `Promise`\<`undefined` \| `string`\>

Defined in: [packages/files/src/filesystem.ts:201](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L201)

Gets data from cache if available and not expired

###### Parameters

###### file

`string`

Cache file identifier

###### expiry

`number` = `300000`

Cache expiry time in milliseconds

###### Returns

`Promise`\<`undefined` \| `string`\>

Promise resolving to the cached data or undefined if not found/expired

##### initialize()

> `protected` **initialize**(): `Promise`\<`void`\>

Defined in: [packages/files/src/filesystem.ts:117](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L117)

Initializes the adapter by creating the cache directory

###### Returns

`Promise`\<`void`\>

##### list()

> **list**(`path`): `Promise`\<`string`[]\>

Defined in: [packages/files/src/filesystem.ts:189](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L189)

Lists files in a directory

###### Parameters

###### path

`string`

Directory path to list

###### Returns

`Promise`\<`string`[]\>

Promise resolving to an array of file names

##### read()

> **read**(`path`): `Promise`\<`string`\>

Defined in: [packages/files/src/filesystem.ts:157](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L157)

Reads a file's contents

###### Parameters

###### path

`string`

Path to the file

###### Returns

`Promise`\<`string`\>

Promise resolving to the file contents as a string

##### setCached()

> **setCached**(`file`, `data`): `Promise`\<`void`\>

Defined in: [packages/files/src/filesystem.ts:212](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L212)

Sets data in cache

###### Parameters

###### file

`string`

Cache file identifier

###### data

`string`

Data to cache

###### Returns

`Promise`\<`void`\>

Promise that resolves when the data is cached

##### write()

> **write**(`path`, `content`): `Promise`\<`void`\>

Defined in: [packages/files/src/filesystem.ts:169](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L169)

Writes content to a file

###### Parameters

###### path

`string`

Path to the file

###### content

`string`

Content to write

###### Returns

`Promise`\<`void`\>

Promise that resolves when the write is complete

##### create()

> `static` **create**\<`T`\>(`options`): `Promise`\<[`FilesystemAdapter`](#filesystemadapter)\>

Defined in: [packages/files/src/filesystem.ts:106](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L106)

Factory method to create and initialize a FilesystemAdapter

###### Type Parameters

###### T

`T` *extends* [`FilesystemAdapterOptions`](#filesystemadapteroptions-1)

###### Parameters

###### options

`T`

Configuration options

###### Returns

`Promise`\<[`FilesystemAdapter`](#filesystemadapter)\>

Promise resolving to an initialized FilesystemAdapter

***

### FilesystemError

Defined in: [packages/files/src/shared/types.ts:502](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L502)

Error types for filesystem operations

#### Extends

- `Error`

#### Extended by

- [`FileNotFoundError`](#filenotfounderror)
- [`PermissionError`](#permissionerror)
- [`DirectoryNotEmptyError`](#directorynotemptyerror)
- [`InvalidPathError`](#invalidpatherror)

#### Constructors

##### Constructor

> **new FilesystemError**(`message`, `code`, `path?`, `provider?`): [`FilesystemError`](#filesystemerror)

Defined in: [packages/files/src/shared/types.ts:503](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L503)

###### Parameters

###### message

`string`

###### code

`string`

###### path?

`string`

###### provider?

`string`

###### Returns

[`FilesystemError`](#filesystemerror)

###### Overrides

`Error.constructor`

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

`Error.cause`

##### code

> **code**: `string`

Defined in: [packages/files/src/shared/types.ts:505](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L505)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

`Error.message`

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

`Error.name`

##### path?

> `optional` **path**: `string`

Defined in: [packages/files/src/shared/types.ts:506](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L506)

##### provider?

> `optional` **provider**: `string`

Defined in: [packages/files/src/shared/types.ts:507](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L507)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

`Error.stack`

##### prepareStackTrace()?

> `static` `optional` **prepareStackTrace**: (`err`, `stackTraces`) => `any`

Defined in: node\_modules/@types/node/globals.d.ts:143

Optional override for formatting stack traces

###### Parameters

###### err

`Error`

###### stackTraces

`CallSite`[]

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

`Error.prepareStackTrace`

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

`Error.stackTraceLimit`

#### Methods

##### captureStackTrace()

###### Call Signature

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node\_modules/bun-types/globals.d.ts:985

Create .stack property on a target object

###### Parameters

###### targetObject

`object`

###### constructorOpt?

`Function`

###### Returns

`void`

###### Inherited from

`Error.captureStackTrace`

###### Call Signature

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node\_modules/@types/node/globals.d.ts:136

Create .stack property on a target object

###### Parameters

###### targetObject

`object`

###### constructorOpt?

`Function`

###### Returns

`void`

###### Inherited from

`Error.captureStackTrace`

##### isError()

> `static` **isError**(`value`): `value is Error`

Defined in: node\_modules/bun-types/globals.d.ts:980

Check if a value is an instance of Error

###### Parameters

###### value

`unknown`

The value to check

###### Returns

`value is Error`

True if the value is an instance of Error, false otherwise

###### Inherited from

`Error.isError`

***

### InvalidPathError

Defined in: [packages/files/src/shared/types.ts:535](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L535)

Error types for filesystem operations

#### Extends

- [`FilesystemError`](#filesystemerror)

#### Constructors

##### Constructor

> **new InvalidPathError**(`path`, `provider?`): [`InvalidPathError`](#invalidpatherror)

Defined in: [packages/files/src/shared/types.ts:536](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L536)

###### Parameters

###### path

`string`

###### provider?

`string`

###### Returns

[`InvalidPathError`](#invalidpatherror)

###### Overrides

[`FilesystemError`](#filesystemerror).[`constructor`](#constructor-3)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`FilesystemError`](#filesystemerror).[`cause`](#cause-2)

##### code

> **code**: `string`

Defined in: [packages/files/src/shared/types.ts:505](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L505)

###### Inherited from

[`FilesystemError`](#filesystemerror).[`code`](#code-2)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`FilesystemError`](#filesystemerror).[`message`](#message-2)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`FilesystemError`](#filesystemerror).[`name`](#name-2)

##### path?

> `optional` **path**: `string`

Defined in: [packages/files/src/shared/types.ts:506](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L506)

###### Inherited from

[`FilesystemError`](#filesystemerror).[`path`](#path-2)

##### provider?

> `optional` **provider**: `string`

Defined in: [packages/files/src/shared/types.ts:507](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L507)

###### Inherited from

[`FilesystemError`](#filesystemerror).[`provider`](#provider-2)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`FilesystemError`](#filesystemerror).[`stack`](#stack-2)

##### prepareStackTrace()?

> `static` `optional` **prepareStackTrace**: (`err`, `stackTraces`) => `any`

Defined in: node\_modules/@types/node/globals.d.ts:143

Optional override for formatting stack traces

###### Parameters

###### err

`Error`

###### stackTraces

`CallSite`[]

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

[`FilesystemError`](#filesystemerror).[`prepareStackTrace`](#preparestacktrace-2)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`FilesystemError`](#filesystemerror).[`stackTraceLimit`](#stacktracelimit-2)

#### Methods

##### captureStackTrace()

###### Call Signature

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node\_modules/bun-types/globals.d.ts:985

Create .stack property on a target object

###### Parameters

###### targetObject

`object`

###### constructorOpt?

`Function`

###### Returns

`void`

###### Inherited from

[`FilesystemError`](#filesystemerror).[`captureStackTrace`](#capturestacktrace-6)

###### Call Signature

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node\_modules/@types/node/globals.d.ts:136

Create .stack property on a target object

###### Parameters

###### targetObject

`object`

###### constructorOpt?

`Function`

###### Returns

`void`

###### Inherited from

[`FilesystemError`](#filesystemerror).[`captureStackTrace`](#capturestacktrace-6)

##### isError()

> `static` **isError**(`value`): `value is Error`

Defined in: node\_modules/bun-types/globals.d.ts:980

Check if a value is an instance of Error

###### Parameters

###### value

`unknown`

The value to check

###### Returns

`value is Error`

True if the value is an instance of Error, false otherwise

###### Inherited from

[`FilesystemError`](#filesystemerror).[`isError`](#iserror-4)

***

### LocalFilesystemProvider

Defined in: [packages/files/src/node/local.ts:37](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L37)

Local filesystem provider using Node.js fs module with full feature support

#### Extends

- `BaseFilesystemProvider`

#### Constructors

##### Constructor

> **new LocalFilesystemProvider**(`options`): [`LocalFilesystemProvider`](#localfilesystemprovider)

Defined in: [packages/files/src/node/local.ts:40](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L40)

###### Parameters

###### options

[`LocalOptions`](#localoptions) = `{}`

###### Returns

[`LocalFilesystemProvider`](#localfilesystemprovider)

###### Overrides

`BaseFilesystemProvider.constructor`

#### Properties

##### basePath

> `protected` **basePath**: `string`

Defined in: [packages/files/src/shared/base.ts:22](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L22)

###### Inherited from

`BaseFilesystemProvider.basePath`

##### cache

> **cache**: `object`

Defined in: [packages/files/src/node/local.ts:481](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L481)

Cache implementation using file system

###### clear()

> **clear**: (`key?`) => `Promise`\<`void`\>

###### Parameters

###### key?

`string`

###### Returns

`Promise`\<`void`\>

###### get()

> **get**: (`key`, `expiry?`) => `Promise`\<`undefined` \| `string`\>

###### Parameters

###### key

`string`

###### expiry?

`number`

###### Returns

`Promise`\<`undefined` \| `string`\>

###### set()

> **set**: (`key`, `data`) => `Promise`\<`void`\>

###### Parameters

###### key

`string`

###### data

`string`

###### Returns

`Promise`\<`void`\>

###### Overrides

`BaseFilesystemProvider.cache`

##### cacheDir

> `protected` **cacheDir**: `string`

Defined in: [packages/files/src/shared/base.ts:23](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L23)

###### Inherited from

`BaseFilesystemProvider.cacheDir`

##### createMissing

> `protected` **createMissing**: `boolean`

Defined in: [packages/files/src/shared/base.ts:24](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L24)

###### Inherited from

`BaseFilesystemProvider.createMissing`

##### providerType

> `protected` **providerType**: `string`

Defined in: [packages/files/src/shared/base.ts:25](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L25)

###### Inherited from

`BaseFilesystemProvider.providerType`

#### Methods

##### copy()

> **copy**(`sourcePath`, `destPath`): `Promise`\<`void`\>

Defined in: [packages/files/src/node/local.ts:164](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L164)

Copy file from source to destination

###### Parameters

###### sourcePath

`string`

###### destPath

`string`

###### Returns

`Promise`\<`void`\>

###### Overrides

`BaseFilesystemProvider.copy`

##### createDirectory()

> **createDirectory**(`path`, `options`): `Promise`\<`void`\>

Defined in: [packages/files/src/node/local.ts:224](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L224)

Create directory

###### Parameters

###### path

`string`

###### options

[`CreateDirOptions`](#creatediroptions) = `{}`

###### Returns

`Promise`\<`void`\>

###### Overrides

`BaseFilesystemProvider.createDirectory`

##### delete()

> **delete**(`path`): `Promise`\<`void`\>

Defined in: [packages/files/src/node/local.ts:132](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L132)

Delete file or directory

###### Parameters

###### path

`string`

###### Returns

`Promise`\<`void`\>

###### Overrides

`BaseFilesystemProvider.delete`

##### download()

> **download**(`remotePath`, `localPath?`, `options?`): `Promise`\<`string`\>

Defined in: [packages/files/src/shared/base.ts:144](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L144)

Download a file (for remote providers)

###### Parameters

###### remotePath

`string`

###### localPath?

`string`

###### options?

[`DownloadOptions`](#downloadoptions) = `{}`

###### Returns

`Promise`\<`string`\>

###### Inherited from

`BaseFilesystemProvider.download`

##### downloadFileWithCache()

> **downloadFileWithCache**(`url`, `targetPath`): `Promise`\<`string`\>

Defined in: [packages/files/src/node/local.ts:440](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L440)

Download a file with caching support (legacy)

###### Parameters

###### url

`string`

###### targetPath

`null` | `string`

###### Returns

`Promise`\<`string`\>

###### Overrides

`BaseFilesystemProvider.downloadFileWithCache`

##### downloadFromUrl()

> **downloadFromUrl**(`url`, `filepath`): `Promise`\<`void`\>

Defined in: [packages/files/src/node/local.ts:402](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L402)

Download a file from a URL and save it to a local file (legacy)

###### Parameters

###### url

`string`

###### filepath

`string`

###### Returns

`Promise`\<`void`\>

###### Overrides

`BaseFilesystemProvider.downloadFromUrl`

##### downloadWithCache()

> **downloadWithCache**(`remotePath`, `options`): `Promise`\<`string`\>

Defined in: [packages/files/src/shared/base.ts:148](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L148)

Download file with caching

###### Parameters

###### remotePath

`string`

###### options

[`CacheOptions`](#cacheoptions) = `{}`

###### Returns

`Promise`\<`string`\>

###### Inherited from

`BaseFilesystemProvider.downloadWithCache`

##### ensureDirectoryExists()

> **ensureDirectoryExists**(`dir`): `Promise`\<`void`\>

Defined in: [packages/files/src/shared/base.ts:215](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L215)

Create a directory if it doesn't exist (legacy)

###### Parameters

###### dir

`string`

###### Returns

`Promise`\<`void`\>

###### Inherited from

`BaseFilesystemProvider.ensureDirectoryExists`

##### exists()

> **exists**(`path`): `Promise`\<`boolean`\>

Defined in: [packages/files/src/node/local.ts:57](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L57)

Check if file or directory exists

###### Parameters

###### path

`string`

###### Returns

`Promise`\<`boolean`\>

###### Overrides

`BaseFilesystemProvider.exists`

##### getCached()

> **getCached**(`file`, `expiry`): `Promise`\<`undefined` \| `string`\>

Defined in: [packages/files/src/node/local.ts:454](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L454)

Get data from cache if available and not expired (legacy)

###### Parameters

###### file

`string`

###### expiry

`number` = `300000`

###### Returns

`Promise`\<`undefined` \| `string`\>

###### Overrides

`BaseFilesystemProvider.getCached`

##### getCacheKey()

> `protected` **getCacheKey**(`path`): `string`

Defined in: [packages/files/src/shared/base.ts:118](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L118)

Get cache key for a given path

###### Parameters

###### path

`string`

###### Returns

`string`

###### Inherited from

`BaseFilesystemProvider.getCacheKey`

##### getCapabilities()

> **getCapabilities**(): `Promise`\<[`FilesystemCapabilities`](#filesystemcapabilities)\>

Defined in: [packages/files/src/node/local.ts:513](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L513)

Get provider capabilities

###### Returns

`Promise`\<[`FilesystemCapabilities`](#filesystemcapabilities)\>

###### Overrides

`BaseFilesystemProvider.getCapabilities`

##### getMimeType()

> **getMimeType**(`path`): `Promise`\<`string`\>

Defined in: [packages/files/src/node/local.ts:348](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L348)

Get MIME type for a file

###### Parameters

###### path

`string`

###### Returns

`Promise`\<`string`\>

###### Overrides

`BaseFilesystemProvider.getMimeType`

##### getStats()

> **getStats**(`path`): `Promise`\<[`FileStats`](#filestats)\>

Defined in: [packages/files/src/node/local.ts:312](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L312)

Get file statistics

###### Parameters

###### path

`string`

###### Returns

`Promise`\<[`FileStats`](#filestats)\>

###### Overrides

`BaseFilesystemProvider.getStats`

##### isDirectory()

> **isDirectory**(`dir`): `Promise`\<`boolean`\>

Defined in: [packages/files/src/shared/base.ts:203](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L203)

Check if a path is a directory (legacy)

###### Parameters

###### dir

`string`

###### Returns

`Promise`\<`boolean`\>

###### Inherited from

`BaseFilesystemProvider.isDirectory`

##### isFile()

> **isFile**(`file`): `Promise`\<`false` \| [`FileStats`](#filestats)\>

Defined in: [packages/files/src/shared/base.ts:191](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L191)

Check if a path is a file (legacy)

###### Parameters

###### file

`string`

###### Returns

`Promise`\<`false` \| [`FileStats`](#filestats)\>

###### Inherited from

`BaseFilesystemProvider.isFile`

##### list()

> **list**(`path`, `options`): `Promise`\<[`FileInfo`](#fileinfo)[]\>

Defined in: [packages/files/src/node/local.ts:247](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L247)

List directory contents

###### Parameters

###### path

`string`

###### options

[`ListOptions`](#listoptions) = `{}`

###### Returns

`Promise`\<[`FileInfo`](#fileinfo)[]\>

###### Overrides

`BaseFilesystemProvider.list`

##### listFiles()

> **listFiles**(`dirPath`, `options`): `Promise`\<`string`[]\>

Defined in: [packages/files/src/shared/base.ts:245](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L245)

List files in a directory with optional filtering (legacy)

###### Parameters

###### dirPath

`string`

###### options

[`ListFilesOptions`](#listfilesoptions) = `...`

###### Returns

`Promise`\<`string`[]\>

###### Inherited from

`BaseFilesystemProvider.listFiles`

##### move()

> **move**(`sourcePath`, `destPath`): `Promise`\<`void`\>

Defined in: [packages/files/src/node/local.ts:194](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L194)

Move file from source to destination

###### Parameters

###### sourcePath

`string`

###### destPath

`string`

###### Returns

`Promise`\<`void`\>

###### Overrides

`BaseFilesystemProvider.move`

##### normalizePath()

> `protected` **normalizePath**(`path`): `string`

Defined in: [packages/files/src/shared/base.ts:73](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L73)

Normalize path by removing leading/trailing slashes and resolving relative paths

###### Parameters

###### path

`string`

###### Returns

`string`

###### Inherited from

`BaseFilesystemProvider.normalizePath`

##### read()

> **read**(`path`, `options`): `Promise`\<`string` \| `Buffer`\<`ArrayBufferLike`\>\>

Defined in: [packages/files/src/node/local.ts:70](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L70)

Read file contents

###### Parameters

###### path

`string`

###### options

[`ReadOptions`](#readoptions) = `{}`

###### Returns

`Promise`\<`string` \| `Buffer`\<`ArrayBufferLike`\>\>

###### Overrides

`BaseFilesystemProvider.read`

##### setCached()

> **setCached**(`file`, `data`): `Promise`\<`void`\>

Defined in: [packages/files/src/node/local.ts:472](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L472)

Set data in cache (legacy)

###### Parameters

###### file

`string`

###### data

`string`

###### Returns

`Promise`\<`void`\>

###### Overrides

`BaseFilesystemProvider.setCached`

##### throwUnsupported()

> `protected` **throwUnsupported**(`operation`): `never`

Defined in: [packages/files/src/shared/base.ts:61](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L61)

Throw error for unsupported operations

###### Parameters

###### operation

`string`

###### Returns

`never`

###### Inherited from

`BaseFilesystemProvider.throwUnsupported`

##### upload()

> **upload**(`localPath`, `remotePath`, `options`): `Promise`\<`void`\>

Defined in: [packages/files/src/shared/base.ts:140](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L140)

Provider methods with default implementations (may be overridden)

###### Parameters

###### localPath

`string`

###### remotePath

`string`

###### options

[`UploadOptions`](#uploadoptions) = `{}`

###### Returns

`Promise`\<`void`\>

###### Inherited from

`BaseFilesystemProvider.upload`

##### uploadToUrl()

> **uploadToUrl**(`url`, `data`): `Promise`\<`Response`\>

Defined in: [packages/files/src/node/local.ts:380](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L380)

Upload data to a URL using PUT method (legacy)

###### Parameters

###### url

`string`

###### data

`string` | `Buffer`\<`ArrayBufferLike`\>

###### Returns

`Promise`\<`Response`\>

###### Overrides

`BaseFilesystemProvider.uploadToUrl`

##### validatePath()

> `protected` **validatePath**(`path`): `void`

Defined in: [packages/files/src/shared/base.ts:100](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/base.ts#L100)

Validate that a path is safe (no directory traversal)

###### Parameters

###### path

`string`

###### Returns

`void`

###### Inherited from

`BaseFilesystemProvider.validatePath`

##### write()

> **write**(`path`, `content`, `options`): `Promise`\<`void`\>

Defined in: [packages/files/src/node/local.ts:100](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/node/local.ts#L100)

Write content to file

###### Parameters

###### path

`string`

###### content

`string` | `Buffer`\<`ArrayBufferLike`\>

###### options

[`WriteOptions`](#writeoptions) = `{}`

###### Returns

`Promise`\<`void`\>

###### Overrides

`BaseFilesystemProvider.write`

***

### PermissionError

Defined in: [packages/files/src/shared/types.ts:521](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L521)

Error types for filesystem operations

#### Extends

- [`FilesystemError`](#filesystemerror)

#### Constructors

##### Constructor

> **new PermissionError**(`path`, `provider?`): [`PermissionError`](#permissionerror)

Defined in: [packages/files/src/shared/types.ts:522](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L522)

###### Parameters

###### path

`string`

###### provider?

`string`

###### Returns

[`PermissionError`](#permissionerror)

###### Overrides

[`FilesystemError`](#filesystemerror).[`constructor`](#constructor-3)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`FilesystemError`](#filesystemerror).[`cause`](#cause-2)

##### code

> **code**: `string`

Defined in: [packages/files/src/shared/types.ts:505](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L505)

###### Inherited from

[`FilesystemError`](#filesystemerror).[`code`](#code-2)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`FilesystemError`](#filesystemerror).[`message`](#message-2)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`FilesystemError`](#filesystemerror).[`name`](#name-2)

##### path?

> `optional` **path**: `string`

Defined in: [packages/files/src/shared/types.ts:506](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L506)

###### Inherited from

[`FilesystemError`](#filesystemerror).[`path`](#path-2)

##### provider?

> `optional` **provider**: `string`

Defined in: [packages/files/src/shared/types.ts:507](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L507)

###### Inherited from

[`FilesystemError`](#filesystemerror).[`provider`](#provider-2)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`FilesystemError`](#filesystemerror).[`stack`](#stack-2)

##### prepareStackTrace()?

> `static` `optional` **prepareStackTrace**: (`err`, `stackTraces`) => `any`

Defined in: node\_modules/@types/node/globals.d.ts:143

Optional override for formatting stack traces

###### Parameters

###### err

`Error`

###### stackTraces

`CallSite`[]

###### Returns

`any`

###### See

https://v8.dev/docs/stack-trace-api#customizing-stack-traces

###### Inherited from

[`FilesystemError`](#filesystemerror).[`prepareStackTrace`](#preparestacktrace-2)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`FilesystemError`](#filesystemerror).[`stackTraceLimit`](#stacktracelimit-2)

#### Methods

##### captureStackTrace()

###### Call Signature

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node\_modules/bun-types/globals.d.ts:985

Create .stack property on a target object

###### Parameters

###### targetObject

`object`

###### constructorOpt?

`Function`

###### Returns

`void`

###### Inherited from

[`FilesystemError`](#filesystemerror).[`captureStackTrace`](#capturestacktrace-6)

###### Call Signature

> `static` **captureStackTrace**(`targetObject`, `constructorOpt?`): `void`

Defined in: node\_modules/@types/node/globals.d.ts:136

Create .stack property on a target object

###### Parameters

###### targetObject

`object`

###### constructorOpt?

`Function`

###### Returns

`void`

###### Inherited from

[`FilesystemError`](#filesystemerror).[`captureStackTrace`](#capturestacktrace-6)

##### isError()

> `static` **isError**(`value`): `value is Error`

Defined in: node\_modules/bun-types/globals.d.ts:980

Check if a value is an instance of Error

###### Parameters

###### value

`unknown`

The value to check

###### Returns

`value is Error`

True if the value is an instance of Error, false otherwise

###### Inherited from

[`FilesystemError`](#filesystemerror).[`isError`](#iserror-4)

## Interfaces

### BaseProviderOptions

Defined in: [packages/files/src/shared/types.ts:414](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L414)

Base configuration options for all providers

#### Extended by

- [`LocalOptions`](#localoptions)
- [`S3Options`](#s3options)
- [`GoogleDriveOptions`](#googledriveoptions)
- [`WebDAVOptions`](#webdavoptions)
- [`BrowserStorageOptions`](#browserstorageoptions)

#### Properties

##### basePath?

> `optional` **basePath**: `string`

Defined in: [packages/files/src/shared/types.ts:418](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L418)

Base path for operations

##### cacheDir?

> `optional` **cacheDir**: `string`

Defined in: [packages/files/src/shared/types.ts:423](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L423)

Cache directory location

##### createMissing?

> `optional` **createMissing**: `boolean`

Defined in: [packages/files/src/shared/types.ts:428](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L428)

Whether to create missing directories

***

### BrowserStorageOptions

Defined in: [packages/files/src/shared/types.ts:477](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L477)

Browser storage provider options (uses IndexedDB for app storage)

#### Extends

- [`BaseProviderOptions`](#baseprovideroptions)

#### Properties

##### basePath?

> `optional` **basePath**: `string`

Defined in: [packages/files/src/shared/types.ts:418](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L418)

Base path for operations

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`basePath`](#basepath-1)

##### cacheDir?

> `optional` **cacheDir**: `string`

Defined in: [packages/files/src/shared/types.ts:423](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L423)

Cache directory location

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`cacheDir`](#cachedir-2)

##### createMissing?

> `optional` **createMissing**: `boolean`

Defined in: [packages/files/src/shared/types.ts:428](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L428)

Whether to create missing directories

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`createMissing`](#createmissing-1)

##### databaseName?

> `optional` **databaseName**: `string`

Defined in: [packages/files/src/shared/types.ts:482](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L482)

Database name for IndexedDB

##### storageQuota?

> `optional` **storageQuota**: `number`

Defined in: [packages/files/src/shared/types.ts:486](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L486)

Maximum storage quota to request (in bytes)

##### type

> **type**: `"browser-storage"`

Defined in: [packages/files/src/shared/types.ts:478](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L478)

***

### CacheOptions

Defined in: [packages/files/src/shared/types.ts:118](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L118)

Options for caching operations

#### Properties

##### expiry?

> `optional` **expiry**: `number`

Defined in: [packages/files/src/shared/types.ts:122](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L122)

Cache expiry time in milliseconds

##### force?

> `optional` **force**: `boolean`

Defined in: [packages/files/src/shared/types.ts:127](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L127)

Whether to force download even if cached

***

### CreateDirOptions

Defined in: [packages/files/src/shared/types.ts:43](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L43)

Options for creating directories

#### Properties

##### mode?

> `optional` **mode**: `number`

Defined in: [packages/files/src/shared/types.ts:52](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L52)

Directory mode (permissions)

##### recursive?

> `optional` **recursive**: `boolean`

Defined in: [packages/files/src/shared/types.ts:47](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L47)

Whether to create parent directories recursively

***

### DownloadOptions

Defined in: [packages/files/src/shared/types.ts:103](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L103)

Options for file download operations

#### Properties

##### force?

> `optional` **force**: `boolean`

Defined in: [packages/files/src/shared/types.ts:107](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L107)

Whether to force download even if local copy exists

##### onProgress()?

> `optional` **onProgress**: (`progress`) => `void`

Defined in: [packages/files/src/shared/types.ts:112](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L112)

Progress callback function

###### Parameters

###### progress

###### loaded

`number`

###### total

`number`

###### Returns

`void`

***

### FileInfo

Defined in: [packages/files/src/shared/types.ts:143](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L143)

File information structure

#### Properties

##### extension?

> `optional` **extension**: `string`

Defined in: [packages/files/src/shared/types.ts:177](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L177)

File extension

##### isDirectory

> **isDirectory**: `boolean`

Defined in: [packages/files/src/shared/types.ts:162](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L162)

Whether this is a directory

##### lastModified

> **lastModified**: `Date`

Defined in: [packages/files/src/shared/types.ts:167](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L167)

Last modified date

##### mimeType?

> `optional` **mimeType**: `string`

Defined in: [packages/files/src/shared/types.ts:172](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L172)

MIME type of the file

##### name

> **name**: `string`

Defined in: [packages/files/src/shared/types.ts:147](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L147)

File name

##### path

> **path**: `string`

Defined in: [packages/files/src/shared/types.ts:152](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L152)

Full path to the file

##### size

> **size**: `number`

Defined in: [packages/files/src/shared/types.ts:157](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L157)

File size in bytes

***

### FileStats

Defined in: [packages/files/src/shared/types.ts:183](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L183)

File statistics structure

#### Properties

##### atime

> **atime**: `Date`

Defined in: [packages/files/src/shared/types.ts:207](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L207)

Last access time

##### birthtime

> **birthtime**: `Date`

Defined in: [packages/files/src/shared/types.ts:202](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L202)

Creation time

##### ctime

> **ctime**: `Date`

Defined in: [packages/files/src/shared/types.ts:217](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L217)

Last status change time

##### gid

> **gid**: `number`

Defined in: [packages/files/src/shared/types.ts:232](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L232)

Group ID of file owner

##### isDirectory

> **isDirectory**: `boolean`

Defined in: [packages/files/src/shared/types.ts:192](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L192)

Whether this is a directory

##### isFile

> **isFile**: `boolean`

Defined in: [packages/files/src/shared/types.ts:197](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L197)

Whether this is a regular file

##### mode

> **mode**: `number`

Defined in: [packages/files/src/shared/types.ts:222](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L222)

File mode (permissions)

##### mtime

> **mtime**: `Date`

Defined in: [packages/files/src/shared/types.ts:212](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L212)

Last modification time

##### size

> **size**: `number`

Defined in: [packages/files/src/shared/types.ts:187](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L187)

File size in bytes

##### uid

> **uid**: `number`

Defined in: [packages/files/src/shared/types.ts:227](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L227)

User ID of file owner

***

### FilesystemAdapterInterface

Defined in: [packages/files/src/filesystem.ts:9](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L9)

Interface defining the required methods for a filesystem adapter

#### Methods

##### delete()

> **delete**(`path`): `Promise`\<`void`\>

Defined in: [packages/files/src/filesystem.ts:41](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L41)

Deletes a file or directory

###### Parameters

###### path

`string`

Path to delete

###### Returns

`Promise`\<`void`\>

Promise that resolves when the deletion is complete

##### exists()

> **exists**(`path`): `Promise`\<`boolean`\>

Defined in: [packages/files/src/filesystem.ts:16](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L16)

Checks if a file or directory exists

###### Parameters

###### path

`string`

Path to check

###### Returns

`Promise`\<`boolean`\>

Promise resolving to boolean indicating existence

##### list()

> **list**(`path`): `Promise`\<`string`[]\>

Defined in: [packages/files/src/filesystem.ts:49](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L49)

Lists files in a directory

###### Parameters

###### path

`string`

Directory path to list

###### Returns

`Promise`\<`string`[]\>

Promise resolving to an array of file names

##### mimeType()

> **mimeType**(`path`): `Promise`\<`string`\>

Defined in: [packages/files/src/filesystem.ts:57](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L57)

Gets the MIME type for a file

###### Parameters

###### path

`string`

Path to the file

###### Returns

`Promise`\<`string`\>

Promise resolving to the MIME type string

##### read()

> **read**(`path`): `Promise`\<`string`\>

Defined in: [packages/files/src/filesystem.ts:24](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L24)

Reads a file's contents

###### Parameters

###### path

`string`

Path to the file

###### Returns

`Promise`\<`string`\>

Promise resolving to the file contents as a string

##### write()

> **write**(`path`, `content`): `Promise`\<`void`\>

Defined in: [packages/files/src/filesystem.ts:33](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L33)

Writes content to a file

###### Parameters

###### path

`string`

Path to the file

###### content

`string`

Content to write

###### Returns

`Promise`\<`void`\>

Promise that resolves when the write is complete

***

### FilesystemAdapterOptions

Defined in: [packages/files/src/filesystem.ts:63](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L63)

Configuration options for filesystem adapters

#### Properties

##### cacheDir?

> `optional` **cacheDir**: `string`

Defined in: [packages/files/src/filesystem.ts:72](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L72)

Directory to use for caching

##### type?

> `optional` **type**: `string`

Defined in: [packages/files/src/filesystem.ts:67](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/filesystem.ts#L67)

Type of filesystem adapter

***

### FilesystemCapabilities

Defined in: [packages/files/src/shared/types.ts:238](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L238)

Filesystem capabilities structure

#### Properties

##### atomicOperations

> **atomicOperations**: `boolean`

Defined in: [packages/files/src/shared/types.ts:247](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L247)

Whether the filesystem supports atomic operations

##### maxFileSize?

> `optional` **maxFileSize**: `number`

Defined in: [packages/files/src/shared/types.ts:272](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L272)

Maximum file size supported (in bytes)

##### offlineCapable

> **offlineCapable**: `boolean`

Defined in: [packages/files/src/shared/types.ts:267](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L267)

Whether the filesystem can work offline

##### realTimeSync

> **realTimeSync**: `boolean`

Defined in: [packages/files/src/shared/types.ts:262](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L262)

Whether the filesystem supports real-time synchronization

##### sharing

> **sharing**: `boolean`

Defined in: [packages/files/src/shared/types.ts:257](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L257)

Whether the filesystem supports sharing/permissions

##### streaming

> **streaming**: `boolean`

Defined in: [packages/files/src/shared/types.ts:242](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L242)

Whether the filesystem supports streaming

##### supportedOperations

> **supportedOperations**: `string`[]

Defined in: [packages/files/src/shared/types.ts:277](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L277)

Supported file operations

##### versioning

> **versioning**: `boolean`

Defined in: [packages/files/src/shared/types.ts:252](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L252)

Whether the filesystem supports file versioning

***

### FilesystemInterface

Defined in: [packages/files/src/shared/types.ts:283](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L283)

Core filesystem interface that all providers must implement

#### Properties

##### cache

> **cache**: `object`

Defined in: [packages/files/src/shared/types.ts:352](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L352)

Caching operations

###### clear()

> **clear**(`key?`): `Promise`\<`void`\>

###### Parameters

###### key?

`string`

###### Returns

`Promise`\<`void`\>

###### get()

> **get**(`key`, `expiry?`): `Promise`\<`undefined` \| `string`\>

###### Parameters

###### key

`string`

###### expiry?

`number`

###### Returns

`Promise`\<`undefined` \| `string`\>

###### set()

> **set**(`key`, `data`): `Promise`\<`void`\>

###### Parameters

###### key

`string`

###### data

`string`

###### Returns

`Promise`\<`void`\>

#### Methods

##### copy()

> **copy**(`sourcePath`, `destPath`): `Promise`\<`void`\>

Defined in: [packages/files/src/shared/types.ts:307](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L307)

Copy a file from source to destination

###### Parameters

###### sourcePath

`string`

###### destPath

`string`

###### Returns

`Promise`\<`void`\>

##### createDirectory()

> **createDirectory**(`path`, `options?`): `Promise`\<`void`\>

Defined in: [packages/files/src/shared/types.ts:317](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L317)

Create a directory

###### Parameters

###### path

`string`

###### options?

[`CreateDirOptions`](#creatediroptions)

###### Returns

`Promise`\<`void`\>

##### delete()

> **delete**(`path`): `Promise`\<`void`\>

Defined in: [packages/files/src/shared/types.ts:302](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L302)

Delete a file or directory

###### Parameters

###### path

`string`

###### Returns

`Promise`\<`void`\>

##### download()

> **download**(`remotePath`, `localPath?`, `options?`): `Promise`\<`string`\>

Defined in: [packages/files/src/shared/types.ts:342](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L342)

Download a file (for remote providers)

###### Parameters

###### remotePath

`string`

###### localPath?

`string`

###### options?

[`DownloadOptions`](#downloadoptions)

###### Returns

`Promise`\<`string`\>

##### downloadFileWithCache()

> **downloadFileWithCache**(`url`, `targetPath?`): `Promise`\<`string`\>

Defined in: [packages/files/src/shared/types.ts:393](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L393)

Download a file with caching support (legacy)

###### Parameters

###### url

`string`

###### targetPath?

`null` | `string`

###### Returns

`Promise`\<`string`\>

##### downloadFromUrl()

> **downloadFromUrl**(`url`, `filepath`): `Promise`\<`void`\>

Defined in: [packages/files/src/shared/types.ts:388](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L388)

Download a file from a URL and save it to a local file (legacy)

###### Parameters

###### url

`string`

###### filepath

`string`

###### Returns

`Promise`\<`void`\>

##### downloadWithCache()

> **downloadWithCache**(`remotePath`, `options?`): `Promise`\<`string`\>

Defined in: [packages/files/src/shared/types.ts:347](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L347)

Download file with caching

###### Parameters

###### remotePath

`string`

###### options?

[`CacheOptions`](#cacheoptions)

###### Returns

`Promise`\<`string`\>

##### ensureDirectoryExists()

> **ensureDirectoryExists**(`dir`): `Promise`\<`void`\>

Defined in: [packages/files/src/shared/types.ts:378](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L378)

Create a directory if it doesn't exist (legacy)

###### Parameters

###### dir

`string`

###### Returns

`Promise`\<`void`\>

##### exists()

> **exists**(`path`): `Promise`\<`boolean`\>

Defined in: [packages/files/src/shared/types.ts:287](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L287)

Check if a file or directory exists

###### Parameters

###### path

`string`

###### Returns

`Promise`\<`boolean`\>

##### getCached()

> **getCached**(`file`, `expiry?`): `Promise`\<`undefined` \| `string`\>

Defined in: [packages/files/src/shared/types.ts:403](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L403)

Get data from cache if available and not expired (legacy)

###### Parameters

###### file

`string`

###### expiry?

`number`

###### Returns

`Promise`\<`undefined` \| `string`\>

##### getCapabilities()

> **getCapabilities**(): `Promise`\<[`FilesystemCapabilities`](#filesystemcapabilities)\>

Defined in: [packages/files/src/shared/types.ts:361](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L361)

Get provider capabilities

###### Returns

`Promise`\<[`FilesystemCapabilities`](#filesystemcapabilities)\>

##### getMimeType()

> **getMimeType**(`path`): `Promise`\<`string`\>

Defined in: [packages/files/src/shared/types.ts:332](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L332)

Get MIME type for a file

###### Parameters

###### path

`string`

###### Returns

`Promise`\<`string`\>

##### getStats()

> **getStats**(`path`): `Promise`\<[`FileStats`](#filestats)\>

Defined in: [packages/files/src/shared/types.ts:327](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L327)

Get file statistics

###### Parameters

###### path

`string`

###### Returns

`Promise`\<[`FileStats`](#filestats)\>

##### isDirectory()

> **isDirectory**(`dir`): `Promise`\<`boolean`\>

Defined in: [packages/files/src/shared/types.ts:373](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L373)

Check if a path is a directory (legacy)

###### Parameters

###### dir

`string`

###### Returns

`Promise`\<`boolean`\>

##### isFile()

> **isFile**(`file`): `Promise`\<`false` \| [`FileStats`](#filestats)\>

Defined in: [packages/files/src/shared/types.ts:368](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L368)

Check if a path is a file (legacy)

###### Parameters

###### file

`string`

###### Returns

`Promise`\<`false` \| [`FileStats`](#filestats)\>

##### list()

> **list**(`path`, `options?`): `Promise`\<[`FileInfo`](#fileinfo)[]\>

Defined in: [packages/files/src/shared/types.ts:322](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L322)

List directory contents

###### Parameters

###### path

`string`

###### options?

[`ListOptions`](#listoptions)

###### Returns

`Promise`\<[`FileInfo`](#fileinfo)[]\>

##### listFiles()

> **listFiles**(`dirPath`, `options?`): `Promise`\<`string`[]\>

Defined in: [packages/files/src/shared/types.ts:398](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L398)

List files in a directory with optional filtering (legacy)

###### Parameters

###### dirPath

`string`

###### options?

[`ListFilesOptions`](#listfilesoptions)

###### Returns

`Promise`\<`string`[]\>

##### move()

> **move**(`sourcePath`, `destPath`): `Promise`\<`void`\>

Defined in: [packages/files/src/shared/types.ts:312](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L312)

Move a file from source to destination

###### Parameters

###### sourcePath

`string`

###### destPath

`string`

###### Returns

`Promise`\<`void`\>

##### read()

> **read**(`path`, `options?`): `Promise`\<`string` \| `Buffer`\<`ArrayBufferLike`\>\>

Defined in: [packages/files/src/shared/types.ts:292](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L292)

Read file contents

###### Parameters

###### path

`string`

###### options?

[`ReadOptions`](#readoptions)

###### Returns

`Promise`\<`string` \| `Buffer`\<`ArrayBufferLike`\>\>

##### setCached()

> **setCached**(`file`, `data`): `Promise`\<`void`\>

Defined in: [packages/files/src/shared/types.ts:408](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L408)

Set data in cache (legacy)

###### Parameters

###### file

`string`

###### data

`string`

###### Returns

`Promise`\<`void`\>

##### upload()

> **upload**(`localPath`, `remotePath`, `options?`): `Promise`\<`void`\>

Defined in: [packages/files/src/shared/types.ts:337](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L337)

Upload a file (for remote providers)

###### Parameters

###### localPath

`string`

###### remotePath

`string`

###### options?

[`UploadOptions`](#uploadoptions)

###### Returns

`Promise`\<`void`\>

##### uploadToUrl()

> **uploadToUrl**(`url`, `data`): `Promise`\<`Response`\>

Defined in: [packages/files/src/shared/types.ts:383](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L383)

Upload data to a URL using PUT method (legacy)

###### Parameters

###### url

`string`

###### data

`string` | `Buffer`\<`ArrayBufferLike`\>

###### Returns

`Promise`\<`Response`\>

##### write()

> **write**(`path`, `content`, `options?`): `Promise`\<`void`\>

Defined in: [packages/files/src/shared/types.ts:297](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L297)

Write content to a file

###### Parameters

###### path

`string`

###### content

`string` | `Buffer`\<`ArrayBufferLike`\>

###### options?

[`WriteOptions`](#writeoptions)

###### Returns

`Promise`\<`void`\>

***

### GoogleDriveOptions

Defined in: [packages/files/src/shared/types.ts:454](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L454)

Google Drive provider options

#### Extends

- [`BaseProviderOptions`](#baseprovideroptions)

#### Properties

##### basePath?

> `optional` **basePath**: `string`

Defined in: [packages/files/src/shared/types.ts:418](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L418)

Base path for operations

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`basePath`](#basepath-1)

##### cacheDir?

> `optional` **cacheDir**: `string`

Defined in: [packages/files/src/shared/types.ts:423](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L423)

Cache directory location

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`cacheDir`](#cachedir-2)

##### clientId

> **clientId**: `string`

Defined in: [packages/files/src/shared/types.ts:456](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L456)

##### clientSecret

> **clientSecret**: `string`

Defined in: [packages/files/src/shared/types.ts:457](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L457)

##### createMissing?

> `optional` **createMissing**: `boolean`

Defined in: [packages/files/src/shared/types.ts:428](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L428)

Whether to create missing directories

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`createMissing`](#createmissing-1)

##### folderId?

> `optional` **folderId**: `string`

Defined in: [packages/files/src/shared/types.ts:459](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L459)

##### refreshToken

> **refreshToken**: `string`

Defined in: [packages/files/src/shared/types.ts:458](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L458)

##### scopes?

> `optional` **scopes**: `string`[]

Defined in: [packages/files/src/shared/types.ts:460](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L460)

##### type

> **type**: `"gdrive"`

Defined in: [packages/files/src/shared/types.ts:455](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L455)

***

### ListFilesOptions

Defined in: [packages/files/src/shared/types.ts:133](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L133)

Options for listing files (legacy compatibility)

#### Properties

##### match?

> `optional` **match**: `RegExp`

Defined in: [packages/files/src/shared/types.ts:137](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L137)

Optional regular expression to filter files by name

***

### ListOptions

Defined in: [packages/files/src/shared/types.ts:58](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L58)

Options for listing directory contents

#### Properties

##### detailed?

> `optional` **detailed**: `boolean`

Defined in: [packages/files/src/shared/types.ts:72](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L72)

Whether to return full file information

##### filter?

> `optional` **filter**: `string` \| `RegExp`

Defined in: [packages/files/src/shared/types.ts:67](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L67)

Filter pattern for file names

##### recursive?

> `optional` **recursive**: `boolean`

Defined in: [packages/files/src/shared/types.ts:62](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L62)

Whether to include subdirectories

***

### LocalOptions

Defined in: [packages/files/src/shared/types.ts:434](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L434)

Local filesystem provider options

#### Extends

- [`BaseProviderOptions`](#baseprovideroptions)

#### Properties

##### basePath?

> `optional` **basePath**: `string`

Defined in: [packages/files/src/shared/types.ts:418](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L418)

Base path for operations

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`basePath`](#basepath-1)

##### cacheDir?

> `optional` **cacheDir**: `string`

Defined in: [packages/files/src/shared/types.ts:423](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L423)

Cache directory location

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`cacheDir`](#cachedir-2)

##### createMissing?

> `optional` **createMissing**: `boolean`

Defined in: [packages/files/src/shared/types.ts:428](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L428)

Whether to create missing directories

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`createMissing`](#createmissing-1)

##### type?

> `optional` **type**: `"local"`

Defined in: [packages/files/src/shared/types.ts:435](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L435)

***

### ReadOptions

Defined in: [packages/files/src/shared/types.ts:8](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L8)

Options for reading files

#### Properties

##### encoding?

> `optional` **encoding**: `BufferEncoding`

Defined in: [packages/files/src/shared/types.ts:12](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L12)

Text encoding for reading the file

##### raw?

> `optional` **raw**: `boolean`

Defined in: [packages/files/src/shared/types.ts:17](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L17)

Whether to return raw buffer data instead of string

***

### S3Options

Defined in: [packages/files/src/shared/types.ts:441](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L441)

S3-compatible provider options

#### Extends

- [`BaseProviderOptions`](#baseprovideroptions)

#### Properties

##### accessKeyId?

> `optional` **accessKeyId**: `string`

Defined in: [packages/files/src/shared/types.ts:445](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L445)

##### basePath?

> `optional` **basePath**: `string`

Defined in: [packages/files/src/shared/types.ts:418](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L418)

Base path for operations

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`basePath`](#basepath-1)

##### bucket

> **bucket**: `string`

Defined in: [packages/files/src/shared/types.ts:444](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L444)

##### cacheDir?

> `optional` **cacheDir**: `string`

Defined in: [packages/files/src/shared/types.ts:423](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L423)

Cache directory location

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`cacheDir`](#cachedir-2)

##### createMissing?

> `optional` **createMissing**: `boolean`

Defined in: [packages/files/src/shared/types.ts:428](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L428)

Whether to create missing directories

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`createMissing`](#createmissing-1)

##### endpoint?

> `optional` **endpoint**: `string`

Defined in: [packages/files/src/shared/types.ts:447](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L447)

##### forcePathStyle?

> `optional` **forcePathStyle**: `boolean`

Defined in: [packages/files/src/shared/types.ts:448](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L448)

##### region

> **region**: `string`

Defined in: [packages/files/src/shared/types.ts:443](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L443)

##### secretAccessKey?

> `optional` **secretAccessKey**: `string`

Defined in: [packages/files/src/shared/types.ts:446](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L446)

##### type

> **type**: `"s3"`

Defined in: [packages/files/src/shared/types.ts:442](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L442)

***

### UploadOptions

Defined in: [packages/files/src/shared/types.ts:78](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L78)

Options for file upload operations

#### Properties

##### contentType?

> `optional` **contentType**: `string`

Defined in: [packages/files/src/shared/types.ts:82](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L82)

Content type for the upload

##### metadata?

> `optional` **metadata**: `Record`\<`string`, `string`\>

Defined in: [packages/files/src/shared/types.ts:92](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L92)

Custom metadata to attach to the file

##### onProgress()?

> `optional` **onProgress**: (`progress`) => `void`

Defined in: [packages/files/src/shared/types.ts:97](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L97)

Progress callback function

###### Parameters

###### progress

###### loaded

`number`

###### total

`number`

###### Returns

`void`

##### overwrite?

> `optional` **overwrite**: `boolean`

Defined in: [packages/files/src/shared/types.ts:87](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L87)

Whether to overwrite existing files

***

### WebDAVOptions

Defined in: [packages/files/src/shared/types.ts:466](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L466)

WebDAV provider options (supports Nextcloud, ownCloud, Apache, etc.)

#### Extends

- [`BaseProviderOptions`](#baseprovideroptions)

#### Properties

##### basePath?

> `optional` **basePath**: `string`

Defined in: [packages/files/src/shared/types.ts:418](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L418)

Base path for operations

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`basePath`](#basepath-1)

##### baseUrl

> **baseUrl**: `string`

Defined in: [packages/files/src/shared/types.ts:468](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L468)

##### cacheDir?

> `optional` **cacheDir**: `string`

Defined in: [packages/files/src/shared/types.ts:423](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L423)

Cache directory location

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`cacheDir`](#cachedir-2)

##### createMissing?

> `optional` **createMissing**: `boolean`

Defined in: [packages/files/src/shared/types.ts:428](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L428)

Whether to create missing directories

###### Inherited from

[`BaseProviderOptions`](#baseprovideroptions).[`createMissing`](#createmissing-1)

##### davPath?

> `optional` **davPath**: `string`

Defined in: [packages/files/src/shared/types.ts:471](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L471)

##### password

> **password**: `string`

Defined in: [packages/files/src/shared/types.ts:470](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L470)

##### type

> **type**: `"webdav"`

Defined in: [packages/files/src/shared/types.ts:467](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L467)

##### username

> **username**: `string`

Defined in: [packages/files/src/shared/types.ts:469](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L469)

***

### WriteOptions

Defined in: [packages/files/src/shared/types.ts:23](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L23)

Options for writing files

#### Properties

##### createParents?

> `optional` **createParents**: `boolean`

Defined in: [packages/files/src/shared/types.ts:37](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L37)

Whether to create parent directories if they don't exist

##### encoding?

> `optional` **encoding**: `BufferEncoding`

Defined in: [packages/files/src/shared/types.ts:27](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L27)

Text encoding for writing the file

##### mode?

> `optional` **mode**: `number`

Defined in: [packages/files/src/shared/types.ts:32](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L32)

File mode (permissions)

## Type Aliases

### GetFilesystemOptions

> **GetFilesystemOptions** = [`LocalOptions`](#localoptions) \| [`S3Options`](#s3options) \| [`GoogleDriveOptions`](#googledriveoptions) \| [`WebDAVOptions`](#webdavoptions) \| [`BrowserStorageOptions`](#browserstorageoptions)

Defined in: [packages/files/src/shared/types.ts:492](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/types.ts#L492)

Union type for all provider options

## Functions

### addRateLimit()

> **addRateLimit**(`domain`, `limit`, `interval`): `Promise`\<`void`\>

Defined in: [packages/files/src/fetch.ts:123](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/fetch.ts#L123)

Sets rate limit for a specific domain

#### Parameters

##### domain

`string`

Domain to set limits for

##### limit

`number`

Maximum number of requests per interval

##### interval

`number`

Interval in milliseconds

#### Returns

`Promise`\<`void`\>

***

### download()

> **download**(`url`, `filepath`): `Promise`\<`void`\>

Defined in: [packages/files/src/legacy.ts:112](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/legacy.ts#L112)

Downloads a file from a URL and saves it to a local file

#### Parameters

##### url

`string`

URL to download from

##### filepath

`string`

Local file path to save to

#### Returns

`Promise`\<`void`\>

Promise that resolves when the download is complete

#### Throws

Error if the download fails

***

### downloadFileWithCache()

> **downloadFileWithCache**(`url`, `targetPath`): `Promise`\<`string`\>

Defined in: [packages/files/src/legacy.ts:154](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/legacy.ts#L154)

Downloads a file with caching support

#### Parameters

##### url

`string`

URL to download from

##### targetPath

Optional custom target path

`null` | `string`

#### Returns

`Promise`\<`string`\>

Promise that resolves with the path to the downloaded file

***

### ensureDirectoryExists()

> **ensureDirectoryExists**(`dir`): `Promise`\<`void`\>

Defined in: [packages/files/src/legacy.ts:67](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/legacy.ts#L67)

Creates a directory if it doesn't exist

#### Parameters

##### dir

`string`

Directory path to create

#### Returns

`Promise`\<`void`\>

Promise that resolves when the directory exists or has been created

***

### fetchBuffer()

> **fetchBuffer**(`url`): `Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

Defined in: [packages/files/src/fetch.ts:190](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/fetch.ts#L190)

Fetches a URL and returns the response as a Buffer

#### Parameters

##### url

`string`

URL to fetch

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

Promise resolving to the response body as a Buffer

***

### fetchJSON()

> **fetchJSON**(`url`): `Promise`\<`any`\>

Defined in: [packages/files/src/fetch.ts:179](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/fetch.ts#L179)

Fetches a URL and returns the response as parsed JSON

#### Parameters

##### url

`string`

URL to fetch

#### Returns

`Promise`\<`any`\>

Promise resolving to the parsed JSON response

***

### fetchText()

> **fetchText**(`url`): `Promise`\<`string`\>

Defined in: [packages/files/src/fetch.ts:168](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/fetch.ts#L168)

Fetches a URL and returns the response as text

#### Parameters

##### url

`string`

URL to fetch

#### Returns

`Promise`\<`string`\>

Promise resolving to the response body as a string

***

### fetchToFile()

> **fetchToFile**(`url`, `filepath`): `Promise`\<`void`\>

Defined in: [packages/files/src/fetch.ts:202](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/fetch.ts#L202)

Fetches a URL and saves the response to a file

#### Parameters

##### url

`string`

URL to fetch

##### filepath

`string`

Path to save the file to

#### Returns

`Promise`\<`void`\>

Promise that resolves when the file is saved

***

### getAvailableProviders()

> **getAvailableProviders**(): `string`[]

Defined in: [packages/files/src/shared/factory.ts:30](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/factory.ts#L30)

Get list of available provider types

#### Returns

`string`[]

***

### getCached()

> **getCached**(`file`, `expiry`): `Promise`\<`undefined` \| `string`\>

Defined in: [packages/files/src/legacy.ts:211](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/legacy.ts#L211)

Gets data from cache if available and not expired

#### Parameters

##### file

`string`

Cache file identifier

##### expiry

`number` = `300000`

Cache expiry time in milliseconds

#### Returns

`Promise`\<`undefined` \| `string`\>

Promise that resolves with the cached data or undefined if not found/expired

***

### getFilesystem()

> **getFilesystem**(`options`): `Promise`\<[`FilesystemInterface`](#filesysteminterface)\>

Defined in: [packages/files/src/shared/factory.ts:166](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/factory.ts#L166)

Main factory function to create filesystem instances

#### Parameters

##### options

[`GetFilesystemOptions`](#getfilesystemoptions) = `{}`

#### Returns

`Promise`\<[`FilesystemInterface`](#filesysteminterface)\>

***

### getMimeType()

> **getMimeType**(`fileOrUrl`): `string`

Defined in: [packages/files/src/legacy.ts:273](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/legacy.ts#L273)

Gets the MIME type for a file or URL based on its extension

#### Parameters

##### fileOrUrl

`string`

File path or URL to get MIME type for

#### Returns

`string`

MIME type string, defaults to 'application/octet-stream' if not found

***

### getProviderInfo()

> **getProviderInfo**(`type`): `object`

Defined in: [packages/files/src/shared/factory.ts:222](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/factory.ts#L222)

Get provider information

#### Parameters

##### type

`string`

#### Returns

`object`

##### available

> **available**: `boolean`

##### description

> **description**: `string`

##### requiredOptions

> **requiredOptions**: `string`[]

***

### getRateLimit()

> **getRateLimit**(`domain`): `Promise`\<\{ `interval`: `number`; `limit`: `number`; \}\>

Defined in: [packages/files/src/fetch.ts:137](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/fetch.ts#L137)

Gets rate limit configuration for a domain

#### Parameters

##### domain

`string`

Domain to get limits for

#### Returns

`Promise`\<\{ `interval`: `number`; `limit`: `number`; \}\>

Rate limit configuration object with limit and interval properties

***

### initializeProviders()

> **initializeProviders**(): `Promise`\<`void`\>

Defined in: [packages/files/src/shared/factory.ts:201](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/factory.ts#L201)

Initialize providers by registering them

#### Returns

`Promise`\<`void`\>

***

### isDirectory()

> **isDirectory**(`dir`): `boolean`

Defined in: [packages/files/src/legacy.ts:48](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/legacy.ts#L48)

Checks if a path is a directory

#### Parameters

##### dir

`string`

Path to check

#### Returns

`boolean`

True if the path is a directory, false if it doesn't exist

#### Throws

Error if the path exists but is not a directory

***

### isFile()

> **isFile**(`file`): `undefined` \| `false` \| `Stats` \| `BigIntStats`

Defined in: [packages/files/src/legacy.ts:32](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/legacy.ts#L32)

Checks if a path is a file

#### Parameters

##### file

`string`

Path to check

#### Returns

`undefined` \| `false` \| `Stats` \| `BigIntStats`

File stats if the path is a file, false otherwise

***

### isProviderAvailable()

> **isProviderAvailable**(`type`): `boolean`

Defined in: [packages/files/src/shared/factory.ts:215](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/shared/factory.ts#L215)

Check if a provider is available

#### Parameters

##### type

`string`

#### Returns

`boolean`

***

### listFiles()

> **listFiles**(`dirPath`, `options`): `Promise`\<`string`[]\>

Defined in: [packages/files/src/legacy.ts:190](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/legacy.ts#L190)

Lists files in a directory with optional filtering

#### Parameters

##### dirPath

`string`

Directory path to list files from

##### options

`ListFilesOptions` = `...`

Filtering options

#### Returns

`Promise`\<`string`[]\>

Promise that resolves with an array of file names

***

### setCached()

> **setCached**(`file`, `data`): `Promise`\<`void`\>

Defined in: [packages/files/src/legacy.ts:232](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/legacy.ts#L232)

Sets data in cache

#### Parameters

##### file

`string`

Cache file identifier

##### data

`string`

Data to cache

#### Returns

`Promise`\<`void`\>

Promise that resolves when the data is cached

***

### upload()

> **upload**(`url`, `data`): `Promise`\<`Response`\>

Defined in: [packages/files/src/legacy.ts:82](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/files/src/legacy.ts#L82)

Uploads data to a URL using PUT method

#### Parameters

##### url

`string`

URL to upload data to

##### data

String or Buffer data to upload

`string` | `Buffer`\<`ArrayBufferLike`\>

#### Returns

`Promise`\<`Response`\>

Promise that resolves with the Response object

#### Throws

Error if the upload fails
