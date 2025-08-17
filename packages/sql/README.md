# @have/sql

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Database interaction library with support for SQLite and PostgreSQL in the HAVE SDK.

## Overview

The `@have/sql` package provides a simple and consistent interface for interacting with SQL databases. It supports both SQLite and PostgreSQL with the same API, making it easy to develop locally with SQLite and deploy to production with PostgreSQL.

## Features

- Unified API for SQLite and PostgreSQL
- Template literal query interface with automatic parameterization
- Type-safe query results
- Simple CRUD operations with minimal boilerplate
- Connection pooling and efficient resource management
- Transaction support
- Migration utilities
- No ORM overhead, just raw SQL with safety features

## Installation

```bash
# Install with npm
npm install @have/sql

# Or with yarn
yarn add @have/sql

# Or with bun
bun add @have/sql
```

## Usage

### Connecting to a Database

```typescript
import { getDatabase } from '@have/sql';

// Connect to SQLite
const sqliteDb = await getDatabase({
  file: ':memory:', // In-memory database
  // Or use a file path:
  // file: './my-database.sqlite',
});

// Connect to PostgreSQL
const pgDb = await getDatabase({
  host: 'localhost',
  port: 5432,
  database: 'my_database',
  user: 'username',
  password: 'password',
});
```

### Executing Queries

The package provides several template literal functions for different query types:

- `oo` - Returns all rows from a query
- `oO` - Returns a single row
- `ox` - Returns a single value (first column of first row)
- `xx` - Executes a statement (no return value)

```typescript
// Fetch all posts
const { oo } = db;
const posts = await oo`
  SELECT * FROM posts
  WHERE published = true
  ORDER BY created_at DESC
`;
console.log(posts);

// Fetch a single post
const { oO } = db;
const post = await oO`
  SELECT * FROM posts
  WHERE id = ${postId}
`;
console.log(post);

// Get a count
const { ox } = db;
const count = await ox`
  SELECT COUNT(*) FROM posts
  WHERE author = ${authorName}
`;
console.log(`Found ${count} posts by ${authorName}`);

// Execute a statement
const { xx } = db;
await xx`
  DELETE FROM posts
  WHERE id = ${postId}
`;
```

### Using CRUD Helper Functions

```typescript
// Insert data
const newPost = await db.insert('posts', {
  title: 'Hello World',
  content: 'This is my first post',
  author: 'Jane Doe',
  created_at: new Date()
});

// Get a record by criteria
const post = await db.get('posts', { id: 123 });

// List records with filters
const recentPosts = await db.list('posts', {
  author: 'Jane Doe',
  published: true
});

// Update records
await db.update('posts', 
  { id: 123 }, // where
  { title: 'Updated Title' } // set
);

// Create a table-specific helper
const postsTable = db.table('posts');
const post = await postsTable.get({ id: 123 });
const newPost = await postsTable.insert({
  title: 'Another Post',
  content: 'More content here',
  author: 'John Smith'
});
```

### Using Transactions

```typescript
// Start a transaction
await db.transaction(async (tx) => {
  // Use transaction object like the db object
  await tx.xx`
    INSERT INTO categories (name) 
    VALUES (${categoryName})
  `;
  
  const categoryId = await tx.ox`
    SELECT id FROM categories 
    WHERE name = ${categoryName}
  `;
  
  await tx.xx`
    INSERT INTO posts (title, category_id)
    VALUES (${title}, ${categoryId})
  `;
  
  // Transaction automatically commits if no errors
  // Or rolls back if any error is thrown
});
```

## Important Notes

- Always use parameterized queries with the template literal functions
- Don't use variables for table or column names - only for values
- Don't accept unsanitized user input for table or column names
- Keep raw SQL as ANSI-compatible as possible for database portability
- Move complex operations to per-database-adapter functions

## API Reference

See the [API documentation](https://happyvertical.github.io/sdk/modules/_have_sql.html) for detailed information on all available methods and options.

## License

This package is part of the HAVE SDK and is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.