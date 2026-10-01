/**
 * When the optional `@huggingface/transformers` peer is not installed, the
 * local transcriber fails with a `SpeechConfigurationError` and an install hint.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@huggingface/transformers', () => {
  const error = new Error(
    "Cannot find package '@huggingface/transformers' imported from local.js",
  ) as Error & { code?: string };
  error.code = 'ERR_MODULE_NOT_FOUND';
  throw error;
});

describe('missing transformers.js peer', () => {
  it('throws SpeechConfigurationError with an install hint', async () => {
    const { SpeechConfigurationError } = await import('../index.js');
    const { createLocalTranscriber, isLocalTranscriberAvailable } =
      await import('../local.js');
    const transcriber = createLocalTranscriber({}, { env: {} });

    const error = await transcriber
      .transcribe({
        audio: new Uint8Array([1]),
        mimeType: 'audio/pcm;rate=16000',
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SpeechConfigurationError);
    expect((error as Error).message).toContain(
      'pnpm add @huggingface/transformers',
    );
    expect((error as Error).cause).toBeDefined();
    expect(await isLocalTranscriberAvailable()).toBe(false);
  });
});
