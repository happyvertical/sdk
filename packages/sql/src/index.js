/**
 * Creates a database connection based on the provided options
 *
 * @param options - Configuration options for the database connection
 * @returns Promise resolving to a DatabaseInterface implementation
 * @throws Error if the database type is invalid
 */
export async function getDatabase(options = {}) {
    // if no type but url starts with file:, set to sqlite
    if (!options.type &&
        (options.url?.startsWith("file:") || options.url === ":memory:")) {
        options.type = "sqlite";
    }
    if (options.type === "postgres") {
        const postgres = await import("./postgres.js");
        return postgres.getDatabase(options);
    }
    else if (options.type === "sqlite") {
        const sqlite = await import("./sqlite.js");
        return sqlite.getDatabase(options);
    }
    else {
        throw new Error("Invalid database type");
    }
}
/**
 * Validates if a table name consists only of alphanumeric characters and underscores
 *
 * @param name - Table name to validate
 * @returns Boolean indicating if the name is valid
 */
function isValidTableName(name) {
    // Simple regex to allow only alphanumeric characters and underscores
    return /^[a-zA-Z0-9_]+$/.test(name);
}
/**
 * Synchronizes a SQL schema definition with a database
 * Creates tables if they don't exist and adds missing columns to existing tables
 *
 * @param options - Object containing database and schema
 * @param options.db - Database interface to use
 * @param options.schema - SQL schema definition
 * @throws Error if db or schema are missing or if table name is invalid
 */
export async function syncSchema(options) {
    const { db, schema } = options;
    if (!db || !schema) {
        throw new Error("db and schema are required");
    }
    const commands = schema
        .trim()
        .split(";")
        .filter((command) => command.trim() !== "");
    for (const command of commands) {
        const createTableRegex = /CREATE TABLE (IF NOT EXISTS )?(\w+) \(([\s\S]+)\)/i;
        const match = command.match(createTableRegex);
        if (match) {
            const tableName = match[2];
            const columns = match[3].trim().split(",\n");
            if (!isValidTableName(tableName)) {
                throw new Error("Invalid table name");
            }
            const tableExists = !!(await db.pluck `SELECT name FROM sqlite_master WHERE type='table' AND name=${tableName}`);
            if (!tableExists) {
                await db.query(command);
            }
            else {
                // 3. Check for column differences
                for (const column of columns) {
                    const columnDef = column.trim();
                    const [, columnName, columnType] = columnDef.match(/(\w+) (\w+)(.*)/) || [];
                    if (columnName && columnType) {
                        try {
                            // Check if the column exists and has the correct type
                            const columnInfo = await db.oO `
                SELECT *
                FROM pragma_table_info(${tableName})
                WHERE name = ${columnName}
              `;
                            if (!columnInfo || columnInfo.length === 0) {
                                // Column doesn't exist or has an incorrect type, apply changes
                                const alterCommand = `ALTER TABLE ${tableName} ADD COLUMN ${columnDef};`;
                                await db.query(alterCommand);
                            }
                        }
                        catch (error) {
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
/**
 * Checks if a table exists in the database
 *
 * @param db - Database interface to use
 * @param tableName - Name of the table to check
 * @returns Promise resolving to boolean indicating if the table exists
 */
export async function tableExists(db, tableName) {
    const tableExists = await db.pluck `SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`;
    return !!tableExists;
}
/**
 * Escapes and formats a value for use in SQL queries
 *
 * @param value - Value to escape
 * @returns String representation of the value safe for SQL use
 */
export function escapeSqlValue(value) {
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
/**
 * Validates a column name for use in SQL queries
 *
 * @param column - Column name to validate
 * @returns The validated column name
 * @throws Error if the column name contains invalid characters
 */
export function validateColumnName(column) {
    // Only allow alphanumeric characters, underscores, and dots (for table.column notation)
    if (!/^[a-zA-Z0-9_.]+$/.test(column)) {
        throw new Error(`Invalid column name: ${column}`);
    }
    return column;
}
/**
 * Map of valid SQL operators for use in WHERE clauses
 */
const VALID_OPERATORS = {
    "=": "=",
    ">": ">",
    ">=": ">=",
    "<": "<",
    "<=": "<=",
    "!=": "!=",
    like: "LIKE",
    in: "IN",
};
/**
 * Builds a SQL WHERE clause with parameterized values and flexible operators
 *
 * @param where - Record of conditions with optional operators in keys
 * @param startIndex - Starting index for parameter numbering (default: 1)
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
export const buildWhere = (where, startIndex = 1) => {
    let sql = "";
    const values = [];
    let currIndex = startIndex;
    if (where && Object.keys(where).length > 0) {
        sql = "WHERE ";
        for (const [fullKey, value] of Object.entries(where)) {
            const [field, operator = "="] = fullKey.split(" ");
            const sqlOperator = VALID_OPERATORS[operator] || "=";
            if (sql !== "WHERE ") {
                sql += " AND ";
            }
            if (value === null) {
                sql += `${field} IS ${sqlOperator === "=" ? "NULL" : "NOT NULL"}`;
            }
            else {
                sql += `${field} ${sqlOperator} $${currIndex++}`;
                values.push(value);
            }
        }
    }
    return { sql, values };
};
export * from "./types.js";
export default { getDatabase, syncSchema, tableExists, buildWhere };
