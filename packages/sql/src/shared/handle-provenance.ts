/**
 * Handle roles: which objects an adapter handed out are roots, pinned
 * sessions, or bound to a transaction (sdk#1249).
 *
 * Two mechanisms with opposite inheritance:
 *
 * - The transaction marker refuses. It is an enumerable, non-writable,
 *   non-configurable primitive on every transaction-bound handle, so spread,
 *   `Object.assign`, `Object.create` and a Proxy over the handle all still
 *   read as a transaction. A Proxy over the handle cannot hide it: the Proxy
 *   invariants make a lying `get`/`has` trap throw, and a throwing read counts
 *   as a transaction.
 * - Provenance accepts. Adapters record the exact objects they create in a
 *   registry keyed by object identity, so nothing on a copy, wrapper or
 *   derived object can carry it, and a lookup never reads from (or runs code
 *   of) the object being described.
 *
 * No Node imports: this module is part of the browser-safe PGlite entry.
 */
import type { DatabaseEngine } from './types';

/**
 * Property key of the transaction marker. A global symbol, so a handle made
 * by any copy of this package is recognised by any other.
 */
export const TRANSACTION_SCOPE: unique symbol = Symbol.for(
  '@happyvertical/sql/transaction-scope',
);

/**
 * How a transaction-bound handle was created. Treat every kind alike; the
 * kind is diagnostic. On PostgreSQL a savepoint callback receives its parent
 * handle, so it reports the parent's kind.
 */
export type TransactionScopeKind = 'callback' | 'savepoint' | 'manual';

/** The role of a database handle, as {@link describeHandle} reports it. */
export type HandleRole = 'root' | 'session' | 'transaction' | 'unknown';

/**
 * What a root statement sees while one of the root's own adapter-managed
 * transactions (`transaction()` or `beginTransaction()`) is open:
 *
 * - `isolated`: it runs on another connection and sees committed rows only
 *   (PostgreSQL pool).
 * - `serialized`: it waits until the transaction ends (PGlite, secureFile and
 *   remote libsql, PostgreSQL session database).
 * - `shared`: it runs on the one connection inside the open transaction and
 *   sees its uncommitted rows (local libsql, native SQLite, DuckDB, JSON).
 *
 * Transaction control issued as raw SQL through `query`/`execute` (`BEGIN`,
 * `COMMIT`, `ROLLBACK`, `SAVEPOINT`) is outside this claim on every adapter.
 */
export type RootReads = 'isolated' | 'serialized' | 'shared';

/** Whether a root opened its own connection or wraps one the caller supplied. */
export type ClientSource = 'adapter' | 'caller';

/** The result of {@link describeHandle}. */
export interface HandleDescription {
  readonly role: HandleRole;
  /** Set for role `transaction`; `unknown` for an unrecognised marker. */
  readonly transactionKind?: TransactionScopeKind | 'unknown';
  /** Set when an adapter of this package created this exact object. */
  readonly engine?: DatabaseEngine;
  /**
   * Opaque frozen token, one per root, shared by every session and
   * transaction handle created from it. Set when an adapter of this package
   * created this exact object.
   */
  readonly owner?: object;
  /** Set for role `root`. */
  readonly clientSource?: ClientSource;
  /** Set for roles `root` and `session`. */
  readonly rootReads?: RootReads;
}

/** @internal A registry record, written once at creation. */
export interface HandleProvenanceRecord {
  readonly role: 'root' | 'session' | 'transaction';
  readonly engine: DatabaseEngine;
  readonly owner: object;
  readonly clientSource?: ClientSource;
  readonly rootReads?: RootReads;
}

/** @internal */
export interface ProvenanceRegistry {
  readonly version: 2;
  readonly records: WeakMap<object, HandleProvenanceRecord>;
}

/**
 * @internal Global slot holding the registry shared by copies in a realm.
 * Version 2: 0.118.0 shared `…:v1` but ignored a `client` option on the
 * non-PGlite adapters, so the roots it recorded may sit over a connection a
 * caller asked to replace; they are unknown here, which fails closed.
 */
export const PROVENANCE_REGISTRY_KEY: unique symbol = Symbol.for(
  '@happyvertical/sql/handle-provenance:v2',
);

