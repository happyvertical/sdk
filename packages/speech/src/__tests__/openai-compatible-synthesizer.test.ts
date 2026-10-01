import { describe, expect, it, vi } from 'vitest';
import { getSpeechSynthesizer, SpeechConfigurationError } from '../index.js';

/** Synthesizes once against `options` and returns the requested URL. */
async function requestedUrl(options: {
  baseUrl: string;
  speechPath?: string;
}): Promise<string> {
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      }),
  );
  const synthesizer = await getSpeechSynthesizer({
    type: 'openai-compatible',
    fetch,
    ...options,
  });
  await synthesizer.synthesize({ text: 'hello' });
  expect(fetch).toHaveBeenCalledTimes(1);
  return String(fetch.mock.calls[0]?.[0]);
}

describe('openai-compatible synthesizer URL resolution', () => {
  it.each([
    ['http://gw:8080', 'http://gw:8080/v1/audio/speech'],
    ['http://gw:8080/', 'http://gw:8080/v1/audio/speech'],
    ['http://gw/tts/v1', 'http://gw/tts/v1/audio/speech'],
    ['http://gw/tts/v1/', 'http://gw/tts/v1/audio/speech'],
    ['http://gw/openai/v2', 'http://gw/openai/v2/audio/speech'],
    ['http://gw/tts', 'http://gw/tts/v1/audio/speech'],
    ['http://gw/tts/v1/audio/speech', 'http://gw/tts/v1/audio/speech'],
    [
      'http://gw/openai/v1?api-version=2025-01-01',
      'http://gw/openai/v1/audio/speech?api-version=2025-01-01',
    ],
    [
      'http://gw/v1/audio/speech?api-version=2025-01-01#frag',
      'http://gw/v1/audio/speech?api-version=2025-01-01',
    ],
  ])('resolves the default path for base %s', async (baseUrl, expected) => {
    await expect(requestedUrl({ baseUrl })).resolves.toBe(expected);
  });

  it('keeps an explicit speechPath relative to the base URL', async () => {
    await expect(
      requestedUrl({
        baseUrl: 'http://gw/tts/v1',
        speechPath: '/custom/audio',
      }),
    ).resolves.toBe('http://gw/tts/v1/custom/audio');
    await expect(
      requestedUrl({
        baseUrl: 'http://gw:8080',
        speechPath: '/v1/audio/speech',
      }),
    ).resolves.toBe('http://gw:8080/v1/audio/speech');
    await expect(
      requestedUrl({
        baseUrl: 'http://gw/tts?api-version=1',
        speechPath: 'audio/speech',
      }),
    ).resolves.toBe('http://gw/tts/audio/speech?api-version=1');
  });

  it('defers baseUrl validation to synthesize() and never calls fetch', async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([1])));
    const synthesizer = await getSpeechSynthesizer({
      type: 'openai-compatible',
      baseUrl: 'not a url',
      fetch,
    });

    await expect(synthesizer.synthesize({ text: 'hello' })).rejects.toThrow(
      SpeechConfigurationError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses an absolute speechPath unchanged', async () => {
    await expect(
      requestedUrl({
        baseUrl: 'http://gw',
        speechPath: 'https://other.example/v1/audio/speech',
      }),
    ).resolves.toBe('https://other.example/v1/audio/speech');
  });
});
