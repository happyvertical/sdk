import { buildWhere, syncSchema } from '@have/sql';
import type { SmrtClassOptions } from './class';
import { SmrtClass } from './class';
import type { SmrtObject } from './object';
import type { PersistenceAdapter } from './persistence/adapter';
import { createPersistenceAdapter } from './persistence';
import { ObjectRegistry } from './registry';
import {
  fieldsFromClass,
  formatDataJs,
  formatDataSql,
  generateSchema,
  tableNameFromClass,
} from './utils';

/**
 * Configuration options for SmrtCollection
 */
export interface SmrtCollectionOptions extends SmrtClassOptions {}

/**
 * Collection interface for managing sets of SmrtObjects
 *
 * SmrtCollection provides methods for querying, creating, and managing
 * collections of persistent objects. It handles database setup, schema
 * generation, and provides a fluent interface for querying objects.
 */
export class SmrtCollection<ModelType extends SmrtObject> extends SmrtClass {
  /**
   * Promise tracking the database setup operation
   */
  protected _db_setup_promise: Promise<void> | null = null;

  /**
   * Persistence adapter for storage operations
   */
  protected _persistenceAdapter?: PersistenceAdapter;

  /**
   * Gets the class constructor for items in this collection
   */
  protected get _itemClass(): (new (
    options: any,
  ) => ModelType) & {
    create(options: any): ModelType | Promise<ModelType>;
  } {
    const ctor = this.constructor as {
      readonly _itemClass?: (new (
        options: any,
      ) => ModelType) & {
        create(options: any): ModelType | Promise<ModelType>;
      };
    };
    if (!ctor._itemClass) {
      const className = this.constructor.name;
      const errorMessage = [
        `Collection "${className}" must define a static _itemClass property.`,
        '',
        'Example:',
        `  class ${className} extends SmrtCollection<YourItemClass> {`,
        '    static readonly _itemClass = YourItemClass;',
        '  }',
        '',
        'Make sure your item class is imported and defined before the collection class.',
      ].join('\n');

      throw new Error(errorMessage);
    }
    return ctor._itemClass;
  }

  /**
   * Static reference to the item class constructor
   */
  static readonly _itemClass: any;

  /**
   * Validates that the collection is properly configured
   * Call this during development to catch configuration issues early
   */
  static validate(): void {
    if (!SmrtCollection._itemClass) {
      const className = SmrtCollection.name;
      const errorMessage = [
        `Collection "${className}" is missing required static _itemClass property.`,
        '',
        'Fix by adding:',
        `  class ${className} extends SmrtCollection<YourItemClass> {`,
        '    static readonly _itemClass = YourItemClass;',
        '  }',
      ].join('\n');
      throw new Error(errorMessage);
    }

    // Validate that _itemClass has required methods
    if (typeof SmrtCollection._itemClass !== 'function') {
      throw new Error(
        `Collection "${SmrtCollection.name}"._itemClass must be a constructor function`,
      );
    }

    // Check if it has a create method (static or prototype)
    const hasCreateMethod =
      typeof SmrtCollection._itemClass.create === 'function' ||
      typeof SmrtCollection._itemClass.prototype?.create === 'function';

    if (!hasCreateMethod) {
      console.warn(
        `Collection "${SmrtCollection.name}"._itemClass should have a create() method for optimal functionality`,
      );
    }
  }

  /**
   * Database table name for this collection
   */
  public _tableName!: string;

  /**
   * Creates a new SmrtCollection instance
   *
   * @param options - Configuration options
   */
  constructor(options: SmrtCollectionOptions = {}) {
    super(options);

    // Auto-register the collection if it's not the base SmrtCollection and has an _itemClass
    if (
      this.constructor !== SmrtCollection &&
      (this.constructor as any)._itemClass
    ) {
      const itemClassName = (this.constructor as any)._itemClass.name;
      ObjectRegistry.registerCollection(
        itemClassName,
        this.constructor as typeof SmrtCollection,
      );
    }
  }

