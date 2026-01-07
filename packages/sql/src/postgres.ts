import { DatabaseError, loadEnvConfig } from '@happyvertical/utils';
import { Pool } from 'pg';
import { DatabaseSchemaManager } from './schema-manager';
import {
  generateAddColumnStatement,
  generateCreateIndexStatement,
  validateColumnName,
  validateIndexName,
  validateTableName,
} from './shared/alter-utils';
import type {
  QueryResult as BaseQueryResult,
  ColumnDefinition,
  ColumnDefinitionWithName,
  DatabaseInterface,
  IndexDefinition,
  SchemaInitializationOptions,
  TableInterface,
  TableSchemaInfo,
  TransactionHandle,
} from './shared/types';
import { buildWhere } from './shared/utils';

/**
 * Configuration options for PostgreSQL database connections
 */
export interface PostgresOptions {
  /**
   * Connection URL for PostgreSQL
   */
  url?: string;

  /**
   * Database name
   */
  database?: string;

  /**
   * Database server hostname
   */
  host?: string;

  /**
   * Username for authentication
   */
  user?: string;

  /**
   * Password for authentication
   */
  password?: string;

  /**
   * Port number for the PostgreSQL server
   */
  port?: number;

  /**
   * Explicit schema definitions for tables
   * When provided, these schemas will be used for table creation
   */
  schemas?: Record<string, import('./shared/types').SchemaProvider>;
}

/**
 * Creates tables from provided schema definitions
 *
 * @param pool - PostgreSQL connection pool
 * @param schemas - Schema definitions to create
 */
