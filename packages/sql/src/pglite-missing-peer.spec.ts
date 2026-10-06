/**
 * When the optional `@electric-sql/pglite` peer is not installed, the pglite
 * database type fails with a typed error and an install hint.
 */

import { DatabaseError } from '@happyvertical/utils';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@electric-sql/pglite', () => {
  const error = new Error(
    "Cannot find package '@electric-sql/pglite' imported from pglite.js",
  ) as Error & { code?: string };
  error.code = 'ERR_MODULE_NOT_FOUND';
  throw error;
});

describe('missing @electric-sql/pglite peer', () => {
  it('throws PGlitePeerMissingError with an install hint', async () => {
    const { getDatabase } = await import('./index');
    const { PGlitePeerMissingError } = await import('./pglite');

    const error = await getDatabase({ type: 'pglite' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(PGlitePeerMissingError);
    expect(error).toBeInstanceOf(DatabaseError);
    expect((error as Error).name).toBe('PGlitePeerMissingError');
    expect((error as Error).message).toContain('pnpm add @electric-sql/pglite');
    expect((error as Error).cause).toBeDefined();
    expect((error as DatabaseError).context).toMatchObject({
      adapter: 'pglite',
      peer: '@electric-sql/pglite',
    });
  });

  it('does not affect other adapters', async () => {
    const { getDatabase } = await import('./index');
    const db = await getDatabase({ type: 'sqlite', url: ':memory:' });
    expect(db.client).toBeDefined();
    await db.close?.();
  });

  it('does not cache the failure', async () => {
    const { getDatabase } = await import('./index');
    const { PGlitePeerMissingError } = await import('./pglite');
    const options = { type: 'pglite' as const, dbid: 'missing-peer' };
    await expect(getDatabase(options)).rejects.toBeInstanceOf(
      PGlitePeerMissingError,
    );
    await expect(getDatabase(options)).rejects.toBeInstanceOf(
      PGlitePeerMissingError,
    );
  });
});
