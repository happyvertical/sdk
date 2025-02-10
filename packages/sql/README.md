# formerly sqloo

a simple interface to sqlite and/or postgres for basic tasks

```js
// get a postgres database
const db = await getDatabase({
  host: "localhost",
  port: 5432,
  database: "sqlooooo",
  user: "oO",
  password: "ackBillD.C@",
});
```

```js
// get a sqlite database
const db = await getDatabase({
  file: "::memory::",
});
```

```js
// fetch all the posts
const { oo } = db;
const posts = await oo`
  select * from posts
`;
```

```js
// fetch a single post
const { oO } = db;
const post = await oO`
  select * from posts where author = ${author} order by created_at desc limit 1
`;
```

```js
// pluck the first value from the first row
const { ox } = db;
const id = await ox`
  select id from posts where author = ${author} order by created_at desc limit 1
`;
```

```js
// execute a statement
const { xx } = db;
await xx`
  delete from posts where author = ${author}
`;
```

## Functions (db.\*)

### `insert(table, data)`

Inserts data into a table and returns the inserted rows.

- `table` (string): The name of the table.
- `data` (Object | Object[]): The data to insert.
- Returns: `Promise<Object | Object[]>`: The inserted rows, return type will match data.

### `get(table, where)`

Retrieves a row from a table based on a where clause.

- `table` (string): The name of the table.
- `where` (Object): The where clause.
- Returns: `Promise<Object>`: The retrieved row.

### `list(table, where)`

Retrieves multiple rows from a table based on a where clause.

- `table` (string): The name of the table.
- `where` (Object): The where clause.
- Returns: `Promise<Array>`: The retrieved rows.

### `update(table, where, data)`

Updates rows in a table based on a where clause and returns the updated rows.

- `table` (string): The name of the table.
- `where` (Object): The where clause.
- `data` (Object): The data to update.
- Returns: `Promise<Object>`: The updated rows.

### `table(table)`

Returns an object with insert, get, and list methods for a specific table.

- `table` (string): The name of the table.
- Returns: `Object`: An object with insert, get, and list methods.

### `parseTemplate(strings, ...vars)`

Parses a SQL template into a SQL string and an array of values.

- `strings` (Array): The strings in the SQL template.
- `vars` (...any): The variables in the SQL template.
- Returns: `Object`: An object with a sql property and a values property.

### `pluck(strings, ...vars)`

Executes a SQL query and returns the first column of the first row. Handles templates with it's alias "xo"

- `strings` (TemplateStringsArray): The strings in the SQL template.
- `vars` (...any): The variables in the SQL template.
- Returns: `Promise<any>`: The first column of the first row.

### `single(strings, ...vars)`

Executes a SQL query and returns the first row. Handles templates with it's alias "oO"

- `strings` (TemplateStringsArray): The strings in the SQL template.
- `vars` (...any): The variables in the SQL template.
- Returns: `Promise<Object>`: The first row.

### `many(strings, ...vars)`

Executes a SQL query and returns all rows. Handles templates with it's alias "oo"

- `strings` (TemplateStringsArray): The strings in the SQL template.
- `vars` (...any): The variables in the SQL template.
- Returns: `Promise<Array>`: All rows.

### `execute(strings, ...vars)`

Executes a SQL query. Handles templates with it's alias "xx"

- `strings` (TemplateStringsArray): The strings in the SQL template.
- `vars` (...any): The variables in the SQL template.
- Returns: `Promise<pg.QueryResult>`: The result of the query.

## Warning

- dont use variables for anything except values in template queries
- dont accept unsantized user input for table or column names

# chats

## raw sql

is there a standard both sqlite and postgres adhere to? What does ANSI compatible mean exactly?

If I say, "raw sql should be kept as ANSI compatible with more complex operations moved to per-database-adapter functions " does that make sense ?

The goal being the raw sql remains compatible between sqlite and postgres/mysql

ChatGPT said:
ChatGPT
Yes, both SQLite and PostgreSQL adhere to SQL standards, specifically versions of ANSI SQL (American National Standards Institute SQL), also known as ISO SQL (since it’s standardized by ISO/IEC as well). However, no database fully implements the standard, and each has its own extensions and deviations.

What "ANSI Compatible" Means
When you say "ANSI-compatible," it generally means:

Using standard SQL syntax (e.g., SELECT, INSERT, UPDATE, DELETE, JOIN, WHERE, GROUP BY).
Avoiding database-specific extensions (e.g., ILIKE in PostgreSQL, AUTOINCREMENT in SQLite).
Using standard data types where possible (INTEGER, TEXT, DECIMAL instead of SERIAL in Postgres or BOOLEAN in SQLite).
Ensuring compatibility in functions and operators (COALESCE(), CASE WHEN, etc.).
Your Approach
Your statement:

"Raw SQL should be kept as ANSI compatible with more complex operations moved to per-database-adapter functions."
Makes sense and is a good practice. This means:

Keep simple queries ANSI-compliant, so they work across SQLite, PostgreSQL, and potentially MySQL.
Move complex operations (e.g., JSON handling, CTEs, window functions, full-text search, advanced indexing) into per-database adapters.
Considerations
Column types: BOOLEAN is not standard; SQLite treats it as INTEGER. Use INTEGER (0/1) instead.
Auto-increment: PostgreSQL uses SERIAL, while SQLite uses INTEGER PRIMARY KEY AUTOINCREMENT. Standard SQL uses IDENTITY.
Upserts: Use INSERT ... ON CONFLICT DO UPDATE (PostgreSQL, SQLite) vs. INSERT ... ON DUPLICATE KEY UPDATE (MySQL).
JSON: PostgreSQL has jsonb, while SQLite requires extensions.
Date/Time: Use TEXT with ISO 8601 format (YYYY-MM-DD HH:MM:SS) for portability.
Summary
Your approach is solid: keep simple SQL portable and delegate complex operations to database-specific adapters.
