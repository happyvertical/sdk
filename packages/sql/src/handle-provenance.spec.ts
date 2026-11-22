import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type DatabaseInterface,
  describeHandle,
  getDatabase,
  type HandleDescription,
  isDatabaseRoot,
  isTransactionHandle,
  markTransactionHandle,
  TRANSACTION_SCOPE,
  type TransactionHandle,
} from './index';
import { DatabaseSchemaManager } from './schema-manager';
import {
  PROVENANCE_REGISTRY_KEY,
  recordHandleProvenance,
} from './shared/handle-provenance';

/**
 * Handle roles (sdk#1249). A consumer that must keep reading from a database
 * for a long time needs to know whether the object it holds is a root (owns
 * its connection) or bound to a transaction. These tests pin, per adapter,
 * that every transaction-bound object an adapter hands out says so, that the
 * refusal survives copies, and that only the exact object a factory created
 * is ever a root.
 */

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(await realpath(tmpdir()), 'hv-sql-provenance-'));
});

/** Caller-owned PGlite clients; the adapter does not close them. */
const callerClients: Array<{ close(): Promise<void> }> = [];

afterAll(async () => {
  for (const client of callerClients.splice(0)) await client.close();
  await rm(dir, { recursive: true, force: true });
});

async function callerPGlite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const client = await PGlite.create();
  callerClients.push(client);
  return client;
}

/**
 * Own enumerable string keys of each adapter's root, captured from the
 * origin/main roots (v0.116.8): this change writes no string key on a root.
 */
const BASE_ROOT_KEYS = [
  'alterTable',
  'beginTransaction',
  'client',
  'close',
  'count',
  'delete',
  'engine',
  'execute',
  'get',
  'getOrInsert',
  'getTableSchema',
  'initializeSchemas',
  'insert',
  'list',
  'many',
  'oO',
  'oo',
  'ox',
  'pluck',
  'query',
  'reopenOptions',
  'single',
  'syncSchema',
  'table',
  'tableExists',
  'transaction',
  'update',
  'upsert',
  'url',
  'xx',
];
const keysWith = (add: string[], remove: string[] = []) =>
  [...BASE_ROOT_KEYS.filter((key) => !remove.includes(key)), ...add].sort();

/** A pooled-client stand-in so PostgreSQL transaction handles exist without a server. */
function fakePgClient() {
  return {
    query: async (sql: unknown) => ({
      rows: [],
      rowCount: 0,
      command:
        typeof sql === 'string' && sql.trim().toUpperCase() === 'COMMIT'
          ? 'COMMIT'
          : 'SELECT',
      fields: [],
    }),
    on() {},
    off() {},
    release() {},
  };
}

type AdapterCase = {
  name: string;
  engine: string;
  rootReads: 'isolated' | 'serialized' | 'shared';
  clientSource: 'adapter' | 'caller';
  /** Nested `transaction()` re-enters under a savepoint. */
  savepoints: boolean;
  /** A savepoint callback receives its parent object (PostgreSQL). */
  savepointIsParent?: boolean;
  /** Statements can be issued on handles (false: stubbed PostgreSQL). */
  executes: boolean;
  /** Own enumerable string keys of the root (see BASE_ROOT_KEYS). */
  rootKeys: string[];
  open: () => Promise<DatabaseInterface>;
};

