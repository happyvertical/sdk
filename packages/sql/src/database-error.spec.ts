import { DatabaseError } from '@happyvertical/utils';
import { describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import { formatDbError, wrapDatabaseError } from './shared/utils';

describe('database error diagnostics', () => {
  it('preserves useful driver details in message, cause, and JSON', () => {
    const driverError = Object.assign(
      new Error('column "meetings" cannot be cast to type jsonb'),
      {
        code: '42846',
        detail: 'Dependent index prevents the cast',
        hint: 'Drop the dependent index first',
        severity: 'ERROR',
      },
    );

    const error = wrapDatabaseError(
      'Failed to add column to table',
      driverError,
      {
        table: 'meetings',
        column: 'metadata',
      },
    );

    expect(error).toBeInstanceOf(DatabaseError);
    expect(error.message).toContain(
      'Failed to add column to table: column "meetings" cannot be cast to type jsonb',
    );
    expect(error.message).toContain('code=42846');
    expect(error.context?.originalError).toContain(
      'Dependent index prevents the cast',
    );
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.cause).not.toBe(driverError);
    expect((error.cause as Error).message).toContain('cannot be cast');
    expect((error.cause as Error & { code?: string }).code).toBe('42846');
    expect(JSON.parse(JSON.stringify(error))).toMatchObject({
      cause: {
        code: '42846',
        detail: 'Dependent index prevents the cast',
        hint: 'Drop the dependent index first',
        severity: 'ERROR',
      },
    });
  });

  it('redacts statements, values, credentials, and credential-shaped driver text', () => {
    const boundSecret = 'customer-token-issue-744';
    const literalSecret = 'literal-password-issue-744';
    const driverError = Object.assign(
      new Error(
        `invalid input ${boundSecret}; password=${literalSecret}; connection postgresql://dbuser:${literalSecret}@db.example/app?token=${boundSecret}`,
      ),
      {
        code: '22023',
        detail: `Bearer ${boundSecret}`,
      },
    );

    const error = wrapDatabaseError(
      'Failed to execute raw query',
      driverError,
      {
        sql: `SELECT * FROM accounts WHERE token = $1 AND fallback = '${literalSecret}'`,
        values: [boundSecret],
        operation: 'query',
      },
    );
    const rendered = [
      String(error),
      error.stack,
      JSON.stringify(error),
      String(error.cause),
      JSON.stringify(error.cause),
    ].join('\n');

    expect(rendered).not.toContain(boundSecret);
    expect(rendered).not.toContain(literalSecret);
    expect(rendered).not.toContain('dbuser');
    expect(rendered).toContain('[redacted]');
    expect(error.context).toMatchObject({
      sql: '[redacted]',
      values: '[redacted]',
      operation: 'query',
    });
  });

  it('sanitizes standalone formatted driver errors and non-Error values', () => {
    expect(
      formatDbError(
        new Error(
          'connection failed: libsql://user:secret@db.example?authToken=secret',
        ),
      ),
    ).not.toContain('secret');
    expect(formatDbError('plain driver failure')).toBe('plain driver failure');
  });

  describe.each([
    {
      name: 'SQLite',
      open: () =>
        getDatabase({ type: 'sqlite' as const, url: ':memory:', cache: false }),
    },
    {
      name: 'DuckDB',
      open: () =>
        getDatabase({
          type: 'duckdb' as const,
          url: ':memory:',
          autoRegisterJSON: false,
        }),
    },
    {
      name: 'JSON',
      open: () =>
        getDatabase({ type: 'json' as const, url: ':memory:', cache: false }),
    },
  ])('$name adapter', ({ open }) => {
    it('surfaces a safe cause for raw query failures', async () => {
      const secret = 'bound-secret-issue-744';
      const db = await open();
      let caught: unknown;

      try {
        await db.query(
          'SELECT * FROM missing_issue_744_table WHERE token = ?',
          secret,
        );
      } catch (error) {
        caught = error;
      } finally {
        await db.close?.();
      }

      expect(caught).toBeInstanceOf(DatabaseError);
      const error = caught as DatabaseError;
      expect(error.message).toMatch(/^Failed to execute raw query: .+/u);
      expect(error.cause).toBeInstanceOf(Error);
      expect(error.context?.sql).toBe('[redacted]');
      expect(JSON.stringify(error)).not.toContain(secret);
      expect(JSON.stringify(error)).toContain('missing_issue_744_table');
    });
  });
});
