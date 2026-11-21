import { CONNECTION_AFFINITY, type ConnectionAffinityKind } from './types';

/**
 * Stamps `handle` with a frozen, non-enumerable, non-writable claim naming
 * itself (see `ConnectionAffinityClaim`). Adapter-internal: an adapter calls
 * this only on handles whose every member really uses the claimed connection.
 */
export function claimConnectionAffinity<T extends object>(
  handle: T,
  kind: ConnectionAffinityKind,
): T {
  Object.defineProperty(handle, CONNECTION_AFFINITY, {
    value: Object.freeze({ kind, handle }),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return handle;
}
