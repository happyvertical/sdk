import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getAvailableSpeechAdapters,
  getStreamingTranscriber,
  getTranscriber,
  resolveRealtimeUrl,
  SpeechConfigurationError,
  SpeechError,
  SpeechProviderError,
  type SpeechUsage,
  type SpeechWebSocketFactory,
  type StreamingSession,
  unwrapRawAudio,
  wrapStreamingTranscriber,
} from '../index.js';

type Listener = (event: unknown) => void;
type Message = Record<string, unknown>;

/** In-memory WebSocket double. Tests drive the "server" side explicitly. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  /** Called for every client message; lets a test script server replies. */
  static onClientMessage?: (socket: FakeWebSocket, message: Message) => void;
  /** Open automatically on the next macrotask. */
  static autoOpen = true;

  readyState = 0;
  bufferedAmount = 0;
  binaryType = 'blob';
  readonly sent: Message[] = [];
  readonly closeCalls: Array<number | undefined> = [];
  private readonly listeners = new Map<string, Listener[]>();

  constructor(
    readonly url: string,
    readonly protocolsArg?: unknown,
  ) {
    FakeWebSocket.instances.push(this);
    if (FakeWebSocket.autoOpen) {
      setTimeout(() => this.serverOpen(), 0);
    }
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(data: string): void {
    if (this.readyState !== 1) {
      throw new Error('socket not open');
    }
    const message = JSON.parse(data) as Message;
    this.sent.push(message);
    FakeWebSocket.onClientMessage?.(this, message);
  }

  close(code?: number): void {
    this.closeCalls.push(code);
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    setTimeout(
      () => this.dispatch('close', { code: code ?? 1005, reason: '' }),
      0,
    );
  }

  serverOpen(): void {
    if (this.readyState !== 0) {
      return;
    }
    this.readyState = 1;
    this.dispatch('open', {});
  }

  serverSend(message: Message): void {
    this.dispatch('message', { data: JSON.stringify(message) });
  }

  serverDrop(code = 1006, reason = 'gone'): void {
    this.readyState = 3;
    this.dispatch('close', { code, reason });
  }

  types(): string[] {
    return this.sent.map((message) => String(message.type));
  }

  private dispatch(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

/** Server script: acknowledges commits and completes each turn. */
function transcribingServer(transcripts: string[], usage?: Message) {
  let turn = 0;
  return (socket: FakeWebSocket, message: Message) => {
    if (message.type === 'session.update') {
      socket.serverSend({ type: 'session.updated', session: { id: 'sess_1' } });
    }
    if (message.type === 'input_audio_buffer.commit') {
      const itemId = `item_${turn}`;
      const text = transcripts[turn] ?? '';
      turn += 1;
      queueMicrotask(() => {
        socket.serverSend({
          type: 'input_audio_buffer.committed',
          item_id: itemId,
        });
        socket.serverSend({
          type: 'conversation.item.input_audio_transcription.delta',
          item_id: itemId,
          delta: text.slice(0, 3),
        });
        socket.serverSend({
          type: 'conversation.item.input_audio_transcription.delta',
          item_id: itemId,
          delta: text.slice(3),
        });
        socket.serverSend({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: itemId,
          transcript: text,
          usage,
        });
      });
    }
  };
}

const lastSocket = () => {
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) {
    throw new Error('no socket created');
  }
  return socket;
};

const pcm = (bytes: number) => new Uint8Array(bytes).fill(1);

function transcriber(options: Record<string, unknown> = {}) {
  return getStreamingTranscriber(
    {
      apiKey: 'sk-test-secret',
      WebSocket: FakeWebSocket as never,
      ...options,
    },
    { env: {} },
  );
}

afterEach(() => {
  FakeWebSocket.instances = [];
  FakeWebSocket.onClientMessage = undefined;
  FakeWebSocket.autoOpen = true;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('openai-realtime handshake', () => {
  it('connects with auth headers and sends a transcription session.update', async () => {
    FakeWebSocket.onClientMessage = transcribingServer([]);
    const session = transcriber({
      headers: { 'x-bf-vk': 'vk-1' },
      language: 'en',
      prompt: 'Anytown council',
      noiseReduction: 'near_field',
      transcriptionOptions: { delay: 'low' },
    }).start();
    await session.ready;

    const socket = lastSocket();
    expect(socket.url).toBe(
      'wss://api.openai.com/v1/realtime?intent=transcription',
    );
    expect(socket.protocolsArg).toEqual({
      protocols: ['realtime'],
      headers: { 'x-bf-vk': 'vk-1', authorization: 'Bearer sk-test-secret' },
    });
    expect(socket.binaryType).toBe('arraybuffer');
    expect(socket.sent[0]).toEqual({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: {
              model: 'gpt-4o-transcribe',
              language: 'en',
              prompt: 'Anytown council',
              delay: 'low',
            },
            turn_detection: { type: 'server_vad' },
            noise_reduction: { type: 'near_field' },
          },
        },
      },
    });
    expect(session.state).toBe('open');
    session.abort();
  });

  it('maps turn detection options and G.711 formats', async () => {
    const session = transcriber({
      turnDetection: {
        type: 'server_vad',
        silenceDurationMs: 700,
        threshold: 0.6,
      },
    }).start({ format: { encoding: 'g711_ulaw' } });
    await session.ready;
    const input = (lastSocket().sent[0].session as Message).audio as Message;
    expect((input.input as Message).format).toEqual({ type: 'audio/pcmu' });
    expect((input.input as Message).turn_detection).toEqual({
      type: 'server_vad',
      threshold: 0.6,
      silence_duration_ms: 700,
    });
    session.abort();

    const manual = transcriber().start({
      turnDetection: { type: 'manual' },
      model: 'gpt-live-transcribe',
    });
    await manual.ready;
    const manualInput = (
      (lastSocket().sent[0].session as Message).audio as Message
    ).input as Message;
    expect(manualInput.turn_detection).toBeNull();
    expect((manualInput.transcription as Message).model).toBe(
      'gpt-live-transcribe',
    );
    manual.abort();
  });

  it('sends a client secret as a subprotocol without an Authorization header', async () => {
    const init: Array<{ url: string; protocols: string[]; headers: object }> =
      [];
    const createWebSocket: SpeechWebSocketFactory = (url, options) => {
      init.push({ url, ...options });
      return new FakeWebSocket(url, options) as never;
    };
    const mint = vi.fn(async () => 'ek_tenant_42');
    const session = getStreamingTranscriber(
      { createWebSocket, clientSecret: mint, baseUrl: 'http://gateway/stt/v1' },
      { env: {} },
    ).start();
    await session.ready;

    expect(mint).toHaveBeenCalledOnce();
    expect(init[0]).toEqual({
      url: 'ws://gateway/stt/v1/realtime?intent=transcription',
      protocols: ['realtime', 'openai-insecure-api-key.ek_tenant_42'],
      headers: {},
    });

    const failed = new Promise<Error>((resolve) =>
      session.on('error', resolve),
    );
    lastSocket().serverSend({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: 'bad token ek_tenant_42',
      },
    });
    expect((await failed).message).toContain('bad token [REDACTED]');
  });

  it('passes a plain protocol list to the constructor when there are no headers', async () => {
    const session = getStreamingTranscriber(
      { WebSocket: FakeWebSocket as never, clientSecret: 'ek_1' },
      { env: {} },
    ).start();
    await session.ready;
    expect(lastSocket().protocolsArg).toEqual([
      'realtime',
      'openai-insecure-api-key.ek_1',
    ]);
    session.abort();
  });

  it('resolves realtime URLs', () => {
    expect(resolveRealtimeUrl('https://api.openai.com')).toBe(
      'wss://api.openai.com/v1/realtime?intent=transcription',
    );
    expect(resolveRealtimeUrl('http://localhost:8000/v1')).toBe(
      'ws://localhost:8000/v1/realtime?intent=transcription',
    );
    expect(resolveRealtimeUrl('wss://example.test/v1/realtime?intent=x')).toBe(
      'wss://example.test/v1/realtime?intent=x',
    );
    expect(() => resolveRealtimeUrl('ftp://example.test')).toThrow(
      SpeechConfigurationError,
    );
  });

  it('rejects formats the provider cannot accept', () => {
    expect(() => transcriber({ format: { sampleRate: 16000 } })).toThrow(
      /24000 Hz mono/,
    );
    expect(() => transcriber().start({ format: { channels: 2 } })).toThrow(
      SpeechConfigurationError,
    );
  });

  it('refuses API keys and handshake headers in a browser runtime', () => {
    vi.stubGlobal('process', undefined);
    vi.stubGlobal('document', {});
    expect(() => transcriber()).toThrow(/clientSecret/);
    expect(() =>
      getStreamingTranscriber(
        { WebSocket: FakeWebSocket as never, clientSecret: 'ek' },
        { env: {} },
      ).start({ headers: { 'x-bf-vk': 'vk' } }),
    ).toThrow(/cannot send WebSocket headers/);
  });
});