const adapters: AdapterCase[] = [
  {
    name: 'libsql :memory:',
    rootKeys: keysWith([]),
    engine: 'libsql',
    rootReads: 'shared',
    clientSource: 'adapter',
    savepoints: true,
    executes: true,
    open: () => getDatabase({ type: 'sqlite', url: ':memory:', cache: false }),
  },
  {
    name: 'libsql file',
    rootKeys: keysWith([]),
    engine: 'libsql',
    rootReads: 'shared',
    clientSource: 'adapter',
    savepoints: true,
    executes: true,
    open: () =>
      getDatabase({
        type: 'sqlite',
        url: `file:${join(dir, `libsql-${randomUUID()}.db`)}`,
        cache: false,
      }),
  },
  {
    name: 'libsql secureFile',
    rootKeys: keysWith([]),
    engine: 'node-sqlite',
    rootReads: 'serialized',
    clientSource: 'adapter',
    savepoints: true,
    executes: true,
    open: () =>
      getDatabase({
        type: 'sqlite',
        url: join(dir, `secure-${randomUUID()}.db`),
        cache: false,
        secureFile: { driver: 'node:sqlite', custody: 'trusted-parent' },
      }),
  },
  {
    name: 'native SQLite',
    rootKeys: keysWith(['vector']),
    engine: 'node-sqlite',
    rootReads: 'shared',
    clientSource: 'adapter',
    savepoints: true,
    executes: true,
    open: () =>
      getDatabase({
        type: 'sqlite',
        url: ':memory:',
        cache: false,
        capabilities: { vector: true },
      }),
  },
  {
    name: 'DuckDB',
    rootKeys: keysWith(['exportTable', 'requiresSchemaCheck']),
    engine: 'duckdb',
    rootReads: 'shared',
    clientSource: 'adapter',
    savepoints: false,
    executes: true,
    open: () => getDatabase({ type: 'duckdb', url: ':memory:', cache: false }),
  },
  {
    name: 'JSON',
    rootKeys: keysWith(
      [
        'exportTable',
        'getTableLoadErrors',
        'inferSchemaFromJSON',
        'requiresSchemaCheck',
      ],
      ['alterTable'],
    ),
    engine: 'json',
    rootReads: 'shared',
    clientSource: 'adapter',
    savepoints: false,
    executes: true,
    open: () =>
      getDatabase({ type: 'json', url: ':memory:', dbid: randomUUID() }),
  },
  {
    name: 'PGlite owned',
    rootKeys: keysWith(['vector']),
    engine: 'pglite',
    rootReads: 'serialized',
    clientSource: 'adapter',
    savepoints: true,
    executes: true,
    open: () => getDatabase({ type: 'pglite' }),
  },
  {
    name: 'PGlite injected client',
    rootKeys: keysWith(['vector']),
    engine: 'pglite',
    rootReads: 'serialized',
    clientSource: 'caller',
    savepoints: true,
    executes: true,
    open: async () =>
      getDatabase({ type: 'pglite', client: await callerPGlite() }),
  },
  {
    name: 'PostgreSQL pool (stubbed checkout)',
    rootKeys: keysWith(['acquireSession', 'vector']),
    engine: 'postgres',
    rootReads: 'isolated',
    clientSource: 'adapter',
    savepoints: true,
    savepointIsParent: true,
    executes: false,
    open: async () => {
      const db = await getDatabase({
        type: 'postgres',
        url: `postgresql://hv:hv@127.0.0.1:9/hv_provenance_${randomUUID().slice(0, 8)}`,
        cache: false,
      });
      // `db.client` is the pool object the adapter checks transactions out of.
      (db.client as { connect: () => Promise<unknown> }).connect = async () =>
        fakePgClient();
      return db;
    },
  },
];

function txOf(db: DatabaseInterface) {
  const fn = db.transaction;
  if (!fn) throw new Error('adapter does not expose transaction()');
  return fn.bind(db);
}

function beginOf(db: DatabaseInterface) {
  const fn = db.beginTransaction;
  if (!fn) throw new Error('adapter does not expose beginTransaction()');
  return fn.bind(db);
}

/**
 * A cycle-preserving recursive copier: copies every own descriptor (symbols
 * included), recursively copies plain objects, reuses functions and class
 * instances (drivers, pools), keeps frozenness. It knows nothing about the
 * SDK.
 */
function deepDescriptorCopy<T>(value: T, seen = new Map<object, object>()): T {
  if (value === null || typeof value !== 'object') return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const existing = seen.get(value as object);
  if (existing) return existing as T;
  const copy = Object.create(prototype);
  seen.set(value as object, copy);
  for (const key of Reflect.ownKeys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) continue;
    if ('value' in descriptor) {
      descriptor.value = deepDescriptorCopy(descriptor.value, seen);
    }
    Object.defineProperty(copy, key, descriptor);
  }
  if (Object.isFrozen(value)) Object.freeze(copy);
  return copy;
}

function rootCopies(db: object): Array<[string, unknown]> {
  return [
    ['spread', { ...db }],
    ['Object.assign', Object.assign({}, db)],
    ['Object.create', Object.create(db)],
    ['forwarding Proxy', new Proxy(db, {})],
    [
      'descriptor copy',
      Object.defineProperties({}, Object.getOwnPropertyDescriptors(db)),
    ],
    ['recursive descriptor copy', deepDescriptorCopy(db)],
  ];
}

