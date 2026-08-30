import { DatabaseError } from '@happyvertical/utils';
import { describe, expect, it } from 'vitest';
import { getDatabase } from './index';
import { formatDbError, wrapDatabaseError } from './shared/utils';

function renderErrorSurfaces(error: DatabaseError): string {
  return [
    String(error),
    error.stack,
    JSON.stringify(error),
    String(error.cause),
    JSON.stringify(error.cause),
  ].join('\n');
}

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
    const dollarSecret = 'dollar-quoted-secret-issue-744';
    const jsonPassword = 'json-password-value-744';
    const jsonToken = 'json-token-value-744';
    const authToken = 'camel-auth-value-744';
    const clientSecret = 'client-value-744';
    const privateKey = 'private-key-value-744';
    const databasePassword = 'database-password-value-744';
    const signingKey = 'signing-key-value-744';
    const sql = `SELECT * FROM accounts WHERE token = $1 AND fallback = '${literalSecret}' AND payload = $issue744$${dollarSecret}$issue744$`;
    const driverError = Object.assign(
      new Error(
        `invalid input ${boundSecret}; password=${literalSecret}; statement ${sql}; connection postgresql://dbuser:${literalSecret}@db.example/app?token=${boundSecret}; options {"password":"${jsonPassword}","token":"${jsonToken}"}; privateKey=${privateKey}`,
      ),
      {
        code: '22023',
        detail: `Bearer ${boundSecret}; invalid literal ${dollarSecret}; authToken=${authToken}; dbPassword: ${databasePassword}`,
        hint: `Do not retry statement ${sql}; client_secret=${clientSecret}; signing_key="${signingKey}"`,
      },
    );

    const error = wrapDatabaseError(
      'Failed to execute raw query',
      driverError,
      {
        sql,
        values: [boundSecret],
        operation: 'query',
      },
    );
    const rendered = renderErrorSurfaces(error);

    expect(rendered).not.toContain(boundSecret);
    expect(rendered).not.toContain(literalSecret);
    expect(rendered).not.toContain(dollarSecret);
    expect(rendered).not.toContain(jsonPassword);
    expect(rendered).not.toContain(jsonToken);
    expect(rendered).not.toContain(authToken);
    expect(rendered).not.toContain(clientSecret);
    expect(rendered).not.toContain(privateKey);
    expect(rendered).not.toContain(databasePassword);
    expect(rendered).not.toContain(signingKey);
    expect(rendered).not.toContain(sql);
    expect(rendered).not.toContain('dbuser');
    expect(rendered).toContain('[redacted]');
    expect(error.context).toMatchObject({
      sql: '[redacted]',
      values: '[redacted]',
      operation: 'query',
    });

    const serialized = JSON.parse(JSON.stringify(error));
    expect(serialized.cause.message).not.toContain(boundSecret);
    expect(serialized.cause.message).not.toContain(literalSecret);
    expect(serialized.cause.message).not.toContain(dollarSecret);
    expect(serialized.cause.detail).not.toContain(boundSecret);
    expect(serialized.cause.detail).not.toContain(dollarSecret);
    expect(serialized.cause.hint).not.toContain(sql);
    expect(error.cause).not.toBe(driverError);
    expect(Object.getOwnPropertyDescriptor(error, 'cause')?.enumerable).toBe(
      false,
    );
  });

  it('sanitizes standalone formatted driver errors and non-Error values', () => {
    expect(
      formatDbError(
        new Error(
          'connection failed: libsql://user:secret@db.example?authToken=secret',
        ),
      ),
    ).not.toContain('secret');
    const credentialValues = [
      'json-password-value-744',
      'json-token-value-744',
      'camel-auth-value-744',
      'client-value-744',
      'private-key-value-744',
      'database-password-value-744',
      'signing-key-value-744',
      'short-password-value-744',
      'camel-pwd-value-744',
      'dotted-pwd-value-744',
      'database-user-value-744',
      'url-user-value-744',
      'camel-database-user-value-744',
      'snake-database-user-value-744',
    ];
    const formatted = formatDbError(
      new Error(
        `driver options {"password":"${credentialValues[0]}","token":"${credentialValues[1]}","pwd":"${credentialValues[7]}","username":"${credentialValues[10]}"}; authToken=${credentialValues[2]}; client_secret=${credentialValues[3]}; privateKey=${credentialValues[4]}; dbPassword: ${credentialValues[5]}; signing_key="${credentialValues[6]}"; dbPwd=${credentialValues[8]}; db.pwd=${credentialValues[9]}; dbUser=${credentialValues[12]}; database_username=${credentialValues[13]}; postgresql:///app?user=${credentialValues[11]}&password=${credentialValues[7]}`,
      ),
    );
    for (const credential of credentialValues) {
      expect(formatted).not.toContain(credential);
    }
    expect(formatted).toContain('[redacted]');
    expect(formatDbError('plain driver failure')).toBe('plain driver failure');
  });

  it('preserves actionable non-credential user diagnostics', () => {
    const error = wrapDatabaseError(
      'Failed to execute raw query',
      new Error('userId=42; currentUser=alice; superuserMode=false'),
      {
        userId: 42,
        currentUser: 'alice',
        superuserMode: false,
      },
    );

    expect(error.message).toContain(
      'userId=42; currentUser=alice; superuserMode=false',
    );
    expect(error.context).toMatchObject({
      userId: 42,
      currentUser: 'alice',
      superuserMode: false,
    });
  });

  it('redacts URL userinfo containing quote punctuation', () => {
    const username = 'db-user-issue-744';
    const password = `pa'ss"word-issue-744`;
    const error = wrapDatabaseError(
      'Failed to connect',
      new Error(
        `connection failed: postgresql://${username}:${password}@db.example/app`,
      ),
    );
    const rendered = renderErrorSurfaces(error);

    expect(rendered).not.toContain(username);
    expect(rendered).not.toContain(password);
    expect(rendered).toContain('postgresql://%5Bredacted%5D@db.example/app');
  });

  it('redacts normalized driver values without hiding diagnostic context', () => {
    const values = [
      true,
      new Date('2026-08-30T12:34:56.789Z'),
      Buffer.from([1, 2, 254, 255]),
      1e21,
      { token: 'normalized-json-secret-744', n: 424_242 },
    ];
    const driverError = Object.assign(
      new Error(
        "Conversion Error: Type INT32 with value 424242 can't be cast to INT8",
      ),
      {
        code: '23505',
        detail:
          'Key (payload)=({"token": "normalized-json-secret-744", "n": 424242}) already exists.',
      },
    );
    const error = wrapDatabaseError(
      'Failed to execute raw query',
      driverError,
      {
        sql: 'INSERT INTO issue_744_values VALUES ($1, $2, $3, $4, $5)',
        values,
      },
    );
    const rendered = renderErrorSurfaces(error);

    expect(rendered).not.toContain('with value 424242');
    expect(rendered).not.toContain('normalized-json-secret-744');
    expect(rendered).not.toContain('({"token":');
    expect(rendered).toContain('Conversion Error: Type INT32');
    expect(rendered).toContain("can't be cast to INT8");
    expect(rendered).toContain('Key (payload)=([redacted]) already exists');
  });

  it('redacts oversized bound values without compiling them as regexes', () => {
    const oversizedSecret = 'x'.repeat(100_000);
    const error = wrapDatabaseError(
      'Failed to execute raw query',
      new Error(`invalid input ${oversizedSecret}`),
      { values: [oversizedSecret] },
    );

    expect(error).toBeInstanceOf(DatabaseError);
    expect(error.message).toBe(
      'Failed to execute raw query: invalid input [redacted]',
    );
    expect(JSON.stringify(error)).not.toContain(oversizedSecret);
  });

  it('redacts numeric values echoed by a real DuckDB diagnostic', async () => {
    const numericSecret = 424_242;
    const db = await getDatabase({
      type: 'duckdb',
      url: ':memory:',
      autoRegisterJSON: false,
    });
    let caught: unknown;

    try {
      await db.query('SELECT CAST(? AS TINYINT) AS value', numericSecret);
    } catch (error) {
      caught = error;
    } finally {
      await db.close?.();
    }

    expect(caught).toBeInstanceOf(DatabaseError);
    const error = caught as DatabaseError;
    expect(renderErrorSurfaces(error)).not.toContain(String(numericSecret));
    expect(error.message).toContain('out of range');
    expect(error.context).toMatchObject({
      sql: '[redacted]',
      args: '[redacted]',
    });
  });

  it('redacts generated schema literals echoed by a real DuckDB diagnostic', async () => {
    const quotedSecret = 'alter-default-value-issue-744';
    const numericSecret = '424_242';
    const db = await getDatabase({
      type: 'duckdb',
      url: ':memory:',
      autoRegisterJSON: false,
    });
    let caught: unknown;

    try {
      await db.query('CREATE TABLE issue_744_alter (id INTEGER)');
      await db.alterTable?.addColumn('issue_744_alter', {
        name: 'payload',
        type: 'INTEGER',
        defaultValue: numericSecret,
        check: `payload > ${numericSecret} AND '${quotedSecret}' = '${quotedSecret}' BROKEN`,
      });
    } catch (error) {
      caught = error;
    } finally {
      await db.close?.();
    }

    expect(caught).toBeInstanceOf(DatabaseError);
    const error = caught as DatabaseError;
    const rendered = renderErrorSurfaces(error);
    expect(rendered).not.toContain(quotedSecret);
    expect(rendered).not.toContain(numericSecret);
    expect(error.message).toContain('Parser Error');
    expect(error.context?.sql).toBe('[redacted]');
  });

  it('redacts normalized schema values in a real DuckDB diagnostic', async () => {
    const numericSecret = '424_242';
    const normalizedSecret = '424242';
    const db = await getDatabase({
      type: 'duckdb',
      url: ':memory:',
      autoRegisterJSON: false,
    });
    let caught: unknown;

    try {
      await db.query('CREATE TABLE issue_744_normalized (id INTEGER)');
      await db.query('INSERT INTO issue_744_normalized VALUES (1)');
      await db.alterTable?.addColumn('issue_744_normalized', {
        name: 'payload',
        type: 'TINYINT',
        defaultValue: `CAST(${numericSecret} AS TINYINT)`,
      });
    } catch (error) {
      caught = error;
    } finally {
      await db.close?.();
    }

    expect(caught).toBeInstanceOf(DatabaseError);
    const error = caught as DatabaseError;
    const rendered = renderErrorSurfaces(error);
    expect(rendered).not.toContain(numericSecret);
    expect(rendered).not.toContain(`with value ${normalizedSecret}`);
    expect(error.message).toContain('Conversion Error: Type INT32');
    expect(error.message).toContain("can't be cast");
    expect(error.context?.sql).toBe('[redacted]');
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
