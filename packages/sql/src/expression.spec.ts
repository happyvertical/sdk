// biome-ignore-all lint/suspicious/noThenProperty: CASE nodes are closed data, not thenable functions.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AggregateOperand } from './aggregate-expression.js';
import { ExpressionError, renderExpression } from './aggregate-expression.js';
import { buildAggregate, getDatabase } from './index.js';
import type { DatabaseInterface } from './shared/types.js';

const v = (value: number | string | boolean | null): AggregateOperand => ({
  value,
});
const date = (
  iso: string,
  kind: 'date' | 'datetime' = 'date',
): AggregateOperand => ({ value: { kind, iso } });
const unary = (
  op:
    | 'abs'
    | 'floor'
    | 'ceil'
    | 'lower'
    | 'upper'
    | 'trim'
    | 'length'
    | 'year'
    | 'month'
    | 'day',
  value: AggregateOperand,
): AggregateOperand => ({ op, value });
const start = date('2024-02-28');
const end = date('2024-03-01');
const cases: {
  name: string;
  node: AggregateOperand;
  expected: unknown;
  type: string;
}[] = [
  {
    name: 'case ordered',
    node: {
      op: 'case',
      branches: [
        { when: v(false), then: v(1) },
        { when: v(true), then: v(2) },
        { when: v(true), then: v(3) },
      ],
      else: v(4),
    },
    expected: 2,
    type: 'number',
  },
  {
    name: 'case NULL goes to else',
    node: { op: 'case', branches: [{ when: v(null), then: v(1) }], else: v(4) },
    expected: 4,
    type: 'number',
  },
  {
    name: 'if true',
    node: { op: 'if', condition: v(true), then: v('yes'), else: v('no') },
    expected: 'yes',
    type: 'text',
  },
  {
    name: 'if NULL',
    node: { op: 'if', condition: v(null), then: v('yes'), else: v(null) },
    expected: null,
    type: 'text',
  },
  ...[2.5, -2.5, 1.5, -1.5].map((n) => ({
    name: `round ${n}`,
    node: { op: 'round', value: v(n), digits: v(0) } as AggregateOperand,
    expected: n > 0 ? Math.ceil(n) : Math.floor(n),
    type: 'number',
  })),
  {
    name: 'round fractional',
    node: { op: 'round', value: v(-1.25), digits: v(1) },
    expected: -1.3,
    type: 'number',
  },
  {
    name: 'round negative digits',
    node: { op: 'round', value: v(-150), digits: v(-2) },
    expected: -200,
    type: 'number',
  },
  { name: 'abs', node: unary('abs', v(-2.5)), expected: 2.5, type: 'number' },
  {
    name: 'floor large finite',
    node: unary('floor', v(1e20)),
    expected: 1e20,
    type: 'number',
  },
  {
    name: 'ceil large finite',
    node: unary('ceil', v(-1e20)),
    expected: -1e20,
    type: 'number',
  },
  {
    name: 'floor',
    node: unary('floor', v(-2.5)),
    expected: -3,
    type: 'number',
  },
  { name: 'ceil', node: unary('ceil', v(-2.5)), expected: -2, type: 'number' },
  {
    name: 'least',
    node: { op: 'least', operands: [v(-3), v(2), v(1)] },
    expected: -3,
    type: 'number',
  },
  {
    name: 'greatest',
    node: { op: 'greatest', operands: [v(-3), v(2), v(1)] },
    expected: 2,
    type: 'number',
  },
  {
    name: 'mod fractional negative',
    node: { op: 'mod', left: v(-5.5), right: v(2) },
    expected: -1.5,
    type: 'number',
  },
  {
    name: 'mod negative divisor',
    node: { op: 'mod', left: v(5.5), right: v(-2) },
    expected: 1.5,
    type: 'number',
  },
  {
    name: 'mod zero',
    node: { op: 'mod', left: v(5.5), right: v(0) },
    expected: null,
    type: 'number',
  },
  {
    name: 'div zero',
    node: { op: 'div', left: v(5), right: v(0) },
    expected: null,
    type: 'number',
  },
  {
    name: 'concat hostile',
    node: { op: 'concat', operands: [v("O'Reilly; --"), v(' 🌍')] },
    expected: "O'Reilly; -- 🌍",
    type: 'text',
  },
  {
    name: 'lower ASCII and unicode',
    node: unary('lower', v('AZÄİΣ🌍')),
    expected: 'azÄİΣ🌍',
    type: 'text',
  },
  {
    name: 'upper ASCII and unicode',
    node: unary('upper', v('azäıß🌍')),
    expected: 'AZäıß🌍',
    type: 'text',
  },
  {
    name: 'trim spaces only',
    node: unary('trim', v(' \t hi \t ')),
    expected: '\t hi \t',
    type: 'text',
  },
  {
    name: 'length codepoints',
    node: unary('length', v('a🌍é')),
    expected: 3,
    type: 'number',
  },
  {
    name: 'substring unicode',
    node: { op: 'substring', value: v('a🌍bc'), start: v(2), length: v(2) },
    expected: '🌍b',
    type: 'text',
  },
  {
    name: 'substring empty',
    node: { op: 'substring', value: v('abc'), start: v(1), length: v(0) },
    expected: '',
    type: 'text',
  },
  {
    name: 'substring beyond end',
    node: { op: 'substring', value: v('abc'), start: v(8), length: v(2) },
    expected: '',
    type: 'text',
  },
  {
    name: 'year boundary',
    node: unary('year', date('2023-12-31')),
    expected: 2023,
    type: 'number',
  },
  {
    name: 'month leap',
    node: unary('month', date('2024-02-29')),
    expected: 2,
    type: 'number',
  },
  {
    name: 'day leap',
    node: unary('day', date('2024-02-29')),
    expected: 29,
    type: 'number',
  },
  {
    name: 'UTC canonicalization',
    node: unary('year', date('2024-01-01T00:30:00+02:00', 'datetime')),
    expected: 2023,
    type: 'number',
  },
  {
    name: 'daysBetween leap',
    node: { op: 'daysBetween', later: end, earlier: start },
    expected: 2,
    type: 'number',
  },
  {
    name: 'daysBetween signed',
    node: { op: 'daysBetween', later: start, earlier: end },
    expected: -2,
    type: 'number',
  },
  {
    name: 'daysBetween calendar dates',
    node: {
      op: 'daysBetween',
      later: date('2024-03-01T00:01:00Z', 'datetime'),
      earlier: date('2024-02-29T23:59:00Z', 'datetime'),
    },
    expected: 1,
    type: 'number',
  },
  {
    name: 'secondsBetween typed dates',
    node: { op: 'secondsBetween', later: end, earlier: start },
    expected: 172800,
    type: 'number',
  },
  {
    name: 'nested date',
    node: unary('year', {
      op: 'addDays',
      value: date('2023-12-31'),
      days: v(1),
    }),
    expected: 2024,
    type: 'number',
  },
  {
    name: 'addDays leap',
    node: { op: 'addDays', value: start, days: v(2) },
    expected: '2024-03-01',
    type: 'date',
  },
  {
    name: 'addDays negative year boundary',
    node: { op: 'addDays', value: date('2024-01-01'), days: v(-1) },
    expected: '2023-12-31',
    type: 'date',
  },
];
cases.push({
  name: 'least fractional',
  node: { op: 'least', operands: [v(2.5), v(3.5)] },
  expected: 2.5,
  type: 'number',
});
for (const [iso, days] of [
  ['9999-12-31', 1],
  ['0001-01-01', -1],
] as const) {
  const node: AggregateOperand = {
    op: 'addDays',
    value: date(iso),
    days: v(days),
  };
  cases.push({
    name: `addDays outside calendar ${iso}`,
    node,
    expected: null,
    type: 'date',
  });
  cases.push({
    name: `nested year outside calendar ${iso}`,
    node: unary('year', node),
    expected: null,
    type: 'number',
  });
}
for (const iso of ['0001-01-01', '9999-12-31']) {
  cases.push({
    name: `addDays calendar endpoint ${iso}`,
    node: { op: 'addDays', value: date(iso), days: v(0) },
    expected: iso,
    type: 'date',
  });
}
for (const op of [
  'abs',
  'floor',
  'ceil',
  'lower',
  'upper',
  'trim',
  'length',
  'year',
  'month',
  'day',
] as const) {
  cases.push({
    name: `${op} NULL`,
    node: unary(op, v(null)),
    expected: null,
    type: ['lower', 'upper', 'trim'].includes(op) ? 'text' : 'number',
  });
}
for (const node of [
  { op: 'round', value: v(null), digits: v(2) },
  { op: 'round', value: v(3), digits: v(null) },
  { op: 'least', operands: [v(1), v(null)] },
  { op: 'greatest', operands: [v(null), v(1)] },
  { op: 'mod', left: v(null), right: v(3) },
  { op: 'mod', left: v(3), right: v(null) },
  { op: 'concat', operands: [v('x'), v(null)] },
  { op: 'substring', value: v(null), start: v(1), length: v(2) },
  { op: 'substring', value: v('abc'), start: v(null), length: v(2) },
  { op: 'substring', value: v('abc'), start: v(1), length: v(null) },
  { op: 'daysBetween', later: v(null), earlier: end },
  { op: 'daysBetween', later: end, earlier: v(null) },
  { op: 'addDays', value: v(null), days: v(2) },
  { op: 'addDays', value: end, days: v(null) },
] as AggregateOperand[]) {
  cases.push({
    name: `${'op' in node ? node.op : 'literal'} NULL ${cases.length}`,
    node,
    expected: null,
    type:
      'op' in node && ['concat', 'substring'].includes(node.op)
        ? 'text'
        : 'op' in node && node.op === 'addDays'
          ? 'date'
          : 'number',
  });
}

