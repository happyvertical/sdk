// biome-ignore-all lint/style/useNamingConvention: table columns and report aliases are snake_case
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type AggregateExpression,
  type AggregateSpec,
  buildAggregate,
  getDatabase,
  type SqlAdapterType,
} from './index.js';
import type { DatabaseInterface } from './shared/types.js';

const col = (name: string) => ({ col: name });
const val = (value: string | number | boolean | Date | null) => ({ value });
const eq = (left: object, right: object) =>
  ({ op: 'eq', left, right }) as AggregateExpression;

/** The join every example uses: same id, same tenant, so colliding ids never cross tenants. */
const workOrderJoin = (type: 'inner' | 'left' = 'inner') => ({
  table: 'work_orders',
  alias: 'wo',
  type,
  on: {
    op: 'and',
    operands: [
      eq(col('te.work_order_id'), col('wo.id')),
      eq(col('te.tenant_id'), col('wo.tenant_id')),
    ],
  } as AggregateExpression,
});

describe('aggregate joins, row expressions and filtered aggregates: SQL', () => {
  it('renders aliased joins with a structured ON and qualified columns', () => {
    const { sql, values } = buildAggregate(
      {
        from: 'time_entries',
        fromAlias: 'te',
        joins: [workOrderJoin('left')],
        select: [
          { column: 'wo.title', as: 'work_order' },
          { column: 'wo.estimated_hours', as: 'estimated_hours' },
          { fn: 'sum', column: 'te.hours', as: 'booked_hours' },
        ],
        where: { 'te.tenant_id': 'tenant-a' },
        orderBy: 'booked_hours DESC',
      },
      1,
      'postgres',
    );
    expect(sql).toBe(
      'SELECT wo.title AS work_order, wo.estimated_hours AS estimated_hours, SUM(te.hours) AS booked_hours FROM time_entries AS te LEFT JOIN work_orders AS wo ON ((te.work_order_id = wo.id) AND (te.tenant_id = wo.tenant_id)) WHERE te.tenant_id = $1 GROUP BY wo.title, wo.estimated_hours ORDER BY booked_hours DESC',
    );
    expect(values).toEqual(['tenant-a']);
  });

  it('inlines numbers, booleans and null; binds strings and dates', () => {
    const { sql, values } = buildAggregate(
      {
        from: 'flhas',
        select: [
          {
            fn: 'count',
            filter: {
              op: 'and',
              operands: [
                eq(col('halt_work'), val(true)),
                { op: 'gte', left: col('severity'), right: val(2) },
                eq(col('status'), val('submitted')),
                {
                  op: 'gte',
                  left: col('submitted_at'),
                  right: val(new Date('2026-01-01T00:00:00Z')),
                },
              ],
            },
            as: 'halted',
          },
        ],
      },
      1,
      'duckdb',
    );
    expect(sql).toBe(
      'SELECT COUNT(CASE WHEN ((halt_work = TRUE) AND (severity >= 2) AND (status = $1) AND (submitted_at >= CAST($2 AS TIMESTAMP))) THEN 1 END) AS halted FROM flhas',
    );
    expect(values).toEqual(['submitted', '2026-01-01T00:00:00.000Z']);
  });

  it('numbers parameters across select, joins, where, whereExpr, having and paging', () => {
    const { sql, values } = buildAggregate(
      {
        from: 'a',
        select: [
          { fn: 'count', filter: eq(col('kind'), val('x')), as: 'xs' },
          { fn: 'sum', column: 'n', as: 'total' },
        ],
        where: { status: 'open' },
        whereExpr: eq(col('region'), val('west')),
        having: { 'total >': 5 },
        limit: 10,
        offset: 20,
      },
      3,
      'postgres',
    );
    expect(sql).toBe(
      'SELECT COUNT(CASE WHEN (kind = $3) THEN 1 END) AS xs, SUM(n) AS total FROM a WHERE (status = $4) AND (region = $5) HAVING SUM(n) > $6 LIMIT $7 OFFSET $8',
    );
    expect(values).toEqual(['x', 'open', 'west', 5, 10, 20]);
  });

  it('reuses a parameterised aggregate in HAVING by alias without losing its binding', () => {
    const { sql, values } = buildAggregate(
      {
        from: 'a',
        select: [{ fn: 'count', filter: eq(col('kind'), val('x')), as: 'xs' }],
        having: { 'xs >': 2 },
      },
      1,
      'postgres',
    );
    expect(sql).toBe(
      'SELECT COUNT(CASE WHEN (kind = $1) THEN 1 END) AS xs FROM a HAVING COUNT(CASE WHEN (kind = $1) THEN 1 END) > $2',
    );
    expect(values).toEqual(['x', 2]);
  });

  it('groups a computed key by position so its parameters are not repeated', () => {
    const { sql, values } = buildAggregate(
      {
        from: 'stock',
        select: [
          {
            expr: { op: 'lte', left: col('qty'), right: col('reorder_point') },
            as: 'below_minimum',
          },
          { fn: 'count', as: 'skus' },
        ],
      },
      1,
      'sqlite',
    );
    expect(sql).toBe(
      'SELECT (qty <= reorder_point) AS below_minimum, COUNT(*) AS skus FROM stock GROUP BY 1',
    );
    expect(values).toEqual([]);
  });

  it('renders division as fractional with a zero guard, and timestamp differences per dialect', () => {
    const expr: AggregateExpression = {
      op: 'secondsBetween',
      later: col('claimed_at'),
      earlier: col('created_at'),
    };
    const per = (adapter: SqlAdapterType) =>
      buildAggregate(
        { from: 'e', select: [{ fn: 'avg', expr, as: 'response' }] },
        1,
        adapter,
      ).sql;
    expect(per('sqlite')).toBe(
      'SELECT AVG(((julianday(claimed_at) - julianday(created_at)) * 86400.0)) AS response FROM e',
    );
    expect(per('postgres')).toBe(
      'SELECT AVG(CAST(EXTRACT(EPOCH FROM (claimed_at - created_at)) AS DOUBLE PRECISION)) AS response FROM e',
    );
    expect(per('duckdb')).toBe(
      'SELECT AVG(epoch(claimed_at) - epoch(created_at)) AS response FROM e',
    );
    expect(
      buildAggregate({
        from: 'e',
        select: [
          {
            fn: 'sum',
            expr: { op: 'div', left: col('a'), right: col('b') },
            as: 'r',
          },
        ],
      }).sql,
    ).toBe('SELECT SUM(((a * 1.0) / NULLIF(b, 0))) AS r FROM e');
    const div = (adapter: SqlAdapterType) =>
      buildAggregate(
        {
          from: 'e',
          select: [
            {
              fn: 'sum',
              expr: { op: 'div', left: col('a'), right: col('b') },
              as: 'r',
            },
          ],
        },
        1,
        adapter,
      ).sql;
    expect(div('postgres')).toBe(
      'SELECT SUM(CAST(((a * 1.0) / NULLIF(b, 0)) AS DOUBLE PRECISION)) AS r FROM e',
    );
    expect(div('duckdb')).toBe(
      'SELECT SUM(CAST(((a * 1.0) / NULLIF(b, 0)) AS DOUBLE)) AS r FROM e',
    );
  });

  it('names a qualified column by its column part when no alias is given', () => {
    const { sql } = buildAggregate({
      from: 'te',
      fromAlias: 'te',
      joins: [{ table: 'wo', alias: 'wo', on: eq(col('te.w'), col('wo.id')) }],
      select: [{ column: 'wo.title' }, { fn: 'count', as: 'n' }],
      orderBy: 'wo.title',
    });
    expect(sql).toBe(
      'SELECT wo.title AS title, COUNT(*) AS n FROM te AS te INNER JOIN wo AS wo ON (te.w = wo.id) GROUP BY wo.title ORDER BY wo.title ASC',
    );
  });

  it('compares with a NULL literal as IS [NOT] NULL', () => {
    expect(
      buildAggregate({
        from: 'e',
        select: [{ fn: 'count', filter: eq(col('x'), val(null)), as: 'n' }],
      }).sql,
    ).toBe('SELECT COUNT(CASE WHEN (x IS NULL) THEN 1 END) AS n FROM e');
  });

  it('leaves specs without the new fields exactly as before', () => {
    expect(
      buildAggregate(
        {
          from: 'orders',
          select: [
            { column: 'customer_id' },
            { fn: 'sum', column: 'total', as: 'revenue' },
          ],
          where: { status: 'paid' },
        },
        1,
        'postgres',
      ),
    ).toEqual({
      sql: 'SELECT customer_id AS customer_id, SUM(total) AS revenue FROM orders WHERE status = $1 GROUP BY customer_id',
      values: ['paid'],
    });
  });

  describe('rejects', () => {
    const base = (over: Partial<AggregateSpec>): AggregateSpec => ({
      from: 'a',
      select: [{ fn: 'count', as: 'n' }],
      ...over,
    });

    it('a column qualified by a table that is not in the query', () => {
      expect(() =>
        buildAggregate(
          base({
            fromAlias: 'a1',
            joins: [workOrderJoin()],
            select: [{ column: 'other.x' }],
          }),
        ),
      ).toThrow(/must be qualified by the from table or a join alias/);
      expect(() =>
        buildAggregate(
          base({
            joins: [
              { table: 'b', alias: 'b', on: eq(col('a.id'), col('zzz.id')) },
            ],
          }),
        ),
      ).toThrow(/must be qualified/);
      expect(() =>
        buildAggregate(
          base({
            joins: [
              { table: 'b', alias: 'b', on: eq(col('a.x.y'), col('b.id')) },
            ],
          }),
        ),
      ).toThrow(/must be qualified/);
    });

    it('an alias whose string form changes between reads', () => {
      const shifty = () => {
        let reads = 0;
        return {
          toString: () =>
            reads++ === 0
              ? 'wo'
              : 'wo ON 1=1 UNION SELECT password FROM users --',
        } as never;
      };
      const on = eq(col('te.a'), val(1));
      expect(() =>
        buildAggregate({
          from: 'te',
          joins: [{ table: 'work_orders', alias: shifty(), on }],
          select: [{ fn: 'count', as: 'n' }],
        }),
      ).toThrow(/Invalid aggregate/);
      expect(() =>
        buildAggregate({
          from: 'orders',
          fromAlias: shifty(),
          select: [{ fn: 'count', as: 'n' }],
        }),
      ).toThrow(/Invalid aggregate/);
    });

    it('a schema-qualified from table with joins and no fromAlias', () => {
      expect(() =>
        buildAggregate({
          from: 'public.orders',
          joins: [{ table: 'b', alias: 'b', on: eq(col('b.id'), val(1)) }],
          select: [{ fn: 'count', as: 'n' }],
        }),
      ).toThrow(/fromAlias is required/);
    });

    it('select items that mix fn, bucket and expr', () => {
      expect(() =>
        buildAggregate({
          from: 'a',
          select: [{ fn: 'sum', column: 'x', bucket: 'day', as: 'd' } as never],
        }),
      ).toThrow(/mixes/);
    });

    it('duplicate or malformed aliases and join types', () => {
      expect(() =>
        buildAggregate(
          base({
            joins: [
              { table: 'b', alias: 'a', on: eq(col('a.id'), col('a.id')) },
            ],
          }),
        ),
      ).toThrow(/Duplicate/);
      expect(() =>
        buildAggregate(
          base({
            joins: [
              { table: 'b', alias: 'b.c', on: eq(col('a.id'), col('b.id')) },
            ],
          }),
        ),
      ).toThrow(/Invalid aggregate join alias/);
      expect(() =>
        buildAggregate(
          base({
            joins: [
              {
                table: 'b',
                alias: 'b',
                type: 'cross' as never,
                on: eq(col('a.id'), col('b.id')),
              },
            ],
          }),
        ),
      ).toThrow(/Invalid aggregate join type/);
      expect(() =>
        buildAggregate(base({ joins: [{ table: 'b', alias: 'b' } as never] })),
      ).toThrow(/requires an on condition/);
    });

    it('unknown operators, unsafe identifiers, non-finite numbers and non-object nodes', () => {
      const filter = (node: unknown) => () =>
        buildAggregate(
          base({ select: [{ fn: 'count', filter: node as never, as: 'n' }] }),
        );
      expect(filter({ op: 'drop' })).toThrow(
        /Unsupported aggregate expression operator/,
      );
      expect(filter({ op: 'toString' })).toThrow(/Unsupported/);
      expect(filter({ op: '__proto__' })).toThrow(/Unsupported/);
      expect(filter(eq(col('x; DROP TABLE a'), val(1)))).toThrow(
        /Invalid SQL identifier/,
      );
      expect(filter(eq(col('x'), val(Number.NaN)))).toThrow(/finite/);
      expect(filter(eq(col('x'), val(Number.POSITIVE_INFINITY)))).toThrow(
        /finite/,
      );
      expect(filter(eq(col('x'), { value: { sql: '1' } } as never))).toThrow(
        /literal/,
      );
      expect(filter('1 = 1')).toThrow(/must be an object/);
      expect(filter({ op: 'and', operands: [] })).toThrow(
        /at least one operand/,
      );
      expect(filter(eq(col('x'), val(new Date('nope'))))).toThrow(/valid/);
    });

    it('a column and an expr together, and expressions that are too large', () => {
      expect(() =>
        buildAggregate(
          base({
            select: [{ fn: 'sum', column: 'x', expr: col('y'), as: 'n' }],
          }),
        ),
      ).toThrow(/not both/);
      let deep: AggregateExpression = eq(col('x'), val(1));
      for (let i = 0; i < 40; i++) deep = { op: 'not', operand: deep };
      expect(() => buildAggregate(base({ whereExpr: deep }))).toThrow(
        /nested deeper/,
      );
      const wide: AggregateExpression = {
        op: 'and',
        operands: Array.from({ length: 400 }, () => eq(col('x'), val(1))),
      };
      expect(() => buildAggregate(base({ whereExpr: wide }))).toThrow(
        /more than/,
      );
    });

    it('shares one node budget across every expression of a spec', () => {
      const piece: AggregateExpression = {
        op: 'and',
        operands: Array.from({ length: 100 }, () => eq(col('x'), val(1))),
      };
      const select = Array.from({ length: 6 }, (_, i) => ({
        fn: 'count' as const,
        filter: piece,
        as: `n${i}`,
      }));
      expect(() => buildAggregate(base({ select }))).toThrow(/more than/);
    });

    it('rejects an expr or filter on a non-aggregate function', () => {
      for (const fn of ['pg_read_file', 'nextval', 'load_extension']) {
        expect(() =>
          buildAggregate(
            base({ select: [{ fn, expr: val('/etc/passwd'), as: 'x' }] }),
          ),
        ).toThrow(/cannot take an expr or filter/);
      }
    });

    it('rejects two select items with the same alias', () => {
      expect(() =>
        buildAggregate({
          from: 'a',
          fromAlias: 'a',
          joins: [{ table: 'b', alias: 'b', on: eq(col('a.id'), col('b.id')) }],
          select: [{ column: 'a.id' }, { column: 'b.id' }],
        }),
      ).toThrow(/Duplicate aggregate select alias/);
    });

    it('parenthesises where so whereExpr constrains every OR group', () => {
      const { sql } = buildAggregate(
        base({
          where: [[{ a: 1 }], [{ b: 2 }]],
          whereExpr: eq(col('tenant_id'), val('T1')),
        }),
      );
      expect(sql).toMatch(/WHERE \(\(a = \$1\) OR \(b = \$2\)\) AND /);
    });

    it('casts date literals on Postgres so two bare parameters are typed', () => {
      const { sql } = buildAggregate(
        base({
          select: [
            {
              fn: 'avg',
              expr: {
                op: 'secondsBetween',
                later: val(new Date('2026-01-02T00:00:00Z')),
                earlier: val(new Date('2026-01-01T00:00:00Z')),
              },
              as: 'n',
            },
          ],
        }),
        1,
        'postgres',
      );
      expect(sql).toContain('CAST($1 AS TIMESTAMPTZ)');
      expect(sql).toContain('CAST($2 AS TIMESTAMPTZ)');
    });
  });
});

