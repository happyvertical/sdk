/**
 * SQL-based persistence adapter
 *
 * Implements persistence using SQL databases (SQLite, PostgreSQL)
 * via the @have/sql package.
 */

import { escapeSqlValue, syncSchema } from '@have/sql';
import type { DatabaseInterface } from '@have/sql';
import { getDatabase } from '@have/sql';
import {
  DatabaseError,
  ErrorUtils,
  RuntimeError,
  ValidationError,
} from '../errors';
import { Field } from '../fields/index';
import type { SmrtObject } from '../object';
import { ObjectRegistry } from '../registry';
import {
  fieldsFromClass,
  formatDataJs,
  generateSchema,
  tableNameFromClass,
  toSnakeCase,
  toCamelCase,
} from '../utils';
import type { PersistenceAdapter } from './adapter';
import type {
  AdapterMetadata,
  CountOptions,
  ListOptions,
  LoadFilter,
  SaveResult,
  SqlPersistenceConfig,
} from './types';

/**
 * SQL persistence adapter implementation
 *
 * Wraps @have/sql DatabaseInterface to provide persistence for SMRT objects
 */
export class SqlPersistenceAdapter implements PersistenceAdapter {
  readonly metadata: AdapterMetadata = {
    type: 'sql',
    supportsTransactions: true,
    supportsSchemaGeneration: true,
    supportsBatchOperations: true,
  };

  private db!: DatabaseInterface;
  private config: SqlPersistenceConfig;
  private objectClass: new (
    ...args: any[]
  ) => SmrtObject;
  private tableName: string;
  private initialized = false;

  constructor(
    config: SqlPersistenceConfig,
    objectClass: new (...args: any[]) => SmrtObject,
  ) {
    this.config = config;
    this.objectClass = objectClass;
    this.tableName = tableNameFromClass(objectClass);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Transform config for getDatabase (expects type: 'sqlite' | 'postgres')
    const { type: _persistenceType, dbType, ...dbConfig } = this.config;
    const databaseConfig = {
      type: dbType,
      ...dbConfig,
    };

    // Create database connection
    this.db = await getDatabase(databaseConfig);

    // Setup table schema - bypass cache since we have our own initialization tracking
    const schema = generateSchema(this.objectClass);
    console.log(
      `[SQL Adapter] Generated schema for ${this.tableName}:`,
      schema,
    );
    await syncSchema({ db: this.db, schema });

    // Create unique index on (slug, context)
    await this.db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_${this.tableName}_slug_context
      ON ${this.tableName}(slug, context);
    `);

    this.initialized = true;
  }

  async save(object: SmrtObject): Promise<SaveResult> {
    try {
      // Validate object state before saving
      await this.validateBeforeSave(object);

      // Ensure ID and slug are set
      if (!object.id) {
        (object as any)._id = crypto.randomUUID();
      }

      if (!object.slug) {
        (object as any)._slug = await this.generateSlug(object);
      }

      // Update timestamps
      (object as any).updated_at = new Date();
      if (!object.created_at) {
        (object as any).created_at = new Date();
      }

      // Check if object already exists
      const existing = await this.getSavedId(object);
      const isInsert = !existing;

      // Generate and execute UPSERT statement
      const sql = this.generateUpsertStatement(object);

      await ErrorUtils.withRetry(
        async () => {
          try {
            await this.db.query(sql);
          } catch (error) {
            // Detect specific database error types
            if (error instanceof Error) {
              if (error.message.includes('UNIQUE constraint failed')) {
                const field = this.extractConstraintField(error.message);
                throw ValidationError.uniqueConstraint(
                  field,
                  (object as any)[field],
                );
              }
              if (error.message.includes('NOT NULL constraint failed')) {
                const field = this.extractConstraintField(error.message);
                throw ValidationError.requiredField(
                  field,
                  object.constructor.name,
                );
              }
              throw DatabaseError.queryFailed(sql, error);
            }
            throw error;
          }
        },
        3,
        500,
      );

      return {
        inserted: isInsert,
        affected: 1,
      };
    } catch (error) {
      // Re-throw SMRT errors as-is, wrap others
      if (error instanceof ValidationError || error instanceof DatabaseError) {
        throw error;
      }

      throw RuntimeError.operationFailed(
        'save',
        `${object.constructor.name}#${object.id}`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async load<T extends SmrtObject>(
    filter: LoadFilter,
    objectClass: new (options: any) => T,
  ): Promise<T | null> {
    try {
      const tableName = tableNameFromClass(objectClass);

      // Convert filter to WHERE conditions
      let whereClause: string;
      let whereValues: any[];

      if (typeof filter === 'string') {
        // String filter: check if it's a UUID (id) or slug
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            filter,
          );
        if (isUuid) {
          whereClause = 'WHERE id = ?';
          whereValues = [filter];
        } else {
          whereClause = 'WHERE slug = ? AND context = ?';
          whereValues = [filter, ''];
        }
      } else {
        // Object filter: build WHERE clause
        // Convert camelCase property names to snake_case column names
        const conditions = [];
        whereValues = [];

        for (const [key, value] of Object.entries(filter)) {
          const columnName = toSnakeCase(key);
          conditions.push(`${columnName} = ?`);
          whereValues.push(value);
        }

        whereClause =
          conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      }

      const sql = `SELECT * FROM ${tableName} ${whereClause} LIMIT 1`;

      const { rows } = await this.db.query(sql, whereValues);

      if (!rows || rows.length === 0) {
        return null;
      }

      // Create instance with loaded data (formatDataJs converts snake_case back to camelCase)
      const data = formatDataJs(rows[0]);
      const instance = new objectClass({
        ...data,
        _skipLoad: true,
        _persistenceAdapter: this,
      });
      await instance.initialize();

      return instance;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof DatabaseError) {
        throw error;
      }

