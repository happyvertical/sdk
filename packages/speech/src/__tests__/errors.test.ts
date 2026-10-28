/**
 * Distinct error classes for an oversized upload, undecodable audio, and a
 * provider or setup failure (#1314), each still an instance of the class it
 * used to be.
 */
import { describe, expect, it } from 'vitest';
import {
  getTranscriber,
  SpeechAudioTooLargeError,
  SpeechConfigurationError,
  SpeechError,
  SpeechInvalidAudioError,
  SpeechProviderError,
  SpeechProviderUnavailableError,
} from '../index.js';
import { normalizeAudioInput } from '../shared/audio.js';
import { unwrapRawAudio } from '../shared/pcm.js';

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('speech error classes', () => {
  it('reports oversized audio as SpeechAudioTooLargeError', async () => {
    for (const data of [
      new Uint8Array(16),
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(10));
          controller.enqueue(new Uint8Array(10));
          controller.close();
        },
      }),
    ]) {
      const error = await rejection(
        normalizeAudioInput({ data }, { maxBytes: 8, adapter: 'test' }),
      );
      expect(error).toBeInstanceOf(SpeechAudioTooLargeError);
      expect(error).toBeInstanceOf(SpeechConfigurationError);
      expect(error).toMatchObject({
        name: 'SpeechAudioTooLargeError',
        code: 'SPEECH_AUDIO_TOO_LARGE',
        maxBytes: 8,
        adapter: 'test',
      });
    }
  });

  it('reports empty or undecodable audio as SpeechInvalidAudioError', async () => {
    const empty = await rejection(
      normalizeAudioInput({ data: new Uint8Array(0) }, { adapter: 'test' }),
    );
    expect(empty).toBeInstanceOf(SpeechInvalidAudioError);
    expect(empty).toBeInstanceOf(SpeechConfigurationError);
    expect(empty).toMatchObject({ code: 'SPEECH_INVALID_AUDIO' });

    for (const [bytes, mimeType] of [
      [new Uint8Array(8), 'audio/webm'],
      [new Uint8Array(3), 'audio/L16'],
      [new Uint8Array(12), 'audio/wav'],
    ] as const) {
      expect(() => unwrapRawAudio(bytes, mimeType, 'test')).toThrow(
        SpeechInvalidAudioError,
      );
    }
  });

  it('keeps setup errors as plain SpeechConfigurationError', async () => {
    const error = await rejection(
      normalizeAudioInput({ data: new Uint8Array(1) }, { maxBytes: 0 }),
    );
    expect(error).toBeInstanceOf(SpeechConfigurationError);
    expect(error).not.toBeInstanceOf(SpeechInvalidAudioError);
    expect(error).not.toBeInstanceOf(SpeechAudioTooLargeError);
    expect(error).toMatchObject({ code: 'SPEECH_CONFIGURATION_ERROR' });
  });

  it('marks 429 and 5xx provider errors retryable, others not', () => {
    const at = (status?: number) =>
      new SpeechProviderError('test', 'x', { status }).retryable;
    expect([429, 500, 503].map(at)).toEqual([true, true, true]);
    expect([400, 401, 404, 413, undefined].map(at)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('reports an unreachable provider as SpeechProviderUnavailableError', async () => {
    const cause = new TypeError('fetch failed');
    let calls = 0;
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://speech.example/v1',
      apiKey: 'sk-secret-test',
      fetch: async () => {
        calls += 1;
        throw cause;
      },
    });
    const error = await rejection(
      transcriber.transcribe({ audio: { data: new Uint8Array([1, 2]) } }),
    );
    expect(error).toBeInstanceOf(SpeechProviderUnavailableError);
    expect(error).toBeInstanceOf(SpeechProviderError);
    expect(error).toBeInstanceOf(SpeechError);
    expect(error).toMatchObject({
      code: 'SPEECH_PROVIDER_UNAVAILABLE',
      retryable: true,
      status: undefined,
      cause,
    });
    const message = (error as Error).message;
    expect(message).not.toContain('speech.example');
    expect(message).not.toContain('sk-secret-test');
    // The automatic retry still covers 429/5xx only.
    expect(calls).toBe(1);
  });

  it('leaves a caller abort as the abort error', async () => {
    const controller = new AbortController();
    const transcriber = await getTranscriber({
      type: 'studio-server',
      baseUrl: 'http://speech.example',
      fetch: (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        }),
    });
    const pending = rejection(
      transcriber.transcribe({
        audio: { data: new Uint8Array([1]) },
        signal: controller.signal,
      }),
    );
    controller.abort(new DOMException('caller abort', 'AbortError'));
    const error = await pending;
    expect(error).not.toBeInstanceOf(SpeechProviderUnavailableError);
    expect(error).toMatchObject({ name: 'AbortError' });
  });
});
