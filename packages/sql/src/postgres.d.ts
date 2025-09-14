import { Pool, QueryResult } from "pg";
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
}
/**
 * Result of a database operation that modifies data
 */
interface QueryResponse {
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
 * Interface for table-specific operations
 */
interface TableMethods {
    /**
     * Inserts one or more records into the table
     *
     * @param data - Single record or array of records to insert
     * @returns Promise resolving to operation result
     */
    insert: (data: Record<string, any> | Record<string, any>[]) => Promise<QueryResponse>;
    /**
     * Retrieves a single record from the table matching the where criteria
     *
     * @param data - Criteria to match records
     * @returns Promise resolving to query result
     */
    get: (data: Record<string, any>) => Promise<QueryResult>;
    /**
     * Retrieves multiple records from the table matching the where criteria
     *
     * @param data - Criteria to match records
     * @returns Promise resolving to array of records
     */
    list: (data: Record<string, any>) => Promise<any[]>;
}
/**
 * Creates a PostgreSQL database adapter
 *
 * @param options - PostgreSQL connection options
 * @returns Database interface for PostgreSQL
 */
export declare function getDatabase(options?: PostgresOptions): {
    client: Pool;
    insert: (table: string, data: Record<string, any> | Record<string, any>[]) => Promise<QueryResponse>;
    update: (table: string, where: Record<string, any>, data: Record<string, any>) => Promise<QueryResponse>;
    get: (table: string, where: Record<string, any>) => Promise<QueryResult>;
    getOrInsert: (table: string, where: Record<string, any>) => Promise<QueryResult | QueryResponse>;
    list: (table: string, where: Record<string, any>) => Promise<any[]>;
    table: (tableName: string) => TableMethods;
    many: (strings: TemplateStringsArray, ...vars: any[]) => Promise<Record<string, any>[]>;
    single: (strings: TemplateStringsArray, ...vars: any[]) => Promise<Record<string, any> | null>;
    pluck: (strings: TemplateStringsArray, ...vars: any[]) => Promise<any>;
    execute: (strings: TemplateStringsArray, ...vars: any[]) => Promise<void>;
    query: (sql: string, values: any[]) => Promise<{
        rows: Record<string, any>[];
        rowCount: number;
    }>;
    oo: (strings: TemplateStringsArray, ...vars: any[]) => Promise<Record<string, any>[]>;
    oO: (strings: TemplateStringsArray, ...vars: any[]) => Promise<Record<string, any> | null>;
    ox: (strings: TemplateStringsArray, ...vars: any[]) => Promise<any>;
    xx: (strings: TemplateStringsArray, ...vars: any[]) => Promise<void>;
    tableExists: (tableName: string) => Promise<boolean>;
};
export {};
//# sourceMappingURL=postgres.d.ts.map