// import type { AIMessageOptions } from '@have/ai';
import type { BaseClassOptions } from './class.js';

import {
  fieldsFromClass,
  tableNameFromClass,
  setupTableFromClass,
} from './utils.js';
import { escapeSqlValue } from '@have/sql';
import { Field } from './fields/index.js';
import { ObjectRegistry } from './registry.js';

import { BaseClass } from './class.js';
import { BaseCollection } from './collection.js';

/**
 * Options for BaseObject initialization
 */
export interface BaseObjectOptions extends BaseClassOptions {
  /**
   * Unique identifier for the object
   */
  id?: string;
  
  /**
   * Human-readable name for the object
   */
  name?: string;
  
  /**
   * URL-friendly identifier
   */
  slug?: string;
  
  /**
   * Optional context to scope the slug (could be a path, domain, etc.)
   */
  context?: string;
  
  /**
   * Creation timestamp
   */
  created_at?: Date;
  
  /**
   * Last update timestamp
   */
  updated_at?: Date;
}

/**
 * Base persistent object with unique identifiers and database storage
 * 
 * BaseObject provides functionality for creating, loading, and saving objects
 * to a database. It supports identification via unique IDs and URL-friendly
 * slugs, with optional context scoping.
 */
export class BaseObject<
  T extends BaseObjectOptions = BaseObjectOptions,