describe('openai-realtime streaming', () => {
  it('queues writes before open, streams base64 appends, and emits partial and final events', async () => {
    FakeWebSocket.onClientMessage = transcribingServer(['Hello world'], {
      type: 'duration',
      seconds: 1,
    });
    const onUsage = vi.fn();
    const sessionUsage = vi.fn();
    const session = transcriber({ onUsage }).start({
      turnDetection: { type: 'manual' },
      onUsage: sessionUsage,
    });
    const partials: string[] = [];
    const finals: string[] = [];
    session.on('partial', (event) => partials.push(event.text));
    session.on('final', (event) => finals.push(event.text));

    const first = session.write(pcm(24_000));
    const second = session.write(new Int16Array(12_000));
    expect(session.state).toBe('connecting');
    expect(session.queuedBytes).toBe(48_000);
    await Promise.all([first, second]);

    const result = await session.end();
    const socket = lastSocket();
    expect(socket.types()).toEqual([
      'session.update',
      'input_audio_buffer.append',
      'input_audio_buffer.append',
      'input_audio_buffer.commit',
    ]);
    expect(socket.sent[1].audio).toBe(
      Buffer.from(pcm(24_000)).toString('base64'),
    );
    expect(partials).toEqual(['Hel', 'Hello world']);
    expect(finals).toEqual(['Hello world']);
    expect(result).toMatchObject({
      text: 'Hello world',
      segments: [{ text: 'Hello world' }],
      provider: 'openai-realtime',
      model: 'gpt-4o-transcribe',
      durationSeconds: 1,
      raw: { sessionId: 'sess_1' },
    });
    const usage: SpeechUsage = {
      operation: 'transcription',
      provider: 'openai-realtime',
      model: 'gpt-4o-transcribe',
      audioSeconds: 1,
      bytes: 48_000,
      providerUsage: { type: 'duration', seconds: 1 },
    };
    expect(result.usage).toEqual(usage);
    expect(onUsage).toHaveBeenCalledWith(usage);
    expect(sessionUsage).toHaveBeenCalledWith(usage);
    expect(onUsage.mock.invocationCallOrder[0]).toBeLessThan(
      sessionUsage.mock.invocationCallOrder[0],
    );
    expect(session.state).toBe('closed');
    expect(socket.closeCalls).toEqual([1000]);
  });

  it('orders multi-turn finals by commit order and sums token usage', async () => {
    const session = transcriber().start();
    await session.ready;
    const socket = lastSocket();
    await session.write(pcm(4800));

    socket.serverSend({
      type: 'input_audio_buffer.speech_started',
      item_id: 'a',
      audio_start_ms: 10,
    });
    socket.serverSend({ type: 'input_audio_buffer.committed', item_id: 'a' });
    socket.serverSend({ type: 'input_audio_buffer.committed', item_id: 'b' });
    const ending = session.end();
    await vi.waitFor(() =>
      expect(socket.types()).toContain('input_audio_buffer.commit'),
    );
    // Our end commit found an empty buffer: tolerated, not fatal.
    socket.serverSend({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        code: 'input_audio_buffer_commit_empty',
        message: 'buffer too small',
      },
    });
    const tokens = (n: number) => ({
      type: 'tokens',
      input_tokens: n,
      input_token_details: { audio_tokens: n },
    });
    socket.serverSend({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'b',
      transcript: 'second.',
      usage: tokens(2),
    });
    expect(session.state).toBe('ending');
    socket.serverSend({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'a',
      transcript: ' First.',
      usage: tokens(3),
    });

    const result = await ending;
    expect(result.text).toBe('First. second.');
    expect(result.usage?.providerUsage).toEqual({
      type: 'tokens',
      input_tokens: 5,
      input_token_details: { audio_tokens: 5 },
    });
    expect(result.usage?.audioSeconds).toBe(0.1);
  });

  it('skips the end commit when server VAD already committed everything', async () => {
    const session = transcriber().start();
    await session.ready;
    const result = await session.end();
    expect(lastSocket().types()).toEqual(['session.update']);
    expect(result.text).toBe('');
  });

  it('commit() ends a manual turn after queued audio', async () => {
    FakeWebSocket.onClientMessage = transcribingServer(['one', 'two']);
    const session = transcriber().start({ turnDetection: { type: 'manual' } });
    session.write(pcm(10));
    session.commit();
    session.write(pcm(10));
    const result = await session.end();
    expect(lastSocket().types()).toEqual([
      'session.update',
      'input_audio_buffer.append',
      'input_audio_buffer.commit',
      'input_audio_buffer.append',
      'input_audio_buffer.commit',
    ]);
    expect(result.text).toBe('one two');
  });

  it('emits speech events and supports unsubscribing', async () => {
    const session = transcriber().start();
    await session.ready;
    const started = vi.fn();
    const stopped = vi.fn();
    const off = session.on('speech_started', started);
    session.on('speech_stopped', stopped);
    lastSocket().serverSend({
      type: 'input_audio_buffer.speech_started',
      item_id: 'a',
      audio_start_ms: 5,
    });
    off();
    lastSocket().serverSend({
      type: 'input_audio_buffer.speech_started',
      item_id: 'b',
    });
    lastSocket().serverSend({
      type: 'input_audio_buffer.speech_stopped',
      item_id: 'a',
      audio_end_ms: 900,
    });
    lastSocket().serverSend({ type: 'unknown.future.event' });
    expect(started).toHaveBeenCalledOnce();
    expect(started).toHaveBeenCalledWith({ itemId: 'a', audioMs: 5 });
    expect(stopped).toHaveBeenCalledWith({ itemId: 'a', audioMs: 900 });
    session.abort();
  });
});

