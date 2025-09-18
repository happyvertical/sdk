# @have/smrt

## Classes

### AIError

Defined in: packages/smrt/src/errors.ts:105

AI integration errors

#### Extends

- [`SmrtError`](#smrterror)

#### Constructors

##### Constructor

> **new AIError**(`message`, `code`, `details?`, `cause?`): [`AIError`](#aierror)

Defined in: packages/smrt/src/errors.ts:106

###### Parameters

###### message

`string`

###### code

`string`

###### details?

`Record`\<`string`, `any`\>

###### cause?

`Error`

###### Returns

[`AIError`](#aierror)

###### Overrides

[`SmrtError`](#smrterror).[`constructor`](#constructor-18)

#### Properties

##### category

> `readonly` **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

Defined in: packages/smrt/src/errors.ts:13

###### Inherited from

[`SmrtError`](#smrterror).[`category`](#category-6)

##### cause?

> `readonly` `optional` **cause**: `Error`

Defined in: packages/smrt/src/errors.ts:15

The cause of the error.

###### Inherited from

[`SmrtError`](#smrterror).[`cause`](#cause-6)

##### code

> `readonly` **code**: `string`

Defined in: packages/smrt/src/errors.ts:12

###### Inherited from

[`SmrtError`](#smrterror).[`code`](#code-6)

##### details?

> `readonly` `optional` **details**: `Record`\<`string`, `any`\>

Defined in: packages/smrt/src/errors.ts:14

###### Inherited from

[`SmrtError`](#smrterror).[`details`](#details-6)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`SmrtError`](#smrterror).[`message`](#message-6)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`SmrtError`](#smrterror).[`name`](#name-8)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`SmrtError`](#smrterror).[`stack`](#stack-6)

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

[`SmrtError`](#smrterror).[`prepareStackTrace`](#preparestacktrace-6)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`SmrtError`](#smrterror).[`stackTraceLimit`](#stacktracelimit-6)

#### Methods

##### toJSON()

> **toJSON**(): `object`

Defined in: packages/smrt/src/errors.ts:40

Converts error to a serializable object for logging/debugging

###### Returns

`object`

###### category

> **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

###### cause

> **cause**: `undefined` \| \{ `message`: `string`; `name`: `string`; `stack`: `undefined` \| `string`; \}

###### code

> **code**: `string`

###### details

> **details**: `undefined` \| `Record`\<`string`, `any`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### Inherited from

[`SmrtError`](#smrterror).[`toJSON`](#tojson-12)

##### authenticationFailed()

> `static` **authenticationFailed**(`provider`): [`AIError`](#aierror)

Defined in: packages/smrt/src/errors.ts:135

###### Parameters

###### provider

`string`

###### Returns

[`AIError`](#aierror)

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

[`SmrtError`](#smrterror).[`captureStackTrace`](#capturestacktrace-18)

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

[`SmrtError`](#smrterror).[`captureStackTrace`](#capturestacktrace-18)

##### invalidResponse()

> `static` **invalidResponse**(`provider`, `response`): [`AIError`](#aierror)

Defined in: packages/smrt/src/errors.ts:127

###### Parameters

###### provider

`string`

###### response

`any`

###### Returns

[`AIError`](#aierror)

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

[`SmrtError`](#smrterror).[`isError`](#iserror-12)

##### providerError()

> `static` **providerError**(`provider`, `operation`, `cause?`): [`AIError`](#aierror)

Defined in: packages/smrt/src/errors.ts:110

###### Parameters

###### provider

`string`

###### operation

`string`

###### cause?

`Error`

###### Returns

[`AIError`](#aierror)

##### rateLimitExceeded()

> `static` **rateLimitExceeded**(`provider`, `retryAfter?`): [`AIError`](#aierror)

Defined in: packages/smrt/src/errors.ts:119

###### Parameters

###### provider

`string`

###### retryAfter?

`number`

###### Returns

[`AIError`](#aierror)

***

### APIGenerator

Defined in: [packages/smrt/src/generators/rest.ts:33](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L33)

High-performance API generator using native Bun

#### Constructors

##### Constructor

> **new APIGenerator**(`config`, `context`): [`APIGenerator`](#apigenerator)

Defined in: [packages/smrt/src/generators/rest.ts:38](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L38)

###### Parameters

###### config

[`APIConfig`](#apiconfig) = `{}`

###### context

[`APIContext`](#apicontext) = `{}`

###### Returns

[`APIGenerator`](#apigenerator)

#### Methods

##### createServer()

> **createServer**(): `object`

Defined in: [packages/smrt/src/generators/rest.ts:52](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L52)

Create Bun server with all routes

###### Returns

`object`

###### server

> **server**: `any`

###### url

> **url**: `string`

##### generateHandler()

> **generateHandler**(): (`req`) => `Promise`\<`Response`\>

Defined in: [packages/smrt/src/generators/rest.ts:68](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L68)

Generate fetch handler function (for serverless environments)

###### Returns

> (`req`): `Promise`\<`Response`\>

###### Parameters

###### req

`Request`

###### Returns

`Promise`\<`Response`\>

***

### ASTScanner

Defined in: [packages/smrt/src/scanner/ast-scanner.ts:16](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/ast-scanner.ts#L16)

AST scanning and manifest generation for SMRT objects

#### Constructors

##### Constructor

> **new ASTScanner**(`filePaths`, `options`): [`ASTScanner`](#astscanner)

Defined in: [packages/smrt/src/scanner/ast-scanner.ts:21](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/ast-scanner.ts#L21)

###### Parameters

###### filePaths

`string`[]

###### options

[`ScanOptions`](#scanoptions) = `{}`

###### Returns

[`ASTScanner`](#astscanner)

#### Methods

##### scanFiles()

> **scanFiles**(): [`ScanResult`](#scanresult)[]

Defined in: [packages/smrt/src/scanner/ast-scanner.ts:47](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/ast-scanner.ts#L47)

Scan files for SMRT object definitions

###### Returns

[`ScanResult`](#scanresult)[]

***

### BaseClass\<T\>

Defined in: [packages/smrt/src/class.ts:45](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L45)

Foundation class providing core functionality for the SMRT framework

BaseClass provides unified access to database, filesystem, and AI client
interfaces. It serves as the foundation for all other classes in the
SMRT framework.

#### Extended by

- [`BaseObject`](#baseobject)
- [`BaseCollection`](#basecollection)

#### Type Parameters

##### T

`T` *extends* [`BaseClassOptions`](#baseclassoptions-1) = [`BaseClassOptions`](#baseclassoptions-1)

#### Constructors

##### Constructor

> **new BaseClass**\<`T`\>(`options`): [`BaseClass`](#baseclass)\<`T`\>

Defined in: [packages/smrt/src/class.ts:76](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L76)

Creates a new BaseClass instance

###### Parameters

###### options

`T`

Configuration options for database, filesystem, and AI clients

###### Returns

[`BaseClass`](#baseclass)\<`T`\>

#### Properties

##### \_ai

> `protected` **\_ai**: `AIClient`

Defined in: [packages/smrt/src/class.ts:49](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L49)

AI client instance for interacting with AI models

##### \_className

> `protected` **\_className**: `string`

Defined in: [packages/smrt/src/class.ts:64](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L64)

Class name used for identification

##### \_db

> `protected` **\_db**: `DatabaseInterface`

Defined in: [packages/smrt/src/class.ts:59](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L59)

Database interface for data persistence

##### \_fs

> `protected` **\_fs**: `FilesystemAdapter`

Defined in: [packages/smrt/src/class.ts:54](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L54)

Filesystem adapter for file operations

##### options

> `protected` **options**: `T`

Defined in: [packages/smrt/src/class.ts:69](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L69)

Configuration options provided to the class

#### Accessors

##### ai

###### Get Signature

> **get** **ai**(): `AIClient`

Defined in: [packages/smrt/src/class.ts:118](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L118)

Gets the AI client instance

###### Returns

`AIClient`

##### db

###### Get Signature

> **get** **db**(): `DatabaseInterface`

Defined in: [packages/smrt/src/class.ts:111](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L111)

Gets the database interface instance

###### Returns

`DatabaseInterface`

##### fs

###### Get Signature

> **get** **fs**(): `FilesystemAdapter`

Defined in: [packages/smrt/src/class.ts:104](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L104)

Gets the filesystem adapter instance

###### Returns

`FilesystemAdapter`

#### Methods

##### initialize()

> `protected` **initialize**(): `Promise`\<`void`\>

Defined in: [packages/smrt/src/class.ts:89](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L89)

Initializes database, filesystem, and AI client connections

This method sets up all required services based on the provided options.
It should be called before using any of the service interfaces.

###### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

***

### BaseCollection\<ModelType, T\>

Defined in: [packages/smrt/src/collection.ts:25](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L25)

Collection interface for managing sets of BaseObjects

BaseCollection provides methods for querying, creating, and managing
collections of persistent objects. It handles database setup, schema
generation, and provides a fluent interface for querying objects.

#### Extends

- [`BaseClass`](#baseclass)\<`T`\>

#### Type Parameters

##### ModelType

`ModelType` *extends* [`BaseObject`](#baseobject)\<`any`\>

##### T

`T` *extends* [`BaseCollectionOptions`](#basecollectionoptions-1) = [`BaseCollectionOptions`](#basecollectionoptions-1)

#### Constructors

##### Constructor

> **new BaseCollection**\<`ModelType`, `T`\>(`options`): [`BaseCollection`](#basecollection)\<`ModelType`, `T`\>

Defined in: [packages/smrt/src/collection.ts:130](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L130)

Creates a new BaseCollection instance

###### Parameters

###### options

`T`

Configuration options

###### Returns

[`BaseCollection`](#basecollection)\<`ModelType`, `T`\>

###### Overrides

[`BaseClass`](#baseclass).[`constructor`](#constructor-3)

#### Properties

##### \_ai

> `protected` **\_ai**: `AIClient`

Defined in: [packages/smrt/src/class.ts:49](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L49)

AI client instance for interacting with AI models

###### Inherited from

[`BaseClass`](#baseclass).[`_ai`](#_ai)

##### \_className

> `protected` **\_className**: `string`

Defined in: [packages/smrt/src/class.ts:64](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L64)

Class name used for identification

###### Inherited from

[`BaseClass`](#baseclass).[`_className`](#_classname)

##### \_db

> `protected` **\_db**: `DatabaseInterface`

Defined in: [packages/smrt/src/class.ts:59](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L59)

Database interface for data persistence

###### Inherited from

[`BaseClass`](#baseclass).[`_db`](#_db)

##### \_db\_setup\_promise

> `protected` **\_db\_setup\_promise**: `null` \| `Promise`\<`void`\> = `null`

Defined in: [packages/smrt/src/collection.ts:32](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L32)

Promise tracking the database setup operation

##### \_fs

> `protected` **\_fs**: `FilesystemAdapter`

Defined in: [packages/smrt/src/class.ts:54](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L54)

Filesystem adapter for file operations

###### Inherited from

[`BaseClass`](#baseclass).[`_fs`](#_fs)

##### \_tableName

> **\_tableName**: `string`

Defined in: [packages/smrt/src/collection.ts:106](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L106)

Database table name for this collection

##### options

> `protected` **options**: `T`

Defined in: [packages/smrt/src/class.ts:69](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L69)

Configuration options provided to the class

###### Inherited from

[`BaseClass`](#baseclass).[`options`](#options)

##### \_itemClass

> `readonly` `static` **\_itemClass**: `any`

Defined in: [packages/smrt/src/collection.ts:66](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L66)

Static reference to the item class constructor

#### Accessors

##### \_itemClass

###### Get Signature

> **get** `protected` **\_itemClass**(): (`options`) => `ModelType` & `object`

Defined in: [packages/smrt/src/collection.ts:37](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L37)

Gets the class constructor for items in this collection

###### Returns

(`options`) => `ModelType` & `object`

##### ai

###### Get Signature

> **get** **ai**(): `AIClient`

Defined in: [packages/smrt/src/class.ts:118](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L118)

Gets the AI client instance

###### Returns

`AIClient`

###### Inherited from

[`BaseClass`](#baseclass).[`ai`](#ai)

##### db

###### Get Signature

> **get** **db**(): `DatabaseInterface`

Defined in: [packages/smrt/src/class.ts:111](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L111)

Gets the database interface instance

###### Returns

`DatabaseInterface`

###### Inherited from

[`BaseClass`](#baseclass).[`db`](#db)

##### fs

###### Get Signature

> **get** **fs**(): `FilesystemAdapter`

Defined in: [packages/smrt/src/class.ts:104](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L104)

Gets the filesystem adapter instance

###### Returns

`FilesystemAdapter`

###### Inherited from

[`BaseClass`](#baseclass).[`fs`](#fs)

##### tableName

###### Get Signature

> **get** **tableName**(): `string`

Defined in: [packages/smrt/src/collection.ts:432](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L432)

Gets the database table name for this collection

###### Returns

`string`

#### Methods

##### count()

> **count**(`options`): `Promise`\<`number`\>

Defined in: [packages/smrt/src/collection.ts:468](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L468)

Counts records in the collection matching the given filters

Accepts the same where conditions as list() but ignores limit/offset/orderBy.

###### Parameters

###### options

Query options object

###### where?

`Record`\<`string`, `any`\>

Record of conditions to filter results

###### Returns

`Promise`\<`number`\>

Promise resolving to the total count of matching records

##### create()

> **create**(`options`): `ModelType` \| `Promise`\<`ModelType`\>

Defined in: [packages/smrt/src/collection.ts:279](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L279)

Creates a new instance of the collection's item class

###### Parameters

###### options

`any`

Options for creating the item

###### Returns

`ModelType` \| `Promise`\<`ModelType`\>

New item instance

##### generateSchema()

> **generateSchema**(): `string`

Defined in: [packages/smrt/src/collection.ts:382](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L382)

Generates database schema for the collection's item class

###### Returns

`string`

Schema object for database setup

##### generateTableName()

> **generateTableName**(): `string`

Defined in: [packages/smrt/src/collection.ts:444](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L444)

Generates a table name from the collection class name

###### Returns

`string`

Generated table name

##### get()

> **get**(`filter`): `Promise`\<`null` \| `ModelType`\>

Defined in: [packages/smrt/src/collection.ts:152](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L152)

Retrieves a single object from the collection by ID, slug, or custom filter

###### Parameters

###### filter

String ID/slug or object with filter conditions

`string` | `Record`\<`string`, `any`\>

###### Returns

`Promise`\<`null` \| `ModelType`\>

Promise resolving to the object or null if not found

##### getDiff()

> **getDiff**(`existing`, `data`): `Record`\<`string`, `any`\>

Defined in: [packages/smrt/src/collection.ts:328](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L328)

Gets differences between an existing object and new data

###### Parameters

###### existing

`Record`\<`string`, `any`\>

Existing object

###### data

`Record`\<`string`, `any`\>

New data

###### Returns

`Record`\<`string`, `any`\>

Object containing only the changed fields

##### getFields()

> **getFields**(): `Record`\<`string`, `any`\>

Defined in: [packages/smrt/src/collection.ts:373](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L373)

Gets field definitions for the collection's item class

###### Returns

`Record`\<`string`, `any`\>

Object containing field definitions

##### getOrUpsert()

> **getOrUpsert**(`data`, `defaults`): `Promise`\<`ModelType`\>

Defined in: [packages/smrt/src/collection.ts:295](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L295)

Gets an existing item or creates a new one if it doesn't exist

###### Parameters

###### data

`any`

Object data to find or create

###### defaults

`any` = `{}`

Default values to use if creating a new object

###### Returns

`Promise`\<`ModelType`\>

Promise resolving to the existing or new object

##### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [packages/smrt/src/collection.ts:139](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L139)

Initializes the collection, setting up database tables

###### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

###### Overrides

[`BaseClass`](#baseclass).[`initialize`](#initialize)

##### list()

> **list**(`options`): `Promise`\<`Awaited`\<`ModelType`\>[]\>

Defined in: [packages/smrt/src/collection.ts:215](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L215)

Lists records from the collection with flexible filtering options

###### Parameters

###### options

Query options object

###### limit?

`number`

Maximum number of records to return

###### offset?

`number`

Number of records to skip

###### orderBy?

`string` \| `string`[]

Field(s) to order results by, with optional direction

###### where?

`Record`\<`string`, `any`\>

Record of conditions to filter results. Each key can include an operator
                     separated by a space (e.g., 'price >', 'name like'). Default operator is '='.

###### Returns

`Promise`\<`Awaited`\<`ModelType`\>[]\>

Promise resolving to an array of model instances

###### Example

```typescript
// Find active products priced between $100-$200
await collection.list({
  where: {
    'price >': 100,
    'price <=': 200,
    'status': 'active',              // equals operator is default
    'category in': ['A', 'B', 'C'],  // IN operator for arrays
    'name like': '%shirt%',          // LIKE for pattern matching
    'deleted_at !=': null            // exclude deleted items
  },
  limit: 10,
  offset: 0
});

// Find users matching pattern but not in specific roles
await users.list({
  where: {
    'email like': '%@company.com',
    'active': true,
    'role in': ['guest', 'blocked'],
    'last_login <': lastMonth
  }
});
```

##### setupDb()

> **setupDb**(): `Promise`\<`void`\>

Defined in: [packages/smrt/src/collection.ts:349](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L349)

Sets up the database schema for this collection

###### Returns

`Promise`\<`void`\>

Promise that resolves when setup is complete

##### setupTriggers()

> **setupTriggers**(): `Promise`\<`void`\>

Defined in: [packages/smrt/src/collection.ts:392](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L392)

Sets up database triggers for automatically updating timestamps

###### Returns

`Promise`\<`void`\>

Promise that resolves when triggers are set up

##### validate()

> `static` **validate**(): `void`

Defined in: [packages/smrt/src/collection.ts:72](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L72)

Validates that the collection is properly configured
Call this during development to catch configuration issues early

###### Returns

`void`

***

### BaseObject\<T\>

Defined in: [packages/smrt/src/object.ts:63](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L63)

Base persistent object with unique identifiers and database storage

BaseObject provides functionality for creating, loading, and saving objects
to a database. It supports identification via unique IDs and URL-friendly
slugs, with optional context scoping.

#### Extends

- [`BaseClass`](#baseclass)\<`T`\>

#### Extended by

- [`Pleb`](#pleb)

#### Type Parameters

##### T

`T` *extends* [`BaseObjectOptions`](#baseobjectoptions-1) = [`BaseObjectOptions`](#baseobjectoptions-1)

#### Constructors

##### Constructor

> **new BaseObject**\<`T`\>(`options`): [`BaseObject`](#baseobject)\<`T`\>

Defined in: [packages/smrt/src/object.ts:107](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L107)

Creates a new BaseObject instance

###### Parameters

###### options

`T`

Configuration options including identifiers and metadata

###### Returns

[`BaseObject`](#baseobject)\<`T`\>

###### Throws

Error if options is null

###### Overrides

[`BaseClass`](#baseclass).[`constructor`](#constructor-3)

#### Properties

##### \_ai

> `protected` **\_ai**: `AIClient`

Defined in: [packages/smrt/src/class.ts:49](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L49)

AI client instance for interacting with AI models

###### Inherited from

[`BaseClass`](#baseclass).[`_ai`](#_ai)

##### \_className

> `protected` **\_className**: `string`

Defined in: [packages/smrt/src/class.ts:64](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L64)

Class name used for identification

###### Inherited from

[`BaseClass`](#baseclass).[`_className`](#_classname)

##### \_context

> `protected` **\_context**: `undefined` \| `null` \| `string`

Defined in: [packages/smrt/src/object.ts:84](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L84)

Optional context to scope the slug

##### \_db

> `protected` **\_db**: `DatabaseInterface`

Defined in: [packages/smrt/src/class.ts:59](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L59)

Database interface for data persistence

###### Inherited from

[`BaseClass`](#baseclass).[`_db`](#_db)

##### \_fs

> `protected` **\_fs**: `FilesystemAdapter`

Defined in: [packages/smrt/src/class.ts:54](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L54)

Filesystem adapter for file operations

###### Inherited from

[`BaseClass`](#baseclass).[`_fs`](#_fs)

##### \_id

> `protected` **\_id**: `undefined` \| `null` \| `string`

Defined in: [packages/smrt/src/object.ts:74](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L74)

Unique identifier for the object

##### \_slug

> `protected` **\_slug**: `undefined` \| `null` \| `string`

Defined in: [packages/smrt/src/object.ts:79](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L79)

URL-friendly identifier

##### \_tableName

> **\_tableName**: `string`

Defined in: [packages/smrt/src/object.ts:69](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L69)

Database table name for this object

##### created\_at

> **created\_at**: `undefined` \| `null` \| `Date`

Defined in: [packages/smrt/src/object.ts:94](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L94)

Creation timestamp

##### name

> **name**: `undefined` \| `null` \| `string`

Defined in: [packages/smrt/src/object.ts:89](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L89)

Human-readable name, primarily for display purposes

##### options

> `protected` **options**: `T`

Defined in: [packages/smrt/src/class.ts:69](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L69)

Configuration options provided to the class

###### Inherited from

[`BaseClass`](#baseclass).[`options`](#options)

##### updated\_at

> **updated\_at**: `undefined` \| `null` \| `Date`

Defined in: [packages/smrt/src/object.ts:99](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L99)

Last update timestamp

#### Accessors

##### ai

###### Get Signature

> **get** **ai**(): `AIClient`

Defined in: [packages/smrt/src/class.ts:118](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L118)

Gets the AI client instance

###### Returns

`AIClient`

###### Inherited from

[`BaseClass`](#baseclass).[`ai`](#ai)

##### context

###### Get Signature

> **get** **context**(): `string`

Defined in: [packages/smrt/src/object.ts:190](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L190)

Gets the context that scopes this object's slug

###### Returns

`string`

###### Set Signature

> **set** **context**(`value`): `void`

Defined in: [packages/smrt/src/object.ts:200](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L200)

Sets the context that scopes this object's slug

###### Throws

Error if the value is invalid

###### Parameters

###### value

The context to set

`undefined` | `null` | `string`

###### Returns

`void`

##### db

###### Get Signature

> **get** **db**(): `DatabaseInterface`

Defined in: [packages/smrt/src/class.ts:111](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L111)

Gets the database interface instance

###### Returns

`DatabaseInterface`

###### Inherited from

[`BaseClass`](#baseclass).[`db`](#db)

##### fs

###### Get Signature

> **get** **fs**(): `FilesystemAdapter`

Defined in: [packages/smrt/src/class.ts:104](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L104)

Gets the filesystem adapter instance

###### Returns

`FilesystemAdapter`

###### Inherited from

[`BaseClass`](#baseclass).[`fs`](#fs)

##### id

###### Get Signature

> **get** **id**(): `undefined` \| `null` \| `string`

Defined in: [packages/smrt/src/object.ts:149](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L149)

Gets the unique identifier for this object

###### Returns

`undefined` \| `null` \| `string`

###### Set Signature

> **set** **id**(`value`): `void`

Defined in: [packages/smrt/src/object.ts:159](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L159)

Sets the unique identifier for this object

###### Throws

Error if the value is invalid

###### Parameters

###### value

The ID to set

`undefined` | `null` | `string`

###### Returns

`void`

##### slug

###### Get Signature

> **get** **slug**(): `undefined` \| `null` \| `string`

Defined in: [packages/smrt/src/object.ts:169](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L169)

Gets the URL-friendly slug for this object

###### Returns

`undefined` \| `null` \| `string`

###### Set Signature

> **set** **slug**(`value`): `void`

Defined in: [packages/smrt/src/object.ts:179](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L179)

Sets the URL-friendly slug for this object

###### Throws

Error if the value is invalid

###### Parameters

###### value

The slug to set

`undefined` | `null` | `string`

###### Returns

`void`

##### tableName

###### Get Signature

> **get** **tableName**(): `string`

Defined in: [packages/smrt/src/object.ts:257](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L257)

Gets the database table name for this object

###### Returns

`string`

#### Methods

##### allDescriptors()

> **allDescriptors**(): `object` & `object`

Defined in: [packages/smrt/src/object.ts:248](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L248)

Gets all property descriptors from this object's prototype

###### Returns

`object` & `object`

Object containing all property descriptors

##### delete()

> **delete**(): `Promise`\<`void`\>

Defined in: [packages/smrt/src/object.ts:628](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L628)

Delete this object from the database

###### Returns

`Promise`\<`void`\>

Promise that resolves when deletion is complete

##### do()

> **do**(`instructions`, `options`): `Promise`\<`string`\>

Defined in: [packages/smrt/src/object.ts:588](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L588)

Performs actions on this object based on instructions using AI

###### Parameters

###### instructions

`string`

Instructions for the AI to follow

###### options

`any` = `{}`

AI message options

###### Returns

`Promise`\<`string`\>

Promise resolving to the AI response

##### extractConstraintField()

> `protected` **extractConstraintField**(`errorMessage`): `string`

Defined in: [packages/smrt/src/object.ts:485](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L485)

Extracts field name from database constraint error messages

###### Parameters

###### errorMessage

`string`

###### Returns

`string`

##### generateUpsertStatement()

> **generateUpsertStatement**(): `string`

Defined in: [packages/smrt/src/object.ts:288](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L288)

Generates an SQL UPSERT statement for saving this object to the database

###### Returns

`string`

SQL statement for inserting or updating this object

##### getFields()

> **getFields**(): `Record`\<`string`, `any`\>

Defined in: [packages/smrt/src/object.ts:269](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L269)

Gets field definitions and current values for this object

###### Returns

`Record`\<`string`, `any`\>

Object containing field definitions with current values

##### getFieldValue()

> `protected` **getFieldValue**(`fieldName`): `any`

Defined in: [packages/smrt/src/object.ts:478](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L478)

Gets the value of a field on this object

###### Parameters

###### fieldName

`string`

###### Returns

`any`

##### getId()

> **getId**(): `Promise`\<`string`\>

Defined in: [packages/smrt/src/object.ts:328](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L328)

Gets or generates a unique ID for this object

###### Returns

`Promise`\<`string`\>

Promise resolving to the object's ID

##### getSavedId()

> **getSavedId**(): `Promise`\<`any`\>

Defined in: [packages/smrt/src/object.ts:365](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L365)

Gets the ID of this object if it's already saved in the database

###### Returns

`Promise`\<`any`\>

Promise resolving to the saved ID or null if not saved

##### getSlug()

> **getSlug**(): `Promise`\<`undefined` \| `null` \| `string`\>

Defined in: [packages/smrt/src/object.ts:347](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L347)

Gets or generates a slug for this object based on its name

###### Returns

`Promise`\<`undefined` \| `null` \| `string`\>

Promise resolving to the object's slug

##### initialize()

> `protected` **initialize**(): `Promise`\<`void`\>

Defined in: [packages/smrt/src/object.ts:212](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L212)

Initializes this object, setting up database tables and loading data if identifiers are provided

###### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

###### Overrides

[`BaseClass`](#baseclass).[`initialize`](#initialize)

##### is()

> **is**(`criteria`, `options`): `Promise`\<`any`\>

Defined in: [packages/smrt/src/object.ts:565](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L565)

Evaluates whether this object meets given criteria using AI

###### Parameters

###### criteria

`string`

Criteria to evaluate against

###### options

`any` = `{}`

AI message options

###### Returns

`Promise`\<`any`\>

Promise resolving to true if criteria are met, false otherwise

###### Throws

Error if the AI response is invalid

##### isSaved()

> **isSaved**(): `Promise`\<`boolean`\>

Defined in: [packages/smrt/src/object.ts:377](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L377)

Checks if this object is already saved in the database

###### Returns

`Promise`\<`boolean`\>

Promise resolving to true if saved, false otherwise

##### loadDataFromDb()

> **loadDataFromDb**(`data`): `void`

Defined in: [packages/smrt/src/object.ts:234](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L234)

Loads data from a database row into this object's properties

###### Parameters

###### data

`any`

Database row data

###### Returns

`void`

##### loadFromId()

> **loadFromId**(): `Promise`\<`void`\>

Defined in: [packages/smrt/src/object.ts:508](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L508)

Loads this object's data from the database using its ID

###### Returns

`Promise`\<`void`\>

Promise that resolves when loading is complete

##### loadFromSlug()

> **loadFromSlug**(): `Promise`\<`void`\>

Defined in: [packages/smrt/src/object.ts:545](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L545)

Loads this object's data from the database using its slug and context

###### Returns

`Promise`\<`void`\>

Promise that resolves when loading is complete

##### runHook()

> `protected` **runHook**(`hookName`): `Promise`\<`void`\>

Defined in: [packages/smrt/src/object.ts:600](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L600)

Runs a lifecycle hook if it's defined in the object's configuration

###### Parameters

###### hookName

`string`

Name of the hook to run (e.g., 'beforeDelete', 'afterDelete')

###### Returns

`Promise`\<`void`\>

Promise that resolves when the hook completes

##### save()

> **save**(): `Promise`\<[`BaseObject`](#baseobject)\<`T`\>\>

Defined in: [packages/smrt/src/object.ts:387](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L387)

Saves this object to the database

###### Returns

`Promise`\<[`BaseObject`](#baseobject)\<`T`\>\>

Promise resolving to this object

##### validateBeforeSave()

> `protected` **validateBeforeSave**(): `Promise`\<`void`\>

Defined in: [packages/smrt/src/object.ts:461](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L461)

Validates object state before saving
Override in subclasses to add custom validation logic

###### Returns

`Promise`\<`void`\>

***

### CLIGenerator

Defined in: [packages/smrt/src/generators/cli.ts:53](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L53)

Generate CLI commands for smrt objects

#### Constructors

##### Constructor

> **new CLIGenerator**(`config`, `context`): [`CLIGenerator`](#cligenerator)

Defined in: [packages/smrt/src/generators/cli.ts:58](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L58)

###### Parameters

###### config

[`CLIConfig`](#cliconfig) = `{}`

###### context

[`CLIContext`](#clicontext) = `{}`

###### Returns

[`CLIGenerator`](#cligenerator)

#### Methods

##### executeCommand()

> **executeCommand**(`parsed`, `commands`): `Promise`\<`void`\>

Defined in: [packages/smrt/src/generators/cli.ts:285](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L285)

Execute a parsed command

###### Parameters

###### parsed

[`ParsedArgs`](#parsedargs)

###### commands

[`CLICommand`](#clicommand)[]

###### Returns

`Promise`\<`void`\>

##### generateHandler()

> **generateHandler**(): (`argv`) => `Promise`\<`void`\>

Defined in: [packages/smrt/src/generators/cli.ts:73](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L73)

Generate CLI handler function

###### Returns

> (`argv`): `Promise`\<`void`\>

###### Parameters

###### argv

`string`[]

###### Returns

`Promise`\<`void`\>

##### generateUtilityCommands()

> **generateUtilityCommands**(): [`CLICommand`](#clicommand)[]

Defined in: [packages/smrt/src/generators/cli.ts:318](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L318)

Generate utility commands

###### Returns

[`CLICommand`](#clicommand)[]

##### parseArguments()

> **parseArguments**(`argv`, `commands`): [`ParsedArgs`](#parsedargs)

Defined in: [packages/smrt/src/generators/cli.ts:232](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L232)

Parse command line arguments

###### Parameters

###### argv

`string`[]

###### commands

[`CLICommand`](#clicommand)[]

###### Returns

[`ParsedArgs`](#parsedargs)

##### showHelp()

> **showHelp**(`commands`): `void`

Defined in: [packages/smrt/src/generators/cli.ts:374](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L374)

Show help information

###### Parameters

###### commands

[`CLICommand`](#clicommand)[]

###### Returns

`void`

***

### ConfigurationError

Defined in: packages/smrt/src/errors.ts:261

Configuration and setup errors

#### Extends

- [`SmrtError`](#smrterror)

#### Constructors

##### Constructor

> **new ConfigurationError**(`message`, `code`, `details?`, `cause?`): [`ConfigurationError`](#configurationerror)

Defined in: packages/smrt/src/errors.ts:262

###### Parameters

###### message

`string`

###### code

`string`

###### details?

`Record`\<`string`, `any`\>

###### cause?

`Error`

###### Returns

[`ConfigurationError`](#configurationerror)

###### Overrides

[`SmrtError`](#smrterror).[`constructor`](#constructor-18)

#### Properties

##### category

> `readonly` **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

Defined in: packages/smrt/src/errors.ts:13

###### Inherited from

[`SmrtError`](#smrterror).[`category`](#category-6)

##### cause?

> `readonly` `optional` **cause**: `Error`

Defined in: packages/smrt/src/errors.ts:15

The cause of the error.

###### Inherited from

[`SmrtError`](#smrterror).[`cause`](#cause-6)

##### code

> `readonly` **code**: `string`

Defined in: packages/smrt/src/errors.ts:12

###### Inherited from

[`SmrtError`](#smrterror).[`code`](#code-6)

##### details?

> `readonly` `optional` **details**: `Record`\<`string`, `any`\>

Defined in: packages/smrt/src/errors.ts:14

###### Inherited from

[`SmrtError`](#smrterror).[`details`](#details-6)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`SmrtError`](#smrterror).[`message`](#message-6)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`SmrtError`](#smrterror).[`name`](#name-8)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`SmrtError`](#smrterror).[`stack`](#stack-6)

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

[`SmrtError`](#smrterror).[`prepareStackTrace`](#preparestacktrace-6)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`SmrtError`](#smrterror).[`stackTraceLimit`](#stacktracelimit-6)

#### Methods

##### toJSON()

> **toJSON**(): `object`

Defined in: packages/smrt/src/errors.ts:40

Converts error to a serializable object for logging/debugging

###### Returns

`object`

###### category

> **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

###### cause

> **cause**: `undefined` \| \{ `message`: `string`; `name`: `string`; `stack`: `undefined` \| `string`; \}

###### code

> **code**: `string`

###### details

> **details**: `undefined` \| `Record`\<`string`, `any`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### Inherited from

[`SmrtError`](#smrterror).[`toJSON`](#tojson-12)

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

[`SmrtError`](#smrterror).[`captureStackTrace`](#capturestacktrace-18)

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

[`SmrtError`](#smrterror).[`captureStackTrace`](#capturestacktrace-18)

##### initializationFailed()

> `static` **initializationFailed**(`component`, `cause?`): [`ConfigurationError`](#configurationerror)

Defined in: packages/smrt/src/errors.ts:282

###### Parameters

###### component

`string`

###### cause?

`Error`

###### Returns

[`ConfigurationError`](#configurationerror)

##### invalidConfiguration()

> `static` **invalidConfiguration**(`configKey`, `value`, `expected`): [`ConfigurationError`](#configurationerror)

Defined in: packages/smrt/src/errors.ts:274

###### Parameters

###### configKey

`string`

###### value

`any`

###### expected

`string`

###### Returns

[`ConfigurationError`](#configurationerror)

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

[`SmrtError`](#smrterror).[`isError`](#iserror-12)

##### missingConfiguration()

> `static` **missingConfiguration**(`configKey`, `context?`): [`ConfigurationError`](#configurationerror)

Defined in: packages/smrt/src/errors.ts:266

###### Parameters

###### configKey

`string`

###### context?

`string`

###### Returns

[`ConfigurationError`](#configurationerror)

***

### DatabaseError

Defined in: packages/smrt/src/errors.ts:60

Database-related errors

#### Extends

- [`SmrtError`](#smrterror)

#### Constructors

##### Constructor

> **new DatabaseError**(`message`, `code`, `details?`, `cause?`): [`DatabaseError`](#databaseerror)

Defined in: packages/smrt/src/errors.ts:61

###### Parameters

###### message

`string`

###### code

`string`

###### details?

`Record`\<`string`, `any`\>

###### cause?

`Error`

###### Returns

[`DatabaseError`](#databaseerror)

###### Overrides

[`SmrtError`](#smrterror).[`constructor`](#constructor-18)

#### Properties

##### category

> `readonly` **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

Defined in: packages/smrt/src/errors.ts:13

###### Inherited from

[`SmrtError`](#smrterror).[`category`](#category-6)

##### cause?

> `readonly` `optional` **cause**: `Error`

Defined in: packages/smrt/src/errors.ts:15

The cause of the error.

###### Inherited from

[`SmrtError`](#smrterror).[`cause`](#cause-6)

##### code

> `readonly` **code**: `string`

Defined in: packages/smrt/src/errors.ts:12

###### Inherited from

[`SmrtError`](#smrterror).[`code`](#code-6)

##### details?

> `readonly` `optional` **details**: `Record`\<`string`, `any`\>

Defined in: packages/smrt/src/errors.ts:14

###### Inherited from

[`SmrtError`](#smrterror).[`details`](#details-6)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`SmrtError`](#smrterror).[`message`](#message-6)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`SmrtError`](#smrterror).[`name`](#name-8)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`SmrtError`](#smrterror).[`stack`](#stack-6)

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

[`SmrtError`](#smrterror).[`prepareStackTrace`](#preparestacktrace-6)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`SmrtError`](#smrterror).[`stackTraceLimit`](#stacktracelimit-6)

#### Methods

##### toJSON()

> **toJSON**(): `object`

Defined in: packages/smrt/src/errors.ts:40

Converts error to a serializable object for logging/debugging

###### Returns

`object`

###### category

> **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

###### cause

> **cause**: `undefined` \| \{ `message`: `string`; `name`: `string`; `stack`: `undefined` \| `string`; \}

###### code

> **code**: `string`

###### details

> **details**: `undefined` \| `Record`\<`string`, `any`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### Inherited from

[`SmrtError`](#smrterror).[`toJSON`](#tojson-12)

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

[`SmrtError`](#smrterror).[`captureStackTrace`](#capturestacktrace-18)

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

[`SmrtError`](#smrterror).[`captureStackTrace`](#capturestacktrace-18)

##### connectionFailed()

> `static` **connectionFailed**(`dbUrl`, `cause?`): [`DatabaseError`](#databaseerror)

Defined in: packages/smrt/src/errors.ts:65

###### Parameters

###### dbUrl

`string`

###### cause?

`Error`

###### Returns

[`DatabaseError`](#databaseerror)

##### constraintViolation()

> `static` **constraintViolation**(`constraint`, `value`, `cause?`): [`DatabaseError`](#databaseerror)

Defined in: packages/smrt/src/errors.ts:92

###### Parameters

###### constraint

`string`

###### value

`any`

###### cause?

`Error`

###### Returns

[`DatabaseError`](#databaseerror)

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

[`SmrtError`](#smrterror).[`isError`](#iserror-12)

##### queryFailed()

> `static` **queryFailed**(`query`, `cause?`): [`DatabaseError`](#databaseerror)

Defined in: packages/smrt/src/errors.ts:74

###### Parameters

###### query

`string`

###### cause?

`Error`

###### Returns

[`DatabaseError`](#databaseerror)

##### schemaError()

> `static` **schemaError**(`tableName`, `operation`, `cause?`): [`DatabaseError`](#databaseerror)

Defined in: packages/smrt/src/errors.ts:83

###### Parameters

###### tableName

`string`

###### operation

`string`

###### cause?

`Error`

###### Returns

[`DatabaseError`](#databaseerror)

***

### ErrorUtils

Defined in: packages/smrt/src/errors.ts:329

Utility functions for error handling

#### Constructors

##### Constructor

> **new ErrorUtils**(): [`ErrorUtils`](#errorutils)

###### Returns

[`ErrorUtils`](#errorutils)

#### Methods

##### isRetryable()

> `static` **isRetryable**(`error`): `boolean`

Defined in: packages/smrt/src/errors.ts:367

Checks if an error is retryable

###### Parameters

###### error

`Error`

###### Returns

`boolean`

##### sanitizeError()

> `static` **sanitizeError**(`error`): `Record`\<`string`, `any`\>

Defined in: packages/smrt/src/errors.ts:390

Sanitizes an error for safe logging (removes sensitive information)

###### Parameters

###### error

`Error`

###### Returns

`Record`\<`string`, `any`\>

##### withRetry()

> `static` **withRetry**\<`T`\>(`operation`, `maxRetries`, `delay`, `backoffMultiplier`): `Promise`\<`T`\>

Defined in: packages/smrt/src/errors.ts:333

Wraps a function with error handling and automatic retry logic

###### Type Parameters

###### T

`T`

###### Parameters

###### operation

() => `Promise`\<`T`\>

###### maxRetries

`number` = `3`

###### delay

`number` = `1000`

###### backoffMultiplier

`number` = `2`

###### Returns

`Promise`\<`T`\>

***

### Field

Defined in: [packages/smrt/src/fields/index.ts:47](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L47)

Base field class that all field types extend

#### Constructors

##### Constructor

> **new Field**(`type`, `options`): [`Field`](#field)

Defined in: [packages/smrt/src/fields/index.ts:52](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L52)

###### Parameters

###### type

`string`

###### options

[`FieldOptions`](#fieldoptions-1) = `{}`

###### Returns

[`Field`](#field)

#### Properties

##### options

> `readonly` **options**: [`FieldOptions`](#fieldoptions-1)

Defined in: [packages/smrt/src/fields/index.ts:49](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L49)

##### type

> `readonly` **type**: `string`

Defined in: [packages/smrt/src/fields/index.ts:48](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L48)

##### value

> **value**: `any`

Defined in: [packages/smrt/src/fields/index.ts:50](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L50)

#### Methods

##### getSqlConstraints()

> **getSqlConstraints**(): `string`[]

Defined in: [packages/smrt/src/fields/index.ts:77](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L77)

Get field constraints for SQL

###### Returns

`string`[]

##### getSqlType()

> **getSqlType**(): `string`

Defined in: [packages/smrt/src/fields/index.ts:61](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L61)

Get the SQL type for this field

###### Returns

`string`

***

### FilesystemError

Defined in: packages/smrt/src/errors.ts:147

Filesystem operation errors

#### Extends

- [`SmrtError`](#smrterror)

#### Constructors

##### Constructor

> **new FilesystemError**(`message`, `code`, `details?`, `cause?`): [`FilesystemError`](#filesystemerror)

Defined in: packages/smrt/src/errors.ts:148

###### Parameters

###### message

`string`

###### code

`string`

###### details?

`Record`\<`string`, `any`\>

###### cause?

`Error`

###### Returns

[`FilesystemError`](#filesystemerror)

###### Overrides

[`SmrtError`](#smrterror).[`constructor`](#constructor-18)

#### Properties

##### category

> `readonly` **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

Defined in: packages/smrt/src/errors.ts:13

###### Inherited from

[`SmrtError`](#smrterror).[`category`](#category-6)

##### cause?

> `readonly` `optional` **cause**: `Error`

Defined in: packages/smrt/src/errors.ts:15

The cause of the error.

###### Inherited from

[`SmrtError`](#smrterror).[`cause`](#cause-6)

##### code

> `readonly` **code**: `string`

Defined in: packages/smrt/src/errors.ts:12

###### Inherited from

[`SmrtError`](#smrterror).[`code`](#code-6)

##### details?

> `readonly` `optional` **details**: `Record`\<`string`, `any`\>

Defined in: packages/smrt/src/errors.ts:14

###### Inherited from

[`SmrtError`](#smrterror).[`details`](#details-6)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`SmrtError`](#smrterror).[`message`](#message-6)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`SmrtError`](#smrterror).[`name`](#name-8)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`SmrtError`](#smrterror).[`stack`](#stack-6)

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

[`SmrtError`](#smrterror).[`prepareStackTrace`](#preparestacktrace-6)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`SmrtError`](#smrterror).[`stackTraceLimit`](#stacktracelimit-6)

#### Methods

##### toJSON()

> **toJSON**(): `object`

Defined in: packages/smrt/src/errors.ts:40

Converts error to a serializable object for logging/debugging

###### Returns

`object`

###### category

> **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

###### cause

> **cause**: `undefined` \| \{ `message`: `string`; `name`: `string`; `stack`: `undefined` \| `string`; \}

###### code

> **code**: `string`

###### details

> **details**: `undefined` \| `Record`\<`string`, `any`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### Inherited from

[`SmrtError`](#smrterror).[`toJSON`](#tojson-12)

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

[`SmrtError`](#smrterror).[`captureStackTrace`](#capturestacktrace-18)

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

[`SmrtError`](#smrterror).[`captureStackTrace`](#capturestacktrace-18)

##### diskSpaceExceeded()

> `static` **diskSpaceExceeded**(`path`, `requiredBytes`): [`FilesystemError`](#filesystemerror)

Defined in: packages/smrt/src/errors.ts:168

###### Parameters

###### path

`string`

###### requiredBytes

`number`

###### Returns

[`FilesystemError`](#filesystemerror)

##### fileNotFound()

> `static` **fileNotFound**(`path`): [`FilesystemError`](#filesystemerror)

Defined in: packages/smrt/src/errors.ts:152

###### Parameters

###### path

`string`

###### Returns

[`FilesystemError`](#filesystemerror)

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

[`SmrtError`](#smrterror).[`isError`](#iserror-12)

##### permissionDenied()

> `static` **permissionDenied**(`path`, `operation`): [`FilesystemError`](#filesystemerror)

Defined in: packages/smrt/src/errors.ts:160

###### Parameters

###### path

`string`

###### operation

`string`

###### Returns

[`FilesystemError`](#filesystemerror)

***

### ManifestGenerator

Defined in: [packages/smrt/src/scanner/manifest-generator.ts:11](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/manifest-generator.ts#L11)

#### Constructors

##### Constructor

> **new ManifestGenerator**(): [`ManifestGenerator`](#manifestgenerator)

###### Returns

[`ManifestGenerator`](#manifestgenerator)

#### Methods

##### generateManifest()

> **generateManifest**(`scanResults`): [`SmartObjectManifest`](#smartobjectmanifest)

Defined in: [packages/smrt/src/scanner/manifest-generator.ts:15](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/manifest-generator.ts#L15)

Generate manifest from scan results

###### Parameters

###### scanResults

[`ScanResult`](#scanresult)[]

###### Returns

[`SmartObjectManifest`](#smartobjectmanifest)

##### generateMCPTools()

> **generateMCPTools**(`manifest`): `string`

Defined in: [packages/smrt/src/scanner/manifest-generator.ts:165](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/manifest-generator.ts#L165)

Generate MCP tool definitions

###### Parameters

###### manifest

[`SmartObjectManifest`](#smartobjectmanifest)

###### Returns

`string`

##### generateRestEndpoints()

> **generateRestEndpoints**(`manifest`): `string`

Defined in: [packages/smrt/src/scanner/manifest-generator.ts:78](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/manifest-generator.ts#L78)

Generate REST endpoint definitions

###### Parameters

###### manifest

[`SmartObjectManifest`](#smartobjectmanifest)

###### Returns

`string`

##### generateTypeDefinitions()

> **generateTypeDefinitions**(`manifest`): `string`

Defined in: [packages/smrt/src/scanner/manifest-generator.ts:34](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/manifest-generator.ts#L34)

Generate TypeScript interfaces from manifest

###### Parameters

###### manifest

[`SmartObjectManifest`](#smartobjectmanifest)

###### Returns

`string`

##### loadManifest()

> **loadManifest**(`filePath`): [`SmartObjectManifest`](#smartobjectmanifest)

Defined in: [packages/smrt/src/scanner/manifest-generator.ts:291](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/manifest-generator.ts#L291)

Load manifest from file

###### Parameters

###### filePath

`string`

###### Returns

[`SmartObjectManifest`](#smartobjectmanifest)

##### saveManifest()

> **saveManifest**(`manifest`, `filePath`): `void`

Defined in: [packages/smrt/src/scanner/manifest-generator.ts:283](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/manifest-generator.ts#L283)

Save manifest to file

###### Parameters

###### manifest

[`SmartObjectManifest`](#smartobjectmanifest)

###### filePath

`string`

###### Returns

`void`

***

### MCPGenerator

Defined in: [packages/smrt/src/generators/mcp.ts:58](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L58)

Generate MCP server from smrt objects

#### Constructors

##### Constructor

> **new MCPGenerator**(`config`, `context`): [`MCPGenerator`](#mcpgenerator)

Defined in: [packages/smrt/src/generators/mcp.ts:63](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L63)

###### Parameters

###### config

[`MCPConfig`](#mcpconfig) = `{}`

###### context

[`MCPContext`](#mcpcontext) = `{}`

###### Returns

[`MCPGenerator`](#mcpgenerator)

#### Methods

##### generateTools()

> **generateTools**(): [`MCPTool`](#mcptool)[]

Defined in: [packages/smrt/src/generators/mcp.ts:80](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L80)

Generate all available tools from registered objects

###### Returns

[`MCPTool`](#mcptool)[]

##### getServerInfo()

> **getServerInfo**(): `object`

Defined in: [packages/smrt/src/generators/mcp.ts:459](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L459)

Generate MCP server info

###### Returns

`object`

###### description

> **description**: `undefined` \| `string`

###### name

> **name**: `string`

###### version

> **version**: `string`

##### handleToolCall()

> **handleToolCall**(`request`): `Promise`\<[`MCPResponse`](#mcpresponse)\>

Defined in: [packages/smrt/src/generators/mcp.ts:290](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L290)

Handle MCP tool calls

###### Parameters

###### request

[`MCPRequest`](#mcprequest)

###### Returns

`Promise`\<[`MCPResponse`](#mcpresponse)\>

***

### NetworkError

Defined in: packages/smrt/src/errors.ts:227

Network and external service errors

#### Extends

- [`SmrtError`](#smrterror)

#### Constructors

##### Constructor

> **new NetworkError**(`message`, `code`, `details?`, `cause?`): [`NetworkError`](#networkerror)

Defined in: packages/smrt/src/errors.ts:228

###### Parameters

###### message

`string`

###### code

`string`

###### details?

`Record`\<`string`, `any`\>

###### cause?

`Error`

###### Returns

[`NetworkError`](#networkerror)

###### Overrides

[`SmrtError`](#smrterror).[`constructor`](#constructor-18)

#### Properties

##### category

> `readonly` **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

Defined in: packages/smrt/src/errors.ts:13

###### Inherited from

[`SmrtError`](#smrterror).[`category`](#category-6)

##### cause?

> `readonly` `optional` **cause**: `Error`

Defined in: packages/smrt/src/errors.ts:15

The cause of the error.

###### Inherited from

[`SmrtError`](#smrterror).[`cause`](#cause-6)

##### code

> `readonly` **code**: `string`

Defined in: packages/smrt/src/errors.ts:12

###### Inherited from

[`SmrtError`](#smrterror).[`code`](#code-6)

##### details?

> `readonly` `optional` **details**: `Record`\<`string`, `any`\>

Defined in: packages/smrt/src/errors.ts:14

###### Inherited from

[`SmrtError`](#smrterror).[`details`](#details-6)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`SmrtError`](#smrterror).[`message`](#message-6)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`SmrtError`](#smrterror).[`name`](#name-8)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`SmrtError`](#smrterror).[`stack`](#stack-6)

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

[`SmrtError`](#smrterror).[`prepareStackTrace`](#preparestacktrace-6)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`SmrtError`](#smrterror).[`stackTraceLimit`](#stacktracelimit-6)

#### Methods

##### toJSON()

> **toJSON**(): `object`

Defined in: packages/smrt/src/errors.ts:40

Converts error to a serializable object for logging/debugging

###### Returns

`object`

###### category

> **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

###### cause

> **cause**: `undefined` \| \{ `message`: `string`; `name`: `string`; `stack`: `undefined` \| `string`; \}

###### code

> **code**: `string`

###### details

> **details**: `undefined` \| `Record`\<`string`, `any`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### Inherited from

[`SmrtError`](#smrterror).[`toJSON`](#tojson-12)

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

[`SmrtError`](#smrterror).[`captureStackTrace`](#capturestacktrace-18)

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

[`SmrtError`](#smrterror).[`captureStackTrace`](#capturestacktrace-18)

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

[`SmrtError`](#smrterror).[`isError`](#iserror-12)

##### requestFailed()

> `static` **requestFailed**(`url`, `status?`, `cause?`): [`NetworkError`](#networkerror)

Defined in: packages/smrt/src/errors.ts:232

###### Parameters

###### url

`string`

###### status?

`number`

###### cause?

`Error`

###### Returns

[`NetworkError`](#networkerror)

##### serviceUnavailable()

> `static` **serviceUnavailable**(`service`): [`NetworkError`](#networkerror)

Defined in: packages/smrt/src/errors.ts:249

###### Parameters

###### service

`string`

###### Returns

[`NetworkError`](#networkerror)

##### timeout()

> `static` **timeout**(`url`, `timeoutMs`): [`NetworkError`](#networkerror)

Defined in: packages/smrt/src/errors.ts:241

###### Parameters

###### url

`string`

###### timeoutMs

`number`

###### Returns

[`NetworkError`](#networkerror)

***

### ObjectRegistry

Defined in: [packages/smrt/src/registry.ts:104](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L104)

Central registry for all SMRT objects

#### Constructors

##### Constructor

> **new ObjectRegistry**(): [`ObjectRegistry`](#objectregistry)

###### Returns

[`ObjectRegistry`](#objectregistry)

#### Methods

##### clear()

> `static` **clear**(): `void`

Defined in: [packages/smrt/src/registry.ts:176](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L176)

Clear all registered classes (mainly for testing)

###### Returns

`void`

##### getAllClasses()

> `static` **getAllClasses**(): `Map`\<`string`, `RegisteredClass`\>

Defined in: [packages/smrt/src/registry.ts:155](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L155)

Get all registered classes

###### Returns

`Map`\<`string`, `RegisteredClass`\>

##### getClass()

> `static` **getClass**(`name`): `undefined` \| `RegisteredClass`

Defined in: [packages/smrt/src/registry.ts:148](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L148)

Get a registered class by name

###### Parameters

###### name

`string`

###### Returns

`undefined` \| `RegisteredClass`

##### getClassNames()

> `static` **getClassNames**(): `string`[]

Defined in: [packages/smrt/src/registry.ts:162](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L162)

Get class names

###### Returns

`string`[]

##### getConfig()

> `static` **getConfig**(`name`): [`SmartObjectConfig`](#smartobjectconfig)

Defined in: [packages/smrt/src/registry.ts:235](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L235)

Get configuration for a registered class

###### Parameters

###### name

`string`

###### Returns

[`SmartObjectConfig`](#smartobjectconfig)

##### getFields()

> `static` **getFields**(`name`): `Map`\<`string`, `any`\>

Defined in: [packages/smrt/src/registry.ts:227](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L227)

Get field definitions for a registered class

###### Parameters

###### name

`string`

###### Returns

`Map`\<`string`, `any`\>

##### hasClass()

> `static` **hasClass**(`name`): `boolean`

Defined in: [packages/smrt/src/registry.ts:169](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L169)

Check if a class is registered

###### Parameters

###### name

`string`

###### Returns

`boolean`

##### register()

> `static` **register**(`constructor`, `config`): `void`

Defined in: [packages/smrt/src/registry.ts:111](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L111)

Register a new smrt object class

###### Parameters

###### constructor

*typeof* [`BaseObject`](#baseobject)

###### config

[`SmartObjectConfig`](#smartobjectconfig) = `{}`

###### Returns

`void`

##### registerCollection()

> `static` **registerCollection**(`objectName`, `collectionConstructor`): `void`

Defined in: [packages/smrt/src/registry.ts:133](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L133)

Register a collection class for an object

###### Parameters

###### objectName

`string`

###### collectionConstructor

*typeof* [`BaseCollection`](#basecollection)

###### Returns

`void`

***

### Pleb\<T\>

Defined in: [packages/smrt/src/pleb.ts:6](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/pleb.ts#L6)

Base persistent object with unique identifiers and database storage

BaseObject provides functionality for creating, loading, and saving objects
to a database. It supports identification via unique IDs and URL-friendly
slugs, with optional context scoping.

#### Extends

- [`BaseObject`](#baseobject)\<`T`\>

#### Type Parameters

##### T

`T` *extends* [`PlebOptions`](#pleboptions-1) = [`PlebOptions`](#pleboptions-1)

#### Constructors

##### Constructor

> **new Pleb**\<`T`\>(`options`): [`Pleb`](#pleb)\<`T`\>

Defined in: [packages/smrt/src/pleb.ts:7](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/pleb.ts#L7)

###### Parameters

###### options

`T`

###### Returns

[`Pleb`](#pleb)\<`T`\>

###### Overrides

[`BaseObject`](#baseobject).[`constructor`](#constructor-5)

#### Properties

##### \_ai

> `protected` **\_ai**: `AIClient`

Defined in: [packages/smrt/src/class.ts:49](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L49)

AI client instance for interacting with AI models

###### Inherited from

[`BaseObject`](#baseobject).[`_ai`](#_ai-2)

##### \_className

> `protected` **\_className**: `string`

Defined in: [packages/smrt/src/class.ts:64](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L64)

Class name used for identification

###### Inherited from

[`BaseObject`](#baseobject).[`_className`](#_classname-2)

##### \_context

> `protected` **\_context**: `undefined` \| `null` \| `string`

Defined in: [packages/smrt/src/object.ts:84](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L84)

Optional context to scope the slug

###### Inherited from

[`BaseObject`](#baseobject).[`_context`](#_context)

##### \_db

> `protected` **\_db**: `DatabaseInterface`

Defined in: [packages/smrt/src/class.ts:59](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L59)

Database interface for data persistence

###### Inherited from

[`BaseObject`](#baseobject).[`_db`](#_db-2)

##### \_fs

> `protected` **\_fs**: `FilesystemAdapter`

Defined in: [packages/smrt/src/class.ts:54](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L54)

Filesystem adapter for file operations

###### Inherited from

[`BaseObject`](#baseobject).[`_fs`](#_fs-2)

##### \_id

> `protected` **\_id**: `undefined` \| `null` \| `string`

Defined in: [packages/smrt/src/object.ts:74](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L74)

Unique identifier for the object

###### Inherited from

[`BaseObject`](#baseobject).[`_id`](#_id)

##### \_slug

> `protected` **\_slug**: `undefined` \| `null` \| `string`

Defined in: [packages/smrt/src/object.ts:79](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L79)

URL-friendly identifier

###### Inherited from

[`BaseObject`](#baseobject).[`_slug`](#_slug)

##### \_tableName

> **\_tableName**: `string`

Defined in: [packages/smrt/src/object.ts:69](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L69)

Database table name for this object

###### Inherited from

[`BaseObject`](#baseobject).[`_tableName`](#_tablename-1)

##### created\_at

> **created\_at**: `undefined` \| `null` \| `Date`

Defined in: [packages/smrt/src/object.ts:94](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L94)

Creation timestamp

###### Inherited from

[`BaseObject`](#baseobject).[`created_at`](#created_at)

##### name

> **name**: `undefined` \| `null` \| `string`

Defined in: [packages/smrt/src/object.ts:89](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L89)

Human-readable name, primarily for display purposes

###### Inherited from

[`BaseObject`](#baseobject).[`name`](#name-1)

##### options

> `protected` **options**: `T`

Defined in: [packages/smrt/src/class.ts:69](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L69)

Configuration options provided to the class

###### Inherited from

[`BaseObject`](#baseobject).[`options`](#options-2)

##### updated\_at

> **updated\_at**: `undefined` \| `null` \| `Date`

Defined in: [packages/smrt/src/object.ts:99](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L99)

Last update timestamp

###### Inherited from

[`BaseObject`](#baseobject).[`updated_at`](#updated_at)

#### Accessors

##### ai

###### Get Signature

> **get** **ai**(): `AIClient`

Defined in: [packages/smrt/src/class.ts:118](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L118)

Gets the AI client instance

###### Returns

`AIClient`

###### Inherited from

[`BaseObject`](#baseobject).[`ai`](#ai-2)

##### context

###### Get Signature

> **get** **context**(): `string`

Defined in: [packages/smrt/src/object.ts:190](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L190)

Gets the context that scopes this object's slug

###### Returns

`string`

###### Set Signature

> **set** **context**(`value`): `void`

Defined in: [packages/smrt/src/object.ts:200](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L200)

Sets the context that scopes this object's slug

###### Throws

Error if the value is invalid

###### Parameters

###### value

The context to set

`undefined` | `null` | `string`

###### Returns

`void`

###### Inherited from

[`BaseObject`](#baseobject).[`context`](#context)

##### db

###### Get Signature

> **get** **db**(): `DatabaseInterface`

Defined in: [packages/smrt/src/class.ts:111](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L111)

Gets the database interface instance

###### Returns

`DatabaseInterface`

###### Inherited from

[`BaseObject`](#baseobject).[`db`](#db-2)

##### fs

###### Get Signature

> **get** **fs**(): `FilesystemAdapter`

Defined in: [packages/smrt/src/class.ts:104](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L104)

Gets the filesystem adapter instance

###### Returns

`FilesystemAdapter`

###### Inherited from

[`BaseObject`](#baseobject).[`fs`](#fs-2)

##### id

###### Get Signature

> **get** **id**(): `undefined` \| `null` \| `string`

Defined in: [packages/smrt/src/object.ts:149](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L149)

Gets the unique identifier for this object

###### Returns

`undefined` \| `null` \| `string`

###### Set Signature

> **set** **id**(`value`): `void`

Defined in: [packages/smrt/src/object.ts:159](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L159)

Sets the unique identifier for this object

###### Throws

Error if the value is invalid

###### Parameters

###### value

The ID to set

`undefined` | `null` | `string`

###### Returns

`void`

###### Inherited from

[`BaseObject`](#baseobject).[`id`](#id)

##### slug

###### Get Signature

> **get** **slug**(): `undefined` \| `null` \| `string`

Defined in: [packages/smrt/src/object.ts:169](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L169)

Gets the URL-friendly slug for this object

###### Returns

`undefined` \| `null` \| `string`

###### Set Signature

> **set** **slug**(`value`): `void`

Defined in: [packages/smrt/src/object.ts:179](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L179)

Sets the URL-friendly slug for this object

###### Throws

Error if the value is invalid

###### Parameters

###### value

The slug to set

`undefined` | `null` | `string`

###### Returns

`void`

###### Inherited from

[`BaseObject`](#baseobject).[`slug`](#slug)

##### tableName

###### Get Signature

> **get** **tableName**(): `string`

Defined in: [packages/smrt/src/object.ts:257](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L257)

Gets the database table name for this object

###### Returns

`string`

###### Inherited from

[`BaseObject`](#baseobject).[`tableName`](#tablename-1)

#### Methods

##### allDescriptors()

> **allDescriptors**(): `object` & `object`

Defined in: [packages/smrt/src/object.ts:248](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L248)

Gets all property descriptors from this object's prototype

###### Returns

`object` & `object`

Object containing all property descriptors

###### Inherited from

[`BaseObject`](#baseobject).[`allDescriptors`](#alldescriptors)

##### delete()

> **delete**(): `Promise`\<`void`\>

Defined in: [packages/smrt/src/object.ts:628](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L628)

Delete this object from the database

###### Returns

`Promise`\<`void`\>

Promise that resolves when deletion is complete

###### Inherited from

[`BaseObject`](#baseobject).[`delete`](#delete)

##### do()

> **do**(`instructions`, `options`): `Promise`\<`string`\>

Defined in: [packages/smrt/src/object.ts:588](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L588)

Performs actions on this object based on instructions using AI

###### Parameters

###### instructions

`string`

Instructions for the AI to follow

###### options

`any` = `{}`

AI message options

###### Returns

`Promise`\<`string`\>

Promise resolving to the AI response

###### Inherited from

[`BaseObject`](#baseobject).[`do`](#do)

##### extractConstraintField()

> `protected` **extractConstraintField**(`errorMessage`): `string`

Defined in: [packages/smrt/src/object.ts:485](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L485)

Extracts field name from database constraint error messages

###### Parameters

###### errorMessage

`string`

###### Returns

`string`

###### Inherited from

[`BaseObject`](#baseobject).[`extractConstraintField`](#extractconstraintfield)

##### generateUpsertStatement()

> **generateUpsertStatement**(): `string`

Defined in: [packages/smrt/src/object.ts:288](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L288)

Generates an SQL UPSERT statement for saving this object to the database

###### Returns

`string`

SQL statement for inserting or updating this object

###### Inherited from

[`BaseObject`](#baseobject).[`generateUpsertStatement`](#generateupsertstatement)

##### getFields()

> **getFields**(): `Record`\<`string`, `any`\>

Defined in: [packages/smrt/src/object.ts:269](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L269)

Gets field definitions and current values for this object

###### Returns

`Record`\<`string`, `any`\>

Object containing field definitions with current values

###### Inherited from

[`BaseObject`](#baseobject).[`getFields`](#getfields-2)

##### getFieldValue()

> `protected` **getFieldValue**(`fieldName`): `any`

Defined in: [packages/smrt/src/object.ts:478](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L478)

Gets the value of a field on this object

###### Parameters

###### fieldName

`string`

###### Returns

`any`

###### Inherited from

[`BaseObject`](#baseobject).[`getFieldValue`](#getfieldvalue)

##### getId()

> **getId**(): `Promise`\<`string`\>

Defined in: [packages/smrt/src/object.ts:328](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L328)

Gets or generates a unique ID for this object

###### Returns

`Promise`\<`string`\>

Promise resolving to the object's ID

###### Inherited from

[`BaseObject`](#baseobject).[`getId`](#getid)

##### getSavedId()

> **getSavedId**(): `Promise`\<`any`\>

Defined in: [packages/smrt/src/object.ts:365](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L365)

Gets the ID of this object if it's already saved in the database

###### Returns

`Promise`\<`any`\>

Promise resolving to the saved ID or null if not saved

###### Inherited from

[`BaseObject`](#baseobject).[`getSavedId`](#getsavedid)

##### getSlug()

> **getSlug**(): `Promise`\<`undefined` \| `null` \| `string`\>

Defined in: [packages/smrt/src/object.ts:347](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L347)

Gets or generates a slug for this object based on its name

###### Returns

`Promise`\<`undefined` \| `null` \| `string`\>

Promise resolving to the object's slug

###### Inherited from

[`BaseObject`](#baseobject).[`getSlug`](#getslug)

##### initialize()

> `protected` **initialize**(): `Promise`\<`void`\>

Defined in: [packages/smrt/src/pleb.ts:18](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/pleb.ts#L18)

Initializes this object, setting up database tables and loading data if identifiers are provided

###### Returns

`Promise`\<`void`\>

Promise that resolves when initialization is complete

###### Overrides

[`BaseObject`](#baseobject).[`initialize`](#initialize-4)

##### is()

> **is**(`criteria`, `options`): `Promise`\<`any`\>

Defined in: [packages/smrt/src/object.ts:565](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L565)

Evaluates whether this object meets given criteria using AI

###### Parameters

###### criteria

`string`

Criteria to evaluate against

###### options

`any` = `{}`

AI message options

###### Returns

`Promise`\<`any`\>

Promise resolving to true if criteria are met, false otherwise

###### Throws

Error if the AI response is invalid

###### Inherited from

[`BaseObject`](#baseobject).[`is`](#is)

##### isSaved()

> **isSaved**(): `Promise`\<`boolean`\>

Defined in: [packages/smrt/src/object.ts:377](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L377)

Checks if this object is already saved in the database

###### Returns

`Promise`\<`boolean`\>

Promise resolving to true if saved, false otherwise

###### Inherited from

[`BaseObject`](#baseobject).[`isSaved`](#issaved)

##### loadDataFromDb()

> **loadDataFromDb**(`data`): `void`

Defined in: [packages/smrt/src/object.ts:234](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L234)

Loads data from a database row into this object's properties

###### Parameters

###### data

`any`

Database row data

###### Returns

`void`

###### Inherited from

[`BaseObject`](#baseobject).[`loadDataFromDb`](#loaddatafromdb)

##### loadFromId()

> **loadFromId**(): `Promise`\<`void`\>

Defined in: [packages/smrt/src/object.ts:508](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L508)

Loads this object's data from the database using its ID

###### Returns

`Promise`\<`void`\>

Promise that resolves when loading is complete

###### Inherited from

[`BaseObject`](#baseobject).[`loadFromId`](#loadfromid)

##### loadFromSlug()

> **loadFromSlug**(): `Promise`\<`void`\>

Defined in: [packages/smrt/src/object.ts:545](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L545)

Loads this object's data from the database using its slug and context

###### Returns

`Promise`\<`void`\>

Promise that resolves when loading is complete

###### Inherited from

[`BaseObject`](#baseobject).[`loadFromSlug`](#loadfromslug)

##### runHook()

> `protected` **runHook**(`hookName`): `Promise`\<`void`\>

Defined in: [packages/smrt/src/object.ts:600](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L600)

Runs a lifecycle hook if it's defined in the object's configuration

###### Parameters

###### hookName

`string`

Name of the hook to run (e.g., 'beforeDelete', 'afterDelete')

###### Returns

`Promise`\<`void`\>

Promise that resolves when the hook completes

###### Inherited from

[`BaseObject`](#baseobject).[`runHook`](#runhook)

##### save()

> **save**(): `Promise`\<[`Pleb`](#pleb)\<`T`\>\>

Defined in: [packages/smrt/src/object.ts:387](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L387)

Saves this object to the database

###### Returns

`Promise`\<[`Pleb`](#pleb)\<`T`\>\>

Promise resolving to this object

###### Inherited from

[`BaseObject`](#baseobject).[`save`](#save)

##### validateBeforeSave()

> `protected` **validateBeforeSave**(): `Promise`\<`void`\>

Defined in: [packages/smrt/src/object.ts:461](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L461)

Validates object state before saving
Override in subclasses to add custom validation logic

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`BaseObject`](#baseobject).[`validateBeforeSave`](#validatebeforesave)

##### create()

> `static` **create**(`options`): `Promise`\<[`Pleb`](#pleb)\<[`PlebOptions`](#pleboptions-1)\>\>

Defined in: [packages/smrt/src/pleb.ts:12](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/pleb.ts#L12)

###### Parameters

###### options

[`PlebOptions`](#pleboptions-1)

###### Returns

`Promise`\<[`Pleb`](#pleb)\<[`PlebOptions`](#pleboptions-1)\>\>

***

### RuntimeError

Defined in: packages/smrt/src/errors.ts:295

Runtime execution errors

#### Extends

- [`SmrtError`](#smrterror)

#### Constructors

##### Constructor

> **new RuntimeError**(`message`, `code`, `details?`, `cause?`): [`RuntimeError`](#runtimeerror)

Defined in: packages/smrt/src/errors.ts:296

###### Parameters

###### message

`string`

###### code

`string`

###### details?

`Record`\<`string`, `any`\>

###### cause?

`Error`

###### Returns

[`RuntimeError`](#runtimeerror)

###### Overrides

[`SmrtError`](#smrterror).[`constructor`](#constructor-18)

#### Properties

##### category

> `readonly` **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

Defined in: packages/smrt/src/errors.ts:13

###### Inherited from

[`SmrtError`](#smrterror).[`category`](#category-6)

##### cause?

> `readonly` `optional` **cause**: `Error`

Defined in: packages/smrt/src/errors.ts:15

The cause of the error.

###### Inherited from

[`SmrtError`](#smrterror).[`cause`](#cause-6)

##### code

> `readonly` **code**: `string`

Defined in: packages/smrt/src/errors.ts:12

###### Inherited from

[`SmrtError`](#smrterror).[`code`](#code-6)

##### details?

> `readonly` `optional` **details**: `Record`\<`string`, `any`\>

Defined in: packages/smrt/src/errors.ts:14

###### Inherited from

[`SmrtError`](#smrterror).[`details`](#details-6)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`SmrtError`](#smrterror).[`message`](#message-6)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`SmrtError`](#smrterror).[`name`](#name-8)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`SmrtError`](#smrterror).[`stack`](#stack-6)

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

[`SmrtError`](#smrterror).[`prepareStackTrace`](#preparestacktrace-6)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`SmrtError`](#smrterror).[`stackTraceLimit`](#stacktracelimit-6)

#### Methods

##### toJSON()

> **toJSON**(): `object`

Defined in: packages/smrt/src/errors.ts:40

Converts error to a serializable object for logging/debugging

###### Returns

`object`

###### category

> **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

###### cause

> **cause**: `undefined` \| \{ `message`: `string`; `name`: `string`; `stack`: `undefined` \| `string`; \}

###### code

> **code**: `string`

###### details

> **details**: `undefined` \| `Record`\<`string`, `any`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### Inherited from

[`SmrtError`](#smrterror).[`toJSON`](#tojson-12)

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

[`SmrtError`](#smrterror).[`captureStackTrace`](#capturestacktrace-18)

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

[`SmrtError`](#smrterror).[`captureStackTrace`](#capturestacktrace-18)

##### invalidState()

> `static` **invalidState**(`state`, `expected`): [`RuntimeError`](#runtimeerror)

Defined in: packages/smrt/src/errors.ts:309

###### Parameters

###### state

`string`

###### expected

`string`

###### Returns

[`RuntimeError`](#runtimeerror)

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

[`SmrtError`](#smrterror).[`isError`](#iserror-12)

##### operationFailed()

> `static` **operationFailed**(`operation`, `context?`, `cause?`): [`RuntimeError`](#runtimeerror)

Defined in: packages/smrt/src/errors.ts:300

###### Parameters

###### operation

`string`

###### context?

`string`

###### cause?

`Error`

###### Returns

[`RuntimeError`](#runtimeerror)

##### resourceExhausted()

> `static` **resourceExhausted**(`resource`, `limit`): [`RuntimeError`](#runtimeerror)

Defined in: packages/smrt/src/errors.ts:317

###### Parameters

###### resource

`string`

###### limit

`number`

###### Returns

[`RuntimeError`](#runtimeerror)

***

### `abstract` SmrtError

Defined in: packages/smrt/src/errors.ts:11

Base error class for all SMRT framework errors

#### Extends

- `Error`

#### Extended by

- [`DatabaseError`](#databaseerror)
- [`AIError`](#aierror)
- [`FilesystemError`](#filesystemerror)
- [`ValidationError`](#validationerror)
- [`NetworkError`](#networkerror)
- [`ConfigurationError`](#configurationerror)
- [`RuntimeError`](#runtimeerror)

#### Constructors

##### Constructor

> **new SmrtError**(`message`, `code`, `category`, `details?`, `cause?`): [`SmrtError`](#smrterror)

Defined in: packages/smrt/src/errors.ts:17

###### Parameters

###### message

`string`

###### code

`string`

###### category

`"database"` | `"ai"` | `"filesystem"` | `"validation"` | `"network"` | `"configuration"` | `"runtime"`

###### details?

`Record`\<`string`, `any`\>

###### cause?

`Error`

###### Returns

[`SmrtError`](#smrterror)

###### Overrides

`Error.constructor`

#### Properties

##### category

> `readonly` **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

Defined in: packages/smrt/src/errors.ts:13

##### cause?

> `readonly` `optional` **cause**: `Error`

Defined in: packages/smrt/src/errors.ts:15

The cause of the error.

###### Overrides

`Error.cause`

##### code

> `readonly` **code**: `string`

Defined in: packages/smrt/src/errors.ts:12

##### details?

> `readonly` `optional` **details**: `Record`\<`string`, `any`\>

Defined in: packages/smrt/src/errors.ts:14

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

##### toJSON()

> **toJSON**(): `object`

Defined in: packages/smrt/src/errors.ts:40

Converts error to a serializable object for logging/debugging

###### Returns

`object`

###### category

> **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

###### cause

> **cause**: `undefined` \| \{ `message`: `string`; `name`: `string`; `stack`: `undefined` \| `string`; \}

###### code

> **code**: `string`

###### details

> **details**: `undefined` \| `Record`\<`string`, `any`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

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

### ValidationError

Defined in: packages/smrt/src/errors.ts:180

Data validation errors

#### Extends

- [`SmrtError`](#smrterror)

#### Constructors

##### Constructor

> **new ValidationError**(`message`, `code`, `details?`, `cause?`): [`ValidationError`](#validationerror)

Defined in: packages/smrt/src/errors.ts:181

###### Parameters

###### message

`string`

###### code

`string`

###### details?

`Record`\<`string`, `any`\>

###### cause?

`Error`

###### Returns

[`ValidationError`](#validationerror)

###### Overrides

[`SmrtError`](#smrterror).[`constructor`](#constructor-18)

#### Properties

##### category

> `readonly` **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

Defined in: packages/smrt/src/errors.ts:13

###### Inherited from

[`SmrtError`](#smrterror).[`category`](#category-6)

##### cause?

> `readonly` `optional` **cause**: `Error`

Defined in: packages/smrt/src/errors.ts:15

The cause of the error.

###### Inherited from

[`SmrtError`](#smrterror).[`cause`](#cause-6)

##### code

> `readonly` **code**: `string`

Defined in: packages/smrt/src/errors.ts:12

###### Inherited from

[`SmrtError`](#smrterror).[`code`](#code-6)

##### details?

> `readonly` `optional` **details**: `Record`\<`string`, `any`\>

Defined in: packages/smrt/src/errors.ts:14

###### Inherited from

[`SmrtError`](#smrterror).[`details`](#details-6)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`SmrtError`](#smrterror).[`message`](#message-6)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`SmrtError`](#smrterror).[`name`](#name-8)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`SmrtError`](#smrterror).[`stack`](#stack-6)

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

[`SmrtError`](#smrterror).[`prepareStackTrace`](#preparestacktrace-6)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`SmrtError`](#smrterror).[`stackTraceLimit`](#stacktracelimit-6)

#### Methods

##### toJSON()

> **toJSON**(): `object`

Defined in: packages/smrt/src/errors.ts:40

Converts error to a serializable object for logging/debugging

###### Returns

`object`

###### category

> **category**: `"database"` \| `"ai"` \| `"filesystem"` \| `"validation"` \| `"network"` \| `"configuration"` \| `"runtime"`

###### cause

> **cause**: `undefined` \| \{ `message`: `string`; `name`: `string`; `stack`: `undefined` \| `string`; \}

###### code

> **code**: `string`

###### details

> **details**: `undefined` \| `Record`\<`string`, `any`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### Inherited from

[`SmrtError`](#smrterror).[`toJSON`](#tojson-12)

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

[`SmrtError`](#smrterror).[`captureStackTrace`](#capturestacktrace-18)

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

[`SmrtError`](#smrterror).[`captureStackTrace`](#capturestacktrace-18)

##### invalidValue()

> `static` **invalidValue**(`fieldName`, `value`, `expectedType`): [`ValidationError`](#validationerror)

Defined in: packages/smrt/src/errors.ts:193

###### Parameters

###### fieldName

`string`

###### value

`any`

###### expectedType

`string`

###### Returns

[`ValidationError`](#validationerror)

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

[`SmrtError`](#smrterror).[`isError`](#iserror-12)

##### rangeError()

> `static` **rangeError**(`fieldName`, `value`, `min?`, `max?`): [`ValidationError`](#validationerror)

Defined in: packages/smrt/src/errors.ts:209

###### Parameters

###### fieldName

`string`

###### value

`number`

###### min?

`number`

###### max?

`number`

###### Returns

[`ValidationError`](#validationerror)

##### requiredField()

> `static` **requiredField**(`fieldName`, `objectType`): [`ValidationError`](#validationerror)

Defined in: packages/smrt/src/errors.ts:185

###### Parameters

###### fieldName

`string`

###### objectType

`string`

###### Returns

[`ValidationError`](#validationerror)

##### uniqueConstraint()

> `static` **uniqueConstraint**(`fieldName`, `value`): [`ValidationError`](#validationerror)

Defined in: packages/smrt/src/errors.ts:201

###### Parameters

###### fieldName

`string`

###### value

`any`

###### Returns

[`ValidationError`](#validationerror)

## Interfaces

### APIConfig

Defined in: [packages/smrt/src/generators/rest.ts:11](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L11)

#### Extended by

- [`RestServerConfig`](#restserverconfig)

#### Properties

##### authMiddleware()?

> `optional` **authMiddleware**: (`objectName`, `action`) => (`req`) => `Promise`\<`Request` \| `Response`\>

Defined in: [packages/smrt/src/generators/rest.ts:15](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L15)

###### Parameters

###### objectName

`string`

###### action

`string`

###### Returns

> (`req`): `Promise`\<`Request` \| `Response`\>

###### Parameters

###### req

`Request`

###### Returns

`Promise`\<`Request` \| `Response`\>

##### basePath?

> `optional` **basePath**: `string`

Defined in: [packages/smrt/src/generators/rest.ts:12](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L12)

##### customRoutes?

> `optional` **customRoutes**: `Record`\<`string`, (`req`) => `Promise`\<`Response`\>\>

Defined in: [packages/smrt/src/generators/rest.ts:14](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L14)

##### enableCors?

> `optional` **enableCors**: `boolean`

Defined in: [packages/smrt/src/generators/rest.ts:13](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L13)

##### hostname?

> `optional` **hostname**: `string`

Defined in: [packages/smrt/src/generators/rest.ts:17](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L17)

##### port?

> `optional` **port**: `number`

Defined in: [packages/smrt/src/generators/rest.ts:16](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L16)

***

### APIContext

Defined in: [packages/smrt/src/generators/rest.ts:20](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L20)

#### Properties

##### ai?

> `optional` **ai**: `any`

Defined in: [packages/smrt/src/generators/rest.ts:22](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L22)

##### db?

> `optional` **db**: `any`

Defined in: [packages/smrt/src/generators/rest.ts:21](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L21)

##### user?

> `optional` **user**: `object`

Defined in: [packages/smrt/src/generators/rest.ts:23](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L23)

###### id

> **id**: `string`

###### roles?

> `optional` **roles**: `string`[]

###### username?

> `optional` **username**: `string`

***

### BaseClassOptions

Defined in: [packages/smrt/src/class.ts:11](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L11)

Configuration options for the BaseClass

#### Extended by

- [`BaseObjectOptions`](#baseobjectoptions-1)
- [`BaseCollectionOptions`](#basecollectionoptions-1)

#### Properties

##### \_className?

> `optional` **\_className**: `string`

Defined in: [packages/smrt/src/class.ts:15](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L15)

Optional custom class name override

##### ai?

> `optional` **ai**: `AIClientOptions`

Defined in: [packages/smrt/src/class.ts:35](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L35)

AI client configuration options

##### db?

> `optional` **db**: `object`

Defined in: [packages/smrt/src/class.ts:20](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L20)

Database configuration options

###### Index Signature

\[`key`: `string`\]: `any`

###### authToken?

> `optional` **authToken**: `string`

###### type?

> `optional` **type**: `"sqlite"` \| `"postgres"`

###### url?

> `optional` **url**: `string`

##### fs?

> `optional` **fs**: `FilesystemAdapterOptions`

Defined in: [packages/smrt/src/class.ts:30](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L30)

Filesystem adapter configuration options

***

### BaseCollectionOptions

Defined in: [packages/smrt/src/collection.ts:16](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/collection.ts#L16)

Configuration options for BaseCollection

#### Extends

- [`BaseClassOptions`](#baseclassoptions-1)

#### Properties

##### \_className?

> `optional` **\_className**: `string`

Defined in: [packages/smrt/src/class.ts:15](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L15)

Optional custom class name override

###### Inherited from

[`BaseClassOptions`](#baseclassoptions-1).[`_className`](#_classname-4)

##### ai?

> `optional` **ai**: `AIClientOptions`

Defined in: [packages/smrt/src/class.ts:35](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L35)

AI client configuration options

###### Inherited from

[`BaseClassOptions`](#baseclassoptions-1).[`ai`](#ai-5)

##### db?

> `optional` **db**: `object`

Defined in: [packages/smrt/src/class.ts:20](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L20)

Database configuration options

###### Index Signature

\[`key`: `string`\]: `any`

###### authToken?

> `optional` **authToken**: `string`

###### type?

> `optional` **type**: `"sqlite"` \| `"postgres"`

###### url?

> `optional` **url**: `string`

###### Inherited from

[`BaseClassOptions`](#baseclassoptions-1).[`db`](#db-5)

##### fs?

> `optional` **fs**: `FilesystemAdapterOptions`

Defined in: [packages/smrt/src/class.ts:30](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L30)

Filesystem adapter configuration options

###### Inherited from

[`BaseClassOptions`](#baseclassoptions-1).[`fs`](#fs-4)

***

### BaseObjectOptions

Defined in: [packages/smrt/src/object.ts:24](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L24)

Options for BaseObject initialization

#### Extends

- [`BaseClassOptions`](#baseclassoptions-1)

#### Extended by

- [`PlebOptions`](#pleboptions-1)

#### Properties

##### \_className?

> `optional` **\_className**: `string`

Defined in: [packages/smrt/src/class.ts:15](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L15)

Optional custom class name override

###### Inherited from

[`BaseClassOptions`](#baseclassoptions-1).[`_className`](#_classname-4)

##### ai?

> `optional` **ai**: `AIClientOptions`

Defined in: [packages/smrt/src/class.ts:35](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L35)

AI client configuration options

###### Inherited from

[`BaseClassOptions`](#baseclassoptions-1).[`ai`](#ai-5)

##### context?

> `optional` **context**: `string`

Defined in: [packages/smrt/src/object.ts:43](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L43)

Optional context to scope the slug (could be a path, domain, etc.)

##### created\_at?

> `optional` **created\_at**: `Date`

Defined in: [packages/smrt/src/object.ts:48](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L48)

Creation timestamp

##### db?

> `optional` **db**: `object`

Defined in: [packages/smrt/src/class.ts:20](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L20)

Database configuration options

###### Index Signature

\[`key`: `string`\]: `any`

###### authToken?

> `optional` **authToken**: `string`

###### type?

> `optional` **type**: `"sqlite"` \| `"postgres"`

###### url?

> `optional` **url**: `string`

###### Inherited from

[`BaseClassOptions`](#baseclassoptions-1).[`db`](#db-5)

##### fs?

> `optional` **fs**: `FilesystemAdapterOptions`

Defined in: [packages/smrt/src/class.ts:30](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L30)

Filesystem adapter configuration options

###### Inherited from

[`BaseClassOptions`](#baseclassoptions-1).[`fs`](#fs-4)

##### id?

> `optional` **id**: `string`

Defined in: [packages/smrt/src/object.ts:28](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L28)

Unique identifier for the object

##### name?

> `optional` **name**: `string`

Defined in: [packages/smrt/src/object.ts:33](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L33)

Human-readable name for the object

##### slug?

> `optional` **slug**: `string`

Defined in: [packages/smrt/src/object.ts:38](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L38)

URL-friendly identifier

##### updated\_at?

> `optional` **updated\_at**: `Date`

Defined in: [packages/smrt/src/object.ts:53](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L53)

Last update timestamp

***

### CLICommand

Defined in: [packages/smrt/src/generators/cli.ts:30](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L30)

#### Properties

##### aliases?

> `optional` **aliases**: `string`[]

Defined in: [packages/smrt/src/generators/cli.ts:33](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L33)

##### args?

> `optional` **args**: `string`[]

Defined in: [packages/smrt/src/generators/cli.ts:40](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L40)

##### description

> **description**: `string`

Defined in: [packages/smrt/src/generators/cli.ts:32](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L32)

##### handler()

> **handler**: (`args`, `options`) => `Promise`\<`void`\>

Defined in: [packages/smrt/src/generators/cli.ts:41](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L41)

###### Parameters

###### args

`any`

###### options

`any`

###### Returns

`Promise`\<`void`\>

##### name

> **name**: `string`

Defined in: [packages/smrt/src/generators/cli.ts:31](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L31)

##### options?

> `optional` **options**: `Record`\<`string`, \{ `default?`: `any`; `description`: `string`; `short?`: `string`; `type`: `"string"` \| `"boolean"`; \}\>

Defined in: [packages/smrt/src/generators/cli.ts:34](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L34)

***

### CLIConfig

Defined in: [packages/smrt/src/generators/cli.ts:13](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L13)

#### Properties

##### colors?

> `optional` **colors**: `boolean`

Defined in: [packages/smrt/src/generators/cli.ts:18](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L18)

##### description?

> `optional` **description**: `string`

Defined in: [packages/smrt/src/generators/cli.ts:16](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L16)

##### name?

> `optional` **name**: `string`

Defined in: [packages/smrt/src/generators/cli.ts:14](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L14)

##### prompt?

> `optional` **prompt**: `boolean`

Defined in: [packages/smrt/src/generators/cli.ts:17](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L17)

##### version?

> `optional` **version**: `string`

Defined in: [packages/smrt/src/generators/cli.ts:15](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L15)

***

### CLIContext

Defined in: [packages/smrt/src/generators/cli.ts:21](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L21)

#### Properties

##### ai?

> `optional` **ai**: `any`

Defined in: [packages/smrt/src/generators/cli.ts:23](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L23)

##### db?

> `optional` **db**: `any`

Defined in: [packages/smrt/src/generators/cli.ts:22](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L22)

##### user?

> `optional` **user**: `object`

Defined in: [packages/smrt/src/generators/cli.ts:24](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L24)

###### id

> **id**: `string`

###### roles?

> `optional` **roles**: `string`[]

***

### FieldDefinition

Defined in: [packages/smrt/src/scanner/types.ts:5](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L5)

Type definitions for AST scanning and manifest generation

#### Properties

##### default?

> `optional` **default**: `any`

Defined in: [packages/smrt/src/scanner/types.ts:8](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L8)

##### description?

> `optional` **description**: `string`

Defined in: [packages/smrt/src/scanner/types.ts:14](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L14)

##### max?

> `optional` **max**: `number`

Defined in: [packages/smrt/src/scanner/types.ts:10](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L10)

##### maxLength?

> `optional` **maxLength**: `number`

Defined in: [packages/smrt/src/scanner/types.ts:11](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L11)

##### min?

> `optional` **min**: `number`

Defined in: [packages/smrt/src/scanner/types.ts:9](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L9)

##### minLength?

> `optional` **minLength**: `number`

Defined in: [packages/smrt/src/scanner/types.ts:12](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L12)

##### options?

> `optional` **options**: `Record`\<`string`, `any`\>

Defined in: [packages/smrt/src/scanner/types.ts:15](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L15)

##### related?

> `optional` **related**: `string`

Defined in: [packages/smrt/src/scanner/types.ts:13](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L13)

##### required?

> `optional` **required**: `boolean`

Defined in: [packages/smrt/src/scanner/types.ts:7](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L7)

##### type

> **type**: `"boolean"` \| `"text"` \| `"integer"` \| `"decimal"` \| `"datetime"` \| `"json"` \| `"foreignKey"`

Defined in: [packages/smrt/src/scanner/types.ts:6](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L6)

***

### FieldOptions

Defined in: [packages/smrt/src/fields/index.ts:19](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L19)

Clean field syntax for smrt objects

Provides simple, Svelte-inspired field definitions:

#### Example

```typescript
import { text, decimal, boolean, foreignKey } from '@have/smrt/fields';

class Product extends BaseObject {
  name = text({ required: true });
  price = decimal({ min: 0 });
  active = boolean({ default: true });
  category = foreignKey(Category);
}
```

#### Extended by

- [`NumericFieldOptions`](#numericfieldoptions)
- [`TextFieldOptions`](#textfieldoptions)
- [`RelationshipFieldOptions`](#relationshipfieldoptions)

#### Properties

##### default?

> `optional` **default**: `any`

Defined in: [packages/smrt/src/fields/index.ts:21](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L21)

##### description?

> `optional` **description**: `string`

Defined in: [packages/smrt/src/fields/index.ts:24](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L24)

##### index?

> `optional` **index**: `boolean`

Defined in: [packages/smrt/src/fields/index.ts:23](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L23)

##### required?

> `optional` **required**: `boolean`

Defined in: [packages/smrt/src/fields/index.ts:20](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L20)

##### unique?

> `optional` **unique**: `boolean`

Defined in: [packages/smrt/src/fields/index.ts:22](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L22)

***

### MCPConfig

Defined in: [packages/smrt/src/generators/mcp.ts:11](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L11)

#### Properties

##### description?

> `optional` **description**: `string`

Defined in: [packages/smrt/src/generators/mcp.ts:14](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L14)

##### name?

> `optional` **name**: `string`

Defined in: [packages/smrt/src/generators/mcp.ts:12](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L12)

##### server?

> `optional` **server**: `object`

Defined in: [packages/smrt/src/generators/mcp.ts:15](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L15)

###### name

> **name**: `string`

###### version

> **version**: `string`

##### version?

> `optional` **version**: `string`

Defined in: [packages/smrt/src/generators/mcp.ts:13](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L13)

***

### MCPContext

Defined in: [packages/smrt/src/generators/mcp.ts:21](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L21)

#### Properties

##### ai?

> `optional` **ai**: `any`

Defined in: [packages/smrt/src/generators/mcp.ts:23](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L23)

##### db?

> `optional` **db**: `any`

Defined in: [packages/smrt/src/generators/mcp.ts:22](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L22)

##### user?

> `optional` **user**: `object`

Defined in: [packages/smrt/src/generators/mcp.ts:24](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L24)

###### id

> **id**: `string`

###### roles?

> `optional` **roles**: `string`[]

***

### MCPRequest

Defined in: [packages/smrt/src/generators/mcp.ts:40](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L40)

#### Properties

##### method

> **method**: `string`

Defined in: [packages/smrt/src/generators/mcp.ts:41](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L41)

##### params

> **params**: `object`

Defined in: [packages/smrt/src/generators/mcp.ts:42](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L42)

###### arguments

> **arguments**: `Record`\<`string`, `any`\>

###### name

> **name**: `string`

***

### MCPResponse

Defined in: [packages/smrt/src/generators/mcp.ts:48](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L48)

#### Properties

##### content

> **content**: `object`[]

Defined in: [packages/smrt/src/generators/mcp.ts:49](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L49)

###### text

> **text**: `string`

###### type

> **type**: `"text"`

***

### MCPTool

Defined in: [packages/smrt/src/generators/mcp.ts:30](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L30)

#### Properties

##### description

> **description**: `string`

Defined in: [packages/smrt/src/generators/mcp.ts:32](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L32)

##### inputSchema

> **inputSchema**: `object`

Defined in: [packages/smrt/src/generators/mcp.ts:33](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L33)

###### properties

> **properties**: `Record`\<`string`, `any`\>

###### required?

> `optional` **required**: `string`[]

###### type

> **type**: `string`

##### name

> **name**: `string`

Defined in: [packages/smrt/src/generators/mcp.ts:31](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/mcp.ts#L31)

***

### MethodDefinition

Defined in: [packages/smrt/src/scanner/types.ts:18](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L18)

#### Properties

##### async

> **async**: `boolean`

Defined in: [packages/smrt/src/scanner/types.ts:20](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L20)

##### description?

> `optional` **description**: `string`

Defined in: [packages/smrt/src/scanner/types.ts:28](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L28)

##### isPublic

> **isPublic**: `boolean`

Defined in: [packages/smrt/src/scanner/types.ts:30](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L30)

##### isStatic

> **isStatic**: `boolean`

Defined in: [packages/smrt/src/scanner/types.ts:29](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L29)

##### name

> **name**: `string`

Defined in: [packages/smrt/src/scanner/types.ts:19](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L19)

##### parameters

> **parameters**: `object`[]

Defined in: [packages/smrt/src/scanner/types.ts:21](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L21)

###### default?

> `optional` **default**: `any`

###### name

> **name**: `string`

###### optional

> **optional**: `boolean`

###### type

> **type**: `string`

##### returnType

> **returnType**: `string`

Defined in: [packages/smrt/src/scanner/types.ts:27](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L27)

***

### NumericFieldOptions

Defined in: [packages/smrt/src/fields/index.ts:27](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L27)

Clean field syntax for smrt objects

Provides simple, Svelte-inspired field definitions:

#### Example

```typescript
import { text, decimal, boolean, foreignKey } from '@have/smrt/fields';

class Product extends BaseObject {
  name = text({ required: true });
  price = decimal({ min: 0 });
  active = boolean({ default: true });
  category = foreignKey(Category);
}
```

#### Extends

- [`FieldOptions`](#fieldoptions-1)

#### Properties

##### default?

> `optional` **default**: `any`

Defined in: [packages/smrt/src/fields/index.ts:21](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L21)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`default`](#default-1)

##### description?

> `optional` **description**: `string`

Defined in: [packages/smrt/src/fields/index.ts:24](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L24)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`description`](#description-3)

##### index?

> `optional` **index**: `boolean`

Defined in: [packages/smrt/src/fields/index.ts:23](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L23)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`index`](#index)

##### max?

> `optional` **max**: `number`

Defined in: [packages/smrt/src/fields/index.ts:29](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L29)

##### min?

> `optional` **min**: `number`

Defined in: [packages/smrt/src/fields/index.ts:28](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L28)

##### required?

> `optional` **required**: `boolean`

Defined in: [packages/smrt/src/fields/index.ts:20](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L20)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`required`](#required-1)

##### unique?

> `optional` **unique**: `boolean`

Defined in: [packages/smrt/src/fields/index.ts:22](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L22)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`unique`](#unique)

***

### OpenAPIConfig

Defined in: [packages/smrt/src/generators/swagger.ts:9](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/swagger.ts#L9)

#### Properties

##### basePath?

> `optional` **basePath**: `string`

Defined in: [packages/smrt/src/generators/swagger.ts:13](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/swagger.ts#L13)

##### description?

> `optional` **description**: `string`

Defined in: [packages/smrt/src/generators/swagger.ts:12](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/swagger.ts#L12)

##### serverUrl?

> `optional` **serverUrl**: `string`

Defined in: [packages/smrt/src/generators/swagger.ts:14](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/swagger.ts#L14)

##### title?

> `optional` **title**: `string`

Defined in: [packages/smrt/src/generators/swagger.ts:10](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/swagger.ts#L10)

##### version?

> `optional` **version**: `string`

Defined in: [packages/smrt/src/generators/swagger.ts:11](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/swagger.ts#L11)

***

### ParsedArgs

Defined in: [packages/smrt/src/generators/cli.ts:44](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L44)

#### Properties

##### args

> **args**: `string`[]

Defined in: [packages/smrt/src/generators/cli.ts:46](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L46)

##### command?

> `optional` **command**: `string`

Defined in: [packages/smrt/src/generators/cli.ts:45](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L45)

##### options

> **options**: `Record`\<`string`, `any`\>

Defined in: [packages/smrt/src/generators/cli.ts:47](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/cli.ts#L47)

***

### PlebOptions

Defined in: [packages/smrt/src/pleb.ts:4](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/pleb.ts#L4)

Options for BaseObject initialization

#### Extends

- [`BaseObjectOptions`](#baseobjectoptions-1)

#### Properties

##### \_className?

> `optional` **\_className**: `string`

Defined in: [packages/smrt/src/class.ts:15](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L15)

Optional custom class name override

###### Inherited from

[`BaseObjectOptions`](#baseobjectoptions-1).[`_className`](#_classname-6)

##### ai?

> `optional` **ai**: `AIClientOptions`

Defined in: [packages/smrt/src/class.ts:35](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L35)

AI client configuration options

###### Inherited from

[`BaseObjectOptions`](#baseobjectoptions-1).[`ai`](#ai-7)

##### context?

> `optional` **context**: `string`

Defined in: [packages/smrt/src/object.ts:43](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L43)

Optional context to scope the slug (could be a path, domain, etc.)

###### Inherited from

[`BaseObjectOptions`](#baseobjectoptions-1).[`context`](#context-2)

##### created\_at?

> `optional` **created\_at**: `Date`

Defined in: [packages/smrt/src/object.ts:48](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L48)

Creation timestamp

###### Inherited from

[`BaseObjectOptions`](#baseobjectoptions-1).[`created_at`](#created_at-2)

##### db?

> `optional` **db**: `object`

Defined in: [packages/smrt/src/class.ts:20](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L20)

Database configuration options

###### Index Signature

\[`key`: `string`\]: `any`

###### authToken?

> `optional` **authToken**: `string`

###### type?

> `optional` **type**: `"sqlite"` \| `"postgres"`

###### url?

> `optional` **url**: `string`

###### Inherited from

[`BaseObjectOptions`](#baseobjectoptions-1).[`db`](#db-7)

##### fs?

> `optional` **fs**: `FilesystemAdapterOptions`

Defined in: [packages/smrt/src/class.ts:30](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/class.ts#L30)

Filesystem adapter configuration options

###### Inherited from

[`BaseObjectOptions`](#baseobjectoptions-1).[`fs`](#fs-6)

##### id?

> `optional` **id**: `string`

Defined in: [packages/smrt/src/object.ts:28](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L28)

Unique identifier for the object

###### Inherited from

[`BaseObjectOptions`](#baseobjectoptions-1).[`id`](#id-2)

##### name?

> `optional` **name**: `string`

Defined in: [packages/smrt/src/object.ts:33](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L33)

Human-readable name for the object

###### Inherited from

[`BaseObjectOptions`](#baseobjectoptions-1).[`name`](#name-10)

##### slug?

> `optional` **slug**: `string`

Defined in: [packages/smrt/src/object.ts:38](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L38)

URL-friendly identifier

###### Inherited from

[`BaseObjectOptions`](#baseobjectoptions-1).[`slug`](#slug-2)

##### updated\_at?

> `optional` **updated\_at**: `Date`

Defined in: [packages/smrt/src/object.ts:53](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/object.ts#L53)

Last update timestamp

###### Inherited from

[`BaseObjectOptions`](#baseobjectoptions-1).[`updated_at`](#updated_at-2)

***

### RelationshipFieldOptions

Defined in: [packages/smrt/src/fields/index.ts:39](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L39)

Clean field syntax for smrt objects

Provides simple, Svelte-inspired field definitions:

#### Example

```typescript
import { text, decimal, boolean, foreignKey } from '@have/smrt/fields';

class Product extends BaseObject {
  name = text({ required: true });
  price = decimal({ min: 0 });
  active = boolean({ default: true });
  category = foreignKey(Category);
}
```

#### Extends

- [`FieldOptions`](#fieldoptions-1)

#### Properties

##### default?

> `optional` **default**: `any`

Defined in: [packages/smrt/src/fields/index.ts:21](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L21)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`default`](#default-1)

##### description?

> `optional` **description**: `string`

Defined in: [packages/smrt/src/fields/index.ts:24](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L24)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`description`](#description-3)

##### index?

> `optional` **index**: `boolean`

Defined in: [packages/smrt/src/fields/index.ts:23](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L23)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`index`](#index)

##### onDelete?

> `optional` **onDelete**: `"cascade"` \| `"restrict"` \| `"set_null"`

Defined in: [packages/smrt/src/fields/index.ts:40](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L40)

##### related?

> `optional` **related**: `string`

Defined in: [packages/smrt/src/fields/index.ts:41](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L41)

##### required?

> `optional` **required**: `boolean`

Defined in: [packages/smrt/src/fields/index.ts:20](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L20)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`required`](#required-1)

##### unique?

> `optional` **unique**: `boolean`

Defined in: [packages/smrt/src/fields/index.ts:22](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L22)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`unique`](#unique)

***

### RestServerConfig

Defined in: [packages/smrt/src/generators/rest.ts:345](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L345)

#### Extends

- [`APIConfig`](#apiconfig)

#### Properties

##### authMiddleware()?

> `optional` **authMiddleware**: (`objectName`, `action`) => (`req`) => `Promise`\<`Request` \| `Response`\>

Defined in: [packages/smrt/src/generators/rest.ts:15](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L15)

###### Parameters

###### objectName

`string`

###### action

`string`

###### Returns

> (`req`): `Promise`\<`Request` \| `Response`\>

###### Parameters

###### req

`Request`

###### Returns

`Promise`\<`Request` \| `Response`\>

###### Inherited from

[`APIConfig`](#apiconfig).[`authMiddleware`](#authmiddleware)

##### basePath?

> `optional` **basePath**: `string`

Defined in: [packages/smrt/src/generators/rest.ts:12](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L12)

###### Inherited from

[`APIConfig`](#apiconfig).[`basePath`](#basepath)

##### customRoutes?

> `optional` **customRoutes**: `Record`\<`string`, (`req`) => `Promise`\<`Response`\>\>

Defined in: [packages/smrt/src/generators/rest.ts:14](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L14)

###### Inherited from

[`APIConfig`](#apiconfig).[`customRoutes`](#customroutes)

##### enableCors?

> `optional` **enableCors**: `boolean`

Defined in: [packages/smrt/src/generators/rest.ts:13](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L13)

###### Inherited from

[`APIConfig`](#apiconfig).[`enableCors`](#enablecors)

##### healthCheck?

> `optional` **healthCheck**: `object`

Defined in: [packages/smrt/src/generators/rest.ts:346](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L346)

###### customChecks?

> `optional` **customChecks**: () => `Promise`\<`boolean`\>[]

###### Returns

`Promise`\<`boolean`\>

###### enabled?

> `optional` **enabled**: `boolean`

###### path?

> `optional` **path**: `string`

##### hostname?

> `optional` **hostname**: `string`

Defined in: [packages/smrt/src/generators/rest.ts:17](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L17)

###### Inherited from

[`APIConfig`](#apiconfig).[`hostname`](#hostname)

##### port?

> `optional` **port**: `number`

Defined in: [packages/smrt/src/generators/rest.ts:16](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L16)

###### Inherited from

[`APIConfig`](#apiconfig).[`port`](#port)

***

### ScanOptions

Defined in: [packages/smrt/src/scanner/types.ts:73](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L73)

#### Properties

##### baseClasses?

> `optional` **baseClasses**: `string`[]

Defined in: [packages/smrt/src/scanner/types.ts:77](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L77)

##### followImports?

> `optional` **followImports**: `boolean`

Defined in: [packages/smrt/src/scanner/types.ts:76](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L76)

##### includePrivateMethods?

> `optional` **includePrivateMethods**: `boolean`

Defined in: [packages/smrt/src/scanner/types.ts:74](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L74)

##### includeStaticMethods?

> `optional` **includeStaticMethods**: `boolean`

Defined in: [packages/smrt/src/scanner/types.ts:75](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L75)

***

### ScanResult

Defined in: [packages/smrt/src/scanner/types.ts:63](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L63)

#### Properties

##### errors

> **errors**: `object`[]

Defined in: [packages/smrt/src/scanner/types.ts:66](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L66)

###### column?

> `optional` **column**: `number`

###### line?

> `optional` **line**: `number`

###### message

> **message**: `string`

##### filePath

> **filePath**: `string`

Defined in: [packages/smrt/src/scanner/types.ts:64](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L64)

##### objects

> **objects**: [`SmartObjectDefinition`](#smartobjectdefinition)[]

Defined in: [packages/smrt/src/scanner/types.ts:65](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L65)

***

### SmartObjectConfig

Defined in: [packages/smrt/src/registry.ts:11](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L11)

#### Properties

##### api?

> `optional` **api**: `object`

Defined in: [packages/smrt/src/registry.ts:20](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L20)

API configuration

###### customize?

> `optional` **customize**: `object`

Custom endpoint handlers

###### customize.create()?

> `optional` **create**: (`req`, `collection`) => `Promise`\<`any`\>

###### Parameters

###### req

`any`

###### collection

`any`

###### Returns

`Promise`\<`any`\>

###### customize.delete()?

> `optional` **delete**: (`req`, `collection`) => `Promise`\<`any`\>

###### Parameters

###### req

`any`

###### collection

`any`

###### Returns

`Promise`\<`any`\>

###### customize.get()?

> `optional` **get**: (`req`, `collection`) => `Promise`\<`any`\>

###### Parameters

###### req

`any`

###### collection

`any`

###### Returns

`Promise`\<`any`\>

###### customize.list()?

> `optional` **list**: (`req`, `collection`) => `Promise`\<`any`\>

###### Parameters

###### req

`any`

###### collection

`any`

###### Returns

`Promise`\<`any`\>

###### customize.update()?

> `optional` **update**: (`req`, `collection`) => `Promise`\<`any`\>

###### Parameters

###### req

`any`

###### collection

`any`

###### Returns

`Promise`\<`any`\>

###### exclude?

> `optional` **exclude**: (`"list"` \| `"get"` \| `"create"` \| `"update"` \| `"delete"`)[]

Exclude specific endpoints

###### include?

> `optional` **include**: (`"list"` \| `"get"` \| `"create"` \| `"update"` \| `"delete"`)[]

Include only specific endpoints

###### middleware?

> `optional` **middleware**: `any`[]

Custom middleware for this object's endpoints

##### cli?

> `optional` **cli**: `boolean` \| \{ `exclude?`: (`"list"` \| `"get"` \| `"create"` \| `"update"` \| `"delete"`)[]; `include?`: (`"list"` \| `"get"` \| `"create"` \| `"update"` \| `"delete"`)[]; \}

Defined in: [packages/smrt/src/registry.ts:66](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L66)

CLI configuration

###### Type declaration

`boolean`

\{ `exclude?`: (`"list"` \| `"get"` \| `"create"` \| `"update"` \| `"delete"`)[]; `include?`: (`"list"` \| `"get"` \| `"create"` \| `"update"` \| `"delete"`)[]; \}

###### exclude?

> `optional` **exclude**: (`"list"` \| `"get"` \| `"create"` \| `"update"` \| `"delete"`)[]

Exclude specific commands

###### include?

> `optional` **include**: (`"list"` \| `"get"` \| `"create"` \| `"update"` \| `"delete"`)[]

Include specific commands

##### hooks?

> `optional` **hooks**: `object`

Defined in: [packages/smrt/src/registry.ts:81](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L81)

Lifecycle hooks

###### afterCreate?

> `optional` **afterCreate**: `string` \| (`instance`) => `Promise`\<`void`\>

###### afterDelete?

> `optional` **afterDelete**: `string` \| (`instance`) => `Promise`\<`void`\>

###### afterSave?

> `optional` **afterSave**: `string` \| (`instance`) => `Promise`\<`void`\>

###### afterUpdate?

> `optional` **afterUpdate**: `string` \| (`instance`) => `Promise`\<`void`\>

###### beforeCreate?

> `optional` **beforeCreate**: `string` \| (`instance`) => `Promise`\<`void`\>

###### beforeDelete?

> `optional` **beforeDelete**: `string` \| (`instance`) => `Promise`\<`void`\>

###### beforeSave?

> `optional` **beforeSave**: `string` \| (`instance`) => `Promise`\<`void`\>

###### beforeUpdate?

> `optional` **beforeUpdate**: `string` \| (`instance`) => `Promise`\<`void`\>

##### mcp?

> `optional` **mcp**: `object`

Defined in: [packages/smrt/src/registry.ts:51](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L51)

MCP server configuration

###### exclude?

> `optional` **exclude**: (`"list"` \| `"get"` \| `"create"` \| `"update"` \| `"delete"`)[]

Exclude specific tools

###### include?

> `optional` **include**: (`"list"` \| `"get"` \| `"create"` \| `"update"` \| `"delete"`)[]

Include specific tools

##### name?

> `optional` **name**: `string`

Defined in: [packages/smrt/src/registry.ts:15](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L15)

Custom name for the object (defaults to class name)

***

### SmartObjectDefinition

Defined in: [packages/smrt/src/scanner/types.ts:33](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L33)

#### Properties

##### className

> **className**: `string`

Defined in: [packages/smrt/src/scanner/types.ts:35](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L35)

##### collection

> **collection**: `string`

Defined in: [packages/smrt/src/scanner/types.ts:36](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L36)

##### decoratorConfig

> **decoratorConfig**: `object`

Defined in: [packages/smrt/src/scanner/types.ts:40](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L40)

###### api?

> `optional` **api**: `boolean` \| \{ `exclude?`: `string`[]; `include?`: `string`[]; \}

###### cli?

> `optional` **cli**: `boolean` \| \{ `exclude?`: `string`[]; `include?`: `string`[]; \}

###### mcp?

> `optional` **mcp**: `boolean` \| \{ `exclude?`: `string`[]; `include?`: `string`[]; \}

##### extends?

> `optional` **extends**: `string`

Defined in: [packages/smrt/src/scanner/types.ts:54](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L54)

##### fields

> **fields**: `Record`\<`string`, [`FieldDefinition`](#fielddefinition)\>

Defined in: [packages/smrt/src/scanner/types.ts:38](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L38)

##### filePath

> **filePath**: `string`

Defined in: [packages/smrt/src/scanner/types.ts:37](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L37)

##### methods

> **methods**: `Record`\<`string`, [`MethodDefinition`](#methoddefinition)\>

Defined in: [packages/smrt/src/scanner/types.ts:39](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L39)

##### name

> **name**: `string`

Defined in: [packages/smrt/src/scanner/types.ts:34](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L34)

***

### SmartObjectManifest

Defined in: [packages/smrt/src/scanner/types.ts:57](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L57)

#### Properties

##### objects

> **objects**: `Record`\<`string`, [`SmartObjectDefinition`](#smartobjectdefinition)\>

Defined in: [packages/smrt/src/scanner/types.ts:60](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L60)

##### timestamp

> **timestamp**: `number`

Defined in: [packages/smrt/src/scanner/types.ts:59](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L59)

##### version

> **version**: `string`

Defined in: [packages/smrt/src/scanner/types.ts:58](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/types.ts#L58)

***

### SmrtClientOptions

Defined in: [packages/smrt/src/runtime/types.ts:20](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/runtime/types.ts#L20)

#### Properties

##### auth?

> `optional` **auth**: `object`

Defined in: [packages/smrt/src/runtime/types.ts:23](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/runtime/types.ts#L23)

###### password?

> `optional` **password**: `string`

###### token?

> `optional` **token**: `string`

###### type

> **type**: `"bearer"` \| `"basic"`

###### username?

> `optional` **username**: `string`

##### basePath?

> `optional` **basePath**: `string`

Defined in: [packages/smrt/src/runtime/types.ts:22](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/runtime/types.ts#L22)

##### baseUrl?

> `optional` **baseUrl**: `string`

Defined in: [packages/smrt/src/runtime/types.ts:21](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/runtime/types.ts#L21)

##### fetch?

> `optional` **fetch**: *typeof* `fetch`

Defined in: [packages/smrt/src/runtime/types.ts:29](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/runtime/types.ts#L29)

***

### SmrtServerOptions

Defined in: [packages/smrt/src/runtime/types.ts:5](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/runtime/types.ts#L5)

Runtime type definitions for SMRT services

#### Properties

##### auth?

> `optional` **auth**: `object`

Defined in: [packages/smrt/src/runtime/types.ts:14](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/runtime/types.ts#L14)

###### type

> **type**: `"bearer"` \| `"custom"` \| `"basic"`

###### verify()?

> `optional` **verify**: (`token`) => `Promise`\<`any`\>

###### Parameters

###### token

`string`

###### Returns

`Promise`\<`any`\>

##### basePath?

> `optional` **basePath**: `string`

Defined in: [packages/smrt/src/runtime/types.ts:8](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/runtime/types.ts#L8)

##### cors?

> `optional` **cors**: `boolean` \| \{ `headers?`: `string`[]; `methods?`: `string`[]; `origin?`: `string` \| `string`[]; \}

Defined in: [packages/smrt/src/runtime/types.ts:9](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/runtime/types.ts#L9)

##### hostname?

> `optional` **hostname**: `string`

Defined in: [packages/smrt/src/runtime/types.ts:7](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/runtime/types.ts#L7)

##### port?

> `optional` **port**: `number`

Defined in: [packages/smrt/src/runtime/types.ts:6](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/runtime/types.ts#L6)

***

### TextFieldOptions

Defined in: [packages/smrt/src/fields/index.ts:32](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L32)

Clean field syntax for smrt objects

Provides simple, Svelte-inspired field definitions:

#### Example

```typescript
import { text, decimal, boolean, foreignKey } from '@have/smrt/fields';

class Product extends BaseObject {
  name = text({ required: true });
  price = decimal({ min: 0 });
  active = boolean({ default: true });
  category = foreignKey(Category);
}
```

#### Extends

- [`FieldOptions`](#fieldoptions-1)

#### Properties

##### default?

> `optional` **default**: `any`

Defined in: [packages/smrt/src/fields/index.ts:21](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L21)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`default`](#default-1)

##### description?

> `optional` **description**: `string`

Defined in: [packages/smrt/src/fields/index.ts:24](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L24)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`description`](#description-3)

##### encrypted?

> `optional` **encrypted**: `boolean`

Defined in: [packages/smrt/src/fields/index.ts:36](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L36)

##### index?

> `optional` **index**: `boolean`

Defined in: [packages/smrt/src/fields/index.ts:23](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L23)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`index`](#index)

##### maxLength?

> `optional` **maxLength**: `number`

Defined in: [packages/smrt/src/fields/index.ts:33](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L33)

##### minLength?

> `optional` **minLength**: `number`

Defined in: [packages/smrt/src/fields/index.ts:34](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L34)

##### pattern?

> `optional` **pattern**: `string`

Defined in: [packages/smrt/src/fields/index.ts:35](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L35)

##### required?

> `optional` **required**: `boolean`

Defined in: [packages/smrt/src/fields/index.ts:20](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L20)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`required`](#required-1)

##### unique?

> `optional` **unique**: `boolean`

Defined in: [packages/smrt/src/fields/index.ts:22](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L22)

###### Inherited from

[`FieldOptions`](#fieldoptions-1).[`unique`](#unique)

## Functions

### boolean()

> **boolean**(`options`): [`Field`](#field)

Defined in: [packages/smrt/src/fields/index.ts:127](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L127)

Boolean field for true/false values

#### Parameters

##### options

[`FieldOptions`](#fieldoptions-1) = `{}`

#### Returns

[`Field`](#field)

***

### createMCPServer()

> **createMCPServer**(`options?`): `SmrtMCPServer`

Defined in: [packages/smrt/src/runtime/mcp.ts:85](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/runtime/mcp.ts#L85)

Create a new SMRT MCP server instance

#### Parameters

##### options?

`MCPServerOptions`

#### Returns

`SmrtMCPServer`

***

### createRestServer()

> **createRestServer**(`objects`, `context`, `config`): `object`

Defined in: [packages/smrt/src/generators/rest.ts:356](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L356)

Create REST server with health checks using Bun

#### Parameters

##### objects

*typeof* [`BaseObject`](#baseobject)[]

##### context

[`APIContext`](#apicontext) = `{}`

##### config

[`RestServerConfig`](#restserverconfig) = `{}`

#### Returns

`object`

##### server

> **server**: `any`

##### url

> **url**: `string`

***

### createSmrtClient()

> **createSmrtClient**(`options?`): `SmrtClient`

Defined in: [packages/smrt/src/runtime/client.ts:124](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/runtime/client.ts#L124)

Create a new SMRT client instance

#### Parameters

##### options?

[`SmrtClientOptions`](#smrtclientoptions)

#### Returns

`SmrtClient`

***

### createSmrtServer()

> **createSmrtServer**(`options?`): `SmrtServer`

Defined in: [packages/smrt/src/runtime/server.ts:269](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/runtime/server.ts#L269)

Create a new SMRT server instance

#### Parameters

##### options?

[`SmrtServerOptions`](#smrtserveroptions)

#### Returns

`SmrtServer`

***

### datetime()

> **datetime**(`options`): [`Field`](#field)

Defined in: [packages/smrt/src/fields/index.ts:134](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L134)

DateTime field for timestamps

#### Parameters

##### options

[`FieldOptions`](#fieldoptions-1) = `{}`

#### Returns

[`Field`](#field)

***

### decimal()

> **decimal**(`options`): [`Field`](#field)

Defined in: [packages/smrt/src/fields/index.ts:120](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L120)

Decimal field for floating point numbers

#### Parameters

##### options

[`NumericFieldOptions`](#numericfieldoptions) = `{}`

#### Returns

[`Field`](#field)

***

### foreignKey()

> **foreignKey**(`relatedClass`, `options`): [`Field`](#field)

Defined in: [packages/smrt/src/fields/index.ts:148](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L148)

Foreign key relationship to another object

#### Parameters

##### relatedClass

`any`

##### options

`Omit`\<[`RelationshipFieldOptions`](#relationshipfieldoptions), `"related"`\> = `{}`

#### Returns

[`Field`](#field)

***

### generateManifest()

> **generateManifest**(`scanResults`): [`SmartObjectManifest`](#smartobjectmanifest)

Defined in: [packages/smrt/src/scanner/manifest-generator.ts:301](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/manifest-generator.ts#L301)

Convenience function to generate manifest

#### Parameters

##### scanResults

[`ScanResult`](#scanresult)[]

#### Returns

[`SmartObjectManifest`](#smartobjectmanifest)

***

### generateOpenAPISpec()

> **generateOpenAPISpec**(`config`): `any`

Defined in: [packages/smrt/src/generators/swagger.ts:20](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/swagger.ts#L20)

Generate OpenAPI specification (tree-shakeable)

#### Parameters

##### config

[`OpenAPIConfig`](#openapiconfig) = `{}`

#### Returns

`any`

***

### integer()

> **integer**(`options`): [`Field`](#field)

Defined in: [packages/smrt/src/fields/index.ts:113](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L113)

Integer field for whole numbers

#### Parameters

##### options

[`NumericFieldOptions`](#numericfieldoptions) = `{}`

#### Returns

[`Field`](#field)

***

### json()

> **json**(`options`): [`Field`](#field)

Defined in: [packages/smrt/src/fields/index.ts:141](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L141)

JSON field for structured data

#### Parameters

##### options

[`FieldOptions`](#fieldoptions-1) = `{}`

#### Returns

[`Field`](#field)

***

### manyToMany()

> **manyToMany**(`relatedClass`, `options`): [`Field`](#field)

Defined in: [packages/smrt/src/fields/index.ts:178](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L178)

Many-to-many relationship

#### Parameters

##### relatedClass

`any`

##### options

`Omit`\<[`RelationshipFieldOptions`](#relationshipfieldoptions), `"related"`\> = `{}`

#### Returns

[`Field`](#field)

***

### oneToMany()

> **oneToMany**(`relatedClass`, `options`): [`Field`](#field)

Defined in: [packages/smrt/src/fields/index.ts:163](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L163)

One-to-many relationship

#### Parameters

##### relatedClass

`any`

##### options

`Omit`\<[`RelationshipFieldOptions`](#relationshipfieldoptions), `"related"`\> = `{}`

#### Returns

[`Field`](#field)

***

### scanFile()

> **scanFile**(`filePath`, `options?`): [`ScanResult`](#scanresult)

Defined in: [packages/smrt/src/scanner/ast-scanner.ts:376](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/ast-scanner.ts#L376)

Scan a single file

#### Parameters

##### filePath

`string`

##### options?

[`ScanOptions`](#scanoptions)

#### Returns

[`ScanResult`](#scanresult)

***

### scanFiles()

> **scanFiles**(`filePaths`, `options?`): [`ScanResult`](#scanresult)[]

Defined in: [packages/smrt/src/scanner/ast-scanner.ts:368](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/scanner/ast-scanner.ts#L368)

Convenience function to scan files

#### Parameters

##### filePaths

`string`[]

##### options?

[`ScanOptions`](#scanoptions)

#### Returns

[`ScanResult`](#scanresult)[]

***

### setupSwaggerUI()

> **setupSwaggerUI**(`app`, `spec`, `path`): `void`

Defined in: [packages/smrt/src/generators/swagger.ts:309](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/swagger.ts#L309)

Setup Swagger UI (optional peer dependency)

#### Parameters

##### app

`any`

##### spec

`any`

##### path

`string` = `'/docs'`

#### Returns

`void`

***

### smrt()

> **smrt**(`config`): \<`T`\>(`constructor`) => `T`

Defined in: [packages/smrt/src/registry.ts:259](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/registry.ts#L259)

#### Parameters

##### config

[`SmartObjectConfig`](#smartobjectconfig) = `{}`

#### Returns

> \<`T`\>(`constructor`): `T`

##### Type Parameters

###### T

`T` *extends* *typeof* [`BaseObject`](#baseobject)

##### Parameters

###### constructor

`T`

##### Returns

`T`

#### Smrt

decorator for registering classes with the global registry

#### Example

```typescript
@smrt()
class Product extends BaseObject {
  name = text({ required: true });
  price = decimal({ min: 0 });
}

@smrt({ api: { exclude: ['delete'] } })
class SensitiveData extends BaseObject {
  secret = text({ encrypted: true });
}
```

***

### smrtPlugin()

> **smrtPlugin**(`options`): `Plugin$1`

Defined in: [packages/smrt/src/vite-plugin/index.ts:42](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/vite-plugin/index.ts#L42)

#### Parameters

##### options

`SmrtPluginOptions` = `{}`

#### Returns

`Plugin$1`

***

### startRestServer()

> **startRestServer**(`objects`, `context`, `config`): `Promise`\<() => `Promise`\<`void`\>\>

Defined in: [packages/smrt/src/generators/rest.ts:379](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/generators/rest.ts#L379)

Start server with graceful shutdown

#### Parameters

##### objects

*typeof* [`BaseObject`](#baseobject)[]

##### context

[`APIContext`](#apicontext) = `{}`

##### config

[`RestServerConfig`](#restserverconfig) = `{}`

#### Returns

`Promise`\<() => `Promise`\<`void`\>\>

***

### text()

> **text**(`options`): [`Field`](#field)

Defined in: [packages/smrt/src/fields/index.ts:106](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/smrt/src/fields/index.ts#L106)

Text field for strings

#### Parameters

##### options

[`TextFieldOptions`](#textfieldoptions) = `{}`

#### Returns

[`Field`](#field)
