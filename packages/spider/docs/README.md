# @have/spider

## Variables

### default

> **default**: `object`

Defined in: [index.ts:224](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/spider/src/index.ts#L224)

#### Type declaration

##### createWindow()

> **createWindow**: () => `Window`

Creates a new happy-dom window instance for DOM manipulation

###### Returns

`Window`

A new Window instance

##### fetchPageSource()

> **fetchPageSource**: (`options`) => `Promise`\<`string`\>

Fetches the HTML source of a web page using either a simple HTTP request or DOM processing

###### Parameters

###### options

`FetchPageSourceOptions`

Configuration options for the fetch operation

###### Returns

`Promise`\<`string`\>

Promise resolving to the HTML content of the page

###### Throws

if the URL is invalid

###### Throws

if there are network-related failures

##### parseIndexSource()

> **parseIndexSource**: (`indexSource`) => `Promise`\<`string`[]\>

Parses an HTML page to extract links or content

###### Parameters

###### indexSource

`string`

HTML source to parse

###### Returns

`Promise`\<`string`[]\>

Promise resolving to an array of URLs extracted from the page

###### Throws

if the HTML source is invalid

###### Throws

if HTML parsing fails

##### processHtml()

> **processHtml**: (`html`) => `Promise`\<`string`\>

Processes HTML content using happy-dom to ensure proper DOM structure

###### Parameters

###### html

`string`

HTML content to process

###### Returns

`Promise`\<`string`\>

Promise resolving to the processed HTML

###### Throws

if HTML processing fails

## Functions

### createWindow()

> **createWindow**(): `Window`

Defined in: [index.ts:195](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/spider/src/index.ts#L195)

Creates a new happy-dom window instance for DOM manipulation

#### Returns

`Window`

A new Window instance

***

### fetchPageSource()

> **fetchPageSource**(`options`): `Promise`\<`string`\>

Defined in: [index.ts:52](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/spider/src/index.ts#L52)

Fetches the HTML source of a web page using either a simple HTTP request or DOM processing

#### Parameters

##### options

`FetchPageSourceOptions`

Configuration options for the fetch operation

#### Returns

`Promise`\<`string`\>

Promise resolving to the HTML content of the page

#### Throws

if the URL is invalid

#### Throws

if there are network-related failures

***

### parseIndexSource()

> **parseIndexSource**(`indexSource`): `Promise`\<`string`[]\>

Defined in: [index.ts:156](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/spider/src/index.ts#L156)

Parses an HTML page to extract links or content

#### Parameters

##### indexSource

`string`

HTML source to parse

#### Returns

`Promise`\<`string`[]\>

Promise resolving to an array of URLs extracted from the page

#### Throws

if the HTML source is invalid

#### Throws

if HTML parsing fails

***

### processHtml()

> **processHtml**(`html`): `Promise`\<`string`\>

Defined in: [index.ts:206](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/spider/src/index.ts#L206)

Processes HTML content using happy-dom to ensure proper DOM structure

#### Parameters

##### html

`string`

HTML content to process

#### Returns

`Promise`\<`string`\>

Promise resolving to the processed HTML

#### Throws

if HTML processing fails
