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
    const postgres = await import("./postgres.js");
    return postgres.getDatabase(options as PostgresOptions);
  } else if (options.type === "sqlite") {
    const sqlite = await import("./sqlite.js");
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

const VALID_OPERATORS = {
  "=": "=",
  ">": ">",
  ">=": ">=",
  "<": "<",
  "<=": "<=",
  "!=": "!=",
  like: "LIKE",
  in: "IN",
} as const;

/**
 * Builds a SQL WHERE clause with parameterized values and flexible operators
 *
 * @param where Record of conditions with optional operators in keys
 * @param startIndex Starting index for parameter numbering (default: 1)
 * @returns Object containing the SQL clause and array of values
 *
 * @example Basic Usage:
 * ```typescript
 * buildWhere({
 *   'status': 'active',           // equals operator is default
 *   'price >': 100,              // greater than
 *   'stock <=': 5,               // less than or equal
 *   'category in': ['A', 'B'],   // IN clause for arrays
 *   'name like': '%shirt%'       // LIKE for pattern matching
 * });
 * ```
 *
 * @example NULL Handling:
 * ```typescript
 * buildWhere({
 *   'deleted_at': null,          // becomes "deleted_at IS NULL"
 *   'updated_at !=': null,       // becomes "updated_at IS NOT NULL"
 *   'status': 'active'           // regular comparison
 * });
 * ```
 *
 * @example Common Patterns:
 * ```typescript
 * // Price range
 * buildWhere({
 *   'price >=': 10,
 *   'price <': 100
 * });
 *
 * // Date filtering
 * buildWhere({
 *   'created_at >': startDate,
 *   'created_at <=': endDate,
 *   'deleted_at': null
 * });
 *
 * // Search with LIKE
 * buildWhere({
 *   'title like': '%search%',
 *   'description like': '%search%',
 *   'status': 'published'
 * });
 *
 * // Multiple values with IN
 * buildWhere({
 *   'role in': ['admin', 'editor'],
 *   'active': true,
 *   'last_login !=': null
 * });
 * ```
 *
 * The function handles:
 * - Standard comparisons (=, >, >=, <, <=, !=)
 * - NULL checks (IS NULL, IS NOT NULL)
 * - IN clauses for arrays
 * - LIKE for pattern matching
 * - Multiple conditions combined with AND
 */
export const buildWhere = (where: Record<string, any>, startIndex = 1) => {
  let sql = "";
  const values: any[] = [];
  let currIndex = startIndex;

  if (where && Object.keys(where).length > 0) {
    sql = "WHERE ";
    for (const [fullKey, value] of Object.entries(where)) {
      const [field, operator = "="] = fullKey.split(" ");
      const sqlOperator =
        VALID_OPERATORS[operator as keyof typeof VALID_OPERATORS] || "=";

      if (sql !== "WHERE ") {
        sql += " AND ";
      }

      if (value === null) {
        sql += `${field} IS ${sqlOperator === "=" ? "NULL" : "NOT NULL"}`;
      } else {
        sql += `${field} ${sqlOperator} $${currIndex++}`;
        values.push(value);
      }
    }
  }

  return { sql, values };
};

export * from "./types.js";

export default { getDatabase, syncSchema, tableExists, buildWhere };
