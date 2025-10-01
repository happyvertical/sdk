/**
 * Global object registry for SMRT classes
 *
 * Maintains a central registry of all @smrt decorated classes, enabling
 * module awareness, automatic API generation, and runtime introspection.
 * The registry tracks class definitions, field metadata, and configuration
 * options for code generation and runtime operations.
 *
 * @example Registering a class manually
 * ```typescript
 * import { ObjectRegistry } from '@have/smrt';
 *
 * ObjectRegistry.register(MyClass, {
 *   api: { exclude: ['delete'] },
 *   cli: true
 * });
 * ```
 *
 * @example Using the decorator (recommended)
 * ```typescript
 * import { smrt } from '@have/smrt';
 *
 * @smrt({ api: { exclude: ['delete'] } })
 * class Product extends SmrtObject {
 *   name = text({ required: true });
 * }
 * ```
 */

import type { SmrtCollection } from './collection';
import type { SmrtObject } from './object';
import {
  generateSchema,
  generateTriggerDefinitions,
  tableNameFromClass,
} from './utils';

/**
 * Configuration options for SMRT objects registered in the system
 *
 * Controls how objects are exposed through generated APIs, CLIs, and MCP servers.
 * Each section configures a different aspect of code generation and runtime behavior.
 *
 * @interface SmartObjectConfig
 */
export interface SmartObjectConfig {
  /**
   * Custom name for the object (defaults to class name)
   */
  name?: string;

  /**
   * API configuration
   */
  api?: {
    /**
     * Exclude specific endpoints (supports both standard CRUD actions and custom methods)
     */
    exclude?: string[];

    /**
     * Include only specific endpoints (supports both standard CRUD actions and custom methods)
     */
    include?: string[];

    /**
     * Custom middleware for this object's endpoints
     */
    middleware?: any[];

    /**
     * Custom endpoint handlers (supports both standard CRUD actions and custom methods)
     */
    customize?: Record<string, (req: any, collection: any) => Promise<any>>;
  };

  /**
   * MCP server configuration
   */
  mcp?: {
    /**
     * Include specific tools (supports both standard CRUD actions and custom methods)
     */
    include?: string[];

    /**
     * Exclude specific tools (supports both standard CRUD actions and custom methods)
     */
    exclude?: string[];
  };

  /**
   * CLI configuration
   */
  cli?:
    | boolean
    | {
        /**
         * Include specific commands (supports both standard CRUD actions and custom methods)
         */
        include?: string[];

        /**
         * Exclude specific commands (supports both standard CRUD actions and custom methods)
         */
        exclude?: string[];
      };

  /**
   * Lifecycle hooks
   */
  hooks?: {
    beforeSave?: string | ((instance: any) => Promise<void>);
    afterSave?: string | ((instance: any) => Promise<void>);
    beforeCreate?: string | ((instance: any) => Promise<void>);
    afterCreate?: string | ((instance: any) => Promise<void>);
    beforeUpdate?: string | ((instance: any) => Promise<void>);
    afterUpdate?: string | ((instance: any) => Promise<void>);
    beforeDelete?: string | ((instance: any) => Promise<void>);
    afterDelete?: string | ((instance: any) => Promise<void>);
  };
}

/**
 * Schema definition for a registered class
 */
interface SchemaDefinition {
  /** SQL DDL statement for table creation */
  ddl: string;
  /** Index creation statements */
  indexes: string[];
  /** Trigger definitions for automatic timestamp management */
  triggers: Array<{
    name: string;
    when: 'BEFORE' | 'AFTER';
    event: 'INSERT' | 'UPDATE' | 'DELETE';
    tableName: string;
    condition?: string;
    body: string;
    description?: string;
  }>;
  /** Table name derived from class name */
  tableName: string;
}

/**
 * Validation function that takes an object instance and returns
 * a ValidationError if validation fails, or null if validation passes
 */