function expectTransaction(
  handle: unknown,
  kind: 'callback' | 'savepoint' | 'manual',
  root: DatabaseInterface,
) {
  const description = describeHandle(handle);
  expect(description.role).toBe('transaction');
  expect(description.transactionKind).toBe(kind);
  expect(description.engine).toBeDefined();
  expect(description.engine).toBe(describeHandle(root).engine);
  expect(description.owner).toBeDefined();
  expect(description.owner).toBe(describeHandle(root).owner);
  // A transaction handle gains exactly one enumerable symbol, the marker.
  if (Object.getOwnPropertyDescriptor(handle as object, TRANSACTION_SCOPE)) {
    expect(
      Object.getOwnPropertySymbols(handle as object).filter(
        (key) =>
          Object.getOwnPropertyDescriptor(handle as object, key)?.enumerable,
      ),
    ).toEqual([TRANSACTION_SCOPE]);
  }
  expect(isTransactionHandle(handle)).toBe(true);
  expect(isDatabaseRoot(handle)).toBe(false);
}

function expectTransactionCopiesRefuse(handle: object) {
  const copies: Array<[string, unknown]> = [
    ['spread', { ...handle }],
    ['Object.assign', Object.assign({}, handle)],
    ['Object.create', Object.create(handle)],
    ['forwarding Proxy', new Proxy(handle, {})],
    ['spread with close', { ...handle, close: async () => {} }],
  ];
  for (const [label, copy] of copies) {
    expect(describeHandle(copy).role, label).toBe('transaction');
    expect(isDatabaseRoot(copy), label).toBe(false);
  }
  // A Proxy over the handle that tries to hide the marker breaks the Proxy
  // invariant for a non-writable, non-configurable property: its read throws,
  // which still classifies as a transaction.
  const hiding = new Proxy(handle, {
    get: (target, key) =>
      key === TRANSACTION_SCOPE ? undefined : Reflect.get(target, key),
    has: (target, key) =>
      key === TRANSACTION_SCOPE ? false : Reflect.has(target, key),
  });
  expect(describeHandle(hiding)).toMatchObject({
    role: 'transaction',
    transactionKind: 'unknown',
  });
  expect(isDatabaseRoot(hiding)).toBe(false);
}

function expectMarkerDescriptor(handle: object) {
  const descriptor = Object.getOwnPropertyDescriptor(handle, TRANSACTION_SCOPE);
  expect(descriptor).toMatchObject({
    enumerable: true,
    writable: false,
    configurable: false,
  });
}

describe('TRANSACTION_SCOPE', () => {
  it('is a global symbol', () => {
    expect(TRANSACTION_SCOPE).toBe(
      Symbol.for('@happyvertical/sql/transaction-scope'),
    );
  });
});

