import { BaseObject } from './object.js';
import type { BaseObjectOptions } from './object.js';

/**
 * Configuration options for Pleb objects
 *
 * @interface PlebOptions
 * @extends BaseObjectOptions
 */
export interface PlebOptions extends BaseObjectOptions {}

/**
 * Basic implementation class extending BaseObject
 *
 * Pleb provides a simple BaseObject implementation for quick prototyping
 * and testing without requiring custom field definitions.
 *
 * @class Pleb
 * @extends BaseObject
 * @example
 * ```typescript
 * const pleb = await Pleb.create({
 *   name: 'Test Object',
 *   db: { url: 'sqlite://test.db' }
 * });
 * ```
 */
export class Pleb<T extends PlebOptions = PlebOptions> extends BaseObject<T> {
  /**
   * Creates a new Pleb instance
   *
   * @param options - Configuration options for the Pleb object
   */
  constructor(options: T) {
    super(options);
    this._className = this.constructor.name;
  }

  /**
   * Creates and initializes a new Pleb instance
   *
   * @param options - Configuration options for the Pleb object
   * @returns Promise resolving to the initialized Pleb instance
   * @example
   * ```typescript
   * const pleb = await Pleb.create({
   *   name: 'Sample Object',
   *   db: { url: 'sqlite://data.db' }
   * });
   * ```
   */
  static async create(options: PlebOptions) {
    const pleb = new Pleb(options);
    await pleb.initialize();
    return pleb;
  }

  /**
   * Initializes the Pleb instance and sets up database connections
   *
   * @returns Promise that resolves when initialization is complete
   * @protected
   */
  protected async initialize(): Promise<void> {
    await super.initialize();
  }
}
