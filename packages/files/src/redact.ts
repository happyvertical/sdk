/**
 * Recursively walk a filesystem-config-shaped object and replace any value
 * whose key looks like a secret (token, password, accessKeyId, privateKey, …)
 * with the literal string '[redacted]'.
 *
 * Useful when serializing a `GetFilesystemOptions` (or any nested config that
 * may contain provider credentials) into logs, backup manifests, status
 * dumps, or error messages.
 */
const SECRET_KEY_FRAGMENTS = [
  'apikey',
  'api_key',
  'clientsecret',
  'client_secret',
  'credential',
  'privatekey',
  'private_key',
  'secret',
  'password',
  'token',
] as const;

const EXACT_SECRET_KEYS = new Set(['serviceaccountkey', 'accesskeyid']);

function looksLikeSecret(key: string): boolean {
  const normalized = key.toLowerCase();
  if (EXACT_SECRET_KEYS.has(normalized)) return true;
  return SECRET_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

export function redactFilesystemConfig<T>(
  value: T,
): T extends object ? unknown : T {
  return redactSecrets(value, new WeakSet(), new WeakMap()) as T extends object
    ? unknown
    : T;
}

/**
 * Recurse, replacing values at secret-shaped keys with `[redacted]`.
 *
 * Distinguishes "currently being processed" (a true back-edge in the
 * recursion → cycle) from "already fully processed" (DAG-shaped input
 * where the same object is reachable via two paths). Both cases used
 * to produce `'[circular]'`, but the second case is wrong: a config
 * that legitimately shares a sub-object between branches should get
 * the same redacted output on both branches, not a sentinel on the
 * second.
 *
 * - `inProgress` tracks ancestors in the current DFS path. Re-visit
 *   → true cycle → return `'[circular]'`.
 * - `done` caches the redacted output of objects whose recursion has
 *   completed. Re-visit → DAG share → return the cached result so
 *   both branches end up with identical structure.
 */
function redactSecrets(
  value: unknown,
  inProgress: WeakSet<object>,
  done: WeakMap<object, unknown>,
): unknown {
  if (!value || typeof value !== 'object') return value;
  const obj = value as object;
  if (done.has(obj)) return done.get(obj);
  if (inProgress.has(obj)) return '[circular]';
  inProgress.add(obj);

  let result: unknown;
  if (Array.isArray(value)) {
    result = value.map((item) => redactSecrets(item, inProgress, done));
  } else {
    result = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        looksLikeSecret(key)
          ? '[redacted]'
          : redactSecrets(item, inProgress, done),
      ]),
    );
  }

  inProgress.delete(obj);
  done.set(obj, result);
  return result;
}
