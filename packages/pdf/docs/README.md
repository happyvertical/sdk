# @have/pdf

## Namespaces

- [default](@have/namespaces/default.md)

## Classes

### `abstract` BasePDFReader

Defined in: [packages/pdf/src/shared/base.ts:26](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L26)

Base PDF reader class that provides ENOTSUP (not supported) implementations
for all methods. Concrete providers should extend this class and override
the methods they support.

This follows the same pattern as BaseFilesystemProvider in the files package.

#### Implements

- [`PDFReader`](#pdfreader)

#### Constructors

##### Constructor

> **new BasePDFReader**(): [`BasePDFReader`](#basepdfreader)

###### Returns

[`BasePDFReader`](#basepdfreader)

#### Properties

##### name

> `abstract` `protected` **name**: `string`

Defined in: [packages/pdf/src/shared/base.ts:27](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L27)

#### Methods

##### checkCapabilities()

> **checkCapabilities**(): `Promise`\<[`PDFCapabilities`](#pdfcapabilities)\>

Defined in: [packages/pdf/src/shared/base.ts:68](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L68)

Check the capabilities of this PDF reader
Default implementation returns all capabilities as false

###### Returns

`Promise`\<[`PDFCapabilities`](#pdfcapabilities)\>

###### Implementation of

[`PDFReader`](#pdfreader).[`checkCapabilities`](#checkcapabilities-4)

##### checkDependencies()

> **checkDependencies**(): `Promise`\<[`DependencyCheckResult`](#dependencycheckresult)\>

Defined in: [packages/pdf/src/shared/base.ts:84](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L84)

Check if dependencies for this reader are available
Default implementation returns not available

###### Returns

`Promise`\<[`DependencyCheckResult`](#dependencycheckresult)\>

###### Implementation of

[`PDFReader`](#pdfreader).[`checkDependencies`](#checkdependencies-4)

##### createDefaultMetadata()

> `protected` **createDefaultMetadata**(`pageCount`): [`PDFMetadata`](#pdfmetadata)

Defined in: [packages/pdf/src/shared/base.ts:179](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L179)

Utility method to create default metadata for cases where extraction fails

###### Parameters

###### pageCount

`number` = `0`

Number of pages in the document

###### Returns

[`PDFMetadata`](#pdfmetadata)

Basic PDFMetadata object

##### extractImages()

> **extractImages**(`source`): `Promise`\<[`PDFImage`](#pdfimage)[]\>

Defined in: [packages/pdf/src/shared/base.ts:52](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L52)

Extract images from a PDF
Default implementation throws ENOTSUP error

###### Parameters

###### source

[`PDFSource`](#pdfsource)

###### Returns

`Promise`\<[`PDFImage`](#pdfimage)[]\>

###### Implementation of

[`PDFReader`](#pdfreader).[`extractImages`](#extractimages-2)

##### extractMetadata()

> **extractMetadata**(`source`): `Promise`\<[`PDFMetadata`](#pdfmetadata)\>

Defined in: [packages/pdf/src/shared/base.ts:44](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L44)

Extract metadata from a PDF
Default implementation throws ENOTSUP error

###### Parameters

###### source

[`PDFSource`](#pdfsource)

###### Returns

`Promise`\<[`PDFMetadata`](#pdfmetadata)\>

###### Implementation of

[`PDFReader`](#pdfreader).[`extractMetadata`](#extractmetadata-2)

##### extractText()

> **extractText**(`source`, `options?`): `Promise`\<`null` \| `string`\>

Defined in: [packages/pdf/src/shared/base.ts:33](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L33)

Extract text content from a PDF
Default implementation throws ENOTSUP error

###### Parameters

###### source

[`PDFSource`](#pdfsource)

###### options?

[`ExtractTextOptions`](#extracttextoptions)

###### Returns

`Promise`\<`null` \| `string`\>

###### Implementation of

[`PDFReader`](#pdfreader).[`extractText`](#extracttext-2)

##### getInfo()

> **getInfo**(`source`): `Promise`\<[`PDFInfo`](#pdfinfo)\>

Defined in: [packages/pdf/src/shared/base.ts:96](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L96)

Get quick information about a PDF document
Default implementation throws ENOTSUP error

###### Parameters

###### source

[`PDFSource`](#pdfsource)

###### Returns

`Promise`\<[`PDFInfo`](#pdfinfo)\>

###### Implementation of

[`PDFReader`](#pdfreader).[`getInfo`](#getinfo-2)

##### isValidPageNumber()

> `protected` **isValidPageNumber**(`pageNumber`, `totalPages`): `boolean`

Defined in: [packages/pdf/src/shared/base.ts:140](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L140)

Utility method to check if a page number is valid

###### Parameters

###### pageNumber

`number`

Page number to validate (1-based)

###### totalPages

`number`

Total number of pages in the document

###### Returns

`boolean`

Boolean indicating if the page number is valid

##### mergePageTexts()

> `protected` **mergePageTexts**(`pageTexts`, `mergePages?`): `string`

Defined in: [packages/pdf/src/shared/base.ts:166](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L166)

Utility method to merge text from multiple pages

###### Parameters

###### pageTexts

`string`[]

Array of text strings from different pages

###### mergePages?

`boolean`

Whether to merge pages into a single string

###### Returns

`string`

String containing merged or joined text

##### normalizePages()

> `protected` **normalizePages**(`pages`, `totalPages`): `number`[]

Defined in: [packages/pdf/src/shared/base.ts:150](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L150)

Utility method to normalize page ranges

###### Parameters

###### pages

Array of page numbers or undefined for all pages

`undefined` | `number`[]

###### totalPages

`number`

Total number of pages in the document

###### Returns

`number`[]

Array of valid page numbers

##### normalizeSource()

> `protected` **normalizeSource**(`source`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [packages/pdf/src/shared/base.ts:105](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L105)

Utility method to normalize PDF source to Uint8Array (cross-platform)

###### Parameters

###### source

[`PDFSource`](#pdfsource)

PDF source (file path, ArrayBuffer, or Uint8Array)

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Promise resolving to Uint8Array containing PDF data

##### performOCR()

> **performOCR**(`images`, `options?`): `Promise`\<[`OCRResult`](#ocrresult)\>

Defined in: [packages/pdf/src/shared/base.ts:60](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L60)

Perform OCR on image data
Default implementation throws ENOTSUP error

###### Parameters

###### images

[`PDFImage`](#pdfimage)[]

###### options?

[`OCROptions`](#ocroptions)

###### Returns

`Promise`\<[`OCRResult`](#ocrresult)\>

###### Implementation of

[`PDFReader`](#pdfreader).[`performOCR`](#performocr-4)

##### validatePDFData()

> `protected` **validatePDFData**(`data`): `boolean`

Defined in: [packages/pdf/src/shared/base.ts:124](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/base.ts#L124)

Utility method to validate PDF data

###### Parameters

###### data

`Uint8Array`

Uint8Array containing potential PDF data

###### Returns

`boolean`

Boolean indicating if the data appears to be valid PDF data

***

### PDFDependencyError

Defined in: [packages/pdf/src/shared/types.ts:194](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L194)

Error types specific to PDF processing

#### Extends

- [`PDFError`](#pdferror)

#### Constructors

##### Constructor

> **new PDFDependencyError**(`dependency`, `details?`): [`PDFDependencyError`](#pdfdependencyerror)

Defined in: [packages/pdf/src/shared/types.ts:195](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L195)

###### Parameters

###### dependency

`string`

###### details?

`string`

###### Returns

[`PDFDependencyError`](#pdfdependencyerror)

###### Overrides

[`PDFError`](#pdferror).[`constructor`](#constructor-2)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`PDFError`](#pdferror).[`cause`](#cause-1)

##### code?

> `optional` **code**: `string`

Defined in: [packages/pdf/src/shared/types.ts:180](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L180)

###### Inherited from

[`PDFError`](#pdferror).[`code`](#code-1)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`PDFError`](#pdferror).[`message`](#message-1)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`PDFError`](#pdferror).[`name`](#name-2)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`PDFError`](#pdferror).[`stack`](#stack-1)

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

[`PDFError`](#pdferror).[`prepareStackTrace`](#preparestacktrace-1)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`PDFError`](#pdferror).[`stackTraceLimit`](#stacktracelimit-1)

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

[`PDFError`](#pdferror).[`captureStackTrace`](#capturestacktrace-3)

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

[`PDFError`](#pdferror).[`captureStackTrace`](#capturestacktrace-3)

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

[`PDFError`](#pdferror).[`isError`](#iserror-2)

***

### PDFError

Defined in: [packages/pdf/src/shared/types.ts:179](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L179)

Error types specific to PDF processing

#### Extends

- `Error`

#### Extended by

- [`PDFUnsupportedError`](#pdfunsupportederror)
- [`PDFDependencyError`](#pdfdependencyerror)

#### Constructors

##### Constructor

> **new PDFError**(`message`, `code?`): [`PDFError`](#pdferror)

Defined in: [packages/pdf/src/shared/types.ts:180](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L180)

###### Parameters

###### message

`string`

###### code?

`string`

###### Returns

[`PDFError`](#pdferror)

###### Overrides

`Error.constructor`

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

`Error.cause`

##### code?

> `optional` **code**: `string`

Defined in: [packages/pdf/src/shared/types.ts:180](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L180)

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

### PDFUnsupportedError

Defined in: [packages/pdf/src/shared/types.ts:186](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L186)

Error types specific to PDF processing

#### Extends

- [`PDFError`](#pdferror)

#### Constructors

##### Constructor

> **new PDFUnsupportedError**(`operation`): [`PDFUnsupportedError`](#pdfunsupportederror)

Defined in: [packages/pdf/src/shared/types.ts:187](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L187)

###### Parameters

###### operation

`string`

###### Returns

[`PDFUnsupportedError`](#pdfunsupportederror)

###### Overrides

[`PDFError`](#pdferror).[`constructor`](#constructor-2)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`PDFError`](#pdferror).[`cause`](#cause-1)

##### code?

> `optional` **code**: `string`

Defined in: [packages/pdf/src/shared/types.ts:180](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L180)

###### Inherited from

[`PDFError`](#pdferror).[`code`](#code-1)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`PDFError`](#pdferror).[`message`](#message-1)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`PDFError`](#pdferror).[`name`](#name-2)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`PDFError`](#pdferror).[`stack`](#stack-1)

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

[`PDFError`](#pdferror).[`prepareStackTrace`](#preparestacktrace-1)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`PDFError`](#pdferror).[`stackTraceLimit`](#stacktracelimit-1)

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

[`PDFError`](#pdferror).[`captureStackTrace`](#capturestacktrace-3)

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

[`PDFError`](#pdferror).[`captureStackTrace`](#capturestacktrace-3)

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

[`PDFError`](#pdferror).[`isError`](#iserror-2)

## Interfaces

### DependencyCheckResult

Defined in: packages/ocr/dist/shared/types.d.ts:69

Dependency check result for OCR providers

#### Properties

##### available

> **available**: `boolean`

Defined in: packages/ocr/dist/shared/types.d.ts:71

Whether all dependencies are available

##### details

> **details**: `Record`\<`string`, `any`\>

Defined in: packages/ocr/dist/shared/types.d.ts:75

Detailed information about specific dependencies

##### error?

> `optional` **error**: `string`

Defined in: packages/ocr/dist/shared/types.d.ts:73

Error message if dependencies are missing

##### version?

> `optional` **version**: `string`

Defined in: packages/ocr/dist/shared/types.d.ts:77

Version information if available

***

### ExtractTextOptions

Defined in: [packages/pdf/src/shared/types.ts:16](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L16)

Options for text extraction from PDF

#### Properties

##### includeMetadata?

> `optional` **includeMetadata**: `boolean`

Defined in: [packages/pdf/src/shared/types.ts:24](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L24)

Whether to include metadata in the extraction

##### mergePages?

> `optional` **mergePages**: `boolean`

Defined in: [packages/pdf/src/shared/types.ts:20](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L20)

Whether to merge all pages into a single string

##### pages?

> `optional` **pages**: `number`[]

Defined in: [packages/pdf/src/shared/types.ts:18](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L18)

Specific pages to extract (1-based indexing). If not provided, extracts all pages

##### preserveFormatting?

> `optional` **preserveFormatting**: `boolean`

Defined in: [packages/pdf/src/shared/types.ts:22](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L22)

Whether to preserve original formatting

##### skipOCRFallback?

> `optional` **skipOCRFallback**: `boolean`

Defined in: [packages/pdf/src/shared/types.ts:26](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L26)

Whether to skip OCR fallback when direct text extraction fails

***

### OCRFactoryOptions

Defined in: packages/ocr/dist/shared/types.d.ts:128

OCR factory configuration options

#### Properties

##### defaultOptions?

> `optional` **defaultOptions**: [`OCROptions`](#ocroptions)

Defined in: packages/ocr/dist/shared/types.d.ts:134

Default options for OCR operations

##### fallbackProviders?

> `optional` **fallbackProviders**: `string`[]

Defined in: packages/ocr/dist/shared/types.d.ts:132

Fallback providers to try if primary fails

##### provider?

> `optional` **provider**: `string`

Defined in: packages/ocr/dist/shared/types.d.ts:130

Primary provider to use ('auto', 'tesseract', 'onnx')

##### providerConfig?

> `optional` **providerConfig**: `Record`\<`string`, `any`\>

Defined in: packages/ocr/dist/shared/types.d.ts:136

Provider-specific configuration

***

### OCROptions

Defined in: packages/ocr/dist/shared/types.d.ts:7

Options for OCR processing

#### Properties

##### confidenceThreshold?

> `optional` **confidenceThreshold**: `number`

Defined in: packages/ocr/dist/shared/types.d.ts:15

Confidence threshold for OCR results (0-100)

##### improveResolution?

> `optional` **improveResolution**: `boolean`

Defined in: packages/ocr/dist/shared/types.d.ts:11

Whether to enhance image resolution before OCR

##### language?

> `optional` **language**: `string`

Defined in: packages/ocr/dist/shared/types.d.ts:9

Language for OCR recognition (default: 'eng')

##### outputFormat?

> `optional` **outputFormat**: `"text"` \| `"json"` \| `"hocr"`

Defined in: packages/ocr/dist/shared/types.d.ts:13

Output format for OCR results

##### timeout?

> `optional` **timeout**: `number`

Defined in: packages/ocr/dist/shared/types.d.ts:17

Timeout in milliseconds for OCR processing

***

### OCRProvider

Defined in: packages/ocr/dist/shared/types.d.ts:101

Core OCR provider interface

#### Properties

##### name

> `readonly` **name**: `string`

Defined in: packages/ocr/dist/shared/types.d.ts:103

Provider name identifier

#### Methods

##### checkCapabilities()

> **checkCapabilities**(): `Promise`\<`OCRCapabilities`\>

Defined in: packages/ocr/dist/shared/types.d.ts:115

Get provider capabilities

###### Returns

`Promise`\<`OCRCapabilities`\>

##### checkDependencies()

> **checkDependencies**(): `Promise`\<[`DependencyCheckResult`](#dependencycheckresult)\>

Defined in: packages/ocr/dist/shared/types.d.ts:111

Check if provider dependencies are available

###### Returns

`Promise`\<[`DependencyCheckResult`](#dependencycheckresult)\>

##### cleanup()?

> `optional` **cleanup**(): `Promise`\<`void`\>

Defined in: packages/ocr/dist/shared/types.d.ts:123

Clean up provider resources (optional)

###### Returns

`Promise`\<`void`\>

##### getSupportedLanguages()

> **getSupportedLanguages**(): `string`[]

Defined in: packages/ocr/dist/shared/types.d.ts:119

Get supported languages

###### Returns

`string`[]

##### performOCR()

> **performOCR**(`images`, `options?`): `Promise`\<[`OCRResult`](#ocrresult)\>

Defined in: packages/ocr/dist/shared/types.d.ts:107

Perform OCR on image data

###### Parameters

###### images

`OCRImage`[]

###### options?

[`OCROptions`](#ocroptions)

###### Returns

`Promise`\<[`OCRResult`](#ocrresult)\>

***

### OCRResult

Defined in: packages/ocr/dist/shared/types.d.ts:39

OCR result with confidence information

#### Properties

##### confidence

> **confidence**: `number`

Defined in: packages/ocr/dist/shared/types.d.ts:43

Overall confidence score (0-100)

##### detections?

> `optional` **detections**: `object`[]

Defined in: packages/ocr/dist/shared/types.d.ts:45

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

Defined in: packages/ocr/dist/shared/types.d.ts:56

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

Defined in: packages/ocr/dist/shared/types.d.ts:41

Extracted text

***

### PDFCapabilities

Defined in: [packages/pdf/src/shared/types.ts:74](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L74)

PDF processing capabilities of a provider

#### Properties

##### canExtractImages

> **canExtractImages**: `boolean`

Defined in: [packages/pdf/src/shared/types.ts:80](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L80)

Whether the provider can extract images

##### canExtractMetadata

> **canExtractMetadata**: `boolean`

Defined in: [packages/pdf/src/shared/types.ts:78](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L78)

Whether the provider can extract metadata

##### canExtractText

> **canExtractText**: `boolean`

Defined in: [packages/pdf/src/shared/types.ts:76](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L76)

Whether the provider can extract text

##### canPerformOCR

> **canPerformOCR**: `boolean`

Defined in: [packages/pdf/src/shared/types.ts:82](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L82)

Whether the provider supports OCR

##### maxFileSize?

> `optional` **maxFileSize**: `number`

Defined in: [packages/pdf/src/shared/types.ts:86](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L86)

Maximum file size supported (in bytes)

##### ocrLanguages?

> `optional` **ocrLanguages**: `string`[]

Defined in: [packages/pdf/src/shared/types.ts:88](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L88)

Available OCR languages

##### supportedFormats

> **supportedFormats**: `string`[]

Defined in: [packages/pdf/src/shared/types.ts:84](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L84)

Supported input formats

***

### PDFImage

Defined in: [packages/pdf/src/shared/types.ts:63](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L63)

PDF image data that can be used for OCR processing

#### Extends

- `OCRImage`

#### Properties

##### channels?

> `optional` **channels**: `number`

Defined in: packages/ocr/dist/shared/types.d.ts:30

Number of color channels

###### Inherited from

`BaseOCRImage.channels`

##### data

> **data**: `string` \| `Uint8Array`\<`ArrayBufferLike`\> \| `Buffer`\<`ArrayBufferLike`\>

Defined in: packages/ocr/dist/shared/types.d.ts:24

Image data as Buffer, Uint8Array, or string (base64/path)

###### Inherited from

`BaseOCRImage.data`

##### format?

> `optional` **format**: `string`

Defined in: packages/ocr/dist/shared/types.d.ts:32

Image format/type

###### Inherited from

`BaseOCRImage.format`

##### height?

> `optional` **height**: `number`

Defined in: packages/ocr/dist/shared/types.d.ts:28

Image height in pixels

###### Inherited from

`BaseOCRImage.height`

##### metadata?

> `optional` **metadata**: `Record`\<`string`, `any`\>

Defined in: packages/ocr/dist/shared/types.d.ts:34

Optional metadata for tracking

###### Inherited from

`BaseOCRImage.metadata`

##### pageNumber?

> `optional` **pageNumber**: `number`

Defined in: [packages/pdf/src/shared/types.ts:65](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L65)

Page number where the image was found (1-based)

##### width?

> `optional` **width**: `number`

Defined in: packages/ocr/dist/shared/types.d.ts:26

Image width in pixels

###### Inherited from

`BaseOCRImage.width`

***

### PDFInfo

Defined in: [packages/pdf/src/shared/types.ts:205](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L205)

Quick PDF document information without expensive processing

#### Properties

##### author?

> `optional` **author**: `string`

Defined in: [packages/pdf/src/shared/types.ts:238](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L238)

Document author

##### creationDate?

> `optional` **creationDate**: `Date`

Defined in: [packages/pdf/src/shared/types.ts:240](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L240)

Document creation date

##### creator?

> `optional` **creator**: `string`

Defined in: [packages/pdf/src/shared/types.ts:242](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L242)

Document creator application

##### encrypted

> **encrypted**: `boolean`

Defined in: [packages/pdf/src/shared/types.ts:213](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L213)

Whether the document is encrypted/password protected

##### estimatedProcessingTime?

> `optional` **estimatedProcessingTime**: `object`

Defined in: [packages/pdf/src/shared/types.ts:228](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L228)

Performance estimates for different operations

###### ocrProcessing?

> `optional` **ocrProcessing**: `"fast"` \| `"medium"` \| `"slow"`

Expected time category for OCR processing (if needed)

###### textExtraction

> **textExtraction**: `"fast"` \| `"medium"` \| `"slow"`

Expected time category for text extraction

##### estimatedTextLength?

> `optional` **estimatedTextLength**: `number`

Defined in: [packages/pdf/src/shared/types.ts:220](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L220)

Rough estimate of text content length (without full extraction)

##### fileSize?

> `optional` **fileSize**: `number`

Defined in: [packages/pdf/src/shared/types.ts:209](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L209)

File size in bytes (if available)

##### hasEmbeddedText

> **hasEmbeddedText**: `boolean`

Defined in: [packages/pdf/src/shared/types.ts:216](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L216)

Whether the PDF contains extractable text content

##### hasImages

> **hasImages**: `boolean`

Defined in: [packages/pdf/src/shared/types.ts:218](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L218)

Whether the PDF contains images

##### ocrRequired

> **ocrRequired**: `boolean`

Defined in: [packages/pdf/src/shared/types.ts:225](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L225)

True if OCR will definitely be required for text extraction

##### pageCount

> **pageCount**: `number`

Defined in: [packages/pdf/src/shared/types.ts:207](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L207)

Number of pages in the document

##### producer?

> `optional` **producer**: `string`

Defined in: [packages/pdf/src/shared/types.ts:244](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L244)

Document producer

##### recommendedStrategy

> **recommendedStrategy**: `"text"` \| `"ocr"` \| `"hybrid"`

Defined in: [packages/pdf/src/shared/types.ts:223](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L223)

Recommended processing strategy based on document analysis

##### title?

> `optional` **title**: `string`

Defined in: [packages/pdf/src/shared/types.ts:236](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L236)

Basic metadata (lightweight extraction)

##### version?

> `optional` **version**: `string`

Defined in: [packages/pdf/src/shared/types.ts:211](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L211)

PDF version string

***

### PDFMetadata

Defined in: [packages/pdf/src/shared/types.ts:35](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L35)

PDF metadata information

#### Properties

##### author?

> `optional` **author**: `string`

Defined in: [packages/pdf/src/shared/types.ts:39](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L39)

Document author

##### creationDate?

> `optional` **creationDate**: `Date`

Defined in: [packages/pdf/src/shared/types.ts:45](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L45)

Creation date

##### creator?

> `optional` **creator**: `string`

Defined in: [packages/pdf/src/shared/types.ts:53](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L53)

Document creator application

##### encrypted?

> `optional` **encrypted**: `boolean`

Defined in: [packages/pdf/src/shared/types.ts:57](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L57)

Whether the document is encrypted

##### keywords?

> `optional` **keywords**: `string`

Defined in: [packages/pdf/src/shared/types.ts:43](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L43)

Document keywords

##### modificationDate?

> `optional` **modificationDate**: `Date`

Defined in: [packages/pdf/src/shared/types.ts:47](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L47)

Modification date

##### pageCount

> **pageCount**: `number`

Defined in: [packages/pdf/src/shared/types.ts:51](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L51)

Number of pages

##### producer?

> `optional` **producer**: `string`

Defined in: [packages/pdf/src/shared/types.ts:55](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L55)

Document producer

##### subject?

> `optional` **subject**: `string`

Defined in: [packages/pdf/src/shared/types.ts:41](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L41)

Document subject

##### title?

> `optional` **title**: `string`

Defined in: [packages/pdf/src/shared/types.ts:37](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L37)

Document title

##### version?

> `optional` **version**: `string`

Defined in: [packages/pdf/src/shared/types.ts:49](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L49)

PDF version

***

### PDFReader

Defined in: [packages/pdf/src/shared/types.ts:117](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L117)

Main PDF reader interface that all providers must implement

#### Methods

##### checkCapabilities()

> **checkCapabilities**(): `Promise`\<[`PDFCapabilities`](#pdfcapabilities)\>

Defined in: [packages/pdf/src/shared/types.ts:155](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L155)

Check the capabilities of this PDF reader

###### Returns

`Promise`\<[`PDFCapabilities`](#pdfcapabilities)\>

Promise resolving to capability information

##### checkDependencies()

> **checkDependencies**(): `Promise`\<[`DependencyCheckResult`](#dependencycheckresult)\>

Defined in: [packages/pdf/src/shared/types.ts:161](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L161)

Check if dependencies for this reader are available

###### Returns

`Promise`\<[`DependencyCheckResult`](#dependencycheckresult)\>

Promise resolving to dependency check result

##### extractImages()

> **extractImages**(`source`): `Promise`\<[`PDFImage`](#pdfimage)[]\>

Defined in: [packages/pdf/src/shared/types.ts:141](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L141)

Extract images from a PDF

###### Parameters

###### source

PDF file path, ArrayBuffer, or Uint8Array

`string` | `ArrayBuffer` | `Uint8Array`\<`ArrayBufferLike`\>

###### Returns

`Promise`\<[`PDFImage`](#pdfimage)[]\>

Promise resolving to array of extracted images

##### extractMetadata()

> **extractMetadata**(`source`): `Promise`\<[`PDFMetadata`](#pdfmetadata)\>

Defined in: [packages/pdf/src/shared/types.ts:134](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L134)

Extract metadata from a PDF

###### Parameters

###### source

PDF file path, ArrayBuffer, or Uint8Array

`string` | `ArrayBuffer` | `Uint8Array`\<`ArrayBufferLike`\>

###### Returns

`Promise`\<[`PDFMetadata`](#pdfmetadata)\>

Promise resolving to PDF metadata

##### extractText()

> **extractText**(`source`, `options?`): `Promise`\<`null` \| `string`\>

Defined in: [packages/pdf/src/shared/types.ts:124](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L124)

Extract text content from a PDF

###### Parameters

###### source

PDF file path, Buffer, or Uint8Array

`string` | `ArrayBuffer` | `Uint8Array`\<`ArrayBufferLike`\>

###### options?

[`ExtractTextOptions`](#extracttextoptions)

Text extraction options

###### Returns

`Promise`\<`null` \| `string`\>

Promise resolving to extracted text or null if extraction fails

##### getInfo()

> **getInfo**(`source`): `Promise`\<[`PDFInfo`](#pdfinfo)\>

Defined in: [packages/pdf/src/shared/types.ts:168](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L168)

Get quick information about a PDF without expensive processing

###### Parameters

###### source

PDF file path, ArrayBuffer, or Uint8Array

`string` | `ArrayBuffer` | `Uint8Array`\<`ArrayBufferLike`\>

###### Returns

`Promise`\<[`PDFInfo`](#pdfinfo)\>

Promise resolving to PDF document information

##### performOCR()

> **performOCR**(`images`, `options?`): `Promise`\<[`OCRResult`](#ocrresult)\>

Defined in: [packages/pdf/src/shared/types.ts:149](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L149)

Perform OCR on image data

###### Parameters

###### images

[`PDFImage`](#pdfimage)[]

Array of image data to process

###### options?

[`OCROptions`](#ocroptions)

OCR processing options

###### Returns

`Promise`\<[`OCRResult`](#ocrresult)\>

Promise resolving to OCR result

***

### PDFReaderOptions

Defined in: [packages/pdf/src/shared/types.ts:94](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L94)

Options for creating a PDF reader

#### Properties

##### defaultOCROptions?

> `optional` **defaultOCROptions**: [`OCROptions`](#ocroptions)

Defined in: [packages/pdf/src/shared/types.ts:100](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L100)

Default OCR options

##### enableOCR?

> `optional` **enableOCR**: `boolean`

Defined in: [packages/pdf/src/shared/types.ts:98](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L98)

Whether to enable OCR fallback for image-based PDFs

##### maxFileSize?

> `optional` **maxFileSize**: `number`

Defined in: [packages/pdf/src/shared/types.ts:102](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L102)

Maximum file size to process (in bytes)

##### provider?

> `optional` **provider**: `"unpdf"` \| `"pdfjs"` \| `"auto"`

Defined in: [packages/pdf/src/shared/types.ts:96](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L96)

Preferred provider type

##### timeout?

> `optional` **timeout**: `number`

Defined in: [packages/pdf/src/shared/types.ts:104](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L104)

Timeout for processing operations (in milliseconds)

## Type Aliases

### PDFSource

> **PDFSource** = `string` \| `ArrayBuffer` \| `Uint8Array`

Defined in: [packages/pdf/src/shared/types.ts:174](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/types.ts#L174)

Input source type for PDF operations

## Functions

### ~~checkOCRDependencies()~~

> **checkOCRDependencies**(): `Promise`\<[`DependencyCheckResult`](#dependencycheckresult)\>

Defined in: [packages/pdf/src/index.ts:51](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/index.ts#L51)

Check if OCR dependencies are available (legacy compatibility)

#### Returns

`Promise`\<[`DependencyCheckResult`](#dependencycheckresult)\>

#### Deprecated

Use getPDFReader().checkDependencies() instead

***

### ~~extractImagesFromPDF()~~

> **extractImagesFromPDF**(`pdfPath`): `Promise`\<`null` \| `any`[]\>

Defined in: [packages/pdf/src/index.ts:31](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/index.ts#L31)

Extract images from all pages of a PDF file (legacy compatibility)

#### Parameters

##### pdfPath

`string`

#### Returns

`Promise`\<`null` \| `any`[]\>

#### Deprecated

Use getPDFReader().extractImages() instead

***

### ~~extractTextFromPDF()~~

> **extractTextFromPDF**(`pdfPath`): `Promise`\<`null` \| `string`\>

Defined in: [packages/pdf/src/index.ts:22](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/index.ts#L22)

Extract text from a PDF file (legacy compatibility)

#### Parameters

##### pdfPath

`string`

#### Returns

`Promise`\<`null` \| `string`\>

#### Deprecated

Use getPDFReader().extractText() instead

***

### getAvailableProviders()

> **getAvailableProviders**(): `string`[]

Defined in: [packages/pdf/src/shared/factory.ts:83](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/factory.ts#L83)

Get available PDF providers in the current environment

#### Returns

`string`[]

Array of available provider names

***

### getPDFReader()

> **getPDFReader**(`options`): `Promise`\<[`PDFReader`](#pdfreader)\>

Defined in: [packages/pdf/src/shared/factory.ts:29](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/factory.ts#L29)

Get a PDF reader instance with automatic provider selection based on environment

#### Parameters

##### options

[`PDFReaderOptions`](#pdfreaderoptions) = `{}`

Configuration options for the PDF reader

#### Returns

`Promise`\<[`PDFReader`](#pdfreader)\>

Promise resolving to a PDFReader instance

#### Example

```typescript
// Get default reader (auto-detects environment)
const reader = await getPDFReader();

// Get reader with specific options
const reader = await getPDFReader({
  provider: 'unpdf',
  enableOCR: true,
  timeout: 30000
});

// Extract text from a PDF
const text = await reader.extractText('/path/to/document.pdf');
```

***

### getProviderInfo()

> **getProviderInfo**(`provider`): `Promise`\<\{ `available`: `boolean`; `capabilities`: [`PDFCapabilities`](#pdfcapabilities); `dependencies`: [`DependencyCheckResult`](#dependencycheckresult); `error?`: `undefined`; `provider`: `string`; \} \| \{ `available`: `boolean`; `capabilities`: `null`; `dependencies`: `null`; `error`: `string`; `provider`: `string`; \}\>

Defined in: [packages/pdf/src/shared/factory.ts:119](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/factory.ts#L119)

Get information about a specific provider

#### Parameters

##### provider

`string`

Provider name

#### Returns

`Promise`\<\{ `available`: `boolean`; `capabilities`: [`PDFCapabilities`](#pdfcapabilities); `dependencies`: [`DependencyCheckResult`](#dependencycheckresult); `error?`: `undefined`; `provider`: `string`; \} \| \{ `available`: `boolean`; `capabilities`: `null`; `dependencies`: `null`; `error`: `string`; `provider`: `string`; \}\>

Promise resolving to provider capabilities and dependency status

***

### initializeProviders()

> **initializeProviders**(): `Promise`\<`void`\>

Defined in: [packages/pdf/src/shared/factory.ts:148](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/factory.ts#L148)

Initialize PDF readers and check dependencies
Called automatically when the module is imported

#### Returns

`Promise`\<`void`\>

***

### isProviderAvailable()

> **isProviderAvailable**(`provider`): `boolean`

Defined in: [packages/pdf/src/shared/factory.ts:109](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/shared/factory.ts#L109)

Check if a specific provider is available in the current environment

#### Parameters

##### provider

`string`

Provider name to check

#### Returns

`boolean`

Boolean indicating if the provider is available

***

### ~~performOCROnImages()~~

> **performOCROnImages**(`images`): `Promise`\<`string`\>

Defined in: [packages/pdf/src/index.ts:41](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/pdf/src/index.ts#L41)

Perform OCR on image data (legacy compatibility)

#### Parameters

##### images

`any`[]

#### Returns

`Promise`\<`string`\>

#### Deprecated

Use getPDFReader().performOCR() instead