const KINDS: ReadonlySet<unknown> = new Set([
  'callback',
  'savepoint',
  'manual',
]);
const ENGINES: ReadonlySet<unknown> = new Set([
  'node-sqlite',
  'libsql',
  'postgres',
  'pglite',
  'duckdb',
  'json',
]);
const ROLES: ReadonlySet<unknown> = new Set(['root', 'session', 'transaction']);
const ROOT_READS: ReadonlySet<unknown> = new Set([
  'isolated',
  'serialized',
  'shared',
]);
const CLIENT_SOURCES: ReadonlySet<unknown> = new Set(['adapter', 'caller']);

// Intrinsics captured at load. Registry maps are only ever touched through
// these, so an occupant that is not a real WeakMap (a Proxy, a subclass with
// overridden methods) fails the brand check instead of answering for it.
const weakMapGet = WeakMap.prototype.get;
const weakMapHas = WeakMap.prototype.has;
const weakMapSet = WeakMap.prototype.set;
const apply = Reflect.apply;
const ownDescriptor = Object.getOwnPropertyDescriptor;

function isObjectLike(value: unknown): value is object {
  return (
    value !== null && (typeof value === 'object' || typeof value === 'function')
  );
}

/** An own data property's value; `undefined` for a missing or accessor property. */
function ownData(
  target: object,
  key: PropertyKey,
): { value: unknown } | undefined {
  const descriptor = ownDescriptor(target, key);
  return descriptor && 'value' in descriptor
    ? { value: descriptor.value }
    : undefined;
}

function isRealWeakMap(value: unknown): value is WeakMap<object, unknown> {
  try {
    apply(weakMapHas, value, [{}]);
    return true;
  } catch {
    return false;
  }
}

function privateRegistry(): ProvenanceRegistry {
  return Object.freeze({
    version: 2 as const,
    records: new WeakMap<object, HandleProvenanceRecord>(),
  });
}

/**
 * @internal Returns the registry in `host`'s slot, defining it when the slot
 * is empty. The occupant is accepted only when the slot is a data property
 * holding a frozen object whose own data properties are `version: 2` and a
 * real `WeakMap` `records`; the returned registry is rebuilt from those
 * captured values, so the occupant is never consulted again. Anything else (a
 * future layout, a foreign value, a Proxy, an accessor, a read that throws)
 * leaves the occupant alone and returns a private registry: objects recorded
 * there are unknown to every other copy, which fails closed.
 */
export function acquireProvenanceRegistry(host: object): ProvenanceRegistry {
  try {
    const descriptor = ownDescriptor(host, PROVENANCE_REGISTRY_KEY);
    if (descriptor === undefined) {
      const registry = privateRegistry();
      try {
        Object.defineProperty(host, PROVENANCE_REGISTRY_KEY, {
          value: registry,
          enumerable: false,
          writable: false,
          configurable: false,
        });
      } catch {
        // A non-extensible host: the registry stays private.
      }
      return registry;
    }
    if (!('value' in descriptor)) return privateRegistry();
    const occupant: unknown = descriptor.value;
    if (!isObjectLike(occupant) || !Object.isFrozen(occupant)) {
      return privateRegistry();
    }
    const version = ownData(occupant, 'version');
    const map = ownData(occupant, 'records');
    if (version?.value !== 2 || !map || !isRealWeakMap(map.value)) {
      return privateRegistry();
    }
    return Object.freeze({
      version: 2 as const,
      records: map.value as WeakMap<object, HandleProvenanceRecord>,
    });
  } catch {
    return privateRegistry();
  }
}

let registry: ProvenanceRegistry | undefined;

function currentRegistry(): ProvenanceRegistry {
  registry ??= acquireProvenanceRegistry(globalThis);
  return registry;
}

/**
 * A record another copy (or anything with access to the slot) wrote is read
 * through its own data properties and accepted only when complete for its
 * role; nothing is defaulted. A missing field, an unknown value, an accessor
 * or a throwing read yields no record.
 */
