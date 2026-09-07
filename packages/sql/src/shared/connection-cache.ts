import type { DatabaseCacheOptions } from './types';

const CACHED_VALIDATION_CAPABILITY = Symbol.for(
  '@happyvertical/sql/connection-cache-cached-validation/v1',
);

type PendingConnection<T> = {
  invalidated: false | 'clear' | 'evict';
  promise: Promise<T>;
};

type EvictionChain<T> = {
  promise: Promise<void>;
  state: {
    invalidated: Set<PendingConnection<T>>;
    invalidation: 'clear' | 'evict';
  };
};

type CacheRequest = {
  cancelled: boolean;
  done: Promise<void>;
  finish: () => void;
};

/** Race-safe async resource cache used by database adapters. */
export class ConnectionCache<T> {
  readonly [CACHED_VALIDATION_CAPABILITY] = true;
  readonly #connections = new Map<string, T>();
  readonly #pending = new Map<string, PendingConnection<T>>();
  readonly #evictions = new Map<string, EvictionChain<T>>();
  readonly #requests = new Map<string, Set<CacheRequest>>();
  readonly #clearing = new Map<string, number>();
  readonly #failedClosures = new Map<
    string,
    { error: unknown; resources: Set<T> }
  >();

  async getOrCreate(
    key: string | undefined,
    options: DatabaseCacheOptions,
    create: () => Promise<T>,
    close: (connection: T) => Promise<void>,
    validateCached?: (connection: T) => Promise<boolean>,
  ): Promise<T> {
    validateDatabaseCacheOptions(options);
    const request =
      key && options.cache !== false ? this.#registerRequest(key) : undefined;
    try {
      this.#throwIfCancelled(request);
      if (key && options.clearCache) {
        await this.evict(key, close);
        this.#throwIfCancelled(request);
      }
      if (key) this.#throwIfFailedClosure(key);

      if (!key || options.cache === false) {
        return create();
      }

      while (true) {
        if (this.#evictions.has(key)) {
          await this.#waitForEviction(key);
          this.#throwIfCancelled(request);
        }
        this.#throwIfFailedClosure(key);

        const cached = this.#connections.get(key);
        if (cached !== undefined) {
          if (!validateCached) return cached;

          // Validation may yield while another caller evicts this entry. Only
          // return the resource when it remains this key's live cache entry.
          const isValid = await validateCached(cached);
          this.#throwIfCancelled(request);
          if (
            isValid &&
            this.#connections.get(key) === cached &&
            !this.#evictions.has(key)
          ) {
            return cached;
          }
          if (
            !isValid &&
            this.#connections.get(key) === cached &&
            !this.#evictions.has(key)
          ) {
            await this.evict(key, close);
            this.#throwIfCancelled(request);
          }
          continue;
        }

        let pending = this.#pending.get(key);
        if (!pending) {
          this.#throwIfCancelled(request);
          pending = { invalidated: false, promise: create() };
          this.#pending.set(key, pending);
        }

        let connection: T;
        try {
          connection = await pending.promise;
        } catch (error) {
          if (this.#pending.get(key) === pending) {
            this.#pending.delete(key);
          }
          throw error;
        }

        if (pending.invalidated || this.#evictions.has(key)) {
          if (this.#evictions.has(key)) {
            await this.#waitForEviction(key);
          }
          this.#throwIfCancelled(request);
          if (pending.invalidated === 'clear') {
            throw this.#clearError();
          }
          continue;
        }

        this.#throwIfCancelled(request);
        if (this.#pending.get(key) === pending) {
          this.#pending.delete(key);
        }
        this.#connections.set(key, connection);
        return connection;
      }
    } finally {
      if (request && key) {
        this.#finishRequest(key, request);
      }
    }
  }

