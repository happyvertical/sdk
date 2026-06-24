import { describe, expect, it } from 'vitest';
import {
  type AggregateSpec,
  bucketExpr,
  buildAggregate,
  getDatabase,
  syncSchema,
} from './index.js';

const tenantId = 'tenant_id';
const customerId = 'customer_id';
const createdAt = 'created_at';
const deletedAt = 'deleted_at';
const avgTotal = 'avg_total';

describe('aggregate SQL builder', () => {
  it('builds grouped aggregate queries with where, having, order, limit, and offset', () => {
    const result = buildAggregate(
      {
        from: 'orders',
        select: [
          { column: 'customer_id' },
          { fn: 'count', as: 'order_count' },
          { fn: 'sum', column: 'total', as: 'revenue' },
          { fn: 'avg', column: 'total', as: 'avg_total' },
          { fn: 'min', column: 'total', as: 'min_total' },
          { fn: 'max', column: 'total', as: 'max_total' },
        ],
        where: {
          status: 'paid',
          'created_at >=': new Date('2026-01-01T00:00:00.000Z'),
          [deletedAt]: null,
        },
        having: {
          'revenue >': 100,
        },
        orderBy: ['revenue DESC', 'customer_id ASC'],
        limit: 10,
        offset: 20,
      },
      1,
      'postgres',
    );

    expect(result.sql).toBe(
      'SELECT customer_id AS customer_id, COUNT(*) AS order_count, SUM(total) AS revenue, AVG(total) AS avg_total, MIN(total) AS min_total, MAX(total) AS max_total FROM orders WHERE status = $1 AND created_at >= $2 AND deleted_at IS NULL GROUP BY customer_id HAVING SUM(total) > $3 ORDER BY revenue DESC, customer_id ASC LIMIT $4 OFFSET $5',
    );
    expect(result.values).toEqual([
      'paid',
      '2026-01-01T00:00:00.000Z',
      100,
      10,
      20,
    ]);
  });

  it('uses aliases and distinct aggregate expressions', () => {
    const result = buildAggregate({
      from: 'events',
      select: [
        { column: 'tenant_id', as: 'tenant' },
        {
          fn: 'count',
          column: 'profile_id',
          distinct: true,
          as: 'unique_profiles',
        },
      ],
      having: {
        'unique_profiles >=': 2,
      },
    });

    expect(result.sql).toBe(
      'SELECT tenant_id AS tenant, COUNT(DISTINCT profile_id) AS unique_profiles FROM events GROUP BY tenant_id HAVING COUNT(DISTINCT profile_id) >= $1',
    );
    expect(result.values).toEqual([2]);
  });

  it('builds OR/AND having clauses with stable placeholder order', () => {
    const result = buildAggregate({
      from: 'orders',
      select: [
        { column: 'customer_id' },
        { fn: 'sum', column: 'total', as: 'revenue' },
      ],
      having: [
        [{ 'revenue >': 100 }, { 'customer_id in': ['a', 'b'] }],
        [{ revenue: null }],
      ],
    });

    expect(result.sql).toBe(
      'SELECT customer_id AS customer_id, SUM(total) AS revenue FROM orders GROUP BY customer_id HAVING (SUM(total) > $1 AND customer_id IN ($2, $3)) OR (SUM(total) IS NULL)',
    );
    expect(result.values).toEqual([100, 'a', 'b']);
  });

  it('casts date predicates for DuckDB and JSON but not SQLite/Postgres', () => {
    const spec: AggregateSpec = {
      from: 'orders',
      select: [{ fn: 'count', as: 'count' }],
      where: { 'created_at >': new Date('2026-01-01T00:00:00.000Z') },
      having: { 'count >': 0 },
    };

    expect(buildAggregate(spec, 1, 'duckdb').sql).toBe(
      'SELECT COUNT(*) AS count FROM orders WHERE created_at > CAST($1 AS TIMESTAMP) HAVING COUNT(*) > $2',
    );
    expect(buildAggregate(spec, 1, 'json').sql).toBe(
      'SELECT COUNT(*) AS count FROM orders WHERE created_at > CAST($1 AS TIMESTAMP) HAVING COUNT(*) > $2',
    );
    expect(buildAggregate(spec, 1, 'sqlite').sql).toBe(
      'SELECT COUNT(*) AS count FROM orders WHERE created_at > $1 HAVING COUNT(*) > $2',
    );
    expect(buildAggregate(spec, 1, 'postgres').sql).toBe(
      'SELECT COUNT(*) AS count FROM orders WHERE created_at > $1 HAVING COUNT(*) > $2',
    );
  });

  it('builds adapter-specific time bucket expressions', () => {
    expect(bucketExpr('postgres', 'day', 'created_at')).toBe(
      "date_trunc('day', created_at)",
    );
    expect(bucketExpr('duckdb', 'month', 'created_at')).toBe(
      "date_trunc('month', created_at)",
    );
    expect(bucketExpr('json', 'hour', 'created_at')).toBe(
      "date_trunc('hour', created_at)",
    );
    expect(bucketExpr('sqlite', 'day', 'created_at')).toBe(
      "strftime('%Y-%m-%d 00:00:00', created_at)",
    );
    expect(bucketExpr('sqlite', 'week', 'created_at')).toBe(
      "date(created_at, printf('-%d days', (CAST(strftime('%w', created_at) AS INTEGER) + 6) % 7))",
    );
    expect(bucketExpr('sqlite', 'quarter', 'created_at')).toBe(
      "date(strftime('%Y-', created_at) || printf('%02d', ((CAST(strftime('%m', created_at) AS INTEGER) - 1) / 3) * 3 + 1) || '-01')",
    );
  });

  it('executes generated aggregate SQL against SQLite', async () => {
    const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
    await syncSchema({
      db,
      schema: `
        CREATE TABLE orders (
          id TEXT PRIMARY KEY,
          tenant_id TEXT,
          customer_id TEXT,
          status TEXT,
          total REAL,
          created_at TEXT,
          deleted_at TEXT
        )
      `,
    });
    await db.insert('orders', [
      {
        id: '1',
        [tenantId]: 'tenant-a',
        [customerId]: 'customer-a',
        status: 'paid',
        total: 10,
        [createdAt]: '2026-01-01T00:00:00.000Z',
        [deletedAt]: null,
      },
      {
        id: '2',
        [tenantId]: 'tenant-a',
        [customerId]: 'customer-a',
        status: 'paid',
        total: 30,
        [createdAt]: '2026-01-02T00:00:00.000Z',
        [deletedAt]: null,
      },
      {
        id: '3',
        [tenantId]: 'tenant-a',
        [customerId]: 'customer-b',
        status: 'paid',
        total: 5,
        [createdAt]: '2026-01-02T00:00:00.000Z',
        [deletedAt]: null,
      },
      {
        id: '4',
        [tenantId]: 'tenant-b',
        [customerId]: 'customer-a',
        status: 'paid',
        total: 100,
        [createdAt]: '2026-01-02T00:00:00.000Z',
        [deletedAt]: null,
      },
    ]);

    const aggregate = buildAggregate(
      {
        from: 'orders',
        select: [
          { column: 'customer_id' },
          { fn: 'sum', column: 'total', as: 'revenue' },
          { fn: 'avg', column: 'total', as: 'avg_total' },
        ],
        where: {
          [tenantId]: 'tenant-a',
          status: 'paid',
          [deletedAt]: null,
        },
        having: { 'revenue >': 20 },
        orderBy: 'revenue DESC',
      },
      1,
      'sqlite',
    );

    const result = await db.query(aggregate.sql, ...aggregate.values);
    expect(result.rows).toEqual([
      {
        [customerId]: 'customer-a',
        revenue: 40,
        [avgTotal]: 20,
      },
    ]);
  });

  it('rejects unsafe identifiers and invalid aggregate shapes', () => {
    expect(() =>
      buildAggregate({
        from: 'orders;drop',
        select: [{ fn: 'count', as: 'c' }],
      }),
    ).toThrow('Invalid SQL identifier');
    expect(() =>
      buildAggregate({ from: 'orders', select: [{ fn: 'sum', as: 'total' }] }),
    ).toThrow('Aggregate sum requires a column');
    expect(() =>
      buildAggregate({
        from: 'orders',
        select: [{ fn: 'count', as: 'count' }],
        orderBy: 'count SIDEWAYS',
      }),
    ).toThrow('Invalid aggregate order direction');
    expect(() =>
      buildAggregate({
        from: 'orders',
        select: [{ fn: 'count', as: 'count' }],
        having: { 'count in': [] },
      }),
    ).toThrow('requires at least one value');
  });
});
