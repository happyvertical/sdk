# @have/sql

## Interfaces

### DatabaseInterface

Defined in: [shared/types.ts:35](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L35)

Common interface for database adapters
Provides a unified API for different database backends

#### Properties

##### client

> **client**: `any`

Defined in: [shared/types.ts:39](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L39)

Underlying database client instance

##### execute()

> **execute**: (`strings`, ...`vars`) => `Promise`\<`void`\>

Defined in: [shared/types.ts:161](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L161)

Executes a SQL query using template literals without returning results

###### Parameters

###### strings

`TemplateStringsArray`

Template strings

###### vars

...`any`[]

Variables to interpolate into the query

###### Returns

`Promise`\<`void`\>

Promise that resolves when the query completes

##### get()

> **get**: (`table`, `where`) => `Promise`\<`null` \| `Record`\<`string`, `any`\>\>

Defined in: [shared/types.ts:60](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L60)

Retrieves a single record matching the where criteria

###### Parameters

###### table

`string`

Table name

###### where

`Record`\<`string`, `any`\>

Criteria to match records

###### Returns

`Promise`\<`null` \| `Record`\<`string`, `any`\>\>

Promise resolving to matching record or null if not found

##### getOrInsert()

> **getOrInsert**: (`table`, `where`, `data`) => `Promise`\<`Record`\<`string`, `any`\>\>

Defined in: [shared/types.ts:99](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L99)

Gets a record matching the where criteria or inserts it if not found

###### Parameters

###### table

`string`

Table name

###### where

`Record`\<`string`, `any`\>

Criteria to match existing record

###### data

`Record`\<`string`, `any`\>

Data to insert if no record found

###### Returns

`Promise`\<`Record`\<`string`, `any`\>\>

Promise resolving to the record (either retrieved or newly inserted)

##### insert()

