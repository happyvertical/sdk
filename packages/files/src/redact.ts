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
  return redactSecrets(value) as T extends object ? unknown : T;
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      looksLikeSecret(key) ? '[redacted]' : redactSecrets(item),
    ]),
  );
}
