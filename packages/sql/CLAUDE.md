# @have/sql: Database Interface Package

## Purpose and Responsibilities

The `@have/sql` package provides a standardized interface for SQL database operations, with specific support for SQLite and PostgreSQL. It is designed to:

- Abstract away database-specific implementation details while maintaining direct SQL access
- Provide a consistent API for common database operations across multiple database engines
- Support dynamic schema synchronization for seamless table creation and updates
- Handle query building and parameter binding securely to prevent SQL injection
- Enable vector search capabilities with SQLite-VSS for AI workloads
- Offer both high-level object-relational methods and low-level SQL execution
- Support both browser and Node.js environments with optimized builds

Unlike full-featured ORMs, this package is intentionally lightweight, focusing on providing just enough abstraction while maintaining direct SQL access when needed for performance-critical operations.

**Expert Agent Expertise**: When working with this package, always proactively check the latest documentation for foundational libraries (@libsql/client, sqlite-vss, pg) as they frequently add new features, performance improvements, and vector search capabilities that can enhance database solutions.

## Key APIs

### Database Client Creation

```typescript
import { getDatabase } from '@have/sql';

// Create an SQLite client (auto-detected from URL)
const sqliteDb = await getDatabase({
  url: 'file:database.db'  // or 'file::memory:' for in-memory
});

// Create an SQLite client with Turso/LibSQL remote connection
const tursoDb = await getDatabase({
  type: 'sqlite',
  url: 'libsql://your-database.turso.io',
  authToken: process.env.TURSO_AUTH_TOKEN
});

// Create a PostgreSQL client
const pgDb = await getDatabase({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'username',
  password: 'password'
});

// Create from connection URL
const dbFromUrl = await getDatabase({
  type: 'postgres',
  url: 'postgresql://user:pass@localhost:5432/dbname'
});
```

### Template Literal Queries (Recommended)

```typescript
// Get a single value with type safety
const userCount = await db.pluck`SELECT COUNT(*) FROM users WHERE active = ${true}`;
const userCount2 = await db.ox`SELECT COUNT(*) FROM users WHERE active = ${true}`; // alias

// Get a single record
const user = await db.single`SELECT * FROM users WHERE id = ${userId}`;
const user2 = await db.oO`SELECT * FROM users WHERE id = ${userId}`; // alias

// Get multiple records
const activeUsers = await db.many`SELECT * FROM users WHERE status = ${'active'}`;
const activeUsers2 = await db.oo`SELECT * FROM users WHERE status = ${'active'}`; // alias

// Execute without returning results
await db.execute`UPDATE users SET last_login = ${new Date()} WHERE id = ${userId}`;
await db.xx`UPDATE users SET last_login = ${new Date()} WHERE id = ${userId}`; // alias
```

### Raw Query Operations

```typescript
// Execute raw SQL with parameters
const { rows, rowCount } = await db.query(
  'SELECT * FROM users WHERE status = ? AND created_at > ?',
  ['active', '2023-01-01']
);

// Alternative parameter format
const result = await db.query(
  'INSERT INTO users (id, name, email) VALUES (?, ?, ?)',
  'user123', 'John Doe', 'john@example.com'
);
```

### Object-Relational Methods

```typescript
// Insert single record
await db.insert('users', {
  id: 'user123',
  name: 'John Doe',
  email: 'john@example.com',
  created_at: new Date().toISOString()
});

// Insert multiple records (batch)
await db.insert('users', [
  { id: 'user1', name: 'Alice', email: 'alice@example.com' },
  { id: 'user2', name: 'Bob', email: 'bob@example.com' }
]);

// Get single record by criteria
const user = await db.get('users', { id: 'user123' });

// List records with complex criteria
const users = await db.list('users', {
  status: 'active',
  'created_at >': '2023-01-01'
});

// Update records
await db.update('users', 
  { id: 'user123' },           // where criteria
  { last_login: new Date().toISOString() }  // data to update
);

// Get or insert (upsert pattern)
const user = await db.getOrInsert('users',
  { email: 'new@example.com' }, // where criteria
  { id: 'newuser', name: 'New User', email: 'new@example.com' } // data to insert
);
```

### Advanced Query Building

```typescript
import { buildWhere } from '@have/sql';

// Build complex WHERE clauses
const { sql, values } = buildWhere({
  status: 'active',                    // equals (default)
  'price >': 100,                     // greater than
  'stock <=': 5,                      // less than or equal
  'category in': ['electronics', 'books'], // IN clause
  'name like': '%shirt%',             // LIKE pattern matching
  'deleted_at': null,                 // IS NULL
  'updated_at !=': null               // IS NOT NULL
});

// Use in queries
const products = await db.many`SELECT * FROM products ${sql}`;
```

### Table Interface

