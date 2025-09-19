/**
 * Field definition system for SMRT objects
 *
 * Provides a clean, type-safe field definition syntax inspired by modern ORMs.
 * Fields define database schema, validation rules, and TypeScript types automatically.
 *
 * @example Basic field usage
 * ```typescript
 * import { text, decimal, boolean, foreignKey } from '@have/smrt/fields';
 *
 * class Product extends BaseObject {
 *   name = text({ required: true, maxLength: 100 });
 *   price = decimal({ min: 0, max: 999999.99 });
 *   active = boolean({ default: true });
 *   categoryId = foreignKey(Category, { onDelete: 'restrict' });
 * }
 * ```
 *
 * @example Advanced field configuration
 * ```typescript
 * class User extends BaseObject {
 *   email = text({
 *     required: true,
 *     unique: true,
 *     pattern: '^[^@]+@[^@]+\.[^@]+$',
 *     description: 'User email address'
 *   });
 *   metadata = json({ default: {} });
 *   createdAt = datetime({ required: true });
 * }
 * ```
 */

/**
 * Base configuration options available for all field types
 *
 * @interface FieldOptions
 */
export interface FieldOptions {
  /** Whether this field is required (NOT NULL constraint) */
  required?: boolean;
  /** Default value for this field when creating new objects */
  default?: any;
  /** Whether this field must have unique values (UNIQUE constraint) */
  unique?: boolean;
  /** Whether to create a database index on this field for faster queries */
  index?: boolean;
  /** Human-readable description of the field's purpose */
  description?: string;
}

/**
 * Configuration options for numeric fields (integer, decimal)
 *
 * @interface NumericFieldOptions
 * @extends FieldOptions
 */
export interface NumericFieldOptions extends FieldOptions {
  /** Minimum allowed value for this field */
  min?: number;
  /** Maximum allowed value for this field */
  max?: number;
}

/**
 * Configuration options for text fields
 *
 * @interface TextFieldOptions
 * @extends FieldOptions
 */
export interface TextFieldOptions extends FieldOptions {
  /** Maximum length in characters */
  maxLength?: number;
  /** Minimum length in characters */
  minLength?: number;
  /** Regular expression pattern for validation */
  pattern?: string;
  /** Whether to encrypt this field's value in storage */
  encrypted?: boolean;
}

/**
 * Configuration options for relationship fields (foreign keys, associations)
 *
 * @interface RelationshipFieldOptions
 * @extends FieldOptions
 */
export interface RelationshipFieldOptions extends FieldOptions {
  /** What to do when the referenced object is deleted */
  onDelete?: 'cascade' | 'restrict' | 'set_null';
  /** Name of the related class (automatically set by relationship functions) */
  related?: string;
}

/**
 * Base field class that all field types extend
 *
 * Represents a database field with type information, validation rules,
 * and SQL generation capabilities. All field functions return instances
 * of this class with specific type and options configurations.
 *
 * @class Field
 */
export class Field {
  public readonly type: string;
  public readonly options: FieldOptions;
  public value: any;

  constructor(type: string, options: FieldOptions = {}) {
    this.type = type;
    this.options = options;
    this.value = options.default;
  }

  /**
   * Get the SQL type for this field based on the field type
   *
   * @returns SQL type string (e.g., 'TEXT', 'INTEGER', 'REAL')
   * @example
   * ```typescript
   * const nameField = text();
   * console.log(nameField.getSqlType()); // 'TEXT'
   * ```
   */
  getSqlType(): string {
    switch (this.type) {
      case 'text': return 'TEXT';
      case 'integer': return 'INTEGER';
      case 'decimal': return 'REAL';
      case 'boolean': return 'INTEGER';
      case 'datetime': return 'DATETIME';
      case 'json': return 'TEXT';
      case 'foreignKey': return 'TEXT';
      default: return 'TEXT';
    }
  }

  /**
   * Get field constraints for SQL DDL statements
   *
   * @returns Array of SQL constraint strings (e.g., ['NOT NULL', 'UNIQUE'])
   * @example
   * ```typescript
   * const emailField = text({ required: true, unique: true });
   * console.log(emailField.getSqlConstraints()); // ['NOT NULL', 'UNIQUE']
   * ```
   */
  getSqlConstraints(): string[] {
    const constraints: string[] = [];
    
    if (this.options.required) {
      constraints.push('NOT NULL');
    }
    
    if (this.options.unique) {
      constraints.push('UNIQUE');
    }
    
    if (this.options.default !== undefined) {
      constraints.push(`DEFAULT ${this.escapeSqlValue(this.options.default)}`);
    }
    
    return constraints;
  }

  /**
   * Escapes a value for safe inclusion in SQL statements
   *
   * @param value - Value to escape
   * @returns Escaped SQL value string
   * @private
   */
  private escapeSqlValue(value: any): string {
    if (value === null) return 'NULL';
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
    if (typeof value === 'boolean') return value ? '1' : '0';
    return String(value);
  }
}

