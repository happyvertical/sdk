/**
 * Readiness probes (#1345): one GET per probe, no audio, a typed result.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  getSpeechSynthesizer,
  getStreamingTranscriber,
  getTranscriber,
  type SpeechFetch,
} from '../index.js';

interface Seen {
  url: string;
  method?: string;
  authorization: string | null;
  body: unknown;
}

function fakeFetch(respond: (url: string) => Response | Promise<Response>): {
  fetch: SpeechFetch;
  seen: Seen[];
} {
  const seen: Seen[] = [];
  const fetch: SpeechFetch = async (input, init) => {
    const url = String(input);
    seen.push({
      url,
      method: init?.method,
      authorization: new Headers(init?.headers).get('authorization'),
      body: init?.body,
    });
    return respond(url);
  };
  return { fetch, seen };
}

const models = (...ids: string[]) =>
  new Response(
    JSON.stringify({ object: 'list', data: ids.map((id) => ({ id })) }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
    },
  );

describe('Transcriber.probe', () => {
  it('openai-compatible lists models beside the endpoint and confirms the model', async () => {
    const { fetch, seen } = fakeFetch(() => models('whisper-large-v3', 'x'));
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://stt.local:8000/v1?api-version=2',
      apiKey: 'sk-test',
      model: 'whisper-large-v3',
      fetch,
    });
    const result = await transcriber.probe?.();
    expect(result).toMatchObject({
      ok: true,
      adapter: 'openai-compatible',
      checked: 'model',
      model: 'whisper-large-v3',
    });
    expect(seen).toEqual([
      {
        url: 'http://stt.local:8000/v1/models?api-version=2',
        method: 'GET',
        authorization: 'Bearer sk-test',
        body: undefined,
      },
    ]);
  });

  it('reports a model the server does not list', async () => {
    const { fetch } = fakeFetch(() => models('other-model'));
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://stt.local',
      model: 'whisper-1',
      fetch,
    });
    expect(await transcriber.probe?.()).toMatchObject({
      ok: false,
      reason: 'model_not_found',
      model: 'whisper-1',
      status: 200,
    });
  });

  it('classifies unauthorized, provider errors and unreadable lists', async () => {
    for (const [response, reason, status] of [
      [new Response('no', { status: 401 }), 'unauthorized', 401],
      [new Response('no', { status: 403 }), 'unauthorized', 403],
      [new Response('boom', { status: 502 }), 'provider_error', 502],
      [new Response('<html>', { status: 200 }), 'provider_error', 200],
    ] as const) {
      const { fetch } = fakeFetch(() => response);
      const transcriber = await getTranscriber({
        type: 'openai-compatible',
        baseUrl: 'http://stt.local',
        apiKey: 'sk-secret-test',
        fetch,
      });
      const result = await transcriber.probe?.();
      expect(result).toMatchObject({ ok: false, reason, status });
      expect(JSON.stringify(result)).not.toContain('stt.local');
      expect(JSON.stringify(result)).not.toContain('sk-secret-test');
    }
  });

  it('treats a server without a model list as reachable only', async () => {
    const { fetch } = fakeFetch(() => new Response('nf', { status: 404 }));
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://whisper-cpp.local',
      fetch,
    });
    expect(await transcriber.probe?.()).toMatchObject({
      ok: true,
      checked: 'reachability',
    });
  });

  it('reports an unreachable server and a timeout', async () => {
    const down = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://stt.local',
      fetch: down.fetch,
    });
    expect(await transcriber.probe?.()).toMatchObject({
      ok: false,
      reason: 'unreachable',
    });

    const hang: SpeechFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason),
        );
      });
    const slow = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://stt.local',
      fetch: hang,
    });
    expect(await slow.probe?.({ timeoutMs: 5 })).toMatchObject({
      ok: false,
      reason: 'timeout',
    });
  });

  it('times out an adapter with timeoutMs: 0 instead of hanging', async () => {
    vi.useFakeTimers();
    try {
      const hang: SpeechFetch = (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          );
        });
      const transcriber = await getTranscriber({
        type: 'openai-compatible',
        baseUrl: 'http://stt.local',
        timeoutMs: 0,
        fetch: hang,
      });
      const pending = transcriber.probe?.({ timeoutMs: 0 });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await pending).toMatchObject({ ok: false, reason: 'timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports an invalid header value as misconfigured without echoing it', async () => {
    const { fetch, seen } = fakeFetch(() => models());
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://stt.local',
      apiKey: 'sk-secret\nvalue',
      fetch,
    });
    const result = await transcriber.probe?.();
    expect(result).toMatchObject({ ok: false, reason: 'misconfigured' });
    expect(JSON.stringify(result)).not.toContain('sk-secret');
    expect(seen).toHaveLength(0);
  });

  it('rejects with the abort reason when the caller aborts', async () => {
    const hang: SpeechFetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal?.reason),
        );
      });
    const transcriber = await getTranscriber({
      type: 'openai-compatible',
      baseUrl: 'http://stt.local',
      fetch: hang,
    });
    const controller = new AbortController();
    const pending = transcriber.probe?.({ signal: controller.signal });
    controller.abort(new DOMException('stop', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('studio-server checks reachability of its base URL', async () => {
    const { fetch, seen } = fakeFetch(() => new Response('', { status: 404 }));
    const transcriber = await getTranscriber({
      type: 'studio-server',
      baseUrl: 'http://studio.local:9000/api',
      fetch,
    });
    expect(await transcriber.probe?.()).toMatchObject({
      ok: true,
      checked: 'reachability',
    });
    expect(seen[0]).toMatchObject({
      url: 'http://studio.local:9000/api/',
      method: 'GET',
    });

    const failing = fakeFetch(() => new Response('', { status: 503 }));
    const down = await getTranscriber({
      type: 'studio-server',
      baseUrl: 'http://studio.local',
      fetch: failing.fetch,
    });
    expect(await down.probe?.()).toMatchObject({
      ok: false,
      reason: 'provider_error',
      status: 503,
    });
  });

  it('voxtral-realtime probes vLLM over HTTP through getTranscriber', async () => {
    const { fetch, seen } = fakeFetch(() =>
      models('mistralai/Voxtral-Mini-4B-Realtime-2602'),
    );
    const transcriber = await getTranscriber({
      type: 'voxtral-realtime',
      baseUrl: 'http://vllm.local:8000',
      model: 'mistralai/Voxtral-Mini-4B-Realtime-2602',
      fetch,
    });
    expect(await transcriber.probe?.()).toMatchObject({
      ok: true,
      checked: 'model',
    });
    expect(seen[0]?.url).toBe('http://vllm.local:8000/v1/models');
  });

  it('openai-realtime maps wss to https, drops intent, and sends the key', async () => {
    const { fetch, seen } = fakeFetch(() => models('gpt-4o-transcribe'));
    const streaming = getStreamingTranscriber({
      type: 'openai-realtime',
      baseUrl: 'wss://api.example.com/v1/realtime',
      apiKey: 'sk-test',
      fetch,
    });
    expect(await streaming.probe?.()).toMatchObject({
      ok: true,
      checked: 'model',
      model: 'gpt-4o-transcribe',
    });
    expect(seen[0]).toMatchObject({
      url: 'https://api.example.com/v1/models',
      authorization: 'Bearer sk-test',
    });
  });

  it('openai-realtime with only a clientSecret is unsupported', async () => {
    const { fetch, seen } = fakeFetch(() => models());
    const streaming = getStreamingTranscriber({
      type: 'openai-realtime',
      clientSecret: 'ek_test',
      fetch,
    });
    expect(await streaming.probe?.()).toMatchObject({
      ok: false,
      reason: 'unsupported',
    });
    expect(seen).toHaveLength(0);
  });
});

describe('SpeechSynthesizer.probe', () => {
  it('openai-compatible confirms defaultModel beside the speech endpoint', async () => {
    const { fetch, seen } = fakeFetch(() => models('kokoro', 'tts-1'));
    const synthesizer = await getSpeechSynthesizer({
      type: 'openai-compatible',
      baseUrl: 'http://kokoro.local:8880/v1/audio/speech',
      defaultModel: 'kokoro',
      fetch,
    });
    expect(await synthesizer.probe?.()).toMatchObject({
      ok: true,
      checked: 'model',
      model: 'kokoro',
    });
    expect(seen[0]?.url).toBe('http://kokoro.local:8880/v1/models');
  });

  it('qwen3-tts checks the model list without requiring its model', async () => {
    const { fetch, seen } = fakeFetch(() => models('Qwen/Qwen3-TTS'));
    const synthesizer = await getSpeechSynthesizer({
      type: 'qwen3-tts',
      baseUrl: 'http://qwen.local:8091',
      fetch,
    });
    expect(await synthesizer.probe?.()).toMatchObject({
      ok: true,
      checked: 'reachability',
    });
    expect(seen[0]?.url).toBe('http://qwen.local:8091/v1/models');
  });

  it('studio-server synthesizer checks reachability', async () => {
    const { fetch } = fakeFetch(() => new Response('ok'));
    const synthesizer = await getSpeechSynthesizer({
      type: 'studio-server',
      baseUrl: 'http://studio.local',
      fetch,
    });
    expect(await synthesizer.probe?.()).toMatchObject({
      ok: true,
      checked: 'reachability',
    });
  });

  it('reports an invalid baseUrl as misconfigured instead of throwing', async () => {
    const { fetch, seen } = fakeFetch(() => models());
    const synthesizer = await getSpeechSynthesizer({
      type: 'openai-compatible',
      baseUrl: 'not a url',
      fetch,
    });
    expect(await synthesizer.probe?.()).toMatchObject({
      ok: false,
      reason: 'misconfigured',
    });
    expect(seen).toHaveLength(0);
  });
});
