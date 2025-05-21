/*
this should work, but I want to get an initial commit in before refactoring



class Person extends BaseObject {
  name = new BaseText();
  age = new BaseReal();
  created_at = new BaseDate();
}

const person = new Person();
person.name = 'John';  // Works!
person.age = 30;      // Works!
person.created_at = new Date();  // Works!

console.log(`Hello ${person.name}`);  // "Hello John"


*/

/**
 * Base field class for object property typing
 * 
 * Provides a proxy-based approach to represent strongly-typed fields
 * in database objects.
 */
export class Field<T> {
  /**
   * The underlying field value
   */
  protected _value: T | null = null;

  /**
   * Creates a new Field instance
   * 
   * @param value - Initial field value
   * @returns Proxy-wrapped field instance
   */
  constructor(value: T | null = null) {
    this._value = value;
    return new Proxy(this, {
      set(target: any, prop: string, value: any) {
        if (prop === '_value') {
          target._value = value;
          return true;
        }
        target[prop] = value;
        return true;
      },
    });
  }

  /**
   * Gets the field value
   */
  get value(): T | null {
    return this._value;
  }

  /**
   * Converts the field value to a string
   * 
   * @returns String representation of the field value
   */
  toString() {
    return this._value?.toString() ?? '';
  }
}

/**
 * Text field type for string values
 */
export class TextField extends Field<string> {
  /**
   * SQL data type for this field
   */
  static readonly type = 'TEXT';
}

/**
 * Decimal field type for numeric values
 */
export class DecimalField extends Field<number> {
  /**
   * SQL data type for this field
   */
  static readonly type = 'REAL';
}

/**
 * Date field type for timestamp values
 */
export class DateField extends Field<Date> {
  /**
   * SQL data type for this field (stored as text in ISO format)
   */
  static readonly type = 'TEXT';
}
