/**
 * @happyvertical/speech/local
 *
 * On-device speech-to-text with transformers.js (`@huggingface/transformers`,
 * an optional peer dependency loaded on first use). Importing this entry
 * registers `type: 'local'` with `getTranscriber()` and `getSpeech()`.
 *
 * @example
 * ```typescript
 * import { getTranscriber } from '@happyvertical/speech';
 * import '@happyvertical/speech/local';
 *
 * const transcriber = await getTranscriber({ type: 'local' });
 * const { text } = await transcriber.transcribe({ audio: wavBytes, mimeType: 'audio/wav' });
 * ```
 *
 * @packageDocumentation
 */

import { resolveLocalTranscriberOptions } from './adapters/local/env.js';
import { loadTransformers } from './adapters/local/runtime.js';
import { LocalTranscriber } from './adapters/local/transcriber.js';
import type { LocalTranscriberOptions } from './adapters/local/types.js';
import type { SpeechFactoryContext } from './shared/factory.js';
import { registerOptionalTranscriber } from './shared/registry.js';

export {
  decodeToPcm16k,
  LOCAL_SAMPLE_RATE,
} from './adapters/local/audio.js';
export { LOCAL_TRANSCRIBER_ENV_KEYS } from './adapters/local/env.js';
export {
  TRANSFORMERS_INSTALL_HINT,
  TRANSFORMERS_PACKAGE,
} from './adapters/local/runtime.js';
export {
  DEFAULT_LOCAL_MODEL,
  LocalTranscriber,
} from './adapters/local/transcriber.js';
export type {
  DecodedAudio,
  LocalAudioDecoder,
  LocalTranscriberDevice,
  LocalTranscriberDtype,
  LocalTranscriberOptions,
  LocalTranscriberProgress,
  LocalTranscriberProgressCallback,
  LocalTranscriberSettings,
  LocalTransformersRuntime,
} from './adapters/local/types.js';
export {
  LocalTranscriberWorkerClient,
  type LocalTranscriberWorkerClientOptions,
  type LocalWorkerAudio,
  type LocalWorkerEndpoint,
  type LocalWorkerRequest,
  type LocalWorkerResponse,
  serveLocalTranscriber,
} from './adapters/local/worker.js';

/**
 * Creates an on-device transcriber. Explicit options win over
 * `HAVE_SPEECH_TRANSCRIBER_*` environment variables (see
 * `LOCAL_TRANSCRIBER_ENV_KEYS`). The model loads on first use.
 */
export function createLocalTranscriber(
  options: LocalTranscriberOptions = {},
  context: Pick<SpeechFactoryContext, 'env'> = {},
): LocalTranscriber {
  return new LocalTranscriber(resolveLocalTranscriberOptions(options, context));
}

/**
 * Resolves `true` when `@huggingface/transformers` can be imported in this
 * runtime. This imports the runtime, so call it only when you intend to use it.
 */
export async function isLocalTranscriberAvailable(): Promise<boolean> {
  try {
    await loadTransformers(undefined);
    return true;
  } catch {
    return false;
  }
}

registerOptionalTranscriber('local', (options, context) =>
  createLocalTranscriber(
    { ...options, type: 'local' } as LocalTranscriberOptions,
    context,
  ),
);