  async evict(
    key: string,
    close: (connection: T) => Promise<void>,
    invalidation: 'clear' | 'evict' = 'evict',
  ) {
    const previous = this.#evictions.get(key);
    const state = previous?.state ?? {
      invalidated: new Set<PendingConnection<T>>(),
      invalidation,
    };
    if (invalidation === 'clear') {
      state.invalidation = 'clear';
      for (const pending of state.invalidated) {
        pending.invalidated = 'clear';
      }
    }

    const eviction = (previous?.promise ?? Promise.resolve()).then(async () => {
      const resources = new Set<T>(
        this.#failedClosures.get(key)?.resources ?? [],
      );
      this.#failedClosures.delete(key);
      const cached = this.#connections.get(key);
      this.#connections.delete(key);
      if (cached) resources.add(cached);

      const pending = this.#pending.get(key);
      this.#pending.delete(key);
      if (pending) {
        state.invalidated.add(pending);
        pending.invalidated = state.invalidation;
        // The original initializer caller still observes its rejection. For
        // eviction, a stale failure means there is simply no resource to close.
        const initialized = await pending.promise.catch(() => undefined);
        if (initialized !== undefined) resources.add(initialized);
      }

      const closeResults = await Promise.allSettled(
        [...resources].map(async (resource) => {
          await close(resource);
          return resource;
        }),
      );
      const failures = closeResults.filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      );
      if (failures.length) {
        const resourceList = [...resources];
        const failedResources = new Set<T>();
        closeResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            failedResources.add(resourceList[index]);
          }
        });
        const error =
          failures.length === 1
            ? failures[0].reason
            : new AggregateError(
                failures.map((failure) => failure.reason),
                'Multiple database connections failed to close',
              );
        this.#failedClosures.set(key, {
          error,
          resources: failedResources,
        });
        throw error;
      }
    });

    const chain = { promise: eviction, state };
    this.#evictions.set(key, chain);
    try {
      await eviction;
    } finally {
      if (this.#evictions.get(key) === chain) {
        this.#evictions.delete(key);
      }
    }
  }

  async clear(close: (connection: T) => Promise<void>) {
    const keys = new Set([
      ...this.#connections.keys(),
      ...this.#pending.keys(),
      ...this.#evictions.keys(),
      ...this.#requests.keys(),
      ...this.#clearing.keys(),
      ...this.#failedClosures.keys(),
    ]);
    const results = await Promise.allSettled(
      [...keys].map((key) => this.#clearKey(key, close)),
    );
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failures.length === 1) throw failures[0].reason;
    if (failures.length > 1) {
      throw new AggregateError(
        failures.map((failure) => failure.reason),
        'Multiple database connection cache entries failed to clear',
      );
    }
  }

  forget(connection: T): void {
    for (const [key, cached] of this.#connections) {
      if (cached === connection) {
        this.#connections.delete(key);
      }
    }
  }

  /** @internal Test-only visibility; includes every retained namespace. */
  get size(): number {
    return (
      this.#connections.size +
      this.#pending.size +
      this.#evictions.size +
      this.#requests.size +
      this.#clearing.size +
      this.#failedClosures.size
    );
  }

  async #clearKey(key: string, close: (connection: T) => Promise<void>) {
    this.#clearing.set(key, (this.#clearing.get(key) ?? 0) + 1);
    try {
      this.#cancelRequests(key);
      await this.evict(key, close, 'clear');
      while (this.#requests.get(key)?.size) {
        this.#cancelRequests(key);
        await Promise.all(
          [...(this.#requests.get(key) ?? [])].map((request) => request.done),
        );
      }
    } finally {
      const remaining = (this.#clearing.get(key) ?? 1) - 1;
      if (remaining === 0) this.#clearing.delete(key);
      else this.#clearing.set(key, remaining);
    }
  }

  #cancelRequests(key: string): void {
    for (const request of this.#requests.get(key) ?? []) {
      request.cancelled = true;
    }
  }

  #clearError(): Error {
    return new Error(
      'Database connection initialization was cancelled by cache clear',
    );
  }

  #finishRequest(key: string, request: CacheRequest): void {
    const requests = this.#requests.get(key);
    requests?.delete(request);
    if (requests?.size === 0) this.#requests.delete(key);
    request.finish();
  }

  #registerRequest(key: string): CacheRequest {
    let finish = () => {};
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const request = {
      cancelled: this.#clearing.has(key),
      done,
      finish,
    };
    const requests = this.#requests.get(key) ?? new Set<CacheRequest>();
    requests.add(request);
    this.#requests.set(key, requests);
    return request;
  }

  #throwIfCancelled(request: CacheRequest | undefined): void {
    if (request?.cancelled) throw this.#clearError();
  }

  #throwIfFailedClosure(key: string): void {
    const failure = this.#failedClosures.get(key);
    if (failure) throw failure.error;
  }

  async #waitForEviction(key: string): Promise<void> {
    while (true) {
      const eviction = this.#evictions.get(key);
      if (!eviction) return;
      await eviction.promise;
    }
  }
}

