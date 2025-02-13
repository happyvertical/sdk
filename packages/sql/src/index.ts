import type { DatabaseInterface } from "./types.js";
import type { PostgresOptions } from "./postgres.js";
import type { SqliteOptions } from "./sqlite.js";

type GetDatabaseOptions =
  | (PostgresOptions & { type?: "postgres" })
  | (SqliteOptions & { type?: "sqlite" });

export async function getDatabase(
  options: GetDatabaseOptions = {},
): Promise<DatabaseInterface> {
  // if no type but url starts with file:, set to sqlite
  if (!options.type && options.url?.startsWith("file:")) {
    options.type = "sqlite";
  }

  if (options.type === "postgres") {
    const postgres = await import("./postgres");
    return postgres.getDatabase(options as PostgresOptions);
  } else if (options.type === "sqlite") {
    const sqlite = await import("./sqlite");
    return sqlite.getDatabase(options as SqliteOptions);
  } else {
    throw new Error("Invalid database type");
  }
}

function isValidTableName(name: string): boolean {
  // Simple regex to allow only alphanumeric characters and underscores
  return /^[a-zA-Z0-9_]+$/.test(name);
}

// takes a table definition and syncs it to the database
// caution: this will only be tested for schenarios within the sdk
export async function syncSchema(options: {
  db: DatabaseInterface;
  schema: string;
}) {
  const { db, schema } = options;
  if (!db || !schema) {
    throw new Error("db and schema are required");
  }
  const commands = schema
    .trim()
    .split(";")
    .filter((command) => command.trim() !== "");

  for (const command of commands) {
    const createTableRegex =
      /CREATE TABLE (IF NOT EXISTS )?(\w+) \(([\s\S]+)\)/i;
    const match = command.match(createTableRegex);

    if (match) {
      const tableName = match[2];
      const columns = match[3].trim().split(",\n");

      if (!isValidTableName(tableName)) {
        throw new Error("Invalid table name");
      }
      const tableExists =
        !!(await db.pluck`SELECT name FROM sqlite_master WHERE type='table' AND name=${tableName}`);
      if (!tableExists) {
        await db.query(command);
      } else {
        // 3. Check for column differences
        for (const column of columns) {
          const columnDef = column.trim();
          const [, columnName, columnType] =
            columnDef.match(/(\w+) (\w+)(.*)/) || [];

          if (columnName && columnType) {
            try {
              // Check if the column exists and has the correct type
              const columnInfo = await db.oO`
                SELECT *
                FROM pragma_table_info(${tableName})
                WHERE name = ${columnName}
              `;

              if (!columnInfo || columnInfo.length === 0) {
                // Column doesn't exist or has an incorrect type, apply changes
                const alterCommand = `ALTER TABLE ${tableName} ADD COLUMN ${columnDef};`;
                await db.query(alterCommand);
              }
            } catch (error) {
              // Column doesn't exist or has an incorrect type, apply changes
              const alterCommand = `ALTER TABLE ${tableName} ADD COLUMN ${columnDef};`;
              await db.query(alterCommand);
            }
          }
        }
      }
    }
  }
}

export async function tableExists(db: DatabaseInterface, tableName: string) {
  const tableExists =
    await db.pluck`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`;
  return !!tableExists;
}

export function escapeSqlValue(value: any): string {
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
  // Escape single quotes and wrap in quotes
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function validateColumnName(column: string): string {
  // Only allow alphanumeric characters, underscores, and dots (for table.column notation)
  if (!/^[a-zA-Z0-9_.]+$/.test(column)) {
    throw new Error(`Invalid column name: ${column}`);
  }
  return column;
}

export * from "./types.js";

export default { getDatabase, syncSchema, tableExists };
