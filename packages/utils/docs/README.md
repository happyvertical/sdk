# @have/utils

## Common Helpers

### addInterval()

> `const` **addInterval**: \<`DateType`\>(`date`, `duration`) => `DateType` = `add`

Defined in: [packages/utils/src/shared/universal.ts:357](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L357)

#### Type Parameters

##### DateType

`DateType` *extends* `Date`

The `Date` type, the function operates on. Gets inferred from passed arguments. Allows to use extensions like [`UTCDate`](https://github.com/date-fns/utc).

#### Parameters

##### date

The date to be changed

`string` | `number` | `DateType`

##### duration

`Duration`

The object with years, months, weeks, days, hours, minutes and seconds to be added.

| Key            | Description                        |
|----------------|------------------------------------|
| years          | Amount of years to be added        |
| months         | Amount of months to be added       |
| weeks          | Amount of weeks to be added        |
| days           | Amount of days to be added         |
| hours          | Amount of hours to be added        |
| minutes        | Amount of minutes to be added      |
| seconds        | Amount of seconds to be added      |

All values default to 0

#### Returns

`DateType`

The new date with the seconds added

#### Name

add

#### Description

Add the specified years, months, weeks, days, hours, minutes and seconds to the given date.

#### Example

```ts
// Add the following duration to 1 September 2014, 10:19:50
const result = add(new Date(2014, 8, 1, 10, 19, 50), {
  years: 2,
  months: 9,
  weeks: 1,
  days: 7,
  hours: 5,\\-7
  minutes: 9,
  seconds: 30,
})
//=> Thu Jun 15 2017 15:29:20
```

***

### isValidDate()

> `const` **isValidDate**: (`date`) => `boolean` = `isValid`

Defined in: [packages/utils/src/shared/universal.ts:356](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L356)

#### Parameters

##### date

`unknown`

The date to check

#### Returns

`boolean`

The date is valid

#### Name

isValid

#### Description

Returns false if argument is Invalid Date and true otherwise.
Argument is converted to Date using `toDate`. See [toDate](https://date-fns.org/docs/toDate)
Invalid Date is a Date, whose time value is NaN.

Time value of Date: http://es5.github.io/#x15.9.1.1

#### Examples

```ts
// For the valid date:
const result = isValid(new Date(2014, 1, 31))
//=> true
```

```ts
// For the value, convertable into a date:
const result = isValid(1393804800000)
//=> true
```

```ts
// For the invalid date:
const result = isValid(new Date(''))
//=> false
```

## Other

### ErrorCode

Defined in: [packages/utils/src/shared/types.ts:5](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L5)

Shared type definitions and interfaces for universal use

#### Enumeration Members

##### API\_ERROR

> **API\_ERROR**: `"API_ERROR"`

Defined in: [packages/utils/src/shared/types.ts:7](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L7)

##### DATABASE\_ERROR

> **DATABASE\_ERROR**: `"DATABASE_ERROR"`

Defined in: [packages/utils/src/shared/types.ts:10](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L10)

##### FILE\_ERROR

> **FILE\_ERROR**: `"FILE_ERROR"`

Defined in: [packages/utils/src/shared/types.ts:8](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L8)

##### NETWORK\_ERROR

> **NETWORK\_ERROR**: `"NETWORK_ERROR"`

Defined in: [packages/utils/src/shared/types.ts:9](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L9)

##### PARSING\_ERROR

> **PARSING\_ERROR**: `"PARSING_ERROR"`

Defined in: [packages/utils/src/shared/types.ts:11](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L11)

##### TIMEOUT\_ERROR

> **TIMEOUT\_ERROR**: `"TIMEOUT_ERROR"`

Defined in: [packages/utils/src/shared/types.ts:12](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L12)

##### UNKNOWN\_ERROR

> **UNKNOWN\_ERROR**: `"UNKNOWN_ERROR"`

Defined in: [packages/utils/src/shared/types.ts:13](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L13)

##### VALIDATION\_ERROR

> **VALIDATION\_ERROR**: `"VALIDATION_ERROR"`

Defined in: [packages/utils/src/shared/types.ts:6](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L6)

***

### ApiError

Defined in: [packages/utils/src/shared/types.ts:52](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L52)

#### Extends

- [`BaseError`](#baseerror)

#### Constructors

##### Constructor

> **new ApiError**(`message`, `context?`): [`ApiError`](#apierror)

Defined in: [packages/utils/src/shared/types.ts:53](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L53)

###### Parameters

###### message

`string`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`ApiError`](#apierror)

###### Overrides

[`BaseError`](#baseerror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`BaseError`](#baseerror).[`cause`](#cause-1)

##### code

> `readonly` **code**: [`ErrorCode`](#errorcode)

Defined in: [packages/utils/src/shared/types.ts:17](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L17)

###### Inherited from

[`BaseError`](#baseerror).[`code`](#code-1)

##### context?

> `readonly` `optional` **context**: `Record`\<`string`, `unknown`\>

Defined in: [packages/utils/src/shared/types.ts:18](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L18)

###### Inherited from

[`BaseError`](#baseerror).[`context`](#context-1)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`BaseError`](#baseerror).[`message`](#message-1)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`BaseError`](#baseerror).[`name`](#name-1)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`BaseError`](#baseerror).[`stack`](#stack-1)

##### timestamp

> `readonly` **timestamp**: `Date`

Defined in: [packages/utils/src/shared/types.ts:19](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L19)

###### Inherited from

[`BaseError`](#baseerror).[`timestamp`](#timestamp-1)

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

[`BaseError`](#baseerror).[`prepareStackTrace`](#preparestacktrace-1)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`BaseError`](#baseerror).[`stackTraceLimit`](#stacktracelimit-1)

#### Methods

##### toJSON()

> **toJSON**(): `object`

Defined in: [packages/utils/src/shared/types.ts:34](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L34)

###### Returns

`object`

###### code

> **code**: [`ErrorCode`](#errorcode)

###### context

> **context**: `undefined` \| `Record`\<`string`, `unknown`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### timestamp

> **timestamp**: `string`

###### Inherited from

[`BaseError`](#baseerror).[`toJSON`](#tojson-2)

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

[`BaseError`](#baseerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`BaseError`](#baseerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`BaseError`](#baseerror).[`isError`](#iserror-2)

***

### BaseError

Defined in: [packages/utils/src/shared/types.ts:16](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L16)

#### Extends

- `Error`

#### Extended by

- [`ValidationError`](#validationerror)
- [`ApiError`](#apierror)
- [`FileError`](#fileerror)
- [`NetworkError`](#networkerror)
- [`DatabaseError`](#databaseerror)
- [`ParsingError`](#parsingerror)
- [`TimeoutError`](#timeouterror)

#### Constructors

##### Constructor

> **new BaseError**(`message`, `code`, `context?`): [`BaseError`](#baseerror)

Defined in: [packages/utils/src/shared/types.ts:21](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L21)

###### Parameters

###### message

`string`

###### code

[`ErrorCode`](#errorcode) = `ErrorCode.UNKNOWN_ERROR`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`BaseError`](#baseerror)

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

> `readonly` **code**: [`ErrorCode`](#errorcode)

Defined in: [packages/utils/src/shared/types.ts:17](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L17)

##### context?

> `readonly` `optional` **context**: `Record`\<`string`, `unknown`\>

Defined in: [packages/utils/src/shared/types.ts:18](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L18)

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

##### timestamp

> `readonly` **timestamp**: `Date`

Defined in: [packages/utils/src/shared/types.ts:19](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L19)

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

Defined in: [packages/utils/src/shared/types.ts:34](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L34)

###### Returns

`object`

###### code

> **code**: [`ErrorCode`](#errorcode)

###### context

> **context**: `undefined` \| `Record`\<`string`, `unknown`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### timestamp

> **timestamp**: `string`

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

### DatabaseError

Defined in: [packages/utils/src/shared/types.ts:70](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L70)

#### Extends

- [`BaseError`](#baseerror)

#### Constructors

##### Constructor

> **new DatabaseError**(`message`, `context?`): [`DatabaseError`](#databaseerror)

Defined in: [packages/utils/src/shared/types.ts:71](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L71)

###### Parameters

###### message

`string`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`DatabaseError`](#databaseerror)

###### Overrides

[`BaseError`](#baseerror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`BaseError`](#baseerror).[`cause`](#cause-1)

##### code

> `readonly` **code**: [`ErrorCode`](#errorcode)

Defined in: [packages/utils/src/shared/types.ts:17](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L17)

###### Inherited from

[`BaseError`](#baseerror).[`code`](#code-1)

##### context?

> `readonly` `optional` **context**: `Record`\<`string`, `unknown`\>

Defined in: [packages/utils/src/shared/types.ts:18](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L18)

###### Inherited from

[`BaseError`](#baseerror).[`context`](#context-1)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`BaseError`](#baseerror).[`message`](#message-1)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`BaseError`](#baseerror).[`name`](#name-1)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`BaseError`](#baseerror).[`stack`](#stack-1)

##### timestamp

> `readonly` **timestamp**: `Date`

Defined in: [packages/utils/src/shared/types.ts:19](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L19)

###### Inherited from

[`BaseError`](#baseerror).[`timestamp`](#timestamp-1)

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

[`BaseError`](#baseerror).[`prepareStackTrace`](#preparestacktrace-1)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`BaseError`](#baseerror).[`stackTraceLimit`](#stacktracelimit-1)

#### Methods

##### toJSON()

> **toJSON**(): `object`

Defined in: [packages/utils/src/shared/types.ts:34](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L34)

###### Returns

`object`

###### code

> **code**: [`ErrorCode`](#errorcode)

###### context

> **context**: `undefined` \| `Record`\<`string`, `unknown`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### timestamp

> **timestamp**: `string`

###### Inherited from

[`BaseError`](#baseerror).[`toJSON`](#tojson-2)

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

[`BaseError`](#baseerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`BaseError`](#baseerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`BaseError`](#baseerror).[`isError`](#iserror-2)

***

### FileError

Defined in: [packages/utils/src/shared/types.ts:58](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L58)

#### Extends

- [`BaseError`](#baseerror)

#### Constructors

##### Constructor

> **new FileError**(`message`, `context?`): [`FileError`](#fileerror)

Defined in: [packages/utils/src/shared/types.ts:59](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L59)

###### Parameters

###### message

`string`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`FileError`](#fileerror)

###### Overrides

[`BaseError`](#baseerror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`BaseError`](#baseerror).[`cause`](#cause-1)

##### code

> `readonly` **code**: [`ErrorCode`](#errorcode)

Defined in: [packages/utils/src/shared/types.ts:17](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L17)

###### Inherited from

[`BaseError`](#baseerror).[`code`](#code-1)

##### context?

> `readonly` `optional` **context**: `Record`\<`string`, `unknown`\>

Defined in: [packages/utils/src/shared/types.ts:18](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L18)

###### Inherited from

[`BaseError`](#baseerror).[`context`](#context-1)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`BaseError`](#baseerror).[`message`](#message-1)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`BaseError`](#baseerror).[`name`](#name-1)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`BaseError`](#baseerror).[`stack`](#stack-1)

##### timestamp

> `readonly` **timestamp**: `Date`

Defined in: [packages/utils/src/shared/types.ts:19](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L19)

###### Inherited from

[`BaseError`](#baseerror).[`timestamp`](#timestamp-1)

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

[`BaseError`](#baseerror).[`prepareStackTrace`](#preparestacktrace-1)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`BaseError`](#baseerror).[`stackTraceLimit`](#stacktracelimit-1)

#### Methods

##### toJSON()

> **toJSON**(): `object`

Defined in: [packages/utils/src/shared/types.ts:34](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L34)

###### Returns

`object`

###### code

> **code**: [`ErrorCode`](#errorcode)

###### context

> **context**: `undefined` \| `Record`\<`string`, `unknown`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### timestamp

> **timestamp**: `string`

###### Inherited from

[`BaseError`](#baseerror).[`toJSON`](#tojson-2)

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

[`BaseError`](#baseerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`BaseError`](#baseerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`BaseError`](#baseerror).[`isError`](#iserror-2)

***

### NetworkError

Defined in: [packages/utils/src/shared/types.ts:64](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L64)

#### Extends

- [`BaseError`](#baseerror)

#### Constructors

##### Constructor

> **new NetworkError**(`message`, `context?`): [`NetworkError`](#networkerror)

Defined in: [packages/utils/src/shared/types.ts:65](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L65)

###### Parameters

###### message

`string`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`NetworkError`](#networkerror)

###### Overrides

[`BaseError`](#baseerror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`BaseError`](#baseerror).[`cause`](#cause-1)

##### code

> `readonly` **code**: [`ErrorCode`](#errorcode)

Defined in: [packages/utils/src/shared/types.ts:17](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L17)

###### Inherited from

[`BaseError`](#baseerror).[`code`](#code-1)

##### context?

> `readonly` `optional` **context**: `Record`\<`string`, `unknown`\>

Defined in: [packages/utils/src/shared/types.ts:18](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L18)

###### Inherited from

[`BaseError`](#baseerror).[`context`](#context-1)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`BaseError`](#baseerror).[`message`](#message-1)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`BaseError`](#baseerror).[`name`](#name-1)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`BaseError`](#baseerror).[`stack`](#stack-1)

##### timestamp

> `readonly` **timestamp**: `Date`

Defined in: [packages/utils/src/shared/types.ts:19](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L19)

###### Inherited from

[`BaseError`](#baseerror).[`timestamp`](#timestamp-1)

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

[`BaseError`](#baseerror).[`prepareStackTrace`](#preparestacktrace-1)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`BaseError`](#baseerror).[`stackTraceLimit`](#stacktracelimit-1)

#### Methods

##### toJSON()

> **toJSON**(): `object`

Defined in: [packages/utils/src/shared/types.ts:34](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L34)

###### Returns

`object`

###### code

> **code**: [`ErrorCode`](#errorcode)

###### context

> **context**: `undefined` \| `Record`\<`string`, `unknown`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### timestamp

> **timestamp**: `string`

###### Inherited from

[`BaseError`](#baseerror).[`toJSON`](#tojson-2)

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

[`BaseError`](#baseerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`BaseError`](#baseerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`BaseError`](#baseerror).[`isError`](#iserror-2)

***

### ParsingError

Defined in: [packages/utils/src/shared/types.ts:76](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L76)

#### Extends

- [`BaseError`](#baseerror)

#### Constructors

##### Constructor

> **new ParsingError**(`message`, `context?`): [`ParsingError`](#parsingerror)

Defined in: [packages/utils/src/shared/types.ts:77](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L77)

###### Parameters

###### message

`string`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`ParsingError`](#parsingerror)

###### Overrides

[`BaseError`](#baseerror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`BaseError`](#baseerror).[`cause`](#cause-1)

##### code

> `readonly` **code**: [`ErrorCode`](#errorcode)

Defined in: [packages/utils/src/shared/types.ts:17](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L17)

###### Inherited from

[`BaseError`](#baseerror).[`code`](#code-1)

##### context?

> `readonly` `optional` **context**: `Record`\<`string`, `unknown`\>

Defined in: [packages/utils/src/shared/types.ts:18](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L18)

###### Inherited from

[`BaseError`](#baseerror).[`context`](#context-1)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`BaseError`](#baseerror).[`message`](#message-1)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`BaseError`](#baseerror).[`name`](#name-1)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`BaseError`](#baseerror).[`stack`](#stack-1)

##### timestamp

> `readonly` **timestamp**: `Date`

Defined in: [packages/utils/src/shared/types.ts:19](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L19)

###### Inherited from

[`BaseError`](#baseerror).[`timestamp`](#timestamp-1)

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

[`BaseError`](#baseerror).[`prepareStackTrace`](#preparestacktrace-1)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`BaseError`](#baseerror).[`stackTraceLimit`](#stacktracelimit-1)

#### Methods

##### toJSON()

> **toJSON**(): `object`

Defined in: [packages/utils/src/shared/types.ts:34](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L34)

###### Returns

`object`

###### code

> **code**: [`ErrorCode`](#errorcode)

###### context

> **context**: `undefined` \| `Record`\<`string`, `unknown`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### timestamp

> **timestamp**: `string`

###### Inherited from

[`BaseError`](#baseerror).[`toJSON`](#tojson-2)

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

[`BaseError`](#baseerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`BaseError`](#baseerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`BaseError`](#baseerror).[`isError`](#iserror-2)

***

### TimeoutError

Defined in: [packages/utils/src/shared/types.ts:82](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L82)

#### Extends

- [`BaseError`](#baseerror)

#### Constructors

##### Constructor

> **new TimeoutError**(`message`, `context?`): [`TimeoutError`](#timeouterror)

Defined in: [packages/utils/src/shared/types.ts:83](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L83)

###### Parameters

###### message

`string`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`TimeoutError`](#timeouterror)

###### Overrides

[`BaseError`](#baseerror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`BaseError`](#baseerror).[`cause`](#cause-1)

##### code

> `readonly` **code**: [`ErrorCode`](#errorcode)

Defined in: [packages/utils/src/shared/types.ts:17](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L17)

###### Inherited from

[`BaseError`](#baseerror).[`code`](#code-1)

##### context?

> `readonly` `optional` **context**: `Record`\<`string`, `unknown`\>

Defined in: [packages/utils/src/shared/types.ts:18](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L18)

###### Inherited from

[`BaseError`](#baseerror).[`context`](#context-1)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`BaseError`](#baseerror).[`message`](#message-1)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`BaseError`](#baseerror).[`name`](#name-1)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`BaseError`](#baseerror).[`stack`](#stack-1)

##### timestamp

> `readonly` **timestamp**: `Date`

Defined in: [packages/utils/src/shared/types.ts:19](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L19)

###### Inherited from

[`BaseError`](#baseerror).[`timestamp`](#timestamp-1)

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

[`BaseError`](#baseerror).[`prepareStackTrace`](#preparestacktrace-1)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`BaseError`](#baseerror).[`stackTraceLimit`](#stacktracelimit-1)

#### Methods

##### toJSON()

> **toJSON**(): `object`

Defined in: [packages/utils/src/shared/types.ts:34](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L34)

###### Returns

`object`

###### code

> **code**: [`ErrorCode`](#errorcode)

###### context

> **context**: `undefined` \| `Record`\<`string`, `unknown`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### timestamp

> **timestamp**: `string`

###### Inherited from

[`BaseError`](#baseerror).[`toJSON`](#tojson-2)

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

[`BaseError`](#baseerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`BaseError`](#baseerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`BaseError`](#baseerror).[`isError`](#iserror-2)

***

### ValidationError

Defined in: [packages/utils/src/shared/types.ts:46](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L46)

#### Extends

- [`BaseError`](#baseerror)

#### Constructors

##### Constructor

> **new ValidationError**(`message`, `context?`): [`ValidationError`](#validationerror)

Defined in: [packages/utils/src/shared/types.ts:47](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L47)

###### Parameters

###### message

`string`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

[`ValidationError`](#validationerror)

###### Overrides

[`BaseError`](#baseerror).[`constructor`](#constructor-1)

#### Properties

##### cause?

> `optional` **cause**: `unknown`

Defined in: node\_modules/typescript/lib/lib.es2022.error.d.ts:26

The cause of the error.

###### Inherited from

[`BaseError`](#baseerror).[`cause`](#cause-1)

##### code

> `readonly` **code**: [`ErrorCode`](#errorcode)

Defined in: [packages/utils/src/shared/types.ts:17](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L17)

###### Inherited from

[`BaseError`](#baseerror).[`code`](#code-1)

##### context?

> `readonly` `optional` **context**: `Record`\<`string`, `unknown`\>

Defined in: [packages/utils/src/shared/types.ts:18](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L18)

###### Inherited from

[`BaseError`](#baseerror).[`context`](#context-1)

##### message

> **message**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1077

###### Inherited from

[`BaseError`](#baseerror).[`message`](#message-1)

##### name

> **name**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1076

###### Inherited from

[`BaseError`](#baseerror).[`name`](#name-1)

##### stack?

> `optional` **stack**: `string`

Defined in: node\_modules/typescript/lib/lib.es5.d.ts:1078

###### Inherited from

[`BaseError`](#baseerror).[`stack`](#stack-1)

##### timestamp

> `readonly` **timestamp**: `Date`

Defined in: [packages/utils/src/shared/types.ts:19](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L19)

###### Inherited from

[`BaseError`](#baseerror).[`timestamp`](#timestamp-1)

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

[`BaseError`](#baseerror).[`prepareStackTrace`](#preparestacktrace-1)

##### stackTraceLimit

> `static` **stackTraceLimit**: `number`

Defined in: node\_modules/bun-types/globals.d.ts:990

The maximum number of stack frames to capture.

###### Inherited from

[`BaseError`](#baseerror).[`stackTraceLimit`](#stacktracelimit-1)

#### Methods

##### toJSON()

> **toJSON**(): `object`

Defined in: [packages/utils/src/shared/types.ts:34](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L34)

###### Returns

`object`

###### code

> **code**: [`ErrorCode`](#errorcode)

###### context

> **context**: `undefined` \| `Record`\<`string`, `unknown`\>

###### message

> **message**: `string`

###### name

> **name**: `string`

###### stack

> **stack**: `undefined` \| `string`

###### timestamp

> **timestamp**: `string`

###### Inherited from

[`BaseError`](#baseerror).[`toJSON`](#tojson-2)

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

[`BaseError`](#baseerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`BaseError`](#baseerror).[`captureStackTrace`](#capturestacktrace-3)

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

[`BaseError`](#baseerror).[`isError`](#iserror-2)

***

### Logger

Defined in: [packages/utils/src/shared/types.ts:88](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L88)

#### Methods

##### debug()

> **debug**(`message`, `context?`): `void`

Defined in: [packages/utils/src/shared/types.ts:89](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L89)

###### Parameters

###### message

`string`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

`void`

##### error()

> **error**(`message`, `context?`): `void`

Defined in: [packages/utils/src/shared/types.ts:92](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L92)

###### Parameters

###### message

`string`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

`void`

##### info()

> **info**(`message`, `context?`): `void`

Defined in: [packages/utils/src/shared/types.ts:90](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L90)

###### Parameters

###### message

`string`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

`void`

##### warn()

> **warn**(`message`, `context?`): `void`

Defined in: [packages/utils/src/shared/types.ts:91](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/types.ts#L91)

###### Parameters

###### message

`string`

###### context?

`Record`\<`string`, `unknown`\>

###### Returns

`void`

***

### createId()

> `const` **createId**: () => `string` = `cuid2CreateId`

Defined in: [packages/utils/src/shared/universal.ts:35](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L35)

Generates a CUID2 identifier (collision-resistant, more secure than UUID)

#### Returns

`string`

***

### isPlural()

> `const` **isPlural**: (`word`) => `boolean` = `pluralize.isPlural`

Defined in: [packages/utils/src/shared/universal.ts:338](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L338)

Test if provided word is plural.

#### Parameters

##### word

`string`

#### Returns

`boolean`

***

### isSingular()

> `const` **isSingular**: (`word`) => `boolean` = `pluralize.isSingular`

Defined in: [packages/utils/src/shared/universal.ts:339](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L339)

Test if provided word is singular.

#### Parameters

##### word

`string`

#### Returns

`boolean`

***

### pluralizeWord

> `const` **pluralizeWord**: *typeof* `pluralize` = `pluralize`

Defined in: [packages/utils/src/shared/universal.ts:336](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L336)

String pluralization utilities using the pluralize library

***

### singularize()

> `const` **singularize**: (`word`) => `string` = `pluralize.singular`

Defined in: [packages/utils/src/shared/universal.ts:337](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L337)

Singularize a word based.

#### Parameters

##### word

`string`

#### Returns

`string`

***

### camelCase()

> **camelCase**(`str`): `string`

Defined in: [packages/utils/src/shared/universal.ts:163](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L163)

Converts a string to camelCase

#### Parameters

##### str

`string`

#### Returns

`string`

***

### dateInString()

> **dateInString**(`str`): `null` \| `Date`

Defined in: [packages/utils/src/shared/universal.ts:269](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L269)

Extracts and parses a date from a string

#### Parameters

##### str

`string`

#### Returns

`null` \| `Date`

***

### disableLogging()

> **disableLogging**(): `void`

Defined in: [packages/utils/src/shared/logger.ts:58](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/logger.ts#L58)

#### Returns

`void`

***

### domainToCamel()

> **domainToCamel**(`domain`): `string`

Defined in: [packages/utils/src/shared/universal.ts:219](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L219)

Converts a domain string to camelCase

#### Parameters

##### domain

`string`

#### Returns

`string`

***

### enableLogging()

> **enableLogging**(): `void`

Defined in: [packages/utils/src/shared/logger.ts:62](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/logger.ts#L62)

#### Returns

`void`

***

### formatDate()

> **formatDate**(`date`, `formatStr`): `string`

Defined in: [packages/utils/src/shared/universal.ts:344](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L344)

Enhanced date utilities using date-fns library

#### Parameters

##### date

`string` | `Date`

##### formatStr

`string` = `'yyyy-MM-dd'`

#### Returns

`string`

***

### getLogger()

> **getLogger**(): [`Logger`](#logger)

Defined in: [packages/utils/src/shared/logger.ts:54](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/logger.ts#L54)

#### Returns

[`Logger`](#logger)

***

### getTempDirectory()

> **getTempDirectory**(`subfolder?`): `string`

Defined in: [packages/utils/src/shared/universal.ts:362](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L362)

Gets a temporary directory path (cross-platform)

#### Parameters

##### subfolder?

`string`

#### Returns

`string`

***

### isArray()

> **isArray**(`obj`): `obj is unknown[]`

Defined in: [packages/utils/src/shared/universal.ts:137](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L137)

Type guard to check if a value is an array

#### Parameters

##### obj

`unknown`

#### Returns

`obj is unknown[]`

***

### isCuid()

> **isCuid**(`id`): `boolean`

Defined in: node\_modules/@paralleldrive/cuid2/index.d.ts:14

Checks if a string is a valid CUID2

#### Parameters

##### id

`string`

#### Returns

`boolean`

***

### isPlainObject()

> **isPlainObject**(`obj`): `obj is Record<string, unknown>`

Defined in: [packages/utils/src/shared/universal.ts:144](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L144)

Type guard to check if a value is a plain object

#### Parameters

##### obj

`unknown`

#### Returns

`obj is Record<string, unknown>`

***

### isUrl()

> **isUrl**(`url`): `boolean`

Defined in: [packages/utils/src/shared/universal.ts:151](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L151)

Checks if a string is a valid URL

#### Parameters

##### url

`string`

#### Returns

`boolean`

***

### keysToCamel()

> **keysToCamel**(`obj`): `unknown`

Defined in: [packages/utils/src/shared/universal.ts:187](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L187)

Recursively converts all object keys to camelCase

#### Parameters

##### obj

`unknown`

#### Returns

`unknown`

***

### keysToSnake()

> **keysToSnake**(`obj`): `unknown`

Defined in: [packages/utils/src/shared/universal.ts:203](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L203)

Recursively converts all object keys to snake_case

#### Parameters

##### obj

`unknown`

#### Returns

`unknown`

***

### logTicker()

> **logTicker**(`tick`, `options`): `string`

Defined in: [packages/utils/src/shared/universal.ts:224](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L224)

Creates a visual progress indicator by cycling through a sequence of characters

#### Parameters

##### tick

`null` | `string`

##### options

###### chars?

`string`[]

#### Returns

`string`

***

### makeId()

> **makeId**(`type`): `string`

Defined in: [packages/utils/src/shared/universal.ts:14](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L14)

Generates a unique identifier using CUID2 (preferred) or UUID fallback

#### Parameters

##### type

ID type: 'cuid2' (default) or 'uuid'

`"cuid2"` | `"uuid"`

#### Returns

`string`

***

### makeSlug()

> **makeSlug**(`str`): `string`

Defined in: [packages/utils/src/shared/universal.ts:45](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L45)

Converts a string to a URL-friendly slug

#### Parameters

##### str

`string`

#### Returns

`string`

***

### parseAmazonDateString()

> **parseAmazonDateString**(`dateStr`): `Date`

Defined in: [packages/utils/src/shared/universal.ts:240](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L240)

Parses an Amazon date string format (YYYYMMDDTHHMMSSZ) to a Date object

#### Parameters

##### dateStr

`string`

#### Returns

`Date`

***

### parseDate()

> **parseDate**(`dateStr`, `formatStr?`): `Date`

Defined in: [packages/utils/src/shared/universal.ts:349](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L349)

#### Parameters

##### dateStr

`string`

##### formatStr?

`string`

#### Returns

`Date`

***

### prettyDate()

> **prettyDate**(`dateString`): `string`

Defined in: [packages/utils/src/shared/universal.ts:324](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L324)

Formats a date string into a human-readable format using the system locale

#### Parameters

##### dateString

`string`

#### Returns

`string`

***

### setLogger()

> **setLogger**(`logger`): `void`

Defined in: [packages/utils/src/shared/logger.ts:50](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/logger.ts#L50)

#### Parameters

##### logger

[`Logger`](#logger)

#### Returns

`void`

***

### sleep()

> **sleep**(`duration`): `Promise`\<`void`\>

Defined in: [packages/utils/src/shared/universal.ts:90](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L90)

Creates a Promise that resolves after a specified duration

#### Parameters

##### duration

`number`

#### Returns

`Promise`\<`void`\>

***

### snakeCase()

> **snakeCase**(`str`): `string`

Defined in: [packages/utils/src/shared/universal.ts:176](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L176)

Converts a string to snake_case

#### Parameters

##### str

`string`

#### Returns

`string`

***

### urlFilename()

> **urlFilename**(`url`): `string`

Defined in: [packages/utils/src/shared/universal.ts:71](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L71)

Extracts the filename from a URL's pathname

#### Parameters

##### url

`string`

#### Returns

`string`

***

### urlPath()

> **urlPath**(`url`): `string`

Defined in: [packages/utils/src/shared/universal.ts:81](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L81)

Converts a URL to a file path by joining hostname and pathname

#### Parameters

##### url

`string`

#### Returns

`string`

***

### waitFor()

> **waitFor**(`it`, `__namedParameters`): `Promise`\<`any`\>

Defined in: [packages/utils/src/shared/universal.ts:100](https://github.com/happyvertical/sdk/blob/80a6c47fe85b9796ffdbac5379a03ea69133c54c/packages/utils/src/shared/universal.ts#L100)

Repeatedly calls a function until it returns a defined value or times out

#### Parameters

##### it

() => `Promise`\<`any`\>

##### \_\_namedParameters

###### delay?

`number` = `1000`

###### timeout?

`number` = `0`

#### Returns

`Promise`\<`any`\>
