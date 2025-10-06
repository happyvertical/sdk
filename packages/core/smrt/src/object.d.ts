import type { SmrtClassOptions } from './class';
import { SmrtClass } from './class';
/**
 * Options for SmrtObject initialization
 */
export interface SmrtObjectOptions extends SmrtClassOptions {
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
 * Core persistent object with unique identifiers and database storage
 *
 * SmrtObject provides functionality for creating, loading, and saving objects
 * to a database. It supports identification via unique IDs and URL-friendly
 * slugs, with optional context scoping.
 */
export declare class SmrtObject extends SmrtClass {
    /**
     * Database table name for this object
     */
    _tableName: string;
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
    name: string | null | undefined;
    /**
     * Creation timestamp
     */
    created_at: Date | null | undefined;
    /**
     * Last update timestamp
     */
    updated_at: Date | null | undefined;
    /**
     * Creates a new SmrtObject instance
     *
     * @param options - Configuration options including identifiers and metadata
     * @throws Error if options is null
     */
    constructor(options?: SmrtObjectOptions);
    /**
     * Initialize field values from constructor options
     */
    private initializeFields;
    /**
     * Gets the unique identifier for this object
     */
    get id(): string | null | undefined;
    /**
     * Sets the unique identifier for this object
     *
     * @param value - The ID to set
     * @throws Error if the value is invalid
     */
    set id(value: string | null | undefined);
    /**
     * Gets the URL-friendly slug for this object
     */
    get slug(): string | null | undefined;
    /**
     * Sets the URL-friendly slug for this object
     *
     * @param value - The slug to set
     * @throws Error if the value is invalid
     */
    set slug(value: string | null | undefined);
    /**
     * Gets the context that scopes this object's slug
     */
    get context(): string;
    /**
     * Sets the context that scopes this object's slug
     *
     * @param value - The context to set
     * @throws Error if the value is invalid
     */
    set context(value: string | null | undefined);
    /**
     * Initializes this object, setting up database tables and loading data if identifiers are provided
     *
     * @returns Promise that resolves when initialization is complete
     */
    protected initialize(): Promise<void>;
    /**
     * Loads data from a database row into this object's properties
     *
     * @param data - Database row data
     */
    loadDataFromDb(data: any): void;
    /**
     * Gets all property descriptors from this object's prototype
     *
     * @returns Object containing all property descriptors
     */
    allDescriptors(): {
        [x: string]: TypedPropertyDescriptor<any>;
    } & {
        [x: string]: PropertyDescriptor;
    };
    /**
     * Gets the database table name for this object
     */
    get tableName(): string;
    /**
     * Gets field definitions and current values for this object
     *
     * @returns Object containing field definitions with current values
     */
    getFields(): Record<string, any>;
    /**
     * Generates an SQL UPSERT statement for saving this object to the database
     *
     * @returns SQL statement for inserting or updating this object
     */
    generateUpsertStatement(): string;
    /**
     * Gets or generates a unique ID for this object
     *
     * @returns Promise resolving to the object's ID
     */
    getId(): Promise<string>;
    /**
     * Gets or generates a slug for this object based on its name
     *
     * @returns Promise resolving to the object's slug
     */
    getSlug(): Promise<string | null | undefined>;
    /**
     * Gets the ID of this object if it's already saved in the database
     *
     * @returns Promise resolving to the saved ID or null if not saved
     */
    getSavedId(): Promise<any>;
    /**
     * Checks if this object is already saved in the database
     *
     * @returns Promise resolving to true if saved, false otherwise
     */
    isSaved(): Promise<boolean>;
    /**
     * Saves this object to the database
     *
     * @returns Promise resolving to this object
     */
    save(): Promise<this>;
    /**
     * Validates object state before saving
     * Override in subclasses to add custom validation logic
     */
    protected validateBeforeSave(): Promise<void>;
    /**
     * Gets the value of a field on this object
     */
    protected getFieldValue(fieldName: string): any;
    /**
     * Extracts field name from database constraint error messages
     */
    protected extractConstraintField(errorMessage: string): string;
    /**
     * Loads this object's data from the database using its ID
     *
     * @returns Promise that resolves when loading is complete
     */
    loadFromId(): Promise<void>;
    /**
     * Loads this object's data from the database using its slug and context
     *
     * @returns Promise that resolves when loading is complete
     */
    loadFromSlug(): Promise<void>;
    /**
     * Evaluates whether this object meets given criteria using AI
     *
     * @param criteria - Criteria to evaluate against
     * @param options - AI message options
     * @returns Promise resolving to true if criteria are met, false otherwise
     * @throws Error if the AI response is invalid
     */
    is(criteria: string, options?: any): Promise<any>;
    /**
     * Performs actions on this object based on instructions using AI
     *
     * @param instructions - Instructions for the AI to follow
     * @param options - AI message options
     * @returns Promise resolving to the AI response
     */
    do(instructions: string, options?: any): Promise<string>;
    /**
     * Runs a lifecycle hook if it's defined in the object's configuration
     *
     * @param hookName - Name of the hook to run (e.g., 'beforeDelete', 'afterDelete')
     * @returns Promise that resolves when the hook completes
     */
    protected runHook(hookName: string): Promise<void>;
    /**
     * Delete this object from the database
     *
     * @returns Promise that resolves when deletion is complete
     */
    delete(): Promise<void>;
}