for (const adapter of adapters) {
  describe(`handle roles: ${adapter.name}`, () => {
    it('describes the factory object as a root', async () => {
      const db = await adapter.open();
      try {
        const description: HandleDescription = describeHandle(db);
        expect(description).toMatchObject({
          role: 'root',
          engine: adapter.engine,
          rootReads: adapter.rootReads,
          clientSource: adapter.clientSource,
        });
        expect(typeof description.owner).toBe('object');
        expect(Object.isFrozen(description.owner)).toBe(true);
        expect(isDatabaseRoot(db)).toBe(adapter.clientSource === 'adapter');
        expect(isTransactionHandle(db)).toBe(false);
        // Roots gain no own property: the enumerable key set is exactly the
        // one the root had before this change, and no symbol is enumerable.
        expect(Object.keys(db).sort()).toEqual(adapter.rootKeys);
        expect(
          Object.getOwnPropertySymbols(db).filter(
            (key) => Object.getOwnPropertyDescriptor(db, key)?.enumerable,
          ),
        ).toEqual([]);
        expect(Object.getOwnPropertySymbols(db)).not.toContain(
          TRANSACTION_SCOPE,
        );
        // Passing a root through getDatabase returns it unchanged, still a root.
        expect(await getDatabase(db)).toBe(db);
        expect(describeHandle(db).role).toBe('root');
      } finally {
        await db.close?.();
      }
    });

    it('never describes a copy of a root as a root', async () => {
      const db = await adapter.open();
      try {
        for (const [label, copy] of rootCopies(db)) {
          expect(describeHandle(copy).role, label).toBe('unknown');
          expect(isDatabaseRoot(copy), label).toBe(false);
        }
        expect(describeHandle(db).role).toBe('root');
      } finally {
        await db.close?.();
      }
    });

    it('marks the transaction callback handle and keeps the refusal on copies and after it ends', async () => {
      const db = await adapter.open();
      try {
        let captured: DatabaseInterface | undefined;
        await txOf(db)(async (tx) => {
          captured = tx;
          expectTransaction(tx, 'callback', db);
          expectMarkerDescriptor(tx);
          expectTransactionCopiesRefuse(tx);
          for (const [label, copy] of rootCopies(tx)) {
            expect(isDatabaseRoot(copy), label).toBe(false);
          }
          // Passing a transaction handle back through getDatabase returns it
          // unchanged, still a transaction handle.
          expect(await getDatabase(tx)).toBe(tx);
        });
        expectTransaction(captured, 'callback', db);
      } finally {
        await db.close?.();
      }
    });

    if (adapter.savepoints) {
      it('marks nested savepoint handles, siblings and two levels deep', async () => {
        const db = await adapter.open();
        try {
          await txOf(db)(async (tx) => {
            const expected = adapter.savepointIsParent
              ? 'callback'
              : 'savepoint';
            await txOf(tx)(async (inner) => {
              if (adapter.savepointIsParent) expect(inner).toBe(tx);
              else expect(inner).not.toBe(tx);
              expectTransaction(inner, expected, db);
              expectMarkerDescriptor(inner);
              expectTransactionCopiesRefuse(inner);
              await txOf(inner)(async (deeper) => {
                expectTransaction(deeper, expected, db);
              });
            });
            await txOf(tx)(async (sibling) => {
              expectTransaction(sibling, expected, db);
            });
          });
        } finally {
          await db.close?.();
        }
      });
    }

    it('marks beginTransaction() handles and keeps the mark after commit and rollback', async () => {
      const db = await adapter.open();
      try {
        const committed = (await beginOf(db)()) as TransactionHandle;
        expectTransaction(committed, 'manual', db);
        expectMarkerDescriptor(committed);
        expectTransactionCopiesRefuse(committed);
        await committed.commit();
        expectTransaction(committed, 'manual', db);

        const rolledBack = (await beginOf(db)()) as TransactionHandle;
        if (adapter.savepoints) {
          await txOf(rolledBack)(async (inner) => {
            // A savepoint under a manual handle: its own object marked
            // `savepoint`, or (PostgreSQL) the manual handle itself.
            if (adapter.savepointIsParent) {
              expect(inner).toBe(rolledBack);
              expectTransaction(inner, 'manual', db);
            } else {
              expect(inner).not.toBe(rolledBack);
              expectTransaction(inner, 'savepoint', db);
            }
            expectTransactionCopiesRefuse(inner);
          });
        }
        await rolledBack.rollback();
        expectTransaction(rolledBack, 'manual', db);
      } finally {
        await db.close?.();
      }
    });

    it('gives handles of another root a different owner', async () => {
      const first = await adapter.open();
      const second = await adapter.open();
      try {
        expect(describeHandle(first).owner).not.toBe(
          describeHandle(second).owner,
        );
        await txOf(second)(async (tx) => {
          expect(describeHandle(tx).owner).toBe(describeHandle(second).owner);
          expect(describeHandle(tx).owner).not.toBe(
            describeHandle(first).owner,
          );
        });
      } finally {
        await first.close?.();
        await second.close?.();
      }
    });

    it('never describes the internal schema facade as a root', async () => {
      const db = await adapter.open();
      const seen: unknown[] = [];
      const spy = vi
        .spyOn(DatabaseSchemaManager.prototype, 'initializeSchemas')
        .mockImplementation(async (facade: unknown) => {
          seen.push(facade);
          return undefined as never;
        });
      try {
        expect(typeof db.initializeSchemas).toBe('function');
        await db.initializeSchemas?.({ schemas: {} } as never);
        expect(seen.length).toBeGreaterThan(0);
        for (const facade of seen) {
          expect(facade).not.toBe(db);
          expect(isDatabaseRoot(facade)).toBe(false);
          expect(describeHandle(facade).role).not.toBe('root');
        }
      } finally {
        spy.mockRestore();
        await db.close?.();
      }
    });
  });
}

