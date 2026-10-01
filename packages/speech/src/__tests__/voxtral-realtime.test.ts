import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAvailableSpeechAdapters,
  getStreamingTranscriber,
  getTranscriber,
  parseVoxtralRealtimeEvent,
  resolveVoxtralRealtimeUrl,
  SpeechConfigurationError,
  SpeechProviderError,
  type SpeechUsage,
  type SpeechWebSocketFactory,
} from '../index.js';
import {
  FakeWebSocket,
  lastSocket,
  type Message,
  wav,
} from './fake-websocket.js';

const BASE_URL = 'http://vllm.local:8000';
const MODEL = 'voxtral-mini-4b-realtime';

const pcm = (bytes: number) => new Uint8Array(bytes).fill(1);

/**
 * Scripts a vLLM realtime server, mirroring the live event sequence:
 * `session.created` on connect, no `session.update` ack, generation only after
 * a non-final commit, `transcription.delta` (including empty deltas) per
 * append, and `transcription.done` with token usage after `final: true`.
 */
function vllmServer(
  transcripts: string[],
  { holdDone = false }: { holdDone?: boolean } = {},
) {
  let turn = 0;
  let generating = false;
  const held: Array<() => void> = [];
  const handler = (socket: FakeWebSocket, message: Message) => {
    if (message.type === 'input_audio_buffer.commit' && !message.final) {
      generating = true;
      return;
    }
    if (message.type === 'input_audio_buffer.append' && generating) {
      const text = transcripts[turn] ?? '';
      queueMicrotask(() => {
        socket.serverSend({ type: 'transcription.delta', delta: '' });
        socket.serverSend({ type: 'transcription.delta', delta: ` ${text}` });
      });
      return;
    }
    if (message.type === 'input_audio_buffer.commit' && message.final) {
      generating = false;
      const text = transcripts[turn] ?? '';
      turn += 1;
      const done = () =>
        socket.serverSend({
          type: 'transcription.done',
          text: ` ${text}`,
          usage: {
            prompt_tokens: 39,
            completion_tokens: 64,
            total_tokens: 103,
            prompt_tokens_details: null,
          },
        });
      if (holdDone) {
        held.push(done);
      } else {
        queueMicrotask(done);
      }
    }
  };
  return { handler, releaseDone: () => held.shift()?.() };
}

/** A FakeWebSocket that announces `session.created` like vLLM does. */
class VllmSocket extends FakeWebSocket {
  override serverOpen(): void {
    super.serverOpen();
    this.serverSend({
      type: 'session.created',
      id: 'sess-abc',
      created: 1_790_000_000,
    });
  }
}

