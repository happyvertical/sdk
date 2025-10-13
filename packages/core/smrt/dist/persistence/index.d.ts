import { SmrtObject } from '../object';
import { PersistenceAdapter } from './adapter';
import { PersistenceConfig } from './types';
/**
 * Factory function to create appropriate persistence adapter
 *
 * @param config - Persistence configuration
 * @param objectClass - SMRT object class constructor
 * @returns Promise resolving to initialized persistence adapter
 * @throws Error if configuration type is invalid
 */
export declare function createPersistenceAdapter(config: PersistenceConfig, objectClass: new (...args: any[]) => SmrtObject): Promise<PersistenceAdapter>;
export type { PersistenceAdapter, AdapterFactory } from './adapter';
export type { PersistenceConfig, SqlPersistenceConfig, RestPersistenceConfig, LoadFilter, ListOptions, CountOptions, SaveResult, AdapterMetadata, } from './types';
export { SqlPersistenceAdapter } from './sql-adapter';
export { RestPersistenceAdapter } from './rest-adapter';
//# sourceMappingURL=index.d.ts.map