```typescript
// Create table-specific interface for cleaner code
const usersTable = db.table('users');

// Use table methods
await usersTable.insert({ id: 'user1', name: 'Alice' });
const user = await usersTable.get({ id: 'user1' });
const activeUsers = await usersTable.list({ status: 'active' });
```

### Schema Synchronization

```typescript
import { syncSchema } from '@have/sql';

// Define schema as SQL DDL
const schemaSQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    status TEXT DEFAULT 'active',
    created_at TEXT,
    updated_at TEXT
  );
  
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    title TEXT NOT NULL,
    content TEXT,
    published BOOLEAN DEFAULT false,
    created_at TEXT
  );
`;

// Synchronize schema (creates tables and adds missing columns)
await syncSchema({ db, schema: schemaSQL });

// Check if table exists
const exists = await db.tableExists('users');
```

### Vector Search with SQLite-VSS

```typescript
// Create vector search table
await db.execute`
  CREATE VIRTUAL TABLE IF NOT EXISTS document_embeddings USING vss0(
    id TEXT PRIMARY KEY,
    embedding(1536),
    content TEXT,
    metadata TEXT
  )
`;

// Insert embeddings
const embedding = new Float32Array(1536); // Your embedding vector
await db.execute`
  INSERT INTO document_embeddings (id, embedding, content, metadata) 
  VALUES (${docId}, ${embedding}, ${content}, ${JSON.stringify(metadata)})
`;

// Perform similarity search
const similarDocs = await db.many`
  SELECT 
    id, 
    content, 
    metadata,
    distance
  FROM document_embeddings 
  WHERE vss_search(embedding, ${queryEmbedding})
  ORDER BY distance 
  LIMIT ${limit}
`;

// Search with filters
const filteredResults = await db.many`
  SELECT d.*, v.distance
  FROM document_embeddings d
  JOIN (
    SELECT rowid, distance 
    FROM document_embeddings 
    WHERE vss_search(embedding, ${queryEmbedding})
    LIMIT 100
  ) v ON d.rowid = v.rowid
  WHERE JSON_EXTRACT(d.metadata, '$.category') = ${category}
  ORDER BY v.distance
  LIMIT ${limit}
`;
```

### Error Handling

```typescript
import { DatabaseError } from '@have/utils';

try {
  await db.insert('users', invalidData);
} catch (error) {
  if (error instanceof DatabaseError) {
    console.log('Database operation failed:', error.message);
    console.log('Context:', error.context);
    console.log('SQL:', error.context.sql);
    console.log('Values:', error.context.values);
  }
}
```

## Dependencies

The package has the following dependencies:

### Internal Dependencies
- `@have/utils`: For shared utilities and error handling

### External Dependencies
- `@libsql/client`: LibSQL client for SQLite compatibility with extensions
- `sqlite-vss`: Vector similarity search for SQLite databases
- `pg`: PostgreSQL client for Node.js with connection pooling

### Development Dependencies
- `@types/node`: TypeScript definitions for Node.js
- `@types/pg`: TypeScript definitions for PostgreSQL client
- `vitest`: Testing framework for unit and integration tests

## Development Guidelines

### Database-Agnostic Development

When adding new features:

1. **Maintain API consistency** across SQLite and PostgreSQL implementations
2. **Handle parameter differences** (? vs $1, $2... placeholders)
3. **Account for type differences** between database engines
4. **Test on both databases** to ensure compatibility
5. **Document database-specific limitations** when they exist

### Query Safety and Security

- **Always use parameterized queries** - Never interpolate user input directly into SQL
- **Validate table and column names** when dynamically generating SQL
- **Use buildWhere utility** for complex conditions instead of string concatenation
- **Sanitize file paths** for SQLite databases to prevent path traversal
- **Use prepared statements** for repeated queries when possible

### Performance Optimization

```typescript
// Good: Batch inserts for multiple records
await db.insert('logs', batchData);

// Good: Use indexes for frequently queried columns
await db.execute`CREATE INDEX idx_users_email ON users(email)`;

// Good: Use transactions for related operations
await db.execute`BEGIN TRANSACTION`;
try {
  await db.insert('orders', orderData);
  await db.insert('order_items', itemsData);
  await db.execute`COMMIT`;
} catch (error) {
  await db.execute`ROLLBACK`;
  throw error;
}

// Good: Use appropriate LIMIT clauses
const recentPosts = await db.many`
  SELECT * FROM posts 
  ORDER BY created_at DESC 
  LIMIT 10
`;
```

### Vector Search Optimization

```typescript
// Optimize embedding storage
const optimizedEmbedding = new Float32Array(embedding).buffer;

// Use appropriate distance metrics
await db.execute`
  CREATE VIRTUAL TABLE embeddings USING vss0(
    id TEXT PRIMARY KEY,
    embedding(384) FLOAT  -- Use smaller dimensions when possible
  )
`;