describe('describeHandle on arbitrary values', () => {
  it('describes non-objects as unknown', () => {
    for (const value of [null, undefined, 'db', 1, true, Symbol('x'), 10n]) {
      expect(describeHandle(value)).toEqual({ role: 'unknown' });
      expect(isDatabaseRoot(value)).toBe(false);
      expect(isTransactionHandle(value)).toBe(false);
    }
  });

  it('describes an object without a record or marker as unknown, whatever it looks like', () => {
    const lookalike = {
      role: 'root',
      transaction: async () => {},
      beginTransaction: async () => {},
      close: async () => {},
      query: async () => ({ rows: [] }),
    };
    expect(describeHandle(lookalike)).toEqual({ role: 'unknown' });
    expect(isDatabaseRoot(lookalike)).toBe(false);
    // An older SDK copy's transaction handle has no marker either: it is not
    // reported as a transaction, so acceptance must gate on isDatabaseRoot.
    expect(isTransactionHandle(lookalike)).toBe(false);
  });

  it('treats an unknown marker value as a transaction of unknown kind', () => {
    for (const value of ['cluster', 1, null, {}, false]) {
      const handle = { [TRANSACTION_SCOPE]: value };
      expect(describeHandle(handle)).toMatchObject({
        role: 'transaction',
        transactionKind: 'unknown',
      });
      expect(isDatabaseRoot(handle)).toBe(false);
    }
  });

  it('treats an inherited marker as present', () => {
    const base = { [TRANSACTION_SCOPE]: 'manual' };
    expect(describeHandle(Object.create(base))).toMatchObject({
      role: 'transaction',
      transactionKind: 'manual',
    });
  });

  it('treats a throwing read and a revoked Proxy as a transaction and never throws', () => {
    const throwingGetter = Object.defineProperty({}, TRANSACTION_SCOPE, {
      get() {
        throw new Error('no');
      },
    });
    const throwingTraps = new Proxy(
      {},
      {
        has() {
          throw new Error('no');
        },
        get() {
          throw new Error('no');
        },
      },
    );
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    for (const value of [throwingGetter, throwingTraps, proxy]) {
      expect(() => describeHandle(value)).not.toThrow();
      expect(describeHandle(value)).toMatchObject({
        role: 'transaction',
        transactionKind: 'unknown',
      });
      expect(isTransactionHandle(value)).toBe(true);
      expect(isDatabaseRoot(value)).toBe(false);
    }
  });

  it('treats a Proxy whose has trap answers true as a transaction', () => {
    const proxy = new Proxy(
      {},
      { has: (_t, key) => key === TRANSACTION_SCOPE },
    );
    expect(describeHandle(proxy).role).toBe('transaction');
  });
});

describe('wrappers that do not inherit the marker are never roots', () => {
  it('reads unknown for a dummy-target filtering Proxy, a method-picking wrapper and a filtering Proxy over a spread copy', async () => {
    const db = await getDatabase({
      type: 'sqlite',
      url: ':memory:',
      cache: false,
    });
    try {
      await txOf(db)(async (tx) => {
        const dummyTarget = new Proxy(
          {},
          {
            get: (_t, key) =>
              typeof key === 'string'
                ? (tx as unknown as Record<string, unknown>)[key]
                : undefined,
          },
        );
        const picked = { query: tx.query };
        const overSpread = new Proxy(
          { ...tx },
          {
            get: (target, key) =>
              key === TRANSACTION_SCOPE ? undefined : Reflect.get(target, key),
            has: (target, key) =>
              key === TRANSACTION_SCOPE ? false : Reflect.has(target, key),
          },
        );
        for (const wrapper of [dummyTarget, picked, overSpread]) {
          expect(describeHandle(wrapper).role).toBe('unknown');
          expect(isDatabaseRoot(wrapper)).toBe(false);
        }
      });
    } finally {
      await db.close?.();
    }
  });

  it('a dummy-target Proxy that forwards descriptors of a transaction handle throws on spread', async () => {
    const db = await getDatabase({
      type: 'sqlite',
      url: ':memory:',
      cache: false,
    });
    try {
      await txOf(db)(async (tx) => {
        const forwarding = new Proxy(
          {},
          {
            ownKeys: () => Reflect.ownKeys(tx),
            getOwnPropertyDescriptor: (_t, key) =>
              Object.getOwnPropertyDescriptor(tx, key),
            get: (_t, key) => Reflect.get(tx, key),
          },
        );
        // The marker is non-configurable on the handle; a Proxy may not report
        // a non-configurable property its own target lacks.
        expect(() => ({ ...forwarding })).toThrow(TypeError);
      });
    } finally {
      await db.close?.();
    }
  });
});

