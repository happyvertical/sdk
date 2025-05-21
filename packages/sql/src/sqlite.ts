import { createClient } from "@libsql/client";
import type {
  QueryResult,
  DatabaseInterface,
  TableInterface,
} from "./types.js";
import { buildWhere } from "./index.js";

/**
 * Configuration options for SQLite database connections
 */
export interface SqliteOptions {
  /**
   * Connection URL for SQLite (e.g., "file::memory:", "file:mydb.sqlite")
   */
  url?: string;
  
  /**
   * Authentication token for Turso/LibSQL remote connections
   */
  authToken?: string;
}

/**
 * Creates a SQLite database adapter
 * 
 * @param options - SQLite connection options
 * @returns Database interface for SQLite
 */
export function getDatabase(options: SqliteOptions = {}): DatabaseInterface {
  const { url = "file::memory:", authToken } = options;
  const client = createClient({ url, authToken });

  /**
   * Inserts one or more records into a table
   * 
   * @param table - Table name
   * @param data - Single record or array of records to insert
   * @returns Promise resolving to operation result
   * @throws Error if the insert operation fails
   */
  const insert = async (
    table: string,
    data: Record<string, any> | Record<string, any>[],
  ): Promise<QueryResult> => {
    let sql: string;
    let values: any[];

    if (Array.isArray(data)) {
      const keys = Object.keys(data[0]);
      const placeholders = data
        .map(() => `(${keys.map(() => "?").join(", ")})`)
        .join(", ");
      sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES ${placeholders}`;
      values = data.reduce(
        (acc, row) => acc.concat(Object.values(row)),
        [] as any[],
      );
    } else {
      const keys = Object.keys(data);
      const placeholders = keys.map(() => "?").join(", ");
      sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;
      values = Object.values(data);
    }
    try {
      const result = await client.execute({ sql: sql, args: values });
      return { operation: "insert", affected: result.rowsAffected };
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(values)}\nError: ${e}`,
      );
      throw e;
    }
  };

  /**
   * Retrieves a single record matching the where criteria
   * 
   * @param table - Table name
   * @param where - Criteria to match records
   * @returns Promise resolving to matching record or null if not found
   * @throws Error if the query fails
   */
  const get = async (
    table: string,
    where: Record<string, any>,
  ): Promise<Record<string, any> | null> => {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const whereClause = keys.map((key) => `${key} = ?`).join(" AND ");
    const sql = `SELECT * FROM ${table} WHERE ${whereClause}`;
    try {
      const result = await client.execute({ sql: sql, args: values });
      return result.rows[0] || null;
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(values)}\nError: ${e}`,
      );
      throw e;
    }
  };

  /**
   * Retrieves multiple records matching the where criteria
   * 
   * @param table - Table name
   * @param where - Criteria to match records
   * @returns Promise resolving to array of matching records
   * @throws Error if the query fails
   */
  const list = async (
    table: string,
    where: Record<string, any>,
  ): Promise<Record<string, any>[]> => {
    const { sql: whereClause, values } = buildWhere(where);
    const sql = `SELECT * FROM ${table} ${whereClause}`;
    try {
      const result = await client.execute({ sql, args: values });
      return result.rows;
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(values)}\nError: ${e}`,
      );
      throw e;
    }
  };

  /**
   * Updates records matching the where criteria
   * 
   * @param table - Table name
   * @param where - Criteria to match records to update
   * @param data - New data to set
   * @returns Promise resolving to operation result
   * @throws Error if the update operation fails
   */
  const update = async (
    table: string,
    where: Record<string, any>,
    data: Record<string, any>,
  ): Promise<QueryResult> => {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key) => `${key} = ?`).join(", ");
    const whereKeys = Object.keys(where);
    const whereValues = Object.values(where);
    const whereClause = whereKeys.map((key) => `${key} = ?`).join(" AND ");

    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    try {
      const result = await client.execute({
        sql,
        args: [...values, ...whereValues],
      });
      return { operation: "update", affected: result.rowsAffected };
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify([...values, ...whereValues])}\nError: ${e}`,
      );
      throw e;
    }
  };

  /**
   * Gets a record matching the where criteria or inserts it if not found
   * 
   * @param table - Table name
   * @param where - Criteria to match existing record
   * @param data - Data to insert if no record found
   * @returns Promise resolving to the record (either retrieved or newly inserted)
   * @throws Error if the operation fails or if the record cannot be retrieved after insert
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
      throw new Error("Failed to insert and retrieve record");
    }
    return inserted;
  };

  /**
   * Checks if a table exists in the database
   * 
   * @param tableName - Name of the table to check
   * @returns Promise resolving to boolean indicating if the table exists
   */
  const tableExists = async (tableName: string): Promise<boolean> => {
    const tableExists =
      !!(await pluck`SELECT name FROM sqlite_master WHERE type='table' AND name=${tableName}`);
    return tableExists;
  };

  /**
   * Creates a table-specific interface for simplified table operations
   * 
   * @param tableName - Table name
   * @returns TableInterface for the specified table
   */
  const table = (tableName: string): TableInterface => ({
    insert: (data) => insert(tableName, data),
    get: (where) => get(tableName, where),
    list: (where) => list(tableName, where),
  });

  /**
   * Parses a tagged template literal into a SQL query and values
   * 
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Object with SQL query and values array
   */
  const parseTemplate = (strings: TemplateStringsArray, ...vars: any[]) => {
    let sql = strings[0];
    const values = [];
    for (let i = 0; i < vars.length; i++) {
      values.push(vars[i]);
      sql += "?" + strings[i + 1];
    }
    return { sql, values };
  };

  /**
   * Executes a SQL query using template literals and returns a single value
   * 
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Promise resolving to a single value (first column of first row)
   * @throws Error if the query fails
   */
  const pluck = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<any> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    try {
      const result = await client.execute({ sql, args: values });
      return result.rows[0]?.[Object.keys(result.rows[0])[0]] ?? null;
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(values)}\nError: ${e}`,
      );
      throw e;
    }
  };

  /**
   * Executes a SQL query using template literals and returns a single row
   * 
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Promise resolving to a single result record or null
   * @throws Error if the query fails
   */
  const single = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<Record<string, any> | null> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    try {
      const result = await client.execute({ sql, args: values });
      return result.rows[0] || null;
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(values)}\nError: ${e}`,
      );
      throw e;
    }
  };

  /**
   * Executes a SQL query using template literals and returns multiple rows
   * 
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Promise resolving to array of result records
   * @throws Error if the query fails
   */
  const many = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<Record<string, any>[]> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    try {
      const result = await client.execute({ sql, args: values });
      return result.rows;
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(values)}\nError: ${e}`,
      );
      throw e;
    }
  };

  /**
   * Executes a SQL query using template literals without returning results
   * 
   * @param strings - Template strings
   * @param vars - Variables to interpolate into the query
   * @returns Promise that resolves when the query completes
   * @throws Error if the query fails
   */
  const execute = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<void> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    try {
      await client.execute({ sql, args: values });
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(values)}\nError: ${e}`,
      );
      throw e;
    }
  };

  /**
   * Executes a raw SQL query with parameterized values
   * 
   * @param str - SQL query string
   * @param values - Variables to use as parameters
   * @returns Promise resolving to query result with rows and metadata
   * @throws Error if the query fails
   */
  const query = async (str: string, ...values: any[]) => {
    const sql = str;
    const args = Array.isArray(values[0]) ? values[0] : values;
    try {
      const result = await client.execute({ sql, args });
      return {
        command: sql.split(" ")[0].toUpperCase(),
        rowCount: result.rowsAffected ?? result.rows.length,
        oid: null,
        fields: Object.keys(result.rows[0] || {}).map((name) => ({
          name,
          tableID: 0,
          columnID: 0,
          dataTypeID: 0,
          dataTypeSize: -1,
          dataTypeModifier: -1,
          format: "text",
        })),
        rows: result.rows,
      };
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(args)}\nError: ${e}`,
      );
      throw e;
    }
  };

  // Shorthand aliases for query methods
  const oo = many;   // (o)bjective-(o)bjects: returns multiple rows
  const oO = single; // (o)bjective-(O)bject: returns a single row
  const ox = pluck;  // (o)bjective-(x): returns a single value
  const xx = execute; // (x)ecute-(x)ecute: executes without returning

  return {
    client,
    query,
    insert,
    update,
    get,
    list,
    getOrInsert,
    table,
    tableExists,
    many,
    single,
    pluck,
    execute,
    oo,
    oO,
    ox,
    xx,
  };
}
