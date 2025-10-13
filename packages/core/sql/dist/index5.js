class DatabaseSchemaManager {
  static initializationLock = /* @__PURE__ */ new Map();
  initializedSchemas = /* @__PURE__ */ new Set();
  schemaVersions = /* @__PURE__ */ new Map();
  /**
   * Initialize schemas with dependency resolution
   */
  async initializeSchemas(db, options) {
    const startTime = Date.now();
    const result = {
      initialized: [],
      skipped: [],
      errors: [],
      executionTime: 0
    };
    try {
      let schemas = {};
      if (options.schema) {
        console.log(
          "[schema] Legacy SQL schema provided, converting to manifest format"
        );
        if (db.syncSchema) {
          await db.syncSchema(options.schema);
          result.initialized.push("legacy-sql");
        }
        result.executionTime = Date.now() - startTime;
        return result;
      }
      if (options.manifest) {
        schemas = { ...options.manifest.schemas };
      }
      if (options.overrides) {
        schemas = { ...schemas, ...options.overrides };
      }
      if (Object.keys(schemas).length === 0) {
        console.warn("[schema] No schemas provided for initialization");
        result.executionTime = Date.now() - startTime;
        return result;
      }
      const dependencyGraph = this.buildDependencyGraph(schemas);
      const initializationOrder = this.resolveDependencies(dependencyGraph);
      if (options.debug) {
        console.log("[schema] Initialization order:", initializationOrder);
      }
      for (const schemaName of initializationOrder) {
        const schema = schemas[schemaName];
        if (!schema) continue;
        try {
          await this.initializeSchema(db, schemaName, schema, {
            force: options.force,
            debug: options.debug
          });
          result.initialized.push(schemaName);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push({ schema: schemaName, error: errorMessage });
          if (options.debug) {
            console.error(
              `[schema] Failed to initialize ${schemaName}:`,
              error
            );
          }
        }
      }
      result.executionTime = Date.now() - startTime;
      if (options.debug) {
        console.log("[schema] Initialization complete:", result);
      }
      return result;
    } catch (error) {
      result.executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push({
        schema: "dependency-resolution",
        error: errorMessage
      });
      return result;
    }
  }
  /**
   * Initialize a single schema
   */
  async initializeSchema(db, schemaName, schema, options) {
    const { tableName, version } = schema;
    const lockKey = `${schemaName}:${tableName}`;
    if (DatabaseSchemaManager.initializationLock.has(lockKey)) {
      await DatabaseSchemaManager.initializationLock.get(lockKey);
      return;
    }
    if (!options.force && this.isSchemaUpToDate(schemaName, version)) {
      if (options.debug) {
        console.log(`[schema] Skipping ${schemaName} - already up to date`);
      }
      return;
    }
    const initPromise = this.performSchemaInitialization(
      db,
      schemaName,
      schema,
      options
    );
    DatabaseSchemaManager.initializationLock.set(lockKey, initPromise);
    try {
      await initPromise;
      this.markSchemaInitialized(schemaName, version);
    } finally {
      DatabaseSchemaManager.initializationLock.delete(lockKey);
    }
  }
  /**
   * Perform the actual schema initialization
   */
  async performSchemaInitialization(db, schemaName, schema, options) {
    const { tableName, columns, indexes, triggers } = schema;
    if (options.debug) {
      console.log(`[schema] Initializing ${schemaName} (${tableName})`);
    }
    const tableExists = await db.tableExists(tableName);
    if (!tableExists) {
      await this.createTable(db, schema);
      for (const index of indexes) {
        await this.createIndex(db, tableName, index);
      }
      for (const trigger of triggers) {
        await this.createTrigger(db, trigger);
      }
    } else if (options.force) {
      await db.query(`DROP TABLE IF EXISTS ${tableName}`);
      await this.createTable(db, schema);
      for (const index of indexes) {
        await this.createIndex(db, tableName, index);
      }
      for (const trigger of triggers) {
        await this.createTrigger(db, trigger);
      }
    } else {
      await this.updateSchemaIfNeeded(db, schema);
    }
  }
  /**
   * Create table from schema definition
   */
  async createTable(db, schema) {
    const { tableName, columns, foreignKeys } = schema;
    const columnDefinitions = [];
    for (const [columnName, columnDef] of Object.entries(columns)) {
      let def = `${columnName} ${columnDef.type}`;
      if (columnDef.primaryKey) def += " PRIMARY KEY";
      if (columnDef.unique && !columnDef.primaryKey) def += " UNIQUE";
      if (columnDef.notNull) def += " NOT NULL";
      if (columnDef.defaultValue !== void 0) {
        def += ` DEFAULT ${columnDef.defaultValue}`;
      }
      if (columnDef.check) def += ` CHECK (${columnDef.check})`;
      columnDefinitions.push(def);
    }
    for (const fk of foreignKeys) {
      let fkDef = `FOREIGN KEY (${fk.column}) REFERENCES ${fk.referencesTable}(${fk.referencesColumn})`;
      if (fk.onDelete) fkDef += ` ON DELETE ${fk.onDelete}`;
      if (fk.onUpdate) fkDef += ` ON UPDATE ${fk.onUpdate}`;
      columnDefinitions.push(fkDef);
    }
    const createTableSQL = `CREATE TABLE ${tableName} (
  ${columnDefinitions.join(",\n  ")}
)`;
    await db.query(createTableSQL);
  }
  /**
   * Create index from definition
   */
  async createIndex(db, tableName, index) {
    const uniqueClause = index.unique ? "UNIQUE " : "";
    const whereClause = index.where ? ` WHERE ${index.where}` : "";
    const createIndexSQL = `CREATE ${uniqueClause}INDEX ${index.name} ON ${tableName} (${index.columns.join(", ")})${whereClause}`;
    await db.query(createIndexSQL);
  }
  /**
   * Create trigger from definition
   */
  async createTrigger(db, trigger) {
    const conditionClause = trigger.condition ? ` WHEN ${trigger.condition}` : "";
    const createTriggerSQL = `CREATE TRIGGER ${trigger.name} ${trigger.when} ${trigger.event} ON ${trigger.table}${conditionClause} BEGIN ${trigger.body} END`;
    await db.query(createTriggerSQL);
  }
  /**
   * Update schema if changes are detected
   */
  async updateSchemaIfNeeded(db, schema) {
    console.log(
      `[schema] Schema update logic not yet implemented for ${schema.tableName}`
    );
  }
  /**
   * Build dependency graph from schemas
   */
  buildDependencyGraph(schemas) {
    const graph = /* @__PURE__ */ new Map();
    for (const [schemaName, schema] of Object.entries(schemas)) {
      const dependencies = schema.dependencies.filter(
        (dep) => Object.values(schemas).some((s) => s.tableName === dep)
      );
      graph.set(
        schemaName,
        dependencies.map(
          (dep) => Object.entries(schemas).find(
            ([_, s]) => s.tableName === dep
          )?.[0] || dep
        )
      );
    }
    return graph;
  }
  /**
   * Resolve dependencies using topological sort
   */
  resolveDependencies(graph) {
    const resolved = [];
    const visited = /* @__PURE__ */ new Set();
    const visiting = /* @__PURE__ */ new Set();
    const visit = (node) => {
      if (visiting.has(node)) {
        throw new Error(`Circular dependency detected involving ${node}`);
      }
      if (visited.has(node)) return;
      visiting.add(node);
      const dependencies = graph.get(node) || [];
      for (const dep of dependencies) {
        if (graph.has(dep)) {
          visit(dep);
        }
      }
      visiting.delete(node);
      visited.add(node);
      resolved.push(node);
    };
    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        visit(node);
      }
    }
    return resolved;
  }
  /**
   * Check if schema is up to date
   */
  isSchemaUpToDate(schemaName, version) {
    return this.initializedSchemas.has(schemaName) && this.schemaVersions.get(schemaName) === version;
  }
  /**
   * Mark schema as initialized
   */
  markSchemaInitialized(schemaName, version) {
    this.initializedSchemas.add(schemaName);
    this.schemaVersions.set(schemaName, version);
  }
  /**
   * Reset initialization state (for testing)
   */
  reset() {
    this.initializedSchemas.clear();
    this.schemaVersions.clear();
    DatabaseSchemaManager.initializationLock.clear();
  }
}
export {
  DatabaseSchemaManager
};
//# sourceMappingURL=index5.js.map
