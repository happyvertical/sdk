# @have/sql: Database Interface Package

## Purpose and Responsibilities

The `@have/sql` package provides a standardized interface for SQL database operations, with specific support for SQLite and PostgreSQL. It is designed to:

- Abstract away database-specific implementation details
- Provide a consistent API for common database operations
- Support schema synchronization for easy table creation and updates
- Handle query building and parameter binding securely
- Enable vector search capabilities with SQLite-VSS

Unlike full-featured ORMs, this package is intentionally lightweight, focusing on providing just enough abstraction while maintaining direct SQL access when needed.

## Key APIs

### Database Client Creation

```typescript
import { getSqliteClient, getPostgresClient } from '@have/sql';

// Create an SQLite client
const sqliteDb = await getSqliteClient({
  filename: 'database.db'  // Creates in-memory database if not specified
});

// Create a PostgreSQL client
const pgDb = await getPostgresClient({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'username',
  password: 'password'
});
```

### Basic Query Operations

```typescript
// Run a simple query
const { rows } = await db.query('SELECT * FROM users WHERE id = ?', ['user123']);

// Run a parameterized query with named parameters
const result = await db.query(
  'INSERT INTO users (id, name, email) VALUES (?, ?, ?)',
  ['user123', 'John Doe', 'john@example.com']
);

// Get a single value
const count = await db.pluck`SELECT COUNT(*) FROM users WHERE active = ${true}`;
```

### Schema Operations

```typescript
// Define a schema
const schema = {
  users: {
    id: { type: 'TEXT', primaryKey: true },
    name: { type: 'TEXT', notNull: true },
    email: { type: 'TEXT', unique: true },
    created_at: { type: 'TEXT' },
    updated_at: { type: 'TEXT' }
  }
};

// Synchronize schema (creates or updates tables as needed)
await syncSchema({ db, schema });
```

### Query Building

```typescript
// Build a WHERE clause from an object
const { sql, values } = buildWhere({
  status: 'active',
  'created_at >': '2023-01-01',
  'role in': ['admin', 'editor']
});

// Use in a query
const { rows } = await db.query(
  `SELECT * FROM users ${sql}`,
  values
);
```

### Transaction Support

```typescript
// Run operations in a transaction
await db.transaction(async (tx) => {
  await tx.query('INSERT INTO users (id, name) VALUES (?, ?)', ['user1', 'User One']);
  await tx.query('INSERT INTO profiles (user_id, bio) VALUES (?, ?)', ['user1', 'My bio']);
});
```

### Vector Search (with SQLite-VSS)

```typescript
// Create a vector search table
await db.query(`
  CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vss0(
    id TEXT,
    embedding(1536) FLOAT,
    content TEXT
  );
`);

// Insert vector data
await db.query(`
  INSERT INTO embeddings (id, embedding, content) VALUES (?, ?, ?)
`, [
  'doc1', 
  new Float32Array([0.1, 0.2, /* ... */]).buffer, 
  'Document content'
]);

// Perform vector search
const { rows } = await db.query(`
  SELECT id, content, distance
  FROM embeddings
  WHERE vss_search(embedding, ?)
  LIMIT 10
`, [new Float32Array([0.2, 0.3, /* ... */]).buffer]);
```

## Dependencies

The package has the following dependencies:

- `@libsql/client`: For SQLite database operations
- `sqlite-vss`: For vector search capabilities in SQLite
- `pg`: For PostgreSQL database operations

## Development Guidelines

### Adding New Database Features

When adding new features:

1. Ensure consistent API across database engines
2. Implement for both SQLite and PostgreSQL where applicable
3. Add appropriate error handling and type checking
4. Write tests that work with both database engines

### Query Safety

- Always use parameterized queries to prevent SQL injection
- Validate table and column names when dynamically generating SQL
- Use the query building utilities for complex conditions
- Add type definitions for query results where possible

### Schema Management

- Keep schema definitions declarative and database-agnostic
- Use proper SQL types that work across database engines
- Include constraints (primary keys, foreign keys, etc.) in schema definitions
- Follow a consistent pattern for timestamps and metadata columns

### Testing

The package includes tests for verifying database operations:

```bash
bun test        # Run tests once
bun test:watch  # Run tests in watch mode
```

Tests use in-memory databases to avoid external dependencies.

### Building

Build the package with:

```bash
bun run build       # Build once
bun run build:watch # Build in watch mode
```

### Best Practices

- Use transactions for operations that need to be atomic
- Close database connections when they're no longer needed
- Consider performance implications of schema designs
- Use appropriate indexing for frequently queried columns
- Keep vector dimensions consistent when using vector search

This package provides a foundation for data persistence in the HAVE SDK, designed to be lightweight but powerful enough for AI-driven applications.