describe('markTransactionHandle', () => {
  it('marks a custom adapter handle once, with its kind', () => {
    const handle = { query: async () => ({ rows: [] }) };
    expect(describeHandle(handle).role).toBe('unknown');
    expect(markTransactionHandle(handle, 'callback')).toBe(handle);
    expect(describeHandle(handle)).toEqual({
      role: 'transaction',
      transactionKind: 'callback',
    });
    expectMarkerDescriptor(handle);
    // Marking again with the same kind is a no-op.
    expect(() => markTransactionHandle(handle, 'callback')).not.toThrow();
    expect(() => markTransactionHandle(handle, 'manual')).toThrow();
  });

  it('refuses invalid kinds, non-objects and frozen objects', () => {
    expect(() => markTransactionHandle({}, 'cluster' as never)).toThrow();
    expect(() => markTransactionHandle(null as never, 'callback')).toThrow();
    expect(() => markTransactionHandle('db' as never, 'callback')).toThrow();
    expect(() =>
      markTransactionHandle(Object.freeze({}), 'callback'),
    ).toThrow();
  });

  it('only adds refusal: a marked root is no longer a root', async () => {
    const db = await getDatabase({
      type: 'sqlite',
      url: ':memory:',
      cache: false,
    });
    try {
      expect(isDatabaseRoot(db)).toBe(true);
      markTransactionHandle(db, 'manual');
      expect(isDatabaseRoot(db)).toBe(false);
      expect(describeHandle(db)).toMatchObject({
        role: 'transaction',
        transactionKind: 'manual',
        engine: 'libsql',
      });
    } finally {
      await db.close?.();
    }
  });
});

describe('root identity across opens', () => {
  it('a cached reopen returns the same root with the same owner', async () => {
    const dbid = randomUUID();
    const first = await getDatabase({ type: 'sqlite', url: ':memory:', dbid });
    const second = await getDatabase({ type: 'sqlite', url: ':memory:', dbid });
    try {
      expect(second).toBe(first);
      expect(describeHandle(second).owner).toBe(describeHandle(first).owner);
      expect(isDatabaseRoot(second)).toBe(true);
    } finally {
      await first.close?.();
    }
  });
});

describe('two roots over one injected PGlite client', () => {
  it('have different owners: each root has its own adapter and lock', async () => {
    const client = await callerPGlite();
    const first = await getDatabase({ type: 'pglite', client });
    const second = await getDatabase({ type: 'pglite', client });
    try {
      expect(second).not.toBe(first);
      const a = describeHandle(first);
      const b = describeHandle(second);
      expect(a).toMatchObject({ role: 'root', clientSource: 'caller' });
      expect(b).toMatchObject({ role: 'root', clientSource: 'caller' });
      expect(a.owner).toBeDefined();
      expect(a.owner).not.toBe(b.owner);
      await txOf(second)(async (tx) => {
        expect(describeHandle(tx).owner).toBe(b.owner);
        expect(describeHandle(tx).owner).not.toBe(a.owner);
      });
    } finally {
      await first.close?.();
      await second.close?.();
    }
  });
});

