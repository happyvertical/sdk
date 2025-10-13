import { SmrtObject } from '../object';
import { PersistenceAdapter } from './adapter';
import { AdapterMetadata, CountOptions, ListOptions, LoadFilter, RestPersistenceConfig, SaveResult } from './types';
/**
 * REST persistence adapter implementation
 *
 * Uses HTTP fetch API to communicate with REST endpoints
 */
export declare class RestPersistenceAdapter implements PersistenceAdapter {
    readonly metadata: AdapterMetadata;
    private config;
    private objectClass;
    private baseUrl;
    private headers;
    private timeout;
    private initialized;
    constructor(config: RestPersistenceConfig, objectClass: new (...args: any[]) => SmrtObject);
    initialize(): Promise<void>;
    save(object: SmrtObject): Promise<SaveResult>;
    load<T extends SmrtObject>(filter: LoadFilter, objectClass: new (options: any) => T): Promise<T | null>;
    list<T extends SmrtObject>(options: ListOptions, objectClass: new (options: any) => T): Promise<T[]>;
    delete(id: string): Promise<void>;
    count(options: CountOptions): Promise<number>;
    bulkSave(objects: SmrtObject[]): Promise<void>;
    close(): Promise<void>;
    /**
     * Make HTTP request with retry logic
     */
    private request;
    /**
     * Check if object exists by ID
     */
    private checkExists;
    /**
     * Serialize object for transmission
     */
    private serializeObject;
    /**
     * Build query string from filter object
     */
    private buildQueryString;
    /**
     * Map SQL-style operators to REST query param conventions
     */
    private mapOperator;
}
//# sourceMappingURL=rest-adapter.d.ts.map