  /**
   * Initializes the collection, setting up database tables
   *
   * @returns Promise that resolves when initialization is complete
   */
  public async initialize() {
    await super.initialize();

    // Create persistence adapter based on configuration
    if (this.options.persistence) {
      // New persistence config
      this._persistenceAdapter = await createPersistenceAdapter(
        this.options.persistence,
        this._itemClass,
      );
    } else if (this.options.db) {
      // Legacy db config - create SQL adapter automatically
      const { type: dbType, ...dbConfig } = this.options.db;
      this._persistenceAdapter = await createPersistenceAdapter(
        {
          type: 'sql',
          dbType: dbType as 'sqlite' | 'postgres',
          ...dbConfig,
        },
        this._itemClass,
      );
    }

    // Legacy: setup database if using db directly (no adapter)
    if (this.options.db && !this._persistenceAdapter) {
      await this.setupDb();
    }
  }

  /**
   * Retrieves a single object from the collection by ID, slug, or custom filter
   *
   * @param filter - String ID/slug or object with filter conditions
   * @returns Promise resolving to the object or null if not found
   */
  public async get(filter: string | Record<string, any>) {
    // Use persistence adapter if available
    if (this._persistenceAdapter) {
      return await this._persistenceAdapter.load(filter, this._itemClass);
    }

    // Legacy implementation
    const where =
      typeof filter === 'string'
        ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            filter,
          )
          ? { id: filter }
          : { slug: filter, context: '' }
        : filter;

    // let sql = `SELECT * FROM ${this.tableName}`;
    const { sql: whereSql, values: whereValues } = buildWhere(where);

    const { rows } = await this.db.query(
      `SELECT * FROM ${this.tableName} ${whereSql}`,
      whereValues,
    );
    if (!rows?.[0]) {
      return null;
    }