/**
 * The same four examples on every dialect, against a dataset where ids collide
 * across tenants and the columns hold NULLs.
 */
interface Dialect {
  name: string;
  open: () => Promise<DatabaseInterface>;
  adapter: SqlAdapterType;
  /** Column types differ by dialect only where it matters (native uuid, booleans, timestamps). */
  ddl: string[];
  idA: string;
  idB: string;
}

const ids = {
  woA: '00000000-0000-4000-8000-0000000000a1',
  woShared: '00000000-0000-4000-8000-0000000000b2',
};

const dialects: Dialect[] = [
  {
    name: 'sqlite',
    adapter: 'sqlite',
    open: () => getDatabase({ type: 'sqlite', url: ':memory:' }),
    ddl: [
      'CREATE TABLE work_orders (id TEXT, tenant_id TEXT, title TEXT, estimated_hours REAL)',
      'CREATE TABLE time_entries (id TEXT, tenant_id TEXT, work_order_id TEXT, hours REAL)',
      'CREATE TABLE stock_levels (id TEXT, tenant_id TEXT, qty REAL, reorder_point REAL)',
      'CREATE TABLE flhas (id TEXT, tenant_id TEXT, halt_work INTEGER)',
      'CREATE TABLE errands (id TEXT, tenant_id TEXT, created_at TEXT, claimed_at TEXT)',
    ],
    idA: ids.woA,
    idB: ids.woShared,
  },
  {
    name: 'duckdb',
    adapter: 'duckdb',
    open: () =>
      getDatabase({
        type: 'duckdb',
        url: ':memory:',
        writeStrategy: 'none',
      } as never),
    ddl: [
      'CREATE TABLE work_orders (id UUID, tenant_id VARCHAR, title VARCHAR, estimated_hours DOUBLE)',
      'CREATE TABLE time_entries (id UUID, tenant_id VARCHAR, work_order_id UUID, hours DOUBLE)',
      'CREATE TABLE stock_levels (id UUID, tenant_id VARCHAR, qty DOUBLE, reorder_point DOUBLE)',
      'CREATE TABLE flhas (id UUID, tenant_id VARCHAR, halt_work BOOLEAN)',
      'CREATE TABLE errands (id UUID, tenant_id VARCHAR, created_at TIMESTAMPTZ, claimed_at TIMESTAMPTZ)',
    ],
    idA: ids.woA,
    idB: ids.woShared,
  },
  {
    name: 'postgres (pglite)',
    adapter: 'postgres',
    open: () => getDatabase({ type: 'pglite' }),
    ddl: [
      'CREATE TABLE work_orders (id uuid, tenant_id text, title text, estimated_hours double precision)',
      'CREATE TABLE time_entries (id uuid, tenant_id text, work_order_id uuid, hours double precision)',
      'CREATE TABLE stock_levels (id uuid, tenant_id text, qty double precision, reorder_point double precision)',
      'CREATE TABLE flhas (id uuid, tenant_id text, halt_work boolean)',
      'CREATE TABLE errands (id uuid, tenant_id text, created_at timestamptz, claimed_at timestamptz)',
    ],
    idA: ids.woA,
    idB: ids.woShared,
  },
];

