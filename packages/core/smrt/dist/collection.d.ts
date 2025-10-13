import { SmrtClassOptions, SmrtClass } from './class';
import { SmrtObject } from './object';
import { PersistenceAdapter } from './persistence/adapter';
/**
 * Configuration options for SmrtCollection
 */
export interface SmrtCollectionOptions extends SmrtClassOptions {
}
/**
 * Collection interface for managing sets of SmrtObjects
 *
 * SmrtCollection provides methods for querying, creating, and managing
 * collections of persistent objects. It handles database setup, schema
 * generation, and provides a fluent interface for querying objects.
 */
export declare class SmrtCollection<ModelType extends SmrtObject> extends SmrtClass {
    /**
     * Promise tracking the database setup operation
     */
    protected _db_setup_promise: Promise<void> | null;
    /**
     * Persistence adapter for storage operations
     */
    protected _persistenceAdapter?: PersistenceAdapter;
    /**
     * Gets the class constructor for items in this collection
     */
    protected get _itemClass(): (new (options: any) => ModelType) & {
        create(options: any): ModelType | Promise<ModelType>;
    };
    /**
     * Static reference to the item class constructor
     */
    static readonly _itemClass: any;
    /**
     * Validates that the collection is properly configured
     * Call this during development to catch configuration issues early
     */
    static validate(): void;
    /**
     * Database table name for this collection
     */
    _tableName: string;
    /**
     * Creates a new SmrtCollection instance
     *
     * @deprecated Use the static create() factory method instead
     * @param options - Configuration options
     */
    protected constructor(options?: SmrtCollectionOptions);
    /**
     * Static factory method for creating fully initialized collection instances
     *
     * This is the recommended way to create collections. It accepts broad option types
     * (SmrtClassOptions) and handles option extraction internally, then returns a
     * fully initialized, ready-to-use collection instance.
     *
     * TypeScript Note: Uses InstanceType<T> to preserve subclass types through the
     * static factory method, ensuring custom collection methods are properly typed.
     *
     * @param options - Configuration options (accepts both SmrtClassOptions and SmrtCollectionOptions)
     * @returns Promise resolving to a fully initialized collection instance
     *
     * @example
     * ```typescript
     * // Create collection from object options
     * const collection = await ProductCollection.create(smrtObject.options);
     *
     * // Create collection with specific config
     * const collection = await ProductCollection.create({
     *   persistence: { type: 'sql', url: 'products.db' },
     *   ai: { provider: 'openai', apiKey: process.env.OPENAI_API_KEY }
     * });
     * ```
     */
    static create<T extends new (...args: any[]) => SmrtCollection<any>>(this: T, options?: SmrtClassOptions): Promise<InstanceType<T>>;
    /**
     * Initializes the collection, setting up database tables
     *
     * @returns Promise that resolves to this instance for chaining
     */
    initialize(): Promise<this>;
    /**
     * Retrieves a single object from the collection by ID, slug, or custom filter
     *
     * @param filter - String ID/slug or object with filter conditions
     * @returns Promise resolving to the object or null if not found
     */
    get(filter: string | Record<string, any>): Promise<ModelType | null>;
    /**
     * Lists records from the collection with flexible filtering options
     *
     * @param options - Query options object
     * @param options.where - Record of conditions to filter results. Each key can include an operator
     *                      separated by a space (e.g., 'price >', 'name like'). Default operator is '='.
     * @param options.offset - Number of records to skip
     * @param options.limit - Maximum number of records to return
     * @param options.orderBy - Field(s) to order results by, with optional direction
     *
     * @example
     * ```typescript
     * // Find active products priced between $100-$200
     * await collection.list({
     *   where: {
     *     'price >': 100,
     *     'price <=': 200,
     *     'status': 'active',              // equals operator is default
     *     'category in': ['A', 'B', 'C'],  // IN operator for arrays
     *     'name like': '%shirt%',          // LIKE for pattern matching
     *     'deleted_at !=': null            // exclude deleted items
     *   },
     *   limit: 10,
     *   offset: 0
     * });
     *
     * // Find users matching pattern but not in specific roles
     * await users.list({
     *   where: {
     *     'email like': '%@company.com',
     *     'active': true,
     *     'role in': ['guest', 'blocked'],
     *     'last_login <': lastMonth
     *   }
     * });
     * ```
     *
     * @returns Promise resolving to an array of model instances
     */
    list(options: {
        where?: Record<string, any>;
        offset?: number;
        limit?: number;
        orderBy?: string | string[];
        /**
         * Relationships to eagerly load (avoids N+1 query problem)
         * @example
         * ```typescript
         * // Load orders with their customers pre-loaded
         * const orders = await orderCollection.list({
         *   include: ['customerId']
         * });
         * // Access customer without additional query
         * orders[0].getRelated('customerId');
         * ```
         */
        include?: string[];
    }): Promise<ModelType[]>;
    /**
     * Eagerly load relationships for a collection of instances
     *
     * Optimizes loading by batching queries for foreignKey relationships to avoid N+1 queries.
     *
     * @param instances - Array of object instances to load relationships for
     * @param relationships - Array of relationship field names to load
     * @private
     */
    private eagerLoadRelationships;
    /**
     * Batch load foreignKey relationships to avoid N+1 queries
     *
     * @param instances - Instances to load relationships for
     * @param fieldName - Name of the foreignKey field
     * @param relationship - Relationship metadata
     * @private
     */
    private batchLoadForeignKeys;
    /**
     * Batch load oneToMany relationships
     *
     * @param instances - Instances to load relationships for
     * @param fieldName - Name of the oneToMany field
     * @param relationship - Relationship metadata
     * @private
     */
    private batchLoadOneToMany;
    /**
     * Creates a new instance of the collection's item class
     *
     * @param options - Options for creating the item
     * @returns New item instance
     */
    create(options: any): Promise<ModelType>;
    /**
     * Gets an existing item or creates a new one if it doesn't exist
     *
     * @param data - Object data to find or create
     * @param defaults - Default values to use if creating a new object
     * @returns Promise resolving to the existing or new object
     */
    getOrUpsert(data: any, defaults?: any): Promise<ModelType>;
    /**
     * Gets differences between an existing object and new data
     *
     * @param existing - Existing object
     * @param data - New data
     * @returns Object containing only the changed fields
     */
    getDiff(existing: Record<string, any>, data: Record<string, any>): Record<string, any>;
    /**
     * Sets up the database schema for this collection
     *
     * @returns Promise that resolves when setup is complete
     */
    setupDb(): Promise<void>;
    /**
     * Gets field definitions for the collection's item class
     *
     * @returns Object containing field definitions
     */
    getFields(): Record<string, any>;
    /**
     * Generates database schema for the collection's item class
     *
     * Leverages ObjectRegistry's cached schema for instant retrieval.
     *
     * @returns Schema object for database setup
     */
    generateSchema(): string;
    /**
     * Sets up database triggers for automatically updating timestamps
     *
     * @returns Promise that resolves when triggers are set up
     */
    setupTriggers(): Promise<void>;
    /**
     * Gets the database table name for this collection
     */
    get tableName(): string;
    /**
     * Generates a table name from the collection class name
     *
     * @returns Generated table name
     */
    generateTableName(): string;
    /**
     * Counts records in the collection matching the given filters
     *
     * Accepts the same where conditions as list() but ignores limit/offset/orderBy.
     *
     * @param options - Query options object
     * @param options.where - Record of conditions to filter results
     * @returns Promise resolving to the total count of matching records
     */
    count(options?: {
        where?: Record<string, any>;
    }): Promise<number>;
}
//# sourceMappingURL=collection.d.ts.map