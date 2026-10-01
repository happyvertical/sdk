/**
 * Environment configuration for the `local` transcriber. Explicit options win,
 * then the factory context, then `HAVE_SPEECH_TRANSCRIBER_*` variables (Node).
 */

import {
  defaultEnv,
  readEnv,
  resolveTranscriberConfig,
} from '../../shared/env.js';
import type { SpeechFactoryContext } from '../../shared/factory.js';
import type { LocalTranscriberOptions } from './types.js';

/** Local-only environment variables, in priority order. */
export const LOCAL_TRANSCRIBER_ENV_KEYS = {
  device: ['HAVE_SPEECH_TRANSCRIBER_DEVICE'],
  dtype: ['HAVE_SPEECH_TRANSCRIBER_DTYPE'],
  cacheDir: ['HAVE_SPEECH_TRANSCRIBER_CACHE_DIR'],
  modelHost: ['HAVE_SPEECH_TRANSCRIBER_MODEL_HOST'],
} as const;

/**
 * Merges explicit options with the environment. `model` and `maxBytes` reuse
 * the shared `HAVE_SPEECH_TRANSCRIBER_MODEL`/`_MAX_BYTES` keys.
 */
export function resolveLocalTranscriberOptions(
  options: LocalTranscriberOptions = {},
  context: Pick<SpeechFactoryContext, 'env'> = {},
): LocalTranscriberOptions {
  const env = context.env ?? defaultEnv();
  const shared = resolveTranscriberConfig(
    { model: options.model, maxBytes: options.maxBytes },
    { env },
  );

  return {
    ...options,
    type: 'local',
    model: shared.model,
    maxBytes: shared.maxBytes,
    device:
      options.device ?? readEnv(env, ...LOCAL_TRANSCRIBER_ENV_KEYS.device),
    dtype: options.dtype ?? readEnv(env, ...LOCAL_TRANSCRIBER_ENV_KEYS.dtype),
    cacheDir:
      options.cacheDir ?? readEnv(env, ...LOCAL_TRANSCRIBER_ENV_KEYS.cacheDir),
    modelHost:
      options.modelHost ??
      readEnv(env, ...LOCAL_TRANSCRIBER_ENV_KEYS.modelHost),
  };
}