      throw RuntimeError.operationFailed(
        'load',
        JSON.stringify(filter),
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Build SELECT clause with aliases for eager-loaded relationships
   * Uses snake_case column names from database
   *
   * @param include - Array of relationship field names to include
   * @param objectClass - Main object class constructor
   * @returns SQL SELECT clause with aliased columns
   * @private
   */
  private buildSelectClause(
    include: string[],
    objectClass: new (...args: any[]) => SmrtObject,
  ): string {
    const fields = fieldsFromClass(objectClass);
    // Convert field names to snake_case for column names
    const mainColumns = Object.keys(fields)
      .map((field) => {
        const columnName = toSnakeCase(field);
        return `t0.${columnName} as t0_${columnName}`;
      })
      .join(', ');

    if (include.length === 0) {
      return `t0.*`;
    }

    // Get relationships metadata
    const relationships = ObjectRegistry.getRelationships(objectClass.name);
    const relationshipClauses: string[] = [mainColumns];

    // Add columns for each included relationship
    for (let i = 0; i < include.length; i++) {
      const fieldName = include[i];
      const relationship = relationships.find((r) => r.fieldName === fieldName);

      if (!relationship || relationship.type !== 'foreignKey') {
        // Skip non-foreignKey relationships or invalid fields
        continue;
      }

      // Get fields from the related class
      const targetClassInfo = ObjectRegistry.getClass(relationship.targetClass);
      if (!targetClassInfo) continue;

      const targetFields = targetClassInfo.fields;
      // Convert field names to snake_case for column names
      const targetColumns = Array.from(targetFields.keys())
        .map((field) => {
          const columnName = toSnakeCase(field);
          return `t${i + 1}.${columnName} as t${i + 1}_${columnName}`;
        })
        .join(', ');

      relationshipClauses.push(targetColumns);
    }

    return relationshipClauses.join(', ');
  }

  /**
   * Build JOIN clauses for eager-loaded relationships
   * Converts camelCase property names to snake_case column names
   *
   * @param include - Array of relationship field names to include
   * @param objectClass - Main object class constructor
   * @returns SQL JOIN clauses
   * @private
   */
  private buildJoinClause(
    include: string[],
    objectClass: new (...args: any[]) => SmrtObject,
  ): string {
    if (include.length === 0) return '';

    const relationships = ObjectRegistry.getRelationships(objectClass.name);
    const joinClauses: string[] = [];

    for (let i = 0; i < include.length; i++) {
      const fieldName = include[i];
      const relationship = relationships.find((r) => r.fieldName === fieldName);

      if (!relationship || relationship.type !== 'foreignKey') {
        // Skip non-foreignKey relationships (oneToMany, manyToMany need different handling)
        continue;
      }

      const targetClassInfo = ObjectRegistry.getClass(relationship.targetClass);
      if (!targetClassInfo) continue;

      const targetTableName = targetClassInfo.schema?.tableName;
      if (!targetTableName) continue;

      // Convert camelCase fieldName to snake_case column name
      const columnName = toSnakeCase(fieldName);

      // Build LEFT JOIN for foreignKey relationship
      // ON t0.field_name = t1.id
      joinClauses.push(
        `LEFT JOIN ${targetTableName} t${i + 1} ON t0.${columnName} = t${i + 1}.id`,
      );
    }

    return joinClauses.join(' ');
  }

  /**
   * Hydrate flat SQL result rows into nested object structures
   * Converts snake_case column aliases back to camelCase property names
   *
   * @param rows - Flat SQL result rows with aliased columns
   * @param include - Array of included relationship field names
   * @param objectClass - Main object class constructor
   * @returns Array of hydrated object instances with relationships pre-loaded
   * @private
   */
  private async hydrateResultSet<T extends SmrtObject>(
    rows: any[],
    include: string[],
    objectClass: new (options: any) => T,
  ): Promise<T[]> {
    const instances: T[] = [];
    const relationships = ObjectRegistry.getRelationships(objectClass.name);

    for (const row of rows) {
      // Extract main object data (columns prefixed with t0_)
      const mainData: any = {};
      const relationshipData: Map<string, any> = new Map();

      // Parse row into main object and relationship objects
      // Column names are in snake_case with aliases (t0_field_name, t1_field_name)
      for (const [key, value] of Object.entries(row)) {
        const columnName = key as string;

        if (columnName.startsWith('t0_')) {
          // Main object column - remove t0_ prefix
          // Column is in snake_case, will be converted to camelCase by formatDataJs
          const snakeFieldName = columnName.substring(3);
          mainData[snakeFieldName] = value;
        } else {
          // Relationship column (e.g., t1_field_name)
          const match = columnName.match(/^t(\d+)_(.+)$/);
          if (match) {
            const tableIndex = Number.parseInt(match[1], 10);
            const snakeFieldName = match[2];

            if (tableIndex > 0 && tableIndex <= include.length) {
              const relationshipFieldName = include[tableIndex - 1];

              if (!relationshipData.has(relationshipFieldName)) {
                relationshipData.set(relationshipFieldName, {});
              }

              // Store snake_case field name, will be converted to camelCase by formatDataJs
              relationshipData.get(relationshipFieldName)[snakeFieldName] =
                value;
            }
          }
        }
      }

      // Create main object instance (formatDataJs converts snake_case to camelCase)
      const instance = new objectClass({
        ...formatDataJs(mainData),
        _skipLoad: true,
        _persistenceAdapter: this,
      });
      await instance.initialize();

      // Pre-populate relationship cache with loaded data
      for (const [relationshipFieldName, relatedData] of relationshipData) {
        const relationship = relationships.find(
          (r) => r.fieldName === relationshipFieldName,
        );

        if (!relationship || relationship.type !== 'foreignKey') continue;

        // Check if related object exists (not null JOIN result)
        if (relatedData.id) {
          const targetClassInfo = ObjectRegistry.getClass(
            relationship.targetClass,
          );
          if (!targetClassInfo) continue;

          // Create related object instance (formatDataJs converts snake_case to camelCase)
          const relatedInstance = new targetClassInfo.constructor({
            ...formatDataJs(relatedData),
            _skipLoad: true,
            _persistenceAdapter: this,
          });
          await relatedInstance.initialize();

          // Store in relationship cache
          (instance as any)._loadedRelationships.set(
            relationshipFieldName,
            relatedInstance,
          );
        } else {
          // NULL relationship (LEFT JOIN with no match)
          (instance as any)._loadedRelationships.set(
            relationshipFieldName,
            null,
          );
        }
      }

      instances.push(instance);
    }

    return instances;
  }

  async list<T extends SmrtObject>(
    options: ListOptions,
    objectClass: new (options: any) => T,
  ): Promise<T[]> {
    try {
      const tableName = tableNameFromClass(objectClass);
      const { where, offset, limit, orderBy, include } = options;

      // Check if we should use JOIN-based eager loading
      if (include && include.length > 0) {
        // JOIN-based eager loading path (single query for relationships)
        const selectClause = this.buildSelectClause(include, objectClass);
        const joinClause = this.buildJoinClause(include, objectClass);

        // Build WHERE clause (prefix fields with t0. and convert to snake_case)
        let whereClause = '';
        const whereValues: any[] = [];

        if (where && Object.keys(where).length > 0) {
          const conditions = [];

          for (const [key, value] of Object.entries(where)) {
            const parts = key.trim().split(/\s+/);
            const field = parts[0];
            const operator = parts[1] || '=';

            // Convert camelCase property name to snake_case column name
            const columnName = toSnakeCase(field);

            if (operator === 'in' && Array.isArray(value)) {
              const placeholders = value.map(() => '?').join(', ');
              conditions.push(`t0.${columnName} IN (${placeholders})`);
              whereValues.push(...value);
            } else if (operator === 'like') {
              conditions.push(`t0.${columnName} LIKE ?`);
              whereValues.push(value);
            } else if (value === null) {
              if (operator === '!=' || operator === '<>') {
                conditions.push(`t0.${columnName} IS NOT NULL`);
              } else {
                conditions.push(`t0.${columnName} IS NULL`);
              }
            } else {
              conditions.push(`t0.${columnName} ${operator} ?`);
              whereValues.push(value);
            }
          }

          whereClause = `WHERE ${conditions.join(' AND ')}`;
        }

        // Build ORDER BY clause (prefix fields with t0. and convert to snake_case)
        let orderByClause = '';
        if (orderBy) {
          orderByClause = ' ORDER BY ';
          const orderByItems = Array.isArray(orderBy) ? orderBy : [orderBy];

          orderByClause += orderByItems
            .map((item) => {
              const [field, direction = 'ASC'] = item.split(' ');

              if (!/^[a-zA-Z0-9_]+$/.test(field)) {
                throw new Error(`Invalid field name for ordering: ${field}`);
              }

              const normalizedDirection = direction.toUpperCase();
              if (
                normalizedDirection !== 'ASC' &&
                normalizedDirection !== 'DESC'
              ) {
                throw new Error(
                  `Invalid sort direction: ${direction}. Must be ASC or DESC.`,
                );
              }

              // Convert camelCase property name to snake_case column name
              const columnName = toSnakeCase(field);
              return `t0.${columnName} ${normalizedDirection}`;
            })
            .join(', ');
        }

        // Build LIMIT/OFFSET clause
        let limitOffsetClause = '';
        const limitOffsetValues = [];

        if (limit !== undefined) {
          limitOffsetClause += ' LIMIT ?';
          limitOffsetValues.push(limit);
        }

        if (offset !== undefined) {
          limitOffsetClause += ' OFFSET ?';
          limitOffsetValues.push(offset);
        }

        const sql = `SELECT ${selectClause} FROM ${tableName} t0 ${joinClause} ${whereClause}${orderByClause}${limitOffsetClause}`;
        const { rows } = await this.db.query(sql, [
          ...whereValues,
          ...limitOffsetValues,
        ]);

        // Hydrate results with pre-loaded relationships
        return await this.hydrateResultSet(rows, include, objectClass);
      }

      // Standard path (no eager loading) - original implementation
      // Build WHERE clause (convert camelCase to snake_case)
      let whereClause = '';
      const whereValues: any[] = [];

      if (where && Object.keys(where).length > 0) {
        const conditions = [];

        for (const [key, value] of Object.entries(where)) {
          // Parse operator from key (e.g., 'price >' → field: 'price', operator: '>')
          const parts = key.trim().split(/\s+/);
          const field = parts[0];
          const operator = parts[1] || '=';

          // Convert camelCase property name to snake_case column name
          const columnName = toSnakeCase(field);

          if (operator === 'in' && Array.isArray(value)) {
            const placeholders = value.map(() => '?').join(', ');
            conditions.push(`${columnName} IN (${placeholders})`);
            whereValues.push(...value);
          } else if (operator === 'like') {
            conditions.push(`${columnName} LIKE ?`);
            whereValues.push(value);
          } else if (value === null) {
            if (operator === '!=' || operator === '<>') {
              conditions.push(`${columnName} IS NOT NULL`);
            } else {
              conditions.push(`${columnName} IS NULL`);
            }
          } else {
            conditions.push(`${columnName} ${operator} ?`);
            whereValues.push(value);
          }
        }

        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }

      // Build ORDER BY clause (convert camelCase to snake_case)
      let orderByClause = '';
      if (orderBy) {
        orderByClause = ' ORDER BY ';
        const orderByItems = Array.isArray(orderBy) ? orderBy : [orderBy];

        orderByClause += orderByItems
          .map((item) => {
            const [field, direction = 'ASC'] = item.split(' ');

            // Validate field name
            if (!/^[a-zA-Z0-9_]+$/.test(field)) {
              throw new Error(`Invalid field name for ordering: ${field}`);
            }

            // Validate direction
            const normalizedDirection = direction.toUpperCase();
            if (
              normalizedDirection !== 'ASC' &&
              normalizedDirection !== 'DESC'
            ) {
              throw new Error(
                `Invalid sort direction: ${direction}. Must be ASC or DESC.`,
              );
            }

            // Convert camelCase property name to snake_case column name
            const columnName = toSnakeCase(field);
            return `${columnName} ${normalizedDirection}`;
          })
          .join(', ');
      }

      // Build LIMIT/OFFSET clause
      let limitOffsetClause = '';
      const limitOffsetValues = [];

      if (limit !== undefined) {
        limitOffsetClause += ' LIMIT ?';
        limitOffsetValues.push(limit);
      }

      if (offset !== undefined) {
        limitOffsetClause += ' OFFSET ?';
        limitOffsetValues.push(offset);
      }

      const sql = `SELECT * FROM ${tableName} ${whereClause}${orderByClause}${limitOffsetClause}`;
      const { rows } = await this.db.query(sql, [
        ...whereValues,
        ...limitOffsetValues,
      ]);

      // Create instances from rows
      const results: T[] = [];
      for (const row of rows) {
        const data = formatDataJs(row);
        const instance = new objectClass({
          ...data,
          _skipLoad: true,
          _persistenceAdapter: this,
        });
        await instance.initialize();
        results.push(instance);
      }

      return results;
    } catch (error) {
      throw RuntimeError.operationFailed(
        'list',
        JSON.stringify(options),
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.db.query(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
    } catch (error) {
      throw DatabaseError.queryFailed(
        `DELETE FROM ${this.tableName} WHERE id = ?`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async count(options: CountOptions): Promise<number> {
    try {
      const { where } = options;

      // Build WHERE clause (same as list method, convert camelCase to snake_case)
      let whereClause = '';
      const whereValues: any[] = [];

      if (where && Object.keys(where).length > 0) {
        const conditions = [];

        for (const [key, value] of Object.entries(where)) {
          const parts = key.trim().split(/\s+/);
          const field = parts[0];
          const operator = parts[1] || '=';

          // Convert camelCase property name to snake_case column name
          const columnName = toSnakeCase(field);

          if (operator === 'in' && Array.isArray(value)) {
            const placeholders = value.map(() => '?').join(', ');
            conditions.push(`${columnName} IN (${placeholders})`);
            whereValues.push(...value);
          } else if (operator === 'like') {
            conditions.push(`${columnName} LIKE ?`);
            whereValues.push(value);
          } else if (value === null) {
            if (operator === '!=' || operator === '<>') {
              conditions.push(`${columnName} IS NOT NULL`);
            } else {
              conditions.push(`${columnName} IS NULL`);
            }
          } else {
            conditions.push(`${columnName} ${operator} ?`);
            whereValues.push(value);
          }
        }

        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }

      const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
      const { rows } = await this.db.query(sql, whereValues);

      return Number.parseInt(rows[0].count, 10);
    } catch (error) {
      throw RuntimeError.operationFailed(
        'count',
        JSON.stringify(options),
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async bulkSave(objects: SmrtObject[]): Promise<void> {
    try {
      // Use transaction if supported
      if (this.db.transaction) {
        await this.db.transaction(async (tx) => {
          for (const obj of objects) {
            const sql = this.generateUpsertStatement(obj);
            await tx.query(sql);
          }
        });
      } else {
        // Fallback: save sequentially
        for (const obj of objects) {
          await this.save(obj);
        }
      }
    } catch (error) {
      throw RuntimeError.operationFailed(
        'bulkSave',
        `${objects.length} objects`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  async close(): Promise<void> {
    // Database connections are typically managed at the application level
    // For now, this is a no-op
  }

  // ===== Private Helper Methods =====

  /**
   * Validates object state before saving
   */
  private async validateBeforeSave(object: SmrtObject): Promise<void> {
    const fields = fieldsFromClass(object.constructor as any);

    for (const [fieldName, field] of Object.entries(fields)) {
      if (field instanceof Field && field.options.required) {
        const value = (object as any)[fieldName];
        if (value === null || value === undefined || value === '') {
          throw ValidationError.requiredField(
            fieldName,
            object.constructor.name,
          );
        }
      }
    }
  }

  /**
   * Generates slug from object name
   */
  private async generateSlug(object: SmrtObject): Promise<string> {
    if (!object.name) {
      throw ValidationError.requiredField('name', object.constructor.name);
    }

    // Explicitly convert Field to string for TypeScript
    const nameStr = String(object.name);
    return nameStr
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  /**
   * Gets the ID of object if it exists in database
   */
  private async getSavedId(object: SmrtObject): Promise<string | null> {
    const { rows } = await this.db.query(
      `SELECT id FROM ${this.tableName} WHERE id = ? OR (slug = ? AND context = ?) LIMIT 1`,
      [object.id, object.slug, object.context || ''],
    );

    return rows.length > 0 ? rows[0].id : null;
  }

  /**
   * Generates UPSERT SQL statement for object
   * Converts camelCase property names to snake_case column names
   */
  private generateUpsertStatement(object: SmrtObject): string {
    const fields = fieldsFromClass(object.constructor as any);
    const columns = ['id', 'slug', 'context'];
    const id = escapeSqlValue(object.id) || '';
    const slug = escapeSqlValue(object.slug);
    const context = escapeSqlValue(object.context || '');
    const values = [id, slug, context];
    const updates = [`slug = ${slug}`, `context = ${context}`];

    for (const [key, _field] of Object.entries(fields)) {
      if (key === 'slug' || key === 'context') continue;

      // Convert camelCase property name to snake_case column name
      const columnName = toSnakeCase(key);
      columns.push(columnName);

      // Read the actual value from the object instance, not from field.value
      // (field.value is from the dummy introspection instance and has only defaults)
      const actualValue = (object as any)[key];
      const value =
        typeof actualValue === 'boolean' ? (actualValue ? 1 : 0) : actualValue;

      const escapedValue = escapeSqlValue(value);

      values.push(escapedValue);
      updates.push(`${columnName} = ${escapedValue}`);
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
   * Extracts field name from database constraint error messages
   */
  private extractConstraintField(errorMessage: string): string {
    const patterns = [
      /UNIQUE constraint failed: \w+\.(\w+)/,
      /NOT NULL constraint failed: \w+\.(\w+)/,
      /constraint failed: (\w+)/i,
    ];

    for (const pattern of patterns) {
      const match = errorMessage.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return 'unknown_field';
  }
}
