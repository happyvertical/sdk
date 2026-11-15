import { type DatabaseEngine, ReopenNotSupportedError } from './types';

/**
 * A `reopenOptions` for engines that allow one owner per database: it refuses
 * with {@link ReopenNotSupportedError}.
 */
export function refuseReopen(
  engine: DatabaseEngine,
  reason: string,
): () => never {
  return () => {
    throw new ReopenNotSupportedError(engine, reason);
  };
}
