import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { getDatabase } from './index';

it('retries a rolled-back busy transaction on an independent file connection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sql-independent-'));
  const url = join(directory, 'race.db');
  const first = await getDatabase({ type: 'sqlite', url, dbid: randomUUID() });
  const options = { type: 'sqlite' as const, url, dbid: randomUUID() };
  let second = await getDatabase(options);
  try {
    await first.query('CREATE TABLE grants (id TEXT PRIMARY KEY, value TEXT)');
    await first.query("INSERT INTO grants VALUES ('lock', 'initial')");
    const holder = await first.beginTransaction!();
    await holder.query("UPDATE grants SET value = 'winner' WHERE id = 'lock'");
    await expect(
      second.transaction!(async (tx) => {
        await tx.query("UPDATE grants SET value = 'loser' WHERE id = 'lock'");
        await tx.query("INSERT INTO grants VALUES ('leak', 'must rollback')");
      }),
    ).rejects.toThrow(/locked|BUSY/);
    await expect(second.query('SELECT 1')).rejects.toMatchObject({
      cause: { code: 'SQLITE_BUSY', connectionInvalidated: true },
    });
    const poisoned = second;
    second = await getDatabase(options);
    expect(second).not.toBe(poisoned);
    await holder.commit();
    await second.transaction!(async (tx) => {
      await tx.query("UPDATE grants SET value = 'retry' WHERE id = 'lock'");
      await tx.query("INSERT INTO grants VALUES ('child', 'committed')");
    });
    expect(
      (await first.query('SELECT * FROM grants ORDER BY id')).rows,
    ).toEqual([
      { id: 'child', value: 'committed' },
      { id: 'lock', value: 'retry' },
    ]);
  } finally {
    await first.close?.();
    await second.close?.();
    await rm(directory, { recursive: true, force: true });
  }
});
