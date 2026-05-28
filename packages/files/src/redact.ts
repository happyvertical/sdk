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
  return redactSecrets(value, new WeakSet()) as T extends object ? unknown : T;
}

/**
 * Recurse, replacing values at secret-shaped keys with `[redacted]`.
 *
 * `seen` is a WeakSet of already-visited objects/arrays. Configs handed
 * to this helper can come from anywhere — ORM connection bags,
 * EventEmitter-backed config holders, user-constructed objects — and
 * those occasionally carry circular references. Without a visited
 * guard the recursion overflows the stack on cyclic input. The guard
 * returns the `'[circular]'` sentinel for a re-visit, which is more
 * useful than a crash and still hides any nested secrets.
 */
function redactSecrets(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    return value.map((item) => redactSecrets(item, seen));
  }
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[circular]';
  seen.add(value as object);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      looksLikeSecret(key) ? '[redacted]' : redactSecrets(item, seen),
    ]),
  );
}