for (const dialect of ['sqlite', 'postgres', 'duckdb'] as const) {
  describe(`portable expressions: ${dialect}`, () => {
    let db: DatabaseInterface;
    beforeAll(async () => {
      db = await getDatabase(
        dialect === 'postgres'
          ? { type: 'pglite' }
          : { type: dialect, url: ':memory:' },
      );
    });
    afterAll(async () => {
      await db.close?.();
    });
    const query = async (node: AggregateOperand, mode: 'query' | 'ddl') => {
      const built = renderExpression(node, { dialect, mode });
      const rows = (
        await db.query(`SELECT ${built.sql} AS result`, ...built.values)
      ).rows;
      return rows[0].result;
    };
    it.each(cases)('$name', async ({ node, expected, type }) => {
      for (const mode of ['query', 'ddl'] as const) {
        const built = renderExpression(JSON.parse(JSON.stringify(node)), {
          dialect,
          mode,
        });
        expect(built.resultType).toBe(type);
        expect(built.immutable).toEqual({
          sqlite: true,
          postgres: true,
          duckdb: true,
        });
        const result = await query(node, mode);
        if (typeof expected === 'number')
          expect(Number(result)).toBeCloseTo(expected, 8);
        else expect(result).toBe(expected);
      }
    });
    it('executes every immutable new node in generated columns and indexes', async () => {
      // Use each non-NULL example, so database validators see real operand
      // types and generated values, rather than constant-NULL simplification.
      const examples = cases.filter(
        (c) => c.expected !== null || c.name.includes('outside calendar'),
      );
      for (const [i, c] of examples.entries()) {
        const built = renderExpression(c.node, { dialect, mode: 'ddl' });
        const type = c.type === 'number' ? 'DOUBLE PRECISION' : 'TEXT';
        const table = `generated_${i}`;
        try {
          await db.query(
            `CREATE TABLE ${table} (seed INTEGER, result ${type} GENERATED ALWAYS AS (${built.sql}) ${dialect === 'duckdb' ? 'VIRTUAL' : 'STORED'})`,
          );
        } catch (error) {
          throw new Error(`Generated ${c.name}: ${String(error)}`);
        }
        await db.query(`INSERT INTO ${table} (seed) VALUES (1)`);
        const result = (await db.query(`SELECT result FROM ${table}`)).rows[0]
          .result;
        if (typeof c.expected === 'number')
          expect(Number(result)).toBeCloseTo(c.expected, 8);
        else expect(result).toBe(c.expected);
        if (dialect === 'duckdb') {
          // DuckDB disallows indexes that reference generated columns, and
          // expression indexes must reference a base column (no constants).
          await expect(
            db.query(`CREATE INDEX idx_${i} ON ${table} (result)`),
          ).rejects.toThrow(/generated column|does not refer to any columns/);
        } else {
          await db.query(`CREATE INDEX idx_${i} ON ${table} ((${built.sql}))`);
        }
      }
    });
    it('quotes hostile identifiers and strings in query and generated DDL', async () => {
      const hostile = 'evil"; DROP TABLE precious; --';
      await db.query('CREATE TABLE precious (id INTEGER)');
      await db.query(
        `CREATE TABLE hostile ("${hostile.replace(/"/g, '""')}" TEXT)`,
      );
      await db.query(`INSERT INTO hostile VALUES ($1)`, "Bob's ; --");
      const node: AggregateOperand = {
        op: 'concat',
        operands: [{ col: 'logical' }, v("' --")],
      };
      for (const mode of ['query', 'ddl'] as const) {
        const built = renderExpression(node, {
          dialect,
          mode,
          resolveColumn: () => hostile,
        });
        expect(
          (
            await db.query(
              `SELECT ${built.sql} AS result FROM hostile`,
              ...built.values,
            )
          ).rows[0].result,
        ).toBe("Bob's ; --' --");
      }
      const generated = renderExpression(node, {
        dialect,
        mode: 'ddl',
        resolveColumn: () => hostile,
      });
      await db.query(
        `CREATE TABLE hostile_generated ("${hostile.replace(/"/g, '""')}" TEXT, result TEXT GENERATED ALWAYS AS (${generated.sql}) ${dialect === 'duckdb' ? 'VIRTUAL' : 'STORED'})`,
      );
      await db.query(
        `INSERT INTO hostile_generated ("${hostile.replace(/"/g, '""')}") VALUES ($1)`,
        "Bob's ; --",
      );
      expect(
        (await db.query('SELECT result FROM hostile_generated')).rows[0].result,
      ).toBe("Bob's ; --' --");
      expect(
        (await db.query('SELECT COUNT(*) AS n FROM precious')).rows[0].n,
      ).toBeDefined();
    });
    it('escapes backslash quotes even with PostgreSQL standard strings disabled', async () => {
      if (dialect === 'postgres')
        await db.query('SET standard_conforming_strings=off');
      try {
        expect(await query(v("back\\'slash; --"), 'ddl')).toBe(
          "back\\'slash; --",
        );
      } finally {
        if (dialect === 'postgres')
          await db.query('SET standard_conforming_strings=on');
      }
    });
    it('typed UTC dates ignore PostgreSQL timezone and date formatting settings', async () => {
      if (dialect === 'postgres') {
        await db.query("SET TimeZone = 'Pacific/Honolulu'");
        await db.query("SET DateStyle = 'SQL, DMY'");
      }
      try {
        expect(
          Number(
            await query(
              unary('year', date('2024-01-01T00:30:00+02:00', 'datetime')),
              'ddl',
            ),
          ),
        ).toBe(2023);
        expect(
          await query(
            { op: 'addDays', value: date('2023-12-31'), days: v(1) },
            'ddl',
          ),
        ).toBe('2024-01-01');
      } finally {
        if (dialect === 'postgres') {
          await db.query("SET TimeZone = 'UTC'");
          await db.query("SET DateStyle = 'ISO, MDY'");
        }
      }
    });
    it('dynamic integer arguments normalize bounds consistently', async () => {
      const nodes: AggregateOperand[] = [
        { op: 'round', value: v(-1.25), digits: { col: 'n' } },
        {
          op: 'substring',
          value: v('abcd'),
          start: { col: 'n' },
          length: v(2),
        },
        { op: 'addDays', value: start, days: { col: 'n' } },
      ];
      for (const n of [1, 1.5, 1e30, null]) {
        for (const [i, node] of nodes.entries()) {
          const built = renderExpression(node, { dialect, mode: 'query' });
          const sql = `SELECT ${built.sql} AS result FROM (SELECT CAST(${n === null ? 'NULL' : String(n)} AS DOUBLE PRECISION) AS n) inputs`;
          const result = (await db.query(sql, ...built.values)).rows[0].result;
          const expected = n === 1 ? [-1.3, 'ab', '2024-02-29'][i] : null;
          if (typeof expected === 'number')
            expect(Number(result)).toBeCloseTo(expected, 8);
          else expect(result).toBe(expected);
        }
      }
    });
    it('date columns require explicit timezone-free metadata in generated use', async () => {
      const node = unary('year', { col: 'occurred' });
      expect(() =>
        renderExpression(node, { dialect, mode: 'ddl' }),
      ).toThrowError(expect.objectContaining({ code: 'NON_IMMUTABLE' }));
      const type = dialect === 'sqlite' ? 'TEXT' : 'TIMESTAMP';
      const built = renderExpression(node, {
        dialect,
        mode: 'ddl',
        resolveColumn: (name) => ({ name, type: 'datetime' }),
      });
      await db.query(
        `CREATE TABLE temporal (occurred ${type}, year INTEGER GENERATED ALWAYS AS (${built.sql}) ${dialect === 'duckdb' ? 'VIRTUAL' : 'STORED'})`,
      );
      await db.query(
        "INSERT INTO temporal (occurred) VALUES ('2024-12-31 23:59:59')",
      );
      expect(
        Number((await db.query('SELECT year FROM temporal')).rows[0].year),
      ).toBe(2024);
      if (dialect !== 'duckdb')
        await db.query(
          `CREATE INDEX temporal_idx ON temporal ((${built.sql}))`,
        );
    });
    it('the aggregate builder uses the same new-node renderer', async () => {
      await db.query('CREATE TABLE aggregates (n DOUBLE PRECISION)');
      await db.query('INSERT INTO aggregates VALUES (-1.25)');
      const node: AggregateOperand = {
        op: 'round',
        value: { col: 'n' },
        digits: v(1),
      };
      const built = buildAggregate(
        {
          from: 'aggregates',
          select: [{ fn: 'sum', expr: node, as: 'result' }],
        },
        1,
        dialect,
      );
      expect(
        Number((await db.query(built.sql, ...built.values)).rows[0].result),
      ).toBeCloseTo(-1.3, 8);
    });
  });
}

