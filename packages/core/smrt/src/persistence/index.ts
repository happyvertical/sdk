/**
 * Persistence layer for SMRT objects
 *
 * Provides abstraction for different persistence backends (SQL, REST, etc.)
 * allowing SMRT objects to use different storage strategies without changing business logic.
 */

import type { SmrtObject } from '../object';
import type { PersistenceAdapter } from './adapter';
import { RestPersistenceAdapter } from './rest-adapter';
import { SqlPersistenceAdapter } from './sql-adapter';
import type { PersistenceConfig } from './types';

/**
 * Factory function to create appropriate persistence adapter
 *
 * @param config - Persistence configuration
 * @param objectClass - SMRT object class constructor
 * @returns Promise resolving to initialized persistence adapter
 * @throws Error if configuration type is invalid
 */
export async function createPersistenceAdapter(
  config: PersistenceConfig,
  objectClass: new (...args: any[]) => SmrtObject,
): Promise<PersistenceAdapter> {
  let adapter: PersistenceAdapter;

  switch (config.type) {
    case 'sql':
      adapter = new SqlPersistenceAdapter(config, objectClass);
      break;

    case 'rest':
      adapter = new RestPersistenceAdapter(config, objectClass);
      break;

    default:
      throw new Error(
        `Invalid persistence type: ${(config as any).type}. Must be 'sql' or 'rest'.`,
      );
  }

  await adapter.initialize();
  return adapter;
}

// Export all types and classes
export type { PersistenceAdapter, AdapterFactory } from './adapter';
export type {
  PersistenceConfig,
  SqlPersistenceConfig,
  RestPersistenceConfig,
  LoadFilter,
  ListOptions,
  CountOptions,
  SaveResult,
  AdapterMetadata,
} from './types';
export { SqlPersistenceAdapter } from './sql-adapter';
export { RestPersistenceAdapter } from './rest-adapter';
