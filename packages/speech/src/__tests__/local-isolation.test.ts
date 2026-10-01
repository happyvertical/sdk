// biome-ignore-all lint/style/useNamingConvention: Environment variable keys are SCREAMING_SNAKE_CASE.
/**
 * The core entry must never load `@huggingface/transformers`, and `local`
 * stays opt-in until `@happyvertical/speech/local` is imported. This file
 * deliberately never imports the local entry.
 */

import { describe, expect, it, vi } from 'vitest';

const runtimeLoads = vi.hoisted(() => ({ count: 0 }));

vi.mock('@huggingface/transformers', () => {
  runtimeLoads.count++;
  return { pipeline: vi.fn() };
});

describe('core entry isolation', () => {
  it('never loads transformers.js when using the core package', async () => {
    const speech = await import('../index.js');

    expect(speech.getAvailableSpeechAdapters().transcribers).toEqual([
      'studio-server',
      'openai-compatible',
    ]);
    await speech.getTranscriber(
      { type: 'openai-compatible', baseUrl: 'https://stt.example.com' },
      { env: {} },
    );
    await speech.getSpeech({ synthesizer: false }, { env: {} });

    expect(runtimeLoads.count).toBe(0);
  });

  it('explains how to enable local before the subpath is imported', async () => {
    const { getTranscriber, SpeechConfigurationError } = await import(
      '../index.js'
    );

    const fromOptions = getTranscriber({ type: 'local' }, { env: {} });
    await expect(fromOptions).rejects.toBeInstanceOf(SpeechConfigurationError);
    await expect(fromOptions).rejects.toThrow(
      "import '@happyvertical/speech/local'",
    );
    await expect(
      getTranscriber({}, { env: { HAVE_SPEECH_TRANSCRIBER_TYPE: 'local' } }),
    ).rejects.toThrow("import '@happyvertical/speech/local'");
    expect(runtimeLoads.count).toBe(0);
  });

  it('defers loading transformers.js until the first local transcription', async () => {
    const { createLocalTranscriber } = await import('../local.js');
    const transcriber = createLocalTranscriber({}, { env: {} });
    expect(runtimeLoads.count).toBe(0);

    await transcriber.preload().catch(() => undefined);
    expect(runtimeLoads.count).toBe(1);
  });
});
