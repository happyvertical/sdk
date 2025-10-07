import type { AIClientOptions } from '@have/ai';
import { AIClient } from '@have/ai';
import type { FilesystemAdapterOptions } from '@have/files';
import { FilesystemAdapter } from '@have/files';
import type { DatabaseInterface } from '@have/sql';
/**
 * Configuration options for the SmrtClass
 */
export interface SmrtClassOptions {
    /**
     * Optional custom class name override
     */
    _className?: string;
    /**
     * Database configuration options
     */
    db?: {
        url?: string;
        type?: 'sqlite' | 'postgres';
        authToken?: string;
        [key: string]: any;
    };
    /**
     * Filesystem adapter configuration options
     */
    fs?: FilesystemAdapterOptions;
    /**
     * AI client configuration options
     */
    ai?: AIClientOptions;
}
/**
 * Foundation class providing core functionality for the SMRT framework
 *
 * SmrtClass provides unified access to database, filesystem, and AI client
 * interfaces. It serves as the foundation for all other classes in the
 * SMRT framework.
 */
export declare class SmrtClass {
    /**
     * AI client instance for interacting with AI models
     */
    protected _ai: AIClient;
    /**
     * Filesystem adapter for file operations
     */
    protected _fs: FilesystemAdapter;
    /**
     * Database interface for data persistence
     */
    protected _db: DatabaseInterface;
    /**
     * Class name used for identification
     */
    protected _className: string;
    /**
     * Configuration options provided to the class
     */
    protected options: SmrtClassOptions;
    /**
     * Creates a new SmrtClass instance
     *
     * @param options - Configuration options for database, filesystem, and AI clients
     */
    constructor(options?: SmrtClassOptions);
    /**
     * Initializes database, filesystem, and AI client connections
     *
     * This method sets up all required services based on the provided options.
     * It should be called before using any of the service interfaces.
     *
     * @returns Promise that resolves when initialization is complete
     */
    protected initialize(): Promise<void>;
    /**
     * Gets the filesystem adapter instance
     */
    get fs(): FilesystemAdapter;
    /**
     * Gets the database interface instance
     */
    get db(): DatabaseInterface;
    /**
     * Gets the AI client instance
     */
    get ai(): AIClient;
}
