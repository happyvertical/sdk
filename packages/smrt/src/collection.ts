import type { BaseClassOptions } from './class.js';
import { BaseClass } from './class.js';
import {
  fieldsFromClass,
  tableNameFromClass,
  generateSchema,
  formatDataJs,
  formatDataSql,
} from './utils.js';
import { getDatabase, syncSchema, escapeSqlValue } from '@have/sql';
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

  constructor(options: T) {
    super(options);
  }

  public async initialize() {
    await super.initialize();
    if (this.options.db) {
      // console.log('initializing db', this.options.db);
      // console.log(this._itemClass.name);
      await this.setupDb();
    }
  }

  public async get(filter: string | object) {
    const where =
      typeof filter === 'string'
        ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            filter,
          )
          ? { id: filter }
          : { slug: filter }
        : filter;

    const data = await this.db.get(this.tableName, where);
    if (!data) {
      return null;
    }

    return this.create(formatDataJs(data));
  }

  public async list(options: { filter: any }) {
    const data = await this.db.list(this.tableName, options.filter);
    return await Promise.all(data.map((item) => this.create(item)));
  }

  public create(options: any) {
    const params = {
      ai: this.options.ai,
      db: this.options.db,
      ...options,
    };
    return this._itemClass.create(params);
  }

  public async getOrUpsert(data: any, defaults: any = {}) {
    data = formatDataSql(data);
    let where: any = {};
    if (data.id) {
      where = { id: data.id };
    } else if (data.slug) {
      where = { slug: data.slug };
      if (data.context) {
        where.context = data.context;
      }
    } else {
      where = data;
    }

    const existing = await this.get(where);
    if (existing) {
      return existing;
      // return this._itemClass.create({
      //   db: this.options.db,
      //   ai: this.options.ai,
      //   ...existing,
      // });
      // todo: check for diff and save
    }
    const upserted = await this.create({ ...defaults, ...data });
    await upserted.save();
    return upserted;
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
