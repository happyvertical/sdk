function generateAddColumnStatement(table, column, dialect) {
  const parts = [column.name, column.type];
  if (column.primaryKey) {
    parts.push("PRIMARY KEY");
  }
  if (column.notNull) {
    parts.push("NOT NULL");
  }
  if (column.unique) {
    parts.push("UNIQUE");
  }
  if (column.defaultValue !== void 0) {
    const defaultClause = generateDefaultClause(
      column.type,
      column.defaultValue
    );
    parts.push(`DEFAULT ${defaultClause}`);
  }
  if (column.check) {
    parts.push(`CHECK (${column.check})`);
  }
  if (column.foreignKey) {
    const fk = column.foreignKey;
    const fkParts = [`REFERENCES ${fk.table}(${fk.column})`];
    if (fk.onDelete) {
      fkParts.push(`ON DELETE ${fk.onDelete}`);
    }
    if (fk.onUpdate) {
      fkParts.push(`ON UPDATE ${fk.onUpdate}`);
    }
    parts.push(fkParts.join(" "));
  }
  const columnDef = parts.join(" ");
  return `ALTER TABLE ${table} ADD COLUMN ${columnDef}`;
}
function generateDefaultClause(columnType, defaultValue) {
  if (defaultValue === null) {
    return "NULL";
  }
  const typeUpper = columnType.toUpperCase();
  if (typeUpper.includes("TEXT") || typeUpper.includes("CHAR") || typeUpper.includes("VARCHAR") || typeUpper.includes("STRING")) {
    if (defaultValue === "") {
      return "''";
    }
    const escaped = String(defaultValue).replace(/'/g, "''");
    return `'${escaped}'`;
  }
  if (typeUpper.includes("BOOL")) {
    return defaultValue ? "true" : "false";
  }
  if (typeUpper.includes("INT") || typeUpper.includes("REAL") || typeUpper.includes("FLOAT") || typeUpper.includes("DOUBLE") || typeUpper.includes("NUMERIC") || typeUpper.includes("DECIMAL")) {
    return String(defaultValue);
  }
  if (typeUpper.includes("JSON")) {
    if (typeof defaultValue === "string") {
      return `'${defaultValue.replace(/'/g, "''")}'`;
    }
    return `'${JSON.stringify(defaultValue).replace(/'/g, "''")}'`;
  }
  if (typeUpper.includes("DATE") || typeUpper.includes("TIME") || typeUpper.includes("TIMESTAMP")) {
    if (defaultValue instanceof Date) {
      return `'${defaultValue.toISOString()}'`;
    }
    return `'${String(defaultValue).replace(/'/g, "''")}'`;
  }
  if (typeof defaultValue === "string") {
    return `'${defaultValue.replace(/'/g, "''")}'`;
  }
  return String(defaultValue);
}
function generateCreateIndexStatement(table, index) {
  const parts = ["CREATE"];
  if (index.unique) {
    parts.push("UNIQUE");
  }
  parts.push("INDEX");
  parts.push(index.name);
  parts.push(`ON ${table}`);
  const columns = index.columns.join(", ");
  parts.push(`(${columns})`);
  if (index.where) {
    parts.push(`WHERE ${index.where}`);
  }
  return parts.join(" ");
}
function validateTableName(tableName) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new Error(
      `Invalid table name: ${tableName}. Table names must start with a letter or underscore and contain only alphanumeric characters and underscores.`
    );
  }
}
function validateColumnName(columnName) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName)) {
    throw new Error(
      `Invalid column name: ${columnName}. Column names must start with a letter or underscore and contain only alphanumeric characters and underscores.`
    );
  }
}
function validateIndexName(indexName) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(indexName)) {
    throw new Error(
      `Invalid index name: ${indexName}. Index names must start with a letter or underscore and contain only alphanumeric characters and underscores.`
    );
  }
}
export {
  validateIndexName as a,
  validateColumnName as b,
  generateAddColumnStatement as c,
  generateCreateIndexStatement as g,
  validateTableName as v
};
//# sourceMappingURL=alter-utils-OwKqvidR.js.map
