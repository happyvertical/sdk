const VALID_OPERATORS = {
  "=": "=",
  ">": ">",
  ">=": ">=",
  "<": "<",
  "<=": "<=",
  "!=": "!=",
  like: "LIKE",
  in: "IN"
};
const buildWhere = (where, startIndex = 1) => {
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
      } else if (sqlOperator === "IN" && Array.isArray(value)) {
        const placeholders = value.map(() => `$${currIndex++}`).join(", ");
        sql += `${field} IN (${placeholders})`;
        values.push(...value);
      } else {
        sql += `${field} ${sqlOperator} $${currIndex++}`;
        values.push(value);
      }
    }
  }
  return { sql, values };
};
export {
  buildWhere
};
//# sourceMappingURL=index4.js.map