/**
 * Creates a text field for storing string values
 *
 * @param options - Configuration options for the text field
 * @returns Field instance configured for text storage
 * @example
 * ```typescript
 * class User extends BaseObject {
 *   name = text({ required: true, maxLength: 100 });
 *   email = text({ unique: true, pattern: '^[^@]+@[^@]+\.[^@]+$' });
 *   bio = text({ maxLength: 500 });
 * }
 * ```
 */
export function text(options: TextFieldOptions = {}): Field {
  return new Field('text', options);
}

/**
 * Creates an integer field for storing whole numbers
 *
 * @param options - Configuration options for the integer field
 * @returns Field instance configured for integer storage
 * @example
 * ```typescript
 * class Product extends BaseObject {
 *   quantity = integer({ min: 0, required: true });
 *   rating = integer({ min: 1, max: 5 });
 *   views = integer({ default: 0 });
 * }
 * ```
 */
export function integer(options: NumericFieldOptions = {}): Field {
  return new Field('integer', options);
}

/**
 * Creates a decimal field for storing floating point numbers
 *
 * @param options - Configuration options for the decimal field
 * @returns Field instance configured for decimal storage
 * @example
 * ```typescript
 * class Product extends BaseObject {
 *   price = decimal({ min: 0, required: true });
 *   weight = decimal({ min: 0.01, max: 999.99 });
 *   discountRate = decimal({ min: 0, max: 1, default: 0 });
 * }
 * ```
 */
export function decimal(options: NumericFieldOptions = {}): Field {
  return new Field('decimal', options);
}

/**
 * Creates a boolean field for storing true/false values
 *
 * @param options - Configuration options for the boolean field
 * @returns Field instance configured for boolean storage
 * @example
 * ```typescript
 * class User extends BaseObject {
 *   isActive = boolean({ default: true });
 *   hasVerifiedEmail = boolean({ default: false });
 *   isAdmin = boolean({ required: true });
 * }
 * ```
 */
export function boolean(options: FieldOptions = {}): Field {
  return new Field('boolean', options);
}

/**
 * Creates a datetime field for storing timestamps
 *
 * @param options - Configuration options for the datetime field
 * @returns Field instance configured for datetime storage
 * @example
 * ```typescript
 * class Event extends BaseObject {
 *   startDate = datetime({ required: true });
 *   endDate = datetime();
 *   createdAt = datetime({ default: new Date() });
 * }
 * ```
 */
export function datetime(options: FieldOptions = {}): Field {
  return new Field('datetime', options);
}

/**
 * Creates a JSON field for storing structured data objects
 *
 * @param options - Configuration options for the JSON field
 * @returns Field instance configured for JSON storage
 * @example
 * ```typescript
 * class User extends BaseObject {
 *   preferences = json({ default: {} });
 *   metadata = json();
 *   config = json({ required: true });
 * }
 * ```
 */
export function json(options: FieldOptions = {}): Field {
  return new Field('json', options);
}

/**
 * Creates a foreign key field that references another SMRT object
 *
 * @param relatedClass - The class constructor of the related object
 * @param options - Configuration options for the foreign key field
 * @returns Field instance configured for foreign key relationships
 * @example
 * ```typescript
 * class Order extends BaseObject {
 *   customerId = foreignKey(Customer, { required: true, onDelete: 'restrict' });
 *   productId = foreignKey(Product, { onDelete: 'cascade' });
 * }
 * ```
 */
export function foreignKey(relatedClass: any, options: Omit<RelationshipFieldOptions, 'related'> = {}): Field {
  const field = new Field('foreignKey', {
    ...options,
    related: relatedClass.name
  } as FieldOptions);
  
  // Store reference to related class
  (field as any).relatedClass = relatedClass;
  
  return field;
}

/**
 * Creates a one-to-many relationship field
 *
 * @param relatedClass - The class constructor of the related objects
 * @param options - Configuration options for the relationship
 * @returns Field instance configured for one-to-many relationships
 * @example
 * ```typescript
 * class Category extends BaseObject {
 *   products = oneToMany(Product);
 * }
 *
 * class Customer extends BaseObject {
 *   orders = oneToMany(Order, { onDelete: 'cascade' });
 * }
 * ```
 */
export function oneToMany(relatedClass: any, options: Omit<RelationshipFieldOptions, 'related'> = {}): Field {
  const field = new Field('oneToMany', {
    ...options,
    related: relatedClass.name
  } as FieldOptions);
  
  // Store reference to related class
  (field as any).relatedClass = relatedClass;
  
  return field;
}

/**
 * Creates a many-to-many relationship field
 *
 * @param relatedClass - The class constructor of the related objects
 * @param options - Configuration options for the relationship
 * @returns Field instance configured for many-to-many relationships
 * @example
 * ```typescript
 * class Product extends BaseObject {
 *   categories = manyToMany(Category);
 *   tags = manyToMany(Tag);
 * }
 *
 * class User extends BaseObject {
 *   roles = manyToMany(Role);
 * }
 * ```
 */
export function manyToMany(relatedClass: any, options: Omit<RelationshipFieldOptions, 'related'> = {}): Field {
  const field = new Field('manyToMany', {
    ...options,
    related: relatedClass.name
  } as FieldOptions);
  
  // Store reference to related class
  (field as any).relatedClass = relatedClass;
  
  return field;
}