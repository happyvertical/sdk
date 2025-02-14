import { syncSchema } from '@have/sql';

export function isDateField(key: string) {
  return key.endsWith('_date') || key.endsWith('_at') || key === 'date';
}

export function dateAsString(date: Date | string) {
  if (typeof date === 'string') {
    return new Date(date);
  }
  return date;
}

export function dateAsObject(date: Date | string) {
  if (date instanceof Date) {
    return date.toISOString();
  }
  return date;
}

export function formatDataJs(data: Record<string, any>) {
  const normalizedData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      normalizedData[key] = value;
    } else if (isDateField(key) && typeof value === 'string') {
      normalizedData[key] = new Date(value);
    } else {
      normalizedData[key] = value;
    }
  }
  return normalizedData;
}

export function formatDataSql(data: Record<string, any>) {
  const normalizedData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value instanceof Date) {
      normalizedData[key] = value.toISOString(); // Postgres accepts ISO format with timezone
    } else {
      normalizedData[key] = value;
    }
  }
  return normalizedData;
}

export function fieldsFromClass(
  ClassType: new (...args: any[]) => any,
  values?: Record<string, any>,
) {
  const fields: Record<string, any> = {};
  // just for introspection, dont need real creds
  const instance = new ClassType({
    ai: {
      type: 'openai',
      apiKey: 'sk-proj-1234567890',
    },
    db: {
      url: 'file:/tmp/dummy.db',
    },
  });

  // Get descriptors from the instance and all ancestors
  const descriptors = new Map<string, PropertyDescriptor>();

  // Start with the instance
  Object.entries(Object.getOwnPropertyDescriptors(instance)).forEach(
    ([key, descriptor]) => {
      descriptors.set(key, descriptor);
    },
  );

  // Walk up the prototype chain
  let proto = Object.getPrototypeOf(instance);
  while (proto && proto !== Object.prototype) {
    Object.entries(Object.getOwnPropertyDescriptors(proto)).forEach(
      ([key, descriptor]) => {
        // Only add if we haven't seen this property before
        if (!descriptors.has(key)) {
          descriptors.set(key, descriptor);
        }
      },
    );
    proto = Object.getPrototypeOf(proto);
  }

  // Process all collected descriptors
  for (const [key, descriptor] of descriptors) {
    // Skip methods, getters/setters, and internal properties
    if (
      typeof descriptor.value === 'function' ||
      descriptor.get ||
      descriptor.set ||
      key.startsWith('_') ||
      key.startsWith('#') ||
      key === 'constructor'
    ) {
      continue;
    }

    // If it's a data property with a defined type
    if (descriptor.value !== undefined) {
      let type: string | undefined;

      // Check the property definition
      const defaultValue = descriptor.value;
      if (defaultValue instanceof Date || isDateField(key)) {
        type = 'DATETIME';
      } else if (typeof defaultValue === 'string') {
        type = 'TEXT';
      } else if (typeof defaultValue === 'number') {
        type = 'INTEGER';
      } else if (defaultValue === null) {
        type = 'TEXT';
      }

      if (type) {
        fields[key] = {
          name: key,
          type,
          ...(values && key in values
            ? {
                value: values[key],
              }
            : {}),
        };
      }
    }
  }
  return fields;
}

export function generateSchema(ClassType: new (...args: any[]) => any) {
  const tableName = tableNameFromClass(ClassType);
  const fields = fieldsFromClass(ClassType);
  let schema = `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;

  // Add id field first (always required)
  schema += '  id TEXT PRIMARY KEY,\n';

  // Add slug with UNIQUE constraint
  schema += '  slug TEXT UNIQUE,\n';

  // Add other fields
  for (const [key, field] of Object.entries(fields)) {
    if (key === 'id' || key === 'slug') continue;
    schema += `  ${key} ${field.type},\n`;
  }

  schema = schema.slice(0, -2); // Remove trailing comma and newline
  schema += '\n);';

  schema += `\nCREATE INDEX IF NOT EXISTS ${tableName}_id_idx ON ${tableName} (id);`;
  schema += `\nCREATE INDEX IF NOT EXISTS ${tableName}_slug_idx ON ${tableName} (slug);`;
  return schema;
}

export function tableNameFromClass(ClassType: new (...args: any[]) => any) {
  return (
    ClassType.name
      // Insert underscore between lower & upper case letters
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      // Convert to lowercase
      .toLowerCase()
      // Handle basic pluralization rules
      .replace(/([^s])$/, '$1s')
      // Handle special cases ending in 'y'
      .replace(/y$/, 'ies')
  );
}

// export function escapeSqlValue(value: any): string {
//   if (value === null) {
//     return 'NULL';
//   }
//   if (value instanceof Date) {
//     return `'${value.toISOString()}'`;
//   }
//   if (typeof value === 'number') {
//     return value.toString();
//   }
//   if (typeof value === 'boolean') {
//     return value ? '1' : '0';
//   }
//   // Escape single quotes and wrap in quotes
//   return `'${String(value).replace(/'/g, "''")}'`;
// }

