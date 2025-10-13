import { getDatabase, syncSchema, escapeSqlValue, buildWhere } from "@have/sql";
import { getAI } from "@have/ai";
import { FilesystemAdapter } from "@have/files";
import { makeId } from "@have/utils";
import { NetworkError, ValidationError, RuntimeError, ErrorUtils, DatabaseError } from "./errors-Cl0_Kxat.js";
import { Field } from "../fields.js";
import { t as tableNameFromClass, g as generateSchema, a as toSnakeCase, c as formatDataJs, f as fieldsFromClass, O as ObjectRegistry, d as formatDataSql } from "./registry-DirJKcgN.js";
const DEFAULT_REDACT_KEYS = [
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "apiKey",
  "api_key",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "privateKey",
  "private_key",
  "authToken",
  "auth_token",
  "bearerToken",
  "bearer_token",
  "sessionId",
  "session_id",
  "ssn",
  "creditCard",
  "credit_card",
  "cvv",
  "pin"
];
class SignalSanitizer {
  config;
  constructor(config2 = {}) {
    this.config = {
      redactKeys: config2.redactKeys ?? DEFAULT_REDACT_KEYS,
      replacer: config2.replacer ?? this.defaultReplacer.bind(this),
      redactedValue: config2.redactedValue ?? "[REDACTED]",
      maxStackLines: config2.maxStackLines ?? 10
    };
  }
  /**
   * Default replacer function
   *
   * Redacts sensitive keys and truncates long strings
   */
  defaultReplacer(key, value) {
    const lowerKey = key.toLowerCase();
    if (this.config.redactKeys.some((k) => lowerKey.includes(k.toLowerCase()))) {
      return this.config.redactedValue;
    }
    if (typeof value === "string" && value.length > 1e3) {
      return `${value.substring(0, 1e3)}... [TRUNCATED]`;
    }
    return value;
  }
  /**
   * Sanitize a value using the configured replacer
   */
  sanitizeValue(value, seen = /* @__PURE__ */ new WeakSet()) {
    if (value == null) {
      return value;
    }
    if (typeof value !== "object") {
      return value;
    }
    if (seen.has(value)) {
      return "[CIRCULAR]";
    }
    seen.add(value);
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item, seen));
    }
    if (value instanceof Error) {
      return {
        message: value.message,
        name: value.name,
        stack: value.stack ? value.stack.split("\n").slice(0, this.config.maxStackLines).join("\n") : void 0
      };
    }
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
      const replacedValue = this.config.replacer(key, val);
      if (replacedValue !== void 0) {
        sanitized[key] = this.sanitizeValue(replacedValue, seen);
      }
    }
    return sanitized;
  }
  /**
   * Sanitize a signal payload
   *
   * @param signal - Signal to sanitize
   * @returns Sanitized signal (new object, doesn't mutate original)
   */
  sanitize(signal) {
    return {
      id: signal.id,
      objectId: signal.objectId,
      className: signal.className,
      method: signal.method,
      type: signal.type,
      timestamp: signal.timestamp,
      ...signal.step && { step: signal.step },
      ...signal.duration !== void 0 && { duration: signal.duration },
      ...signal.args && { args: this.sanitizeValue(signal.args) },
      ...signal.result && { result: this.sanitizeValue(signal.result) },
      ...signal.error && { error: this.sanitizeValue(signal.error) },
      ...signal.metadata && { metadata: this.sanitizeValue(signal.metadata) }
    };
  }
}
class SignalBus {
  adapters = [];
  sanitizer;
  /**
   * Create a new SignalBus
   *
   * @param options - Configuration options
   */
  constructor(options) {
    if (options && options.sanitization !== false && options.sanitization) {
      this.sanitizer = new SignalSanitizer(options.sanitization);
    }
  }
  /**
   * Register a signal adapter
   *
   * @param adapter - Adapter to register
   */
  register(adapter) {
    this.adapters.push(adapter);
  }
  /**
   * Unregister a signal adapter
   *
   * Removes the adapter from the bus to prevent memory leaks.
   *
   * @param adapter - Adapter to unregister
   * @returns True if adapter was found and removed
   */
  unregister(adapter) {
    const index = this.adapters.indexOf(adapter);
    if (index !== -1) {
      this.adapters.splice(index, 1);
      return true;
    }
    return false;
  }
  /**
   * Clear all registered adapters
   *
   * Removes all adapters from the bus. Useful for cleanup or testing.
   */
  clear() {
    this.adapters = [];
  }
  /**
   * Emit a signal to all registered adapters
   *
   * Signals are sanitized (if configured) before being passed to adapters.
   * Adapters are called in fire-and-forget mode - errors are logged
   * but don't interrupt the main execution flow.
   *
   * @param signal - Signal to emit
   */
  async emit(signal) {
    const sanitizedSignal = this.sanitizer ? this.sanitizer.sanitize(signal) : signal;
    const promises = this.adapters.map(async (adapter, index) => {
      try {
        await adapter.handle(sanitizedSignal);
      } catch (error) {
        const adapterName = adapter.constructor.name !== "Object" ? adapter.constructor.name : `Adapter[${index}]`;
        console.error(`SignalBus: ${adapterName} failed to handle signal`, {
          signalId: signal.id,
          signalType: signal.type,
          className: signal.className,
          method: signal.method,
          adapterIndex: index,
          error: error instanceof Error ? {
            message: error.message,
            name: error.name,
            stack: error.stack
          } : error
        });
      }
    });
    void Promise.allSettled(promises);
  }
  /**
   * Generate unique execution ID for method invocations
   *
   * @returns Unique execution ID (CUID2)
   */
  generateExecutionId() {
    return makeId();
  }
  /**
   * Get count of registered adapters
   *
   * @returns Number of registered adapters
   */
  get adapterCount() {
    return this.adapters.length;
  }
}
class SmrtConfig {
  static instance;
  config = {
    logging: true
    // Default: console logging at info level
  };
  constructor() {
  }
  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!SmrtConfig.instance) {
      SmrtConfig.instance = new SmrtConfig();
    }
    return SmrtConfig.instance;
  }
  /**
   * Configure global defaults
   *
   * @param config - Configuration to apply
   */
  configure(config2) {
    this.config = { ...this.config, ...config2 };
  }
  /**
   * Get current configuration
   *
   * @returns Current global configuration
   */
  getConfig() {
    return { ...this.config };
  }
  /**
   * Reset to default configuration
   */
  reset() {
    this.config = { logging: true };
  }
}
function config(options) {
  SmrtConfig.getInstance().configure(options);
}
config.reset = () => {
  SmrtConfig.getInstance().reset();
};
config.toJSON = () => SmrtConfig.getInstance().getConfig();
config.toString = () => JSON.stringify(SmrtConfig.getInstance().getConfig(), null, 2);
const CREATE_SMRT_NOTES_TABLE = `
CREATE TABLE IF NOT EXISTS _smrt_notes (
  id TEXT PRIMARY KEY,
  owner_class TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  metadata TEXT,
  version INTEGER DEFAULT 1,
  confidence REAL DEFAULT 1.0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  expires_at DATETIME,
  UNIQUE(owner_class, owner_id, scope, key, version)
);

CREATE INDEX IF NOT EXISTS idx_smrt_notes_owner
  ON _smrt_notes(owner_class, owner_id);

CREATE INDEX IF NOT EXISTS idx_smrt_notes_scope
  ON _smrt_notes(scope);

CREATE INDEX IF NOT EXISTS idx_smrt_notes_confidence
  ON _smrt_notes(confidence);

CREATE INDEX IF NOT EXISTS idx_smrt_notes_last_used
  ON _smrt_notes(last_used_at);
`;
const CREATE_SMRT_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS _smrt_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  checksum TEXT
);
`;
const CREATE_SMRT_REGISTRY_TABLE = `
CREATE TABLE IF NOT EXISTS _smrt_registry (
  class_name TEXT PRIMARY KEY,
  schema_version TEXT,
  fields TEXT,
  relationships TEXT,
  config TEXT,
  manifest TEXT,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
const CREATE_SMRT_SIGNALS_TABLE = `
CREATE TABLE IF NOT EXISTS _smrt_signals (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  source_class TEXT,
  source_id TEXT,
  target_class TEXT,
  target_id TEXT,
  payload TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_smrt_signals_source
  ON _smrt_signals(source_class, source_id);

CREATE INDEX IF NOT EXISTS idx_smrt_signals_type
  ON _smrt_signals(type);

CREATE INDEX IF NOT EXISTS idx_smrt_signals_timestamp
  ON _smrt_signals(timestamp);
`;
const ALL_SYSTEM_TABLES = [
  CREATE_SMRT_NOTES_TABLE,
  CREATE_SMRT_MIGRATIONS_TABLE,
  CREATE_SMRT_REGISTRY_TABLE,
  CREATE_SMRT_SIGNALS_TABLE
];
const SMRT_SCHEMA_VERSION = "1.0.0";
class SmrtClass {
  /**
   * AI client instance for interacting with AI models
   */
  _ai;
  /**
   * Filesystem adapter for file operations
   */
  _fs;
  /**
   * Database interface for data persistence
   */
  _db;
  /**
   * Class name used for identification
   */
  _className;
  /**
   * Signal bus for method execution tracking
   */
  _signalBus;
  /**
   * Adapters registered by this instance (for cleanup)
   */
  _registeredAdapters = [];
  /**
   * Configuration options provided to the class
   */
  options;
  /**
   * Track which databases have had system tables initialized
   * Key is database connection identifier
   */
  static _systemTablesInitialized = /* @__PURE__ */ new Set();
  /**
   * Creates a new SmrtClass instance
   *
   * @param options - Configuration options for database, filesystem, and AI clients
   */
  constructor(options = {}) {
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
  async initialize() {
    if (this.options.db) {
      this._db = await getDatabase(this.options.db);
      await this.ensureSystemTables();
    }
    if (this.options.fs) {
      this._fs = await FilesystemAdapter.create(this.options.fs);
    }
    if (this.options.ai) {
      this._ai = await getAI(this.options.ai);
    }
    await this.initializeSignals();
    return this;
  }
  /**
   * Ensure SMRT system tables exist in the database
   *
   * System tables use _smrt_ prefix and store framework metadata:
   * - _smrt_notes: Self-learning pattern cache
   * - _smrt_migrations: Schema version tracking
   * - _smrt_registry: Object registry persistence
   * - _smrt_signals: Signal history/audit log
   *
   * This method is idempotent and safe to call multiple times.
   * Tables are only created once per database connection.
   */
  async ensureSystemTables() {
    if (!this._db) return;
    const dbKey = this.getDatabaseKey();
    if (SmrtClass._systemTablesInitialized.has(dbKey)) {
      return;
    }
    for (const createTableSQL of ALL_SYSTEM_TABLES) {
      await this._db.execute`${createTableSQL}`;
    }
    const version = SMRT_SCHEMA_VERSION;
    const description = "Initial SMRT system tables";
    await this._db.execute`
      INSERT OR IGNORE INTO _smrt_migrations (version, description)
      VALUES (${version}, ${description})
    `;
    SmrtClass._systemTablesInitialized.add(dbKey);
  }
  /**
   * Generate unique identifier for database connection
   * Used to track which databases have system tables initialized
   */
  getDatabaseKey() {
    const dbUrl = this.options.db?.url || "default";
    const dbType = this.options.db?.type || "sqlite";
    return `${dbType}:${dbUrl}`;
  }
  /**
   * Access system tables through standard database interface
   * System tables use _smrt_ prefix to avoid conflicts with user tables
   */
  get systemDb() {
    return this._db;
  }
  /**
   * Initialize signal bus and adapters
   *
   * Merges global configuration with instance-specific overrides.
   * Registers built-in and custom adapters based on configuration.
   */
  async initializeSignals() {
    const globalConfig = config.toJSON();
    const effectiveConfig = this.mergeSignalConfig(globalConfig);
    if (this.options.signals?.bus) {
      this._signalBus = this.options.signals.bus;
      return;
    }
    if (!this.shouldInitializeSignals(effectiveConfig)) {
      return;
    }
    this._signalBus = new SignalBus({
      sanitization: effectiveConfig.sanitization
    });
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
  mergeSignalConfig(globalConfig) {
    return {
      logging: this.options.logging ?? globalConfig.logging,
      metrics: this.options.metrics ?? globalConfig.metrics,
      pubsub: this.options.pubsub ?? globalConfig.pubsub,
      sanitization: this.options.sanitization ?? globalConfig.sanitization,
      signals: {
        bus: this.options.signals?.bus ?? globalConfig.signals?.bus,
        adapters: [
          ...globalConfig.signals?.adapters ?? [],
          ...this.options.signals?.adapters ?? []
        ]
      }
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
  shouldInitializeSignals(config2) {
    return !!(config2.logging !== false || config2.metrics?.enabled || config2.pubsub?.enabled || config2.signals?.adapters?.length);
  }
  /**
   * Register signal adapters based on configuration
   *
   * @param config - Effective signal configuration
   */
  async registerAdapters(config2) {
    if (!this._signalBus) return;
    if (config2.logging !== false) {
      const { createLogger, LoggerAdapter } = await import("@have/logger");
      const logger = createLogger(config2.logging ?? true);
      const adapter = new LoggerAdapter(logger);
      this._signalBus.register(adapter);
      this._registeredAdapters.push(adapter);
    }
    if (config2.metrics?.enabled) {
      const { MetricsAdapter } = await import("./metrics-JaU-tpt3.js");
      const adapter = new MetricsAdapter();
      this._signalBus.register(adapter);
      this._registeredAdapters.push(adapter);
    }
    if (config2.pubsub?.enabled) {
      const { PubSubAdapter } = await import("./pubsub-BJ1ZU6QU.js");
      const adapter = new PubSubAdapter();
      this._signalBus.register(adapter);
      this._registeredAdapters.push(adapter);
    }
    if (config2.signals?.adapters) {
      for (const adapter of config2.signals.adapters) {
        this._signalBus.register(adapter);
        this._registeredAdapters.push(adapter);
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
  get signalBus() {
    return this._signalBus;
  }
  /**
   * Cleanup method to prevent memory leaks
   *
   * Unregisters all adapters from the signal bus that were registered
   * by this instance. Call this when the SmrtClass instance is no longer
   * needed to prevent memory leaks.
   *
   * @example
   * ```typescript
   * const product = new Product({ name: 'Widget' });
   * await product.initialize();
   * // ... use product ...
   * product.destroy(); // Clean up when done
   * ```
   */
  destroy() {
    if (this._signalBus && !this.options.signals?.bus) {
      for (const adapter of this._registeredAdapters) {
        this._signalBus.unregister(adapter);
      }
      this._registeredAdapters = [];
    }
  }
}
class RestPersistenceAdapter {
  metadata = {
    type: "rest",
    supportsTransactions: false,
    supportsSchemaGeneration: false,
    supportsBatchOperations: false
  };
  config;
  objectClass;
  baseUrl;
  headers;
  timeout;
  initialized = false;
  constructor(config2, objectClass) {
    this.config = config2;
    this.objectClass = objectClass;
    this.baseUrl = config2.baseUrl.replace(/\/$/, "");
    this.timeout = config2.timeout || 3e4;
    this.headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...config2.headers
    };
    if (config2.auth) {
      if (config2.auth.type === "bearer") {
        this.headers["Authorization"] = `Bearer ${config2.auth.token}`;
      } else if (config2.auth.type === "basic") {
        const credentials = btoa(
          `${config2.auth.username}:${config2.auth.password}`
        );
        this.headers["Authorization"] = `Basic ${credentials}`;
      } else if (config2.auth.type === "header") {
        this.headers[config2.auth.name] = config2.auth.value;
      }
    }
  }
  async initialize() {
    if (this.initialized) {
      return;
    }
    try {
      const response = await this.request("OPTIONS", "");
      if (!response.ok && response.status !== 404) {
        throw NetworkError.serviceUnavailable(
          this.baseUrl,
          `Server returned ${response.status}`
        );
      }
      this.initialized = true;
    } catch (error) {
      this.initialized = true;
    }
  }
  async save(object) {
    try {
      if (!object.id) {
        object._id = crypto.randomUUID();
      }
      if (!object.slug) {
        if (!object.name) {
          throw ValidationError.requiredField("name", object.constructor.name);
        }
        const nameStr = String(object.name);
        object._slug = nameStr.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      }
      const isUpdate = !!object.id && await this.checkExists(object.id);
      let response;
      if (isUpdate) {
        const endpoint = this.config.endpoints?.update || `/${object.id}`;
        const method = this.config.usePatchForUpdates ? "PATCH" : "PUT";
        response = await this.request(
          method,
          endpoint,
          this.serializeObject(object)
        );
      } else {
        const endpoint = this.config.endpoints?.create || "/";
        response = await this.request(
          "POST",
          endpoint,
          this.serializeObject(object)
        );
      }
      if (!response.ok) {
        throw NetworkError.requestFailed(
          response.url,
          response.status,
          await response.text()
        );
      }
      return {
        inserted: !isUpdate,
        affected: 1
      };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NetworkError) {
        throw error;
      }
      throw RuntimeError.operationFailed(
        "save",
        `${object.constructor.name}#${object.id}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  async load(filter, objectClass) {
    try {
      let endpoint;
      if (typeof filter === "string") {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          filter
        );
        if (isUuid) {
          endpoint = this.config.endpoints?.get || `/${filter}`;
        } else {
          const params = new URLSearchParams({ slug: filter, context: "" });
          endpoint = `${this.config.endpoints?.list || "/"}?${params.toString()}`;
        }
      } else {
        if (filter.id) {
          endpoint = this.config.endpoints?.get || `/${filter.id}`;
        } else {
          const params = this.buildQueryString(filter);
          endpoint = `${this.config.endpoints?.list || "/"}?${params.toString()}`;
        }
      }
      const response = await this.request("GET", endpoint);
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw NetworkError.requestFailed(
          response.url,
          response.status,
          await response.text()
        );
      }
      const data = await response.json();
      const objectData = Array.isArray(data) ? data[0] : data;
      if (!objectData) {
        return null;
      }
      const instance = new objectClass({
        ...objectData,
        _skipLoad: true,
        _persistenceAdapter: this
      });
      await instance.initialize();
      return instance;
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw RuntimeError.operationFailed(
        "load",
        JSON.stringify(filter),
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  async list(options, objectClass) {
    try {
      const params = new URLSearchParams();
      if (options.where) {
        for (const [key, value] of Object.entries(options.where)) {
          const parts = key.trim().split(/\s+/);
          const field = parts[0];
          const operator = parts[1] || "eq";
          const paramKey = operator === "eq" ? field : `${field}[${this.mapOperator(operator)}]`;
          if (Array.isArray(value)) {
            params.set(paramKey, value.join(","));
          } else if (value !== null && value !== void 0) {
            params.set(paramKey, String(value));
          } else {
            params.set(paramKey, "null");
          }
        }
      }
      if (options.limit !== void 0) {
        params.set("limit", String(options.limit));
      }
      if (options.offset !== void 0) {
        params.set("offset", String(options.offset));
      }
      if (options.orderBy) {
        const orderByArray = Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy];
        params.set("orderBy", orderByArray.join(","));
      }
      const endpoint = `${this.config.endpoints?.list || "/"}?${params.toString()}`;
      const response = await this.request("GET", endpoint);
      if (!response.ok) {
        throw NetworkError.requestFailed(
          response.url,
          response.status,
          await response.text()
        );
      }
      const data = await response.json();
      const items = Array.isArray(data) ? data : data.items || [];
      const results = [];
      for (const item of items) {
        const instance = new objectClass({
          ...item,
          _skipLoad: true,
          _persistenceAdapter: this
        });
        await instance.initialize();
        results.push(instance);
      }
      return results;
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw RuntimeError.operationFailed(
        "list",
        JSON.stringify(options),
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  async delete(id) {
    try {
      const endpoint = this.config.endpoints?.delete || `/${id}`;
      const response = await this.request("DELETE", endpoint);
      if (!response.ok && response.status !== 404) {
        throw NetworkError.requestFailed(
          response.url,
          response.status,
          await response.text()
        );
      }
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw RuntimeError.operationFailed(
        "delete",
        id,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  async count(options) {
    try {
      const params = new URLSearchParams();
      if (options.where) {
        for (const [key, value] of Object.entries(options.where)) {
          const parts = key.trim().split(/\s+/);
          const field = parts[0];
          const operator = parts[1] || "eq";
          const paramKey = operator === "eq" ? field : `${field}[${this.mapOperator(operator)}]`;
          if (Array.isArray(value)) {
            params.set(paramKey, value.join(","));
          } else if (value !== null && value !== void 0) {
            params.set(paramKey, String(value));
          } else {
            params.set(paramKey, "null");
          }
        }
      }
      const endpoint = `${this.config.endpoints?.count || "/count"}?${params.toString()}`;
      const response = await this.request("GET", endpoint);
      if (!response.ok) {
        throw NetworkError.requestFailed(
          response.url,
          response.status,
          await response.text()
        );
      }
      const data = await response.json();
      if (typeof data === "number") {
        return data;
      }
      if (data.count !== void 0) {
        return data.count;
      }
      if (data.total !== void 0) {
        return data.total;
      }
      throw new Error("Invalid count response format");
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      throw RuntimeError.operationFailed(
        "count",
        JSON.stringify(options),
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  async bulkSave(objects) {
    for (const obj of objects) {
      await this.save(obj);
    }
  }
  async close() {
  }
  // ===== Private Helper Methods =====
  /**
   * Make HTTP request with retry logic
   */
  async request(method, endpoint, body) {
    const url = `${this.baseUrl}${endpoint}`;
    const retryPolicy = this.config.retryPolicy || {};
    const maxRetries = retryPolicy.maxRetries || 3;
    const initialDelay = retryPolicy.initialDelay || 1e3;
    const backoff = retryPolicy.backoff || "exponential";
    return await ErrorUtils.withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        try {
          const response = await fetch(url, {
            method,
            headers: this.headers,
            body: body ? JSON.stringify(body) : void 0,
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          return response;
        } catch (error) {
          clearTimeout(timeoutId);
          if (error instanceof Error && error.name === "AbortError") {
            throw NetworkError.timeout(url, this.timeout);
          }
          throw error;
        }
      },
      maxRetries,
      initialDelay,
      backoff === "exponential" ? 2 : 1
    );
  }
  /**
   * Check if object exists by ID
   */
  async checkExists(id) {
    try {
      const endpoint = this.config.endpoints?.get || `/${id}`;
      const response = await this.request("GET", endpoint);
      return response.ok;
    } catch {
      return false;
    }
  }
  /**
   * Serialize object for transmission
   */
  serializeObject(object) {
    const fields = object.getFields();
    const data = {
      id: object.id,
      slug: object.slug,
      context: object.context,
      name: object.name,
      created_at: object.created_at,
      updated_at: object.updated_at
    };
    for (const [key, field] of Object.entries(fields)) {
      data[key] = field.value;
    }
    return data;
  }
  /**
   * Build query string from filter object
   */
  buildQueryString(filter) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filter)) {
      if (value !== null && value !== void 0) {
        if (Array.isArray(value)) {
          params.set(key, value.join(","));
        } else {
          params.set(key, String(value));
        }
      }
    }
    return params;
  }
  /**
   * Map SQL-style operators to REST query param conventions
   */
  mapOperator(operator) {
    const operatorMap = {
      ">": "gt",
      ">=": "gte",
      "<": "lt",
      "<=": "lte",
      "!=": "ne",
      "<>": "ne",
      in: "in",
      like: "like"
    };
    return operatorMap[operator] || operator;
  }
}
class SqlPersistenceAdapter {
  metadata = {
    type: "sql",
    supportsTransactions: true,
    supportsSchemaGeneration: true,
    supportsBatchOperations: true
  };
  db;
  config;
  objectClass;
  tableName;
  initialized = false;
  constructor(config2, objectClass) {
    this.config = config2;
    this.objectClass = objectClass;
    this.tableName = tableNameFromClass(objectClass);
  }
  async initialize() {
    if (this.initialized) {
      return;
    }
    const { type: _persistenceType, dbType, ...dbConfig } = this.config;
    const databaseConfig = {
      type: dbType,
      ...dbConfig
    };
    this.db = await getDatabase(databaseConfig);
    const schema = generateSchema(this.objectClass);
    console.log(
      `[SQL Adapter] Generated schema for ${this.tableName}:`,
      schema
    );
    await syncSchema({ db: this.db, schema });
    await this.db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_${this.tableName}_slug_context
      ON ${this.tableName}(slug, context);
    `);
    this.initialized = true;
  }
  async save(object) {
    try {
      await this.validateBeforeSave(object);
      if (!object.id) {
        object._id = crypto.randomUUID();
      }
      if (!object.slug) {
        object._slug = await this.generateSlug(object);
      }
      object.updated_at = /* @__PURE__ */ new Date();
      if (!object.created_at) {
        object.created_at = /* @__PURE__ */ new Date();
      }
      const existing = await this.getSavedId(object);
      const isInsert = !existing;
      const sql = this.generateUpsertStatement(object);
      await ErrorUtils.withRetry(
        async () => {
          try {
            await this.db.query(sql);
          } catch (error) {
            if (error instanceof Error) {
              if (error.message.includes("UNIQUE constraint failed")) {
                const field = this.extractConstraintField(error.message);
                throw ValidationError.uniqueConstraint(
                  field,
                  object[field]
                );
              }
              if (error.message.includes("NOT NULL constraint failed")) {
                const field = this.extractConstraintField(error.message);
                throw ValidationError.requiredField(
                  field,
                  object.constructor.name
                );
              }
              throw DatabaseError.queryFailed(sql, error);
            }
            throw error;
          }
        },
        3,
        500
      );
      return {
        inserted: isInsert,
        affected: 1
      };
    } catch (error) {
      if (error instanceof ValidationError || error instanceof DatabaseError) {
        throw error;
      }
      throw RuntimeError.operationFailed(
        "save",
        `${object.constructor.name}#${object.id}`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  async load(filter, objectClass) {
    try {
      const tableName = tableNameFromClass(objectClass);
      let whereClause;
      let whereValues;
      if (typeof filter === "string") {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          filter
        );
        if (isUuid) {
          whereClause = "WHERE id = ?";
          whereValues = [filter];
        } else {
          whereClause = "WHERE slug = ? AND context = ?";
          whereValues = [filter, ""];
        }
      } else {
        const conditions = [];
        whereValues = [];
        for (const [key, value] of Object.entries(filter)) {
          const columnName = toSnakeCase(key);
          conditions.push(`${columnName} = ?`);
          whereValues.push(value);
        }
        whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      }
      const sql = `SELECT * FROM ${tableName} ${whereClause} LIMIT 1`;
      const { rows } = await this.db.query(sql, whereValues);
      if (!rows || rows.length === 0) {
        return null;
      }
      const data = formatDataJs(rows[0]);
      const instance = new objectClass({
        ...data,
        _skipLoad: true,
        _persistenceAdapter: this
      });
      await instance.initialize();
      return instance;
    } catch (error) {
      if (error instanceof ValidationError || error instanceof DatabaseError) {
        throw error;
      }
      throw RuntimeError.operationFailed(
        "load",
        JSON.stringify(filter),
        error instanceof Error ? error : new Error(String(error))
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
  buildSelectClause(include, objectClass) {
    const fields = fieldsFromClass(objectClass);
    const mainColumns = Object.keys(fields).map((field) => {
      const columnName = toSnakeCase(field);
      return `t0.${columnName} as t0_${columnName}`;
    }).join(", ");
    if (include.length === 0) {
      return `t0.*`;
    }
    const relationships = ObjectRegistry.getRelationships(objectClass.name);
    const relationshipClauses = [mainColumns];
    for (let i = 0; i < include.length; i++) {
      const fieldName = include[i];
      const relationship = relationships.find((r) => r.fieldName === fieldName);
      if (!relationship || relationship.type !== "foreignKey") {
        continue;
      }
      const targetClassInfo = ObjectRegistry.getClass(relationship.targetClass);
      if (!targetClassInfo) continue;
      const targetFields = targetClassInfo.fields;
      const targetColumns = Array.from(targetFields.keys()).map((field) => {
        const columnName = toSnakeCase(field);
        return `t${i + 1}.${columnName} as t${i + 1}_${columnName}`;
      }).join(", ");
      relationshipClauses.push(targetColumns);
    }
    return relationshipClauses.join(", ");
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
  buildJoinClause(include, objectClass) {
    if (include.length === 0) return "";
    const relationships = ObjectRegistry.getRelationships(objectClass.name);
    const joinClauses = [];
    for (let i = 0; i < include.length; i++) {
      const fieldName = include[i];
      const relationship = relationships.find((r) => r.fieldName === fieldName);
      if (!relationship || relationship.type !== "foreignKey") {
        continue;
      }
      const targetClassInfo = ObjectRegistry.getClass(relationship.targetClass);
      if (!targetClassInfo) continue;
      const targetTableName = targetClassInfo.schema?.tableName;
      if (!targetTableName) continue;
      const columnName = toSnakeCase(fieldName);
      joinClauses.push(
        `LEFT JOIN ${targetTableName} t${i + 1} ON t0.${columnName} = t${i + 1}.id`
      );
    }
    return joinClauses.join(" ");
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
  async hydrateResultSet(rows, include, objectClass) {
    const instances = [];
    const relationships = ObjectRegistry.getRelationships(objectClass.name);
    for (const row of rows) {
      const mainData = {};
      const relationshipData = /* @__PURE__ */ new Map();
      for (const [key, value] of Object.entries(row)) {
        const columnName = key;
        if (columnName.startsWith("t0_")) {
          const snakeFieldName = columnName.substring(3);
          mainData[snakeFieldName] = value;
        } else {
          const match = columnName.match(/^t(\d+)_(.+)$/);
          if (match) {
            const tableIndex = Number.parseInt(match[1], 10);
            const snakeFieldName = match[2];
            if (tableIndex > 0 && tableIndex <= include.length) {
              const relationshipFieldName = include[tableIndex - 1];
              if (!relationshipData.has(relationshipFieldName)) {
                relationshipData.set(relationshipFieldName, {});
              }
              relationshipData.get(relationshipFieldName)[snakeFieldName] = value;
            }
          }
        }
      }
      const instance = new objectClass({
        ...formatDataJs(mainData),
        _skipLoad: true,
        _persistenceAdapter: this
      });
      await instance.initialize();
      for (const [relationshipFieldName, relatedData] of relationshipData) {
        const relationship = relationships.find(
          (r) => r.fieldName === relationshipFieldName
        );
        if (!relationship || relationship.type !== "foreignKey") continue;
        if (relatedData.id) {
          const targetClassInfo = ObjectRegistry.getClass(
            relationship.targetClass
          );
          if (!targetClassInfo) continue;
          const relatedInstance = new targetClassInfo.constructor({
            ...formatDataJs(relatedData),
            _skipLoad: true,
            _persistenceAdapter: this
          });
          await relatedInstance.initialize();
          instance._loadedRelationships.set(
            relationshipFieldName,
            relatedInstance
          );
        } else {
          instance._loadedRelationships.set(
            relationshipFieldName,
            null
          );
        }
      }
      instances.push(instance);
    }
    return instances;
  }
  async list(options, objectClass) {
    try {
      const tableName = tableNameFromClass(objectClass);
      const { where, offset, limit, orderBy, include } = options;
      if (include && include.length > 0) {
        const selectClause = this.buildSelectClause(include, objectClass);
        const joinClause = this.buildJoinClause(include, objectClass);
        let whereClause2 = "";
        const whereValues2 = [];
        if (where && Object.keys(where).length > 0) {
          const conditions = [];
          for (const [key, value] of Object.entries(where)) {
            const parts = key.trim().split(/\s+/);
            const field = parts[0];
            const operator = parts[1] || "=";
            const columnName = toSnakeCase(field);
            if (operator === "in" && Array.isArray(value)) {
              const placeholders = value.map(() => "?").join(", ");
              conditions.push(`t0.${columnName} IN (${placeholders})`);
              whereValues2.push(...value);
            } else if (operator === "like") {
              conditions.push(`t0.${columnName} LIKE ?`);
              whereValues2.push(value);
            } else if (value === null) {
              if (operator === "!=" || operator === "<>") {
                conditions.push(`t0.${columnName} IS NOT NULL`);
              } else {
                conditions.push(`t0.${columnName} IS NULL`);
              }
            } else {
              conditions.push(`t0.${columnName} ${operator} ?`);
              whereValues2.push(value);
            }
          }
          whereClause2 = `WHERE ${conditions.join(" AND ")}`;
        }
        let orderByClause2 = "";
        if (orderBy) {
          orderByClause2 = " ORDER BY ";
          const orderByItems = Array.isArray(orderBy) ? orderBy : [orderBy];
          orderByClause2 += orderByItems.map((item) => {
            const [field, direction = "ASC"] = item.split(" ");
            if (!/^[a-zA-Z0-9_]+$/.test(field)) {
              throw new Error(`Invalid field name for ordering: ${field}`);
            }
            const normalizedDirection = direction.toUpperCase();
            if (normalizedDirection !== "ASC" && normalizedDirection !== "DESC") {
              throw new Error(
                `Invalid sort direction: ${direction}. Must be ASC or DESC.`
              );
            }
            const columnName = toSnakeCase(field);
            return `t0.${columnName} ${normalizedDirection}`;
          }).join(", ");
        }
        let limitOffsetClause2 = "";
        const limitOffsetValues2 = [];
        if (limit !== void 0) {
          limitOffsetClause2 += " LIMIT ?";
          limitOffsetValues2.push(limit);
        }
        if (offset !== void 0) {
          limitOffsetClause2 += " OFFSET ?";
          limitOffsetValues2.push(offset);
        }
        const sql2 = `SELECT ${selectClause} FROM ${tableName} t0 ${joinClause} ${whereClause2}${orderByClause2}${limitOffsetClause2}`;
        const { rows: rows2 } = await this.db.query(sql2, [
          ...whereValues2,
          ...limitOffsetValues2
        ]);
        return await this.hydrateResultSet(rows2, include, objectClass);
      }
      let whereClause = "";
      const whereValues = [];
      if (where && Object.keys(where).length > 0) {
        const conditions = [];
        for (const [key, value] of Object.entries(where)) {
          const parts = key.trim().split(/\s+/);
          const field = parts[0];
          const operator = parts[1] || "=";
          const columnName = toSnakeCase(field);
          if (operator === "in" && Array.isArray(value)) {
            const placeholders = value.map(() => "?").join(", ");
            conditions.push(`${columnName} IN (${placeholders})`);
            whereValues.push(...value);
          } else if (operator === "like") {
            conditions.push(`${columnName} LIKE ?`);
            whereValues.push(value);
          } else if (value === null) {
            if (operator === "!=" || operator === "<>") {
              conditions.push(`${columnName} IS NOT NULL`);
            } else {
              conditions.push(`${columnName} IS NULL`);
            }
          } else {
            conditions.push(`${columnName} ${operator} ?`);
            whereValues.push(value);
          }
        }
        whereClause = `WHERE ${conditions.join(" AND ")}`;
      }
      let orderByClause = "";
      if (orderBy) {
        orderByClause = " ORDER BY ";
        const orderByItems = Array.isArray(orderBy) ? orderBy : [orderBy];
        orderByClause += orderByItems.map((item) => {
          const [field, direction = "ASC"] = item.split(" ");
          if (!/^[a-zA-Z0-9_]+$/.test(field)) {
            throw new Error(`Invalid field name for ordering: ${field}`);
          }
          const normalizedDirection = direction.toUpperCase();
          if (normalizedDirection !== "ASC" && normalizedDirection !== "DESC") {
            throw new Error(
              `Invalid sort direction: ${direction}. Must be ASC or DESC.`
            );
          }
          const columnName = toSnakeCase(field);
          return `${columnName} ${normalizedDirection}`;
        }).join(", ");
      }
      let limitOffsetClause = "";
      const limitOffsetValues = [];
      if (limit !== void 0) {
        limitOffsetClause += " LIMIT ?";
        limitOffsetValues.push(limit);
      }
      if (offset !== void 0) {
        limitOffsetClause += " OFFSET ?";
        limitOffsetValues.push(offset);
      }
      const sql = `SELECT * FROM ${tableName} ${whereClause}${orderByClause}${limitOffsetClause}`;
      const { rows } = await this.db.query(sql, [
        ...whereValues,
        ...limitOffsetValues
      ]);
      const results = [];
      for (const row of rows) {
        const data = formatDataJs(row);
        const instance = new objectClass({
          ...data,
          _skipLoad: true,
          _persistenceAdapter: this
        });
        await instance.initialize();
        results.push(instance);
      }
      return results;
    } catch (error) {
      throw RuntimeError.operationFailed(
        "list",
        JSON.stringify(options),
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  async delete(id) {
    try {
      await this.db.query(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
    } catch (error) {
      throw DatabaseError.queryFailed(
        `DELETE FROM ${this.tableName} WHERE id = ?`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  async count(options) {
    try {
      const { where } = options;
      let whereClause = "";
      const whereValues = [];
      if (where && Object.keys(where).length > 0) {
        const conditions = [];
        for (const [key, value] of Object.entries(where)) {
          const parts = key.trim().split(/\s+/);
          const field = parts[0];
          const operator = parts[1] || "=";
          const columnName = toSnakeCase(field);
          if (operator === "in" && Array.isArray(value)) {
            const placeholders = value.map(() => "?").join(", ");
            conditions.push(`${columnName} IN (${placeholders})`);
            whereValues.push(...value);
          } else if (operator === "like") {
            conditions.push(`${columnName} LIKE ?`);
            whereValues.push(value);
          } else if (value === null) {
            if (operator === "!=" || operator === "<>") {
              conditions.push(`${columnName} IS NOT NULL`);
            } else {
              conditions.push(`${columnName} IS NULL`);
            }
          } else {
            conditions.push(`${columnName} ${operator} ?`);
            whereValues.push(value);
          }
        }
        whereClause = `WHERE ${conditions.join(" AND ")}`;
      }
      const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
      const { rows } = await this.db.query(sql, whereValues);
      return Number.parseInt(rows[0].count, 10);
    } catch (error) {
      throw RuntimeError.operationFailed(
        "count",
        JSON.stringify(options),
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  async bulkSave(objects) {
    try {
      if (this.db.transaction) {
        await this.db.transaction(async (tx) => {
          for (const obj of objects) {
            const sql = this.generateUpsertStatement(obj);
            await tx.query(sql);
          }
        });
      } else {
        for (const obj of objects) {
          await this.save(obj);
        }
      }
    } catch (error) {
      throw RuntimeError.operationFailed(
        "bulkSave",
        `${objects.length} objects`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
  async close() {
  }
  // ===== Private Helper Methods =====
  /**
   * Validates object state before saving
   */
  async validateBeforeSave(object) {
    const fields = fieldsFromClass(object.constructor);
    for (const [fieldName, field] of Object.entries(fields)) {
      if (field instanceof Field && field.options.required) {
        const value = object[fieldName];
        if (value === null || value === void 0 || value === "") {
          throw ValidationError.requiredField(
            fieldName,
            object.constructor.name
          );
        }
      }
    }
  }
  /**
   * Generates slug from object name, or falls back to ID if name is not provided
   *
   * When using ID (UUID), hyphens are stripped to create a slug that:
   * - Doesn't match UUID regex patterns (no hyphens)
   * - Is reversible (add hyphens back at positions 8, 12, 16, 20 for UUID)
   */
  async generateSlug(object) {
    const source = object.name || object.id;
    if (!source) {
      throw ValidationError.requiredField("name or id", object.constructor.name);
    }
    const sourceStr = String(source);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceStr);
    if (isUuid) {
      return sourceStr.replace(/-/g, "");
    }
    return sourceStr.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }
  /**
   * Gets the ID of object if it exists in database
   */
  async getSavedId(object) {
    const { rows } = await this.db.query(
      `SELECT id FROM ${this.tableName} WHERE id = ? OR (slug = ? AND context = ?) LIMIT 1`,
      [object.id, object.slug, object.context || ""]
    );
    return rows.length > 0 ? rows[0].id : null;
  }
  /**
   * Generates UPSERT SQL statement for object
   * Converts camelCase property names to snake_case column names
   */
  generateUpsertStatement(object) {
    const fields = fieldsFromClass(object.constructor);
    const columns = ["id", "slug", "context"];
    const id = escapeSqlValue(object.id) || "";
    const slug = escapeSqlValue(object.slug);
    const context = escapeSqlValue(object.context || "");
    const values = [id, slug, context];
    const updates = [`slug = ${slug}`, `context = ${context}`];
    for (const [key, _field] of Object.entries(fields)) {
      if (key === "slug" || key === "context") continue;
      const columnName = toSnakeCase(key);
      columns.push(columnName);
      const actualValue = object[key];
      const value = typeof actualValue === "boolean" ? actualValue ? 1 : 0 : actualValue;
      const escapedValue = escapeSqlValue(value);
      values.push(escapedValue);
      updates.push(`${columnName} = ${escapedValue}`);
    }
    const sql = `
      INSERT INTO ${this.tableName} (${columns.join(", ")})
      VALUES (${values.join(", ")})
      ON CONFLICT(slug, context)
      WHERE slug = ${slug} AND context = ${context}
      DO UPDATE SET
        ${updates.join(",\n        ")}
      WHERE ${this.tableName}.slug = ${slug} AND ${this.tableName}.context = ${context};
    `;
    return sql;
  }
  /**
   * Extracts field name from database constraint error messages
   */
  extractConstraintField(errorMessage) {
    const patterns = [
      /UNIQUE constraint failed: \w+\.(\w+)/,
      /NOT NULL constraint failed: \w+\.(\w+)/,
      /constraint failed: (\w+)/i
    ];
    for (const pattern of patterns) {
      const match = errorMessage.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }
    return "unknown_field";
  }
}
async function createPersistenceAdapter(config2, objectClass) {
  let adapter;
  switch (config2.type) {
    case "sql":
      adapter = new SqlPersistenceAdapter(config2, objectClass);
      break;
    case "rest":
      adapter = new RestPersistenceAdapter(config2, objectClass);
      break;
    default:
      throw new Error(
        `Invalid persistence type: ${config2.type}. Must be 'sql' or 'rest'.`
      );
  }
  await adapter.initialize();
  return adapter;
}
class SmrtCollection extends SmrtClass {
  /**
   * Promise tracking the database setup operation
   */
  _db_setup_promise = null;
  /**
   * Persistence adapter for storage operations
   */
  _persistenceAdapter;
  /**
   * Gets the class constructor for items in this collection
   */
  get _itemClass() {
    const ctor = this.constructor;
    if (!ctor._itemClass) {
      const className = this.constructor.name;
      const errorMessage = [
        `Collection "${className}" must define a static _itemClass property.`,
        "",
        "Example:",
        `  class ${className} extends SmrtCollection<YourItemClass> {`,
        "    static readonly _itemClass = YourItemClass;",
        "  }",
        "",
        "Make sure your item class is imported and defined before the collection class."
      ].join("\n");
      throw new Error(errorMessage);
    }
    return ctor._itemClass;
  }
  /**
   * Static reference to the item class constructor
   */
  static _itemClass;
  /**
   * Validates that the collection is properly configured
   * Call this during development to catch configuration issues early
   */
  static validate() {
    if (!SmrtCollection._itemClass) {
      const className = SmrtCollection.name;
      const errorMessage = [
        `Collection "${className}" is missing required static _itemClass property.`,
        "",
        "Fix by adding:",
        `  class ${className} extends SmrtCollection<YourItemClass> {`,
        "    static readonly _itemClass = YourItemClass;",
        "  }"
      ].join("\n");
      throw new Error(errorMessage);
    }
    if (typeof SmrtCollection._itemClass !== "function") {
      throw new Error(
        `Collection "${SmrtCollection.name}"._itemClass must be a constructor function`
      );
    }
    const hasCreateMethod = typeof SmrtCollection._itemClass.create === "function" || typeof SmrtCollection._itemClass.prototype?.create === "function";
    if (!hasCreateMethod) {
      console.warn(
        `Collection "${SmrtCollection.name}"._itemClass should have a create() method for optimal functionality`
      );
    }
  }
  /**
   * Database table name for this collection
   */
  _tableName;
  /**
   * Creates a new SmrtCollection instance
   *
   * @deprecated Use the static create() factory method instead
   * @param options - Configuration options
   */
  constructor(options = {}) {
    super(options);
    if (this.constructor !== SmrtCollection && this.constructor._itemClass) {
      const itemClassName = this.constructor._itemClass.name;
      ObjectRegistry.registerCollection(itemClassName, this.constructor);
    }
  }
  /**
   * Static factory method for creating fully initialized collection instances
   *
   * This is the recommended way to create collections. It accepts broad option types
   * (SmrtClassOptions) and handles option extraction internally, then returns a
   * fully initialized, ready-to-use collection instance.
   *
   * TypeScript Note: Uses InstanceType<T> to preserve subclass types through the
   * static factory method, ensuring custom collection methods are properly typed.
   *
   * @param options - Configuration options (accepts both SmrtClassOptions and SmrtCollectionOptions)
   * @returns Promise resolving to a fully initialized collection instance
   *
   * @example
   * ```typescript
   * // Create collection from object options
   * const collection = await ProductCollection.create(smrtObject.options);
   *
   * // Create collection with specific config
   * const collection = await ProductCollection.create({
   *   persistence: { type: 'sql', url: 'products.db' },
   *   ai: { provider: 'openai', apiKey: process.env.OPENAI_API_KEY }
   * });
   * ```
   */
  static async create(options = {}) {
    const {
      _className,
      persistence,
      db,
      ai,
      fs,
      logging,
      metrics,
      pubsub,
      sanitization,
      signals
    } = options;
    const collectionOptions = {
      _className,
      persistence,
      db,
      ai,
      fs,
      logging,
      metrics,
      pubsub,
      sanitization,
      signals
    };
    const instance = new this(collectionOptions);
    await instance.initialize();
    return instance;
  }
  /**
   * Initializes the collection, setting up database tables
   *
   * @returns Promise that resolves to this instance for chaining
   */
  async initialize() {
    await super.initialize();
    if (this.options.persistence) {
      this._persistenceAdapter = await createPersistenceAdapter(
        this.options.persistence,
        this._itemClass
      );
    } else if (this.options.db) {
      const { type: dbType, ...dbConfig } = this.options.db;
      this._persistenceAdapter = await createPersistenceAdapter(
        {
          type: "sql",
          dbType,
          ...dbConfig
        },
        this._itemClass
      );
    }
    if (this.options.db && !this._persistenceAdapter) {
      await this.setupDb();
    }
    return this;
  }
  /**
   * Retrieves a single object from the collection by ID, slug, or custom filter
   *
   * @param filter - String ID/slug or object with filter conditions
   * @returns Promise resolving to the object or null if not found
   */
  async get(filter) {
    if (this._persistenceAdapter) {
      return await this._persistenceAdapter.load(filter, this._itemClass);
    }
    const where = typeof filter === "string" ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      filter
    ) ? { id: filter } : { slug: filter, context: "" } : filter;
    const { sql: whereSql, values: whereValues } = buildWhere(where);
    const { rows } = await this.db.query(
      `SELECT * FROM ${this.tableName} ${whereSql}`,
      whereValues
    );
    if (!rows?.[0]) {
      return null;
    }
    return this.create(formatDataJs(rows[0]));
  }
  /**
   * Lists records from the collection with flexible filtering options
   *
   * @param options - Query options object
   * @param options.where - Record of conditions to filter results. Each key can include an operator
   *                      separated by a space (e.g., 'price >', 'name like'). Default operator is '='.
   * @param options.offset - Number of records to skip
   * @param options.limit - Maximum number of records to return
   * @param options.orderBy - Field(s) to order results by, with optional direction
   *
   * @example
   * ```typescript
   * // Find active products priced between $100-$200
   * await collection.list({
   *   where: {
   *     'price >': 100,
   *     'price <=': 200,
   *     'status': 'active',              // equals operator is default
   *     'category in': ['A', 'B', 'C'],  // IN operator for arrays
   *     'name like': '%shirt%',          // LIKE for pattern matching
   *     'deleted_at !=': null            // exclude deleted items
   *   },
   *   limit: 10,
   *   offset: 0
   * });
   *
   * // Find users matching pattern but not in specific roles
   * await users.list({
   *   where: {
   *     'email like': '%@company.com',
   *     'active': true,
   *     'role in': ['guest', 'blocked'],
   *     'last_login <': lastMonth
   *   }
   * });
   * ```
   *
   * @returns Promise resolving to an array of model instances
   */
  async list(options) {
    if (this._persistenceAdapter) {
      const results = await this._persistenceAdapter.list(
        options,
        this._itemClass
      );
      if (this._persistenceAdapter.metadata.type !== "sql" && options.include && options.include.length > 0) {
        await this.eagerLoadRelationships(results, options.include);
      }
      return results;
    }
    const { where, offset, limit, orderBy } = options;
    const { sql: whereSql, values: whereValues } = buildWhere(where || {});
    let orderBySql = "";
    if (orderBy) {
      orderBySql = " ORDER BY ";
      const orderByItems = Array.isArray(orderBy) ? orderBy : [orderBy];
      orderBySql += orderByItems.map((item) => {
        const [field, direction = "ASC"] = item.split(" ");
        if (!/^[a-zA-Z0-9_]+$/.test(field)) {
          throw new Error(`Invalid field name for ordering: ${field}`);
        }
        const normalizedDirection = direction.toUpperCase();
        if (normalizedDirection !== "ASC" && normalizedDirection !== "DESC") {
          throw new Error(
            `Invalid sort direction: ${direction}. Must be ASC or DESC.`
          );
        }
        return `${field} ${normalizedDirection}`;
      }).join(", ");
    }
    let limitOffsetSql = "";
    const limitOffsetValues = [];
    if (limit !== void 0) {
      limitOffsetSql += " LIMIT ?";
      limitOffsetValues.push(limit);
    }
    if (offset !== void 0) {
      limitOffsetSql += " OFFSET ?";
      limitOffsetValues.push(offset);
    }
    const result = await this.db.query(
      `SELECT * FROM ${this.tableName} ${whereSql} ${orderBySql} ${limitOffsetSql}`,
      [...whereValues, ...limitOffsetValues]
    );
    const instances = await Promise.all(
      result.rows.map((item) => this.create(formatDataJs(item)))
    );
    if (options.include && options.include.length > 0) {
      await this.eagerLoadRelationships(instances, options.include);
    }
    return instances;
  }
  /**
   * Eagerly load relationships for a collection of instances
   *
   * Optimizes loading by batching queries for foreignKey relationships to avoid N+1 queries.
   *
   * @param instances - Array of object instances to load relationships for
   * @param relationships - Array of relationship field names to load
   * @private
   */
  async eagerLoadRelationships(instances, relationships) {
    if (instances.length === 0) return;
    for (const fieldName of relationships) {
      const relationshipMeta = ObjectRegistry.getRelationships(
        this._itemClass.name
      );
      const relationship = relationshipMeta.find(
        (r) => r.fieldName === fieldName
      );
      if (!relationship) {
        console.warn(
          `Relationship ${fieldName} not found on ${this._itemClass.name}, skipping eager load`
        );
        continue;
      }
      if (relationship.type === "foreignKey") {
        await this.batchLoadForeignKeys(instances, fieldName, relationship);
      } else if (relationship.type === "oneToMany") {
        await this.batchLoadOneToMany(instances, fieldName, relationship);
      } else if (relationship.type === "manyToMany") {
        console.warn(
          `manyToMany eager loading not yet implemented for ${fieldName}`
        );
      }
    }
  }
  /**
   * Batch load foreignKey relationships to avoid N+1 queries
   *
   * @param instances - Instances to load relationships for
   * @param fieldName - Name of the foreignKey field
   * @param relationship - Relationship metadata
   * @private
   */
  async batchLoadForeignKeys(instances, fieldName, relationship) {
    const foreignKeyValues = /* @__PURE__ */ new Set();
    for (const instance of instances) {
      const value = instance[fieldName];
      if (value && typeof value === "string") {
        foreignKeyValues.add(value);
      }
    }
    if (foreignKeyValues.size === 0) return;
    let targetCollection;
    try {
      targetCollection = await ObjectRegistry.getCollection(
        relationship.targetClass,
        this.options
      );
    } catch (error) {
      console.warn(
        `Could not get collection for ${relationship.targetClass}:`,
        error
      );
      return;
    }
    const relatedObjects = await targetCollection.list({
      where: { "id in": Array.from(foreignKeyValues) }
    });
    const relatedMap = /* @__PURE__ */ new Map();
    for (const obj of relatedObjects) {
      relatedMap.set(obj.id, obj);
    }
    for (const instance of instances) {
      const foreignKeyValue = instance[fieldName];
      if (foreignKeyValue && typeof foreignKeyValue === "string") {
        const relatedObject = relatedMap.get(foreignKeyValue);
        if (relatedObject) {
          instance._loadedRelationships.set(fieldName, relatedObject);
        }
      }
    }
  }
  /**
   * Batch load oneToMany relationships
   *
   * @param instances - Instances to load relationships for
   * @param fieldName - Name of the oneToMany field
   * @param relationship - Relationship metadata
   * @private
   */
  async batchLoadOneToMany(instances, fieldName, relationship) {
    const inverseRelationships = ObjectRegistry.getInverseRelationships(
      this._itemClass.name
    );
    const inverseForeignKey = inverseRelationships.find(
      (r) => r.sourceClass === relationship.targetClass && r.type === "foreignKey" && r.targetClass === this._itemClass.name
    );
    if (!inverseForeignKey) {
      console.warn(
        `Could not find inverse foreignKey for oneToMany ${fieldName}`
      );
      return;
    }
    const instanceIds = instances.map((i) => i.id).filter((id) => !!id);
    if (instanceIds.length === 0) return;
    let targetCollection;
    try {
      targetCollection = await ObjectRegistry.getCollection(
        relationship.targetClass,
        this.options
      );
    } catch (error) {
      console.warn(
        `Could not get collection for ${relationship.targetClass}:`,
        error
      );
      return;
    }
    const relatedObjects = await targetCollection.list({
      where: { [`${inverseForeignKey.fieldName} in`]: instanceIds }
    });
    const relatedMap = /* @__PURE__ */ new Map();
    for (const obj of relatedObjects) {
      const foreignKeyValue = obj[inverseForeignKey.fieldName];
      if (!relatedMap.has(foreignKeyValue)) {
        relatedMap.set(foreignKeyValue, []);
      }
      relatedMap.get(foreignKeyValue)?.push(obj);
    }
    for (const instance of instances) {
      const relatedArray = relatedMap.get(instance.id) || [];
      instance._loadedRelationships.set(fieldName, relatedArray);
    }
  }
  /**
   * Creates a new instance of the collection's item class
   *
   * @param options - Options for creating the item
   * @returns New item instance
   */
  async create(options) {
    const params = {
      ai: this.options.ai,
      db: this.options.db,
      persistence: this.options.persistence,
      _persistenceAdapter: this._persistenceAdapter,
      // Share the adapter instance
      _skipLoad: true,
      // Don't try to load from DB - this is a new object
      ...options
    };
    const instance = new this._itemClass(params);
    await instance.initialize();
    return instance;
  }
  /**
   * Gets an existing item or creates a new one if it doesn't exist
   *
   * @param data - Object data to find or create
   * @param defaults - Default values to use if creating a new object
   * @returns Promise resolving to the existing or new object
   */
  async getOrUpsert(data, defaults = {}) {
    data = formatDataSql(data);
    let where = {};
    if (data.id) {
      where = { id: data.id };
    } else if (data.slug) {
      where = { slug: data.slug, context: data.context || "" };
    } else {
      where = data;
    }
    const existing = await this.get(where);
    if (existing) {
      const diff = this.getDiff(existing, data);
      if (diff) {
        Object.assign(existing, diff);
        await existing.save();
        return existing;
      }
      return existing;
    }
    const upsertData = { ...defaults, ...data };
    const upserted = await this.create(upsertData);
    await upserted.save();
    return upserted;
  }
  /**
   * Gets differences between an existing object and new data
   *
   * @param existing - Existing object
   * @param data - New data
   * @returns Object containing only the changed fields
   */
  getDiff(existing, data) {
    const fields = this._itemClass.prototype.getFields();
    return Object.keys(data).reduce(
      (acc, key) => {
        if (fields[key] && existing[key] !== data[key]) {
          acc[key] = data[key];
        }
        return acc;
      },
      {}
    );
  }
  /**
   * Sets up the database schema for this collection
   *
   * @returns Promise that resolves when setup is complete
   */
  async setupDb() {
    if (this._db_setup_promise) {
      return this._db_setup_promise;
    }
    this._db_setup_promise = (async () => {
      try {
        const schema = this.generateSchema();
        console.log(
          `[Collection] Generated schema for ${this.tableName}:`,
          schema
        );
        await syncSchema({ db: this.db, schema });
        await this.setupTriggers();
      } catch (error) {
        this._db_setup_promise = null;
        throw error;
      }
    })();
    return this._db_setup_promise;
  }
  /**
   * Gets field definitions for the collection's item class
   *
   * @returns Object containing field definitions
   */
  getFields() {
    return fieldsFromClass(this._itemClass);
  }
  /**
   * Generates database schema for the collection's item class
   *
   * Leverages ObjectRegistry's cached schema for instant retrieval.
   *
   * @returns Schema object for database setup
   */
  generateSchema() {
    return generateSchema(this._itemClass);
  }
  /**
   * Sets up database triggers for automatically updating timestamps
   *
   * @returns Promise that resolves when triggers are set up
   */
  async setupTriggers() {
    const triggers = [
      `${this.tableName}_set_created_at`,
      `${this.tableName}_set_updated_at`
    ];
    const tableExists = await this.db.tableExists(this.tableName);
    if (!tableExists) {
      console.warn(
        `[smrt] Skipping trigger creation - table ${this.tableName} does not exist`
      );
      return;
    }
    for (const trigger of triggers) {
      const exists = await this.db.pluck`SELECT name FROM sqlite_master WHERE type='trigger' AND name=${trigger}`;
      if (!exists) {
        try {
          if (trigger === `${this.tableName}_set_created_at`) {
            const createTriggerSQL = `
              CREATE TRIGGER ${trigger}
              AFTER INSERT ON ${this.tableName}
              FOR EACH ROW
              WHEN NEW.created_at IS NULL
              BEGIN
                UPDATE ${this.tableName}
                SET created_at = datetime('now'), updated_at = datetime('now')
                WHERE id = NEW.id;
              END;
            `;
            await this.db.query(createTriggerSQL);
          } else if (trigger === `${this.tableName}_set_updated_at`) {
            const createTriggerSQL = `
              CREATE TRIGGER ${trigger}
              AFTER UPDATE ON ${this.tableName}
              FOR EACH ROW
              WHEN NEW.updated_at = OLD.updated_at
              BEGIN
                UPDATE ${this.tableName}
                SET updated_at = datetime('now')
                WHERE id = NEW.id;
              END;
            `;
            await this.db.query(createTriggerSQL);
          }
        } catch (error) {
          console.warn(`[smrt] Failed to create trigger ${trigger}:`, error);
        }
      }
    }
  }
  /**
   * Gets the database table name for this collection
   */
  get tableName() {
    if (!this._tableName) {
      this._tableName = tableNameFromClass(this.constructor);
    }
    return this._tableName;
  }
  /**
   * Generates a table name from the collection class name
   *
   * @returns Generated table name
   */
  generateTableName() {
    const tableName = this._className.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/([^s])$/, "$1s").replace(/y$/, "ies");
    return tableName;
  }
  /**
   * Counts records in the collection matching the given filters
   *
   * Accepts the same where conditions as list() but ignores limit/offset/orderBy.
   *
   * @param options - Query options object
   * @param options.where - Record of conditions to filter results
   * @returns Promise resolving to the total count of matching records
   */
  async count(options = {}) {
    if (this._persistenceAdapter) {
      return await this._persistenceAdapter.count(options);
    }
    const { where } = options;
    const { sql: whereSql, values: whereValues } = buildWhere(where || {});
    const result = await this.db.query(
      `SELECT COUNT(*) as count FROM ${this.tableName} ${whereSql}`,
      whereValues
    );
    return Number.parseInt(result.rows[0].count, 10);
  }
}
const collection = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  SmrtCollection
}, Symbol.toStringTag, { value: "Module" }));
export {
  ALL_SYSTEM_TABLES as A,
  CREATE_SMRT_NOTES_TABLE as C,
  SmrtCollection as S,
  SmrtClass as a,
  config as b,
  createPersistenceAdapter as c,
  SignalBus as d,
  SignalSanitizer as e,
  CREATE_SMRT_MIGRATIONS_TABLE as f,
  CREATE_SMRT_REGISTRY_TABLE as g,
  CREATE_SMRT_SIGNALS_TABLE as h,
  SMRT_SCHEMA_VERSION as i,
  collection as j
};
//# sourceMappingURL=collection-fcVk8Wh3.js.map
