# @have/ai

## Classes

### AIClient

Defined in: [packages/ai/src/shared/client.ts:194](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L194)

Base class for AI clients
Provides a common interface for different AI service providers

#### Extended by

- [`OpenAIClient`](#openaiclient)

#### Constructors

##### Constructor

> **new AIClient**(`options`): [`AIClient`](#aiclient)

Defined in: [packages/ai/src/shared/client.ts:205](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L205)

Creates a new AIClient

###### Parameters

###### options

[`AIClientOptions`](#aiclientoptions-1)

Client configuration options

###### Returns

[`AIClient`](#aiclient)

#### Properties

##### options

> **options**: [`AIClientOptions`](#aiclientoptions-1)

Defined in: [packages/ai/src/shared/client.ts:198](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L198)

Configuration options for this client

#### Methods

##### message()

> **message**(`text`, `options`): `Promise`\<`string`\>

Defined in: [packages/ai/src/shared/client.ts:217](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L217)

Sends a message to the AI
Base implementation returns a placeholder response

###### Parameters

###### text

`string`

Message text

###### options

[`AITextCompletionOptions`](#aitextcompletionoptions) = `...`

Message options

###### Returns

`Promise`\<`string`\>

Promise resolving to a placeholder response

##### textCompletion()

> **textCompletion**(`text`, `options`): `Promise`\<`string`\>

Defined in: [packages/ai/src/shared/client.ts:251](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L251)

Gets a text completion from the AI
In base class, delegates to message method

###### Parameters

###### text

`string`

Input text for completion

###### options

[`AITextCompletionOptions`](#aitextcompletionoptions) = `...`

Completion options

###### Returns

`Promise`\<`string`\>

Promise resolving to the completion result

##### create()

> `static` **create**\<`T`\>(`options`): `Promise`\<[`AIClient`](#aiclient) \| [`OpenAIClient`](#openaiclient)\>

Defined in: [packages/ai/src/shared/client.ts:231](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L231)

Factory method to create appropriate AI client based on options

###### Type Parameters

###### T

`T` *extends* [`AIClientOptions`](#aiclientoptions-1)

###### Parameters

###### options

`T`

Client configuration options

###### Returns

`Promise`\<[`AIClient`](#aiclient) \| [`OpenAIClient`](#openaiclient)\>

Promise resolving to an initialized AI client

###### Throws

Error if client type is invalid

***

### AIError

Defined in: [packages/ai/src/shared/types.ts:545](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L545)

Error types for AI operations

#### Extends

- `Error`

#### Extended by

- [`AuthenticationError`](#authenticationerror)
- [`RateLimitError`](#ratelimiterror)
- [`ModelNotFoundError`](#modelnotfounderror)
- [`ContextLengthError`](#contextlengtherror)
- [`ContentFilterError`](#contentfiltererror)

#### Constructors

##### Constructor

> **new AIError**(`message`, `code`, `provider?`, `model?`): [`AIError`](#aierror)

Defined in: [packages/ai/src/shared/types.ts:546](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L546)

###### Parameters

###### message

`string`

###### code

`string`

###### provider?

`string`

###### model?

`string`

###### Returns

[`AIError`](#aierror)

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

Defined in: [packages/ai/src/shared/types.ts:548](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L548)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

`Error.message`

##### model?

> `optional` **model**: `string`

Defined in: [packages/ai/src/shared/types.ts:550](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L550)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

`Error.name`

##### provider?

> `optional` **provider**: `string`

Defined in: [packages/ai/src/shared/types.ts:549](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L549)

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

### AIMessageClass

Defined in: [packages/ai/src/shared/message.ts:21](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/message.ts#L21)

Represents a message in an AI conversation

#### Constructors

##### Constructor

> **new AIMessageClass**(`options`): [`AIMessageClass`](#aimessageclass)

Defined in: [packages/ai/src/shared/message.ts:50](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/message.ts#L50)

Creates a new AI message

###### Parameters

###### options

Message configuration

###### content

`string`

Content of the message

###### name

`string`

Name of the message sender

###### role

`"system"` \| `"user"` \| `"assistant"`

Role of the message sender

###### Returns

[`AIMessageClass`](#aimessageclass)

#### Properties

##### content

> **content**: `string`

Defined in: [packages/ai/src/shared/message.ts:35](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/message.ts#L35)

Content of the message

##### name

> **name**: `string`

Defined in: [packages/ai/src/shared/message.ts:30](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/message.ts#L30)

Name of the message sender

##### options

> `protected` **options**: `object`

Defined in: [packages/ai/src/shared/message.ts:25](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/message.ts#L25)

Original options used to create this message

###### content

> **content**: `string`

###### name

> **name**: `string`

###### role

> **role**: `"system"` \| `"user"` \| `"assistant"`

##### role

> **role**: `"system"` \| `"user"` \| `"assistant"`

Defined in: [packages/ai/src/shared/message.ts:40](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/message.ts#L40)

Role of the message sender in the conversation

#### Methods

##### create()

> `static` **create**(`options`): `Promise`\<[`AIMessageClass`](#aimessageclass)\>

Defined in: [packages/ai/src/shared/message.ts:71](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/message.ts#L71)

Factory method to create a new AI message

###### Parameters

###### options

Message configuration

###### content

`string`

Content of the message

###### name

`string`

Name of the message sender

###### role

`"system"` \| `"user"` \| `"assistant"`

Role of the message sender

###### thread

[`AIThread`](#aithread)

Thread this message belongs to

###### Returns

`Promise`\<[`AIMessageClass`](#aimessageclass)\>

Promise resolving to a new AIMessage instance

***

### AIThread

Defined in: [packages/ai/src/shared/thread.ts:19](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/thread.ts#L19)

Represents a conversation thread with an AI model
Manages messages, references, and conversation state

#### Constructors

##### Constructor

> **new AIThread**(`options`): [`AIThread`](#aithread)

Defined in: [packages/ai/src/shared/thread.ts:45](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/thread.ts#L45)

Creates a new AI thread

###### Parameters

###### options

[`AIThreadOptions`](#aithreadoptions-1)

Thread configuration options

###### Returns

[`AIThread`](#aithread)

#### Properties

##### ai

> `protected` **ai**: [`AIClient`](#aiclient)

Defined in: [packages/ai/src/shared/thread.ts:23](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/thread.ts#L23)

AI client instance for this thread

##### options

> `protected` **options**: [`AIThreadOptions`](#aithreadoptions-1)

Defined in: [packages/ai/src/shared/thread.ts:28](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/thread.ts#L28)

Options used to configure this thread

#### Methods

##### add()

> **add**(`options`): `Promise`\<[`AIMessageClass`](#aimessageclass)\>

Defined in: [packages/ai/src/shared/thread.ts:95](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/thread.ts#L95)

Adds a message to the conversation

###### Parameters

###### options

Message options

###### content

`string`

Content of the message

###### name?

`string`

Optional name of the message sender

###### role

`"system"` \| `"user"` \| `"assistant"`

Role of the message sender

###### Returns

`Promise`\<[`AIMessageClass`](#aimessageclass)\>

Promise resolving to the created AIMessage

##### addReference()

> **addReference**(`name`, `body`): `void`

Defined in: [packages/ai/src/shared/thread.ts:126](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/thread.ts#L126)

Adds a reference to be included in the conversation context

###### Parameters

###### name

`string`

Name of the reference

###### body

`string`

Content of the reference

###### Returns

`void`

##### addSystem()

> **addSystem**(`prompt`): `Promise`\<[`AIMessageClass`](#aimessageclass)\>

Defined in: [packages/ai/src/shared/thread.ts:74](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/thread.ts#L74)

Adds a system message to the conversation

###### Parameters

###### prompt

`string`

System message content

###### Returns

`Promise`\<[`AIMessageClass`](#aimessageclass)\>

Promise resolving to the created AIMessage

##### assembleHistory()

> **assembleHistory**(): `ChatCompletionMessageParam`[]

Defined in: [packages/ai/src/shared/thread.ts:136](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/thread.ts#L136)

Assembles the conversation history for sending to the AI
Properly orders system message, references, and conversation messages

###### Returns

`ChatCompletionMessageParam`[]

Array of message parameters formatted for the OpenAI API

##### do()

> **do**(`prompt`, `options`): `Promise`\<`string`\>

Defined in: [packages/ai/src/shared/thread.ts:174](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/thread.ts#L174)

Sends a prompt to the AI and gets a response

###### Parameters

###### prompt

`string`

Prompt message to send

###### options

Options for the AI response

###### responseFormat?

`"text"` \| `"html"` \| `"json"`

Format for the AI to respond with

###### Returns

`Promise`\<`string`\>

Promise resolving to the AI response

##### get()

> **get**(): [`AIMessageClass`](#aimessageclass)[]

Defined in: [packages/ai/src/shared/thread.ts:116](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/thread.ts#L116)

Gets all messages in this thread

###### Returns

[`AIMessageClass`](#aimessageclass)[]

Array of AIMessage objects

##### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [packages/ai/src/shared/thread.ts:64](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/thread.ts#L64)

Initializes the AI client for this thread

###### Returns

`Promise`\<`void`\>

##### create()

> `static` **create**(`options`): `Promise`\<[`AIThread`](#aithread)\>

Defined in: [packages/ai/src/shared/thread.ts:55](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/thread.ts#L55)

Factory method to create and initialize a new AI thread

###### Parameters

###### options

[`AIThreadOptions`](#aithreadoptions-1)

Thread configuration options

###### Returns

`Promise`\<[`AIThread`](#aithread)\>

Promise resolving to an initialized AIThread

***

### AuthenticationError

Defined in: [packages/ai/src/shared/types.ts:557](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L557)

Error types for AI operations

#### Extends

- [`AIError`](#aierror)

#### Constructors

##### Constructor

> **new AuthenticationError**(`provider?`): [`AuthenticationError`](#authenticationerror)

Defined in: [packages/ai/src/shared/types.ts:558](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L558)

###### Parameters

###### provider?

`string`

###### Returns

[`AuthenticationError`](#authenticationerror)

###### Overrides

[`AIError`](#aierror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`AIError`](#aierror).[`cause`](#cause)

##### code

> **code**: `string`

Defined in: [packages/ai/src/shared/types.ts:548](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L548)

###### Inherited from

[`AIError`](#aierror).[`code`](#code)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`AIError`](#aierror).[`message`](#message-2)

##### model?

> `optional` **model**: `string`

Defined in: [packages/ai/src/shared/types.ts:550](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L550)

###### Inherited from

[`AIError`](#aierror).[`model`](#model)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`AIError`](#aierror).[`name`](#name)

##### provider?

> `optional` **provider**: `string`

Defined in: [packages/ai/src/shared/types.ts:549](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L549)

###### Inherited from

[`AIError`](#aierror).[`provider`](#provider)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`AIError`](#aierror).[`stack`](#stack)

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

[`AIError`](#aierror).[`prepareStackTrace`](#preparestacktrace)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`AIError`](#aierror).[`stackTraceLimit`](#stacktracelimit)

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

[`AIError`](#aierror).[`captureStackTrace`](#capturestacktrace)

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

[`AIError`](#aierror).[`captureStackTrace`](#capturestacktrace)

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

[`AIError`](#aierror).[`isError`](#iserror)

***

### ContentFilterError

Defined in: [packages/ai/src/shared/types.ts:585](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L585)

Error types for AI operations

#### Extends

- [`AIError`](#aierror)

#### Constructors

##### Constructor

> **new ContentFilterError**(`provider?`, `model?`): [`ContentFilterError`](#contentfiltererror)

Defined in: [packages/ai/src/shared/types.ts:586](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L586)

###### Parameters

###### provider?

`string`

###### model?

`string`

###### Returns

[`ContentFilterError`](#contentfiltererror)

###### Overrides

[`AIError`](#aierror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`AIError`](#aierror).[`cause`](#cause)

##### code

> **code**: `string`

Defined in: [packages/ai/src/shared/types.ts:548](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L548)

###### Inherited from

[`AIError`](#aierror).[`code`](#code)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`AIError`](#aierror).[`message`](#message-2)

##### model?

> `optional` **model**: `string`

Defined in: [packages/ai/src/shared/types.ts:550](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L550)

###### Inherited from

[`AIError`](#aierror).[`model`](#model)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`AIError`](#aierror).[`name`](#name)

##### provider?

> `optional` **provider**: `string`

Defined in: [packages/ai/src/shared/types.ts:549](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L549)

###### Inherited from

[`AIError`](#aierror).[`provider`](#provider)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`AIError`](#aierror).[`stack`](#stack)

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

[`AIError`](#aierror).[`prepareStackTrace`](#preparestacktrace)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`AIError`](#aierror).[`stackTraceLimit`](#stacktracelimit)

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

[`AIError`](#aierror).[`captureStackTrace`](#capturestacktrace)

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

[`AIError`](#aierror).[`captureStackTrace`](#capturestacktrace)

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

[`AIError`](#aierror).[`isError`](#iserror)

***

### ContextLengthError

Defined in: [packages/ai/src/shared/types.ts:578](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L578)

Error types for AI operations

#### Extends

- [`AIError`](#aierror)

#### Constructors

##### Constructor

> **new ContextLengthError**(`provider?`, `model?`): [`ContextLengthError`](#contextlengtherror)

Defined in: [packages/ai/src/shared/types.ts:579](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L579)

###### Parameters

###### provider?

`string`

###### model?

`string`

###### Returns

[`ContextLengthError`](#contextlengtherror)

###### Overrides

[`AIError`](#aierror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`AIError`](#aierror).[`cause`](#cause)

##### code

> **code**: `string`

Defined in: [packages/ai/src/shared/types.ts:548](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L548)

###### Inherited from

[`AIError`](#aierror).[`code`](#code)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`AIError`](#aierror).[`message`](#message-2)

##### model?

> `optional` **model**: `string`

Defined in: [packages/ai/src/shared/types.ts:550](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L550)

###### Inherited from

[`AIError`](#aierror).[`model`](#model)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`AIError`](#aierror).[`name`](#name)

##### provider?

> `optional` **provider**: `string`

Defined in: [packages/ai/src/shared/types.ts:549](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L549)

###### Inherited from

[`AIError`](#aierror).[`provider`](#provider)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`AIError`](#aierror).[`stack`](#stack)

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

[`AIError`](#aierror).[`prepareStackTrace`](#preparestacktrace)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`AIError`](#aierror).[`stackTraceLimit`](#stacktracelimit)

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

[`AIError`](#aierror).[`captureStackTrace`](#capturestacktrace)

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

[`AIError`](#aierror).[`captureStackTrace`](#capturestacktrace)

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

[`AIError`](#aierror).[`isError`](#iserror)

***

### ModelNotFoundError

Defined in: [packages/ai/src/shared/types.ts:571](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L571)

Error types for AI operations

#### Extends

- [`AIError`](#aierror)

#### Constructors

##### Constructor

> **new ModelNotFoundError**(`model`, `provider?`): [`ModelNotFoundError`](#modelnotfounderror)

Defined in: [packages/ai/src/shared/types.ts:572](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L572)

###### Parameters

###### model

`string`

###### provider?

`string`

###### Returns

[`ModelNotFoundError`](#modelnotfounderror)

###### Overrides

[`AIError`](#aierror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`AIError`](#aierror).[`cause`](#cause)

##### code

> **code**: `string`

Defined in: [packages/ai/src/shared/types.ts:548](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L548)

###### Inherited from

[`AIError`](#aierror).[`code`](#code)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`AIError`](#aierror).[`message`](#message-2)

##### model?

> `optional` **model**: `string`

Defined in: [packages/ai/src/shared/types.ts:550](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L550)

###### Inherited from

[`AIError`](#aierror).[`model`](#model)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`AIError`](#aierror).[`name`](#name)

##### provider?

> `optional` **provider**: `string`

Defined in: [packages/ai/src/shared/types.ts:549](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L549)

###### Inherited from

[`AIError`](#aierror).[`provider`](#provider)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`AIError`](#aierror).[`stack`](#stack)

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

[`AIError`](#aierror).[`prepareStackTrace`](#preparestacktrace)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`AIError`](#aierror).[`stackTraceLimit`](#stacktracelimit)

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

[`AIError`](#aierror).[`captureStackTrace`](#capturestacktrace)

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

[`AIError`](#aierror).[`captureStackTrace`](#capturestacktrace)

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

[`AIError`](#aierror).[`isError`](#iserror)

***

### OpenAIClient

Defined in: [packages/ai/src/shared/client.ts:413](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L413)

Client implementation for the OpenAI API

#### Extends

- [`AIClient`](#aiclient)

#### Constructors

##### Constructor

> **new OpenAIClient**(`options`): [`OpenAIClient`](#openaiclient)

Defined in: [packages/ai/src/shared/client.ts:429](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L429)

Creates a new OpenAIClient

###### Parameters

###### options

[`OpenAIClientOptions`](#openaiclientoptions-1)

OpenAI client configuration options

###### Returns

[`OpenAIClient`](#openaiclient)

###### Overrides

[`AIClient`](#aiclient).[`constructor`](#constructor)

#### Properties

##### openai

> `protected` **openai**: `OpenAI`

Defined in: [packages/ai/src/shared/client.ts:417](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L417)

OpenAI client instance

##### options

> **options**: [`OpenAIClientOptions`](#openaiclientoptions-1)

Defined in: [packages/ai/src/shared/client.ts:422](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L422)

Configuration options for this client

###### Overrides

[`AIClient`](#aiclient).[`options`](#options)

#### Methods

##### initialize()

> `protected` **initialize**(): `Promise`\<`void`\>

Defined in: [packages/ai/src/shared/client.ts:466](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L466)

Initializes the OpenAI client

###### Returns

`Promise`\<`void`\>

##### message()

> **message**(`text`, `options`): `Promise`\<`string`\>

Defined in: [packages/ai/src/shared/client.ts:441](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L441)

Sends a message to OpenAI

###### Parameters

###### text

`string`

Message text

###### options

`AIMessageOptions` = `...`

Message options

###### Returns

`Promise`\<`string`\>

Promise resolving to the OpenAI response

###### Overrides

[`AIClient`](#aiclient).[`message`](#message)

##### textCompletion()

> **textCompletion**(`message`, `options`): `Promise`\<`string`\>

Defined in: [packages/ai/src/shared/client.ts:481](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L481)

Sends a text completion request to the OpenAI API

###### Parameters

###### message

`string`

The message to send

###### options

[`OpenAITextCompletionOptions`](#openaitextcompletionoptions) = `{}`

Configuration options for the completion request

###### Returns

`Promise`\<`string`\>

Promise resolving to the completion text

###### Throws

Error if the OpenAI API response is invalid

###### Overrides

[`AIClient`](#aiclient).[`textCompletion`](#textcompletion)

##### create()

> `static` **create**(`options`): `Promise`\<[`OpenAIClient`](#openaiclient)\>

Defined in: [packages/ai/src/shared/client.ts:455](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L455)

Factory method to create and initialize an OpenAIClient

###### Parameters

###### options

[`OpenAIClientOptions`](#openaiclientoptions-1)

OpenAI client configuration options

###### Returns

`Promise`\<[`OpenAIClient`](#openaiclient)\>

Promise resolving to an initialized OpenAIClient

###### Overrides

[`AIClient`](#aiclient).[`create`](#create)

***

### RateLimitError

Defined in: [packages/ai/src/shared/types.ts:564](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L564)

Error types for AI operations

#### Extends

- [`AIError`](#aierror)

#### Constructors

##### Constructor

> **new RateLimitError**(`provider?`, `retryAfter?`): [`RateLimitError`](#ratelimiterror)

Defined in: [packages/ai/src/shared/types.ts:565](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L565)

###### Parameters

###### provider?

`string`

###### retryAfter?

`number`

###### Returns

[`RateLimitError`](#ratelimiterror)

###### Overrides

[`AIError`](#aierror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`AIError`](#aierror).[`cause`](#cause)

##### code

> **code**: `string`

Defined in: [packages/ai/src/shared/types.ts:548](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L548)

###### Inherited from

[`AIError`](#aierror).[`code`](#code)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`AIError`](#aierror).[`message`](#message-2)

##### model?

> `optional` **model**: `string`

Defined in: [packages/ai/src/shared/types.ts:550](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L550)

###### Inherited from

[`AIError`](#aierror).[`model`](#model)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`AIError`](#aierror).[`name`](#name)

##### provider?

> `optional` **provider**: `string`

Defined in: [packages/ai/src/shared/types.ts:549](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L549)

###### Inherited from

[`AIError`](#aierror).[`provider`](#provider)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`AIError`](#aierror).[`stack`](#stack)

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

[`AIError`](#aierror).[`prepareStackTrace`](#preparestacktrace)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`AIError`](#aierror).[`stackTraceLimit`](#stacktracelimit)

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

[`AIError`](#aierror).[`captureStackTrace`](#capturestacktrace)

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

[`AIError`](#aierror).[`captureStackTrace`](#capturestacktrace)

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

[`AIError`](#aierror).[`isError`](#iserror)

## Interfaces

### AICapabilities

Defined in: [packages/ai/src/shared/types.ts:278](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L278)

AI provider capabilities

#### Properties

##### chat

> **chat**: `boolean`

Defined in: [packages/ai/src/shared/types.ts:282](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L282)

Whether the provider supports chat completions

##### completion

> **completion**: `boolean`

Defined in: [packages/ai/src/shared/types.ts:287](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L287)

Whether the provider supports text completions

##### embeddings

> **embeddings**: `boolean`

Defined in: [packages/ai/src/shared/types.ts:292](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L292)

Whether the provider supports embeddings

##### fineTuning

> **fineTuning**: `boolean`

Defined in: [packages/ai/src/shared/types.ts:312](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L312)

Whether the provider supports fine-tuning

##### functions

> **functions**: `boolean`

Defined in: [packages/ai/src/shared/types.ts:302](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L302)

Whether the provider supports function calling

##### maxContextLength

> **maxContextLength**: `number`

Defined in: [packages/ai/src/shared/types.ts:317](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L317)

Maximum context length supported

##### streaming

> **streaming**: `boolean`

Defined in: [packages/ai/src/shared/types.ts:297](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L297)

Whether the provider supports streaming

##### supportedOperations

> **supportedOperations**: `string`[]

Defined in: [packages/ai/src/shared/types.ts:322](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L322)

Supported operations

##### vision

> **vision**: `boolean`

Defined in: [packages/ai/src/shared/types.ts:307](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L307)

Whether the provider supports vision/multimodal

***

### AIClientInterface

Defined in: [packages/ai/src/shared/client.ts:35](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L35)

Interface defining required methods for AI clients

#### Properties

##### options

> **options**: [`AIClientOptions`](#aiclientoptions-1)

Defined in: [packages/ai/src/shared/client.ts:39](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L39)

Configuration options for this client

#### Methods

##### message()

> **message**(`text`, `options`): `Promise`\<`unknown`\>

Defined in: [packages/ai/src/shared/client.ts:48](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L48)

Sends a message to the AI and gets a response

###### Parameters

###### text

`string`

Message text

###### options

`AIMessageOptions`

Message options

###### Returns

`Promise`\<`unknown`\>

Promise resolving to the AI response

##### textCompletion()

> **textCompletion**(`text`, `options`): `Promise`\<`unknown`\>

Defined in: [packages/ai/src/shared/client.ts:57](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L57)

Gets a text completion from the AI

###### Parameters

###### text

`string`

Input text for completion

###### options

`AIMessageOptions`

Completion options

###### Returns

`Promise`\<`unknown`\>

Promise resolving to the completion result

***

### AIClientOptions

Defined in: [packages/ai/src/shared/client.ts:10](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L10)

Common options for AI client configuration

#### Extended by

- [`OpenAIClientOptions`](#openaiclientoptions-1)

#### Properties

##### apiKey?

> `optional` **apiKey**: `string`

Defined in: [packages/ai/src/shared/client.ts:24](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L24)

API key for authentication

##### baseUrl?

> `optional` **baseUrl**: `string`

Defined in: [packages/ai/src/shared/client.ts:29](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L29)

Base URL for API requests

##### responseFormat?

> `optional` **responseFormat**: `string`

Defined in: [packages/ai/src/shared/client.ts:19](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L19)

Response format for AI completions

##### type?

> `optional` **type**: `string`

Defined in: [packages/ai/src/shared/client.ts:14](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L14)

Type of AI client (e.g., 'openai')

***

### AIInterface

Defined in: [packages/ai/src/shared/types.ts:413](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L413)

Core AI interface that all providers must implement

#### Methods

##### chat()

> **chat**(`messages`, `options?`): `Promise`\<[`AIResponse`](#airesponse)\>

Defined in: [packages/ai/src/shared/types.ts:417](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L417)

Generate chat completion

###### Parameters

###### messages

[`AIMessage`](#aimessage)[]

###### options?

[`ChatOptions`](#chatoptions)

###### Returns

`Promise`\<[`AIResponse`](#airesponse)\>

##### complete()

> **complete**(`prompt`, `options?`): `Promise`\<[`AIResponse`](#airesponse)\>

Defined in: [packages/ai/src/shared/types.ts:422](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L422)

Generate text completion (for non-chat models)

###### Parameters

###### prompt

`string`

###### options?

[`CompletionOptions`](#completionoptions)

###### Returns

`Promise`\<[`AIResponse`](#airesponse)\>

##### countTokens()

> **countTokens**(`text`): `Promise`\<`number`\>

Defined in: [packages/ai/src/shared/types.ts:437](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L437)

Count tokens in text

###### Parameters

###### text

`string`

###### Returns

`Promise`\<`number`\>

##### embed()

> **embed**(`text`, `options?`): `Promise`\<[`EmbeddingResponse`](#embeddingresponse)\>

Defined in: [packages/ai/src/shared/types.ts:427](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L427)

Generate embeddings for text

###### Parameters

###### text

`string` | `string`[]

###### options?

[`EmbeddingOptions`](#embeddingoptions)

###### Returns

`Promise`\<[`EmbeddingResponse`](#embeddingresponse)\>

##### getCapabilities()

> **getCapabilities**(): `Promise`\<[`AICapabilities`](#aicapabilities)\>

Defined in: [packages/ai/src/shared/types.ts:447](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L447)

Get provider capabilities

###### Returns

`Promise`\<[`AICapabilities`](#aicapabilities)\>

##### getModels()

> **getModels**(): `Promise`\<[`AIModel`](#aimodel)[]\>

Defined in: [packages/ai/src/shared/types.ts:442](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L442)

Get available models

###### Returns

`Promise`\<[`AIModel`](#aimodel)[]\>

##### stream()

> **stream**(`messages`, `options?`): `AsyncIterable`\<`string`\>

Defined in: [packages/ai/src/shared/types.ts:432](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L432)

Stream chat completion

###### Parameters

###### messages

[`AIMessage`](#aimessage)[]

###### options?

[`ChatOptions`](#chatoptions)

###### Returns

`AsyncIterable`\<`string`\>

***

### AIMessage

Defined in: [packages/ai/src/shared/types.ts:8](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L8)

AI message structure for chat interactions

#### Properties

##### content

> **content**: `string`

Defined in: [packages/ai/src/shared/types.ts:17](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L17)

Content of the message

##### function\_call?

> `optional` **function\_call**: `object`

Defined in: [packages/ai/src/shared/types.ts:27](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L27)

Optional function call information

###### arguments

> **arguments**: `string`

###### name

> **name**: `string`

##### name?

> `optional` **name**: `string`

Defined in: [packages/ai/src/shared/types.ts:22](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L22)

Optional name for the message sender

##### role

> **role**: `"function"` \| `"system"` \| `"user"` \| `"assistant"` \| `"tool"`

Defined in: [packages/ai/src/shared/types.ts:12](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L12)

Role of the message sender

##### tool\_calls?

> `optional` **tool\_calls**: `object`[]

Defined in: [packages/ai/src/shared/types.ts:35](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L35)

Optional tool calls

###### function

> **function**: `object`

###### function.arguments

> **arguments**: `string`

###### function.name

> **name**: `string`

###### id

> **id**: `string`

###### type

> **type**: `"function"`

***

### AIModel

Defined in: [packages/ai/src/shared/types.ts:228](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L228)

Model information structure

#### Properties

##### capabilities

> **capabilities**: `string`[]

Defined in: [packages/ai/src/shared/types.ts:252](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L252)

Supported capabilities

##### contextLength

> **contextLength**: `number`

Defined in: [packages/ai/src/shared/types.ts:247](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L247)

Maximum context length in tokens

##### description?

> `optional` **description**: `string`

Defined in: [packages/ai/src/shared/types.ts:242](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L242)

Model description

##### id

> **id**: `string`

Defined in: [packages/ai/src/shared/types.ts:232](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L232)

Model identifier

##### inputCostPer1k?

> `optional` **inputCostPer1k**: `number`

Defined in: [packages/ai/src/shared/types.ts:267](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L267)

Cost per input token (if available)

##### name

> **name**: `string`

Defined in: [packages/ai/src/shared/types.ts:237](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L237)

Human-readable model name

##### outputCostPer1k?

> `optional` **outputCostPer1k**: `number`

Defined in: [packages/ai/src/shared/types.ts:272](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L272)

Cost per output token (if available)

##### supportsFunctions

> **supportsFunctions**: `boolean`

Defined in: [packages/ai/src/shared/types.ts:257](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L257)

Whether the model supports function calling

##### supportsVision

> **supportsVision**: `boolean`

Defined in: [packages/ai/src/shared/types.ts:262](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L262)

Whether the model supports vision/multimodal input

***

### AIResponse

Defined in: [packages/ai/src/shared/types.ts:348](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L348)

AI response structure

#### Properties

##### content

> **content**: `string`

Defined in: [packages/ai/src/shared/types.ts:352](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L352)

Generated content

##### finishReason?

> `optional` **finishReason**: `"stop"` \| `"length"` \| `"function_call"` \| `"tool_calls"` \| `"content_filter"`

Defined in: [packages/ai/src/shared/types.ts:367](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L367)

Finish reason

##### functionCalls?

> `optional` **functionCalls**: `object`[]

Defined in: [packages/ai/src/shared/types.ts:372](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L372)

Function calls made by the model

###### arguments

> **arguments**: `string`

###### name

> **name**: `string`

##### model?

> `optional` **model**: `string`

Defined in: [packages/ai/src/shared/types.ts:362](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L362)

Model used for generation

##### toolCalls?

> `optional` **toolCalls**: `object`[]

Defined in: [packages/ai/src/shared/types.ts:380](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L380)

Tool calls made by the model

###### function

> **function**: `object`

###### function.arguments

> **arguments**: `string`

###### function.name

> **name**: `string`

###### id

> **id**: `string`

###### type

> **type**: `"function"`

##### usage?

> `optional` **usage**: [`TokenUsage`](#tokenusage)

Defined in: [packages/ai/src/shared/types.ts:357](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L357)

Token usage information

***

### AITextCompletionOptions

Defined in: [packages/ai/src/shared/client.ts:75](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L75)

Options for AI text completion requests

#### Properties

##### frequencyPenalty?

> `optional` **frequencyPenalty**: `number`

Defined in: [packages/ai/src/shared/client.ts:104](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L104)

Penalty for token frequency

##### history?

> `optional` **history**: `ChatCompletionMessageParam`[]

Defined in: [packages/ai/src/shared/client.ts:94](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L94)

Previous messages in the conversation

##### logitBias?

> `optional` **logitBias**: `Record`\<`string`, `number`\>

Defined in: [packages/ai/src/shared/client.ts:109](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L109)

Token bias adjustments

##### logprobs?

> `optional` **logprobs**: `boolean`

Defined in: [packages/ai/src/shared/client.ts:114](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L114)

Whether to return log probabilities

##### maxTokens?

> `optional` **maxTokens**: `number`

Defined in: [packages/ai/src/shared/client.ts:124](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L124)

Maximum tokens to generate

##### model?

> `optional` **model**: `string`

Defined in: [packages/ai/src/shared/client.ts:79](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L79)

Model identifier to use

##### n?

> `optional` **n**: `number`

Defined in: [packages/ai/src/shared/client.ts:129](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L129)

Number of completions to generate

##### name?

> `optional` **name**: `string`

Defined in: [packages/ai/src/shared/client.ts:99](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L99)

Name of the message sender

##### onProgress()?

> `optional` **onProgress**: (`partialMessage`) => `void`

Defined in: [packages/ai/src/shared/client.ts:187](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L187)

Callback for handling streaming responses

###### Parameters

###### partialMessage

`string`

###### Returns

`void`

##### presencePenalty?

> `optional` **presencePenalty**: `number`

Defined in: [packages/ai/src/shared/client.ts:134](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L134)

Penalty for token presence

##### responseFormat?

> `optional` **responseFormat**: `object`

Defined in: [packages/ai/src/shared/client.ts:139](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L139)

Format for the response

###### type

> **type**: `"text"` \| `"json_object"`

##### role?

> `optional` **role**: `ChatCompletionRole`

Defined in: [packages/ai/src/shared/client.ts:89](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L89)

Role of the message sender

##### seed?

> `optional` **seed**: `number`

Defined in: [packages/ai/src/shared/client.ts:144](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L144)

Random seed for deterministic results

##### stop?

> `optional` **stop**: `string` \| `string`[]

Defined in: [packages/ai/src/shared/client.ts:149](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L149)

Sequences that stop generation

##### stream?

> `optional` **stream**: `boolean`

Defined in: [packages/ai/src/shared/client.ts:154](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L154)

Whether to stream responses

##### temperature?

> `optional` **temperature**: `number`

Defined in: [packages/ai/src/shared/client.ts:159](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L159)

Sampling temperature

##### timeout?

> `optional` **timeout**: `number`

Defined in: [packages/ai/src/shared/client.ts:84](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L84)

Timeout in milliseconds

##### toolChoice?

> `optional` **toolChoice**: `"auto"` \| `"none"` \| \{ `function`: \{ `name`: `string`; \}; `type`: `"function"`; \}

Defined in: [packages/ai/src/shared/client.ts:174](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L174)

Tool selection behavior

##### tools?

> `optional` **tools**: `any`[]

Defined in: [packages/ai/src/shared/client.ts:169](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L169)

Available tools for the model

##### topLogprobs?

> `optional` **topLogprobs**: `number`

Defined in: [packages/ai/src/shared/client.ts:119](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L119)

Number of top log probabilities to return

##### topProbability?

> `optional` **topProbability**: `number`

Defined in: [packages/ai/src/shared/client.ts:164](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L164)

Top-p sampling parameter

##### user?

> `optional` **user**: `string`

Defined in: [packages/ai/src/shared/client.ts:182](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L182)

User identifier

***

### AIThreadOptions

Defined in: [packages/ai/src/shared/thread.ts:8](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/thread.ts#L8)

Options for creating an AI conversation thread

#### Properties

##### ai

> **ai**: [`AIClientOptions`](#aiclientoptions-1)

Defined in: [packages/ai/src/shared/thread.ts:12](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/thread.ts#L12)

Options for the AI client to use in this thread

***

### AITool

Defined in: [packages/ai/src/shared/types.ts:198](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L198)

Tool/function definition for AI models

#### Properties

##### function

> **function**: `object`

Defined in: [packages/ai/src/shared/types.ts:207](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L207)

Function definition

###### description?

> `optional` **description**: `string`

Function description

###### name

> **name**: `string`

Function name

###### parameters?

> `optional` **parameters**: `Record`\<`string`, `any`\>

JSON schema for function parameters

##### type

> **type**: `"function"`

Defined in: [packages/ai/src/shared/types.ts:202](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L202)

Type of tool

***

### AnthropicOptions

Defined in: [packages/ai/src/shared/types.ts:499](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L499)

Anthropic provider options

#### Extends

- [`BaseAIOptions`](#baseaioptions)

#### Properties

##### anthropicVersion?

> `optional` **anthropicVersion**: `string`

Defined in: [packages/ai/src/shared/types.ts:503](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L503)

##### apiKey

> **apiKey**: `string`

Defined in: [packages/ai/src/shared/types.ts:501](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L501)

##### baseUrl?

> `optional` **baseUrl**: `string`

Defined in: [packages/ai/src/shared/types.ts:502](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L502)

##### defaultModel?

> `optional` **defaultModel**: `string`

Defined in: [packages/ai/src/shared/types.ts:472](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L472)

Default model to use

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`defaultModel`](#defaultmodel-1)

##### headers?

> `optional` **headers**: `Record`\<`string`, `string`\>

Defined in: [packages/ai/src/shared/types.ts:467](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L467)

Custom headers

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`headers`](#headers-1)

##### maxRetries?

> `optional` **maxRetries**: `number`

Defined in: [packages/ai/src/shared/types.ts:462](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L462)

Maximum number of retries

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`maxRetries`](#maxretries-1)

##### timeout?

> `optional` **timeout**: `number`

Defined in: [packages/ai/src/shared/types.ts:457](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L457)

API timeout in milliseconds

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`timeout`](#timeout-2)

##### type

> **type**: `"anthropic"`

Defined in: [packages/ai/src/shared/types.ts:500](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L500)

***

### BaseAIOptions

Defined in: [packages/ai/src/shared/types.ts:453](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L453)

Base configuration options for all providers

#### Extended by

- [`OpenAIOptions`](#openaioptions)
- [`GeminiOptions`](#geminioptions)
- [`AnthropicOptions`](#anthropicoptions)
- [`HuggingFaceOptions`](#huggingfaceoptions)
- [`BedrockOptions`](#bedrockoptions)

#### Properties

##### defaultModel?

> `optional` **defaultModel**: `string`

Defined in: [packages/ai/src/shared/types.ts:472](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L472)

Default model to use

##### headers?

> `optional` **headers**: `Record`\<`string`, `string`\>

Defined in: [packages/ai/src/shared/types.ts:467](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L467)

Custom headers

##### maxRetries?

> `optional` **maxRetries**: `number`

Defined in: [packages/ai/src/shared/types.ts:462](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L462)

Maximum number of retries

##### timeout?

> `optional` **timeout**: `number`

Defined in: [packages/ai/src/shared/types.ts:457](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L457)

API timeout in milliseconds

***

### BedrockOptions

Defined in: [packages/ai/src/shared/types.ts:521](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L521)

AWS Bedrock provider options

#### Extends

- [`BaseAIOptions`](#baseaioptions)

#### Properties

##### credentials?

> `optional` **credentials**: `object`

Defined in: [packages/ai/src/shared/types.ts:524](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L524)

###### accessKeyId

> **accessKeyId**: `string`

###### secretAccessKey

> **secretAccessKey**: `string`

###### sessionToken?

> `optional` **sessionToken**: `string`

##### defaultModel?

> `optional` **defaultModel**: `string`

Defined in: [packages/ai/src/shared/types.ts:472](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L472)

Default model to use

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`defaultModel`](#defaultmodel-1)

##### endpoint?

> `optional` **endpoint**: `string`

Defined in: [packages/ai/src/shared/types.ts:529](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L529)

##### headers?

> `optional` **headers**: `Record`\<`string`, `string`\>

Defined in: [packages/ai/src/shared/types.ts:467](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L467)

Custom headers

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`headers`](#headers-1)

##### maxRetries?

> `optional` **maxRetries**: `number`

Defined in: [packages/ai/src/shared/types.ts:462](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L462)

Maximum number of retries

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`maxRetries`](#maxretries-1)

##### region

> **region**: `string`

Defined in: [packages/ai/src/shared/types.ts:523](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L523)

##### timeout?

> `optional` **timeout**: `number`

Defined in: [packages/ai/src/shared/types.ts:457](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L457)

API timeout in milliseconds

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`timeout`](#timeout-2)

##### type

> **type**: `"bedrock"`

Defined in: [packages/ai/src/shared/types.ts:522](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L522)

***

### ChatOptions

Defined in: [packages/ai/src/shared/types.ts:48](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L48)

Options for chat completion requests

#### Properties

##### frequencyPenalty?

> `optional` **frequencyPenalty**: `number`

Defined in: [packages/ai/src/shared/types.ts:87](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L87)

Penalty for frequency of tokens

##### maxTokens?

> `optional` **maxTokens**: `number`

Defined in: [packages/ai/src/shared/types.ts:57](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L57)

Maximum number of tokens to generate

##### model?

> `optional` **model**: `string`

Defined in: [packages/ai/src/shared/types.ts:52](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L52)

Model to use for completion

##### n?

> `optional` **n**: `number`

Defined in: [packages/ai/src/shared/types.ts:72](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L72)

Number of completions to generate

##### onProgress()?

> `optional` **onProgress**: (`chunk`) => `void`

Defined in: [packages/ai/src/shared/types.ts:122](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L122)

Callback for streaming responses

###### Parameters

###### chunk

`string`

###### Returns

`void`

##### presencePenalty?

> `optional` **presencePenalty**: `number`

Defined in: [packages/ai/src/shared/types.ts:92](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L92)

Penalty for presence of tokens

##### responseFormat?

> `optional` **responseFormat**: `object`

Defined in: [packages/ai/src/shared/types.ts:112](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L112)

Response format specification

###### type

> **type**: `"text"` \| `"json_object"`

##### seed?

> `optional` **seed**: `number`

Defined in: [packages/ai/src/shared/types.ts:117](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L117)

Random seed for deterministic results

##### stop?

> `optional` **stop**: `string` \| `string`[]

Defined in: [packages/ai/src/shared/types.ts:77](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L77)

Sequences that stop generation

##### stream?

> `optional` **stream**: `boolean`

Defined in: [packages/ai/src/shared/types.ts:82](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L82)

Whether to stream the response

##### temperature?

> `optional` **temperature**: `number`

Defined in: [packages/ai/src/shared/types.ts:62](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L62)

Sampling temperature (0-2)

##### toolChoice?

> `optional` **toolChoice**: \{ `function`: \{ `name`: `string`; \}; `type`: `"function"`; \} \| `"auto"` \| `"none"`

Defined in: [packages/ai/src/shared/types.ts:107](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L107)

Tool choice behavior

##### tools?

> `optional` **tools**: [`AITool`](#aitool)[]

Defined in: [packages/ai/src/shared/types.ts:102](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L102)

Available tools/functions

##### topP?

> `optional` **topP**: `number`

Defined in: [packages/ai/src/shared/types.ts:67](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L67)

Top-p sampling parameter

##### user?

> `optional` **user**: `string`

Defined in: [packages/ai/src/shared/types.ts:97](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L97)

User identifier for monitoring

***

### CompletionOptions

Defined in: [packages/ai/src/shared/types.ts:128](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L128)

Options for text completion requests (non-chat models)

#### Properties

##### maxTokens?

> `optional` **maxTokens**: `number`

Defined in: [packages/ai/src/shared/types.ts:137](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L137)

Maximum number of tokens to generate

##### model?

> `optional` **model**: `string`

Defined in: [packages/ai/src/shared/types.ts:132](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L132)

Model to use for completion

##### n?

> `optional` **n**: `number`

Defined in: [packages/ai/src/shared/types.ts:152](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L152)

Number of completions to generate

##### onProgress()?

> `optional` **onProgress**: (`chunk`) => `void`

Defined in: [packages/ai/src/shared/types.ts:167](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L167)

Callback for streaming responses

###### Parameters

###### chunk

`string`

###### Returns

`void`

##### stop?

> `optional` **stop**: `string` \| `string`[]

Defined in: [packages/ai/src/shared/types.ts:157](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L157)

Sequences that stop generation

##### stream?

> `optional` **stream**: `boolean`

Defined in: [packages/ai/src/shared/types.ts:162](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L162)

Whether to stream the response

##### temperature?

> `optional` **temperature**: `number`

Defined in: [packages/ai/src/shared/types.ts:142](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L142)

Sampling temperature

##### topP?

> `optional` **topP**: `number`

Defined in: [packages/ai/src/shared/types.ts:147](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L147)

Top-p sampling parameter

***

### EmbeddingOptions

Defined in: [packages/ai/src/shared/types.ts:173](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L173)

Options for embedding generation

#### Properties

##### dimensions?

> `optional` **dimensions**: `number`

Defined in: [packages/ai/src/shared/types.ts:192](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L192)

Number of dimensions for the embedding

##### encodingFormat?

> `optional` **encodingFormat**: `"float"` \| `"base64"`

Defined in: [packages/ai/src/shared/types.ts:187](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L187)

Encoding format for embeddings

##### model?

> `optional` **model**: `string`

Defined in: [packages/ai/src/shared/types.ts:177](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L177)

Model to use for embeddings

##### user?

> `optional` **user**: `string`

Defined in: [packages/ai/src/shared/types.ts:182](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L182)

User identifier for monitoring

***

### EmbeddingResponse

Defined in: [packages/ai/src/shared/types.ts:393](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L393)

Embedding response structure

#### Properties

##### embeddings

> **embeddings**: `number`[][]

Defined in: [packages/ai/src/shared/types.ts:397](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L397)

Generated embeddings

##### model?

> `optional` **model**: `string`

Defined in: [packages/ai/src/shared/types.ts:407](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L407)

Model used for embeddings

##### usage?

> `optional` **usage**: [`TokenUsage`](#tokenusage)

Defined in: [packages/ai/src/shared/types.ts:402](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L402)

Token usage information

***

### GeminiOptions

Defined in: [packages/ai/src/shared/types.ts:488](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L488)

Gemini provider options

#### Extends

- [`BaseAIOptions`](#baseaioptions)

#### Properties

##### apiKey

> **apiKey**: `string`

Defined in: [packages/ai/src/shared/types.ts:490](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L490)

##### baseUrl?

> `optional` **baseUrl**: `string`

Defined in: [packages/ai/src/shared/types.ts:491](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L491)

##### defaultModel?

> `optional` **defaultModel**: `string`

Defined in: [packages/ai/src/shared/types.ts:472](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L472)

Default model to use

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`defaultModel`](#defaultmodel-1)

##### headers?

> `optional` **headers**: `Record`\<`string`, `string`\>

Defined in: [packages/ai/src/shared/types.ts:467](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L467)

Custom headers

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`headers`](#headers-1)

##### location?

> `optional` **location**: `string`

Defined in: [packages/ai/src/shared/types.ts:493](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L493)

##### maxRetries?

> `optional` **maxRetries**: `number`

Defined in: [packages/ai/src/shared/types.ts:462](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L462)

Maximum number of retries

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`maxRetries`](#maxretries-1)

##### projectId?

> `optional` **projectId**: `string`

Defined in: [packages/ai/src/shared/types.ts:492](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L492)

##### timeout?

> `optional` **timeout**: `number`

Defined in: [packages/ai/src/shared/types.ts:457](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L457)

API timeout in milliseconds

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`timeout`](#timeout-2)

##### type

> **type**: `"gemini"`

Defined in: [packages/ai/src/shared/types.ts:489](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L489)

***

### HuggingFaceOptions

Defined in: [packages/ai/src/shared/types.ts:509](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L509)

Hugging Face provider options

#### Extends

- [`BaseAIOptions`](#baseaioptions)

#### Properties

##### apiToken

> **apiToken**: `string`

Defined in: [packages/ai/src/shared/types.ts:511](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L511)

##### defaultModel?

> `optional` **defaultModel**: `string`

Defined in: [packages/ai/src/shared/types.ts:472](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L472)

Default model to use

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`defaultModel`](#defaultmodel-1)

##### endpoint?

> `optional` **endpoint**: `string`

Defined in: [packages/ai/src/shared/types.ts:512](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L512)

##### headers?

> `optional` **headers**: `Record`\<`string`, `string`\>

Defined in: [packages/ai/src/shared/types.ts:467](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L467)

Custom headers

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`headers`](#headers-1)

##### maxRetries?

> `optional` **maxRetries**: `number`

Defined in: [packages/ai/src/shared/types.ts:462](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L462)

Maximum number of retries

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`maxRetries`](#maxretries-1)

##### model?

> `optional` **model**: `string`

Defined in: [packages/ai/src/shared/types.ts:513](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L513)

##### timeout?

> `optional` **timeout**: `number`

Defined in: [packages/ai/src/shared/types.ts:457](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L457)

API timeout in milliseconds

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`timeout`](#timeout-2)

##### type

> **type**: `"huggingface"`

Defined in: [packages/ai/src/shared/types.ts:510](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L510)

##### useCache?

> `optional` **useCache**: `boolean`

Defined in: [packages/ai/src/shared/types.ts:514](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L514)

##### waitForModel?

> `optional` **waitForModel**: `boolean`

Defined in: [packages/ai/src/shared/types.ts:515](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L515)

***

### OpenAIClientOptions

Defined in: [packages/ai/src/shared/client.ts:398](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L398)

Configuration options specific to OpenAI client

#### Extends

- [`AIClientOptions`](#aiclientoptions-1)

#### Properties

##### apiKey?

> `optional` **apiKey**: `string`

Defined in: [packages/ai/src/shared/client.ts:402](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L402)

OpenAI API key

###### Overrides

[`AIClientOptions`](#aiclientoptions-1).[`apiKey`](#apikey)

##### baseUrl?

> `optional` **baseUrl**: `string`

Defined in: [packages/ai/src/shared/client.ts:407](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L407)

OpenAI API base URL

###### Overrides

[`AIClientOptions`](#aiclientoptions-1).[`baseUrl`](#baseurl)

##### responseFormat?

> `optional` **responseFormat**: `string`

Defined in: [packages/ai/src/shared/client.ts:19](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L19)

Response format for AI completions

###### Inherited from

[`AIClientOptions`](#aiclientoptions-1).[`responseFormat`](#responseformat)

##### type?

> `optional` **type**: `string`

Defined in: [packages/ai/src/shared/client.ts:14](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L14)

Type of AI client (e.g., 'openai')

###### Inherited from

[`AIClientOptions`](#aiclientoptions-1).[`type`](#type)

***

### OpenAIOptions

Defined in: [packages/ai/src/shared/types.ts:478](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L478)

OpenAI provider options

#### Extends

- [`BaseAIOptions`](#baseaioptions)

#### Properties

##### apiKey

> **apiKey**: `string`

Defined in: [packages/ai/src/shared/types.ts:480](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L480)

##### baseUrl?

> `optional` **baseUrl**: `string`

Defined in: [packages/ai/src/shared/types.ts:481](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L481)

##### defaultModel?

> `optional` **defaultModel**: `string`

Defined in: [packages/ai/src/shared/types.ts:472](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L472)

Default model to use

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`defaultModel`](#defaultmodel-1)

##### headers?

> `optional` **headers**: `Record`\<`string`, `string`\>

Defined in: [packages/ai/src/shared/types.ts:467](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L467)

Custom headers

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`headers`](#headers-1)

##### maxRetries?

> `optional` **maxRetries**: `number`

Defined in: [packages/ai/src/shared/types.ts:462](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L462)

Maximum number of retries

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`maxRetries`](#maxretries-1)

##### organization?

> `optional` **organization**: `string`

Defined in: [packages/ai/src/shared/types.ts:482](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L482)

##### timeout?

> `optional` **timeout**: `number`

Defined in: [packages/ai/src/shared/types.ts:457](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L457)

API timeout in milliseconds

###### Inherited from

[`BaseAIOptions`](#baseaioptions).[`timeout`](#timeout-2)

##### type?

> `optional` **type**: `"openai"`

Defined in: [packages/ai/src/shared/types.ts:479](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L479)

***

### OpenAITextCompletionOptions

Defined in: [packages/ai/src/shared/client.ts:280](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L280)

Options specific to OpenAI text completion requests

#### Properties

##### frequencyPenalty?

> `optional` **frequencyPenalty**: `number`

Defined in: [packages/ai/src/shared/client.ts:309](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L309)

Penalty for token frequency

##### history?

> `optional` **history**: `ChatCompletionMessageParam`[]

Defined in: [packages/ai/src/shared/client.ts:299](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L299)

Previous messages in the conversation

##### logitBias?

> `optional` **logitBias**: `Record`\<`string`, `number`\>

Defined in: [packages/ai/src/shared/client.ts:314](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L314)

Token bias adjustments

##### logprobs?

> `optional` **logprobs**: `boolean`

Defined in: [packages/ai/src/shared/client.ts:319](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L319)

Whether to return log probabilities

##### maxTokens?

> `optional` **maxTokens**: `number`

Defined in: [packages/ai/src/shared/client.ts:329](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L329)

Maximum tokens to generate

##### model?

> `optional` **model**: `string`

Defined in: [packages/ai/src/shared/client.ts:284](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L284)

Model identifier to use

##### n?

> `optional` **n**: `number`

Defined in: [packages/ai/src/shared/client.ts:334](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L334)

Number of completions to generate

##### name?

> `optional` **name**: `string`

Defined in: [packages/ai/src/shared/client.ts:304](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L304)

Name of the message sender

##### onProgress()?

> `optional` **onProgress**: (`partialMessage`) => `void`

Defined in: [packages/ai/src/shared/client.ts:392](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L392)

Callback for handling streaming responses

###### Parameters

###### partialMessage

`string`

###### Returns

`void`

##### presencePenalty?

> `optional` **presencePenalty**: `number`

Defined in: [packages/ai/src/shared/client.ts:339](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L339)

Penalty for token presence

##### responseFormat?

> `optional` **responseFormat**: `object`

Defined in: [packages/ai/src/shared/client.ts:344](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L344)

Format for the response

###### type

> **type**: `"text"` \| `"json_object"`

##### role?

> `optional` **role**: `ChatCompletionRole`

Defined in: [packages/ai/src/shared/client.ts:294](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L294)

Role of the message sender

##### seed?

> `optional` **seed**: `number`

Defined in: [packages/ai/src/shared/client.ts:349](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L349)

Random seed for deterministic results

##### stop?

> `optional` **stop**: `string` \| `string`[]

Defined in: [packages/ai/src/shared/client.ts:354](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L354)

Sequences that stop generation

##### stream?

> `optional` **stream**: `boolean`

Defined in: [packages/ai/src/shared/client.ts:359](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L359)

Whether to stream responses

##### temperature?

> `optional` **temperature**: `number`

Defined in: [packages/ai/src/shared/client.ts:364](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L364)

Sampling temperature

##### timeout?

> `optional` **timeout**: `number`

Defined in: [packages/ai/src/shared/client.ts:289](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L289)

Timeout in milliseconds

##### toolChoice?

> `optional` **toolChoice**: `"auto"` \| `"none"` \| \{ `function`: \{ `name`: `string`; \}; `type`: `"function"`; \}

Defined in: [packages/ai/src/shared/client.ts:379](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L379)

Tool selection behavior

##### tools?

> `optional` **tools**: `ChatCompletionTool`[]

Defined in: [packages/ai/src/shared/client.ts:374](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L374)

Available tools for the model

##### topLogprobs?

> `optional` **topLogprobs**: `number`

Defined in: [packages/ai/src/shared/client.ts:324](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L324)

Number of top log probabilities to return

##### topProbability?

> `optional` **topProbability**: `number`

Defined in: [packages/ai/src/shared/client.ts:369](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L369)

Top-p sampling parameter

##### user?

> `optional` **user**: `string`

Defined in: [packages/ai/src/shared/client.ts:387](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L387)

User identifier

***

### TokenUsage

Defined in: [packages/ai/src/shared/types.ts:328](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L328)

Token usage information

#### Properties

##### completionTokens

> **completionTokens**: `number`

Defined in: [packages/ai/src/shared/types.ts:337](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L337)

Number of completion tokens

##### promptTokens

> **promptTokens**: `number`

Defined in: [packages/ai/src/shared/types.ts:332](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L332)

Number of prompt tokens

##### totalTokens

> **totalTokens**: `number`

Defined in: [packages/ai/src/shared/types.ts:342](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L342)

Total tokens used

## Type Aliases

### GetAIOptions

> **GetAIOptions** = [`OpenAIOptions`](#openaioptions) \| [`GeminiOptions`](#geminioptions) \| [`AnthropicOptions`](#anthropicoptions) \| [`HuggingFaceOptions`](#huggingfaceoptions) \| [`BedrockOptions`](#bedrockoptions)

Defined in: [packages/ai/src/shared/types.ts:535](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/types.ts#L535)

Union type for all provider options

## Functions

### getAI()

> **getAI**(`options`): `Promise`\<[`AIInterface`](#aiinterface)\>

Defined in: [packages/ai/src/shared/factory.ts:49](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/factory.ts#L49)

Creates an AI provider instance based on the provided options
Universal version that works in both browser and Node.js environments

#### Parameters

##### options

[`GetAIOptions`](#getaioptions)

Configuration options for the AI provider

#### Returns

`Promise`\<[`AIInterface`](#aiinterface)\>

Promise resolving to an AI provider instance

#### Throws

ValidationError if the provider type is unsupported

***

### getAIAuto()

> **getAIAuto**(`options`): `Promise`\<[`AIInterface`](#aiinterface)\>

Defined in: [packages/ai/src/shared/factory.ts:89](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/factory.ts#L89)

Browser-compatible auto-detection of AI provider based on available credentials
Does not rely on process.env

#### Parameters

##### options

`Record`\<`string`, `any`\>

Configuration options that may contain provider-specific credentials

#### Returns

`Promise`\<[`AIInterface`](#aiinterface)\>

Promise resolving to an AI provider instance

#### Throws

ValidationError if no provider can be detected from the options

***

### getAIClient()

> **getAIClient**(`options`): `Promise`\<[`AIClient`](#aiclient)\>

Defined in: [packages/ai/src/shared/client.ts:597](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L597)

Factory function to create and initialize an appropriate AI client

#### Parameters

##### options

`GetAIClientOptions`

Client configuration options

#### Returns

`Promise`\<[`AIClient`](#aiclient)\>

Promise resolving to an initialized AI client

#### Throws

Error if client type is invalid

***

### getOpenAI()

> **getOpenAI**(`options`): `Promise`\<`OpenAI`\>

Defined in: [packages/ai/src/shared/client.ts:267](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/ai/src/shared/client.ts#L267)

Creates an OpenAI client instance

#### Parameters

##### options

OpenAI configuration options

###### apiKey?

`string`

###### baseUrl?

`string`

#### Returns

`Promise`\<`OpenAI`\>

Promise resolving to an OpenAI client
