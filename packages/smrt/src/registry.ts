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

import type { SmrtCollection } from './collection.js';
import type { SmrtObject } from './object.js';

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
     * Exclude specific endpoints
     */
    exclude?: ('list' | 'get' | 'create' | 'update' | 'delete')[];

    /**
     * Include only specific endpoints
     */
    include?: ('list' | 'get' | 'create' | 'update' | 'delete')[];

    /**
     * Custom middleware for this object's endpoints
     */
    middleware?: any[];

    /**
     * Custom endpoint handlers
     */
    customize?: {
      list?: (req: any, collection: any) => Promise<any>;
      get?: (req: any, collection: any) => Promise<any>;
      create?: (req: any, collection: any) => Promise<any>;
      update?: (req: any, collection: any) => Promise<any>;
      delete?: (req: any, collection: any) => Promise<any>;
    };
  };

  /**
   * MCP server configuration
   */
  mcp?: {
    /**
     * Include specific tools
     */
    include?: ('list' | 'get' | 'create' | 'update' | 'delete')[];

    /**
     * Exclude specific tools
     */
    exclude?: ('list' | 'get' | 'create' | 'update' | 'delete')[];
  };

  /**
   * CLI configuration
   */
  cli?:
    | boolean
    | {
        /**
         * Include specific commands
         */
        include?: ('list' | 'get' | 'create' | 'update' | 'delete')[];

        /**
         * Exclude specific commands
         */
        exclude?: ('list' | 'get' | 'create' | 'update' | 'delete')[];
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
 * Internal representation of a registered SMRT class
 *
 * @interface RegisteredClass
 * @private
 */
interface RegisteredClass {
  name: string;
  constructor: typeof SmrtObject;
  collectionConstructor?: typeof SmrtCollection;
  config: SmartObjectConfig;
  fields: Map<string, any>;
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
    constructor: typeof SmrtObject,
    config: SmartObjectConfig = {},
  ): void {
    const name = config.name || constructor.name;

    // Prevent duplicate registrations
    if (ObjectRegistry.classes.has(name)) {
      return; // Already registered, skip silently
    }

    // Extract field definitions from the class
    const fields = ObjectRegistry.extractFields(constructor);

    ObjectRegistry.classes.set(name, {
      name,
      constructor,
      config,
      fields,
    });

    console.log(`🎯 Registered smrt object: ${name}`);
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
    collectionConstructor: typeof SmrtCollection,
  ): void {
    const registered = ObjectRegistry.classes.get(objectName);
    if (registered) {
      registered.collectionConstructor = collectionConstructor;
    }

    ObjectRegistry.collections.set(objectName, collectionConstructor);
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
  private static extractFields(
    constructor: typeof SmrtObject,
  ): Map<string, any> {
    const fields = new Map();

    try {
      // Create a temporary instance to inspect field definitions
      const tempInstance = new (constructor as any)({
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
      if ((constructor as any).fields) {
        for (const [key, field] of Object.entries(
          (constructor as any).fields,
        )) {
          fields.set(key, field);
        }
      }
    } catch (error) {
      console.warn(
        `Warning: Could not extract fields from ${constructor.name}:`,
        error,
      );
    }

    return fields;
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
  return <T extends typeof SmrtObject>(constructor: T): T => {
    ObjectRegistry.register(constructor, config);
    return constructor;
  };
}