describe.each(
  dialects,
)('aggregate joins and expressions run on $name', (dialect) => {
  let db: DatabaseInterface;
  const q = async (spec: AggregateSpec) => {
    const built = buildAggregate(spec, 1, dialect.adapter);
    const result = await db.query(built.sql, ...built.values);
    return result.rows as Record<string, unknown>[];
  };
  const uuid = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  beforeAll(async () => {
    db = await dialect.open();
    for (const statement of dialect.ddl) await db.query(statement);
    // The same id (woShared) exists in two tenants with different estimates.
    await db.insert('work_orders', [
      {
        id: dialect.idA,
        tenant_id: 'a',
        title: 'Gate rail',
        estimated_hours: 10,
      },
      {
        id: dialect.idB,
        tenant_id: 'a',
        title: 'Shared in A',
        estimated_hours: 8,
      },
      {
        id: dialect.idB,
        tenant_id: 'b',
        title: 'Shared in B',
        estimated_hours: 99,
      },
    ]);
    await db.insert('time_entries', [
      { id: uuid(1), tenant_id: 'a', work_order_id: dialect.idA, hours: 4 },
      { id: uuid(2), tenant_id: 'a', work_order_id: dialect.idA, hours: 6 },
      { id: uuid(3), tenant_id: 'a', work_order_id: dialect.idB, hours: 2 },
      { id: uuid(4), tenant_id: 'b', work_order_id: dialect.idB, hours: 50 },
      { id: uuid(5), tenant_id: 'a', work_order_id: uuid(999), hours: 1 }, // no such work order
    ]);
    await db.insert('stock_levels', [
      { id: uuid(11), tenant_id: 'a', qty: 3, reorder_point: 5 },
      { id: uuid(12), tenant_id: 'a', qty: 5, reorder_point: 5 },
      { id: uuid(13), tenant_id: 'a', qty: 9, reorder_point: 5 },
      { id: uuid(14), tenant_id: 'a', qty: 1, reorder_point: null },
    ]);
    const flag = (v: boolean) =>
      dialect.adapter === 'sqlite' ? (v ? 1 : 0) : v;
    await db.insert('flhas', [
      { id: uuid(21), tenant_id: 'a', halt_work: flag(true) },
      { id: uuid(22), tenant_id: 'a', halt_work: flag(false) },
      { id: uuid(23), tenant_id: 'a', halt_work: flag(true) },
      { id: uuid(24), tenant_id: 'a', halt_work: null },
    ]);
    await db.insert('errands', [
      {
        id: uuid(31),
        tenant_id: 'a',
        created_at: '2026-10-01T08:00:00.000Z',
        claimed_at: '2026-10-01T08:10:00.000Z',
      },
      {
        id: uuid(32),
        tenant_id: 'a',
        created_at: '2026-10-01T09:00:00.000Z',
        claimed_at: '2026-10-01T09:30:00.000Z',
      },
      {
        id: uuid(33),
        tenant_id: 'a',
        created_at: '2026-10-01T10:00:00.000Z',
        claimed_at: null,
      }, // not yet claimed
    ]);
  });

  afterAll(async () => {
    await db.close?.();
  });

  it('groups labour by work order beside its name and estimate, never across tenants', async () => {
    const rows = await q({
      from: 'time_entries',
      fromAlias: 'te',
      joins: [workOrderJoin('left')],
      select: [
        { column: 'wo.title', as: 'title' },
        { column: 'wo.estimated_hours', as: 'estimated_hours' },
        { fn: 'sum', column: 'te.hours', as: 'booked' },
      ],
      where: { 'te.tenant_id': 'a' },
      orderBy: 'booked DESC',
    });
    expect(rows).toEqual([
      { title: 'Gate rail', estimated_hours: 10, booked: 10 },
      { title: 'Shared in A', estimated_hours: 8, booked: 2 },
      { title: null, estimated_hours: null, booked: 1 },
    ]);
  });

  it('an inner join drops the entry with no work order', async () => {
    const rows = await q({
      from: 'time_entries',
      fromAlias: 'te',
      joins: [workOrderJoin()],
      select: [{ fn: 'count', as: 'entries' }],
      where: { 'te.tenant_id': 'a' },
    });
    expect(rows.map((r) => Number(r.entries))).toEqual([3]);
  });

  it('counts stock at or below its minimum with a row comparison, NULLs not counted', async () => {
    const rows = await q({
      from: 'stock_levels',
      select: [
        {
          fn: 'count',
          filter: { op: 'lte', left: col('qty'), right: col('reorder_point') },
          as: 'below',
        },
        { fn: 'count', as: 'all_skus' },
      ],
      where: { tenant_id: 'a' },
    });
    expect(rows.map((r) => [Number(r.below), Number(r.all_skus)])).toEqual([
      [2, 4],
    ]);
  });

  it('shows below-minimum as a computed key, NULL for an unmonitored SKU', async () => {
    const rows = await q({
      from: 'stock_levels',
      select: [
        {
          expr: { op: 'lte', left: col('qty'), right: col('reorder_point') },
          as: 'below_minimum',
        },
        { fn: 'count', as: 'skus' },
      ],
      where: { tenant_id: 'a' },
    });
    const byKey = new Map(
      rows.map((r) => [
        r.below_minimum === null ? null : Boolean(r.below_minimum),
        Number(r.skus),
      ]),
    );
    expect(byKey.get(true)).toBe(2);
    expect(byKey.get(false)).toBe(1);
    expect(byKey.get(null)).toBe(1);
  });

  it('counts flagged rows as one measure (true only; false and NULL are not counted)', async () => {
    const rows = await q({
      from: 'flhas',
      select: [
        { fn: 'count', filter: eq(col('halt_work'), val(true)), as: 'halted' },
        { fn: 'count', as: 'total' },
      ],
      where: { tenant_id: 'a' },
    });
    expect(rows.map((r) => [Number(r.halted), Number(r.total)])).toEqual([
      [2, 4],
    ]);
  });

  it('averages claimed minus created in seconds, skipping the unclaimed errand', async () => {
    const rows = await q({
      from: 'errands',
      select: [
        {
          fn: 'avg',
          expr: {
            op: 'secondsBetween',
            later: col('claimed_at'),
            earlier: col('created_at'),
          },
          as: 'avg_seconds',
        },
        {
          fn: 'count',
          filter: { op: 'isNotNull', operand: col('claimed_at') },
          as: 'claimed',
        },
      ],
      where: { tenant_id: 'a' },
    });
    expect(Number(rows[0].avg_seconds)).toBeCloseTo((600 + 1800) / 2, 3);
    expect(Number(rows[0].claimed)).toBe(2);
  });

  it('computes a ratio without integer truncation and filters a parameterised having by alias', async () => {
    const rows = await q({
      from: 'time_entries',
      fromAlias: 'te',
      joins: [workOrderJoin()],
      select: [
        { column: 'wo.title', as: 'title' },
        {
          fn: 'sum',
          expr: {
            op: 'div',
            left: col('te.hours'),
            right: col('wo.estimated_hours'),
          },
          as: 'burn',
        },
        {
          fn: 'count',
          filter: eq(col('wo.title'), val('Gate rail')),
          as: 'gate_entries',
        },
      ],
      where: { 'te.tenant_id': 'a' },
      having: { 'gate_entries >': 0 },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Gate rail');
    expect(Number(rows[0].burn)).toBeCloseTo(1, 6);
  });

  it('a zero divisor yields NULL, not an error', async () => {
    const rows = await q({
      from: 'stock_levels',
      select: [
        {
          fn: 'max',
          expr: { op: 'div', left: col('qty'), right: val(0) },
          as: 'r',
        },
      ],
    });
    expect(rows[0].r).toBeNull();
  });
});
