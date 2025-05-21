import { getDatabase } from '@have/sql';
import type { DatabaseOptions, DatabaseInterface } from '@have/sql';
import { FilesystemAdapter } from '@have/files';
import type { FilesystemAdapterOptions } from '@have/files';
import type { AIClientOptions } from '@have/ai';
import { AIClient } from '@have/ai';

/**
 * Configuration options for the BaseClass
 */
export interface BaseClassOptions {
  /**
   * Optional custom class name override
   */
  _className?: string;
  
  /**
   * Database configuration options
   */
  db?: DatabaseOptions;
  
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
 * BaseClass provides unified access to database, filesystem, and AI client
 * interfaces. It serves as the foundation for all other classes in the
 * SMRT framework.
 */
export class BaseClass<T extends BaseClassOptions = BaseClassOptions> {
  /**
   * AI client instance for interacting with AI models
   */
  protected _ai!: AIClient;
  
  /**
   * Filesystem adapter for file operations
   */
  protected _fs!: FilesystemAdapter;
  
  /**
   * Database interface for data persistence
   */
  protected _db!: DatabaseInterface;
  
  /**
   * Class name used for identification
   */
  protected _className!: string;
  
  /**
   * Configuration options provided to the class
   */
  protected options: T;

  /**
   * Creates a new BaseClass instance
   * 
   * @param options - Configuration options for database, filesystem, and AI clients
   */
  constructor(options: T) {
    this.options = options;
    this._className = this.constructor.name;
  }

  /**
   * Initializes database, filesystem, and AI client connections
   * 
   * This method sets up all required services based on the provided options.
   * It should be called before using any of the service interfaces.
   * 
   * @returns Promise that resolves when initialization is complete
   */
  protected async initialize(): Promise<void> {
    if (this.options.db) {
      this._db = await getDatabase(this.options.db);
    }
    if (this.options.fs) {
      this._fs = await FilesystemAdapter.create(this.options.fs);
    }
    if (this.options.ai) {
      this._ai = await AIClient.create(this.options.ai);
    }
  }

  /**
   * Gets the filesystem adapter instance
   */
  get fs() {
    return this._fs;
  }

  /**
   * Gets the database interface instance
   */
  get db() {
    return this._db;
  }

  /**
   * Gets the AI client instance
   */
  get ai() {
    return this._ai;
  }
}
