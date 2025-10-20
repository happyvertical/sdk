import { loadEnvConfig, DatabaseError } from "@have/utils";
import { Pool } from "pg";
import { buildWhere, DatabaseSchemaManager } from "../index.js";
import { v as validateTableName, a as validateIndexName, b as validateColumnName, g as generateCreateIndexStatement, c as generateAddColumnStatement } from "./alter-utils-DPxgAQfb.js";
function getDatabase(options = {}) {
  const config = loadEnvConfig(options, {
    packageName: "sql",
    schema: {
      url: "string",
      database: "string",
      host: "string",
      port: "number",
      user: "string",
      password: "string"
    }
  });
  if (!config.url && !config.host && !config.database && !config.user) {
    const legacyConfig = loadEnvConfig(
      {},
      {
        prefix: "SQLOO",
        schema: {
          url: "string",
          database: "string",
          host: "string",
          port: "number",
          user: "string",
          password: "string"
        }
      }
    );
    for (const [key, value] of Object.entries(legacyConfig)) {
      if (config[key] === void 0 && value !== void 0) {
        config[key] = value;
      }
    }
  }
  const {
    url,
    database,
    host = "localhost",
    user,
    password,
    port = 5432
  } = config;
  const client = new Pool(
    url ? { connectionString: url } : {
      host,
      user,
      password,
      port,
      database
    }
  );
  const insert = async (table2, data) => {
    if (Array.isArray(data)) {
      const keys2 = Object.keys(data[0]);
      const placeholders2 = data.map(
        (_, i) => `(${keys2.map((_2, j) => `$${i * keys2.length + j + 1}`).join(", ")})`
      ).join(", ");
      const query3 = `INSERT INTO ${table2} (${keys2.join(
        ", "
      )}) VALUES ${placeholders2}`;
      const values2 = data.reduce(
        (acc, row) => acc.concat(Object.values(row)),
        []
      );
      const result2 = await client.query(query3, values2);
      return { operation: "insert", affected: result2.rowCount ?? 0 };
    }
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const query2 = `INSERT INTO ${table2} (${keys.join(
      ", "
    )}) VALUES (${placeholders})`;
    const result = await client.query(query2, values);
    return { operation: "insert", affected: result.rowCount ?? 0 };
  };
  const get = async (table2, where) => {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(" AND ");
    const query2 = `SELECT * FROM ${table2} WHERE ${whereClause}`;
    try {
      const result = await client.query(query2, values);
      return result.rows[0] || null;
    } catch (e) {
      throw new DatabaseError("Failed to retrieve record from table", {
        table: table2,
        sql: query2,
        values,
        originalError: e instanceof Error ? e.message : String(e)
      });
    }
  };
  const list = async (table2, where) => {
    const { sql: whereClause, values } = buildWhere(where, 1);
    const query2 = `SELECT * FROM ${table2} ${whereClause}`;
    try {
      const result = await client.query(query2, values);
      return result.rows;
    } catch (e) {
      throw new DatabaseError("Failed to list records from table", {
        table: table2,
        sql: query2,
        values,
        originalError: e instanceof Error ? e.message : String(e)
      });
    }
  };
  const update = async (table2, where, data) => {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
    const whereKeys = Object.keys(where);
    const whereValues = Object.values(where);
    const whereClause = whereKeys.map((key, i) => `${key} = $${i + 1 + values.length}`).join(" AND ");
    const sql = `UPDATE ${table2} SET ${setClause} WHERE ${whereClause}`;
    try {
      const result = await client.query(sql, [...values, ...whereValues]);
      return { operation: "update", affected: result.rowCount ?? 0 };
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
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const updateSet = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
    const conflict = conflictColumns.join(", ");
    const sql = `INSERT INTO ${table2} (${keys.join(", ")}) VALUES (${placeholders}) ON CONFLICT(${conflict}) DO UPDATE SET ${updateSet}`;
    try {
      const result = await client.query(sql, values);
      return { operation: "upsert", affected: result.rowCount ?? 0 };
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
  const table = (tableName) => {
    return {
      insert: (data) => insert(tableName, data),
      get: (data) => get(tableName, data),
      list: (data) => list(tableName, data)
    };
  };
  const parseTemplate = (strings, ...vars) => {
    let sql = strings[0];
    const values = [];
    for (let i = 0; i < vars.length; i++) {
      values.push(vars[i]);
      sql += `$${i + 1}${strings[i + 1]}`;
    }
    return { sql, values };
  };
  const pluck = async (strings, ...vars) => {
    const { sql, values } = parseTemplate(strings, ...vars);
    try {
      const result = await client.query(sql, values);
      const firstRow = result.rows[0];
      if (!firstRow) return null;
      return Object.values(firstRow)[0];
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
      const result = await client.query(sql, values);
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
      const result = await client.query(sql, values);
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
      await client.query(sql, values);
    } catch (e) {
      throw new DatabaseError("Failed to execute query", {
        sql,
        values,
        originalError: e instanceof Error ? e.message : String(e)
      });
    }
  };
  const query = async (sql, ...values) => {
    try {
      const result = await client.query(sql, values);
      return {
        rows: result.rows,
        rowCount: result.rowCount ?? 0
      };
    } catch (e) {
      throw new DatabaseError("Failed to execute raw query", {
        sql,
        values,
        originalError: e instanceof Error ? e.message : String(e)
      });
    }
  };
  const tableExists = async (tableName) => {
    const result = await client.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = 'public')`,
      [tableName]
    );
    return result.rows[0].exists;
  };
  const syncSchema = async (schema) => {
    const commands = schema.trim().split(";").filter((command) => command.trim() !== "");
    for (const command of commands) {
      const createTableRegex = /CREATE TABLE (IF NOT EXISTS )?(\w+) \(([\s\S]+)\)/i;
      const match = command.match(createTableRegex);
      if (match) {
        const tableName = match[2];
        const columns = match[3].trim().split(",\n");
        const exists = await tableExists(tableName);
        if (!exists) {
          await client.query(command);
        } else {
          for (const column of columns) {
            const columnDef = column.trim();
            const columnMatch = columnDef.match(/(\w+)\s+(\w+[^,]*)/);
            if (columnMatch) {
              const columnName = columnMatch[1];
              if (columnName.toUpperCase() === "PRIMARY" || columnName.toUpperCase() === "FOREIGN" || columnName.toUpperCase() === "UNIQUE" || columnName.toUpperCase() === "CHECK" || columnName.toUpperCase() === "CONSTRAINT") {
                continue;
              }
              try {
                const columnExists = await client.query(
                  `SELECT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = $1
                    AND column_name = $2
                    AND table_schema = 'public'
                  )`,
                  [tableName, columnName]
                );
                if (!columnExists.rows[0].exists) {
                  const alterCommand = `ALTER TABLE ${tableName} ADD COLUMN ${columnDef}`;
                  await client.query(alterCommand);
                }
              } catch (error) {
                console.error(
                  `Error adding column ${columnName} to ${tableName}:`,
                  error
                );
              }
            }
          }
        }
      }
    }
  };
  const transaction = async (callback) => {
    const txClient = await client.connect();
    try {
      await txClient.query("BEGIN");
      const txDb = {
        client: txClient,
        insert: async (table2, data) => {
          if (Array.isArray(data)) {
            const keys2 = Object.keys(data[0]);
            const placeholders2 = data.map(
              (_, i) => `(${keys2.map((_2, j) => `$${i * keys2.length + j + 1}`).join(", ")})`
            ).join(", ");
            const query3 = `INSERT INTO ${table2} (${keys2.join(", ")}) VALUES ${placeholders2}`;
            const values2 = data.reduce(
              (acc, row) => acc.concat(Object.values(row)),
              []
            );
            const result3 = await txClient.query(query3, values2);
            return { operation: "insert", affected: result3.rowCount ?? 0 };
          }
          const keys = Object.keys(data);
          const values = Object.values(data);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
          const query2 = `INSERT INTO ${table2} (${keys.join(", ")}) VALUES (${placeholders})`;
          const result2 = await txClient.query(query2, values);
          return { operation: "insert", affected: result2.rowCount ?? 0 };
        },
        get: async (table2, where) => {
          const keys = Object.keys(where);
          const values = Object.values(where);
          const whereClause = keys.map((key, i) => `${key} = $${i + 1}`).join(" AND ");
          const query2 = `SELECT * FROM ${table2} WHERE ${whereClause}`;
          const result2 = await txClient.query(query2, values);
          return result2.rows[0] || null;
        },
        list: async (table2, where) => {
          const { sql: whereClause, values } = buildWhere(where, 1);
          const query2 = `SELECT * FROM ${table2} ${whereClause}`;
          const result2 = await txClient.query(query2, values);
          return result2.rows;
        },
        update: async (table2, where, data) => {
          const keys = Object.keys(data);
          const values = Object.values(data);
          const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
          const whereKeys = Object.keys(where);
          const whereValues = Object.values(where);
          const whereClause = whereKeys.map((key, i) => `${key} = $${i + 1 + values.length}`).join(" AND ");
          const sql = `UPDATE ${table2} SET ${setClause} WHERE ${whereClause}`;
          const result2 = await txClient.query(sql, [...values, ...whereValues]);
          return { operation: "update", affected: result2.rowCount ?? 0 };
        },
        upsert: async (table2, conflictColumns, data) => {
          const keys = Object.keys(data);
          const values = Object.values(data);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
          const updateSet = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
          const conflict = conflictColumns.join(", ");
          const sql = `INSERT INTO ${table2} (${keys.join(", ")}) VALUES (${placeholders}) ON CONFLICT(${conflict}) DO UPDATE SET ${updateSet}`;
          const result2 = await txClient.query(sql, values);
          return { operation: "upsert", affected: result2.rowCount ?? 0 };
        },
        getOrInsert: async (table2, where, data) => {
          const result2 = await txDb.get(table2, where);
          if (result2) return result2;
          await txDb.insert(table2, data);
          const inserted = await txDb.get(table2, where);
          if (!inserted) {
            throw new DatabaseError("Failed to insert and retrieve record", {
              table: table2,
              where,
              data
            });
          }
          return inserted;
        },
        table: (tableName) => ({
          insert: (data) => txDb.insert(tableName, data),
          get: (data) => txDb.get(tableName, data),
          list: (data) => txDb.list(tableName, data)
        }),
        many: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          const result2 = await txClient.query(sql, values);
          return result2.rows;
        },
        single: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          const result2 = await txClient.query(sql, values);
          return result2.rows[0] || null;
        },
        pluck: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          const result2 = await txClient.query(sql, values);
          const firstRow = result2.rows[0];
          if (!firstRow) return null;
          return Object.values(firstRow)[0];
        },
        execute: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          await txClient.query(sql, values);
        },
        query: async (sql, ...values) => {
          const result2 = await txClient.query(sql, values);
          return {
            rows: result2.rows,
            rowCount: result2.rowCount ?? 0
          };
        },
        oo: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          const result2 = await txClient.query(sql, values);
          return result2.rows;
        },
        oO: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          const result2 = await txClient.query(sql, values);
          return result2.rows[0] || null;
        },
        ox: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          const result2 = await txClient.query(sql, values);
          const firstRow = result2.rows[0];
          if (!firstRow) return null;
          return Object.values(firstRow)[0];
        },
        xx: async (strings, ...vars) => {
          const { sql, values } = parseTemplate(strings, ...vars);
          await txClient.query(sql, values);
        },
        tableExists,
        syncSchema,
        transaction
      };
      const result = await callback(txDb);
      await txClient.query("COMMIT");
      return result;
    } catch (error) {
      await txClient.query("ROLLBACK");
      throw error;
    } finally {
      txClient.release();
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
      insert,
      update,
      upsert,
      get,
      getOrInsert,
      list,
      table,
      many,
      single,
      pluck,
      execute,
      query,
      oo,
      oO,
      ox,
      xx,
      tableExists,
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
      const columnRows = await many`
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_name = ${table2}
          AND table_schema = 'public'
        ORDER BY ordinal_position
      `;
      const pkRows = await many`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_name = ${table2}
          AND tc.table_schema = 'public'
          AND tc.constraint_type = 'PRIMARY KEY'
      `;
      const pkColumns = new Set(pkRows.map((row) => row.column_name));
      const columns = {};
      for (const row of columnRows) {
        const colName = row.column_name;
        columns[colName] = {
          type: row.data_type,
          primaryKey: pkColumns.has(colName),
          notNull: row.is_nullable === "NO",
          defaultValue: row.column_default
        };
      }
      const indexRows = await many`
        SELECT
          indexname,
          indexdef
        FROM pg_indexes
        WHERE tablename = ${table2}
          AND schemaname = 'public'
          AND indexname NOT LIKE '%_pkey'
      `;
      const indexes = [];
      for (const row of indexRows) {
        const indexName = row.indexname;
        const indexDef = row.indexdef;
        const colMatch = indexDef.match(/\(([^)]+)\)/);
        const indexColumns = colMatch ? colMatch[1].split(",").map((col) => col.trim()) : [];
        const isUnique = indexDef.toUpperCase().includes("UNIQUE");
        indexes.push({
          name: indexName,
          columns: indexColumns,
          unique: isUnique
        });
      }
      const fkRows = await many`
        SELECT
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule,
          rc.update_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name
          AND rc.constraint_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = ${table2}
          AND tc.table_schema = 'public'
      `;
      const foreignKeys = [];
      for (const fkRow of fkRows) {
        foreignKeys.push({
          column: fkRow.column_name,
          referencesTable: fkRow.foreign_table_name,
          referencesColumn: fkRow.foreign_column_name,
          onDelete: fkRow.delete_rule,
          onUpdate: fkRow.update_rule
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
        const sql = generateAddColumnStatement(table2, column, "postgres");
        await client.query(sql);
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
        await client.query(sql);
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
    insert,
    update,
    upsert,
    get,
    getOrInsert,
    list,
    table,
    many,
    single,
    pluck,
    execute,
    query,
    oo,
    oO,
    ox,
    xx,
    tableExists,
    syncSchema,
    initializeSchemas,
    transaction,
    getTableSchema,
    alterTable
  };
}
export {
  getDatabase
};
//# sourceMappingURL=postgres-PJVevJE-.js.map
