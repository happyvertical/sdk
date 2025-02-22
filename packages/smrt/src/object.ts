import type { AIMessageOptions } from '@have/ai';
import type { BaseClassOptions } from './class.js';

import {
  fieldsFromClass,
  tableNameFromClass,
  setupTableFromClass,
} from '@have/smrt/utils';
import { escapeSqlValue } from '@have/sql';

import { BaseClass } from './class.js';
import { BaseCollection } from './collection.js';

export interface BaseObjectOptions extends BaseClassOptions {
  id?: string;
  name?: string;
  slug?: string;
  context?: string;
  created_at?: Date;
  updated_at?: Date;
}

export class BaseObject<
  T extends BaseObjectOptions = BaseObjectOptions,
> extends BaseClass<T> {
  public _collection!: BaseCollection<BaseObject<T>>;
  public _tableName!: string;
  protected _id: string | null | undefined; // a unique identifier for the object
  protected _slug: string | null | undefined; // a slug, url friendly identifier
  protected _context: string | null | undefined; // an option context to scope the slug, could contain a path, domain&path etc

  public name: string | null | undefined; // a friendly name, mostly for humans.. unique is better but not required
  public created_at: Date | null | undefined;
  public updated_at: Date | null | undefined;

  constructor(options: T) {
    super(options);
    if (options === null) {
      throw new Error('options cant be null');
    }
    this._id = options.id || null;
    this._slug = options.slug || null;
    this._context = options.context || '';
    this.name = options.name || null;
    this.created_at = options.created_at || null;
    this.updated_at = options.updated_at || null;
  }

  get id(): string | null | undefined {
    return this._id;
  }

  set id(value: string | null | undefined) {
    if (!value || value === 'undefined' || value === 'null') {
      throw new Error(`id is required, ${value} given`);
    }
    this._id = value;
  }

  get slug(): string | null | undefined {
    return this._slug;
  }

  set slug(value: string | null | undefined) {
    if (!value || value === 'undefined' || value === 'null') {
      throw new Error(`slug is invalid, ${value} given`);
    }

    this._slug = value;
  }

  get context(): string {
    return this._context || '';
  }

  set context(value: string | null | undefined) {
    if (value !== '' && !value) {
      throw new Error(`context is invalid, ${value} given`);
    }
    this._context = value;
  }

  protected async initialize(): Promise<void> {
    await super.initialize();
    if (this.options.db) {
      await setupTableFromClass(this.db, this.constructor);
      await this.db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_${this.tableName}_slug_context 
        ON ${this.tableName}(slug, context);
      `);
    }

    if (this.options.id) {
      await this.loadFromId();
    } else if (this.options.slug) {
      await this.loadFromSlug();
    }
  }

  loadDataFromDb(data: any) {
    const fields = this.getFields();
    for (const field in fields) {
      if (fields.hasOwnProperty(field)) {
        this[field as keyof this] = data[field];
      }
    }
  }

  allDescriptors() {
    const proto = Object.getPrototypeOf(this);
    const descriptors = Object.getOwnPropertyDescriptors(proto);
    return descriptors;
  }

  get tableName() {
    if (!this._tableName) {
      this._tableName = tableNameFromClass(this.constructor);
    }
    return this._tableName;
  }

  getFields() {
    // Get the static fields definition from the class
    const fields = fieldsFromClass(
      this.constructor as new (...args: any[]) => any,
    );

    // Add current instance values to the fields
    for (const key in fields) {
      fields[key].value = this[key as keyof this];
    }

    return fields;
  }

  generateUpsertStatement() {
    const fields = this.getFields();
    const columns = ['id', 'slug', 'context'];
    const id = escapeSqlValue(this.id) || '';
    const slug = escapeSqlValue(this.slug);
    const context = escapeSqlValue(this.context || '');
    const values = [id, slug, context];
    const updates = [`slug = ${slug}`, `context = ${context}`];

    for (const [key, field] of Object.entries(fields)) {
      if (key === 'slug' || key === 'context') continue;
      columns.push(key);
      const value =
        typeof field.value === 'boolean' ? (field.value ? 1 : 0) : field.value;

      const escapedValue = escapeSqlValue(value);

      values.push(escapedValue);
      updates.push(`${key} = ${escapedValue}`);
    }

    // Use UPSERT syntax with explicit ON CONFLICT handling
    const sql = `
      INSERT INTO ${this.tableName} (${columns.join(', ')})
      VALUES (${values.join(', ')})
      ON CONFLICT(slug, context) 
      WHERE slug = ${slug} AND context = ${context}
      DO UPDATE SET
        ${updates.join(',\n        ')}
      WHERE ${this.tableName}.slug = ${slug} AND ${this.tableName}.context = ${context};
    `;

    return sql;
  }

  // needs to be async to allow looking up existing in db by slug
  async getId() {
    // lookup by slug and context
    const saved = await this.db
      .pluck`SELECT id FROM ${this.tableName} WHERE slug = ${this.slug} AND context = ${this.context} LIMIT 1`;
    if (saved) {
      this.id = saved;
    }

    if (!this.id) {
      this.id = crypto.randomUUID();
    }
    return this.id;
  }

  // Objects will be named to match table names

  async getSlug() {
    if (!this.slug && this.name) {
      // Generate slug from name if not set
      this.slug = this.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }

    // check for existing slug and make unique?
    return this.slug;
  }

  async getSavedId() {
    const { pluck } = this.db;
    const saved =
      await pluck`SELECT id FROM ${this.tableName} WHERE id = ${this.id} OR slug = ${this.slug} LIMIT 1`;
    return saved;
  }

  async isSaved() {
    const saved = await this.getSavedId();
    return !!saved;
  }

  async save() {
    if (!this.id) {
      this.id = crypto.randomUUID();
    }

    if (!this.slug) {
      this.slug = await this.getSlug();
    }

    // Update the updated_at timestamp
    this.updated_at = new Date();

    if (!this.created_at) {
      this.created_at = new Date();
    }

    await setupTableFromClass(this.options.db, this.constructor);

    const sql = this.generateUpsertStatement();
    await this.db.query(sql);

    return this;
  }

  public async loadFromId() {
    const {
      rows: [existing],
    } = await this.db.query(`SELECT * FROM ${this.tableName} WHERE id = ?`, [
      this.options.id,
    ]);
    if (existing) {
      this.loadDataFromDb(existing);
    }
  }

  public async loadFromSlug() {
    const {
      rows: [existing],
    } = await this.db.query(
      `SELECT * FROM ${this.tableName} WHERE slug = ? AND context = ?`,
      [this.options.slug, this.options.context || ''],
    );
    if (existing) {
      this.loadDataFromDb(existing);
    }
  }

  public async is(criteria: string, options: AIMessageOptions = {}) {
    const prompt = `--- Beginning of criteria ---\n${criteria}\n--- End of criteria ---\nDoes the content meet all the given criteria? Reply with a json object with a single boolean 'result' property`;
    const message = await this.ai.message(prompt, {
      ...(options as any),
      responseFormat: { type: 'json_object' },
    });
    try {
      const { result } = JSON.parse(message);
      if (result === true || result === false) {
        return result;
      }
    } catch (e) {
      throw new Error(`Unexpected answer: ${message}`);
    }
  }

  public async do(instructions: string, options: AIMessageOptions = {}) {
    const prompt = `--- Beginning of instructions ---\n${instructions}\n--- End of instructions ---\nBased on the content body, please follow the instructions and provide a response. Never make use of codeblocks.`;
    const result = await this.ai.message(prompt, options);
    return result;
  }
}

// async function ensureTriggersExist(db: any, tableName: string) {
//   const triggers = [
//     `${tableName}_set_created_at`,
//     `${tableName}_set_updated_at`,
//   ];

//   for (const trigger of triggers) {
//     const exists = await db.get(
//       `SELECT name FROM sqlite_master WHERE type='trigger' AND name=?`,
//       [trigger],
//     );

//     if (!exists) {
//       if (trigger === `${tableName}_set_created_at`) {
//         await db.exec(`
//           CREATE TRIGGER ${trigger}
//           AFTER INSERT ON ${tableName}
//           BEGIN
//             UPDATE ${tableName}
//             SET created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
//             WHERE id = NEW.id;
//           END;
//         `);
//       } else if (trigger === `${tableName}_set_updated_at`) {
//         await db.exec(`
//           CREATE TRIGGER ${trigger}
//           AFTER UPDATE ON ${tableName}
//           BEGIN
//             UPDATE ${tableName}
//             SET updated_at = CURRENT_TIMESTAMP
//             WHERE id = NEW.id;
//           END;
//         `);
//       }
//     }
//   }
// }