describe('openai-realtime errors and lifecycle', () => {
  it('fails the session on a provider error event', async () => {
    const session = transcriber().start();
    const errors: Error[] = [];
    const closes: number[] = [];
    session.on('error', (error) => errors.push(error));
    session.on('close', (event) => closes.push(event.code));
    await session.ready;

    lastSocket().serverSend({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        code: 'invalid_value',
        message: 'bad rate for sk-test-secret',
      },
    });

    await expect(session.end()).rejects.toThrow(SpeechProviderError);
    await expect(session.end()).rejects.toThrow(/invalid_value.*\[REDACTED\]/);
    await expect(session.write(pcm(4))).rejects.toThrow(SpeechProviderError);
    expect(errors).toHaveLength(1);
    expect(session.state).toBe('failed');
    await vi.waitFor(() => expect(closes).toEqual([1000]));
  });

  it('fails the session when a turn fails to transcribe', async () => {
    const session = transcriber().start();
    await session.ready;
    lastSocket().serverSend({
      type: 'conversation.item.input_audio_transcription.failed',
      item_id: 'a',
      error: { code: 'audio_unintelligible', message: 'could not transcribe' },
    });
    await expect(session.end()).rejects.toThrow(/audio_unintelligible/);
  });

  it('fails without reconnecting when the socket drops mid-session', async () => {
    const session = transcriber().start({ turnDetection: { type: 'manual' } });
    await session.ready;
    const socket = lastSocket();
    socket.bufferedAmount = Number.MAX_SAFE_INTEGER;
    const queued = session.write(pcm(10));
    const pending = session.write(pcm(10));
    const closes: Array<{ code: number; reason: string }> = [];
    session.on('close', (event) => closes.push(event));

    socket.serverDrop(1011, 'server error');

    await expect(queued).rejects.toThrow(
      /closed unexpectedly \(code 1011: server error\)/,
    );
    await expect(pending).rejects.toThrow(SpeechProviderError);
    await expect(session.end()).rejects.toThrow(/closed unexpectedly/);
    expect(closes).toEqual([{ code: 1011, reason: 'server error' }]);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(session.queuedBytes).toBe(0);
  });

  it('times out when the socket never opens', async () => {
    FakeWebSocket.autoOpen = false;
    const session = transcriber({ connectTimeoutMs: 20 }).start();
    await expect(session.ready).rejects.toThrow(
      /connection timed out after 20 ms/,
    );
    expect(lastSocket().closeCalls).toEqual([1000]);
  });

  it('times out waiting for the final transcript', async () => {
    const session = transcriber({ timeoutMs: 30 }).start();
    await session.write(pcm(10));
    await expect(session.end()).rejects.toThrow(
      /timed out after 30 ms waiting for the final transcript/,
    );
    expect(session.state).toBe('failed');
  });

  it('fails when minting a client secret fails', async () => {
    const session = getStreamingTranscriber(
      {
        WebSocket: FakeWebSocket as never,
        clientSecret: async () => {
          throw new Error('mint failed');
        },
      },
      { env: {} },
    ).start();
    await expect(session.ready).rejects.toThrow('mint failed');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('aborts through an AbortSignal', async () => {
    const controller = new AbortController();
    const session = transcriber().start({ signal: controller.signal });
    await session.ready;
    controller.abort(new Error('user cancelled'));
    await expect(session.end()).rejects.toThrow('user cancelled');

    const preAborted = transcriber().start({ signal: AbortSignal.abort() });
    await expect(preAborted.ready).rejects.toThrow();
    expect(preAborted.state).toBe('failed');
  });

  it('fails the session when a listener throws', async () => {
    FakeWebSocket.onClientMessage = transcribingServer(['boom']);
    const session = transcriber().start({ turnDetection: { type: 'manual' } });
    session.on('partial', () => {
      throw new Error('listener bug');
    });
    await session.write(pcm(10));
    await expect(session.end()).rejects.toThrow('listener bug');
  });

  it('rejects writes after end()', async () => {
    const session = transcriber().start();
    const ending = session.end();
    await expect(session.write(pcm(2))).rejects.toMatchObject({
      code: 'SPEECH_SESSION_ENDED',
    });
    await ending;
    expect(session.end()).toBe(session.end());
  });
});

describe('openai-realtime backpressure', () => {
  it('holds write() until the socket drains below highWaterMark', async () => {
    const session = transcriber({ highWaterMark: 100 }).start();
    await session.ready;
    const socket = lastSocket();
    socket.bufferedAmount = 500;

    let settled = false;
    const write = session.write(pcm(10)).then(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(settled).toBe(false);
    expect(session.queuedBytes).toBe(10);

    socket.bufferedAmount = 50;
    await write;
    expect(settled).toBe(true);
    expect(socket.types()).toContain('input_audio_buffer.append');
    session.abort();
  });

  it('rejects writes that exceed maxBufferedBytes', async () => {
    const session = transcriber({ maxBufferedBytes: 16 }).start();
    const accepted = session.write(pcm(10));
    await expect(session.write(pcm(10))).rejects.toMatchObject({
      code: 'SPEECH_BACKPRESSURE',
    });
    await accepted;
    session.abort();
  });

  it('rejects unsupported chunk types', async () => {
    const session = transcriber().start();
    await expect(session.write('nope' as never)).rejects.toThrow(
      SpeechConfigurationError,
    );
    session.abort();
  });
});

describe('streaming configuration', () => {
  it('reads HAVE_SPEECH_STREAMING_* with explicit options winning', async () => {
    const env = {
      HAVE_SPEECH_STREAMING_TYPE: 'openai-realtime',
      HAVE_SPEECH_STREAMING_BASE_URL: 'http://stt.local:8000/v1',
      HAVE_SPEECH_STREAMING_MODEL: 'env-model',
      HAVE_SPEECH_STREAMING_API_KEY: 'sk-env',
      HAVE_SPEECH_STREAMING_LANGUAGE: 'fr',
      HAVE_SPEECH_STREAMING_TURN_DETECTION: 'manual',
      HAVE_SPEECH_STREAMING_HEADERS: '{"x-bf-vk":"vk-env","x-org":"env"}',
    };
    const session = getStreamingTranscriber(
      {
        WebSocket: FakeWebSocket as never,
        model: 'explicit-model',
        headers: { 'x-org': 'explicit' },
      },
      { env },
    ).start();
    await session.ready;

    const socket = lastSocket();
    expect(socket.url).toBe(
      'ws://stt.local:8000/v1/realtime?intent=transcription',
    );
    expect(socket.protocolsArg).toEqual({
      protocols: ['realtime'],
      headers: {
        'x-bf-vk': 'vk-env',
        'x-org': 'explicit',
        authorization: 'Bearer sk-env',
      },
    });
    const input = ((socket.sent[0].session as Message).audio as Message)
      .input as Message;
    expect(input.turn_detection).toBeNull();
    expect(input.transcription).toEqual({
      model: 'explicit-model',
      language: 'fr',
    });
    session.abort();
  });

  it('rejects unknown streaming types and turn detection values', () => {
    expect(() =>
      getStreamingTranscriber(
        {},
        { env: { HAVE_SPEECH_STREAMING_TYPE: 'nope' } },
      ),
    ).toThrow(/Invalid streaming STT speech adapter type: nope/);
    expect(() =>
      getStreamingTranscriber(
        { WebSocket: FakeWebSocket as never },
        { env: { HAVE_SPEECH_STREAMING_TURN_DETECTION: 'sometimes' } },
      ),
    ).toThrow(SpeechConfigurationError);
  });

  it('requires a WebSocket implementation', () => {
    vi.stubGlobal('WebSocket', undefined);
    expect(() => getStreamingTranscriber({}, { env: {} })).toThrow(
      /No WebSocket implementation/,
    );
  });

  it('lists the streaming adapter', () => {
    const available = getAvailableSpeechAdapters();
    expect(available.transcribers).toContain('openai-realtime');
    expect(available.streamingTranscribers).toEqual(['openai-realtime']);
  });
});

function wav(
  samples: number,
  { sampleRate = 24_000, channels = 1, format = 1, bits = 16 } = {},
): Uint8Array {
  const dataBytes = samples * channels * (bits / 8);
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * (bits / 8), true);
  view.setUint16(32, channels * (bits / 8), true);
  view.setUint16(34, bits, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  new Uint8Array(buffer, 44).fill(7);
  return new Uint8Array(buffer);
}

describe('record-then-send wrapper', () => {
  it('getTranscriber({ type: "openai-realtime" }) streams a WAV clip as one manual turn', async () => {
    FakeWebSocket.onClientMessage = transcribingServer(['Hello there']);
    const onUsage = vi.fn();
    const requestUsage = vi.fn();
    const transcriber = await getTranscriber(
      {
        type: 'openai-realtime',
        apiKey: 'sk-wrap',
        model: 'gpt-4o-mini-transcribe',
        onUsage,
        streaming: { WebSocket: FakeWebSocket as never },
      },
      { env: {} },
    );
    expect(transcriber.type).toBe('openai-realtime');

    const result = await transcriber.transcribe({
      audio: { data: wav(48_000), mimeType: 'audio/wav' },
      language: 'en',
      onUsage: requestUsage,
    });

    const socket = lastSocket();
    const input = ((socket.sent[0].session as Message).audio as Message)
      .input as Message;
    expect(input.turn_detection).toBeNull();
    expect(input.transcription).toEqual({
      model: 'gpt-4o-mini-transcribe',
      language: 'en',
    });
    // 96 000 PCM bytes in 64 KiB chunks, WAV header stripped.
    const appends = socket.sent.filter(
      (m) => m.type === 'input_audio_buffer.append',
    );
    expect(appends).toHaveLength(2);
    expect(
      appends.reduce(
        (total, m) => total + Buffer.from(String(m.audio), 'base64').byteLength,
        0,
      ),
    ).toBe(96_000);
    expect(socket.types().at(-1)).toBe('input_audio_buffer.commit');
    expect(result.text).toBe('Hello there');
    expect(result.durationSeconds).toBe(2);
    expect(result.usage?.bytes).toBe(96_000);
    expect(onUsage).toHaveBeenCalledOnce();
    expect(requestUsage).toHaveBeenCalledOnce();
  });

  it('resolves the wrapped type from HAVE_SPEECH_TRANSCRIBER_TYPE', async () => {
    FakeWebSocket.onClientMessage = transcribingServer(['raw pcm']);
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const transcriber = await getTranscriber(
      {},
      {
        env: {
          HAVE_SPEECH_TRANSCRIBER_TYPE: 'openai-realtime',
          HAVE_SPEECH_STREAMING_API_KEY: 'sk-env',
        },
      },
    );
    const result = await transcriber.transcribe({
      audio: new Uint8Array(4800),
      mimeType: 'audio/L16;rate=24000;channels=1',
    });
    expect(result.text).toBe('raw pcm');
  });

  it('rejects compressed recordings and mismatched sample rates before connecting', async () => {
    const wrapped = wrapStreamingTranscriber(transcriber());
    await expect(
      wrapped.transcribe({
        audio: new Uint8Array([1, 2]),
        mimeType: 'audio/webm;codecs=opus',
      }),
    ).rejects.toThrow(/cannot decode audio\/webm/);
    await expect(
      wrapped.transcribe({ audio: wav(160, { sampleRate: 16_000 }) }),
    ).rejects.toThrow(/24000 Hz mono/);
    await expect(
      wrapped.transcribe({
        audio: { data: new Uint8Array(10), sampleRate: 16_000 },
      }),
    ).rejects.toThrow(/24000 Hz mono/);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('aborts the session when a write fails', async () => {
    const abort = vi.fn();
    const session = {
      write: vi.fn(async () => {
        throw new SpeechError('nope', 'SPEECH_BACKPRESSURE');
      }),
      abort,
    } as unknown as StreamingSession;
    const wrapped = wrapStreamingTranscriber({
      type: 'openai-realtime',
      audioFormat: { encoding: 'pcm16', sampleRate: 24_000, channels: 1 },
      start: () => session,
    });
    await expect(
      wrapped.transcribe({ audio: new Uint8Array(10) }),
    ).rejects.toThrow('nope');
    expect(abort).toHaveBeenCalledOnce();
    expect(() =>
      wrapStreamingTranscriber(transcriber(), { chunkBytes: 0 }),
    ).toThrow(SpeechConfigurationError);
  });
});

describe('unwrapRawAudio', () => {
  it('reads WAV headers, L16 parameters, and G.711 types', () => {
    expect(
      unwrapRawAudio(
        wav(4, { sampleRate: 8000, format: 7, bits: 8 }),
        'audio/wav',
        'test',
      ),
    ).toMatchObject({
      format: { encoding: 'g711_ulaw', sampleRate: 8000, channels: 1 },
    });
    expect(
      unwrapRawAudio(
        new Uint8Array(4),
        'audio/L16; rate=16000; channels=2',
        'test',
      ).format,
    ).toEqual({ encoding: 'pcm16', sampleRate: 16000, channels: 2 });
    expect(
      unwrapRawAudio(new Uint8Array(4), 'audio/pcma', 'test').format,
    ).toEqual({
      encoding: 'g711_alaw',
    });
    // An untyped RIFF payload is still recognised as WAV.
    expect(
      unwrapRawAudio(wav(2), 'application/octet-stream', 'test').bytes
        .byteLength,
    ).toBe(4);
    expect(() =>
      unwrapRawAudio(wav(2, { bits: 24 }), 'audio/wav', 'test'),
    ).toThrow(/Unsupported WAV encoding/);
  });
});
