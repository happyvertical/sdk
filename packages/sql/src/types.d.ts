/**
 * Common database connection options
 */
export interface DatabaseOptions {
    /**
     * Database connection URL
     */
    url?: string;
    /**
     * Authentication token for the database connection
     */
    authToken?: string;
}
/**
 * Result of a database operation that modifies data
 */
export interface QueryResult {
    /**
     * Type of operation performed (e.g., "insert", "update", "delete")
     */
    operation: string;
    /**
     * Number of rows affected by the operation
     */
    affected: number;
}
/**
 * Common interface for database adapters
 * Provides a unified API for different database backends
 */
export interface DatabaseInterface {
    /**
     * Underlying database client instance
     */
    client: any;
    /**
     * Inserts one or more records into a table
     *
     * @param table - Table name
     * @param data - Single record or array of records to insert
     * @returns Promise resolving to operation result
     */
    insert: (table: string, data: Record<string, any> | Record<string, any>[]) => Promise<QueryResult>;
    /**
     * Retrieves a single record matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records
     * @returns Promise resolving to matching record or null if not found
     */
    get: (table: string, where: Record<string, any>) => Promise<Record<string, any> | null>;
    /**
     * Retrieves multiple records matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records
     * @returns Promise resolving to array of matching records
     */
    list: (table: string, where: Record<string, any>) => Promise<Record<string, any>[]>;
    /**
     * Updates records matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records to update
     * @param data - New data to set
     * @returns Promise resolving to operation result
     */
    update: (table: string, where: Record<string, any>, data: Record<string, any>) => Promise<QueryResult>;
    /**
     * Gets a record matching the where criteria or inserts it if not found
     *
     * @param table - Table name
     * @param where - Criteria to match existing record
     * @param data - Data to insert if no record found
     * @returns Promise resolving to the record (either retrieved or newly inserted)
     */
    getOrInsert: (table: string, where: Record<string, any>, data: Record<string, any>) => Promise<Record<string, any>>;
    /**
     * Creates a table-specific interface for simplified table operations
     *
     * @param table - Table name
     * @returns TableInterface for the specified table
     */
    table: (table: string) => TableInterface;
    /**
     * Checks if a table exists in the database
     *
     * @param table - Table name
     * @returns Promise resolving to boolean indicating existence
     */
    tableExists: (table: string) => Promise<boolean>;
    /**
     * Executes a SQL query using template literals and returns multiple rows
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise resolving to array of result records
     */
    many: (strings: TemplateStringsArray, ...vars: any[]) => Promise<Record<string, any>[]>;
    /**
     * Executes a SQL query using template literals and returns a single row
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise resolving to a single result record or null
     */
    single: (strings: TemplateStringsArray, ...vars: any[]) => Promise<Record<string, any> | null>;
    /**
     * Executes a SQL query using template literals and returns a single value
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise resolving to a single value (first column of first row)
     */
    pluck: (strings: TemplateStringsArray, ...vars: any[]) => Promise<any>;
    /**
     * Executes a SQL query using template literals without returning results
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise that resolves when the query completes
     */
    execute: (strings: TemplateStringsArray, ...vars: any[]) => Promise<void>;
    /**
     * Alias for many() - Executes a SQL query and returns multiple rows
     */
    oo: (strings: TemplateStringsArray, ...vars: any[]) => Promise<Record<string, any>[]>;
    /**
     * Alias for single() - Executes a SQL query and returns a single row
     */
    oO: (strings: TemplateStringsArray, ...vars: any[]) => Promise<Record<string, any> | null>;
    /**
     * Alias for pluck() - Executes a SQL query and returns a single value
     */
    ox: (strings: TemplateStringsArray, ...vars: any[]) => Promise<any>;
    /**
     * Alias for execute() - Executes a SQL query without returning results
     */
    xx: (strings: TemplateStringsArray, ...vars: any[]) => Promise<void>;
    /**
     * Executes a raw SQL query with parameterized values
     *
     * @param str - SQL query string
     * @param vars - Variables to use as parameters
     * @returns Promise resolving to query result with rows and count
     */
    query: (str: string, ...vars: any[]) => Promise<{
        rows: Record<string, any>[];
        rowCount: number;
    }>;
}
/**
 * Simplified interface for table-specific operations
 */
export interface TableInterface {
    /**
     * Inserts one or more records into the table
     *
     * @param data - Single record or array of records to insert
     * @returns Promise resolving to operation result
     */
    insert: (data: Record<string, any> | Record<string, any>[]) => Promise<QueryResult>;
    /**
     * Retrieves a single record from the table matching the where criteria
     *
     * @param where - Criteria to match records
     * @returns Promise resolving to matching record or null if not found
     */
    get: (where: Record<string, any>) => Promise<Record<string, any> | null>;
    /**
     * Retrieves multiple records from the table matching the where criteria
     *
     * @param where - Criteria to match records
     * @returns Promise resolving to array of matching records
     */
    list: (where: Record<string, any>) => Promise<Record<string, any>[]>;
}
//# sourceMappingURL=types.d.ts.map