async function createTablesFromSchemas(
  pool: Pool,
  schemas: Record<string, import('./shared/types').SchemaProvider>,
): Promise<void> {
  for (const [tableName, schema] of Object.entries(schemas)) {
    try {
      // Check if table already exists
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT FROM pg_tables
          WHERE tablename = $1
        )`,
        [tableName],
      );

      if (result.rows[0].exists) {
        console.log(`[postgres] Table ${tableName} already exists, skipping`);
        continue;
      }

      console.log(
        `[postgres] Creating table ${tableName} from provided schema`,
      );

      // Create table from DDL
      await pool.query(schema.ddl);

      // Create indexes
      if (schema.indexes && schema.indexes.length > 0) {
        for (const indexSQL of schema.indexes) {
          try {
            await pool.query(indexSQL);
          } catch (error) {
            console.warn(
              `[postgres] Failed to create index for ${tableName}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      // Create triggers (if supported)
      if (schema.triggers && schema.triggers.length > 0) {
        for (const triggerSQL of schema.triggers) {
          try {
            await pool.query(triggerSQL);
          } catch (error) {
            console.warn(
              `[postgres] Failed to create trigger for ${tableName}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(
        `Failed to create table ${tableName} from schema: ${errMsg}`,
        {
          tableName,
          schema,
          originalError: errMsg,
        },
      );
    }
  }
}

/**
 * Creates a PostgreSQL database adapter
 *
 * Loads configuration from environment variables with backward compatibility:
 * - First checks HAVE_SQL_* environment variables (new standard)
 * - Falls back to SQLOO_* environment variables (legacy)
 * - User-provided options always take precedence
 *
 * Environment variables:
 * - HAVE_SQL_URL / SQLOO_URL → Connection string (takes precedence)
 * - HAVE_SQL_DATABASE / SQLOO_DATABASE → Database name
 * - HAVE_SQL_HOST / SQLOO_HOST → Host (default: 'localhost')
 * - HAVE_SQL_USER / SQLOO_USER → Username
 * - HAVE_SQL_PASSWORD / SQLOO_PASSWORD → Password
 * - HAVE_SQL_PORT / SQLOO_PORT → Port (default: 5432)
 *
 * @param options - PostgreSQL connection options
 * @returns Database interface for PostgreSQL
 */
export async function getDatabase(
  options: PostgresOptions = {},
): Promise<DatabaseInterface> {
  // Load HAVE_SQL_* environment variables first
  const config = loadEnvConfig(options, {
    packageName: 'sql',
    schema: {
      url: 'string',
      database: 'string',
      host: 'string',
      port: 'number',
      user: 'string',
      password: 'string',
    },
  });

  // For backward compatibility, fall back to SQLOO_* if HAVE_SQL_* not set
  // Only check legacy vars if the new ones aren't present
  if (!config.url && !config.host && !config.database && !config.user) {
    const legacyConfig = loadEnvConfig(
      {},
      {
        prefix: 'SQLOO',
        schema: {
          url: 'string',
          database: 'string',
          host: 'string',
          port: 'number',
          user: 'string',
          password: 'string',
        },
      },
    );

    // Merge legacy config, but don't override user options or HAVE_SQL_* vars
    for (const [key, value] of Object.entries(legacyConfig)) {
      if ((config as any)[key] === undefined && value !== undefined) {
        (config as any)[key] = value;
      }
    }
  }

  // Apply defaults
  const { database, host = 'localhost', user, password, port = 5432 } = config;

  // Construct url if not provided (for DatabaseInterface requirement)
  const url: string =
    (config.url as string) ||
    `postgresql://${user}${password ? `:${password}` : ''}@${host}:${port}/${database || 'postgres'}`;

  // Create a connection pool
  const client = new Pool(
    config.url
      ? { connectionString: config.url as string }
      : {
          host: host as string,
          user: user as string,
          password: password as string,
          port: port as number,
          database: database as string,
        },
  );

  // Initialize tables from provided schemas
  if (options.schemas && Object.keys(options.schemas).length > 0) {
    await createTablesFromSchemas(client, options.schemas);
  }

  /**
   * Inserts one or more records into a table
   *
   * @param table - Table name
   * @param data - Single record or array of records to insert
   * @returns Promise resolving to operation result
   * @throws Error if the insert operation fails
   *
   * @example Single record insert:
   * ```typescript
   * await db.insert('users', {
   *   name: 'John Doe',
   *   email: 'john@example.com'
   * });
   * ```
   *
   * @example Multiple record insert:
   * ```typescript
   * await db.insert('users', [
   *   { name: 'John', email: 'john@example.com' },
   *   { name: 'Jane', email: 'jane@example.com' }
   * ]);
   * ```
   */
  const insert = async (
    table: string,
    data: Record<string, any> | Record<string, any>[],
  ): Promise<BaseQueryResult> => {
    // If data is an array, we need to handle multiple rows
    if (Array.isArray(data)) {
      const keys = Object.keys(data[0]);
      const placeholders = data
        .map(
          (_, i) =>
            `(${keys.map((_, j) => `$${i * keys.length + j + 1}`).join(', ')})`,
        )
        .join(', ');
      const query = `INSERT INTO ${table} (${keys.join(
        ', ',
      )}) VALUES ${placeholders}`;
      const values = data.reduce(
        (acc, row) => acc.concat(Object.values(row)),
        [],
      );
      const result = await client.query(query, values);
      return { operation: 'insert', affected: result.rowCount ?? 0 };
    }
    // If data is an object, we handle a single row
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const query = `INSERT INTO ${table} (${keys.join(
      ', ',
    )}) VALUES (${placeholders})`;
    const result = await client.query(query, values);
    return { operation: 'insert', affected: result.rowCount ?? 0 };
  };

  /**
   * Retrieves a single record matching the where criteria
   *
   * @param table - Table name
   * @param where - Criteria to match records
   * @returns Promise resolving to query result
   */
  const get = async (
    table: string,
    where: Record<string, any>,
  ): Promise<Record<string, any> | null> => {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const whereClause = keys
      .map((key, i) => `${key} = $${i + 1}`)
      .join(' AND ');
    const query = `SELECT * FROM ${table} WHERE ${whereClause}`;
    try {
      const result = await client.query(query, values);
      return result.rows[0] || null;
    } catch (e) {
      throw new DatabaseError('Failed to retrieve record from table', {
        table,
        sql: query,
        values,
        originalError: e instanceof Error ? e.message : String(e),
      });
    }
  };

  /**
   * Retrieves multiple records matching the where criteria
   *
   * @param table - Table name
   * @param where - Criteria to match records
   * @returns Promise resolving to array of records
   */
  const list = async (
    table: string,
    where: Record<string, any>,
  ): Promise<Record<string, any>[]> => {
    const { sql: whereClause, values } = buildWhere(where, 1);
    const query = `SELECT * FROM ${table} ${whereClause}`;
    try {
      const result = await client.query(query, values);
      return result.rows;
    } catch (e) {
      throw new DatabaseError('Failed to list records from table', {
        table,
        sql: query,
        values,
        originalError: e instanceof Error ? e.message : String(e),
      });
    }
  };

  /**
   * Updates records matching the where criteria
   *
   * @param table - Table name
   * @param where - Criteria to match records to update
   * @param data - New data to set
   * @returns Promise resolving to operation result
   */
  const update = async (
    table: string,
    where: Record<string, any>,
    data: Record<string, any>,
  ): Promise<BaseQueryResult> => {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    const whereKeys = Object.keys(where);
    const whereValues = Object.values(where);
    const whereClause = whereKeys
      .map((key, i) => `${key} = $${i + 1 + values.length}`)
      .join(' AND ');

    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    try {
      const result = await client.query(sql, [...values, ...whereValues]);
      return { operation: 'update', affected: result.rowCount ?? 0 };
    } catch (e) {
      throw new DatabaseError('Failed to update records in table', {
        table,
        sql,
        values: [...values, ...whereValues],
        originalError: e instanceof Error ? e.message : String(e),
      });
    }
  };

  /**
   * Inserts a record or updates it if it already exists (UPSERT)
   *
   * @param table - Table name
   * @param conflictColumns - Columns that define the uniqueness constraint
   * @param data - Data to insert or update
   * @returns Promise resolving to operation result
   * @throws Error if the upsert operation fails
   */
  const upsert = async (
    table: string,
    conflictColumns: string[],
    data: Record<string, any>,
  ): Promise<BaseQueryResult> => {
    // Validate that all conflict columns are present in the data
    const missingColumns = conflictColumns.filter((col) => !(col in data));

    if (missingColumns.length > 0) {
      throw new DatabaseError('Conflict columns missing from data', {
        table,
        conflictColumns,
        missingColumns,
        availableColumns: Object.keys(data),
        hint: 'All columns specified in ON CONFLICT must be present in the data being inserted. Undefined values should be replaced with null or an appropriate default.',
      });
    }

    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const updateSet = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    const conflict = conflictColumns.join(', ');

    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${conflict}) DO UPDATE SET ${updateSet}`;

    try {
      const result = await client.query(sql, values);
      return { operation: 'upsert', affected: result.rowCount ?? 0 };
    } catch (e) {
      throw new DatabaseError('Failed to upsert record into table', {
        table,
        sql,
        values,
        conflictColumns,
        originalError: e instanceof Error ? e.message : String(e),
      });
    }
  };

  /**
   * Gets a record matching the where criteria or inserts it if not found
   *
   * @param table - Table name
   * @param where - Criteria to match existing record
   * @returns Promise resolving to the query result or insert result
   */
  const getOrInsert = async (
    table: string,
    where: Record<string, any>,
    data: Record<string, any>,
  ): Promise<Record<string, any>> => {
    const result = await get(table, where);
    if (result) return result;
    await insert(table, data);

    const inserted = await get(table, where);
    if (!inserted) {
      throw new DatabaseError('Failed to insert and retrieve record', {
        table,
        where,
        data,
      });
    }
    return inserted;
  };

  /**
   * Deletes records from a table matching the where criteria
   *
   * @param table - Table name
   * @param where - Criteria to match records for deletion
   * @returns Promise resolving to operation result with count of deleted rows
   * @throws Error if the delete operation fails
   */
  const deleteRecords = async (
    table: string,
    where: Record<string, any>,
  ): Promise<BaseQueryResult> => {
    validateTableName(table);

    const keys = Object.keys(where);
    if (keys.length === 0) {
      throw new DatabaseError(
        'DELETE requires at least one WHERE condition to prevent accidental deletion of all records',
        { table },
      );
    }

    const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
    const values = Object.values(where);

    try {
      const result = await client.query(
        `DELETE FROM ${table} WHERE ${conditions}`,
        values,
      );

      return { operation: 'delete', affected: result.rowCount ?? 0 };
    } catch (e) {
      throw new DatabaseError('Failed to delete records from table', {
        table,
        where,
        originalError: e,
      });
    }
  };

  /**
   * Counts records in a table matching the where criteria
   *
   * @param table - Table name
   * @param where - Criteria to match records (optional, counts all if omitted)
   * @returns Promise resolving to count of matching records
   * @throws Error if the count operation fails
   */
  const count = async (
    table: string,
    where?: Record<string, any>,
  ): Promise<number> => {
    validateTableName(table);

    try {
      if (!where || Object.keys(where).length === 0) {
        // Count all records
        const result = await client.query(
          `SELECT COUNT(*) as count FROM ${table}`,
        );
        return Number(result.rows[0]?.count) || 0;
      }

      // Count with conditions
      const keys = Object.keys(where);
      const conditions = keys
        .map((key, i) => `${key} = $${i + 1}`)
        .join(' AND ');
      const values = Object.values(where);

      const result = await client.query(
        `SELECT COUNT(*) as count FROM ${table} WHERE ${conditions}`,
        values,
      );

      return Number(result.rows[0]?.count) || 0;
    } catch (e) {
      throw new DatabaseError('Failed to count records in table', {
        table,
        where,
        originalError: e,
      });
    }
  };

  /**
   * Creates a table-specific interface for simplified table operations
   *
   * @param tableName - Table name
   * @returns TableMethods interface for the specified table
   */
  const table = (tableName: string): TableInterface => {
    return {
      insert: (data) => insert(tableName, data),
      get: (data) => get(tableName, data),
      list: (data) => list(tableName, data),
    };
  };

  /**
   * Template and values extracted from a tagged template literal
   */
  interface SqlTemplate {
    /**
     * SQL query with parameter placeholders
     */
    sql: string;

    /**
     * Values to use as parameters
     */
    values: any[];
  }

  /**
   * Parses a tagged template literal into a SQL query and values
   *
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Object with SQL query and values array
   */
  const parseTemplate = (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): SqlTemplate => {
    let sql = strings[0];
    const values = [];
    for (let i = 0; i < vars.length; i++) {
      values.push(vars[i]);
      sql += `$${i + 1}${strings[i + 1]}`;
    }
    return { sql, values };
  };

  /**
   * Executes a SQL query using template literals and returns a single value
   *
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Promise resolving to a single value (first column of first row)
   */
  const pluck = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<any> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    try {
      const result = await client.query(sql, values);
      const firstRow = result.rows[0];
      if (!firstRow) return null;
      // Return the first column value from the first row
      return Object.values(firstRow)[0];
    } catch (e) {
      throw new DatabaseError('Failed to execute pluck query', {
        sql,
        values,
        originalError: e instanceof Error ? e.message : String(e),
      });
    }
  };

  /**
   * Executes a SQL query using template literals and returns a single row
   *
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Promise resolving to a single result record or null
   */
  const single = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<Record<string, any> | null> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    try {
      const result = await client.query(sql, values);
      return result.rows[0] || null;
    } catch (e) {
      throw new DatabaseError('Failed to execute single query', {
        sql,
        values,
        originalError: e instanceof Error ? e.message : String(e),
      });
    }
  };

  /**
   * Executes a SQL query using template literals and returns multiple rows
   *
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Promise resolving to array of result records
   */
  const many = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<Record<string, any>[]> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    try {
      const result = await client.query(sql, values);
      return result.rows;
    } catch (e) {
      throw new DatabaseError('Failed to execute many query', {
        sql,
        values,
        originalError: e instanceof Error ? e.message : String(e),
      });
    }
  };

  /**
   * Executes a SQL query using template literals without returning results
   *
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Promise that resolves when the query completes
   */
  const execute = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<void> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    try {
      await client.query(sql, values);
    } catch (e) {
      throw new DatabaseError('Failed to execute query', {
        sql,
        values,
        originalError: e instanceof Error ? e.message : String(e),
      });
    }
  };

  /**
   * Executes a raw SQL query with parameterized values
   *
   * @param sql - SQL query string
   * @param values - Variables to use as parameters
   * @returns Promise resolving to query result with rows and count
   */
  const query = async (
    sql: string,
    ...values: any[]
  ): Promise<{ rows: Record<string, any>[]; rowCount: number }> => {
    try {
      const result = await client.query(sql, values);
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? 0,
      };
    } catch (e) {
      throw new DatabaseError('Failed to execute raw query', {
        sql,
        values,
        originalError: e instanceof Error ? e.message : String(e),
      });
    }
  };

  /**
   * Checks if a table exists in the database
   *
   * @param tableName - Name of the table to check
   * @returns Promise resolving to boolean indicating if the table exists
   */
  const tableExists = async (tableName: string): Promise<boolean> => {
    const result = await client.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public')`,
      [tableName],
    );
    return result.rows[0].exists;
  };

  /**
   * Synchronizes database schema with provided SQL DDL
   * Creates tables if they don't exist and adds missing columns
   *
   * @param schema - SQL schema definition with CREATE TABLE statements
   * @returns Promise that resolves when schema is synchronized
   */
  const syncSchema = async (schema: string): Promise<void> => {
    const commands = schema
      .trim()
      .split(';')
      .filter((command) => command.trim() !== '');

    for (const command of commands) {
      const createTableRegex =
        /CREATE TABLE (IF NOT EXISTS )?(\w+) \(([\s\S]+)\)/i;
      const match = command.match(createTableRegex);

      if (match) {
        const tableName = match[2];
        const columns = match[3].trim().split(',\n');

        // Check if table exists
        const exists = await tableExists(tableName);

        if (!exists) {
          // Table doesn't exist, create it
          await client.query(command);
        } else {
          // Table exists, check for missing columns
          for (const column of columns) {
            const columnDef = column.trim();
            const columnMatch = columnDef.match(/(\w+)\s+(\w+[^,]*)/);

            if (columnMatch) {
              const columnName = columnMatch[1];

              // Skip constraint definitions
              if (
                columnName.toUpperCase() === 'PRIMARY' ||
                columnName.toUpperCase() === 'FOREIGN' ||
                columnName.toUpperCase() === 'UNIQUE' ||
                columnName.toUpperCase() === 'CHECK' ||
                columnName.toUpperCase() === 'CONSTRAINT'
              ) {
                continue;
              }

              try {
                // Check if column exists
                const columnExists = await client.query(
                  `SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = $1
                    AND column_name = $2
                    AND table_schema = 'public'
                  )`,
                  [tableName, columnName],
                );

                if (!columnExists.rows[0].exists) {
                  // Column doesn't exist, add it
                  const alterCommand = `ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`;
                  await client.query(alterCommand);
                }
              } catch (error) {
                // If there's an error checking/adding the column, log it but continue
                console.error(
                  `Error adding column ${columnName} to ${tableName}:`,
                  error,
                );
              }
            }
          }
        }
      }
    }
  };

  /**
   * Executes a callback within a database transaction
   * Automatically commits on success or rolls back on error
   *
   * @param callback - Function to execute within transaction
   * @returns Promise resolving to callback result
   */
  const transaction = async <T>(
    callback: (tx: DatabaseInterface) => Promise<T>,
  ): Promise<T> => {
    // Get a client from the pool for the transaction
    const txClient = await client.connect();

    try {
      await txClient.query('BEGIN');

      // Create a transaction-scoped database interface
      const txDb: DatabaseInterface = {
        url,
        client: txClient,
        insert: async (table, data) => {
          // Reuse insert logic but with transaction client
          if (Array.isArray(data)) {
            const keys = Object.keys(data[0]);
            const placeholders = data
              .map(
                (_, i) =>
                  `(${keys.map((_, j) => `$${i * keys.length + j + 1}`).join(', ')})`,
              )
              .join(', ');
            const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES ${placeholders}`;
            const values = data.reduce(
              (acc, row) => acc.concat(Object.values(row)),
              [] as any[],
            );
            const result = await txClient.query(query, values);
            return { operation: 'insert', affected: result.rowCount ?? 0 };
          }
          const keys = Object.keys(data);
          const values = Object.values(data);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
          const result = await txClient.query(query, values);
          return { operation: 'insert', affected: result.rowCount ?? 0 };
        },
        get: async (table, where) => {
          const keys = Object.keys(where);
          const values = Object.values(where);
          const whereClause = keys
            .map((key, i) => `${key} = $${i + 1}`)
            .join(' AND ');
          const query = `SELECT * FROM ${table} WHERE ${whereClause}`;
          const result = await txClient.query(query, values);
          return result.rows[0] || null;
        },
        list: async (table, where) => {
          const { sql: whereClause, values } = buildWhere(where, 1);
          const query = `SELECT * FROM ${table} ${whereClause}`;
          const result = await txClient.query(query, values);
          return result.rows;
        },
        update: async (table, where, data) => {
          const keys = Object.keys(data);
          const values = Object.values(data);
          const setClause = keys
            .map((key, i) => `${key} = $${i + 1}`)
            .join(', ');
          const whereKeys = Object.keys(where);
          const whereValues = Object.values(where);
          const whereClause = whereKeys
            .map((key, i) => `${key} = $${i + 1 + values.length}`)
            .join(' AND ');
          const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
          const result = await txClient.query(sql, [...values, ...whereValues]);
          return { operation: 'update', affected: result.rowCount ?? 0 };
        },
        upsert: async (table, conflictColumns, data) => {
          const keys = Object.keys(data);
          const values = Object.values(data);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const updateSet = keys
            .map((key, i) => `${key} = $${i + 1}`)
            .join(', ');
          const conflict = conflictColumns.join(', ');
          const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${conflict}) DO UPDATE SET ${updateSet}`;
          const result = await txClient.query(sql, values);
          return { operation: 'upsert', affected: result.rowCount ?? 0 };
        },
        getOrInsert: async (table, where, data) => {
          const result = await txDb.get(table, where);
          if (result) return result;
          await txDb.insert(table, data);
          const inserted = await txDb.get(table, where);
          if (!inserted) {
            throw new DatabaseError('Failed to insert and retrieve record', {
              table,
              where,
              data,
            });
          }
          return inserted;
        },
        delete: async (table, where) => {
          validateTableName(table);
          const keys = Object.keys(where);
          if (keys.length === 0) {
            throw new DatabaseError(
              'DELETE requires at least one WHERE condition to prevent accidental deletion of all records',
              { table },
            );
          }
          const conditions = keys
            .map((key, i) => `${key} = $${i + 1}`)
            .join(' AND ');
          const values = Object.values(where);
          const result = await txClient.query(
            `DELETE FROM ${table} WHERE ${conditions}`,
            values,
          );
          return { operation: 'delete', affected: result.rowCount ?? 0 };
        },
        count: async (table, where) => {
          validateTableName(table);
          if (!where || Object.keys(where).length === 0) {
            const result = await txClient.query(
              `SELECT COUNT(*) as count FROM ${table}`,
            );
            return Number(result.rows[0]?.count) || 0;
          }
          const keys = Object.keys(where);
          const conditions = keys
            .map((key, i) => `${key} = $${i + 1}`)
            .join(' AND ');
          const values = Object.values(where);
          const result = await txClient.query(
            `SELECT COUNT(*) as count FROM ${table} WHERE ${conditions}`,
            values,
          );
          return Number(result.rows[0]?.count) || 0;
        },
        table: (tableName) => ({
          insert: (data) => txDb.insert(tableName, data),
          get: (data) => txDb.get(tableName, data),
          list: (data) => txDb.list(tableName, data),
        }),
        many: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          const result = await txClient.query(sql, values);
          return result.rows;
        },
        single: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          const result = await txClient.query(sql, values);
          return result.rows[0] || null;
        },
        pluck: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          const result = await txClient.query(sql, values);
          const firstRow = result.rows[0];
          if (!firstRow) return null;
          return Object.values(firstRow)[0];
        },
        execute: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          await txClient.query(sql, values);
        },
        query: async (sql, ...values) => {
          const result = await txClient.query(sql, values);
          return {
            rows: result.rows,
            rowCount: result.rowCount ?? 0,
          };
        },
        oo: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          const result = await txClient.query(sql, values);
          return result.rows;
        },
        oO: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          const result = await txClient.query(sql, values);
          return result.rows[0] || null;
        },
        ox: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          const result = await txClient.query(sql, values);
          const firstRow = result.rows[0];
          if (!firstRow) return null;
          return Object.values(firstRow)[0];
        },
        xx: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          await txClient.query(sql, values);
        },
        tableExists,
        syncSchema,
        transaction,
      };

      const result = await callback(txDb);
      await txClient.query('COMMIT');
      return result;
    } catch (error) {
      await txClient.query('ROLLBACK');
      throw error;
    } finally {
      txClient.release();
    }
  };

  /**
   * Begins a new transaction and returns a handle for manual control
   *
   * Unlike transaction(), this gives you explicit control over commit/rollback.
   * Ideal for test isolation where you want to rollback after each test.
   *
   * @returns Promise resolving to a TransactionHandle
   */
  const beginTransaction = async (): Promise<TransactionHandle> => {
    // Get a client from the pool for the transaction
    const txClient = await client.connect();
    await txClient.query('BEGIN');

    let active = true;

    const commit = async (): Promise<void> => {
      if (!active) {
        throw new DatabaseError('Transaction already ended', {});
      }
      await txClient.query('COMMIT');
      active = false;
      txClient.release();
    };

    const rollback = async (): Promise<void> => {
      if (!active) {
        throw new DatabaseError('Transaction already ended', {});
      }
      await txClient.query('ROLLBACK');
      active = false;
      txClient.release();
    };

    const isActive = (): boolean => active;

    // Create a transaction-scoped database interface with commit/rollback
    const txHandle: TransactionHandle = {
      url,
      client: txClient,
      insert: async (table, data) => {
        if (Array.isArray(data)) {
          const keys = Object.keys(data[0]);
          const placeholders = data
            .map(
              (_, i) =>
                `(${keys.map((_, j) => `$${i * keys.length + j + 1}`).join(', ')})`,
            )
            .join(', ');
          const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES ${placeholders}`;
          const values = data.reduce(
            (acc, row) => acc.concat(Object.values(row)),
            [] as any[],
          );
          const result = await txClient.query(query, values);
          return { operation: 'insert', affected: result.rowCount ?? 0 };
        }
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const query = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
        const result = await txClient.query(query, values);
        return { operation: 'insert', affected: result.rowCount ?? 0 };
      },
      get: async (table, where) => {
        const keys = Object.keys(where);
        const values = Object.values(where);
        const whereClause = keys
          .map((key, i) => `${key} = $${i + 1}`)
          .join(' AND ');
        const query = `SELECT * FROM ${table} WHERE ${whereClause}`;
        const result = await txClient.query(query, values);
        return result.rows[0] || null;
      },
      list: async (table, where) => {
        const { sql: whereClause, values } = buildWhere(where, 1);
        const query = `SELECT * FROM ${table} ${whereClause}`;
        const result = await txClient.query(query, values);
        return result.rows;
      },
      update: async (table, where, data) => {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
        const whereKeys = Object.keys(where);
        const whereValues = Object.values(where);
        const whereClause = whereKeys
          .map((key, i) => `${key} = $${i + 1 + values.length}`)
          .join(' AND ');
        const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
        const result = await txClient.query(sql, [...values, ...whereValues]);
        return { operation: 'update', affected: result.rowCount ?? 0 };
      },
      upsert: async (table, conflictColumns, data) => {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const updateSet = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
        const conflict = conflictColumns.join(', ');
        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${conflict}) DO UPDATE SET ${updateSet}`;
        const result = await txClient.query(sql, values);
        return { operation: 'upsert', affected: result.rowCount ?? 0 };
      },
      getOrInsert: async (table, where, data) => {
        const result = await txHandle.get(table, where);
        if (result) return result;
        await txHandle.insert(table, data);
        const inserted = await txHandle.get(table, where);
        if (!inserted) {
          throw new DatabaseError('Failed to insert and retrieve record', {
            table,
            where,
            data,
          });
        }
        return inserted;
      },
      delete: async (table, where) => {
        validateTableName(table);
        const keys = Object.keys(where);
        if (keys.length === 0) {
          throw new DatabaseError(
            'DELETE requires at least one WHERE condition to prevent accidental deletion of all records',
            { table },
          );
        }
        const conditions = keys
          .map((key, i) => `${key} = $${i + 1}`)
          .join(' AND ');
        const values = Object.values(where);
        const result = await txClient.query(
          `DELETE FROM ${table} WHERE ${conditions}`,
          values,
        );
        return { operation: 'delete', affected: result.rowCount ?? 0 };
      },
      count: async (table, where) => {
        validateTableName(table);
        if (!where || Object.keys(where).length === 0) {
          const result = await txClient.query(
            `SELECT COUNT(*) as count FROM ${table}`,
          );
          return Number(result.rows[0]?.count) || 0;
        }
        const keys = Object.keys(where);
        const conditions = keys
          .map((key, i) => `${key} = $${i + 1}`)
          .join(' AND ');
        const values = Object.values(where);
        const result = await txClient.query(
          `SELECT COUNT(*) as count FROM ${table} WHERE ${conditions}`,
          values,
        );
        return Number(result.rows[0]?.count) || 0;
      },
      table: (tableName) => ({
        insert: (data) => txHandle.insert(tableName, data),
        get: (data) => txHandle.get(tableName, data),
        list: (data) => txHandle.list(tableName, data),
      }),
      many: async (strings, ...vars) => {
        const { sql, values } = parseTemplate(strings, ...vars);
        const result = await txClient.query(sql, values);
        return result.rows;
      },
      single: async (strings, ...vars) => {
        const { sql, values } = parseTemplate(strings, ...vars);
        const result = await txClient.query(sql, values);
        return result.rows[0] || null;
      },
      pluck: async (strings, ...vars) => {
        const { sql, values } = parseTemplate(strings, ...vars);
        const result = await txClient.query(sql, values);
        const firstRow = result.rows[0];
        if (!firstRow) return null;
        return Object.values(firstRow)[0];
      },
      execute: async (strings, ...vars) => {
        const { sql, values } = parseTemplate(strings, ...vars);
        await txClient.query(sql, values);
      },
      query: async (sql, ...values) => {
        const result = await txClient.query(sql, values);
        return {
          rows: result.rows,
          rowCount: result.rowCount ?? 0,
        };
      },
      oo: async (strings, ...vars) => {
        const { sql, values } = parseTemplate(strings, ...vars);
        const result = await txClient.query(sql, values);
        return result.rows;
      },
      oO: async (strings, ...vars) => {
        const { sql, values } = parseTemplate(strings, ...vars);
        const result = await txClient.query(sql, values);
        return result.rows[0] || null;
      },
      ox: async (strings, ...vars) => {
        const { sql, values } = parseTemplate(strings, ...vars);
        const result = await txClient.query(sql, values);
        const firstRow = result.rows[0];
        if (!firstRow) return null;
        return Object.values(firstRow)[0];
      },
      xx: async (strings, ...vars) => {
        const { sql, values } = parseTemplate(strings, ...vars);
        await txClient.query(sql, values);
      },
      tableExists,
      syncSchema,
      transaction,
      commit,
      rollback,
      isActive,
    };

    return txHandle;
  };

  // Shorthand aliases for query methods
  const oo = many; // (o)bjective-(o)bjects: returns multiple rows
  const oO = single; // (o)bjective-(O)bject: returns a single row
  const ox = pluck; // (o)bjective-(x): returns a single value
  const xx = execute; // (x)ecute-(x)ecute: executes without returning

  /**
   * Initialize database schemas from JSON manifest
   * Supports dependency resolution and schema overrides
   *
   * @param options - Schema initialization options
   * @returns Promise that resolves when schemas are initialized
   */
  const initializeSchemas = async (
    options: SchemaInitializationOptions,
  ): Promise<void> => {
    const schemaManager = new DatabaseSchemaManager();
    const currentDb: DatabaseInterface = {
      url,
      client,
      insert,
      update,
      upsert,
      get,
      getOrInsert,
      delete: deleteRecords,
      count,
      list,
      table,
      many,
      single,
      pluck,
      execute,
      query,
      oo,
      oO,
      ox,
      xx,
      tableExists,
      syncSchema,
      transaction,
    };

    await schemaManager.initializeSchemas(currentDb, options);
  };

  /**
   * Retrieves the schema information for a table
   *
   * @param table - Table name
   * @returns Promise resolving to table schema info or null if table doesn't exist
   * @throws Error if the query fails
   */
  const getTableSchema = async (
    table: string,
  ): Promise<TableSchemaInfo | null> => {
    validateTableName(table);

    try {
      // Check if table exists
      const exists = await tableExists(table);
      if (!exists) {
        return null;
      }

      // Get column information from information_schema
      const columnRows = await many`
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_name = ${table}
          AND table_schema = 'public'
        ORDER BY ordinal_position
      `;

      // Get primary key columns
      const pkRows = await many`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_name = ${table}
          AND tc.table_schema = 'public'
          AND tc.constraint_type = 'PRIMARY KEY'
      `;

      const pkColumns = new Set(pkRows.map((row) => row.column_name));

      const columns: Record<string, ColumnDefinition> = {};
      for (const row of columnRows) {
        const colName = row.column_name as string;
        columns[colName] = {
          type: row.data_type as string,
          primaryKey: pkColumns.has(colName),
          notNull: row.is_nullable === 'NO',
          defaultValue: row.column_default,
        };
      }

      // Get index information from pg_indexes
      const indexRows = await many`
        SELECT
          indexname,
          indexdef
        FROM pg_indexes
        WHERE tablename = ${table}
          AND schemaname = 'public'
          AND indexname NOT LIKE '%_pkey'
      `;

      const indexes: IndexDefinition[] = [];
      for (const row of indexRows) {
        const indexName = row.indexname as string;
        const indexDef = row.indexdef as string;

        // Parse column names from index definition
        // Example: CREATE INDEX idx_name ON table (col1, col2)
        const colMatch = indexDef.match(/\(([^)]+)\)/);
        const indexColumns = colMatch
          ? colMatch[1].split(',').map((col) => col.trim())
          : [];

        const isUnique = indexDef.toUpperCase().includes('UNIQUE');

        indexes.push({
          name: indexName,
          columns: indexColumns,
          unique: isUnique,
        });
      }

      // Get foreign key information
      const fkRows = await many`
        SELECT
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule,
          rc.update_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name
          AND rc.constraint_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = ${table}
          AND tc.table_schema = 'public'
      `;

      const foreignKeys: Array<{
        column: string;
        referencesTable: string;
        referencesColumn: string;
        onDelete?: string;
        onUpdate?: string;
      }> = [];

      for (const fkRow of fkRows) {
        foreignKeys.push({
          column: fkRow.column_name as string,
          referencesTable: fkRow.foreign_table_name as string,
          referencesColumn: fkRow.foreign_column_name as string,
          onDelete: fkRow.delete_rule as string | undefined,
          onUpdate: fkRow.update_rule as string | undefined,
        });
      }

      return {
        tableName: table,
        columns,
        indexes,
        foreignKeys,
      };
    } catch (e) {
      throw new DatabaseError('Failed to retrieve table schema', {
        table,
        originalError: e instanceof Error ? e.message : String(e),
      });
    }
  };

  /**
   * ALTER TABLE operations for schema evolution
   */
  const alterTable = {
    /**
     * Adds a new column to an existing table
     *
     * @param table - Table name
     * @param column - Column definition with name
     * @returns Promise that resolves when column is added
     * @throws Error if the alter operation fails
     */
    addColumn: async (
      table: string,
      column: ColumnDefinitionWithName,
    ): Promise<void> => {
      validateTableName(table);
      validateColumnName(column.name);

      try {
        const sql = generateAddColumnStatement(table, column, 'postgres');
        await client.query(sql);
      } catch (e) {
        throw new DatabaseError('Failed to add column to table', {
          table,
          column: column.name,
          originalError: e instanceof Error ? e.message : String(e),
        });
      }
    },

    /**
     * Adds a new index to an existing table
     *
     * @param table - Table name
     * @param index - Index definition
     * @returns Promise that resolves when index is created
     * @throws Error if the create index operation fails
     */
    addIndex: async (table: string, index: IndexDefinition): Promise<void> => {
      validateTableName(table);
      validateIndexName(index.name);

      for (const col of index.columns) {
        validateColumnName(col);
      }

      try {
        const sql = generateCreateIndexStatement(table, index);
        await client.query(sql);
      } catch (e) {
        throw new DatabaseError('Failed to create index on table', {
          table,
          index: index.name,
          originalError: e instanceof Error ? e.message : String(e),
        });
      }
    },
  };

  return {
    url,
    client,
    insert,
    update,
    upsert,
    get,
    getOrInsert,
    delete: deleteRecords,
    count,
    list,
    table,
    many,
    single,
    pluck,
    execute,
    query,
    oo,
    oO,
    ox,
    xx,
    tableExists,
    syncSchema,
    initializeSchemas,
    transaction,
    beginTransaction,
    getTableSchema,
    alterTable,
  };
}
