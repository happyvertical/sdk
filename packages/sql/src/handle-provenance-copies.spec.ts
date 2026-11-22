import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Two copies of this package in one process (sdk#1249). Records live in one
 * versioned slot on `globalThis`, so a handle made by one copy is described
 * the same way by another, and anything that cannot use that slot fails
 * closed: its own objects become unknown to every other copy, never roots.
 */

async function freshCopy() {
  vi.resetModules();
  return import('./index');
}

async function freshProvenanceModule() {
  vi.resetModules();
  return import('./shared/handle-provenance');
}

afterEach(() => {
  vi.resetModules();
});

describe('handle provenance across SDK copies', () => {
  it('describes another copy’s root and transaction handles identically', async () => {
    const a = await freshCopy();
    const b = await freshCopy();
    expect(a.describeHandle).not.toBe(b.describeHandle);

    const db = await a.getDatabase({
      type: 'sqlite',
      url: ':memory:',
      cache: false,
    });
    try {
      expect(b.describeHandle(db)).toEqual(a.describeHandle(db));
      expect(b.isDatabaseRoot(db)).toBe(true);
      await db.transaction?.(async (tx) => {
        expect(b.describeHandle(tx)).toEqual(a.describeHandle(tx));
        expect(b.describeHandle(tx)).toMatchObject({
          role: 'transaction',
          transactionKind: 'callback',
          owner: a.describeHandle(db).owner,
        });
        expect(b.isDatabaseRoot(tx)).toBe(false);
      });
    } finally {
      await db.close?.();
    }
  });

  it('treats an object no copy recorded (an older copy’s root) as unknown', async () => {
    const b = await freshCopy();
    const olderRoot = {
      url: ':memory:',
      client: {},
      query: async () => ({ rows: [] }),
      transaction: async () => undefined,
      beginTransaction: async () => undefined,
      close: async () => undefined,
    };
    expect(b.describeHandle(olderRoot)).toEqual({ role: 'unknown' });
    expect(b.isDatabaseRoot(olderRoot)).toBe(false);
  });

  it('defines the registry slot once, non-writable and non-configurable, and reuses it', async () => {
    const { acquireProvenanceRegistry, PROVENANCE_REGISTRY_KEY } =
      await freshProvenanceModule();
    const host: Record<PropertyKey, unknown> = {};
    const first = acquireProvenanceRegistry(host);
    const second = acquireProvenanceRegistry(host);
    // The second acquisition validates the occupant and shares its map.
    expect(second.records).toBe(first.records);
    expect(
      Object.getOwnPropertyDescriptor(host, PROVENANCE_REGISTRY_KEY),
    ).toMatchObject({
      enumerable: false,
      writable: false,
      configurable: false,
    });
    expect(Object.isFrozen(host[PROVENANCE_REGISTRY_KEY])).toBe(true);
    expect(PROVENANCE_REGISTRY_KEY).toBe(
      Symbol.for('@happyvertical/sql/handle-provenance:v2'),
    );
  });

  it('falls back to a private registry when the slot holds anything else', async () => {
    const { acquireProvenanceRegistry, PROVENANCE_REGISTRY_KEY } =
      await freshProvenanceModule();
    for (const foreign of [
      'foreign',
      { version: 2, records: new WeakMap() },
      { version: 2, records: new Map() },
      { version: 2 },
    ]) {
      const host: Record<PropertyKey, unknown> = {
        [PROVENANCE_REGISTRY_KEY]: foreign,
      };
      const registry = acquireProvenanceRegistry(host);
      expect(registry).not.toBe(foreign);
      // The foreign occupant is left alone.
      expect(host[PROVENANCE_REGISTRY_KEY]).toBe(foreign);
    }
  });

  it('refuses hostile frozen occupants without throwing', async () => {
    const { acquireProvenanceRegistry, PROVENANCE_REGISTRY_KEY } =
      await freshProvenanceModule();
    const proxiedMap = new Proxy(new WeakMap(), {});
    const occupants: unknown[] = [
      // Passes `instanceof WeakMap` but has no WeakMap internal slot.
      Object.freeze({ version: 2, records: proxiedMap }),
      Object.freeze(
        Object.defineProperty({ records: new WeakMap() }, 'version', {
          get() {
            throw new Error('no');
          },
          enumerable: true,
        }),
      ),
      Object.freeze(
        Object.defineProperty({ version: 2 }, 'records', {
          get: () => new WeakMap(),
          enumerable: true,
        }),
      ),
      new Proxy(Object.freeze({ version: 2, records: new WeakMap() }), {
        isExtensible() {
          throw new Error('no');
        },
      }),
    ];
    for (const occupant of occupants) {
      const host: Record<PropertyKey, unknown> = {};
      Object.defineProperty(host, PROVENANCE_REGISTRY_KEY, {
        value: occupant,
        configurable: false,
        writable: false,
      });
      let registry: { records: WeakMap<object, unknown> } | undefined;
      expect(() => {
        registry = acquireProvenanceRegistry(host);
      }).not.toThrow();
      expect(registry?.records).not.toBe(proxiedMap);
      expect(() =>
        WeakMap.prototype.has.call(registry?.records, {}),
      ).not.toThrow();
    }
    // An accessor slot.
    const accessorHost = {};
    Object.defineProperty(accessorHost, PROVENANCE_REGISTRY_KEY, {
      get() {
        throw new Error('no');
      },
    });
    expect(() => acquireProvenanceRegistry(accessorHost)).not.toThrow();
  });

  it('shares a compatible frozen occupant’s map', async () => {
    const { acquireProvenanceRegistry, PROVENANCE_REGISTRY_KEY } =
      await freshProvenanceModule();
    const records = new WeakMap();
    const host: Record<PropertyKey, unknown> = {
      [PROVENANCE_REGISTRY_KEY]: Object.freeze({ version: 2, records }),
    };
    expect(acquireProvenanceRegistry(host).records).toBe(records);
  });

  it('a copy that met a foreign slot is unknown to every other copy', async () => {
    const {
      acquireProvenanceRegistry,
      describeHandleIn,
      recordHandleProvenance,
      PROVENANCE_REGISTRY_KEY,
    } = await freshProvenanceModule();
    const host: Record<PropertyKey, unknown> = {
      [PROVENANCE_REGISTRY_KEY]: 'foreign',
    };
    const copyA = acquireProvenanceRegistry(host);
    const copyB = acquireProvenanceRegistry(host);
    const root = { query: async () => ({ rows: [] }) };
    recordHandleProvenance(
      root,
      {
        role: 'root',
        engine: 'libsql',
        owner: Object.freeze({}),
        clientSource: 'adapter',
        rootReads: 'shared',
      },
      copyA,
    );
    expect(describeHandleIn(copyA, root).role).toBe('root');
    expect(describeHandleIn(copyB, root)).toEqual({ role: 'unknown' });
  });

  it('a failing registry lookup keeps a transaction verdict and never throws', async () => {
    const { describeHandleIn, TRANSACTION_SCOPE } =
      await freshProvenanceModule();
    const broken = {
      version: 2 as const,
      records: new Proxy(new WeakMap(), {}) as WeakMap<object, never>,
    };
    expect(
      describeHandleIn(broken, { [TRANSACTION_SCOPE]: 'callback' }),
    ).toEqual({ role: 'transaction', transactionKind: 'callback' });
    expect(describeHandleIn(broken, {})).toEqual({ role: 'unknown' });
  });
});
