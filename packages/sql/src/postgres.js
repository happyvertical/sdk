import { Pool } from "pg";
/**
 * Creates a PostgreSQL database adapter
 *
 * @param options - PostgreSQL connection options
 * @returns Database interface for PostgreSQL
 */
export function getDatabase(options = {}) {
    const { url = process.env.SQLOO_URL, database = process.env.SQLOO_DATABASE, host = process.env.SQLOO_HOST || "localhost", user = process.env.SQLOO_USER, password = process.env.SQLOO_PASSWORD, port = Number(process.env.SQLOO_PORT) || 5432, } = options;
    // Create a connection pool
    const client = new Pool(url
        ? { connectionString: url }
        : {
            host,
            user,
            password,
            port,
            database,
        });
    /**
     * Inserts data into a table and returns the operation result
     *
     * @param table - Table name
     * @param data - Single record or array of records to insert
     * @returns Promise resolving to operation result
     */
    const insert = async (table, data) => {
        // If data is an array, we need to handle multiple rows
        if (Array.isArray(data)) {
            const keys = Object.keys(data[0]);
            const placeholders = data
                .map((_, i) => `(${keys.map((_, j) => `$${i * keys.length + j + 1}`).join(", ")})`)
                .join(", ");
            const query = `INSERT INTO ${table} (${keys.join(", ")}) VALUES ${placeholders}`;
            const values = data.reduce((acc, row) => acc.concat(Object.values(row)), []);
            const result = await client.query(query, values);
            return { operation: "insert", affected: result.rowCount ?? 0 };
        }
        else {
            // If data is an object, we handle a single row
            const keys = Object.keys(data);
            const values = Object.values(data);
            const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
            const query = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;
            const result = await client.query(query, values);
            return { operation: "insert", affected: result.rowCount ?? 0 };
        }
    };
    /**
     * Retrieves a single record matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records
     * @returns Promise resolving to query result
     */
    const get = async (table, where) => {
        const keys = Object.keys(where);
        const values = Object.values(where);
        const whereClause = keys
            .map((key, i) => `${key} = $${i + 1}`)
            .join(" AND ");
        const query = `SELECT * FROM ${table} WHERE ${whereClause}`;
        return client.query(query, values);
    };
    /**
     * Retrieves multiple records matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records
     * @returns Promise resolving to array of records
     */
    const list = async (table, where) => {
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
     * Updates records matching the where criteria
     *
     * @param table - Table name
     * @param where - Criteria to match records to update
     * @param data - New data to set
     * @returns Promise resolving to operation result
     */
    const update = async (table, where, data) => {
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
    /**
     * Gets a record matching the where criteria or inserts it if not found
     *
     * @param table - Table name
     * @param where - Criteria to match existing record
     * @returns Promise resolving to the query result or insert result
     */
    const getOrInsert = async (table, where) => {
        const result = await get(table, where);
        if (result)
            return result;
        return insert(table, where);
    };
    /**
     * Creates a table-specific interface for simplified table operations
     *
     * @param tableName - Table name
     * @returns TableMethods interface for the specified table
     */
    const table = (tableName) => {
        return {
            insert: (data) => insert(tableName, data),
            get: (data) => get(tableName, data),
            list: (data) => list(tableName, data),
        };
    };
    /**
     * Parses a tagged template literal into a SQL query and values
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Object with SQL query and values array
     */
    const parseTemplate = (strings, ...vars) => {
        let sql = strings[0];
        const values = [];
        for (let i = 0; i < vars.length; i++) {
            values.push(vars[i]);
            sql += "$" + (i + 1) + strings[i + 1];
        }
        return { sql, values };
    };
    /**
     * Executes a SQL query using template literals and returns a single value
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise resolving to a single value (first column of first row)
     */
    const pluck = async (strings, ...vars) => {
        const { sql, values } = parseTemplate(strings, ...vars);
        const result = await client.query(sql, values);
        return result.rows[0][0];
    };
    /**
     * Executes a SQL query using template literals and returns a single row
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise resolving to a single result record or null
     */
    const single = async (strings, ...vars) => {
        const { sql, values } = parseTemplate(strings, ...vars);
        const result = await client.query(sql, values);
        return result.rows[0];
    };
    /**
     * Executes a SQL query using template literals and returns multiple rows
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise resolving to array of result records
     */
    const many = async (strings, ...vars) => {
        const { sql, values } = parseTemplate(strings, ...vars);
        const { rows } = await client.query(sql, values);
        return rows;
    };
    /**
     * Executes a SQL query using template literals without returning results
     *
     * @param strings - Template strings
     * @param vars - Variables to interpolate into the query
     * @returns Promise that resolves when the query completes
     */
    const execute = async (strings, ...vars) => {
        const { sql, values } = parseTemplate(strings, ...vars);
        await client.query(sql, values);
    };
    /**
     * Executes a raw SQL query with parameterized values
     *
     * @param sql - SQL query string
     * @param values - Variables to use as parameters
     * @returns Promise resolving to query result with rows and count
     */
    const query = async (sql, values) => {
        const result = await client.query(sql, values);
        return {
            rows: result.rows,
            rowCount: result.rowCount ?? 0,
        };
    };
    /**
     * Checks if a table exists in the database
     *
     * @param tableName - Name of the table to check
     * @returns Promise resolving to boolean indicating if the table exists
     */
    const tableExists = async (tableName) => {
        const result = await client.query(`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)`, [tableName]);
        return result.rows[0].exists;
    };
    // Shorthand aliases for query methods
    const oo = many; // (o)bjective-(o)bjects: returns multiple rows
    const oO = single; // (o)bjective-(O)bject: returns a single row
    const ox = pluck; // (o)bjective-(x): returns a single value
    const xx = execute; // (x)ecute-(x)ecute: executes without returning
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
