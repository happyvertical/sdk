import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MAX_AUDIO_BYTES,
  getSpeech,
  getTranscriber,
  mimeTypeToAudioExtension,
  SpeechConfigurationError,
  SpeechProviderError,
  type SpeechUsage,
} from '../index.js';
import { resolveOpenAICompatibleUrl } from '../shared/http.js';
import { parseRetryAfter } from '../shared/retry.js';

interface CapturedRequest {
  url: string;
  headers: Headers;
  form: FormData;
  signal?: AbortSignal | null;
}

type Reply = Response | ((request: CapturedRequest) => Response);

/** Injected fetch that records requests and replays canned responses. */
function mockFetch(...replies: Reply[]) {
  const requests: CapturedRequest[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: CapturedRequest = {
      url: String(input),
      headers: new Headers(init?.headers),
      form: init?.body as FormData,
      signal: init?.signal,
    };
    requests.push(request);
    const reply = replies[Math.min(requests.length - 1, replies.length - 1)];
    if (!reply) {
      throw new Error('No mock reply configured');
    }
    return typeof reply === 'function' ? reply(request) : reply.clone();
  });
  return { fetch, requests };
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

const VERBOSE_RESPONSE = {
  task: 'transcribe',
  language: 'english',
  duration: 2.5,
  text: 'Hello world.',
  segments: [{ id: 0, start: 0, end: 2.5, text: 'Hello world.' }],
  words: [
    { word: 'Hello', start: 0, end: 1.1 },
    { word: 'world', start: 1.2, end: 2.4 },
  ],
  usage: { type: 'duration', seconds: 3 },
};

const audio = () => new Uint8Array([1, 2, 3, 4]);

