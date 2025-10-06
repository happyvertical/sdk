/**
 * Persistence adapter abstraction layer
 *
 * Defines the interface that all persistence backends must implement.
 * This enables SMRT objects to use different storage backends (SQL, REST, etc.)
 * without changing business logic.
 */

import type { SmrtObject } from '../object';
import type {
  AdapterMetadata,
  CountOptions,
  ListOptions,
  LoadFilter,
  SaveResult,
} from './types';

/**
 * Base interface for all persistence adapters
 *
 * Adapters implement this interface to provide persistence capabilities
 * for SMRT objects. The framework supports multiple backends:
 * - SQL (SQLite, PostgreSQL)
 * - REST (HTTP-based microservices)
 * - Future: GraphQL, gRPC, etc.
 */
export interface PersistenceAdapter {
  /**
   * Metadata describing adapter capabilities
   */
  readonly metadata: AdapterMetadata;

  /**
   * Initialize the adapter
   * Performs setup tasks like:
   * - Establishing connections
   * - Creating schema (SQL adapters)
   * - Validating configuration
   *
   * @returns Promise that resolves when initialization is complete
   */
  initialize(): Promise<void>;

  /**
   * Save an object to persistent storage
   * Creates a new record if object.id doesn't exist, otherwise updates
   *
   * @param object - The object to save
   * @returns Promise resolving to save result metadata
   * @throws ValidationError if object validation fails
   * @throws DatabaseError if persistence operation fails
   */
  save(object: SmrtObject): Promise<SaveResult>;

  /**
   * Load a single object from persistent storage
   *
   * @param filter - Load criteria (id, slug+context, or custom filter)
   * @param objectClass - Class constructor to instantiate loaded data
   * @returns Promise resolving to loaded object or null if not found
   * @throws DatabaseError if load operation fails
   */
  load<T extends SmrtObject>(
    filter: LoadFilter,
    objectClass: new (options: any) => T,
  ): Promise<T | null>;

  /**
   * List multiple objects from persistent storage
   *
   * @param options - Query options (where, limit, offset, orderBy)
   * @param objectClass - Class constructor to instantiate loaded data
   * @returns Promise resolving to array of objects
   * @throws DatabaseError if list operation fails
   */
  list<T extends SmrtObject>(
    options: ListOptions,
    objectClass: new (options: any) => T,
  ): Promise<T[]>;

  /**
   * Delete an object from persistent storage
   *
   * @param id - Unique identifier of object to delete
   * @returns Promise that resolves when deletion is complete
   * @throws DatabaseError if delete operation fails
   */
  delete(id: string): Promise<void>;

  /**
   * Count objects matching filter criteria
   *
   * @param options - Count options (where filter)
   * @returns Promise resolving to count of matching objects
   * @throws DatabaseError if count operation fails
   */
  count(options: CountOptions): Promise<number>;

  /**
   * Save multiple objects in a single operation
   * More efficient than calling save() multiple times
   *
   * @param objects - Array of objects to save
   * @returns Promise that resolves when all saves complete
   * @throws DatabaseError if bulk save operation fails
   */
  bulkSave(objects: SmrtObject[]): Promise<void>;

  /**
   * Close connections and cleanup resources
   *
   * @returns Promise that resolves when cleanup is complete
   */
  close(): Promise<void>;
}

/**
 * Factory function type for creating persistence adapters
 */
export type AdapterFactory = (
  config: any,
  objectClass: new (...args: any[]) => SmrtObject,
) => Promise<PersistenceAdapter>;
