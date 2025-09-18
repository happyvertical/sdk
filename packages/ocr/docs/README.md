# @have/ocr

## Classes

### OCRDependencyError

Defined in: [packages/ocr/src/shared/types.ts:161](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L161)

Error classes for OCR operations

#### Extends

- [`OCRError`](#ocrerror)

#### Constructors

##### Constructor

> **new OCRDependencyError**(`provider`, `message`, `context?`): [`OCRDependencyError`](#ocrdependencyerror)

Defined in: [packages/ocr/src/shared/types.ts:162](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L162)

###### Parameters

###### provider

`string`

###### message

`string`

###### context?

`any`

###### Returns

[`OCRDependencyError`](#ocrdependencyerror)

###### Overrides

[`OCRError`](#ocrerror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`OCRError`](#ocrerror).[`cause`](#cause-1)

##### context?

> `readonly` `optional` **context**: `any`

Defined in: [packages/ocr/src/shared/types.ts:155](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L155)

###### Inherited from

[`OCRError`](#ocrerror).[`context`](#context-1)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`OCRError`](#ocrerror).[`message`](#message-1)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`OCRError`](#ocrerror).[`name`](#name-1)

##### provider?

> `readonly` `optional` **provider**: `string`

Defined in: [packages/ocr/src/shared/types.ts:155](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L155)

###### Inherited from

[`OCRError`](#ocrerror).[`provider`](#provider-1)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`OCRError`](#ocrerror).[`stack`](#stack-1)

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

[`OCRError`](#ocrerror).[`prepareStackTrace`](#preparestacktrace-1)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`OCRError`](#ocrerror).[`stackTraceLimit`](#stacktracelimit-1)

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

[`OCRError`](#ocrerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`OCRError`](#ocrerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`OCRError`](#ocrerror).[`isError`](#iserror-2)

***

### OCRError

Defined in: [packages/ocr/src/shared/types.ts:154](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L154)

Error classes for OCR operations

#### Extends

- `Error`

#### Extended by

- [`OCRDependencyError`](#ocrdependencyerror)
- [`OCRUnsupportedError`](#ocrunsupportederror)
- [`OCRProcessingError`](#ocrprocessingerror)

#### Constructors

##### Constructor

> **new OCRError**(`message`, `provider?`, `context?`): [`OCRError`](#ocrerror)

Defined in: [packages/ocr/src/shared/types.ts:155](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L155)

###### Parameters

###### message

`string`

###### provider?

`string`

###### context?

`any`

###### Returns

[`OCRError`](#ocrerror)

###### Overrides

`Error.constructor`

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

`Error.cause`

##### context?

> `readonly` `optional` **context**: `any`

Defined in: [packages/ocr/src/shared/types.ts:155](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L155)

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

##### provider?

> `readonly` `optional` **provider**: `string`

Defined in: [packages/ocr/src/shared/types.ts:155](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L155)

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

### OCRFactory

Defined in: [packages/ocr/src/shared/factory.ts:44](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L44)

OCR factory that manages multiple OCR providers with intelligent fallback

This factory:
- Selects the best available OCR provider based on environment
- Falls back to alternative providers if the primary fails
- Provides a unified interface for all OCR operations
- Handles dependency checking and graceful degradation

#### Constructors

##### Constructor

> **new OCRFactory**(`options`): [`OCRFactory`](#ocrfactory)

Defined in: [packages/ocr/src/shared/factory.ts:52](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L52)

###### Parameters

###### options

[`OCRFactoryOptions`](#ocrfactoryoptions) = `{}`

###### Returns

[`OCRFactory`](#ocrfactory)

#### Methods

##### addProvider()

> **addProvider**(`name`, `provider`): `void`

Defined in: [packages/ocr/src/shared/factory.ts:322](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L322)

Add a custom OCR provider

###### Parameters

###### name

`string`

###### provider

[`OCRProvider`](#ocrprovider)

###### Returns

`void`

##### cleanup()

> **cleanup**(): `Promise`\<`void`\>

Defined in: [packages/ocr/src/shared/factory.ts:305](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L305)

Clean up all OCR providers and their resources

###### Returns

`Promise`\<`void`\>

##### getAvailableProviderNames()

> **getAvailableProviderNames**(): `string`[]

Defined in: [packages/ocr/src/shared/factory.ts:340](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L340)

Get available provider names in current environment

###### Returns

`string`[]

##### getBestProvider()

> **getBestProvider**(): `Promise`\<`null` \| [`OCRProvider`](#ocrprovider)\>

Defined in: [packages/ocr/src/shared/factory.ts:103](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L103)

Get the best available OCR provider based on dependencies and environment

###### Returns

`Promise`\<`null` \| [`OCRProvider`](#ocrprovider)\>

##### getEnvironment()

> **getEnvironment**(): [`OCREnvironment`](#ocrenvironment)

Defined in: [packages/ocr/src/shared/factory.ts:347](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L347)

Get current environment

###### Returns

[`OCREnvironment`](#ocrenvironment)

##### getProvidersInfo()

> **getProvidersInfo**(): `Promise`\<[`OCRProviderInfo`](#ocrproviderinfo)[]\>

Defined in: [packages/ocr/src/shared/factory.ts:247](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L247)

Get information about all available OCR providers

###### Returns

`Promise`\<[`OCRProviderInfo`](#ocrproviderinfo)[]\>

##### getSupportedLanguages()

> **getSupportedLanguages**(): `Promise`\<`string`[]\>

Defined in: [packages/ocr/src/shared/factory.ts:293](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L293)

Get supported languages from the best available provider

###### Returns

`Promise`\<`string`[]\>

##### isOCRAvailable()

> **isOCRAvailable**(): `Promise`\<`boolean`\>

Defined in: [packages/ocr/src/shared/factory.ts:285](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L285)

Check if any OCR provider is available

###### Returns

`Promise`\<`boolean`\>

##### performOCR()

> **performOCR**(`images`, `options?`): `Promise`\<[`OCRResult`](#ocrresult)\>

Defined in: [packages/ocr/src/shared/factory.ts:174](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L174)

Perform OCR using the best available provider with fallback

###### Parameters

###### images

[`OCRImage`](#ocrimage)[]

###### options?

[`OCROptions`](#ocroptions)

###### Returns

`Promise`\<[`OCRResult`](#ocrresult)\>

##### removeProvider()

> **removeProvider**(`name`): `Promise`\<`void`\>

Defined in: [packages/ocr/src/shared/factory.ts:329](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L329)

Remove an OCR provider

###### Parameters

###### name

`string`

###### Returns

`Promise`\<`void`\>

***

### OCRProcessingError

Defined in: [packages/ocr/src/shared/types.ts:175](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L175)

Error classes for OCR operations

#### Extends

- [`OCRError`](#ocrerror)

#### Constructors

##### Constructor

> **new OCRProcessingError**(`provider`, `message`, `context?`): [`OCRProcessingError`](#ocrprocessingerror)

Defined in: [packages/ocr/src/shared/types.ts:176](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L176)

###### Parameters

###### provider

`string`

###### message

`string`

###### context?

`any`

###### Returns

[`OCRProcessingError`](#ocrprocessingerror)

###### Overrides

[`OCRError`](#ocrerror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`OCRError`](#ocrerror).[`cause`](#cause-1)

##### context?

> `readonly` `optional` **context**: `any`

Defined in: [packages/ocr/src/shared/types.ts:155](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L155)

###### Inherited from

[`OCRError`](#ocrerror).[`context`](#context-1)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`OCRError`](#ocrerror).[`message`](#message-1)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`OCRError`](#ocrerror).[`name`](#name-1)

##### provider?

> `readonly` `optional` **provider**: `string`

Defined in: [packages/ocr/src/shared/types.ts:155](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L155)

###### Inherited from

[`OCRError`](#ocrerror).[`provider`](#provider-1)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`OCRError`](#ocrerror).[`stack`](#stack-1)

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

[`OCRError`](#ocrerror).[`prepareStackTrace`](#preparestacktrace-1)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`OCRError`](#ocrerror).[`stackTraceLimit`](#stacktracelimit-1)

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

[`OCRError`](#ocrerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`OCRError`](#ocrerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`OCRError`](#ocrerror).[`isError`](#iserror-2)

***

### OCRUnsupportedError

Defined in: [packages/ocr/src/shared/types.ts:168](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L168)

Error classes for OCR operations

#### Extends

- [`OCRError`](#ocrerror)

#### Constructors

##### Constructor

> **new OCRUnsupportedError**(`provider`, `operation`, `context?`): [`OCRUnsupportedError`](#ocrunsupportederror)

Defined in: [packages/ocr/src/shared/types.ts:169](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L169)

###### Parameters

###### provider

`string`

###### operation

`string`

###### context?

`any`

###### Returns

[`OCRUnsupportedError`](#ocrunsupportederror)

###### Overrides

[`OCRError`](#ocrerror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`OCRError`](#ocrerror).[`cause`](#cause-1)

##### context?

> `readonly` `optional` **context**: `any`

Defined in: [packages/ocr/src/shared/types.ts:155](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L155)

###### Inherited from

[`OCRError`](#ocrerror).[`context`](#context-1)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`OCRError`](#ocrerror).[`message`](#message-1)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`OCRError`](#ocrerror).[`name`](#name-1)

##### provider?

> `readonly` `optional` **provider**: `string`

Defined in: [packages/ocr/src/shared/types.ts:155](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L155)

###### Inherited from

[`OCRError`](#ocrerror).[`provider`](#provider-1)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`OCRError`](#ocrerror).[`stack`](#stack-1)

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

[`OCRError`](#ocrerror).[`prepareStackTrace`](#preparestacktrace-1)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`OCRError`](#ocrerror).[`stackTraceLimit`](#stacktracelimit-1)

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

[`OCRError`](#ocrerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`OCRError`](#ocrerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`OCRError`](#ocrerror).[`isError`](#iserror-2)

## Interfaces

### DependencyCheckResult

Defined in: [packages/ocr/src/shared/types.ts:73](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L73)

Dependency check result for OCR providers

#### Properties

##### available

> **available**: `boolean`

Defined in: [packages/ocr/src/shared/types.ts:75](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L75)

Whether all dependencies are available

##### details

> **details**: `Record`\<`string`, `any`\>

Defined in: [packages/ocr/src/shared/types.ts:79](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L79)

Detailed information about specific dependencies

##### error?

> `optional` **error**: `string`

Defined in: [packages/ocr/src/shared/types.ts:77](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L77)

Error message if dependencies are missing

##### version?

> `optional` **version**: `string`

Defined in: [packages/ocr/src/shared/types.ts:81](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L81)

Version information if available

***

### OCRCapabilities

Defined in: [packages/ocr/src/shared/types.ts:87](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L87)

OCR provider capabilities information

#### Properties

##### canPerformOCR

> **canPerformOCR**: `boolean`

Defined in: [packages/ocr/src/shared/types.ts:89](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L89)

Whether the provider can perform OCR

##### hasBoundingBoxes?

> `optional` **hasBoundingBoxes**: `boolean`

Defined in: [packages/ocr/src/shared/types.ts:99](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L99)

Whether the provider supports bounding boxes

##### hasConfidenceScores?

> `optional` **hasConfidenceScores**: `boolean`

Defined in: [packages/ocr/src/shared/types.ts:97](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L97)

Whether the provider supports confidence scores

##### maxImageSize?

> `optional` **maxImageSize**: `number`

Defined in: [packages/ocr/src/shared/types.ts:93](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L93)

Maximum supported image size in pixels

##### providerSpecific?

> `optional` **providerSpecific**: `Record`\<`string`, `any`\>

Defined in: [packages/ocr/src/shared/types.ts:101](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L101)

Provider-specific capabilities

##### supportedFormats?

> `optional` **supportedFormats**: `string`[]

Defined in: [packages/ocr/src/shared/types.ts:95](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L95)

Supported image formats

##### supportedLanguages

> **supportedLanguages**: `string`[]

Defined in: [packages/ocr/src/shared/types.ts:91](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L91)

List of supported languages

***

### OCRFactoryOptions

Defined in: [packages/ocr/src/shared/types.ts:140](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L140)

OCR factory configuration options

#### Properties

##### defaultOptions?

> `optional` **defaultOptions**: [`OCROptions`](#ocroptions)

Defined in: [packages/ocr/src/shared/types.ts:146](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L146)

Default options for OCR operations

##### fallbackProviders?

> `optional` **fallbackProviders**: `string`[]

Defined in: [packages/ocr/src/shared/types.ts:144](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L144)

Fallback providers to try if primary fails

##### provider?

> `optional` **provider**: `string`

Defined in: [packages/ocr/src/shared/types.ts:142](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L142)

Primary provider to use ('auto', 'tesseract', 'onnx')

##### providerConfig?

> `optional` **providerConfig**: `Record`\<`string`, `any`\>

Defined in: [packages/ocr/src/shared/types.ts:148](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L148)

Provider-specific configuration

***

### OCRImage

Defined in: [packages/ocr/src/shared/types.ts:24](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L24)

Image data input for OCR processing

#### Properties

##### channels?

> `optional` **channels**: `number`

Defined in: [packages/ocr/src/shared/types.ts:32](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L32)

Number of color channels

##### data

> **data**: `string` \| `Buffer`\<`ArrayBufferLike`\> \| `Uint8Array`\<`ArrayBufferLike`\>

Defined in: [packages/ocr/src/shared/types.ts:26](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L26)

Image data as Buffer, Uint8Array, or string (base64/path)

##### format?

> `optional` **format**: `string`

Defined in: [packages/ocr/src/shared/types.ts:34](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L34)

Image format/type

##### height?

> `optional` **height**: `number`

Defined in: [packages/ocr/src/shared/types.ts:30](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L30)

Image height in pixels

##### metadata?

> `optional` **metadata**: `Record`\<`string`, `any`\>

Defined in: [packages/ocr/src/shared/types.ts:36](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L36)

Optional metadata for tracking

##### width?

> `optional` **width**: `number`

Defined in: [packages/ocr/src/shared/types.ts:28](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L28)

Image width in pixels

***

### OCROptions

Defined in: [packages/ocr/src/shared/types.ts:8](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L8)

Options for OCR processing

#### Properties

##### confidenceThreshold?

> `optional` **confidenceThreshold**: `number`

Defined in: [packages/ocr/src/shared/types.ts:16](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L16)

Confidence threshold for OCR results (0-100)

##### improveResolution?

> `optional` **improveResolution**: `boolean`

Defined in: [packages/ocr/src/shared/types.ts:12](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L12)

Whether to enhance image resolution before OCR

##### language?

> `optional` **language**: `string`

Defined in: [packages/ocr/src/shared/types.ts:10](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L10)

Language for OCR recognition (default: 'eng')

##### outputFormat?

> `optional` **outputFormat**: `"text"` \| `"json"` \| `"hocr"`

Defined in: [packages/ocr/src/shared/types.ts:14](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L14)

Output format for OCR results

##### timeout?

> `optional` **timeout**: `number`

Defined in: [packages/ocr/src/shared/types.ts:18](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L18)

Timeout in milliseconds for OCR processing

***

### OCRProvider

Defined in: [packages/ocr/src/shared/types.ts:107](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L107)

Core OCR provider interface

#### Properties

##### name

> `readonly` **name**: `string`

Defined in: [packages/ocr/src/shared/types.ts:109](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L109)

Provider name identifier

#### Methods

##### checkCapabilities()

> **checkCapabilities**(): `Promise`\<[`OCRCapabilities`](#ocrcapabilities)\>

Defined in: [packages/ocr/src/shared/types.ts:124](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L124)

Get provider capabilities

###### Returns

`Promise`\<[`OCRCapabilities`](#ocrcapabilities)\>

##### checkDependencies()

> **checkDependencies**(): `Promise`\<[`DependencyCheckResult`](#dependencycheckresult)\>

Defined in: [packages/ocr/src/shared/types.ts:119](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L119)

Check if provider dependencies are available

###### Returns

`Promise`\<[`DependencyCheckResult`](#dependencycheckresult)\>

##### cleanup()?

> `optional` **cleanup**(): `Promise`\<`void`\>

Defined in: [packages/ocr/src/shared/types.ts:134](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L134)

Clean up provider resources (optional)

###### Returns

`Promise`\<`void`\>

##### getSupportedLanguages()

> **getSupportedLanguages**(): `string`[]

Defined in: [packages/ocr/src/shared/types.ts:129](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L129)

Get supported languages

###### Returns

`string`[]

##### performOCR()

> **performOCR**(`images`, `options?`): `Promise`\<[`OCRResult`](#ocrresult)\>

Defined in: [packages/ocr/src/shared/types.ts:114](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L114)

Perform OCR on image data

###### Parameters

###### images

[`OCRImage`](#ocrimage)[]

###### options?

[`OCROptions`](#ocroptions)

###### Returns

`Promise`\<[`OCRResult`](#ocrresult)\>

***

### OCRProviderInfo

Defined in: [packages/ocr/src/shared/types.ts:185](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L185)

Provider information for discovery

#### Properties

##### available

> **available**: `boolean`

Defined in: [packages/ocr/src/shared/types.ts:187](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L187)

##### capabilities

> **capabilities**: `null` \| [`OCRCapabilities`](#ocrcapabilities)

Defined in: [packages/ocr/src/shared/types.ts:189](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L189)

##### dependencies

> **dependencies**: [`DependencyCheckResult`](#dependencycheckresult)

Defined in: [packages/ocr/src/shared/types.ts:188](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L188)

##### name

> **name**: `string`

Defined in: [packages/ocr/src/shared/types.ts:186](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L186)

***

### OCRResult

Defined in: [packages/ocr/src/shared/types.ts:42](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L42)

OCR result with confidence information

#### Properties

##### confidence

> **confidence**: `number`

Defined in: [packages/ocr/src/shared/types.ts:46](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L46)

Overall confidence score (0-100)

##### detections?

> `optional` **detections**: `object`[]

Defined in: [packages/ocr/src/shared/types.ts:48](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L48)

Detailed detection results

###### boundingBox?

> `optional` **boundingBox**: `object`

###### boundingBox.height

> **height**: `number`

###### boundingBox.width

> **width**: `number`

###### boundingBox.x

> **x**: `number`

###### boundingBox.y

> **y**: `number`

###### confidence

> **confidence**: `number`

###### text

> **text**: `string`

##### metadata?

> `optional` **metadata**: `object`

Defined in: [packages/ocr/src/shared/types.ts:59](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L59)

Processing metadata

###### Index Signature

\[`key`: `string`\]: `any`

###### environment?

> `optional` **environment**: `string`

###### error?

> `optional` **error**: `string`

###### fallbackFrom?

> `optional` **fallbackFrom**: `string`

###### language?

> `optional` **language**: `string`

###### processingTime?

> `optional` **processingTime**: `number`

###### provider?

> `optional` **provider**: `string`

##### text

> **text**: `string`

Defined in: [packages/ocr/src/shared/types.ts:44](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L44)

Extracted text

***

### ProviderCompatibility

Defined in: [packages/ocr/src/shared/types.ts:200](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L200)

Provider compatibility matrix

#### Properties

##### environment

> **environment**: [`OCREnvironment`](#ocrenvironment)

Defined in: [packages/ocr/src/shared/types.ts:201](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L201)

##### provider

> **provider**: `string`

Defined in: [packages/ocr/src/shared/types.ts:202](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L202)

##### reason?

> `optional` **reason**: `string`

Defined in: [packages/ocr/src/shared/types.ts:204](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L204)

##### supported

> **supported**: `boolean`

Defined in: [packages/ocr/src/shared/types.ts:203](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L203)

## Type Aliases

### OCREnvironment

> **OCREnvironment** = `"node"` \| `"browser"` \| `"unknown"`

Defined in: [packages/ocr/src/shared/types.ts:195](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/types.ts#L195)

Environment-specific provider availability

## Functions

### getAvailableProviders()

> **getAvailableProviders**(): `Promise`\<`string`[]\>

Defined in: [packages/ocr/src/shared/factory.ts:389](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L389)

Get available OCR providers in current environment

#### Returns

`Promise`\<`string`[]\>

***

### getOCR()

> **getOCR**(`options?`): [`OCRFactory`](#ocrfactory)

Defined in: [packages/ocr/src/shared/factory.ts:361](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L361)

Get or create an OCR factory instance

If no options are provided, returns the global singleton.
If options are provided, creates a new instance with those options.

#### Parameters

##### options?

[`OCRFactoryOptions`](#ocrfactoryoptions)

#### Returns

[`OCRFactory`](#ocrfactory)

***

### getProviderInfo()

> **getProviderInfo**(`providerName`): `Promise`\<`null` \| [`OCRProviderInfo`](#ocrproviderinfo)\>

Defined in: [packages/ocr/src/shared/factory.ts:408](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L408)

Get information about a specific OCR provider

#### Parameters

##### providerName

`string`

#### Returns

`Promise`\<`null` \| [`OCRProviderInfo`](#ocrproviderinfo)\>

***

### isProviderAvailable()

> **isProviderAvailable**(`providerName`): `Promise`\<`boolean`\>

Defined in: [packages/ocr/src/shared/factory.ts:398](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L398)

Check if a specific OCR provider is available

#### Parameters

##### providerName

`string`

#### Returns

`Promise`\<`boolean`\>

***

### resetOCRFactory()

> **resetOCRFactory**(): `void`

Defined in: [packages/ocr/src/shared/factory.ts:377](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/ocr/src/shared/factory.ts#L377)

Reset the global OCR factory (useful for testing)

#### Returns

`void`

## References

### default

Renames and re-exports [getOCR](#getocr)
