/**
 * Clean field syntax for smrt objects
 * 
 * Provides simple, Svelte-inspired field definitions:
 * 
 * @example
 * ```typescript
 * import { text, decimal, boolean, foreignKey } from '@have/smrt/fields';
 * 
 * class Product extends BaseObject {
 *   name = text({ required: true });
 *   price = decimal({ min: 0 });
 *   active = boolean({ default: true });
 *   category = foreignKey(Category);
 * }
 * ```
 */

export interface FieldOptions {
  required?: boolean;
  default?: any;
  unique?: boolean;
  index?: boolean;
  description?: string;
}

export interface NumericFieldOptions extends FieldOptions {
  min?: number;
  max?: number;
}

export interface TextFieldOptions extends FieldOptions {
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  encrypted?: boolean;
}

export interface RelationshipFieldOptions extends FieldOptions {
  onDelete?: 'cascade' | 'restrict' | 'set_null';
  related?: string;
}

/**
 * Base field class that all field types extend
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
   * Get the SQL type for this field
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
   * Get field constraints for SQL
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

  private escapeSqlValue(value: any): string {
    if (value === null) return 'NULL';
    if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`;
    if (typeof value === 'boolean') return value ? '1' : '0';
    return String(value);
  }
}

/**
 * Text field for strings
 */
export function text(options: TextFieldOptions = {}): Field {
  return new Field('text', options);
}

/**
 * Integer field for whole numbers
 */
export function integer(options: NumericFieldOptions = {}): Field {
  return new Field('integer', options);
}

/**
 * Decimal field for floating point numbers
 */
export function decimal(options: NumericFieldOptions = {}): Field {
  return new Field('decimal', options);
}

/**
 * Boolean field for true/false values
 */
export function boolean(options: FieldOptions = {}): Field {
  return new Field('boolean', options);
}

/**
 * DateTime field for timestamps
 */
export function datetime(options: FieldOptions = {}): Field {
  return new Field('datetime', options);
}

/**
 * JSON field for structured data
 */
export function json(options: FieldOptions = {}): Field {
  return new Field('json', options);
}

/**
 * Foreign key relationship to another object
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
 * One-to-many relationship
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
 * Many-to-many relationship
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