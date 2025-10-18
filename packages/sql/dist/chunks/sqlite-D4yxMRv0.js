import { DatabaseError } from "@have/utils";
import { DatabaseSchemaManager, buildWhere } from "../index.js";
import { v as validateTableName, a as validateIndexName, b as validateColumnName, g as generateCreateIndexStatement, c as generateAddColumnStatement } from "./alter-utils-OwKqvidR.js";
const memoryConnectionCache = /* @__PURE__ */ new Map();
const pendingConnections = /* @__PURE__ */ new Map();
function generateDbId() {
  return `memory-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
async function createLibSQLClient(options) {
  const { url = ":memory:", authToken, encryptionKey } = options;
  let libsqlUrl = url;
  if (url !== ":memory:" && !url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("libsql://") && !url.startsWith("file:")) {
    const { resolve } = await import("node:path");
    const absolutePath = resolve(url);
    libsqlUrl = `file://${absolutePath}`;
  }
  try {
    const libsqlClient = "@libsql/client";
    const { createClient } = await import(
      /* @vite-ignore */
      libsqlClient
    );
    return createClient({ url: libsqlUrl, authToken, encryptionKey });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage?.includes("URL_SCHEME_NOT_SUPPORTED")) {
      throw new DatabaseError(
        `Unsupported URL scheme. Use ':memory:' for in-memory databases or 'libsql://' for remote LibSQL databases. Original: ${url}, Converted: ${libsqlUrl}`,
        { url: libsqlUrl, originalError: errorMessage }
      );
    }
    throw new DatabaseError(`Failed to create LibSQL client: ${errorMessage}`, {
      url: libsqlUrl,
      originalError: errorMessage
    });
  }
}
async function getDatabase(options = {}) {
  const url = options.url || ":memory:";
  if (url === ":memory:" && !options.dbid) {
    options.dbid = generateDbId();
  }
  if (options.dbid) {
    const cached = memoryConnectionCache.get(options.dbid);
    if (cached) {
      return cached;
    }
    const pending = pendingConnections.get(options.dbid);
    if (pending) {
      return pending;
    }
  }
  const connectionPromise = (async () => {
    const client = await createLibSQLClient(options);
    const serializeValue = (value) => {
      if (value === null || value === void 0) {
        return value;
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === "object") {
        return JSON.stringify(value);
      }
      return value;
    };
    const serializeRecord = (record) => {
      const serialized = {};
      for (const [key, value] of Object.entries(record)) {
        if (value !== void 0) {
          serialized[key] = serializeValue(value);
        }
      }
      return serialized;
    };
    const insert = async (table2, data) => {
      let sql;
      let values;
      if (Array.isArray(data)) {
        const serializedData = data.map((record) => serializeRecord(record));
        const keys = Object.keys(serializedData[0]);
        const placeholders = serializedData.map(() => `(${keys.map(() => "?").join(", ")})`).join(", ");
        sql = `INSERT INTO ${table2} (${keys.join(", ")}) VALUES ${placeholders}`;
        values = serializedData.reduce(
          (acc, row) => acc.concat(Object.values(row)),
          []
        );
      } else {
        const serializedData = serializeRecord(data);
        const keys = Object.keys(serializedData);
        const placeholders = keys.map(() => "?").join(", ");
        sql = `INSERT INTO ${table2} (${keys.join(", ")}) VALUES (${placeholders})`;
        values = Object.values(serializedData);
      }
      try {
        const result = await client.execute({ sql, args: values });
        return { operation: "insert", affected: result.rowsAffected };
      } catch (e) {
        throw new DatabaseError("Failed to insert records into table", {
          table: table2,
          sql,
          values,
          originalError: e instanceof Error ? e.message : String(e)
        });
      }
    };
    const get = async (table2, where) => {
      const keys = Object.keys(where);
      const values = Object.values(where);
      const whereClause = keys.map((key) => `${key} = ?`).join(" AND ");
      const sql = `SELECT * FROM ${table2} WHERE ${whereClause}`;
      try {
        const result = await client.execute({ sql, args: values });
        return result.rows[0] || null;
      } catch (e) {
        throw new DatabaseError("Failed to retrieve record from table", {
          table: table2,
          sql,
          values,
          originalError: e instanceof Error ? e.message : String(e)
        });
      }
    };
    const list = async (table2, where) => {
      const { sql: whereClause, values } = buildWhere(where);
      const sql = `SELECT * FROM ${table2} ${whereClause}`;
      try {
        const result = await client.execute({ sql, args: values });
        return result.rows;
      } catch (e) {
        throw new DatabaseError("Failed to list records from table", {
          table: table2,
          sql,
          values,
          originalError: e instanceof Error ? e.message : String(e)
        });
      }
    };
    const update = async (table2, where, data) => {
      const serializedData = serializeRecord(data);
      const keys = Object.keys(serializedData);
      const values = Object.values(serializedData);
      const setClause = keys.map((key) => `${key} = ?`).join(", ");
      const whereKeys = Object.keys(where);
      const whereValues = Object.values(where);
      const whereClause = whereKeys.map((key) => `${key} = ?`).join(" AND ");
      const sql = `UPDATE ${table2} SET ${setClause} WHERE ${whereClause}`;
      try {
        const result = await client.execute({
          sql,
          args: [...values, ...whereValues]
        });
        return { operation: "update", affected: result.rowsAffected };
      } catch (e) {
        throw new DatabaseError("Failed to update records in table", {
          table: table2,
          sql,
          values: [...values, ...whereValues],
          originalError: e instanceof Error ? e.message : String(e)
        });
      }
    };
    const upsert = async (table2, conflictColumns, data) => {
      const serializedData = serializeRecord(data);
      const keys = Object.keys(serializedData);
      const values = Object.values(serializedData);
      const placeholders = keys.map(() => "?").join(", ");
      const quotedKeys = keys.map((key) => `"${key}"`);
      const updateSet = quotedKeys.map((key, i) => `${key} = excluded.${key}`).join(", ");
      const quotedConflict = conflictColumns.map((col) => `"${col}"`).join(", ");
      const sql = `INSERT INTO ${table2} (${quotedKeys.join(", ")}) VALUES (${placeholders}) ON CONFLICT(${quotedConflict}) DO UPDATE SET ${updateSet}`;
      try {
        const result = await client.execute({ sql, args: values });
        return { operation: "upsert", affected: result.rowsAffected };
      } catch (e) {
        throw new DatabaseError("Failed to upsert record into table", {
          table: table2,
          sql,
          values,
          conflictColumns,
          originalError: e instanceof Error ? e.message : String(e)
        });
      }
    };
    const getOrInsert = async (table2, where, data) => {
      const result = await get(table2, where);
      if (result) return result;
      await insert(table2, data);
      const inserted = await get(table2, where);
      if (!inserted) {
        throw new DatabaseError("Failed to insert and retrieve record", {
          table: table2,
          where,
          data
        });
      }
      return inserted;
    };
    const tableExists = async (tableName) => {
      const tableExists2 = !!await pluck`SELECT name FROM sqlite_master WHERE type='table' AND name=${tableName}`;
      return tableExists2;
    };
    const syncSchema = async (schema) => {
      console.log("[sqlite.syncSchema] Starting schema sync for dbid:", options.dbid);
      console.log("[sqlite.syncSchema] Schema length:", schema.length, "chars");
      let normalizedSchema = schema.replace(/\s+/g, " ").replace(/DEFAULT CAST\(([^)]+)\s+AS\s+\w+\)/gi, "DEFAULT $1").trim();
      normalizedSchema = normalizedSchema.replace(
        /(?<=\(|,\s)(\w+)(?=\s+(?:TEXT|INTEGER|REAL|BLOB|DATETIME))/gi,
        '"$1"'
      );
      console.log("[sqlite.syncSchema] Normalized schema:", normalizedSchema);
      const commands = normalizedSchema.split(";").map((cmd) => cmd.trim()).filter((cmd) => cmd.length > 0);
      console.log("[sqlite.syncSchema] Found", commands.length, "commands to process");
      for (const command of commands) {
        try {
          console.log("[sqlite.syncSchema] Executing:", command.substring(0, 50) + "...");
          await client.execute(command);
          console.log("[sqlite.syncSchema] Successfully executed command");
        } catch (error) {
          console.error("[sqlite.syncSchema] Failed to execute command:", command);
          console.error("[sqlite.syncSchema] Error:", error);
          throw error;
        }
      }
    };
    const transaction = async (callback) => {
      try {
        await client.execute({ sql: "BEGIN TRANSACTION", args: [] });
        const txDb = {
          client,
          insert,
          get,
          list,
          update,
          upsert,
          getOrInsert,
          table,
          many,
          single,
          pluck,
          execute,
          query,
          oo: many,
          oO: single,
          ox: pluck,
          xx: execute,
          tableExists,
          syncSchema,
          transaction
        };
        const result = await callback(txDb);
        await client.execute({ sql: "COMMIT", args: [] });
        return result;
      } catch (error) {
        await client.execute({ sql: "ROLLBACK", args: [] });
        throw error;
      }
    };
    const table = (tableName) => ({
      insert: (data) => insert(tableName, data),
      get: (where) => get(tableName, where),
      list: (where) => list(tableName, where)
    });
    const parseTemplate = (strings, ...vars) => {
      let sql = strings[0];
      const values = [];
      for (let i = 0; i < vars.length; i++) {
        values.push(vars[i]);
        sql += `?${strings[i + 1]}`;
      }
      return { sql, values };
    };
    const pluck = async (strings, ...vars) => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        const result = await client.execute({ sql, args: values });
        return result.rows[0]?.[Object.keys(result.rows[0])[0]] ?? null;
      } catch (e) {
        throw new DatabaseError("Failed to execute pluck query", {
          sql,
          values,
          originalError: e instanceof Error ? e.message : String(e)
        });
      }
    };
    const single = async (strings, ...vars) => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        const result = await client.execute({ sql, args: values });
        return result.rows[0] || null;
      } catch (e) {
        throw new DatabaseError("Failed to execute single query", {
          sql,
          values,
          originalError: e instanceof Error ? e.message : String(e)
        });
      }
    };
    const many = async (strings, ...vars) => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        const result = await client.execute({ sql, args: values });
        return result.rows;
      } catch (e) {
        throw new DatabaseError("Failed to execute many query", {
          sql,
          values,
          originalError: e instanceof Error ? e.message : String(e)
        });
      }
    };
    const execute = async (strings, ...vars) => {
      const { sql, values } = parseTemplate(strings, ...vars);
      try {
        await client.execute({ sql, args: values });
      } catch (e) {
        throw new DatabaseError("Failed to execute query", {
          sql,
          values,
          originalError: e instanceof Error ? e.message : String(e)
        });
      }
    };
    const query = async (str, ...values) => {
      const sql = str;
      const args = Array.isArray(values[0]) ? values[0] : values;
      try {
        const result = await client.execute({ sql, args });
        return {
          command: sql.split(" ")[0].toUpperCase(),
          rowCount: result.rowsAffected ?? result.rows.length,
          oid: null,
          fields: Object.keys(result.rows[0] || {}).map((name) => ({
            name,
            tableID: 0,
            columnID: 0,
            dataTypeID: 0,
            dataTypeSize: -1,
            dataTypeModifier: -1,
            format: "text"
          })),
          rows: result.rows
        };
      } catch (e) {
        throw new DatabaseError("Failed to execute raw query", {
          sql,
          args,
          originalError: e instanceof Error ? e.message : String(e)
        });
      }
    };
    const oo = many;
    const oO = single;
    const ox = pluck;
    const xx = execute;
    const initializeSchemas = async (options2) => {
      const schemaManager = new DatabaseSchemaManager();
      const currentDb = {
        client,
        query,
        insert,
        update,
        upsert,
        get,
        list,
        getOrInsert,
        table,
        tableExists,
        many,
        single,
        pluck,
        execute,
        oo,
        oO,
        ox,
        xx,
        syncSchema,
        transaction
      };
      await schemaManager.initializeSchemas(currentDb, options2);
    };
    const getTableSchema = async (table2) => {
      validateTableName(table2);
      try {
        const exists = await tableExists(table2);
        if (!exists) {
          return null;
        }
        const columnRows = await many`SELECT * FROM pragma_table_info(${table2})`;
        const columns = {};
        for (const row of columnRows) {
          const colName = row.name;
          columns[colName] = {
            type: row.type,
            primaryKey: row.pk === 1,
            notNull: row.notnull === 1,
            defaultValue: row.dflt_value
          };
        }
        const indexRows = await many`
        SELECT name, sql FROM sqlite_master
        WHERE type = 'index'
          AND tbl_name = ${table2}
          AND name NOT LIKE 'sqlite_%'
      `;
        const indexes = [];
        for (const row of indexRows) {
          const indexName = row.name;
          const indexInfoRows = await many`SELECT * FROM pragma_index_info(${indexName})`;
          const indexColumns = [];
          for (const infoRow of indexInfoRows) {
            indexColumns.push(infoRow.name);
          }
          const indexListRow = await single`SELECT * FROM pragma_index_list(${table2}) WHERE name = ${indexName}`;
          indexes.push({
            name: indexName,
            columns: indexColumns,
            unique: indexListRow?.unique === 1
          });
        }
        const fkRows = await many`SELECT * FROM pragma_foreign_key_list(${table2})`;
        const foreignKeys = [];
        for (const fkRow of fkRows) {
          foreignKeys.push({
            column: fkRow.from,
            referencesTable: fkRow.table,
            referencesColumn: fkRow.to,
            onDelete: fkRow.on_delete,
            onUpdate: fkRow.on_update
          });
        }
        return {
          tableName: table2,
          columns,
          indexes,
          foreignKeys
        };
      } catch (e) {
        throw new DatabaseError("Failed to retrieve table schema", {
          table: table2,
          originalError: e instanceof Error ? e.message : String(e)
        });
      }
    };
    const alterTable = {
      /**
       * Adds a new column to an existing table
       *
       * @param table - Table name
       * @param column - Column definition with name
       * @returns Promise that resolves when column is added
       * @throws Error if the alter operation fails
       */
      addColumn: async (table2, column) => {
        validateTableName(table2);
        validateColumnName(column.name);
        try {
          const sql = generateAddColumnStatement(table2, column, "sqlite");
          await client.execute({ sql, args: [] });
        } catch (e) {
          throw new DatabaseError("Failed to add column to table", {
            table: table2,
            column: column.name,
            originalError: e instanceof Error ? e.message : String(e)
          });
        }
      },
      /**
       * Adds a new index to an existing table
       *
       * @param table - Table name
       * @param index - Index definition
       * @returns Promise that resolves when index is created
       * @throws Error if the create index operation fails
       */
      addIndex: async (table2, index) => {
        validateTableName(table2);
        validateIndexName(index.name);
        for (const col of index.columns) {
          validateColumnName(col);
        }
        try {
          const sql = generateCreateIndexStatement(table2, index);
          await client.execute({ sql, args: [] });
        } catch (e) {
          throw new DatabaseError("Failed to create index on table", {
            table: table2,
            index: index.name,
            originalError: e instanceof Error ? e.message : String(e)
          });
        }
      }
    };
    return {
      client,
      query,
      insert,
      update,
      upsert,
      get,
      list,
      getOrInsert,
      table,
      tableExists,
      many,
      single,
      pluck,
      execute,
      oo,
      oO,
      ox,
      xx,
      syncSchema,
      initializeSchemas,
      transaction,
      getTableSchema,
      alterTable
    };
  })();
  if (options.dbid) {
    pendingConnections.set(options.dbid, connectionPromise);
  }
  try {
    const db = await connectionPromise;
    if (options.dbid) {
      memoryConnectionCache.set(options.dbid, db);
    }
    return db;
  } finally {
    if (options.dbid) {
      pendingConnections.delete(options.dbid);
    }
  }
}
export {
  getDatabase
};
//# sourceMappingURL=sqlite-D4yxMRv0.js.map
