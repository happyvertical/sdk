import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseInterface } from './index';
import { clearConnectionCache, getDatabase } from './index';

const fsMocks = vi.hoisted(() => ({
  stat: vi.fn<typeof import('node:fs/promises').stat>(),
}));

vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises',
    );
  fsMocks.stat.mockImplementation(actual.stat);
  return { ...actual, stat: fsMocks.stat };
});

describe('JSON adapter external source invalidation (Issue #515)', () => {
  let dataDir: string;
  let realStat: typeof import('node:fs/promises').stat;

  const writeRecords = (table: string, records: unknown[]) =>
    writeFile(join(dataDir, `${table}.json`), JSON.stringify(records));

  const open = () => getDatabase({ type: 'json' as const, url: dataDir });

  beforeEach(async () => {
    ({ stat: realStat } = await vi.importActual('node:fs/promises'));
    fsMocks.stat.mockImplementation(realStat);
    dataDir = await mkdtemp(join(tmpdir(), 'json-cache-invalidation-'));
  });

  afterEach(async () => {
    await clearConnectionCache();
    await rm(dataDir, { recursive: true, force: true });
  });

  it('reloads added and removed columns after an external file edit', async () => {
    await writeRecords('events', [{ id: 'event-1', name: 'First' }]);
    const initial = await open();
    expect(await initial.single`SELECT * FROM events`).toEqual({
      id: 'event-1',
      name: 'First',
    });

    await writeRecords('events', [
      {
        id: 'event-1',
        location_id: 'place-1',
        name: 'First',
        provider_id: 'provider-1',
      },
    ]);
    const expanded = await open();
    expect(expanded).not.toBe(initial);
    expect(
      await expanded.single`SELECT location_id, provider_id FROM events`,
    ).toEqual({ location_id: 'place-1', provider_id: 'provider-1' });

    await writeRecords('events', [{ id: 'event-1', name: 'First' }]);
    const contracted = await open();
    const columns = (await contracted.many`DESCRIBE events`).map(
      (column) => column.column_name,
    );

    expect(contracted).not.toBe(expanded);
    expect(columns).toEqual(['id', 'name']);
  });

  it('tracks JSON file additions and removals across acquisitions', async () => {
    await writeRecords('users', [{ id: 'user-1' }]);
    const initial = await open();
    expect(await initial.tableExists('users')).toBe(true);
    expect(await initial.tableExists('events')).toBe(false);

    await writeRecords('events', [{ id: 'event-1' }]);
    const withEvents = await open();
    expect(withEvents).not.toBe(initial);
    expect(await withEvents.tableExists('events')).toBe(true);

    await unlink(join(dataDir, 'users.json'));
    const withoutUsers = await open();
    expect(withoutUsers).not.toBe(withEvents);
    expect(await withoutUsers.tableExists('events')).toBe(true);
    expect(await withoutUsers.tableExists('users')).toBe(false);
  });

  it('reloads a companion schema file changed without touching its JSON data', async () => {
    await writeRecords('events', [{ id: 'event-1', name: 'First' }]);
    const schemaPath = join(dataDir, 'events.schema.sql');
    await writeFile(
      schemaPath,
      'CREATE TABLE events (id TEXT PRIMARY KEY, name TEXT);',
    );
    const initial = await open();
    expect(
      (await initial.many`DESCRIBE events`).map((column) => column.column_name),
    ).toEqual(['id', 'name']);

    await writeFile(
      schemaPath,
      'CREATE TABLE events (id TEXT PRIMARY KEY, name TEXT, note TEXT);',
    );
    const refreshed = await open();

    expect(refreshed).not.toBe(initial);
    expect(
      (await refreshed.many`DESCRIBE events`).map(
        (column) => column.column_name,
      ),
    ).toEqual(['id', 'name', 'note']);
  });

  it('coalesces concurrent stale acquisitions and closes the old adapter once', async () => {
    await writeRecords('events', [{ id: 'event-1', name: 'Before' }]);
    const initial = await open();
    const originalClose = initial.close?.bind(initial);
    const closeSpy = vi.fn(async () => originalClose?.());
    initial.close = closeSpy;

    await writeRecords('events', [
      { id: 'event-1', name: 'After', source: 'external' },
    ]);
    const replacements = await Promise.all([open(), open(), open(), open()]);

    expect(closeSpy).toHaveBeenCalledOnce();
    expect(replacements.every((db) => db === replacements[0])).toBe(true);
    expect(replacements[0]).not.toBe(initial);
    expect(await replacements[0].single`SELECT * FROM events`).toEqual({
      id: 'event-1',
      name: 'After',
      source: 'external',
    });
  });

  it('retries when a source changes after its first metadata snapshot', async () => {
    await writeRecords('events', [{ id: 'event-1', name: 'Before' }]);
    const initial = await open();
    let snapshotCaptured!: () => void;
    let releaseSnapshot!: () => void;
    const captured = new Promise<void>((resolve) => {
      snapshotCaptured = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    let intercepted = false;
    fsMocks.stat.mockImplementation(async (path, options) => {
      const info = await realStat(path, options);
      if (!intercepted && String(path).endsWith('events.json')) {
        intercepted = true;
        snapshotCaptured();
        await blocked;
      }
      return info;
    });

    const acquisition = open();
    await captured;
    await writeRecords('events', [
      { id: 'event-1', name: 'After', source: 'external' },
    ]);
    releaseSnapshot();
    const refreshed = await acquisition;

    expect(refreshed).not.toBe(initial);
    expect(await refreshed.single`SELECT * FROM events`).toEqual({
      id: 'event-1',
      name: 'After',
      source: 'external',
    });
  });

  it('does not invalidate itself after an immediate adapter write', async () => {
    await writeRecords('events', [{ id: 'event-1', name: 'First' }]);
    const initial: DatabaseInterface = await open();
    const originalClose = initial.close?.bind(initial);
    const closeSpy = vi.fn(async () => originalClose?.());
    initial.close = closeSpy;

    await initial.insert('events', { id: 'event-2', name: 'Second' });
    const reused = await open();

    expect(reused).toBe(initial);
    expect(closeSpy).not.toHaveBeenCalled();
    expect(await reused.count('events')).toBe(2);
  });

  it('does not overwrite an external edit with a stale adapter write', async () => {
    await writeRecords('events', [{ id: 'event-1', name: 'Initial' }]);
    const initial = await open();

    await writeRecords('events', [{ id: 'event-1', name: 'External' }]);
    await expect(
      initial.insert('events', { id: 'event-2', name: 'Stale write' }),
    ).rejects.toThrow('Failed to insert records into table');

    const refreshed = await open();
    expect(refreshed).not.toBe(initial);
    expect(await refreshed.many`SELECT * FROM events`).toEqual([
      { id: 'event-1', name: 'External' },
    ]);
  });

  it('preserves an unrelated external change made during an adapter export', async () => {
    await writeRecords('events', [{ id: 'event-1', name: 'Initial' }]);
    const initial = await open();
    const client = initial.client as {
      run: (sql: string, ...params: unknown[]) => Promise<unknown>;
    };
    const originalRun = client.run.bind(client);
    let exportStarted!: () => void;
    let releaseExport!: () => void;
    const started = new Promise<void>((resolve) => {
      exportStarted = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseExport = resolve;
    });
    client.run = async (sql, ...params) => {
      if (sql.startsWith('COPY')) {
        exportStarted();
        await blocked;
      }
      return originalRun(sql, ...params);
    };

    const adapterWrite = initial.insert('events', {
      id: 'event-2',
      name: 'Adapter',
    });
    await started;
    await writeRecords('external', [{ id: 'external-1' }]);
    const acquisition = open();
    releaseExport();

    await adapterWrite;
    const refreshed = await acquisition;
    expect(refreshed).not.toBe(initial);
    expect(await refreshed.tableExists('external')).toBe(true);
    expect(await refreshed.count('events')).toBe(2);
  });

  it('preserves cache identity when automatic file registration is disabled', async () => {
    const options = {
      autoRegister: false,
      type: 'json' as const,
      url: dataDir,
    };
    const initial = await getDatabase(options);

    await writeRecords('external', [{ id: 'external-1' }]);
    const reused = await getDatabase(options);

    expect(reused).toBe(initial);
    expect(await reused.tableExists('external')).toBe(false);
  });
});
