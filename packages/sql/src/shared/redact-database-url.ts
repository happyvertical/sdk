const CREDENTIAL_PARAM = /(?:auth|credential|key|pass|secret|token)/i;
const REMOTE_DATABASE_SCHEME = /^((?:https?|libsql):)/i;
const REMOTE_DATABASE_AUTHORITY = /^(?:https?|libsql):\/\//i;

function redactMalformedUrl(value: string): string {
  const authorityStart = value.indexOf('//');
  if (authorityStart >= 0 && value.indexOf('@', authorityStart + 2) >= 0) {
    // Once parsing has failed, an `@` may belong to userinfo or to a secret
    // query/fragment value. Redact the whole malformed authority and suffix so
    // neither interpretation can expose a credential tail.
    return `${value.slice(0, authorityStart + 2)}[redacted]`;
  }

  const queryStart = value.indexOf('?');
  const fragmentStart = value.indexOf('#');
  const suffixStarts = [queryStart, fragmentStart].filter(
    (index) => index >= 0,
  );
  if (suffixStarts.length === 0) return value;
  const suffixStart = Math.min(...suffixStarts);
  return `${value.slice(0, suffixStart)}${value[suffixStart]}[redacted]`;
}

/** Redacts credentials without requiring the input to be a valid URL. */
export function redactDatabaseUrl(value: string): string {
  const remoteCandidate = value.replace(/[\t\n\r]/g, '').trim();
  const remoteScheme = REMOTE_DATABASE_SCHEME.exec(remoteCandidate);
  if (remoteScheme && !REMOTE_DATABASE_AUTHORITY.test(remoteCandidate)) {
    return `${remoteScheme[1]}[redacted]`;
  }

  try {
    const url = new URL(remoteScheme ? remoteCandidate : value);
    if (remoteScheme && !url.host) {
      return `${remoteScheme[1]}//[redacted]`;
    }
    if (url.username) url.username = '[redacted]';
    if (url.password) url.password = '[redacted]';
    for (const key of url.searchParams.keys()) {
      if (CREDENTIAL_PARAM.test(key)) url.searchParams.set(key, '[redacted]');
    }
    if (url.hash) url.hash = '[redacted]';
    return url.toString();
  } catch {
    return redactMalformedUrl(remoteScheme ? remoteCandidate : value);
  }
}
