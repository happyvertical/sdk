import type { AIClientOptions } from '@have/ai';
import { AIClient } from '@have/ai';
import type { FilesystemAdapterOptions } from '@have/files';
import { FilesystemAdapter } from '@have/files';
import type { DatabaseInterface } from '@have/sql';
import { getDatabase } from '@have/sql';
import type { PersistenceConfig } from './persistence/types';
import type { ISignalAdapter } from '@have/types';
import type { LoggerConfig } from '@have/logger';
import { SignalBus } from './signals/bus.js';
import type {
  GlobalSignalConfig,
  MetricsConfig,
  PubSubConfig,
} from './config.js';
import { smrt } from './config.js';

/**
 * Configuration options for the SmrtClass
 */
export interface SmrtClassOptions {
  /**
   * Optional custom class name override
   */
  _className?: string;

  /**
   * Persistence configuration (new unified approach)
   * Use this to configure SQL, REST, or other persistence backends
   */
  persistence?: PersistenceConfig;

  /**
   * Database configuration options (legacy, for backward compatibility)
   * @deprecated Use `persistence: { type: 'sql', ... }` instead
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
   * AI client configuration options or instance
   */
  ai?: AIClientOptions | AIClient;

  /**
   * Logging configuration (overrides global default)
   */
  logging?: LoggerConfig;

  /**
   * Metrics configuration (overrides global default)
   */
  metrics?: MetricsConfig;

  /**
   * Pub/Sub configuration (overrides global default)
   */
  pubsub?: PubSubConfig;

  /**
   * Custom signal configuration (overrides global default)
   */
  signals?: {
    /** Shared signal bus instance */
    bus?: SignalBus;
    /** Additional custom adapters */
    adapters?: ISignalAdapter[];
  };
}

/**
 * Foundation class providing core functionality for the SMRT framework
 *
 * SmrtClass provides unified access to database, filesystem, and AI client
 * interfaces. It serves as the foundation for all other classes in the
 * SMRT framework.
 */
export class SmrtClass {
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
   * Signal bus for method execution tracking
   */
  protected _signalBus?: SignalBus;

  /**
   * Configuration options provided to the class
   */
  protected options: SmrtClassOptions;

  /**
   * Creates a new SmrtClass instance
   *
   * @param options - Configuration options for database, filesystem, and AI clients
   */
  constructor(options: SmrtClassOptions = {}) {
    this.options = options;
    this._className = this.constructor.name;
  }

  /**
   * Initializes database, filesystem, and AI client connections
   *
   * This method sets up all required services based on the provided options.
   * It should be called before using any of the service interfaces.
   *
   * @returns Promise that resolves to this instance for chaining
   */
  protected async initialize(): Promise<this> {
    if (this.options.db) {
      this._db = await getDatabase(this.options.db);
    }
    if (this.options.fs) {
      this._fs = await FilesystemAdapter.create(this.options.fs);
    }
    if (this.options.ai) {
      this._ai = await AIClient.create(this.options.ai);
    }
    await this.initializeSignals();
    return this;
  }

  /**
   * Initialize signal bus and adapters
   *
   * Merges global configuration with instance-specific overrides.
   * Registers built-in and custom adapters based on configuration.
   */
  private async initializeSignals(): Promise<void> {
    const globalConfig = smrt.getConfig();
    const effectiveConfig = this.mergeSignalConfig(globalConfig);

    // If a shared bus is provided, always use it (don't create new adapters)
    if (this.options.signals?.bus) {
      this._signalBus = this.options.signals.bus;
      return;
    }

    // Otherwise, check if we should initialize signals based on config
    if (!this.shouldInitializeSignals(effectiveConfig)) {
      return;
    }

    this._signalBus = new SignalBus();
    await this.registerAdapters(effectiveConfig);
  }

  /**
   * Merge global and instance signal configuration
   *
   * Instance configuration takes priority over global defaults.
   *
   * @param globalConfig - Global configuration from smrt.configure()
   * @returns Merged configuration
   */
  private mergeSignalConfig(
    globalConfig: GlobalSignalConfig,
  ): GlobalSignalConfig {
    return {
      logging: this.options.logging ?? globalConfig.logging,
      metrics: this.options.metrics ?? globalConfig.metrics,
      pubsub: this.options.pubsub ?? globalConfig.pubsub,
      signals: {
        bus: this.options.signals?.bus ?? globalConfig.signals?.bus,
        adapters: [
          ...(globalConfig.signals?.adapters ?? []),
          ...(this.options.signals?.adapters ?? []),
        ],
      },
    };
  }

  /**
   * Check if signals should be initialized
   *
   * Signals are initialized if any adapter is configured.
   *
   * @param config - Effective signal configuration
   * @returns True if signals should be initialized
   */
  private shouldInitializeSignals(config: GlobalSignalConfig): boolean {
    return !!(
      config.logging !== false ||
      config.metrics?.enabled ||
      config.pubsub?.enabled ||
      config.signals?.adapters?.length
    );
  }

  /**
   * Register signal adapters based on configuration
   *
   * @param config - Effective signal configuration
   */
  private async registerAdapters(config: GlobalSignalConfig): Promise<void> {
    if (!this._signalBus) return;

    // Logging adapter (default: enabled with console)
    if (config.logging !== false) {
      const { createLogger, LoggerAdapter } = await import('@have/logger');
      const logger = createLogger(config.logging ?? true);
      this._signalBus.register(new LoggerAdapter(logger));
    }

    // Metrics adapter (default: disabled)
    if (config.metrics?.enabled) {
      const { MetricsAdapter } = await import('./adapters/metrics.js');
      this._signalBus.register(new MetricsAdapter());
    }

    // Pub/Sub adapter (default: disabled)
    if (config.pubsub?.enabled) {
      const { PubSubAdapter } = await import('./adapters/pubsub.js');
      this._signalBus.register(new PubSubAdapter());
    }

    // Custom adapters
    if (config.signals?.adapters) {
      for (const adapter of config.signals.adapters) {
        this._signalBus.register(adapter);
      }
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

  /**
   * Gets the signal bus instance
   *
   * @returns Signal bus if signals are enabled, undefined otherwise
   */
  get signalBus(): SignalBus | undefined {
    return this._signalBus;
  }
}
