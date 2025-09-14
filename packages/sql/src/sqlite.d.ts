import type { DatabaseInterface } from "./types.js";
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
export declare function getDatabase(options?: SqliteOptions): DatabaseInterface;
//# sourceMappingURL=sqlite.d.ts.map