import { Pool, PoolClient, QueryResult } from "pg";

export interface PostgresOptions {
  url?: string;
  database?: string;
  host?: string;
  user?: string;
  password?: string;
  port?: number;
}

interface QueryResponse {
  operation: string;
  affected: number;
}

interface TableMethods {
  insert: (
    data: Record<string, any> | Record<string, any>[],
  ) => Promise<QueryResponse>;
  get: (data: Record<string, any>) => Promise<QueryResult>;
  list: (data: Record<string, any>) => Promise<any[]>;
}

export function getDatabase(options: PostgresOptions = {}) {
  const {
    url = process.env.SQLOO_URL,
    database = process.env.SQLOO_DATABASE,
    host = process.env.SQLOO_HOST || "localhost",
    user = process.env.SQLOO_USER,
    password = process.env.SQLOO_PASSWORD,
    port = Number(process.env.SQLOO_PORT) || 5432,
  } = options;

  const client = new Pool(
    url
      ? { connectionString: url }
      : {
          host,
          user,
          password,
          port,
          database,
        },
  );

  /**
   * Inserts data into a table and returns the inserted rows.
   */
  const insert = async (
    table: string,
    data: Record<string, any> | Record<string, any>[],
  ): Promise<QueryResponse> => {
    // If data is an array, we need to handle multiple rows
    if (Array.isArray(data)) {
      const keys = Object.keys(data[0]);
      const placeholders = data
        .map(
          (_, i) =>
            `(${keys.map((_, j) => `$${i * keys.length + j + 1}`).join(", ")})`,
        )
        .join(", ");
      const query = `INSERT INTO ${table} (${keys.join(
        ", ",
      )}) VALUES ${placeholders}`;
      const values = data.reduce(
        (acc, row) => acc.concat(Object.values(row)),
        [],
      );
      const result = await client.query(query, values);
      return { operation: "insert", affected: result.rowCount ?? 0 };
    } else {
      // If data is an object, we handle a single row
      const keys = Object.keys(data);
      const values = Object.values(data);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      const query = `INSERT INTO ${table} (${keys.join(
        ", ",
      )}) VALUES (${placeholders})`;
      const result = await client.query(query, values);
      return { operation: "insert", affected: result.rowCount ?? 0 };
    }
  };

  /**
   * Retrieves a row from a table based on a where clause.
   */
  const get = async (
    table: string,
    where: Record<string, any>,
  ): Promise<QueryResult> => {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const whereClause = keys
      .map((key, i) => `${key} = $${i + 1}`)
      .join(" AND ");
    const query = `SELECT * FROM ${table} WHERE ${whereClause}`;
    return client.query(query, values);
  };

  /**
   * Retrieves multiple rows from a table based on a where clause.
   */
  const list = async (
    table: string,
    where: Record<string, any>,
  ): Promise<any[]> => {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const whereClause = keys
      .map((key, i) => `${key} = $${i + 1}`)
      .join(" AND ");
    const query = `SELECT * FROM ${table} WHERE ${whereClause}`;
    const result = await client.query(query, values);
    return result.rows;
  };

  /**
   * Updates rows in a table based on a where clause and returns the updated rows.
   */
  const update = async (
    table: string,
    where: Record<string, any>,
    data: Record<string, any>,
  ): Promise<QueryResponse> => {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(", ");
    const whereKeys = Object.keys(where);
    const whereValues = Object.values(where);
    const whereClause = whereKeys
      .map((key, i) => `${key} = $${i + 1 + values.length}`)
      .join(" AND ");

    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
    const result = await client.query(sql, [...values, ...whereValues]);
    return { operation: "update", affected: result.rowCount ?? 0 };
  };

  const getOrInsert = async (
    table: string,
    where: Record<string, any>,
  ): Promise<QueryResult | QueryResponse> => {
    const result = await get(table, where);
    if (result) return result;
    return insert(table, where);
  };

  const table = (tableName: string): TableMethods => {
    return {
      insert: (data) => insert(tableName, data),
      get: (data) => get(tableName, data),
      list: (data) => list(tableName, data),
    };
  };

  interface SqlTemplate {
    sql: string;
    values: any[];
  }

  const parseTemplate = (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): SqlTemplate => {
    let sql = strings[0];
    const values = [];
    for (let i = 0; i < vars.length; i++) {
      values.push(vars[i]);
      sql += "$" + (i + 1) + strings[i + 1];
    }
    return { sql, values };
  };

  const pluck = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<any> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    const result = await client.query(sql, values);
    return result.rows[0][0];
  };

  const single = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<Record<string, any> | null> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    const result = await client.query(sql, values);
    return result.rows[0];
  };

  const many = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<Record<string, any>[]> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    const { rows } = await client.query(sql, values);
    return rows;
  };

  const execute = async (
    strings: TemplateStringsArray,
    ...vars: any[]
  ): Promise<void> => {
    const { sql, values } = parseTemplate(strings, ...vars);
    await client.query(sql, values);
  };

  const query = async (
    sql: string,
    values: any[],
  ): Promise<{ rows: Record<string, any>[]; rowCount: number }> => {
    const result = await client.query(sql, values);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
    };
  };

  const tableExists = async (tableName: string): Promise<boolean> => {
    const result = await client.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)`,
      [tableName],
    );
    return result.rows[0].exists;
  };
  // cute aliases
  const oo = many;
  const oO = single;
  const ox = pluck;
  const xx = execute;

  return {
    client,
    insert,
    update,
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
  };
}
