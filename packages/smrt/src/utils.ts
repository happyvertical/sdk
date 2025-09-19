import { syncSchema } from '@have/sql';
import yaml from 'yaml';

/**
 * Checks if a field name indicates a date field based on naming conventions
 *
 * Recognizes common date field patterns like '_at', '_date', and 'date'.
 * Used for automatic type inference during schema generation.
 *
 * @param key - Field name to check
 * @returns Boolean indicating if the field is likely a date field
 * @example
 * ```typescript
 * isDateField('created_at'); // true
 * isDateField('updated_date'); // true
 * isDateField('name'); // false
 * ```
 */
export function isDateField(key: string) {
  return key.endsWith('_date') || key.endsWith('_at') || key === 'date';
}

/**
 * Converts a date string to a Date object
 * 
 * @param date - Date as string or Date object
 * @returns Date object
 */
export function dateAsString(date: Date | string) {
  if (typeof date === 'string') {
    return new Date(date);
  }
  return date;
}

/**
 * Converts a Date object to an ISO string
 * 
 * @param date - Date as Date object or string
 * @returns ISO date string or the original string
 */
export function dateAsObject(date: Date | string) {
  if (date instanceof Date) {
    return date.toISOString();
  }
  return date;
}

/**
 * Extracts field definitions from a class constructor
 *
 * Creates a temporary instance to introspect field definitions and their types.
 * This enables automatic schema generation from TypeScript class properties.
 *
 * @param ClassType - Class constructor to extract fields from
 * @param values - Optional values to set for the fields
 * @returns Object containing field definitions with names, types, and values
 * @throws {Error} If the class cannot be instantiated for introspection
 * @example
 * ```typescript
 * const fields = fieldsFromClass(Product);
 * console.log(fields.name.type); // 'TEXT'
 * console.log(fields.price.type); // 'INTEGER'
 * ```
 */
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

/**
 * Generates a complete database schema SQL statement for a class
 *
 * Creates CREATE TABLE statement with all fields, constraints, and indexes.
 * Automatically adds id, slug, and context fields for SMRT object support.
 *
 * @param ClassType - Class constructor to generate schema for
 * @returns SQL schema creation statement with CREATE TABLE and CREATE INDEX statements
 * @example
 * ```typescript
 * const schema = generateSchema(Product);
 * console.log(schema);
 * // Output:
 * // CREATE TABLE IF NOT EXISTS products (
 * //   id TEXT PRIMARY KEY,
 * //   slug TEXT NOT NULL,
 * //   context TEXT NOT NULL DEFAULT '',
 * //   name TEXT,
 * //   price INTEGER,
 * //   UNIQUE(slug, context)
 * // );
 * ```
 */
export function generateSchema(ClassType: new (...args: any[]) => any) {
  const tableName = tableNameFromClass(ClassType);
  const fields = fieldsFromClass(ClassType);
  let schema = `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;

  // Add id field first (always required)
  schema += '  id TEXT PRIMARY KEY,\n';

  // Add slug and context fields
  schema += '  slug TEXT NOT NULL,\n';
  schema += "  context TEXT NOT NULL DEFAULT '',\n";

  // Add other fields
  for (const [key, field] of Object.entries(fields)) {
    if (key === 'id' || key === 'slug' || key === 'context') continue;
    schema += `  ${key} ${field.type},\n`;
  }

  // Add composite unique constraint for slug and context
  schema += '  UNIQUE(slug, context),\n';

  schema = schema.slice(0, -2); // Remove trailing comma and newline
  schema += '\n);';

  schema += `\nCREATE INDEX IF NOT EXISTS ${tableName}_id_idx ON ${tableName} (id);`;
  schema += `\nCREATE INDEX IF NOT EXISTS ${tableName}_slug_context_idx ON ${tableName} (slug, context);`;
  return schema;
}

/**
 * Generates a table name from a class constructor
 * 
 * @param ClassType - Class constructor or function
 * @returns Pluralized snake_case table name
 */
export function tableNameFromClass(
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  ClassType: Function | (new (...args: any[]) => any),
) {
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


/**
 * Converts a class name to a table name with pluralization
 * 
 * @param className - Name of the class
 * @returns Pluralized snake_case table name
 */
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

/**
 * Cache of table setup promises to avoid duplicate setup operations
 */
const _setup_table_from_class_promises: Record<string, Promise<void> | null> =
  {};

/**
 * Sets up database tables for a class with caching to prevent duplicate operations
 *
 * Creates the database table, indexes, and triggers for a SMRT class.
 * Uses promise caching to ensure each table is only set up once.
 *
 * @param db - Database connection interface
 * @param ClassType - Class constructor to create tables for
 * @returns Promise that resolves when setup is complete
 * @throws {Error} If schema creation or trigger setup fails
 * @example
 * ```typescript
 * await setupTableFromClass(db, Product);
 * // Table 'products' is now ready for use
 * ```
 */
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

/**
 * Sets up database triggers for automatic timestamp updates
 * 
 * @param db - Database connection
 * @param tableName - Name of the table to set up triggers for
 * @returns Promise that resolves when triggers are set up
 */
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


/**
 * Formats data for JavaScript by converting date strings to Date objects
 * 
 * @param data - Object with data to format
 * @returns Object with properly typed values for JavaScript
 */
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

/**
 * Formats data for SQL by converting Date objects to ISO strings
 * 
 * @param data - Object with data to format
 * @returns Object with properly formatted values for SQL
 */
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
