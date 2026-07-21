import { DatabaseError } from '@happyvertical/utils';
import { describe, expect, it } from 'vitest';
import { resolveInsertColumns } from './utils';

/**
 * Issue #1129 — unit coverage for the shared batch-insert column resolver.
 *
 * The adapter specs exercise this through real databases; these tests pin the
 * parts those cannot reach cheaply: the error type, the structured context the
 * changeset promises, and the message branch where a record is both missing a
 * key and carrying an extra one.
 */
describe('resolveInsertColumns', () => {
  it('returns the keys of the first record, in order', () => {
    expect(
      resolveInsertColumns('t', [
        { name: 'a', role: 'user' },
        { name: 'b', role: 'admin' },
      ]),
    ).toEqual(['name', 'role']);
  });

  it('accepts a later record whose keys are in a different order', () => {
    // Order is irrelevant because callers project through the returned list.
    expect(
      resolveInsertColumns('t', [
        { name: 'a', role: 'user' },
        { role: 'admin', name: 'b' },
      ]),
    ).toEqual(['name', 'role']);
  });

  it('throws a DatabaseError carrying the offending record and keys', () => {
    let caught: unknown;
    try {
      resolveInsertColumns('users', [
        { name: 'a', role: 'user' },
        { name: 'b', role: 'admin', nickname: 'bee' },
      ]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DatabaseError);
    const error = caught as DatabaseError & { context: Record<string, any> };
    expect(error.message).toContain('record 1');
    expect(error.message).toContain('unexpected nickname');
    expect(error.context).toMatchObject({
      table: 'users',
      recordIndex: 1,
      expectedKeys: ['name', 'role'],
      missing: [],
      extra: ['nickname'],
    });
  });

  it('reports missing and extra keys together', () => {
    expect(() =>
      resolveInsertColumns('t', [
        { name: 'a', role: 'user', note: 'n' },
        { name: 'b', note: 'n', nickname: 'bee' },
      ]),
    ).toThrow('record 1 has missing role and unexpected nickname');
  });

  it('names the columns record 0 established, since it defines them', () => {
    // Record 0 is the deviant one here, but it is still what the column list
    // comes from, so the message has to say where the expectation came from.
    expect(() =>
      resolveInsertColumns('t', [
        { name: 'a', note: 'n' },
        { name: 'b', role: 'user', note: 'n' },
      ]),
    ).toThrow('relative to record 0 (name, note)');
  });

  it('names the first offending record when several disagree', () => {
    expect(() =>
      resolveInsertColumns('t', [
        { name: 'a', role: 'user' },
        { name: 'b', role: 'admin' },
        { name: 'c' },
        { name: 'd', role: 'user', extra: 1 },
      ]),
    ).toThrow('record 2 has missing role');
  });

  describe('undefined values', () => {
    // Adapters that serialize records first drop undefined-valued keys before
    // they get here; the rest pass them through. The comparison has to ignore
    // them or the same batch throws on some adapters and silently writes NULL
    // on others.
    it('treats an undefined value as an absent key', () => {
      expect(() =>
        resolveInsertColumns('t', [
          { name: 'a', role: 'user' },
          { name: 'b', role: undefined },
        ]),
      ).toThrow('record 1 has missing role');
    });

    it('treats an undefined value in the first record as absent too', () => {
      expect(() =>
        resolveInsertColumns('t', [
          { name: 'a', role: undefined },
          { name: 'b', role: 'admin' },
        ]),
      ).toThrow('record 1 has unexpected role');
    });

    it('accepts a batch that omits the same key consistently', () => {
      // The column list itself is untouched, so each adapter keeps its own
      // handling of the undefined value it is handed.
      expect(
        resolveInsertColumns('t', [
          { name: 'a', role: undefined },
          { name: 'b', role: undefined },
        ]),
      ).toEqual(['name', 'role']);
    });

    it('does not confuse an explicit null with an absent key', () => {
      expect(
        resolveInsertColumns('t', [
          { name: 'a', role: null },
          { name: 'b', role: 'admin' },
        ]),
      ).toEqual(['name', 'role']);
    });
  });

  it('ignores inherited properties on both sides', () => {
    const base = { inherited: 'x' };
    const record = Object.create(base) as Record<string, any>;
    record.name = 'b';
    record.role = 'admin';

    expect(
      resolveInsertColumns('t', [{ name: 'a', role: 'user' }, record]),
    ).toEqual(['name', 'role']);
  });

  it('accepts a single-record batch unconditionally', () => {
    expect(resolveInsertColumns('t', [{ name: 'a', role: 'user' }])).toEqual([
      'name',
      'role',
    ]);
  });
});
