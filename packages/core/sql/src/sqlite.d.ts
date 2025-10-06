import type { DatabaseInterface } from './shared/types';
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
    /**
     * Encryption key for encrypted SQLite databases (LibSQL feature)
     */
    encryptionKey?: string;
}
/**
 * Creates a SQLite database adapter
 *
 * @param options - SQLite connection options
 * @returns Database interface for SQLite
 */
export declare function getDatabase(options?: SqliteOptions): DatabaseInterface;
