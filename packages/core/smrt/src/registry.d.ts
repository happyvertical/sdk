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
    cli?: boolean | {
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
}
/**
 * Central registry for all SMRT objects
 */
export declare class ObjectRegistry {
    private static classes;
    private static collections;
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
    static register(ctor: typeof SmrtObject, config?: SmartObjectConfig): void;
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
    static registerCollection(objectName: string, collectionConstructor: new (options: any) => SmrtCollection<any>): void;
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
    static getClass(name: string): RegisteredClass | undefined;
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
    static getAllClasses(): Map<string, RegisteredClass>;
    /**
     * Get class names
     */
    static getClassNames(): string[];
    /**
     * Check if a class is registered
     */
    static hasClass(name: string): boolean;
    /**
     * Clear all registered classes (mainly for testing)
     */
    static clear(): void;
    /**
     * Extract field definitions from a class constructor
     */
    private static extractFields;
    /**
     * Get field definitions for a registered class
     */
    static getFields(name: string): Map<string, any>;
    /**
     * Get configuration for a registered class
     */
    static getConfig(name: string): SmartObjectConfig;
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
export declare function smrt(config?: SmartObjectConfig): <T extends typeof SmrtObject>(ctor: T) => T;
export {};
