/**
 * Opt-in smoke test: downloads a tiny Whisper model (~40 MB) and a sample WAV,
 * then transcribes on onnxruntime-node. Skipped unless HV_SPEECH_MODEL_TESTS=1.
 *
 *   HV_SPEECH_MODEL_TESTS=1 pnpm --filter @happyvertical/speech test local-transcriber.smoke
 */

import { describe, expect, it } from 'vitest';
import { createLocalTranscriber } from '../local.js';

const SAMPLE_URL =
  'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav';

describe.skipIf(process.env.HV_SPEECH_MODEL_TESTS !== '1')(
  'local transcriber smoke test (real model)',
  () => {
    it('transcribes a sample with whisper-tiny.en', {
      timeout: 300_000,
    }, async () => {
      const audio = new Uint8Array(
        await (await fetch(SAMPLE_URL)).arrayBuffer(),
      );
      const transcriber = createLocalTranscriber({
        model:
          process.env.HV_SPEECH_LOCAL_MODEL ?? 'onnx-community/whisper-tiny.en',
      });

      const result = await transcriber.transcribe({
        audio,
        mimeType: 'audio/wav',
        timestampGranularities: ['segment'],
      });
      await transcriber.dispose();

      expect(result.text.toLowerCase()).toContain('ask not what your country');
      expect(result.usage?.audioSeconds).toBeGreaterThan(10);
      expect(result.segments?.length).toBeGreaterThan(0);
    });
  },
);
