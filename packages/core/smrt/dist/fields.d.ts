/**
 * Base field class for object property typing
 *
 * Provides a proxy-based approach to represent strongly-typed fields
 * in database objects.
 */
export declare class Field<T> {
    /**
     * The underlying field value
     */
    protected _value: T | null;
    /**
     * Creates a new Field instance
     *
     * @param value - Initial field value
     * @returns Proxy-wrapped field instance
     */
    constructor(value?: T | null);
    /**
     * Gets the field value
     */
    get value(): T | null;
    /**
     * Converts the field value to a string
     *
     * @returns String representation of the field value
     */
    toString(): string;
}
/**
 * Text field type for string values
 */
export declare class TextField extends Field<string> {
    /**
     * SQL data type for this field
     */
    static readonly type = "TEXT";
}
/**
 * Decimal field type for numeric values
 */
export declare class DecimalField extends Field<number> {
    /**
     * SQL data type for this field
     */
    static readonly type = "REAL";
}
/**
 * Date field type for timestamp values
 */
export declare class DateField extends Field<Date> {
    /**
     * SQL data type for this field (stored as text in ISO format)
     */
    static readonly type = "TEXT";
}
//# sourceMappingURL=fields.d.ts.map