> extends BaseClass<T> {
  /**
   * Reference to the collection this object belongs to
   */
  public _collection!: BaseCollection<BaseObject<T>>;
  
  /**
   * Database table name for this object
   */
  public _tableName!: string;
  
  /**
   * Unique identifier for the object
   */
  protected _id: string | null | undefined;
  
  /**
   * URL-friendly identifier
   */
  protected _slug: string | null | undefined;
  
  /**
   * Optional context to scope the slug
   */
  protected _context: string | null | undefined;

  /**
   * Human-readable name, primarily for display purposes
   */
  public name: string | null | undefined;
  
  /**
   * Creation timestamp
   */
  public created_at: Date | null | undefined;
  
  /**
   * Last update timestamp
   */
  public updated_at: Date | null | undefined;

  /**
   * Creates a new BaseObject instance
   * 
   * @param options - Configuration options including identifiers and metadata
   * @throws Error if options is null
   */
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
    
    // Initialize field values from options
    this.initializeFields(options);
  }
  
  /**
   * Initialize field values from constructor options
   */
  private initializeFields(options: any): void {
    const proto = Object.getPrototypeOf(this);
    const descriptors = Object.getOwnPropertyDescriptors(proto.constructor.prototype);
    
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor.value instanceof Field) {
        const field = descriptor.value as Field;
        
        // Set value from options or use field default
        if (options[key] !== undefined) {
          this[key as keyof this] = options[key];
          field.value = options[key];
        } else if (field.options.default !== undefined) {
          this[key as keyof this] = field.options.default;
          field.value = field.options.default;
        }
      }
    }
  }

  /**
   * Gets the unique identifier for this object
   */
  get id(): string | null | undefined {
    return this._id;
  }

  /**
   * Sets the unique identifier for this object
   * 
   * @param value - The ID to set
   * @throws Error if the value is invalid
   */
  set id(value: string | null | undefined) {
    if (!value || value === 'undefined' || value === 'null') {
      throw new Error(`id is required, ${value} given`);
    }
    this._id = value;
  }

  /**
   * Gets the URL-friendly slug for this object
   */
  get slug(): string | null | undefined {
    return this._slug;
  }

  /**
   * Sets the URL-friendly slug for this object
   * 
   * @param value - The slug to set
   * @throws Error if the value is invalid
   */
  set slug(value: string | null | undefined) {
    if (!value || value === 'undefined' || value === 'null') {
      throw new Error(`slug is invalid, ${value} given`);
    }

    this._slug = value;
  }

  /**
   * Gets the context that scopes this object's slug
   */
  get context(): string {
    return this._context || '';
  }

  /**
   * Sets the context that scopes this object's slug
   * 
   * @param value - The context to set
   * @throws Error if the value is invalid
   */
  set context(value: string | null | undefined) {
    if (value !== '' && !value) {
      throw new Error(`context is invalid, ${value} given`);
    }
    this._context = value;
  }

  /**
   * Initializes this object, setting up database tables and loading data if identifiers are provided
   * 
   * @returns Promise that resolves when initialization is complete
   */
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

  /**
   * Loads data from a database row into this object's properties
   * 
   * @param data - Database row data
   */
  loadDataFromDb(data: any) {
    const fields = this.getFields();
    for (const field in fields) {
      if (fields.hasOwnProperty(field)) {
        this[field as keyof this] = data[field];
      }
    }
  }

  /**
   * Gets all property descriptors from this object's prototype
   * 
   * @returns Object containing all property descriptors
   */
  allDescriptors() {
    const proto = Object.getPrototypeOf(this);
    const descriptors = Object.getOwnPropertyDescriptors(proto);
    return descriptors;
  }

  /**
   * Gets the database table name for this object
   */
  get tableName() {
    if (!this._tableName) {
      this._tableName = tableNameFromClass(this.constructor);
    }
    return this._tableName;
  }

  /**
   * Gets field definitions and current values for this object
   * 
   * @returns Object containing field definitions with current values
   */
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

  /**
   * Generates an SQL UPSERT statement for saving this object to the database
   * 
   * @returns SQL statement for inserting or updating this object
   */
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

  /**
   * Gets or generates a unique ID for this object
   * 
   * @returns Promise resolving to the object's ID
   */
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

  /**
   * Gets or generates a slug for this object based on its name
   * 
   * @returns Promise resolving to the object's slug
   */
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

  /**
   * Gets the ID of this object if it's already saved in the database
   * 
   * @returns Promise resolving to the saved ID or null if not saved
   */
  async getSavedId() {
    const { pluck } = this.db;
    const saved =
      await pluck`SELECT id FROM ${this.tableName} WHERE id = ${this.id} OR slug = ${this.slug} LIMIT 1`;
    return saved;
  }

  /**
   * Checks if this object is already saved in the database
   * 
   * @returns Promise resolving to true if saved, false otherwise
   */
  async isSaved() {
    const saved = await this.getSavedId();
    return !!saved;
  }

  /**
   * Saves this object to the database
   * 
   * @returns Promise resolving to this object
   */
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

  /**
   * Loads this object's data from the database using its ID
   * 
   * @returns Promise that resolves when loading is complete
   */
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

  /**
   * Loads this object's data from the database using its slug and context
   * 
   * @returns Promise that resolves when loading is complete
   */
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

  /**
   * Evaluates whether this object meets given criteria using AI
   * 
   * @param criteria - Criteria to evaluate against
   * @param options - AI message options
   * @returns Promise resolving to true if criteria are met, false otherwise
   * @throws Error if the AI response is invalid
   */
  public async is(criteria: string, options: any = {}) {
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

  /**
   * Performs actions on this object based on instructions using AI
   * 
   * @param instructions - Instructions for the AI to follow
   * @param options - AI message options
   * @returns Promise resolving to the AI response
   */
  public async do(instructions: string, options: any = {}) {
    const prompt = `--- Beginning of instructions ---\n${instructions}\n--- End of instructions ---\nBased on the content body, please follow the instructions and provide a response. Never make use of codeblocks.`;
    const result = await this.ai.message(prompt, options);
    return result;
  }

  /**
   * Runs a lifecycle hook if it's defined in the object's configuration
   * 
   * @param hookName - Name of the hook to run (e.g., 'beforeDelete', 'afterDelete')
   * @returns Promise that resolves when the hook completes
   */
  protected async runHook(hookName: string): Promise<void> {
    const config = ObjectRegistry.getConfig(this.constructor.name);
    const hook = config.hooks?.[hookName as keyof typeof config.hooks];
    
    if (!hook) {
      return; // No hook defined, nothing to do
    }

    if (typeof hook === 'string') {
      // Hook is a method name to call on this instance
      const method = (this as any)[hook];
      if (typeof method === 'function') {
        await method.call(this);
      } else {
        console.warn(`Hook method '${hook}' not found on ${this.constructor.name}`);
      }
    } else if (typeof hook === 'function') {
      // Hook is a function to call with this instance as parameter
      await hook(this);
    }
  }
  

  /**
   * Delete this object from the database
   * 
   * @returns Promise that resolves when deletion is complete
   */
  public async delete(): Promise<void> {
    await this.runHook('beforeDelete');
    
    await this.db.query(
      `DELETE FROM ${this.tableName} WHERE id = ?`,
      [this.id]
    );
    
    await this.runHook('afterDelete');
  }
}