/**
 * Adds cached-resource validation to a shared cache created by an older module.
 *
 * JSON connection caches live on `globalThis`, so a compatible older SDK copy
 * can create the shared object before this module loads. Mutating that object
 * preserves one cache for both module copies while upgrading its four-argument
 * `getOrCreate` method to the current validation contract.
 */
export function enableCachedValidation<T>(
  cache: ConnectionCache<T>,
): ConnectionCache<T> {
  const compatible = cache as ConnectionCache<T> &
    Record<symbol, boolean | undefined>;
  if (compatible[CACHED_VALIDATION_CAPABILITY]) return cache;

  const legacyGetOrCreate = cache.getOrCreate.bind(cache) as (
    key: string | undefined,
    options: DatabaseCacheOptions,
    create: () => Promise<T>,
    close: (connection: T) => Promise<void>,
  ) => Promise<T>;
  const legacyClear = cache.clear.bind(cache);
  const locks = new Map<string, Promise<void>>();
  let clearGeneration = 0;
  let activeClear: Promise<void> | undefined;

  const runLocked = async <R>(key: string, work: () => Promise<R>) => {
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = previous.then(
      () => current,
      () => current,
    );
    locks.set(key, chain);
    await previous.catch(() => {});
    try {
      return await work();
    } finally {
      release();
      if (locks.get(key) === chain) locks.delete(key);
    }
  };

  Object.defineProperty(cache, 'getOrCreate', {
    configurable: true,
    value: async (
      key: string | undefined,
      options: DatabaseCacheOptions,
      create: () => Promise<T>,
      close: (connection: T) => Promise<void>,
      validateCached?: (connection: T) => Promise<boolean>,
    ): Promise<T> => {
      if (!key || options.cache === false) {
        return legacyGetOrCreate(key, options, create, close);
      }
      const requestGeneration = clearGeneration;
      const throwIfCleared = () => {
        if (activeClear || requestGeneration !== clearGeneration) {
          throw new Error(
            'Database connection initialization was cancelled by cache clear',
          );
        }
      };

      return runLocked(key, async () => {
        throwIfCleared();
        let requestOptions = options;
        while (true) {
          throwIfCleared();
          const candidate = await legacyGetOrCreate(
            key,
            requestOptions,
            create,
            close,
          );
          throwIfCleared();
          if (!validateCached) return candidate;

          const isValid = await validateCached(candidate);
          throwIfCleared();
          if (isValid) {
            // Reacquire under the compatibility lock so an explicit eviction
            // that completed during validation cannot make us return its old
            // resource.
            const confirmed = await legacyGetOrCreate(
              key,
              { ...requestOptions, clearCache: false },
              create,
              close,
            );
            throwIfCleared();
            if (confirmed === candidate) return candidate;
          } else {
            await cache.evict(key, close);
          }
          requestOptions = { ...options, clearCache: false };
        }
      });
    },
    writable: true,
  });
  Object.defineProperty(cache, 'clear', {
    configurable: true,
    value: async (close: (connection: T) => Promise<void>): Promise<void> => {
      if (activeClear) return activeClear;

      clearGeneration += 1;
      const clearing = (async () => {
        let clearError: unknown;
        let clearFailed = false;
        try {
          await legacyClear(close);
        } catch (error) {
          clearFailed = true;
          clearError = error;
        }
        while (locks.size > 0) {
          await Promise.allSettled([...locks.values()]);
        }
        if (clearFailed) throw clearError;
      })();
      activeClear = clearing;
      try {
        await clearing;
      } finally {
        if (activeClear === clearing) activeClear = undefined;
      }
    },
    writable: true,
  });
  Object.defineProperty(cache, CACHED_VALIDATION_CAPABILITY, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  return cache;
}

export function validateDatabaseCacheOptions(options: DatabaseCacheOptions) {
  if (options.dbid === '') {
    throw new Error('Database cache dbid must be a non-empty string');
  }
}
