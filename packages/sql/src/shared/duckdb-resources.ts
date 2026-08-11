type SyncClosable = { closeSync(): void };

/** Best-effort DuckDB resource closer. Successful resources are never closed twice. */
export function createDuckDBResourceCloser(
  connection: SyncClosable | undefined,
  instance: SyncClosable | undefined,
): () => Promise<void> {
  let connectionClosed = !connection;
  let instanceClosed = !instance;
  let active: Promise<void> | undefined;

  return async () => {
    if (connectionClosed && instanceClosed) return;
    active ??= (async () => {
      const errors: unknown[] = [];
      if (!connectionClosed) {
        try {
          connection?.closeSync();
          connectionClosed = true;
        } catch (error) {
          errors.push(error);
        }
      }
      if (!instanceClosed) {
        try {
          instance?.closeSync();
          instanceClosed = true;
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1)
        throw new AggregateError(errors, 'Failed to close DuckDB resources');
    })();
    try {
      await active;
    } finally {
      active = undefined;
    }
  };
}

export async function throwWithDuckDBCleanup(
  error: unknown,
  close: () => Promise<void>,
): Promise<never> {
  try {
    await close();
  } catch (cleanupError) {
    throw new AggregateError(
      [error, cleanupError],
      'DuckDB initialization and cleanup failed',
    );
  }
  throw error;
}
