import { SmrtObject } from '../object';
import { PersistenceAdapter } from './adapter';
import { AdapterMetadata, CountOptions, ListOptions, LoadFilter, SaveResult, SqlPersistenceConfig } from './types';
/**
 * SQL persistence adapter implementation
 *
 * Wraps @have/sql DatabaseInterface to provide persistence for SMRT objects
 */
export declare class SqlPersistenceAdapter implements PersistenceAdapter {
    readonly metadata: AdapterMetadata;
    private db;
    private config;
    private objectClass;
    private tableName;
    private initialized;
    constructor(config: SqlPersistenceConfig, objectClass: new (...args: any[]) => SmrtObject);
    initialize(): Promise<void>;
    save(object: SmrtObject): Promise<SaveResult>;
    load<T extends SmrtObject>(filter: LoadFilter, objectClass: new (options: any) => T): Promise<T | null>;
    /**
     * Build SELECT clause with aliases for eager-loaded relationships
     * Uses snake_case column names from database
     *
     * @param include - Array of relationship field names to include
     * @param objectClass - Main object class constructor
     * @returns SQL SELECT clause with aliased columns
     * @private
     */
    private buildSelectClause;
    /**
     * Build JOIN clauses for eager-loaded relationships
     * Converts camelCase property names to snake_case column names
     *
     * @param include - Array of relationship field names to include
     * @param objectClass - Main object class constructor
     * @returns SQL JOIN clauses
     * @private
     */
    private buildJoinClause;
    /**
     * Hydrate flat SQL result rows into nested object structures
     * Converts snake_case column aliases back to camelCase property names
     *
     * @param rows - Flat SQL result rows with aliased columns
     * @param include - Array of included relationship field names
     * @param objectClass - Main object class constructor
     * @returns Array of hydrated object instances with relationships pre-loaded
     * @private
     */
    private hydrateResultSet;
    list<T extends SmrtObject>(options: ListOptions, objectClass: new (options: any) => T): Promise<T[]>;
    delete(id: string): Promise<void>;
    count(options: CountOptions): Promise<number>;
    bulkSave(objects: SmrtObject[]): Promise<void>;
    close(): Promise<void>;
    /**
     * Validates object state before saving
     */
    private validateBeforeSave;
    /**
     * Generates slug from object name, or falls back to ID if name is not provided
     *
     * When using ID (UUID), hyphens are stripped to create a slug that:
     * - Doesn't match UUID regex patterns (no hyphens)
     * - Is reversible (add hyphens back at positions 8, 12, 16, 20 for UUID)
     */
    private generateSlug;
    /**
     * Gets the ID of object if it exists in database
     */
    private getSavedId;
    /**
     * Generates UPSERT SQL statement for object
     * Converts camelCase property names to snake_case column names
     */
    private generateUpsertStatement;
    /**
     * Extracts field name from database constraint error messages
     */
    private extractConstraintField;
}
//# sourceMappingURL=sql-adapter.d.ts.map