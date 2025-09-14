/**
 * Global object registry for smrt classes
 * 
 * Maintains a central registry of all @smrt decorated classes,
 * enabling module awareness and automatic API generation.
 */

import type { BaseObject } from './object.js';
import type { BaseCollection } from './collection.js';

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
  cli?: boolean | {
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

interface RegisteredClass {
  name: string;
  constructor: typeof BaseObject;
  collectionConstructor?: typeof BaseCollection;
  config: SmartObjectConfig;
  fields: Map<string, any>;
}

/**
 * Central registry for all SMRT objects
 */
export class ObjectRegistry {
  private static classes = new Map<string, RegisteredClass>();
  private static collections = new Map<string, typeof BaseCollection>();
  
  /**
   * Register a new smrt object class
   */
  static register(
    constructor: typeof BaseObject,
    config: SmartObjectConfig = {}
  ): void {
    const name = config.name || constructor.name;
    
    // Extract field definitions from the class
    const fields = this.extractFields(constructor);
    
    this.classes.set(name, {
      name,
      constructor,
      config,
      fields
    });
    
    console.log(`🎯 Registered smrt object: ${name}`);
  }
  
  /**
   * Register a collection class for an object
   */
  static registerCollection(
    objectName: string,
    collectionConstructor: typeof BaseCollection
  ): void {
    const registered = this.classes.get(objectName);
    if (registered) {
      registered.collectionConstructor = collectionConstructor;
    }
    
    this.collections.set(objectName, collectionConstructor);
  }
  
  /**
   * Get a registered class by name
   */
  static getClass(name: string): RegisteredClass | undefined {
    return this.classes.get(name);
  }
  
  /**
   * Get all registered classes
   */
  static getAllClasses(): Map<string, RegisteredClass> {
    return new Map(this.classes);
  }
  
  /**
   * Get class names
   */
  static getClassNames(): string[] {
    return Array.from(this.classes.keys());
  }
  
  /**
   * Check if a class is registered
   */
  static hasClass(name: string): boolean {
    return this.classes.has(name);
  }
  
  /**
   * Clear all registered classes (mainly for testing)
   */
  static clear(): void {
    this.classes.clear();
    this.collections.clear();
  }
  
  /**
   * Extract field definitions from a class constructor
   */
  private static extractFields(constructor: typeof BaseObject): Map<string, any> {
    const fields = new Map();
    
    try {
      // Create a temporary instance to inspect field definitions  
      const tempInstance = new (constructor as any)({
        db: null, ai: null, fs: null
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
      const descriptors = Object.getOwnPropertyDescriptors(proto.constructor.prototype);
      
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (descriptor.value && typeof descriptor.value === 'object' && descriptor.value.type) {
          fields.set(key, descriptor.value);
        }
      }
      
      // Check static field definitions if they exist
      if ((constructor as any).fields) {
        for (const [key, field] of Object.entries((constructor as any).fields)) {
          fields.set(key, field);
        }
      }
    } catch (error) {
      console.warn(`Warning: Could not extract fields from ${constructor.name}:`, error);
    }
    
    return fields;
  }
  
  /**
   * Get field definitions for a registered class
   */
  static getFields(name: string): Map<string, any> {
    const registered = this.classes.get(name);
    return registered ? registered.fields : new Map();
  }
  
  /**
   * Get configuration for a registered class
   */
  static getConfig(name: string): SmartObjectConfig {
    const registered = this.classes.get(name);
    return registered ? registered.config : {};
  }
}

/**
 * @smrt decorator for registering classes with the global registry
 * 
 * @example
 * ```typescript
 * @smrt()
 * class Product extends BaseObject {
 *   name = text({ required: true });
 *   price = decimal({ min: 0 });
 * }
 * 
 * @smrt({ api: { exclude: ['delete'] } })
 * class SensitiveData extends BaseObject {
 *   secret = text({ encrypted: true });
 * }
 * ```
 */
export function smrt(config: SmartObjectConfig = {}) {
  return function <T extends typeof BaseObject>(constructor: T): T {
    ObjectRegistry.register(constructor, config);
    return constructor;
  };
}