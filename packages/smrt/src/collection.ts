import type { BaseClassOptions } from './class.js';
import { BaseClass } from './class.js';
import {
  fieldsFromClass,
  tableNameFromClass,
  generateSchema,
  formatDataJs,
  formatDataSql,
} from './utils.js';
import { syncSchema, buildWhere } from '@have/sql';
import { BaseObject } from './object.js';

export interface BaseCollectionOptions extends BaseClassOptions {}

export class BaseCollection<
  ModelType extends BaseObject<any>,
  T extends BaseCollectionOptions = BaseCollectionOptions,
> extends BaseClass<T> {
  protected _db_setup_promise: Promise<void> | null = null;
  protected get _itemClass(): (new (options: any) => ModelType) & {
    create(options: any): ModelType | Promise<ModelType>;
  } {
    const constructor = this.constructor as {
      readonly _itemClass?: (new (options: any) => ModelType) & {
        create(options: any): ModelType | Promise<ModelType>;
      };
    };
    if (!constructor._itemClass) {
      // todo: sort out why Meetings._itemClass is undefined
      throw new Error(
        `Collection ${this.constructor.name} must define static _itemClass`,
      );
      //   console.warn(
      //     `Collection ${this.constructor.name} must define static _itemClass`,
      //   );
      // }
    }
    return constructor._itemClass;
  }

  static readonly _itemClass: any;
  public _tableName!: string;

  /**
   * Valid SQL operators that can be used in where conditions.
   * Keys are the operators as they appear in the query object,
   * values are their SQL equivalents.
   */
  private readonly VALID_OPERATORS = {
    '=': '=',
    '>': '>',
    '>=': '>=',
    '<': '<',
    '<=': '<=',
    '!=': '!=',
    like: 'LIKE',
    in: 'IN',
    // Add more operators as needed
  } as const;

  constructor(options: T) {
    super(options);
  }

  public async initialize() {
    await super.initialize();
    if (this.options.db) {
      await this.setupDb();
    }
  } 

  public async get(filter: string | Record<string, any>) {
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
   * Lists records from the collection with flexible filtering options.
   *
   * @param options Query options object
   * @param options.where Record of conditions to filter results. Each key can include an operator
   *                      separated by a space (e.g., 'price >', 'name like'). Default operator is '='.
   * @param options.offset Number of records to skip
   * @param options.limit Maximum number of records to return
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
  }) {
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
    return Promise.all(
      result.rows.map((item: object) => this.create(formatDataJs(item))),
    );
  }

  public create(options: any) {
    const params = {
      ai: this.options.ai,
      db: this.options.db,
      ...options,
    };
    return this._itemClass.create(params);
  }

  //todo: tx to protect against race condition
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

  getFields() {
    return fieldsFromClass(this._itemClass);
  }

  generateSchema() {
    // Use the imported generateSchema function with the item class
    return generateSchema(this._itemClass);
  }

  async setupTriggers() {
    const triggers = [
      `${this.tableName}_set_created_at`,
      `${this.tableName}_set_updated_at`,
    ];

    for (const trigger of triggers) {
      const exists = await this.db
        .pluck`SELECT name FROM sqlite_master WHERE type='trigger' AND name=${trigger}`;
      if (!exists) {
        if (trigger === `${this.tableName}_set_created_at`) {
          const createTriggerSQL = `
            CREATE TRIGGER ${trigger}
            AFTER INSERT ON ${this.tableName}
            BEGIN
              UPDATE ${this.tableName} 
              SET created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
              WHERE id = NEW.id;
            END;
          `;
          await this.db.query(createTriggerSQL);
        } else if (trigger === `${this.tableName}_set_updated_at`) {
          const createTriggerSQL = `
            CREATE TRIGGER ${trigger}
            AFTER UPDATE ON ${this.tableName}
            BEGIN
              UPDATE ${this.tableName} 
              SET updated_at = CURRENT_TIMESTAMP 
              WHERE id = NEW.id;
            END;
          `;
          await this.db.query(createTriggerSQL);
        }
      }
    }
  }

  get tableName() {
    if (!this._tableName) {
      this._tableName = tableNameFromClass(this.constructor);
    }
    return this._tableName;
  }

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
}