function readRecord(raw: unknown): HandleProvenanceRecord | undefined {
  try {
    if (!isObjectLike(raw)) return undefined;
    const role = ownData(raw, 'role')?.value;
    const engine = ownData(raw, 'engine')?.value;
    const owner = ownData(raw, 'owner')?.value;
    if (!ROLES.has(role) || !ENGINES.has(engine) || !isObjectLike(owner)) {
      return undefined;
    }
    if (role === 'transaction') {
      return { role, engine: engine as DatabaseEngine, owner };
    }
    const rootReads = ownData(raw, 'rootReads')?.value;
    if (!ROOT_READS.has(rootReads)) return undefined;
    if (role === 'session') {
      return {
        role,
        engine: engine as DatabaseEngine,
        owner,
        rootReads: rootReads as RootReads,
      };
    }
    const clientSource = ownData(raw, 'clientSource')?.value;
    if (!CLIENT_SOURCES.has(clientSource)) return undefined;
    return {
      role: 'root',
      engine: engine as DatabaseEngine,
      owner,
      rootReads: rootReads as RootReads,
      clientSource: clientSource as ClientSource,
    };
  } catch {
    return undefined;
  }
}

/** @internal Looks `db` up by identity; never throws. */
function lookupRecord(
  target: ProvenanceRegistry,
  db: object,
): HandleProvenanceRecord | undefined {
  try {
    return readRecord(apply(weakMapGet, target.records, [db]));
  } catch {
    return undefined;
  }
}

/**
 * Marks `handle` as bound to a transaction, as an enumerable, non-writable,
 * non-configurable property keyed by {@link TRANSACTION_SCOPE}. For custom
 * adapters and wrappers: marking can only add refusal.
 *
 * Marking again with the same kind is a no-op, and hardens a marker that is
 * still writable (for example on a sealed copy). A different kind, an
 * existing non-configurable marker that is not an enumerable data property,
 * an invalid kind, a non-object or a non-extensible object throws.
 */
export function markTransactionHandle<T extends object>(
  handle: T,
  kind: TransactionScopeKind,
): T {
  if (!isObjectLike(handle)) {
    throw new TypeError('markTransactionHandle() needs an object');
  }
  if (!KINDS.has(kind)) {
    throw new TypeError(
      `markTransactionHandle() kind must be callback, savepoint or manual, not ${String(kind)}`,
    );
  }
  const existing = ownDescriptor(handle, TRANSACTION_SCOPE);
  if (existing && !existing.configurable) {
    if (
      !('value' in existing) ||
      existing.value !== kind ||
      existing.enumerable !== true
    ) {
      throw new TypeError(
        'markTransactionHandle(): the handle already carries an incompatible marker',
      );
    }
    if (existing.writable) {
      // Non-configurable but writable (a sealed copy): may still be made
      // read-only, which is all that is missing.
      Object.defineProperty(handle, TRANSACTION_SCOPE, { writable: false });
    }
    return handle;
  }
  // A configurable own marker is a copy (a spread of a marked handle); it is
  // replaced by this handle's own, final kind.
  Object.defineProperty(handle, TRANSACTION_SCOPE, {
    value: kind,
    enumerable: true,
    writable: false,
    configurable: false,
  });
  return handle;
}

/**
 * @internal Records the provenance of an object an adapter created in
 * `target` (the shared registry by default). First write wins. A root or
 * session record is refused for an object that carries the transaction
 * marker (an adapter bug).
 */
export function recordHandleProvenance<T extends object>(
  handle: T,
  record: HandleProvenanceRecord,
  target: ProvenanceRegistry = currentRegistry(),
): T {
  if (apply(weakMapHas, target.records, [handle])) return handle;
  if (
    record.role !== 'transaction' &&
    ownDescriptor(handle, TRANSACTION_SCOPE) !== undefined
  ) {
    throw new TypeError(
      `A transaction-bound handle cannot be recorded as a ${record.role}`,
    );
  }
  apply(weakMapSet, target.records, [handle, Object.freeze({ ...record })]);
  return handle;
}

/**
 * @internal Per-root provenance helpers for an adapter's create function: one
 * owner token for the root and everything created from it.
 */
