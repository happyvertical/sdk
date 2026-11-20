import { describe, expect, expectTypeOf, it } from 'vitest';
import type { DoctorContext } from './doctor';
import type { TableColumnInfo, TableSchemaInfo } from './shared/types';

/**
 * Source compatibility with 0.115: values shaped like the pre-0.116
 * `TableColumnInfo` / `DoctorContext` (no `generated`, `hidden`, `schema`)
 * must remain assignable. Typechecked by `tsc`; the runtime asserts are
 * incidental.
 */
describe('0.115 source compatibility', () => {
  it('accepts a TableColumnInfo without generated/hidden', () => {
    const legacy: TableColumnInfo = {
      type: 'text',
      primaryKey: false,
      notNull: true,
      defaultValue: null,
    };
    const schema: TableSchemaInfo = {
      tableName: 't',
      columns: { id: legacy },
      indexes: [],
      foreignKeys: [],
    };
    expect(schema.columns.id.generated ?? false).toBe(false);
    expect(schema.columns.id.hidden ?? false).toBe(false);
    expectTypeOf<TableColumnInfo['generated']>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<TableColumnInfo['hidden']>().toEqualTypeOf<
      boolean | undefined
    >();
  });

  it('accepts a DoctorContext without schema', () => {
    const legacy: DoctorContext = {
      db: {} as DoctorContext['db'],
      tables: new Set(),
    };
    expect(legacy.schema ?? 'public').toBe('public');
  });
});
