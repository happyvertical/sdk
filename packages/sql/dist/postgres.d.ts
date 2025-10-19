import { DatabaseInterface } from './shared/types';
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
export declare function getDatabase(options?: PostgresOptions): DatabaseInterface;
//# sourceMappingURL=postgres.d.ts.map