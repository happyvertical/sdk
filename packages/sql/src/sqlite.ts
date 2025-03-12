import { createClient } from "@libsql/client";
import type {
  QueryResult,
  DatabaseInterface,
  TableInterface,
} from "./types.js";
import { buildWhere } from "./index.js";

export interface SqliteOptions {
  url?: string;
  authToken?: string;
}

export function getDatabase(options: SqliteOptions = {}): DatabaseInterface {
  const { url = "file::memory:", authToken } = options;
  const client = createClient({ url, authToken });

  const insert = async (
    table: string,
    data: Record<string, any> | Record<string, any>[],
  ): Promise<QueryResult> => {
    let sql: string;
    let values: any[];

    if (Array.isArray(data)) {
      const keys = Object.keys(data[0]);
      const placeholders = data
        .map(() => `(${keys.map(() => "?").join(", ")})`)
        .join(", ");
      sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES ${placeholders}`;
      values = data.reduce(
        (acc, row) => acc.concat(Object.values(row)),
        [] as any[],
      );
    } else {
      const keys = Object.keys(data);
      const placeholders = keys.map(() => "?").join(", ");
      sql = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;
      values = Object.values(data);
    }
    try {
      const result = await client.execute({ sql: sql, args: values });
      return { operation: "insert", affected: result.rowsAffected };
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(values)}\nError: ${e}`,
      );
      throw e;
    }
  };

  const get = async (
    table: string,
    where: Record<string, any>,
  ): Promise<Record<string, any> | null> => {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const whereClause = keys.map((key) => `${key} = ?`).join(" AND ");
    const sql = `SELECT * FROM ${table} WHERE ${whereClause}`;
    try {
      const result = await client.execute({ sql: sql, args: values });
      return result.rows[0] || null;
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(values)}\nError: ${e}`,
      );
      throw e;
    }
  };

  const list = async (
    table: string,
    where: Record<string, any>,
  ): Promise<Record<string, any>[]> => {
    const { sql: whereClause, values } = buildWhere(where);
    const sql = `SELECT * FROM ${table} ${whereClause}`;
    try {
      const result = await client.execute({ sql, args: values });
      return result.rows;
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(values)}\nError: ${e}`,
      );
      throw e;
    }
  };

  const update = async (
    table: string,
    where: Record<string, any>,
    data: Record<string, any>,
  ): Promise<QueryResult> => {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key) => `${key} = ?`).join(", ");
    const whereKeys = Object.keys(where);
    const whereValues = Object.values(where);
    const whereClause = whereKeys.map((key) => `${key} = ?`).join(" AND ");

    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    try {
      const result = await client.execute({
        sql,
        args: [...values, ...whereValues],
      });
      return { operation: "update", affected: result.rowsAffected };
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify([...values, ...whereValues])}\nError: ${e}`,
      );
      throw e;
    }
  };

  const getOrInsert = async (
    table: string,
    where: Record<string, any>,
    data: Record<string, any>,
  ): Promise<Record<string, any>> => {
    const result = await get(table, where);
    if (result) return result;
    await insert(table, data);

    const inserted = await get(table, where);
    if (!inserted) {
      throw new Error("Failed to insert and retrieve record");
    }
    return inserted;
  };

  const tableExists = async (tableName: string): Promise<boolean> => {
    const tableExists =
      !!(await pluck`SELECT name FROM sqlite_master WHERE type='table' AND name=${tableName}`);
    return tableExists;
  };

  const table = (tableName: string): TableInterface => ({
    insert: (data) => insert(tableName, data),
    get: (where) => get(tableName, where),
    list: (where) => list(tableName, where),
  });

  const parseTemplate = (strings: TemplateStringsArray, ...vars: any[]) => {
    let sql = strings[0];
    const values = [];
    for (let i = 0; i < vars.length; i++) {
      values.push(vars[i]);
      sql += "?" + strings[i + 1];
    }
    return { sql, values };
  };

  const pluck = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<any> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    try {
      const result = await client.execute({ sql, args: values });
      return result.rows[0]?.[Object.keys(result.rows[0])[0]] ?? null;
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(values)}\nError: ${e}`,
      );
      throw e;
    }
  };

  const single = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<Record<string, any> | null> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    try {
      const result = await client.execute({ sql, args: values });
      return result.rows[0] || null;
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(values)}\nError: ${e}`,
      );
      throw e;
    }
  };

  const many = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<Record<string, any>[]> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    try {
      const result = await client.execute({ sql, args: values });
      return result.rows;
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(values)}\nError: ${e}`,
      );
      throw e;
    }
  };

  const execute = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<void> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    try {
      await client.execute({ sql, args: values });
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(values)}\nError: ${e}`,
      );
      throw e;
    }
  };

  const query = async (str: string, ...values: any[]) => {
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
          format: "text",
        })),
        rows: result.rows,
      };
    } catch (e) {
      console.error(
        `Error executing SQL: ${sql}\nValues: ${JSON.stringify(args)}\nError: ${e}`,
      );
      throw e;
    }
  };

  // cute aliases
  const oo = many;
  const oO = single;
  const ox = pluck;
  const xx = execute;

  return {
    client,
    query,
    insert,
    update,
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
  };
}
