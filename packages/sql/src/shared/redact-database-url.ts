const CREDENTIAL_PARAM = /(?:auth|credential|key|pass|secret|token)/i;

/** Redacts credentials without requiring the input to be a valid URL. */
export function redactDatabaseUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username) url.username = '[redacted]';
    if (url.password) url.password = '[redacted]';
    for (const key of url.searchParams.keys()) {
      if (CREDENTIAL_PARAM.test(key)) url.searchParams.set(key, '[redacted]');
    }
    if (url.hash) url.hash = '[redacted]';
    return url.toString();
  } catch {
    return (
      value
        // Parsing already failed, so conservatively treat everything between
        // authority marker and the last credential separator as sensitive.
        .replace(/(\/\/)[^\s@]*@/g, '$1[redacted]@')
        .replace(
          /([?&][^=&#]*(?:auth|credential|key|pass|secret|token)[^=&#]*=)[^&#]*/gi,
          '$1[redacted]',
        )
        .replace(/#.*/, '#[redacted]')
    );
  }
}