type ValidatorFunction = (
  instance: any,
) => Promise<import('./errors').ValidationError | null>;

/**
 * Internal representation of a registered SMRT class
 *
 * @interface RegisteredClass
 * @private
 */
interface RegisteredClass {
  name: string;
  constructor: typeof SmrtObject;
  collectionConstructor?: new (options: any) => SmrtCollection<any>;
  config: SmartObjectConfig;
  fields: Map<string, any>;
  /** Cached schema definition generated during registration */
  schema?: SchemaDefinition;
  /** Compiled validation functions for efficient runtime validation */
  validators?: ValidatorFunction[];
}

/**
 * Central registry for all SMRT objects
 */
export class ObjectRegistry {
  private static classes = new Map<string, RegisteredClass>();
  private static collections = new Map<string, typeof SmrtCollection>();

  /**
   * Register a new SMRT object class with the global registry
   *
   * @param constructor - The class constructor extending SmrtObject
   * @param config - Configuration options for API/CLI/MCP generation
   * @throws {Error} If the class cannot be introspected for field definitions
   * @example
   * ```typescript
   * ObjectRegistry.register(Product, {
   *   api: { exclude: ['delete'] },
   *   cli: true,
   *   mcp: { include: ['list', 'get'] }
   * });
   * ```
   */
  static register(
    ctor: typeof SmrtObject,
    config: SmartObjectConfig = {},
  ): void {
    const name = config.name || ctor.name;

    // Prevent duplicate registrations
    if (ObjectRegistry.classes.has(name)) {
      return; // Already registered, skip silently
    }

    // Extract field definitions from the class
    const fields = ObjectRegistry.extractFields(ctor);

    // Generate and cache schema definition
    const tableName = tableNameFromClass(ctor);
    const schemaDDL = generateSchema(ctor);
    const triggerDefs = generateTriggerDefinitions(tableName);

    // Parse schema DDL to extract indexes
    const indexes: string[] = [];
    const ddlLines = schemaDDL.split('\n');
    const tableEndIndex = ddlLines.findIndex((line) => line.includes(');'));
    const indexLines = ddlLines.slice(tableEndIndex + 1);
    for (const line of indexLines) {
      if (line.trim().startsWith('CREATE INDEX')) {
        indexes.push(line.trim());
      }
    }

    // Store complete schema definition
    const schema: SchemaDefinition = {
      ddl: schemaDDL,
      indexes,
      triggers: triggerDefs,
      tableName,
    };

    // Compile validation functions from field definitions
    const validators = ObjectRegistry.compileValidators(name, fields);

    ObjectRegistry.classes.set(name, {
      name,
      constructor: ctor,
      config,
      fields,
      schema,
      validators,
    });

    console.log(
      `🎯 Registered smrt object: ${name} with schema for ${tableName} and ${validators.length} validators`,
    );
  }

  /**
   * Register a collection class for an object
   *
   * @param objectName - Name of the object class this collection manages
   * @param collectionConstructor - The collection class constructor
   * @example
   * ```typescript
   * ObjectRegistry.registerCollection('Product', ProductCollection);
   * ```
   */
  static registerCollection(
    objectName: string,
    collectionConstructor: new (options: any) => SmrtCollection<any>,
  ): void {
    const registered = ObjectRegistry.classes.get(objectName);
    if (registered) {
      registered.collectionConstructor = collectionConstructor;
    }

    ObjectRegistry.collections.set(objectName, collectionConstructor as any);
  }

  /**
   * Get a registered class by name
   *
   * @param name - Name of the registered class
   * @returns Registered class information or undefined if not found
   * @example
   * ```typescript
   * const productInfo = ObjectRegistry.getClass('Product');
   * if (productInfo) {
   *   console.log(productInfo.config.api?.exclude);
   * }
   * ```
   */
  static getClass(name: string): RegisteredClass | undefined {
    return ObjectRegistry.classes.get(name);
  }