> **insert**: (`table`, `data`) => `Promise`\<[`QueryResult`](#queryresult)\>

Defined in: [shared/types.ts:48](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L48)

Inserts one or more records into a table

###### Parameters

###### table

`string`

Table name

###### data

Single record or array of records to insert

`Record`\<`string`, `any`\> | `Record`\<`string`, `any`\>[]

###### Returns

`Promise`\<[`QueryResult`](#queryresult)\>

Promise resolving to operation result

##### list()

> **list**: (`table`, `where`) => `Promise`\<`Record`\<`string`, `any`\>[]\>

Defined in: [shared/types.ts:72](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L72)

Retrieves multiple records matching the where criteria

###### Parameters

###### table

`string`

Table name

###### where

`Record`\<`string`, `any`\>

Criteria to match records

###### Returns

`Promise`\<`Record`\<`string`, `any`\>[]\>

Promise resolving to array of matching records

##### many()

> **many**: (`strings`, ...`vars`) => `Promise`\<`Record`\<`string`, `any`\>[]\>

Defined in: [shared/types.ts:128](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L128)

Executes a SQL query using template literals and returns multiple rows

###### Parameters

###### strings

`TemplateStringsArray`

Template strings

###### vars

...`any`[]

Variables to interpolate into the query

###### Returns

`Promise`\<`Record`\<`string`, `any`\>[]\>

Promise resolving to array of result records

##### oo()

> **oo**: (`strings`, ...`vars`) => `Promise`\<`Record`\<`string`, `any`\>[]\>

Defined in: [shared/types.ts:166](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L166)

Alias for many() - Executes a SQL query and returns multiple rows

###### Parameters

###### strings

`TemplateStringsArray`

###### vars

...`any`[]

###### Returns

`Promise`\<`Record`\<`string`, `any`\>[]\>

##### oO()

> **oO**: (`strings`, ...`vars`) => `Promise`\<`null` \| `Record`\<`string`, `any`\>\>

Defined in: [shared/types.ts:174](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L174)

Alias for single() - Executes a SQL query and returns a single row

###### Parameters

###### strings

`TemplateStringsArray`

###### vars

...`any`[]

###### Returns

`Promise`\<`null` \| `Record`\<`string`, `any`\>\>

##### ox()

> **ox**: (`strings`, ...`vars`) => `Promise`\<`any`\>

Defined in: [shared/types.ts:182](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L182)

Alias for pluck() - Executes a SQL query and returns a single value

###### Parameters

###### strings

`TemplateStringsArray`

###### vars

...`any`[]

###### Returns

`Promise`\<`any`\>

##### pluck()

> **pluck**: (`strings`, ...`vars`) => `Promise`\<`any`\>

Defined in: [shared/types.ts:152](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L152)

Executes a SQL query using template literals and returns a single value

###### Parameters

###### strings

`TemplateStringsArray`

Template strings

###### vars

...`any`[]

Variables to interpolate into the query

###### Returns

`Promise`\<`any`\>

Promise resolving to a single value (first column of first row)

##### query()

> **query**: (`str`, ...`vars`) => `Promise`\<\{ `rowCount`: `number`; `rows`: `Record`\<`string`, `any`\>[]; \}\>

Defined in: [shared/types.ts:196](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L196)

Executes a raw SQL query with parameterized values

###### Parameters

###### str

`string`

SQL query string

###### vars

...`any`[]

Variables to use as parameters

###### Returns

`Promise`\<\{ `rowCount`: `number`; `rows`: `Record`\<`string`, `any`\>[]; \}\>

Promise resolving to query result with rows and count

##### single()

> **single**: (`strings`, ...`vars`) => `Promise`\<`null` \| `Record`\<`string`, `any`\>\>

Defined in: [shared/types.ts:140](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L140)

Executes a SQL query using template literals and returns a single row

###### Parameters

###### strings

`TemplateStringsArray`

Template strings

###### vars

...`any`[]

Variables to interpolate into the query

###### Returns

`Promise`\<`null` \| `Record`\<`string`, `any`\>\>

Promise resolving to a single result record or null

##### table()

> **table**: (`table`) => [`TableInterface`](#tableinterface)

Defined in: [shared/types.ts:111](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L111)

Creates a table-specific interface for simplified table operations

###### Parameters

###### table

`string`

Table name

###### Returns

[`TableInterface`](#tableinterface)

TableInterface for the specified table

##### tableExists()

> **tableExists**: (`table`) => `Promise`\<`boolean`\>

Defined in: [shared/types.ts:119](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L119)

Checks if a table exists in the database

###### Parameters

###### table

`string`

Table name

###### Returns

`Promise`\<`boolean`\>

Promise resolving to boolean indicating existence

##### update()

> **update**: (`table`, `where`, `data`) => `Promise`\<[`QueryResult`](#queryresult)\>

Defined in: [shared/types.ts:85](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L85)

Updates records matching the where criteria

###### Parameters

###### table

`string`

Table name

###### where

`Record`\<`string`, `any`\>

Criteria to match records to update

###### data

`Record`\<`string`, `any`\>

New data to set

###### Returns

`Promise`\<[`QueryResult`](#queryresult)\>

Promise resolving to operation result

##### xx()

> **xx**: (`strings`, ...`vars`) => `Promise`\<`void`\>

Defined in: [shared/types.ts:187](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L187)

Alias for execute() - Executes a SQL query without returning results

###### Parameters

###### strings

`TemplateStringsArray`

###### vars

...`any`[]

###### Returns

`Promise`\<`void`\>

***

### DatabaseOptions

Defined in: [shared/types.ts:4](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L4)

Common database connection options

#### Properties

##### authToken?

> `optional` **authToken**: `string`

Defined in: [shared/types.ts:13](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L13)

Authentication token for the database connection

##### url?

> `optional` **url**: `string`

Defined in: [shared/types.ts:8](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L8)

Database connection URL

***

### QueryResult

Defined in: [shared/types.ts:19](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L19)

Result of a database operation that modifies data

#### Properties

##### affected

> **affected**: `number`

Defined in: [shared/types.ts:28](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L28)

Number of rows affected by the operation

##### operation

> **operation**: `string`

Defined in: [shared/types.ts:23](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L23)

Type of operation performed (e.g., "insert", "update", "delete")

***

### TableInterface

Defined in: [shared/types.ts:205](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L205)

Simplified interface for table-specific operations

#### Properties

##### get()

> **get**: (`where`) => `Promise`\<`null` \| `Record`\<`string`, `any`\>\>

Defined in: [shared/types.ts:222](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L222)

Retrieves a single record from the table matching the where criteria

###### Parameters

###### where

`Record`\<`string`, `any`\>

Criteria to match records

###### Returns

`Promise`\<`null` \| `Record`\<`string`, `any`\>\>

Promise resolving to matching record or null if not found

##### insert()

> **insert**: (`data`) => `Promise`\<[`QueryResult`](#queryresult)\>

Defined in: [shared/types.ts:212](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L212)

Inserts one or more records into the table

###### Parameters

###### data

Single record or array of records to insert

`Record`\<`string`, `any`\> | `Record`\<`string`, `any`\>[]

###### Returns

`Promise`\<[`QueryResult`](#queryresult)\>

Promise resolving to operation result

##### list()

> **list**: (`where`) => `Promise`\<`Record`\<`string`, `any`\>[]\>

Defined in: [shared/types.ts:230](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/types.ts#L230)

Retrieves multiple records from the table matching the where criteria

###### Parameters

###### where

`Record`\<`string`, `any`\>

Criteria to match records

###### Returns

`Promise`\<`Record`\<`string`, `any`\>[]\>

Promise resolving to array of matching records

## Variables

### default

> **default**: `object`

Defined in: [index.ts:180](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/index.ts#L180)

#### Type declaration

##### buildWhere()

> **buildWhere**: (`where`, `startIndex`) => `object`

Builds a SQL WHERE clause with parameterized values and flexible operators

###### Parameters

###### where

`Record`\<`string`, `any`\>

Record of conditions with optional operators in keys

###### startIndex

`number` = `1`

Starting index for parameter numbering (default: 1)

###### Returns

`object`

Object containing the SQL clause and array of values

###### sql

> **sql**: `string`

###### values

> **values**: `any`[]

###### Examples

```typescript
buildWhere({
  'status': 'active',           // equals operator is default
  'price >': 100,              // greater than
  'stock <=': 5,               // less than or equal
  'category in': ['A', 'B'],   // IN clause for arrays
  'name like': '%shirt%'       // LIKE for pattern matching
});
```

```typescript
buildWhere({
  'deleted_at': null,          // becomes "deleted_at IS NULL"
  'updated_at !=': null,       // becomes "updated_at IS NOT NULL"
  'status': 'active'           // regular comparison
});
```

```typescript
// Price range
buildWhere({
  'price >=': 10,
  'price <': 100
});

// Date filtering
buildWhere({
  'created_at >': startDate,
  'created_at <=': endDate,
  'deleted_at': null
});

// Search with LIKE
buildWhere({
  'title like': '%search%',
  'description like': '%search%',
  'status': 'published'
});

// Multiple values with IN
buildWhere({
  'role in': ['admin', 'editor'],
  'active': true,
  'last_login !=': null
});
```

The function handles:
- Standard comparisons (=, >, >=, <, <=, !=)
- NULL checks (IS NULL, IS NOT NULL)
- IN clauses for arrays
- LIKE for pattern matching
- Multiple conditions combined with AND

##### getDatabase()

> **getDatabase**: (`options`) => `Promise`\<[`DatabaseInterface`](#databaseinterface)\>

Creates a database connection based on the provided options

###### Parameters

###### options

`GetDatabaseOptions` = `{}`

Configuration options for the database connection

###### Returns

`Promise`\<[`DatabaseInterface`](#databaseinterface)\>

Promise resolving to a DatabaseInterface implementation

###### Throws

Error if the database type is invalid

##### syncSchema()

> **syncSchema**: (`options`) => `Promise`\<`void`\>

Synchronizes a SQL schema definition with a database
Creates tables if they don't exist and adds missing columns to existing tables

###### Parameters

###### options

Object containing database and schema

###### db

[`DatabaseInterface`](#databaseinterface)

Database interface to use

###### schema

`string`

SQL schema definition

###### Returns

`Promise`\<`void`\>

###### Throws

Error if db or schema are missing or if table name is invalid

##### tableExists()

> **tableExists**: (`db`, `tableName`) => `Promise`\<`boolean`\>

Checks if a table exists in the database

###### Parameters

###### db

[`DatabaseInterface`](#databaseinterface)

Database interface to use

###### tableName

`string`

Name of the table to check

###### Returns

`Promise`\<`boolean`\>

Promise resolving to boolean indicating if the table exists

## Functions

### buildWhere()

> **buildWhere**(`where`, `startIndex`): `object`

Defined in: [shared/utils.ts:83](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/shared/utils.ts#L83)

Builds a SQL WHERE clause with parameterized values and flexible operators

#### Parameters

##### where

`Record`\<`string`, `any`\>

Record of conditions with optional operators in keys

##### startIndex

`number` = `1`

Starting index for parameter numbering (default: 1)

#### Returns

`object`

Object containing the SQL clause and array of values

##### sql

> **sql**: `string`

##### values

> **values**: `any`[]

#### Examples

```typescript
buildWhere({
  'status': 'active',           // equals operator is default
  'price >': 100,              // greater than
  'stock <=': 5,               // less than or equal
  'category in': ['A', 'B'],   // IN clause for arrays
  'name like': '%shirt%'       // LIKE for pattern matching
});
```

```typescript
buildWhere({
  'deleted_at': null,          // becomes "deleted_at IS NULL"
  'updated_at !=': null,       // becomes "updated_at IS NOT NULL"
  'status': 'active'           // regular comparison
});
```

```typescript
// Price range
buildWhere({
  'price >=': 10,
  'price <': 100
});

// Date filtering
buildWhere({
  'created_at >': startDate,
  'created_at <=': endDate,
  'deleted_at': null
});

// Search with LIKE
buildWhere({
  'title like': '%search%',
  'description like': '%search%',
  'status': 'published'
});

// Multiple values with IN
buildWhere({
  'role in': ['admin', 'editor'],
  'active': true,
  'last_login !=': null
});
```

The function handles:
- Standard comparisons (=, >, >=, <, <=, !=)
- NULL checks (IS NULL, IS NOT NULL)
- IN clauses for arrays
- LIKE for pattern matching
- Multiple conditions combined with AND

***

### escapeSqlValue()

> **escapeSqlValue**(`value`): `string`

Defined in: [index.ts:142](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/index.ts#L142)

Escapes and formats a value for use in SQL queries

#### Parameters

##### value

`any`

Value to escape

#### Returns

`string`

String representation of the value safe for SQL use

***

### getDatabase()

> **getDatabase**(`options`): `Promise`\<[`DatabaseInterface`](#databaseinterface)\>

Defined in: [index.ts:19](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/index.ts#L19)

Creates a database connection based on the provided options

#### Parameters

##### options

`GetDatabaseOptions` = `{}`

Configuration options for the database connection

#### Returns

`Promise`\<[`DatabaseInterface`](#databaseinterface)\>

Promise resolving to a DatabaseInterface implementation

#### Throws

Error if the database type is invalid

***

### syncSchema()

> **syncSchema**(`options`): `Promise`\<`void`\>

Defined in: [index.ts:61](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/index.ts#L61)

Synchronizes a SQL schema definition with a database
Creates tables if they don't exist and adds missing columns to existing tables

#### Parameters

##### options

Object containing database and schema

###### db

[`DatabaseInterface`](#databaseinterface)

Database interface to use

###### schema

`string`

SQL schema definition

#### Returns

`Promise`\<`void`\>

#### Throws

Error if db or schema are missing or if table name is invalid

***

### tableExists()

> **tableExists**(`db`, `tableName`): `Promise`\<`boolean`\>

Defined in: [index.ts:130](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/index.ts#L130)

Checks if a table exists in the database

#### Parameters

##### db

[`DatabaseInterface`](#databaseinterface)

Database interface to use

##### tableName

`string`

Name of the table to check

#### Returns

`Promise`\<`boolean`\>

Promise resolving to boolean indicating if the table exists

***

### validateColumnName()

> **validateColumnName**(`column`): `string`

Defined in: [index.ts:166](https://github.com/happyvertical/sdk/blob/bc1c53169cc6d4b5478bd15943b0131ef3ff8653/packages/sql/src/index.ts#L166)

Validates a column name for use in SQL queries

#### Parameters

##### column

`string`

Column name to validate

#### Returns

`string`

The validated column name

#### Throws

Error if the column name contains invalid characters