export function createHandleProvenance(options: {
  engine: DatabaseEngine;
  rootReads: RootReads;
  clientSource?: ClientSource;
}) {
  const owner: object = Object.freeze(Object.create(null));
  const { engine, rootReads, clientSource = 'adapter' } = options;
  return {
    owner,
    root<T extends object>(handle: T): T {
      return recordHandleProvenance(handle, {
        role: 'root',
        engine,
        owner,
        clientSource,
        rootReads,
      });
    },
    session<T extends object>(handle: T): T {
      return recordHandleProvenance(handle, {
        role: 'session',
        engine,
        owner,
        rootReads: 'serialized',
      });
    },
    transaction<T extends object>(handle: T, kind: TransactionScopeKind): T {
      markTransactionHandle(handle, kind);
      return recordHandleProvenance(handle, {
        role: 'transaction',
        engine,
        owner,
      });
    },
  };
}

/** @internal */
export type HandleProvenance = ReturnType<typeof createHandleProvenance>;

/**
 * @internal {@link describeHandle} against a given registry (tests use it to
 * model a copy holding a private registry).
 */
export function describeHandleIn(
  target: ProvenanceRegistry,
  db: unknown,
): HandleDescription {
  if (!isObjectLike(db)) return { role: 'unknown' };
  let marked = false;
  let kind: TransactionScopeKind | 'unknown' = 'unknown';
  try {
    const present = Reflect.has(db, TRANSACTION_SCOPE);
    const value = Reflect.get(db, TRANSACTION_SCOPE);
    if (present || value !== undefined) {
      marked = true;
      if (KINDS.has(value)) kind = value as TransactionScopeKind;
    }
  } catch {
    marked = true;
  }
  const record = lookupRecord(target, db);
  if (marked || record?.role === 'transaction') {
    return record
      ? {
          role: 'transaction',
          transactionKind: kind,
          engine: record.engine,
          owner: record.owner,
        }
      : { role: 'transaction', transactionKind: kind };
  }
  if (!record) return { role: 'unknown' };
  if (record.role === 'root') {
    return {
      role: 'root',
      engine: record.engine,
      owner: record.owner,
      clientSource: record.clientSource as ClientSource,
      rootReads: record.rootReads as RootReads,
    };
  }
  return {
    role: 'session',
    engine: record.engine,
    owner: record.owner,
    rootReads: record.rootReads as RootReads,
  };
}

/**
 * Describes a database handle. Total: never throws, and every uncertainty
 * resolves away from `root`.
 *
 * 1. Not an object or function: `unknown`.
 * 2. The transaction marker is found (`Reflect.has` is true or `Reflect.get`
 *    is not `undefined`, own or inherited), or reading it throws:
 *    `transaction`, with the marker's kind or `unknown`. A complete record
 *    for this exact object adds `engine` and `owner`; a failed lookup leaves
 *    the transaction verdict as it is.
 * 3. A complete record for this exact object, written by an adapter of this
 *    package when it created it: that role.
 * 4. Otherwise `unknown`: copies, wrappers, custom adapters, objects made by a
 *    copy of this package older than 0.118.0 or in another realm, and
 *    incomplete records.
 *
 * Gate acceptance on {@link isDatabaseRoot}, never on `!isTransactionHandle`:
 * a transaction handle made by an older copy carries no marker. A stream
 * reader must also check `rootReads`.
 */
export function describeHandle(db: unknown): HandleDescription {
  return describeHandleIn(currentRegistry(), db);
}

/**
 * True when {@link describeHandle} reports a transaction-bound handle. Not an
 * authorization: it is false for a transaction handle made by a copy of this
 * package older than 0.118.0, and true for a wrapper whose marker read throws.
 */
export function isTransactionHandle(db: unknown): boolean {
  return describeHandle(db).role === 'transaction';
}

/**
 * True only for the exact object an adapter of this package created as a
 * root over a connection it opened itself (not over a caller-supplied
 * client). Copies, wrappers, sessions, transaction handles and objects made by
 * older copies are never roots.
 *
 * A root is not automatically a committed reader: check `rootReads` from
 * {@link describeHandle} too. A `shared` root reads uncommitted rows while one
 * of its own transactions is open, and raw transaction control through
 * `query` voids the claim on every adapter.
 */
export function isDatabaseRoot(db: unknown): boolean {
  const description = describeHandle(db);
  return description.role === 'root' && description.clientSource === 'adapter';
}