// Batch vector inserts for better performance
const embeddings = documents.map(doc => ({
  id: doc.id,
  embedding: doc.vector,
  content: doc.text
}));
await db.insert('embeddings', embeddings);
```

### Testing

The package includes comprehensive tests for verifying database operations:

```bash
bun test              # Run all tests once
bun test:watch        # Run tests in watch mode
bun test sqlite       # Run only SQLite tests
bun test postgres     # Run only PostgreSQL tests
```

Tests use in-memory databases and mocked connections to avoid external dependencies.

### Building

Build the package with target-specific configurations:

```bash
bun run build        # Build both browser and Node.js versions
bun run build:node   # Build Node.js version only
bun run build:browser # Build browser version only
bun run build:watch  # Build in watch mode
bun run clean        # Clean build artifacts
```

### Best Practices

#### Connection Management
- **Reuse database connections** when possible
- **Use connection pooling** for PostgreSQL in high-traffic applications
- **Handle connection errors gracefully** with retry logic
- **Close connections** properly to prevent resource leaks

#### Schema Design
- **Use consistent naming conventions** (snake_case for columns)
- **Include created_at and updated_at** timestamp fields
- **Add appropriate indexes** for query performance
- **Use foreign key constraints** to maintain data integrity
- **Plan for schema evolution** with migration strategies

#### Data Types
- **Use TEXT for IDs** to support UUIDs and flexible identifiers
- **Store dates as ISO strings** for cross-database compatibility
- **Use JSON columns** for flexible metadata storage
- **Normalize vector dimensions** for consistent similarity search

#### Error Handling
- **Catch and handle database-specific errors** appropriately
- **Provide meaningful error messages** with context
- **Log query details** for debugging (excluding sensitive data)
- **Implement retry logic** for transient connection errors

## Documentation Links

Always reference the latest documentation when planning database solutions, as these libraries frequently add new features, performance improvements, and vector search capabilities:

### Core Libraries

#### @libsql/client (LibSQL/Turso)
- **Official Documentation**: https://docs.turso.tech/libsql
- **TypeScript SDK**: https://docs.turso.tech/sdk/ts
- **API Reference**: https://docs.turso.tech/sdk/ts/reference
- **Authentication**: https://docs.turso.tech/sdk/authentication
- **Examples**: https://github.com/tursodatabase/libsql-client-ts/tree/main/packages/libsql-client/examples
- **NPM Package**: https://www.npmjs.com/package/@libsql/client

#### sqlite-vss (Vector Similarity Search)
- **Main Repository**: https://github.com/asg017/sqlite-vss
- **Documentation**: https://github.com/asg017/sqlite-vss/blob/main/docs.md
- **API Reference**: https://github.com/asg017/sqlite-vss/blob/main/docs/api.md
- **⚠️ Migration Note**: sqlite-vss is not in active development. Consider migrating to [sqlite-vec](https://github.com/asg017/sqlite-vec) for new projects
- **Migration Guide**: https://alexgarcia.xyz/blog/2024/building-new-vector-search-sqlite/

#### pg (node-postgres)
- **Official Documentation**: https://node-postgres.com/
- **Features**: https://node-postgres.com/features
- **API - Client**: https://node-postgres.com/apis/client
- **API - Pool**: https://node-postgres.com/apis/pool
- **API - Result**: https://node-postgres.com/apis/result
- **GitHub Repository**: https://github.com/brianc/node-postgres
- **NPM Package**: https://www.npmjs.com/package/pg

### Expert Agent Instructions

When working with @have/sql:

1. **Always check latest documentation** before implementing solutions using WebFetch tool
2. **Stay current with LibSQL features** - Turso frequently adds new capabilities
3. **Monitor vector search evolution** - sqlite-vss → sqlite-vec migration path
4. **Review PostgreSQL updates** for new data types and performance features
5. **Check for breaking changes** in major version updates
6. **Look for new connection options** and authentication methods

Example workflow:
```typescript
// Before implementing vector search, check latest docs
await WebFetch.get('https://github.com/asg017/sqlite-vss/blob/main/docs.md');
// Then implement with current best practices
await db.execute`CREATE VIRTUAL TABLE embeddings USING vss0(...)`;
```

### Database-Specific Considerations

#### SQLite/LibSQL
- **Single-writer limitation** - Design for read-heavy workloads
- **WAL mode benefits** - Better concurrency for read operations
- **Extension support** - Vector search, full-text search, JSON functions
- **Encryption at rest** - Available with Turso and enterprise LibSQL

#### PostgreSQL
- **Connection pooling** - Essential for production applications
- **JSON/JSONB support** - Native JSON operations and indexing
- **Array data types** - First-class support for array columns
- **Full-text search** - Built-in text search capabilities
- **Vector extensions** - pgvector for vector similarity search

This package provides a robust foundation for data persistence in the HAVE SDK, designed to be lightweight yet powerful enough for AI-driven applications requiring both traditional relational operations and modern vector search capabilities.