function transcriber(options: Record<string, unknown> = {}) {
  return getStreamingTranscriber(
    {
      type: 'voxtral-realtime',
      baseUrl: BASE_URL,
      model: MODEL,
      apiKey: 'vllm-test-key',
      WebSocket: VllmSocket as never,
      ...options,
    },
    { env: {} },
  );
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  FakeWebSocket.instances = [];
  FakeWebSocket.onClientMessage = undefined;
  FakeWebSocket.autoOpen = true;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('voxtral-realtime handshake', () => {
  it('connects with a bearer header and no subprotocol, then sends a top-level model', async () => {
    const session = transcriber({ headers: { 'x-bf-vk': 'vk-1' } }).start();
    await session.ready;

    const socket = lastSocket();
    expect(socket.url).toBe('ws://vllm.local:8000/v1/realtime');
    expect(socket.protocolsArg).toEqual({
      protocols: [],
      headers: { 'x-bf-vk': 'vk-1', authorization: 'Bearer vllm-test-key' },
    });
    expect(socket.sent).toEqual([{ type: 'session.update', model: MODEL }]);
    expect(session.sessionId).toBe('sess-abc');
    session.abort();
  });

  it('defaults the model to the Hugging Face id vLLM serves', async () => {
    const session = transcriber({ model: undefined }).start();
    await session.ready;
    expect(lastSocket().sent[0]).toEqual({
      type: 'session.update',
      model: 'mistralai/Voxtral-Mini-4B-Realtime-2602',
    });
    session.abort();
  });

  it('resolves realtime URLs', () => {
    expect(resolveVoxtralRealtimeUrl('http://vllm:8000')).toBe(
      'ws://vllm:8000/v1/realtime',
    );
    expect(resolveVoxtralRealtimeUrl('https://gateway.example/stt/v1')).toBe(
      'wss://gateway.example/stt/v1/realtime',
    );
    expect(resolveVoxtralRealtimeUrl('ws://vllm:8000/v1/realtime')).toBe(
      'ws://vllm:8000/v1/realtime',
    );
  });

  it('rejects a missing baseUrl, other audio formats, and server turn detection', () => {
    expect(() => transcriber({ baseUrl: undefined })).toThrow(
      SpeechConfigurationError,
    );
    expect(() => transcriber({ format: { sampleRate: 24_000 } })).toThrow(
      /pcm16 at 16000 Hz mono/,
    );
    expect(() =>
      transcriber().start({ format: { encoding: 'g711_ulaw' } }),
    ).toThrow(/pcm16 at 16000 Hz mono/);
    expect(() =>
      transcriber({ turnDetection: { type: 'server_vad' } }),
    ).toThrow(/no server turn detection/);
    expect(() =>
      transcriber().start({ turnDetection: { type: 'semantic_vad' } }),
    ).toThrow(/no server turn detection/);
    expect(transcriber().audioFormat).toEqual({
      encoding: 'pcm16',
      sampleRate: 16_000,
      channels: 1,
    });
  });

  it('sends a gateway client secret as a subprotocol and refuses long-lived keys in a browser', async () => {
    const init: Array<{ protocols: string[]; headers: object }> = [];
    const createWebSocket: SpeechWebSocketFactory = (url, options) => {
      init.push(options);
      return new VllmSocket(url, options) as never;
    };
    vi.stubGlobal('process', undefined);
    vi.stubGlobal('document', {});

    expect(() => transcriber({ createWebSocket })).toThrow(
      /refuses apiKey in a browser/,
    );

    const browser = transcriber({
      apiKey: undefined,
      createWebSocket,
      clientSecret: async () => 'gw_short_lived',
    });
    const session = browser.start();
    await session.ready;
    expect(init[0]).toEqual({
      protocols: ['realtime', 'openai-insecure-api-key.gw_short_lived'],
      headers: {},
    });
    session.abort();

    const leaked = browser.start({ clientSecret: 'sk-proj-long-lived' });
    await expect(leaked.ready).rejects.toThrow(/long-lived API key/);
  });
});

describe('voxtral-realtime streaming', () => {
  it('opens a turn before the first append and finishes with a final commit', async () => {
    FakeWebSocket.onClientMessage = vllmServer(['Hello world.']).handler;
    const usage: SpeechUsage[] = [];
    const session = transcriber({
      onUsage: (u: SpeechUsage) => usage.push(u),
    }).start();
    const partials: string[] = [];
    const finals: string[] = [];
    session.on('partial', (event) => partials.push(event.text));
    session.on('final', (event) => finals.push(event.text));

    await session.write(pcm(3200));
    await session.write(pcm(3200));
    const result = await session.end();

    const socket = lastSocket();
    expect(socket.sent.map((message) => [message.type, message.final])).toEqual(
      [
        ['session.update', undefined],
        ['input_audio_buffer.commit', undefined],
        ['input_audio_buffer.append', undefined],
        ['input_audio_buffer.append', undefined],
        ['input_audio_buffer.commit', true],
      ],
    );
    expect(socket.sent[2].audio).toBe(
      Buffer.from(pcm(3200)).toString('base64'),
    );
    // Empty deltas are dropped; non-empty ones accumulate.
    expect(partials).toEqual([' Hello world.', ' Hello world. Hello world.']);
    expect(finals).toEqual(['Hello world.']);
    expect(result).toMatchObject({
      text: 'Hello world.',
      provider: 'voxtral-realtime',
      model: MODEL,
      durationSeconds: 0.2,
      raw: { sessionId: 'sess-abc' },
      usage: {
        operation: 'transcription',
        provider: 'voxtral-realtime',
        model: MODEL,
        audioSeconds: 0.2,
        bytes: 6400,
        providerUsage: {
          prompt_tokens: 39,
          completion_tokens: 64,
          total_tokens: 103,
        },
      },
    });
    expect(usage).toHaveLength(1);
    expect(socket.closeCalls).toEqual([1000]);
  });

  it('commit() ends a turn and holds later audio until the server finishes it', async () => {
    const server = vllmServer(['First turn.', 'Second turn.'], {
      holdDone: true,
    });
    FakeWebSocket.onClientMessage = server.handler;
    const session = transcriber().start();

    await session.write(pcm(320));
    session.commit();
    const held = session.write(pcm(640));
    await flush();
    await flush();

    const socket = lastSocket();
    // The second turn's audio waits: vLLM clears its buffer after `done`.
    expect(socket.types()).toEqual([
      'session.update',
      'input_audio_buffer.commit',
      'input_audio_buffer.append',
      'input_audio_buffer.commit',
    ]);

    server.releaseDone();
    await held;
    const ending = session.end();
    await flush();
    server.releaseDone();
    const result = await ending;

    expect(socket.sent.map((message) => [message.type, message.final])).toEqual(
      [
        ['session.update', undefined],
        ['input_audio_buffer.commit', undefined],
        ['input_audio_buffer.append', undefined],
        ['input_audio_buffer.commit', true],
        ['input_audio_buffer.commit', undefined],
        ['input_audio_buffer.append', undefined],
        ['input_audio_buffer.commit', true],
      ],
    );
    expect(result.text).toBe('First turn. Second turn.');
    expect(result.segments).toEqual([
      { text: 'First turn.' },
      { text: 'Second turn.' },
    ]);
    expect(result.usage?.providerUsage).toMatchObject({ total_tokens: 206 });
  });

  it('fails closed when vLLM ends a turn it was not asked to end', async () => {
    const session = transcriber().start();
    const finals: string[] = [];
    session.on('final', (event) => finals.push(event.text));
    await session.write(pcm(320));
    await flush();

    // A `done` arrives although no final commit was sent.
    lastSocket().serverSend({
      type: 'transcription.done',
      text: ' Before.',
      usage: { prompt_tokens: 39, completion_tokens: 4000 },
    });

    // The text up to the cut-off is still delivered as a final.
    expect(finals).toEqual(['Before.']);
    await expect(session.end()).rejects.toThrow(
      /ended a turn before it was committed/,
    );
    expect(session.state).toBe('failed');
    await expect(session.write(pcm(320))).rejects.toThrow(SpeechProviderError);
  });

  it('fails closed when a turn with audio consumes none (stale end marker)', async () => {
    const session = transcriber().start();
    await session.write(pcm(320));
    session.commit();
    await flush();
    // Turn 1: our final commit crossed a server-ended `done`, which acks it.
    lastSocket().serverSend({
      type: 'transcription.done',
      text: ' First.',
      usage: { prompt_tokens: 39 },
    });

    await session.write(pcm(320));
    const ending = session.end();
    await flush();
    // Turn 2: the stale end marker ends it at once; no audio was consumed.
    lastSocket().serverSend({
      type: 'transcription.done',
      text: '',
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    });
    await expect(ending).rejects.toThrow(
      /finished a turn without transcribing its audio/,
    );
  });

  it('end() without audio sends no commit and resolves empty', async () => {
    FakeWebSocket.onClientMessage = vllmServer([]).handler;
    const session = transcriber().start();
    await session.ready;
    const result = await session.end();
    expect(lastSocket().types()).toEqual(['session.update']);
    expect(result.text).toBe('');
  });

  it('keeps waiting while the server is still streaming, and times out when it goes quiet', async () => {
    const server = vllmServer(['Long clip.'], { holdDone: true });
    FakeWebSocket.onClientMessage = server.handler;
    const session = transcriber({ timeoutMs: 60 }).start();
    await session.write(pcm(320));
    const ending = session.end();

    // Deltas every 30 ms keep a 60 ms inactivity timeout alive for 150 ms.
    for (let index = 0; index < 5; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      lastSocket().serverSend({ type: 'transcription.delta', delta: '' });
    }
    server.releaseDone();
    await expect(ending).resolves.toMatchObject({ text: 'Long clip.' });

    const quiet = transcriber({ timeoutMs: 30 }).start();
    FakeWebSocket.onClientMessage = undefined;
    await quiet.write(pcm(320));
    await expect(quiet.end()).rejects.toThrow(
      /timed out after 30 ms waiting for the final transcript/,
    );
  });

  it('bounds a held turn by provider inactivity, not a fixed deadline', async () => {
    const server = vllmServer(['First.', 'Second.'], { holdDone: true });
    FakeWebSocket.onClientMessage = server.handler;
    const session = transcriber({ timeoutMs: 60 }).start();
    await session.write(pcm(320));
    session.commit();
    const held = session.write(pcm(320));

    // The first turn keeps streaming for 150 ms (> timeoutMs) before `done`.
    for (let index = 0; index < 5; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 30));
      lastSocket().serverSend({ type: 'transcription.delta', delta: '' });
    }
    server.releaseDone();
    await held;
    const ending = session.end();
    await flush();
    server.releaseDone();
    await expect(ending).resolves.toMatchObject({ text: 'First. Second.' });

    const quiet = transcriber({ timeoutMs: 30 }).start();
    FakeWebSocket.onClientMessage = undefined;
    await quiet.write(pcm(320));
    quiet.commit();
    await expect(quiet.write(pcm(320))).rejects.toThrow(
      /without a server message while waiting for the previous turn/,
    );
  });

  it('redacts gateway header credentials from surfaced provider text', async () => {
    const session = transcriber({
      apiKey: undefined,
      headers: {
        'x-bf-vk': 'vk1',
        authorization: 'Bearer tk9',
        'x-tenant-route': 'tenant-route-secret',
        'x-trace': '1',
      },
    }).start();
    await session.ready;
    const failed = new Promise<Error>((resolve) =>
      session.on('error', resolve),
    );
    lastSocket().serverSend({
      type: 'error',
      error: 'rejected vk1, tk9 and tenant-route-secret (trace 1)',
      code: 'unauthorized',
    });
    const error = (await failed) as SpeechProviderError;
    expect(error.message).toBe(
      'voxtral-realtime error (unauthorized): rejected [REDACTED], [REDACTED] and [REDACTED] (trace 1)',
    );
    expect(error.responseBody).not.toMatch(/vk1|tk9|tenant-route-secret/);
  });

  it('redacts credentials from close reasons', async () => {
    const session = transcriber({ headers: { 'x-api-key': 'k7' } }).start();
    await session.ready;
    lastSocket().serverDrop(4401, 'bad key k7 / vllm-test-key');
    await expect(session.end()).rejects.toThrow(
      'socket closed unexpectedly (code 4401: bad key [REDACTED] / [REDACTED])',
    );
  });

  it('fails the session on a vLLM error event', async () => {
    const session = transcriber().start();
    await session.ready;
    lastSocket().serverSend({
      type: 'error',
      error: 'The model `nope` does not exist.',
      code: 'model_not_found',
    });
    const error = await session.end().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SpeechProviderError);
    expect((error as Error).message).toBe(
      'voxtral-realtime error (model_not_found): The model `nope` does not exist.',
    );
    expect(session.state).toBe('failed');
  });

  it('fails without reconnecting when the socket drops mid-turn', async () => {
    const session = transcriber().start();
    await session.write(pcm(320));
    lastSocket().serverDrop(1011, 'engine died');
    await expect(session.end()).rejects.toThrow(
      /socket closed unexpectedly \(code 1011: engine died\)/,
    );
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

describe('voxtral-realtime parsing', () => {
  it('maps vLLM events and ignores unknown ones', () => {
    expect(
      parseVoxtralRealtimeEvent({ type: 'session.created', id: 'sess-1' }),
    ).toEqual([{ type: 'session', sessionId: 'sess-1' }]);
    expect(
      parseVoxtralRealtimeEvent({ type: 'transcription.delta', delta: '' }),
    ).toEqual([]);
    expect(
      parseVoxtralRealtimeEvent({ type: 'transcription.done', text: ' Hi. ' }),
    ).toEqual([
      {
        type: 'final',
        text: 'Hi.',
        providerUsage: undefined,
        raw: { type: 'transcription.done', text: ' Hi. ' },
        audioConsumed: undefined,
      },
    ]);
    expect(
      parseVoxtralRealtimeEvent({
        type: 'transcription.done',
        text: '',
        usage: { prompt_tokens: 1 },
      })[0],
    ).toMatchObject({ audioConsumed: false });
    expect(
      parseVoxtralRealtimeEvent({
        type: 'transcription.done',
        text: 'x',
        usage: { prompt_tokens: 39 },
      })[0],
    ).toMatchObject({ audioConsumed: true });
    expect(
      parseVoxtralRealtimeEvent({
        type: 'error',
        error: 'Invalid audio data',
        code: 'invalid_audio',
      }),
    ).toMatchObject([
      { type: 'error', message: 'Invalid audio data', code: 'invalid_audio' },
    ]);
    expect(parseVoxtralRealtimeEvent({ type: 'session.updated' })).toEqual([]);
    expect(parseVoxtralRealtimeEvent(null)).toEqual([]);
  });
});

describe('voxtral-realtime configuration and wrapper', () => {
  it('reads HAVE_SPEECH_STREAMING_* with explicit options winning', async () => {
    const env = {
      HAVE_SPEECH_STREAMING_TYPE: 'voxtral-realtime',
      HAVE_SPEECH_STREAMING_BASE_URL: 'http://env-vllm:9000/gateway/v1',
      HAVE_SPEECH_STREAMING_MODEL: 'env-model',
      HAVE_SPEECH_STREAMING_API_KEY: 'env-key',
      HAVE_SPEECH_STREAMING_HEADERS: '{"x-bf-vk":"vk-env"}',
    };
    const fromEnv = getStreamingTranscriber(
      { WebSocket: VllmSocket as never },
      { env },
    );
    expect(fromEnv.type).toBe('voxtral-realtime');
    const session = fromEnv.start();
    await session.ready;
    expect(lastSocket().url).toBe('ws://env-vllm:9000/gateway/v1/realtime');
    expect(lastSocket().protocolsArg).toEqual({
      protocols: [],
      headers: { 'x-bf-vk': 'vk-env', authorization: 'Bearer env-key' },
    });
    expect(lastSocket().sent[0]).toEqual({
      type: 'session.update',
      model: 'env-model',
    });
    session.abort();

    const explicit = getStreamingTranscriber(
      { WebSocket: VllmSocket as never, model: 'explicit-model' },
      { env },
    ).start();
    await explicit.ready;
    expect(lastSocket().sent[0]).toEqual({
      type: 'session.update',
      model: 'explicit-model',
    });
    explicit.abort();
  });

  it('is listed and works through getTranscriber() as a record-then-send transcriber', async () => {
    expect(getAvailableSpeechAdapters().transcribers).toContain(
      'voxtral-realtime',
    );
    FakeWebSocket.onClientMessage = vllmServer(['Recorded clip.']).handler;
    const onUsage = vi.fn();
    const stt = await getTranscriber(
      {
        type: 'voxtral-realtime',
        baseUrl: BASE_URL,
        model: MODEL,
        apiKey: 'vllm-test-key',
        onUsage,
        streaming: { WebSocket: VllmSocket as never },
      },
      { env: {} },
    );
    expect(stt.type).toBe('voxtral-realtime');

    const result = await stt.transcribe({
      audio: wav(16_000, { sampleRate: 16_000 }),
      mimeType: 'audio/wav',
      language: 'en',
    });
    expect(result.text).toBe('Recorded clip.');
    expect(result.durationSeconds).toBe(1);
    expect(lastSocket().types().at(-1)).toBe('input_audio_buffer.commit');
    expect(lastSocket().sent.at(-1)?.final).toBe(true);
    expect(onUsage).toHaveBeenCalledOnce();

    await expect(
      stt.transcribe({
        audio: wav(2400, { sampleRate: 24_000 }),
        mimeType: 'audio/wav',
      }),
    ).rejects.toThrow(/pcm16 at 16000 Hz mono/);
  });
});