describe('expression validation', () => {
  const render = (node: unknown) =>
    renderExpression(node as AggregateOperand, {
      dialect: 'postgres',
      mode: 'ddl',
    });
  it.each([
    '2023-02-29',
    '1900-02-29',
    '2024-02-30',
    '2024-04-31',
    '0000-01-01',
    '2024-13-01',
    '2024-01-00',
    '2024-01-01T00:00:00Z',
  ])('rejects invalid date %s', (iso) => {
    expect(() => render(date(iso))).toThrowError(
      expect.objectContaining({ code: 'INVALID_EXPRESSION' }),
    );
  });
  it.each([
    '2023-02-29T00:00:00Z',
    '2024-01-01T24:00:00Z',
    '2024-01-01T00:00:00',
    '2024-01-01T00:00:60Z',
  ])('rejects invalid datetime %s', (iso) => {
    expect(() => render(date(iso, 'datetime'))).toThrowError(
      expect.objectContaining({ code: 'INVALID_EXPRESSION' }),
    );
  });
  it('accepts the Gregorian leap century and canonicalizes UTC', () => {
    expect(render(date('2000-02-29')).sql).toContain('2000-02-29');
    expect(render(date('2024-01-01T00:30:00+02:00', 'datetime')).sql).toContain(
      '2023-12-31 22:30:00.000',
    );
  });
  it.each([
    { op: 'unknown' },
    { op: 'unknown', value: 1 },
    { col: 'x', op: 'abs', value: v(1) },
    { op: 'abs', value: v(2), unknown: true },
    { op: 'least', operands: [v(1)] },
    { op: 'concat', operands: [] },
    { op: 'case', branches: [], else: v(1) },
    { op: 'round', value: v(1), digits: v(13) },
    { op: 'round', value: v(1), digits: v(1.5) },
    { op: 'substring', value: v('x'), start: v(0), length: v(2) },
    { op: 'substring', value: v('x'), start: v(1), length: v(-1) },
    { value: Infinity },
    { value: { kind: 'date', iso: '2024-01-01', extra: 'no' } },
    { value: 'bad\0string' },
  ])('rejects malformed nodes %#', (node) => {
    expect(() => render(node)).toThrowError(ExpressionError);
  });
  it('marks legacy Date nonimmutable but preserves query typing', () => {
    const node = { value: new Date('2024-01-01T00:00:00Z') };
    const built = renderExpression(node, {
      dialect: 'postgres',
      mode: 'query',
    });
    expect(built.sql).toBe('CAST($1 AS TIMESTAMPTZ)');
    expect(built.immutable).toEqual({
      sqlite: false,
      postgres: false,
      duckdb: false,
    });
    expect(() => render(node)).toThrowError(
      expect.objectContaining({ code: 'NON_IMMUTABLE' }),
    );
  });
  it('rejects session-dependent asText casts in generated use', () => {
    expect(() =>
      render({ op: 'asText', operand: date('2024-01-01') }),
    ).toThrowError(expect.objectContaining({ code: 'NON_IMMUTABLE' }));
    expect(() =>
      render({ op: 'asText', operand: { col: 'unknown' } }),
    ).toThrowError(expect.objectContaining({ code: 'NON_IMMUTABLE' }));
  });
  it('bounds type analysis for cyclic temporal operands', () => {
    const cyclic: AggregateOperand = { op: 'coalesce', operands: [] };
    cyclic.operands.push(cyclic);
    expect(() =>
      render({ op: 'addDays', value: cyclic, days: v(1) }),
    ).toThrowError(expect.objectContaining({ code: 'EXPRESSION_LIMIT' }));
  });
  it('rejects adversarial SQL expansion before exponential allocation', () => {
    let node: AggregateOperand = v(1);
    for (let i = 0; i < 20; i++)
      node = { op: 'round', value: v(3), digits: node };
    expect(() => render(node)).toThrowError(
      expect.objectContaining({ code: 'EXPRESSION_LIMIT' }),
    );
  });
  it('rejects excessive depth and node count with coded limits', () => {
    let deep: AggregateOperand = v(1);
    for (let i = 0; i < 26; i++) deep = { op: 'abs', value: deep };
    expect(() => render(deep)).toThrowError(
      expect.objectContaining({ code: 'EXPRESSION_LIMIT' }),
    );
    expect(() =>
      render({
        op: 'concat',
        operands: Array.from({ length: 1024 }, () => v('a')),
      }),
    ).toThrowError(expect.objectContaining({ code: 'EXPRESSION_LIMIT' }));
  });
});
