import { buildWhere } from "./index4.js";
import { DatabaseSchemaManager } from "./index5.js";
function isDatabaseInstance(value) {
  return value && typeof value === "object" && typeof value.client !== "undefined" && typeof value.insert === "function" && typeof value.get === "function" && typeof value.query === "function";
}
async function getDatabase(options = {}) {
  if (isDatabaseInstance(options)) {
    return options;
  }
  if (!options.type && (options.url?.startsWith("file:") || options.url === ":memory:")) {
    options.type = "sqlite";
  }
  if (options.type === "postgres") {
    const postgres = await import("./index2.js");
    return postgres.getDatabase(options);
  }
  if (options.type === "sqlite") {
    const sqlite = await import("./index3.js");
    return sqlite.getDatabase(options);
  }
  throw new Error("Invalid database type");
}
async function syncSchema(options) {
  const { db, schema } = options;
  if (!db || !schema) {
    throw new Error("db and schema are required");
  }
  if (db.syncSchema) {
    await db.syncSchema(schema);
  } else {
    throw new Error("Database adapter does not support schema synchronization");
  }
}
async function tableExists(db, tableName) {
  return db.tableExists(tableName);
}
function escapeSqlValue(value) {
  if (value === null) {
    return "NULL";
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  if (typeof value === "number") {
    return value.toString();
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}
function validateColumnName(column) {
  if (!/^[a-zA-Z0-9_.]+$/.test(column)) {
    throw new Error(`Invalid column name: ${column}`);
  }
  return column;
}
const index = { getDatabase, syncSchema, tableExists, buildWhere };
export {
  DatabaseSchemaManager,
  buildWhere,
  index as default,
  escapeSqlValue,
  getDatabase,
  syncSchema,
  tableExists,
  validateColumnName
};
//# sourceMappingURL=index.js.map