// function validateColumnName(column: string): string {
//   // Only allow alphanumeric characters, underscores, and dots (for table.column notation)
//   if (!/^[a-zA-Z0-9_.]+$/.test(column)) {
//     throw new Error(`Invalid column name: ${column}`);
//   }
//   return column;
// }

// export function addWhere({
//   sql,
//   replacements = [],
//   where = {},
//   required = true,
// }: {
//   sql: string;
//   replacements?: any[];
//   where?: object;
//   required?: boolean;
// }): { sql: string; replacements: any[] } {
//   const wheres = [];
//   for (const [key, value] of Object.entries(where)) {
//     const safeColumnName = validateColumnName(key);
//     wheres.push(`${safeColumnName} = $${replacements.length + 1}`);
//     replacements.push(value);
//   }

//   if (wheres.length > 0) {
//     sql += ` WHERE ${wheres.join(' AND ')}`;
//   } else if (required) {
//     throw new Error('WHERE clause is required but no conditions were provided');
//   }

//   return { sql, replacements };
// }

export function classnameToTablename(className: string) {
  // Convert camelCase/PascalCase to snake_case and pluralize
  const tableName = className
    // Insert underscore between lower & upper case letters
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    // Convert to lowercase
    .toLowerCase()
    // Handle basic pluralization rules
    .replace(/([^s])$/, '$1s')
    // Handle special cases ending in 'y'
    .replace(/y$/, 'ies');

  return tableName;
}

const _setup_table_from_class_promises: Record<string, Promise<void> | null> =
  {};

export async function setupTableFromClass(db: any, ClassType: any) {
  const tableName = classnameToTablename(ClassType.name);

  if (_setup_table_from_class_promises[tableName] !== undefined || null) {
    return _setup_table_from_class_promises[tableName];
  }

  _setup_table_from_class_promises[tableName] = (async () => {
    try {
      const schema = generateSchema(ClassType);
      await syncSchema({ db, schema });
      await setupTriggers(db, tableName);
    } catch (error) {
      _setup_table_from_class_promises[tableName] = null; // Allow retry on failure
      throw error;
    }
  })();

  return _setup_table_from_class_promises[tableName];
}

export async function setupTriggers(db: any, tableName: string) {
  const triggers = [
    `${tableName}_set_created_at`,
    `${tableName}_set_updated_at`,
  ];

  for (const trigger of triggers) {
    const exists =
      await db.pluck`SELECT name FROM sqlite_master WHERE type='trigger' AND name=${trigger}`;
    if (!exists) {
      if (trigger === `${tableName}_set_created_at`) {
        const createTriggerSQL = `
          CREATE TRIGGER ${trigger}
          AFTER INSERT ON ${tableName}
          BEGIN
            UPDATE ${tableName} 
            SET created_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP 
            WHERE id = NEW.id;
          END;
        `;
        await db.query(createTriggerSQL);
      } else if (trigger === `${tableName}_set_updated_at`) {
        const createTriggerSQL = `
          CREATE TRIGGER ${trigger}
          AFTER UPDATE ON ${tableName}
          BEGIN
            UPDATE ${tableName} 
            SET updated_at = CURRENT_TIMESTAMP 
            WHERE id = NEW.id;
          END;
        `;
        await db.query(createTriggerSQL);
      }
    }
  }
}