describe('openai-compatible transcriber', () => {
  it('resolves server roots, versioned API roots, and full endpoints', () => {
    const resource = 'audio/transcriptions';
    expect(resolveOpenAICompatibleUrl('https://api.openai.com', resource)).toBe(
      'https://api.openai.com/v1/audio/transcriptions',
    );
    expect(resolveOpenAICompatibleUrl('http://gateway/stt/v1', resource)).toBe(
      'http://gateway/stt/v1/audio/transcriptions',
    );
    expect(resolveOpenAICompatibleUrl('http://gateway/stt/v1/', resource)).toBe(
      'http://gateway/stt/v1/audio/transcriptions',
    );
    expect(
      resolveOpenAICompatibleUrl(
        'http://gateway/openai/v1/audio/transcriptions/',
        resource,
      ),
    ).toBe('http://gateway/openai/v1/audio/transcriptions');
    expect(() => resolveOpenAICompatibleUrl('  ', resource)).toThrow(
      SpeechConfigurationError,
    );
  });

  it('posts OpenAI multipart fields and maps verbose_json segments, words, and usage', async () => {
    const { fetch, requests } = mockFetch(json(VERBOSE_RESPONSE));
    const onUsage = vi.fn();
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://gateway/stt/v1',
      apiKey: 'sk-test',
      headers: { 'x-bf-vk': 'vk-default', 'openai-project': 'proj_1' },
      fetch,
      onUsage,
    });

    const result = await transcriber.transcribe({
      audio: new Blob([audio()], { type: 'audio/webm;codecs=opus' }),
      language: 'en',
      prompt: 'Greeting',
      temperature: 0,
      timestampGranularities: ['word', 'segment', 'word'],
      headers: { 'x-bf-vk': 'vk-tenant-42' },
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [request] = requests;
    expect(request?.url).toBe('http://gateway/stt/v1/audio/transcriptions');
    expect(request?.headers.get('authorization')).toBe('Bearer sk-test');
    expect(request?.headers.get('x-bf-vk')).toBe('vk-tenant-42');
    expect(request?.headers.get('openai-project')).toBe('proj_1');

    const form = request?.form as FormData;
    const file = form.get('file') as File;
    expect(file.name).toBe('audio.webm');
    expect(file.type).toBe('audio/webm;codecs=opus');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(audio());
    expect(form.get('model')).toBe('whisper-1');
    expect(form.get('language')).toBe('en');
    expect(form.get('prompt')).toBe('Greeting');
    expect(form.get('temperature')).toBe('0');
    expect(form.get('response_format')).toBe('verbose_json');
    expect(form.getAll('timestamp_granularities[]')).toEqual([
      'word',
      'segment',
    ]);

    const expectedUsage: SpeechUsage = {
      operation: 'transcription',
      provider: 'openai-compatible',
      model: 'whisper-1',
      audioSeconds: 2.5,
      bytes: 4,
      providerUsage: { type: 'duration', seconds: 3 },
    };
    expect(result).toMatchObject({
      text: 'Hello world.',
      language: 'english',
      durationSeconds: 2.5,
      provider: 'openai-compatible',
      model: 'whisper-1',
      segments: [{ text: 'Hello world.', startSeconds: 0, endSeconds: 2.5 }],
      words: [
        { word: 'Hello', startSeconds: 0, endSeconds: 1.1 },
        { word: 'world', startSeconds: 1.2, endSeconds: 2.4 },
      ],
      usage: expectedUsage,
    });
    expect(onUsage).toHaveBeenCalledWith(expectedUsage);
  });

  it('maps plain text responses and reports caller-provided duration', async () => {
    const { fetch, requests } = mockFetch(
      new Response('Plain transcript.\n', {
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      }),
    );
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'https://api.example.com',
      model: 'whisper-large-v3',
      fetch,
    });

    const result = await transcriber.transcribe({
      audio: { data: audio(), mimeType: 'audio/wav', durationSeconds: 1.5 },
      responseFormat: 'text',
      timestampGranularities: ['word'],
    });

    const form = requests[0]?.form as FormData;
    expect(requests[0]?.url).toBe(
      'https://api.example.com/v1/audio/transcriptions',
    );
    expect(requests[0]?.headers.has('authorization')).toBe(false);
    expect((form.get('file') as File).name).toBe('audio.wav');
    expect(form.get('response_format')).toBe('text');
    expect(form.getAll('timestamp_granularities[]')).toEqual([]);
    expect(result.text).toBe('Plain transcript.');
    expect(result.segments).toBeUndefined();
    expect(result.words).toBeUndefined();
    expect(result.usage).toEqual({
      operation: 'transcription',
      provider: 'openai-compatible',
      model: 'whisper-large-v3',
      audioSeconds: 1.5,
      bytes: 4,
      providerUsage: undefined,
    });
  });

  it('sends json without timestamps to json-only gpt-4o transcribe models', async () => {
    const tokenUsage = JSON.parse(
      '{"type":"tokens","input_tokens":14,"output_tokens":45,"total_tokens":59,"input_token_details":{"text_tokens":0,"audio_tokens":14}}',
    ) as Record<string, unknown>;
    const { fetch, requests } = mockFetch(
      json({ text: 'Mini transcript', usage: tokenUsage }),
    );
    const calls: string[] = [];
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      fetch,
      onUsage: () => {
        calls.push('adapter');
      },
    });

    const result = await transcriber.transcribe({
      audio: audio(),
      mimeType: 'audio/mp4',
      model: 'openai/gpt-4o-mini-transcribe',
      responseFormat: 'verbose_json',
      timestampGranularities: ['word'],
      onUsage: async (usage) => {
        calls.push(`request:${usage.model}`);
      },
    });

    const form = requests[0]?.form as FormData;
    expect(form.get('model')).toBe('openai/gpt-4o-mini-transcribe');
    expect(form.get('response_format')).toBe('json');
    expect(form.getAll('timestamp_granularities[]')).toEqual([]);
    expect((form.get('file') as File).name).toBe('audio.m4a');
    expect(result.text).toBe('Mini transcript');
    expect(result.segments).toBeUndefined();
    expect(result.usage?.providerUsage).toEqual(tokenUsage);
    expect(result.usage?.audioSeconds).toBeUndefined();
    expect(calls).toEqual(['adapter', 'request:openai/gpt-4o-mini-transcribe']);
  });

  it('falls back to json when a server rejects verbose_json or timestamps', async () => {
    const { fetch, requests } = mockFetch(
      json(
        {
          error: {
            message:
              "response_format 'verbose_json' is not compatible with model",
          },
        },
        { status: 400 },
      ),
      json({ text: 'Fallback transcript' }),
    );
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://vllm:8000/v1',
      model: 'custom-asr',
      fetch,
    });

    const result = await transcriber.transcribe({
      audio: audio(),
      timestampGranularities: ['segment'],
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requests[0]?.form.get('response_format')).toBe('verbose_json');
    expect(requests[1]?.form.get('response_format')).toBe('json');
    expect(requests[1]?.form.getAll('timestamp_granularities[]')).toEqual([]);
    expect(result.text).toBe('Fallback transcript');
  });

  it('does not fall back or retry on unrelated client errors', async () => {
    const { fetch } = mockFetch(
      json({ error: { message: 'invalid model' } }, { status: 400 }),
    );
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://speech.example/v1',
      fetch,
    });

    const error = await transcriber
      .transcribe({ audio: audio() })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SpeechProviderError);
    expect((error as SpeechProviderError).status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries 429 and 5xx with backoff until success', async () => {
    const { fetch } = mockFetch(
      json({}, { status: 429, headers: { 'retry-after': '0' } }),
      json({}, { status: 503 }),
      json({ text: 'third time' }),
    );
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://speech.example/v1',
      retry: { initialDelayMs: 1 },
      fetch,
    });

    await expect(
      transcriber.transcribe({ audio: audio() }),
    ).resolves.toMatchObject({ text: 'third time' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('honours Retry-After before retrying', async () => {
    const { fetch } = mockFetch(
      json({}, { status: 429, headers: { 'retry-after': '0.08' } }),
      json({ text: 'ok' }),
    );
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://speech.example/v1',
      retry: { initialDelayMs: 1 },
      fetch,
    });

    const started = Date.now();
    await transcriber.transcribe({ audio: audio() });
    expect(Date.now() - started).toBeGreaterThanOrEqual(70);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('stops retrying when exhausted, disabled, or Retry-After exceeds maxDelayMs', async () => {
    const exhausted = mockFetch(json({}, { status: 502 }));
    await expect(
      (
        await getTranscriber({
          type: 'openai-compatible',
          baseUrl: 'http://speech.example/v1',
          retry: { maxRetries: 1, initialDelayMs: 1 },
          fetch: exhausted.fetch,
        })
      ).transcribe({ audio: audio() }),
    ).rejects.toMatchObject({ status: 502 });
    expect(exhausted.fetch).toHaveBeenCalledTimes(2);

    const disabled = mockFetch(json({}, { status: 500 }));
    await expect(
      (
        await getTranscriber({
          type: 'openai-compatible',
          baseUrl: 'http://speech.example/v1',
          retry: false,
          fetch: disabled.fetch,
        })
      ).transcribe({ audio: audio() }),
    ).rejects.toMatchObject({ status: 500 });
    expect(disabled.fetch).toHaveBeenCalledTimes(1);

    const tooLong = mockFetch(
      json({}, { status: 429, headers: { 'retry-after': '120' } }),
    );
    await expect(
      (
        await getTranscriber({
          type: 'openai-compatible',
          baseUrl: 'http://speech.example/v1',
          retry: { maxDelayMs: 1000 },
          fetch: tooLong.fetch,
        })
      ).transcribe({ audio: audio() }),
    ).rejects.toMatchObject({ status: 429, retryAfterMs: 120_000 });
    expect(tooLong.fetch).toHaveBeenCalledTimes(1);
  });

  it('parses Retry-After seconds and HTTP dates', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfter('3', now)).toBe(3000);
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:05 GMT', now)).toBe(5000);
    expect(parseRetryAfter('Wed, 31 Dec 2025 00:00:00 GMT', now)).toBe(0);
    expect(parseRetryAfter('soon', now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
  });

  it('aborts during retry backoff without another request', async () => {
    const controller = new AbortController();
    const { fetch } = mockFetch(() => {
      setTimeout(() => controller.abort(new Error('user cancelled')), 5);
      return json({}, { status: 503 });
    });
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://speech.example/v1',
      retry: { initialDelayMs: 5_000 },
      fetch,
    });

    await expect(
      transcriber.transcribe({ audio: audio(), signal: controller.signal }),
    ).rejects.toThrow('user cancelled');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('passes the caller signal to fetch and rejects pre-aborted requests', async () => {
    const { fetch, requests } = mockFetch(json({ text: 'ok' }));
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://speech.example/v1',
      fetch,
    });
    const controller = new AbortController();

    await transcriber.transcribe({ audio: audio(), signal: controller.signal });
    expect(requests[0]?.signal).toBe(controller.signal);

    controller.abort(new Error('already cancelled'));
    await expect(
      transcriber.transcribe({ audio: audio(), signal: controller.signal }),
    ).rejects.toThrow('already cancelled');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('enforces maxBytes before any request, defaulting to 25 MB', async () => {
    const { fetch } = mockFetch(json({ text: 'ok' }));
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://speech.example/v1',
      fetch,
    });

    expect(DEFAULT_MAX_AUDIO_BYTES).toBe(25 * 1024 * 1024);
    await expect(
      transcriber.transcribe({
        audio: new Blob([new Uint8Array(DEFAULT_MAX_AUDIO_BYTES + 1)]),
      }),
    ).rejects.toBeInstanceOf(SpeechConfigurationError);
    await expect(
      transcriber.transcribe({ audio: audio(), maxBytes: 3 }),
    ).rejects.toThrow('Audio input exceeds maxBytes (4 > 3 bytes)');
    await expect(
      transcriber.transcribe({ audio: new Uint8Array(0) }),
    ).rejects.toThrow('Audio input is empty');
    await expect(
      transcriber.transcribe({ audio: audio(), maxBytes: 0 }),
    ).rejects.toThrow('maxBytes must be a positive number');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('buffers ReadableStream input and cancels streams that exceed maxBytes', async () => {
    const { fetch, requests } = mockFetch(json({ text: 'streamed' }));
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://speech.example/v1',
      maxBytes: 4096,
      fetch,
    });

    const finite = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      },
    });
    await transcriber.transcribe({ audio: finite, mimeType: 'audio/ogg' });
    const file = requests[0]?.form.get('file') as File;
    expect(file.name).toBe('audio.ogg');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );

    let pulls = 0;
    const cancel = vi.fn();
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1024));
      },
      cancel,
    });
    await expect(
      transcriber.transcribe({ audio: endless, mimeType: 'audio/webm' }),
    ).rejects.toThrow('Audio stream exceeds maxBytes');
    expect(cancel).toHaveBeenCalled();
    expect(pulls).toBeLessThan(10);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('accepts Buffer input with an explicit filename', async () => {
    const { fetch, requests } = mockFetch(json({ text: 'ok' }));
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://speech.example/v1',
      fetch,
    });

    await transcriber.transcribe({
      audio: { data: Buffer.from([9, 8, 7]), filename: 'clip.flac' },
      mimeType: 'audio/flac',
    });
    const file = requests[0]?.form.get('file') as File;
    expect(file.name).toBe('clip.flac');
    expect(file.type).toBe('audio/flac');
    expect(file.size).toBe(3);
  });

  it('maps MIME types (with codec parameters) to upload extensions', () => {
    expect(mimeTypeToAudioExtension('audio/webm;codecs=opus')).toBe('webm');
    expect(mimeTypeToAudioExtension('Audio/MP4')).toBe('m4a');
    expect(mimeTypeToAudioExtension('audio/x-m4a')).toBe('m4a');
    expect(mimeTypeToAudioExtension('video/mp4')).toBe('mp4');
    expect(mimeTypeToAudioExtension('audio/wav')).toBe('wav');
    expect(mimeTypeToAudioExtension('audio/x-wav')).toBe('wav');
    expect(mimeTypeToAudioExtension('audio/ogg; codecs="opus"')).toBe('ogg');
    expect(mimeTypeToAudioExtension('audio/mpeg')).toBe('mp3');
    expect(mimeTypeToAudioExtension('audio/flac')).toBe('flac');
    expect(mimeTypeToAudioExtension('audio/unknown')).toBeUndefined();
    expect(mimeTypeToAudioExtension('')).toBeUndefined();
    expect(mimeTypeToAudioExtension(undefined)).toBeUndefined();
  });

  it('never exposes the API key in provider errors', async () => {
    const apiKey = 'sk-secret-123';
    const { fetch } = mockFetch(
      json(
        { error: { message: `Incorrect API key provided: ${apiKey}` } },
        { status: 401 },
      ),
    );
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://speech.example/v1',
      apiKey,
      fetch,
    });

    const error = (await transcriber
      .transcribe({ audio: audio() })
      .catch((caught: unknown) => caught)) as SpeechProviderError;

    expect(error).toBeInstanceOf(SpeechProviderError);
    expect(error.status).toBe(401);
    expect(error.message).not.toContain(apiKey);
    expect(error.responseBody).not.toContain(apiKey);
    expect(error.responseBody).toContain('[REDACTED]');
    expect(JSON.stringify(error)).not.toContain(apiKey);
  });

  it('propagates usage callback failures', async () => {
    const { fetch } = mockFetch(json({ text: 'ok' }));
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://speech.example/v1',
      fetch,
      onUsage: () => {
        throw new Error('billing unavailable');
      },
    });

    await expect(transcriber.transcribe({ audio: audio() })).rejects.toThrow(
      'billing unavailable',
    );
  });

  it('configures from HAVE_SPEECH_TRANSCRIBER_* env with explicit options winning', async () => {
    const { fetch, requests } = mockFetch(json({ text: 'env' }));
    const env = Object.fromEntries([
      ['HAVE_SPEECH_TRANSCRIBER_TYPE', 'openai-compatible'],
      ['HAVE_SPEECH_TRANSCRIBER_BASE_URL', ' http://bifrost:8080/openai/v1 '],
      ['HAVE_SPEECH_TRANSCRIBER_MODEL', 'openai/whisper-1'],
      ['HAVE_SPEECH_TRANSCRIBER_API_KEY', 'sk-env'],
      ['HAVE_SPEECH_TRANSCRIBER_TIMEOUT', '5000'],
      ['HAVE_SPEECH_TRANSCRIBER_MAX_BYTES', '3'],
      ['HAVE_SPEECH_TRANSCRIBER_HEADERS', '{"x-bf-vk":"vk-env","x-extra":"1"}'],
    ]);

    const speech = await getSpeech({}, { env, fetch });
    expect(speech.transcriber?.type).toBe('openai-compatible');
    await expect(speech.transcribe({ audio: audio() })).rejects.toThrow(
      'Audio input exceeds maxBytes (4 > 3 bytes)',
    );
    await speech.transcribe({ audio: new Uint8Array([1, 2]) });
    expect(requests[0]?.url).toBe(
      'http://bifrost:8080/openai/v1/audio/transcriptions',
    );
    expect(requests[0]?.form.get('model')).toBe('openai/whisper-1');
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer sk-env');
    expect(requests[0]?.headers.get('x-bf-vk')).toBe('vk-env');

    const explicit = await getTranscriber(
      {
        model: 'whisper-large-v3',
        apiKey: 'sk-explicit',
        maxBytes: 1024,
        headers: { 'x-bf-vk': 'vk-explicit' },
      },
      { env, fetch },
    );
    await explicit.transcribe({ audio: audio() });
    expect(requests[1]?.form.get('model')).toBe('whisper-large-v3');
    expect(requests[1]?.headers.get('authorization')).toBe(
      'Bearer sk-explicit',
    );
    expect(requests[1]?.headers.get('x-bf-vk')).toBe('vk-explicit');
    expect(requests[1]?.headers.get('x-extra')).toBe('1');
  });

  it('rejects malformed header env and a missing base URL without echoing values', async () => {
    const secret = 'vk-super-secret';
    const envWithHeaders = (headers: string) =>
      Object.fromEntries([
        ['HAVE_SPEECH_TRANSCRIBER_TYPE', 'openai-compatible'],
        ['HAVE_SPEECH_TRANSCRIBER_BASE_URL', 'http://speech.example/v1'],
        ['HAVE_SPEECH_TRANSCRIBER_HEADERS', headers],
      ]);

    const malformed = (await getTranscriber(
      {},
      { env: envWithHeaders(`x-bf-vk: ${secret}`) },
    ).catch((caught: unknown) => caught)) as Error;
    expect(malformed).toBeInstanceOf(SpeechConfigurationError);
    expect(malformed.message).toMatch(
      /^HAVE_SPEECH_TRANSCRIBER_HEADERS must be a JSON object/,
    );
    expect(malformed.message).not.toContain(secret);

    await expect(
      getTranscriber({}, { env: envWithHeaders('{"x-bf-vk": 42}') }),
    ).rejects.toBeInstanceOf(SpeechConfigurationError);
    await expect(
      getTranscriber({ type: 'openai-compatible' }, { env: {} }),
    ).rejects.toThrow('STT baseUrl is required');
  });

  it('lets studio-server accept bare stream input too', async () => {
    const { fetch, requests } = mockFetch(json({ text: 'studio' }));
    const transcriber = await getTranscriber({
      type: 'studio-server',
      baseUrl: 'http://studio.example',
      fetch,
    });

    await transcriber.transcribe({
      audio: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([5]));
          controller.close();
        },
      }),
      mimeType: 'audio/wav',
      headers: { 'x-request-id': 'r1' },
    });

    const file = requests[0]?.form.get('audio') as File;
    expect(requests[0]?.url).toBe('http://studio.example/v1/transcribe');
    expect(requests[0]?.headers.get('x-request-id')).toBe('r1');
    expect(file.name).toBe('audio');
    expect(file.type).toBe('audio/wav');
  });
});