describe('registry records', () => {
  const sharedRecords = () =>
    (
      (globalThis as Record<PropertyKey, unknown>)[PROVENANCE_REGISTRY_KEY] as {
        records: WeakMap<object, unknown>;
      }
    ).records;

  it('honours a recorded callable object', () => {
    const callable = Object.assign(() => undefined, {
      query: async () => ({ rows: [] }),
    });
    recordHandleProvenance(callable, {
      role: 'root',
      engine: 'libsql',
      owner: Object.freeze({}),
      clientSource: 'adapter',
      rootReads: 'shared',
    });
    expect(describeHandle(callable)).toMatchObject({
      role: 'root',
      engine: 'libsql',
    });
    expect(isDatabaseRoot(callable)).toBe(true);
  });

  it('never defaults an incomplete or malformed record into a root', () => {
    const owner = Object.freeze({});
    const cases: unknown[] = [
      { role: 'root', engine: 'libsql', owner, rootReads: 'shared' },
      { role: 'root', engine: 'libsql', owner, clientSource: 'adapter' },
      {
        role: 'root',
        engine: 'libsql',
        owner,
        clientSource: 'adapter',
        rootReads: 'eventual',
      },
      {
        role: 'root',
        engine: 'oracle',
        owner,
        clientSource: 'adapter',
        rootReads: 'shared',
      },
      {
        role: 'root',
        engine: 'libsql',
        owner: 'token',
        clientSource: 'adapter',
        rootReads: 'shared',
      },
      { role: 'session', engine: 'postgres', owner },
      Object.defineProperty(
        { role: 'root', engine: 'libsql', owner, rootReads: 'shared' },
        'clientSource',
        { get: () => 'adapter', enumerable: true },
      ),
      Object.defineProperty({}, 'role', {
        get() {
          throw new Error('no');
        },
      }),
      'root',
    ];
    for (const record of cases) {
      const handle = { query: async () => ({ rows: [] }) };
      WeakMap.prototype.set.call(sharedRecords(), handle, record);
      expect(() => describeHandle(handle)).not.toThrow();
      expect(describeHandle(handle)).toEqual({ role: 'unknown' });
      expect(isDatabaseRoot(handle)).toBe(false);
    }
  });

  it('keeps the transaction verdict when the record is malformed', () => {
    const handle = { [TRANSACTION_SCOPE]: 'callback' };
    WeakMap.prototype.set.call(sharedRecords(), handle, {
      role: 'root',
      engine: 'libsql',
    });
    expect(describeHandle(handle)).toEqual({
      role: 'transaction',
      transactionKind: 'callback',
    });
  });
});

describe('markTransactionHandle over existing markers', () => {
  it('hardens a writable marker of the same kind (a sealed copy)', async () => {
    const db = await getDatabase({
      type: 'sqlite',
      url: ':memory:',
      cache: false,
    });
    try {
      await txOf(db)(async (tx) => {
        const sealed = Object.seal({ ...tx });
        expect(
          Object.getOwnPropertyDescriptor(sealed, TRANSACTION_SCOPE)?.writable,
        ).toBe(true);
        markTransactionHandle(sealed, 'callback');
        expectMarkerDescriptor(sealed);
        expect(describeHandle(sealed)).toMatchObject({
          role: 'transaction',
          transactionKind: 'callback',
        });
        expect(() => markTransactionHandle(sealed, 'manual')).toThrow();
      });
    } finally {
      await db.close?.();
    }
  });

  it('refuses an incompatible non-configurable marker', () => {
    const hidden = Object.defineProperty({}, TRANSACTION_SCOPE, {
      value: 'callback',
      enumerable: false,
      writable: true,
      configurable: false,
    });
    expect(() => markTransactionHandle(hidden, 'callback')).toThrow(TypeError);
    const accessor = Object.defineProperty({}, TRANSACTION_SCOPE, {
      get: () => 'callback',
      enumerable: true,
      configurable: false,
    });
    expect(() => markTransactionHandle(accessor, 'callback')).toThrow(
      TypeError,
    );
  });
});

describe('PGlite ownership follows the client actually used', () => {
  it('a falsy client counts as none: the adapter opens and owns its own instance', async () => {
    const db = await getDatabase({ type: 'pglite', client: false } as never);
    try {
      expect(db.client).toBeTruthy();
      expect(describeHandle(db)).toMatchObject({
        role: 'root',
        clientSource: 'adapter',
      });
      expect((await db.query('SELECT 1 AS one')).rows[0].one).toBe(1);
    } finally {
      await db.close?.();
    }
  });
});