    return this.create(formatDataJs(rows[0]));
  }

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
  public async list(options: {
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
  }) {
    // Use persistence adapter if available
    if (this._persistenceAdapter) {
      return await this._persistenceAdapter.list(options, this._itemClass);
    }

    // Legacy implementation
    const { where, offset, limit, orderBy } = options;
    const { sql: whereSql, values: whereValues } = buildWhere(where || {});

    let orderBySql = '';
    if (orderBy) {
      orderBySql = ' ORDER BY ';
      const orderByItems = Array.isArray(orderBy) ? orderBy : [orderBy];

      orderBySql += orderByItems
        .map((item) => {
          const [field, direction = 'ASC'] = item.split(' ');

          // Validate field name
          if (!/^[a-zA-Z0-9_]+$/.test(field)) {
            throw new Error(`Invalid field name for ordering: ${field}`);
          }

          // Validate direction
          const normalizedDirection = direction.toUpperCase();
          if (normalizedDirection !== 'ASC' && normalizedDirection !== 'DESC') {
            throw new Error(
              `Invalid sort direction: ${direction}. Must be ASC or DESC.`,
            );
          }

          return `${field} ${normalizedDirection}`;
        })
        .join(', ');
    }

    let limitOffsetSql = '';
    const limitOffsetValues = [];

    if (limit !== undefined) {
      limitOffsetSql += ' LIMIT ?';
      limitOffsetValues.push(limit);
    }

    if (offset !== undefined) {
      limitOffsetSql += ' OFFSET ?';
      limitOffsetValues.push(offset);
    }

    const result = await this.db.query(
      `SELECT * FROM ${this.tableName} ${whereSql} ${orderBySql} ${limitOffsetSql}`,
      [...whereValues, ...limitOffsetValues],
    );
    const instances = await Promise.all(
      result.rows.map((item: object) => this.create(formatDataJs(item))),
    );

    // Eager load specified relationships
    if (options.include && options.include.length > 0) {
      await this.eagerLoadRelationships(instances, options.include);
    }

    return instances;
  }

  /**
   * Eagerly load relationships for a collection of instances
   *
   * Optimizes loading by batching queries for foreignKey relationships to avoid N+1 queries.
   *
   * @param instances - Array of object instances to load relationships for
   * @param relationships - Array of relationship field names to load
   * @private
   */
  private async eagerLoadRelationships(
    instances: ModelType[],
    relationships: string[],
  ): Promise<void> {
    if (instances.length === 0) return;

    for (const fieldName of relationships) {
      // Get relationship metadata
      const relationshipMeta = ObjectRegistry.getRelationships(
        this._itemClass.name,
      );
      const relationship = relationshipMeta.find(
        (r) => r.fieldName === fieldName,
      );

      if (!relationship) {
        console.warn(
          `Relationship ${fieldName} not found on ${this._itemClass.name}, skipping eager load`,
        );
        continue;
      }

      if (relationship.type === 'foreignKey') {
        // Batch load foreignKey relationships
        await this.batchLoadForeignKeys(instances, fieldName, relationship);
      } else if (relationship.type === 'oneToMany') {
        // Load oneToMany relationships (less optimizable)
        await this.batchLoadOneToMany(instances, fieldName, relationship);
      } else if (relationship.type === 'manyToMany') {
        console.warn(
          `manyToMany eager loading not yet implemented for ${fieldName}`,
        );
      }
    }
  }

  /**
   * Batch load foreignKey relationships to avoid N+1 queries
   *
   * @param instances - Instances to load relationships for
   * @param fieldName - Name of the foreignKey field
   * @param relationship - Relationship metadata
   * @private
   */
  private async batchLoadForeignKeys(
    instances: ModelType[],
    fieldName: string,
    relationship: import('./registry').RelationshipMetadata,
  ): Promise<void> {
    // Collect all unique foreign key values
    const foreignKeyValues = new Set<string>();
    for (const instance of instances) {
      const value = instance[fieldName as keyof ModelType];
      if (value && typeof value === 'string') {
        foreignKeyValues.add(value);
      }
    }

    if (foreignKeyValues.size === 0) return;

    // Get target class and collection
    const targetClassInfo = ObjectRegistry.getClass(relationship.targetClass);
    if (!targetClassInfo || !targetClassInfo.collectionConstructor) {
      console.warn(
        `Target class ${relationship.targetClass} not found or has no collection`,
      );
      return;
    }

    // Load all related objects in a single query
    const targetCollection = new targetClassInfo.collectionConstructor(
      this.options,
    );
    await targetCollection.initialize();
    const relatedObjects = await targetCollection.list({
      where: { 'id in': Array.from(foreignKeyValues) },
    });

    // Build a map of ID to object for quick lookup
    const relatedMap = new Map();
    for (const obj of relatedObjects) {
      relatedMap.set(obj.id, obj);
    }

    // Assign loaded objects to instances
    for (const instance of instances) {
      const foreignKeyValue = instance[fieldName as keyof ModelType];
      if (foreignKeyValue && typeof foreignKeyValue === 'string') {
        const relatedObject = relatedMap.get(foreignKeyValue);
        if (relatedObject) {
          // Set in the relationship cache
          (instance as any)._loadedRelationships.set(fieldName, relatedObject);
        }
      }
    }
  }

  /**
   * Batch load oneToMany relationships
   *
   * @param instances - Instances to load relationships for
   * @param fieldName - Name of the oneToMany field
   * @param relationship - Relationship metadata
   * @private
   */
  private async batchLoadOneToMany(
    instances: ModelType[],
    fieldName: string,
    relationship: import('./registry').RelationshipMetadata,
  ): Promise<void> {
    // Find the inverse foreignKey field
    const inverseRelationships = ObjectRegistry.getInverseRelationships(
      this._itemClass.name,
    );
    const inverseForeignKey = inverseRelationships.find(
      (r) =>
        r.sourceClass === relationship.targetClass &&
        r.type === 'foreignKey' &&
        r.targetClass === this._itemClass.name,
    );

    if (!inverseForeignKey) {
      console.warn(
        `Could not find inverse foreignKey for oneToMany ${fieldName}`,
      );
      return;
    }

    // Collect all instance IDs
    const instanceIds = instances
      .map((i) => i.id)
      .filter((id): id is string => !!id);

    if (instanceIds.length === 0) return;

    // Get target collection
    const targetClassInfo = ObjectRegistry.getClass(relationship.targetClass);
    if (!targetClassInfo || !targetClassInfo.collectionConstructor) {
      console.warn(
        `Target class ${relationship.targetClass} not found or has no collection`,
      );
      return;
    }

    // Load all related objects in a single query
    const targetCollection = new targetClassInfo.collectionConstructor(
      this.options,
    );
    await targetCollection.initialize();
    const relatedObjects = await targetCollection.list({
      where: { [`${inverseForeignKey.fieldName} in`]: instanceIds },
    });

    // Group related objects by the foreign key value
    const relatedMap = new Map<string, any[]>();
    for (const obj of relatedObjects) {
      const foreignKeyValue = obj[inverseForeignKey.fieldName as any];
      if (!relatedMap.has(foreignKeyValue)) {
        relatedMap.set(foreignKeyValue, []);
      }
      relatedMap.get(foreignKeyValue)?.push(obj);
    }

    // Assign loaded objects to instances
    for (const instance of instances) {
      const relatedArray = relatedMap.get(instance.id as string) || [];
      (instance as any)._loadedRelationships.set(fieldName, relatedArray);
    }
  }

  /**
   * Creates a new instance of the collection's item class
   *
   * @param options - Options for creating the item
   * @returns New item instance
   */
  public async create(options: any) {
    const params = {
      ai: this.options.ai,
      db: this.options.db,
      persistence: this.options.persistence,
      _persistenceAdapter: this._persistenceAdapter, // Share the adapter instance
      _skipLoad: true, // Don't try to load from DB - this is a new object
      ...options,
    };

    // Direct instantiation - all SmrtObject classes support this pattern
    const instance = new this._itemClass(params);
    await instance.initialize();
    return instance;
  }

  /**
   * Gets an existing item or creates a new one if it doesn't exist
   *
   * @param data - Object data to find or create
   * @param defaults - Default values to use if creating a new object
   * @returns Promise resolving to the existing or new object
   */
  public async getOrUpsert(data: any, defaults: any = {}) {
    data = formatDataSql(data);
    let where: any = {};
    if (data.id) {
      where = { id: data.id };
    } else if (data.slug) {
      where = { slug: data.slug, context: data.context || '' };
    } else {
      where = data;
    }
    const existing = await this.get(where);
    if (existing) {
      const diff = this.getDiff(existing, data);
      if (diff) {
        Object.assign(existing, diff);
        await existing.save();
        return existing;
      }
      return existing;
    }
    const upsertData = { ...defaults, ...data };
    const upserted = await this.create(upsertData);
    await upserted.save();
    return upserted;
  }

  /**
   * Gets differences between an existing object and new data
   *
   * @param existing - Existing object
   * @param data - New data
   * @returns Object containing only the changed fields
   */
  getDiff(
    existing: Record<string, any>,
    data: Record<string, any>,
  ): Record<string, any> {
    const fields = this._itemClass.prototype.getFields();
    return Object.keys(data).reduce(
      (acc, key) => {
        if (fields[key] && existing[key] !== data[key]) {
          acc[key] = data[key];
        }
        return acc;
      },
      {} as Record<string, any>,
    );
  }

  /**
   * Sets up the database schema for this collection
   *
   * @returns Promise that resolves when setup is complete
   */
  async setupDb() {
    if (this._db_setup_promise) {
      return this._db_setup_promise;
    }

    this._db_setup_promise = (async () => {
      try {
        const schema = this.generateSchema();
        await syncSchema({ db: this.db, schema });
        await this.setupTriggers();
      } catch (error) {
        this._db_setup_promise = null; // Allow retry on failure
        throw error;
      }
    })();

    return this._db_setup_promise;
  }

  /**
   * Gets field definitions for the collection's item class
   *
   * @returns Object containing field definitions
   */
  getFields() {
    return fieldsFromClass(this._itemClass);
  }

  /**
   * Generates database schema for the collection's item class
   *
   * Leverages ObjectRegistry's cached schema for instant retrieval.
   *
   * @returns Schema object for database setup
   */
  generateSchema() {
    // Try to get cached schema from ObjectRegistry first
    const cachedSchema = ObjectRegistry.getSchemaDDL(this._itemClass.name);
    return cachedSchema || generateSchema(this._itemClass);
  }

  /**
   * Sets up database triggers for automatically updating timestamps
   *
   * @returns Promise that resolves when triggers are set up
   */
  async setupTriggers() {
    const triggers = [
      `${this.tableName}_set_created_at`,
      `${this.tableName}_set_updated_at`,
    ];

    // Check if table exists before creating triggers
    const tableExists = await this.db.tableExists(this.tableName);
    if (!tableExists) {
      console.warn(
        `[smrt] Skipping trigger creation - table ${this.tableName} does not exist`,
      );
      return;
    }

    for (const trigger of triggers) {
      const exists = await this.db
        .pluck`SELECT name FROM sqlite_master WHERE type='trigger' AND name=${trigger}`;
      if (!exists) {
        try {
          if (trigger === `${this.tableName}_set_created_at`) {
            const createTriggerSQL = `
              CREATE TRIGGER ${trigger}
              AFTER INSERT ON ${this.tableName}
              FOR EACH ROW
              WHEN NEW.created_at IS NULL
              BEGIN
                UPDATE ${this.tableName}
                SET created_at = datetime('now'), updated_at = datetime('now')
                WHERE id = NEW.id;
              END;
            `;
            await this.db.query(createTriggerSQL);
          } else if (trigger === `${this.tableName}_set_updated_at`) {
            const createTriggerSQL = `
              CREATE TRIGGER ${trigger}
              AFTER UPDATE ON ${this.tableName}
              FOR EACH ROW
              WHEN NEW.updated_at = OLD.updated_at
              BEGIN
                UPDATE ${this.tableName}
                SET updated_at = datetime('now')
                WHERE id = NEW.id;
              END;
            `;
            await this.db.query(createTriggerSQL);
          }
        } catch (error) {
          console.warn(`[smrt] Failed to create trigger ${trigger}:`, error);
          // Continue with other triggers instead of failing completely
        }
      }
    }
  }

  /**
   * Gets the database table name for this collection
   */
  get tableName() {
    if (!this._tableName) {
      this._tableName = tableNameFromClass(this.constructor);
    }
    return this._tableName;
  }

  /**
   * Generates a table name from the collection class name
   *
   * @returns Generated table name
   */
  generateTableName() {
    // Convert camelCase/PascalCase to snake_case and pluralize
    const tableName = this._className
      // Insert underscore between lower & upper case letters
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      // Convert to lowercase
      .toLowerCase()
      // Handle basic pluralization rules
      .replace(/([^s])$/, '$1s')
      // Handle special cases ending in 'y'
      .replace(/y$/, 'ies');

    return tableName;
  }

  /**
   * Counts records in the collection matching the given filters
   *
   * Accepts the same where conditions as list() but ignores limit/offset/orderBy.
   *
   * @param options - Query options object
   * @param options.where - Record of conditions to filter results
   * @returns Promise resolving to the total count of matching records
   */
  public async count(options: { where?: Record<string, any> } = {}) {
    // Use persistence adapter if available
    if (this._persistenceAdapter) {
      return await this._persistenceAdapter.count(options);
    }

    // Legacy implementation
    const { where } = options;
    const { sql: whereSql, values: whereValues } = buildWhere(where || {});

    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereSql}`,
      whereValues,
    );

    return Number.parseInt(result.rows[0].count, 10);
  }
}