  /**
   * Get all registered classes
   *
   * @returns Map of class names to registered class information
   * @example
   * ```typescript
   * const allClasses = ObjectRegistry.getAllClasses();
   * for (const [name, info] of allClasses) {
   *   console.log(`Class: ${name}, Fields: ${info.fields.size}`);
   * }
   * ```
   */
  static getAllClasses(): Map<string, RegisteredClass> {
    return new Map(ObjectRegistry.classes);
  }

  /**
   * Get class names
   */
  static getClassNames(): string[] {
    return Array.from(ObjectRegistry.classes.keys());
  }

  /**
   * Check if a class is registered
   */
  static hasClass(name: string): boolean {
    return ObjectRegistry.classes.has(name);
  }

  /**
   * Clear all registered classes (mainly for testing)
   */
  static clear(): void {
    ObjectRegistry.classes.clear();
    ObjectRegistry.collections.clear();
  }

  /**
   * Extract field definitions from a class constructor
   */
  private static extractFields(ctor: typeof SmrtObject): Map<string, any> {
    const fields = new Map();

    try {
      // Create a temporary instance to inspect field definitions
      const tempInstance = new (ctor as any)({
        db: null,
        ai: null,
        fs: null,
        _skipRegistration: true, // Prevent infinite recursion
      });

      // Look for Field instances on the instance
      for (const key of Object.getOwnPropertyNames(tempInstance)) {
        const value = tempInstance[key];
        if (value && typeof value === 'object' && value.type) {
          fields.set(key, value);
        }
      }

      // Also check the prototype for field definitions
      const proto = Object.getPrototypeOf(tempInstance);
      const descriptors = Object.getOwnPropertyDescriptors(
        proto.constructor.prototype,
      );

      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (
          descriptor.value &&
          typeof descriptor.value === 'object' &&
          descriptor.value.type
        ) {
          fields.set(key, descriptor.value);
        }
      }

      // Check static field definitions if they exist
      if ((ctor as any).fields) {
        for (const [key, field] of Object.entries((ctor as any).fields)) {
          fields.set(key, field);
        }
      }
    } catch (error) {
      console.warn(
        `Warning: Could not extract fields from ${ctor.name}:`,
        error,
      );
    }

