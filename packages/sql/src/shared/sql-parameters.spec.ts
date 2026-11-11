import { describe, expect, it } from 'vitest';
import { rewriteSqlParameters } from './utils.js';

function capture(sql: string, dialect: 'postgres' | 'sqlite') {
  const tokens: Array<[string, number | undefined]> = [];
  const rendered = rewriteSqlParameters(sql, dialect, (token, index) => {
    tokens.push([token, index]);
    return index === undefined ? '$question' : `$number${index}`;
  });
  return { tokens, rendered };
}

describe('shared positional-parameter lexer', () => {
  for (const dialect of ['postgres', 'sqlite'] as const) {
    it(`${dialect} preserves doubled delimiters, literals, comments and identifier suffixes`, () => {
      const sql = `SELECT "cell$1", "cell?", "a""$9", '$8 ? ''$7', bare$6 FROM t /* $5 ? */ WHERE id=$2 -- $4 ?\n AND v=?`;
      const result = capture(sql, dialect);
      expect(result.tokens).toEqual([
        ['$2', 2],
        ['?', undefined],
      ]);
      expect(result.rendered).toBe(
        sql.replace('id=$2', 'id=$number2').replace('v=?', 'v=$question'),
      );
    });
  }
  it('PostgreSQL preserves dollar-quoted bodies and escaped literals while binding array subscripts', () => {
    const result = capture(
      `SELECT ARRAY[$1], $$ $8 ? $$, $body$ $9 ? $body$, E'\\'$7 ?' WHERE id=?`,
      'postgres',
    );
    expect(result.tokens).toEqual([
      ['$1', 1],
      ['?', undefined],
    ]);
  });
  it('SQLite preserves backtick and bracket identifiers', () => {
    expect(
      capture(
        'SELECT `cell$1`, `a``?`, [cell$2], [cell?] WHERE id=$3',
        'sqlite',
      ).tokens,
    ).toEqual([['$3', 3]]);
  });
  it('uses PostgreSQL nested comments and SQLite first-close semantics', () => {
    const sql = '/* outer /* inner */ $1 */ SELECT $2';
    expect(capture(sql, 'postgres').tokens).toEqual([['$2', 2]]);
    expect(capture(sql, 'sqlite').tokens).toEqual([
      ['$1', 1],
      ['$2', 2],
    ]);
  });
  it('retains PostgreSQL JSON question-mark operator decisions', () => {
    const result = capture('SELECT doc ?| $1, doc ?& $2, doc ? $3', 'postgres');
    expect(result.tokens).toEqual([
      ['$1', 1],
      ['$2', 2],
      ['?', undefined],
      ['$3', 3],
    ]);
    expect(result.rendered).toContain('doc ?| $number1');
    expect(result.rendered).toContain('doc ?& $number2');
  });
});