    return fields;
  }

  /**
   * Compile validation functions from field definitions
   *
   * Extracts validation rules from field options and compiles them into
   * efficient validation functions that can be executed at runtime.
   *
   * @param className - Name of the class being validated
   * @param fields - Map of field definitions
   * @returns Array of compiled validation functions
   * @private
   */
  private static compileValidators(
    className: string,
    fields: Map<string, any>,
  ): ValidatorFunction[] {
    const validators: ValidatorFunction[] = [];

    for (const [fieldName, field] of fields) {
      const options = field.options || {};

      // Required field validator
      if (options.required) {
        validators.push(async (instance: any) => {
          const value = instance[fieldName];
          if (value === null || value === undefined || value === '') {
            const ValidationError = await import('./errors').then(
              (m) => m.ValidationError,
            );
            return ValidationError.requiredField(fieldName, className);
          }
          return null;
        });
      }

      // Numeric range validators
      if (
        field.type === 'integer' ||
        field.type === 'decimal' ||
        field.type === 'number'
      ) {
        if (options.min !== undefined) {
          validators.push(async (instance: any) => {
            const value = instance[fieldName];
            if (value !== null && value !== undefined && value < options.min) {
              const ValidationError = await import('./errors').then(
                (m) => m.ValidationError,
              );
              return ValidationError.rangeError(
                fieldName,
                value,
                options.min,
                options.max,
              );
            }
            return null;
          });
        }

        if (options.max !== undefined) {
          validators.push(async (instance: any) => {
            const value = instance[fieldName];
            if (value !== null && value !== undefined && value > options.max) {
              const ValidationError = await import('./errors').then(
                (m) => m.ValidationError,
              );
              return ValidationError.rangeError(
                fieldName,
                value,
                options.min,
                options.max,
              );
            }
            return null;
          });
        }
      }

      // String length validators
      if (field.type === 'text') {
        if (options.minLength !== undefined) {
          validators.push(async (instance: any) => {
            const value = instance[fieldName];
            if (
              value &&
              typeof value === 'string' &&
              value.length < options.minLength
            ) {
              const ValidationError = await import('./errors').then(
                (m) => m.ValidationError,
              );
              return ValidationError.invalidValue(
                fieldName,
                value,
                `string with minimum length ${options.minLength}`,
              );
            }
            return null;
          });
        }

        if (options.maxLength !== undefined) {
          validators.push(async (instance: any) => {
            const value = instance[fieldName];
            if (
              value &&
              typeof value === 'string' &&
              value.length > options.maxLength
            ) {
              const ValidationError = await import('./errors').then(
                (m) => m.ValidationError,
              );
              return ValidationError.invalidValue(
                fieldName,
                value,
                `string with maximum length ${options.maxLength}`,
              );
            }
            return null;
          });
        }

        // Pattern validator (regex)
        if (options.pattern) {
          const regex = new RegExp(options.pattern);
          validators.push(async (instance: any) => {
            const value = instance[fieldName];
            if (value && typeof value === 'string' && !regex.test(value)) {
              const ValidationError = await import('./errors').then(
                (m) => m.ValidationError,
              );
              return ValidationError.invalidValue(
                fieldName,
                value,
                `string matching pattern ${options.pattern}`,
              );
            }
            return null;
          });
        }
      }

      // Custom validator function
      if (options.validate && typeof options.validate === 'function') {
        validators.push(async (instance: any) => {
          const value = instance[fieldName];
          try {
            const isValid = await options.validate(value);
            if (!isValid) {
              const ValidationError = await import('./errors').then(
                (m) => m.ValidationError,
              );
              const message =
                options.customMessage ||
                `Field ${fieldName} failed custom validation`;
              return ValidationError.invalidValue(fieldName, value, message);
            }
          } catch (error) {
            const ValidationError = await import('./errors').then(
              (m) => m.ValidationError,
            );
            return ValidationError.invalidValue(
              fieldName,
              value,
              `custom validation error: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          return null;
        });
      }
    }

    return validators;
  }

  /**
   * Get field definitions for a registered class
   */
  static getFields(name: string): Map<string, any> {
    const registered = ObjectRegistry.classes.get(name);
    return registered ? registered.fields : new Map();
  }

  /**
   * Get configuration for a registered class
   */
  static getConfig(name: string): SmartObjectConfig {
    const registered = ObjectRegistry.classes.get(name);
    return registered ? registered.config : {};
  }

  /**
   * Get cached schema definition for a registered class
   *
   * @param name - Name of the registered class
   * @returns Schema definition or undefined if not found
   * @example
   * ```typescript
   * const schema = ObjectRegistry.getSchema('Product');
   * console.log(schema.tableName); // 'products'
   * console.log(schema.ddl);       // 'CREATE TABLE...'
   * ```
   */
  static getSchema(name: string): SchemaDefinition | undefined {
    const registered = ObjectRegistry.classes.get(name);
    return registered?.schema;
  }

  /**
   * Get SQL DDL statement for a registered class
   *
   * @param name - Name of the registered class
   * @returns SQL DDL statement or undefined if not found
   * @example
   * ```typescript
   * const ddl = ObjectRegistry.getSchemaDDL('Product');
   * await db.query(ddl);
   * ```
   */
  static getSchemaDDL(name: string): string | undefined {
    return ObjectRegistry.getSchema(name)?.ddl;
  }

  /**
   * Get table name for a registered class
   *
   * @param name - Name of the registered class
   * @returns Table name or undefined if not found
   * @example
   * ```typescript
   * const tableName = ObjectRegistry.getTableName('Product');
   * console.log(tableName); // 'products'
   * ```
   */
  static getTableName(name: string): string | undefined {
    return ObjectRegistry.getSchema(name)?.tableName;
  }

  /**
   * Get compiled validation functions for a registered class
   *
   * Returns pre-compiled validation functions that can be executed
   * at runtime for efficient validation without repeated setup.
   *
   * @param name - Name of the registered class
   * @returns Array of validation functions or undefined if not found
   * @example
   * ```typescript
   * const validators = ObjectRegistry.getValidators('Product');
   * for (const validator of validators || []) {
   *   const error = await validator(productInstance);
   *   if (error) console.error(error);
   * }
   * ```
   */
  static getValidators(name: string): ValidatorFunction[] | undefined {
    const registered = ObjectRegistry.classes.get(name);
    return registered?.validators;
  }

  /**
   * Build dependency graph from foreignKey relationships
   *
   * Returns a map where keys are class names and values are arrays
   * of class names that the key depends on (via foreignKey fields).
   *
   * @returns Map of class name to array of dependency class names
   * @example
   * ```typescript
   * const deps = ObjectRegistry.getDependencyGraph();
   * // { 'Order': ['Customer', 'Product'], 'Customer': [], 'Product': ['Category'] }
   * ```
   */
  static getDependencyGraph(): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    // Initialize graph with all registered classes
    for (const [className] of ObjectRegistry.classes) {
      graph.set(className, []);
    }

    // Scan all fields for foreignKey relationships
    for (const [className, registered] of ObjectRegistry.classes) {
      const dependencies: string[] = [];

      for (const [_fieldName, field] of registered.fields) {
        if (field.type === 'foreignKey' && field.options?.related) {
          const relatedClass = field.options.related;
          // Only add if the related class is registered
          if (ObjectRegistry.classes.has(relatedClass)) {
            dependencies.push(relatedClass);
          }
        }
      }

      graph.set(className, dependencies);
    }

    return graph;
  }

  /**
   * Get initialization order for classes based on dependency graph
   *
   * Uses topological sort to ensure that classes are initialized in
   * an order that respects foreignKey dependencies (dependencies first).
   *
   * @returns Array of class names in initialization order
   * @throws {Error} If circular dependencies are detected
   * @example
   * ```typescript
   * const order = ObjectRegistry.getInitializationOrder();
   * // ['Category', 'Product', 'Customer', 'Order']
   * // Tables are created in this order to avoid foreign key errors
   * ```
   */
  static getInitializationOrder(): string[] {
    const graph = ObjectRegistry.getDependencyGraph();
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    function visit(className: string): void {
      // Circular dependency check
      if (visiting.has(className)) {
        throw new Error(
          `Circular dependency detected involving class: ${className}`,
        );
      }

      // Already processed
      if (visited.has(className)) {
        return;
      }

      visiting.add(className);

      // Visit all dependencies first
      const dependencies = graph.get(className) || [];
      for (const dep of dependencies) {
        visit(dep);
      }

      visiting.delete(className);
      visited.add(className);
      order.push(className);
    }

    // Visit all classes
    for (const className of graph.keys()) {
      if (!visited.has(className)) {
        visit(className);
      }
    }

    return order;
  }
}

/**
 * @smrt decorator for registering classes with the global registry
 *
 * @example
 * ```typescript
 * @smrt()
 * class Product extends SmrtObject {
 *   name = text({ required: true });
 *   price = decimal({ min: 0 });
 * }
 *
 * @smrt({ api: { exclude: ['delete'] } })
 * class SensitiveData extends SmrtObject {
 *   secret = text({ encrypted: true });
 * }
 * ```
 */
export function smrt(config: SmartObjectConfig = {}) {
  return <T extends typeof SmrtObject>(ctor: T): T => {
    ObjectRegistry.register(ctor, config);
    return ctor;
  };
}
