import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_TURN_SECONDS,
  getStreamingTranscriber,
  getTranscriber,
  parseMaxTurnSeconds,
  SpeechConfigurationError,
  SpeechError,
  wrapStreamingTranscriber,
} from '../index.js';
import {
  decodeALaw,
  decodeMuLaw,
  resolveTurnLimit,
  type TurnLimit,
  TurnSplitter,
} from '../shared/turn-limit.js';
import { FakeWebSocket, lastSocket, type Message } from './fake-websocket.js';

const PCM16_16K = {
  encoding: 'pcm16',
  sampleRate: 16_000,
  channels: 1,
} as const;
/** Bytes per second of 16 kHz mono PCM16. */
const BPS = 32_000;
const LOUD = 8_000; // ~0.24 of full scale
const QUIET = 50; // ~0.0015 of full scale

/** PCM16 audio built from `[seconds, amplitude]` runs (square wave). */
function pcm16(...runs: Array<[seconds: number, amplitude: number]>) {
  const total = runs.reduce((sum, [seconds]) => sum + seconds * BPS, 0);
  const bytes = new Uint8Array(Math.round(total));
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const [seconds, amplitude] of runs) {
    const end = offset + Math.round(seconds * BPS);
    for (let sample = 0; offset < end; offset += 2, sample += 1) {
      view.setInt16(offset, sample % 2 ? amplitude : -amplitude, true);
    }
  }
  return bytes;
}

function limit(overrides: Partial<TurnLimit> = {}): TurnLimit {
  return {
    maxTurnSeconds: 1,
    rollover: true,
    windowSeconds: 0.5,
    silenceThreshold: 0.01,
    minSilenceMs: 300,
    ...overrides,
  };
}

/** Feeds `audio` in `chunk`-byte writes and returns absolute cut offsets. */
function cutsOf(splitter: TurnSplitter, audio: Uint8Array, chunk: number) {
  const cuts: number[] = [];
  for (let offset = 0; offset < audio.byteLength; offset += chunk) {
    for (const cut of splitter.split(audio.subarray(offset, offset + chunk))) {
      cuts.push(offset + cut);
    }
  }
  return cuts;
}

describe('TurnSplitter', () => {
  it('hard-cuts at the cap when no quiet stretch appears in the window', () => {
    const splitter = new TurnSplitter(limit(), PCM16_16K);
    expect(splitter.capBytes).toBe(BPS);
    expect(cutsOf(splitter, pcm16([2.5, LOUD]), 3_000)).toEqual([BPS, 2 * BPS]);
    expect(splitter.turnBytes).toBe(0.5 * BPS);
  });

  it('commits at the first quiet stretch inside the window', () => {
    const splitter = new TurnSplitter(limit(), PCM16_16K);
    // Quiet from 0.6 s: 300 ms later (0.9 s) the turn ends on silence.
    const audio = pcm16([0.6, LOUD], [0.35, QUIET], [0.5, LOUD]);
    expect(cutsOf(splitter, audio, 4_096)).toEqual([28_800]);
  });

  it('ignores silence before the window and too-short pauses inside it', () => {
    const splitter = new TurnSplitter(limit(), PCM16_16K);
    const audio = pcm16(
      [0.1, LOUD],
      [0.35, QUIET], // before the window (starts at 0.5 s)
      [0.15, LOUD],
      [0.2, QUIET], // inside the window, but shorter than 300 ms
      [0.5, LOUD],
    );
    expect(cutsOf(splitter, audio, 3_200)).toEqual([BPS]);
  });

  it('finds the same boundaries whatever the chunking, including split samples', () => {
    // A quiet cut at 0.9 s, then a hard cut one turn (1 s) later.
    const audio = pcm16([0.6, LOUD], [0.4, QUIET], [1.5, LOUD]);
    const expected = cutsOf(new TurnSplitter(limit(), PCM16_16K), audio, 64);
    expect(expected).toEqual([28_800, 60_800]);
    for (const chunk of [1, 777, 3_201, audio.byteLength]) {
      expect(
        cutsOf(new TurnSplitter(limit(), PCM16_16K), audio, chunk),
      ).toEqual(expected);
    }
  });

  it('honours the threshold, window, and minimum silence settings', () => {
    const audio = pcm16([0.3, LOUD], [0.25, QUIET], [1, LOUD]);
    // Whole turn is the window; 200 ms of quiet is enough.
    expect(
      cutsOf(
        new TurnSplitter(
          limit({ windowSeconds: 1, minSilenceMs: 200 }),
          PCM16_16K,
        ),
        audio,
        1_000,
      ),
    ).toEqual([16_000, 48_000]);
    // A threshold below the quiet level treats everything as speech.
    expect(
      cutsOf(
        new TurnSplitter(
          limit({
            windowSeconds: 1,
            minSilenceMs: 200,
            silenceThreshold: 0.001,
          }),
          PCM16_16K,
        ),
        audio,
        1_000,
      ),
    ).toEqual([BPS]);
  });

  it('measures turns from the negotiated format', () => {
    const stereo = new TurnSplitter(limit({ maxTurnSeconds: 0.5 }), {
      encoding: 'pcm16',
      sampleRate: 24_000,
      channels: 2,
    });
    expect(stereo.capBytes).toBe(0.5 * 24_000 * 2 * 2);
    const ulaw = new TurnSplitter(limit({ maxTurnSeconds: 0.5 }), {
      encoding: 'g711_ulaw',
      sampleRate: 8_000,
      channels: 1,
    });
    expect(ulaw.capBytes).toBe(4_000);
  });

  it('detects G.711 silence', () => {
    expect(decodeMuLaw(0xff)).toBe(0);
    expect(decodeMuLaw(0x80)).toBe(32_124);
    expect(decodeMuLaw(0x00)).toBe(-32_124);
    expect(decodeALaw(0xd5)).toBe(8);
    expect(decodeALaw(0x2a)).toBe(-32_256);

    const format = {
      encoding: 'g711_ulaw',
      sampleRate: 8_000,
      channels: 1,
    } as const;
    const splitter = new TurnSplitter(limit(), format);
    const audio = new Uint8Array(16_000).fill(0x80); // loud
    audio.fill(0xff, 5_120, 8_000); // silent from 0.64 s
    // 300 ms (2400 bytes) of silence, then a hard cut one turn later.
    expect(cutsOf(splitter, audio, 500)).toEqual([7_520, 15_520]);
  });

  it('wouldOverflow / add / reset track the turn without analysis', () => {
    const splitter = new TurnSplitter(limit(), PCM16_16K);
    splitter.add(BPS - 2);
    expect(splitter.wouldOverflow(2)).toBe(false);
    expect(splitter.wouldOverflow(4)).toBe(true);
    splitter.reset();
    expect(splitter.wouldOverflow(BPS)).toBe(false);
  });
});

describe('resolveTurnLimit', () => {
  it('prefers earlier settings, then the protocol default', () => {
    expect(resolveTurnLimit('x', 270)).toMatchObject({
      maxTurnSeconds: 270,
      rollover: true,
      windowSeconds: 15,
      silenceThreshold: 0.01,
      minSilenceMs: 300,
    });
    expect(
      resolveTurnLimit(
        'x',
        270,
        { maxTurnSeconds: 10 },
        { maxTurnSeconds: 20 },
      ),
    ).toMatchObject({ maxTurnSeconds: 10 });
    expect(
      resolveTurnLimit('x', 270, undefined, { maxTurnSeconds: 20 }),
    ).toMatchObject({ maxTurnSeconds: 20 });
    expect(
      resolveTurnLimit(
        'x',
        270,
        { rollover: { windowSeconds: 5 } },
        { rollover: false },
      ),
    ).toMatchObject({ rollover: true, windowSeconds: 5 });
    expect(resolveTurnLimit('x', 270, {}, { rollover: false })).toMatchObject({
      rollover: false,
    });
    expect(resolveTurnLimit('x', undefined, {})).toBeUndefined();
    expect(
      resolveTurnLimit('x', 270, { maxTurnSeconds: Number.POSITIVE_INFINITY }),
    ).toBeUndefined();
  });

  it('merges rollover tuning field by field across layers', () => {
    // A boolean `true` keeps the lower layer's tuning.
    expect(
      resolveTurnLimit(
        'x',
        270,
        { rollover: true },
        { rollover: { windowSeconds: 30, minSilenceMs: 500 } },
      ),
    ).toMatchObject({ rollover: true, windowSeconds: 30, minSilenceMs: 500 });
    // Objects merge per field, the higher layer winning.
    expect(
      resolveTurnLimit(
        'x',
        270,
        { rollover: { minSilenceMs: 100 } },
        { rollover: { windowSeconds: 30, minSilenceMs: 500 } },
      ),
    ).toMatchObject({ windowSeconds: 30, minSilenceMs: 100 });
    // `false` still disables rollover.
    expect(
      resolveTurnLimit(
        'x',
        270,
        { rollover: false },
        { rollover: { windowSeconds: 30 } },
      ),
    ).toMatchObject({ rollover: false });
  });

  it('rejects invalid settings', () => {
    expect(() => resolveTurnLimit('x', 270, { maxTurnSeconds: 0 })).toThrow(
      SpeechConfigurationError,
    );
    expect(() =>
      resolveTurnLimit('x', 270, { maxTurnSeconds: Number.NaN }),
    ).toThrow(/maxTurnSeconds/);
    expect(() =>
      resolveTurnLimit('x', 270, { rollover: { silenceThreshold: 2 } }),
    ).toThrow(/silenceThreshold/);
    expect(() =>
      resolveTurnLimit('x', 270, { rollover: { windowSeconds: -1 } }),
    ).toThrow(/windowSeconds/);
  });

  it('parses the env value', () => {
    expect(parseMaxTurnSeconds(undefined)).toBeUndefined();
    expect(parseMaxTurnSeconds('120.5')).toBe(120.5);
    expect(parseMaxTurnSeconds('Infinity')).toBe(Number.POSITIVE_INFINITY);
    expect(() => parseMaxTurnSeconds('abc')).toThrow(
      /HAVE_SPEECH_STREAMING_MAX_TURN_SECONDS/,
    );
    expect(() => parseMaxTurnSeconds('0')).toThrow(SpeechConfigurationError);
  });
});

// --- Session engine against a scripted vLLM server -------------------------

/**
 * A scripted vLLM realtime server. Every final commit gets a
 * `transcription.done` whose text names the turn and the bytes it received,
 * so tests can check turn boundaries and that no audio was lost.
 */
function vllmServer() {
  const turns: Uint8Array[][] = [];
  let current: Uint8Array[] | undefined;
  const handler = (socket: FakeWebSocket, message: Message) => {
    if (message.type === 'input_audio_buffer.commit' && !message.final) {
      if (current) {
        throw new Error('start commit while a turn is open');
      }
      current = [];
      turns.push(current);
      return;
    }
    if (message.type === 'input_audio_buffer.append') {
      if (!current) {
        throw new Error('append outside a turn');
      }
      current.push(Buffer.from(String(message.audio), 'base64'));
      return;
    }
    if (message.type === 'input_audio_buffer.commit' && message.final) {
      const index = turns.length;
      const bytes = (current ?? []).reduce((sum, part) => sum + part.length, 0);
      current = undefined;
      queueMicrotask(() =>
        socket.serverSend({
          type: 'transcription.done',
          text: `turn${index}:${bytes}`,
          usage: { prompt_tokens: 39, completion_tokens: 3, total_tokens: 42 },
        }),
      );
    }
  };
  const received = () => Buffer.concat(turns.flat());
  return { handler, turns, received };
}

class VllmSocket extends FakeWebSocket {
  override serverOpen(): void {
    super.serverOpen();
    this.serverSend({ type: 'session.created', id: 'sess-1' });
  }
}

function voxtral(options: Record<string, unknown> = {}, env = {}) {
  return getStreamingTranscriber(
    {
      type: 'voxtral-realtime',
      baseUrl: 'http://vllm.local:8000',
      WebSocket: VllmSocket as never,
      ...options,
    },
    { env },
  );
}

async function writeAll(
  session: { write(chunk: Uint8Array): Promise<void> },
  audio: Uint8Array,
  chunk: number,
) {
  for (let offset = 0; offset < audio.byteLength; offset += chunk) {
    await session.write(audio.subarray(offset, offset + chunk));
  }
}

afterEach(() => {
  FakeWebSocket.instances = [];
  FakeWebSocket.onClientMessage = undefined;
});

describe('automatic turn rollover (voxtral-realtime)', () => {
  it('rolls over at the threshold, opens the next turn, and loses no audio', async () => {
    const server = vllmServer();
    FakeWebSocket.onClientMessage = server.handler;
    const session = voxtral({
      maxTurnSeconds: 0.5,
      rollover: { windowSeconds: 0.1 },
    }).start();
    const finals: string[] = [];
    session.on('final', (event) => finals.push(event.text));

    const audio = pcm16([1.2, LOUD]);
    await writeAll(session, audio, 6_400);
    const result = await session.end();

    expect(
      lastSocket().sent.map((message) =>
        message.type === 'input_audio_buffer.commit'
          ? `commit${message.final ? ':final' : ''}`
          : String(message.type),
      ),
    ).toEqual([
      'session.update',
      'commit',
      'input_audio_buffer.append', // 6400
      'input_audio_buffer.append', // 6400
      'input_audio_buffer.append', // 3200: the cap (16000 bytes) splits a write
      'commit:final',
      'commit',
      'input_audio_buffer.append', // the other 3200
      'input_audio_buffer.append', // 6400
      'input_audio_buffer.append', // 6400, ending exactly at the cap
      'commit:final',
      'commit',
      'input_audio_buffer.append', // 6400
      'commit:final',
    ]);
    expect(finals).toEqual(['turn1:16000', 'turn2:16000', 'turn3:6400']);
    expect(Buffer.compare(server.received(), Buffer.from(audio))).toBe(0);
    expect(result.text).toBe('turn1:16000 turn2:16000 turn3:6400');
    expect(result.segments).toHaveLength(3);
    expect(result.durationSeconds).toBe(1.2);
    expect(result.usage?.providerUsage).toMatchObject({ total_tokens: 126 });
  });

  it('commits on a quiet boundary inside the window', async () => {
    const server = vllmServer();
    FakeWebSocket.onClientMessage = server.handler;
    const session = voxtral({
      maxTurnSeconds: 1,
      rollover: { windowSeconds: 0.5, minSilenceMs: 300 },
    }).start();

    const audio = pcm16([0.6, LOUD], [0.4, QUIET], [0.5, LOUD]);
    await writeAll(session, audio, 3_200);
    const result = await session.end();

    // 0.6 s loud + 0.3 s of silence ends turn 1 at 0.9 s.
    expect(result.text).toBe('turn1:28800 turn2:19200');
    expect(Buffer.compare(server.received(), Buffer.from(audio))).toBe(0);
  });

  it('holds audio written during a rollover until the turn is done', async () => {
    let release: (() => void) | undefined;
    FakeWebSocket.onClientMessage = (socket, message) => {
      if (message.type === 'input_audio_buffer.commit' && message.final) {
        release = () =>
          socket.serverSend({
            type: 'transcription.done',
            text: 'x',
            usage: { prompt_tokens: 39 },
          });
      }
    };
    const session = voxtral({
      maxTurnSeconds: 0.25,
      rollover: { windowSeconds: 0 },
    }).start();

    const first = session.write(pcm16([0.3, LOUD]));
    for (let index = 0; index < 5; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const socket = lastSocket();
    // The tail of the write is held: nothing follows the rollover commit.
    expect(socket.sent.at(-1)).toEqual({
      type: 'input_audio_buffer.commit',
      final: true,
    });
    expect(session.queuedBytes).toBe(1_600);
    release?.();
    await first;
    expect(socket.types().slice(-2)).toEqual([
      'input_audio_buffer.commit',
      'input_audio_buffer.append',
    ]);
    const ending = session.end();
    await new Promise((resolve) => setTimeout(resolve, 0));
    release?.();
    await expect(ending).resolves.toMatchObject({ text: 'x x' });
  });

  it('counts a manual commit as a turn end', async () => {
    const server = vllmServer();
    FakeWebSocket.onClientMessage = server.handler;
    const session = voxtral({
      maxTurnSeconds: 0.5,
      rollover: { windowSeconds: 0 },
    }).start();

    await session.write(pcm16([0.4, LOUD]));
    session.commit();
    await session.write(pcm16([0.4, LOUD]));
    const result = await session.end();
    expect(result.text).toBe('turn1:12800 turn2:12800');
  });

  it('rollover: false rejects an overlong write without failing the session', async () => {
    const server = vllmServer();
    FakeWebSocket.onClientMessage = server.handler;
    const session = voxtral({ maxTurnSeconds: 0.5, rollover: false }).start();

    await session.write(pcm16([0.4, LOUD]));
    const error = await session
      .write(pcm16([0.2, LOUD]))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SpeechError);
    expect((error as SpeechError).code).toBe('SPEECH_TURN_TOO_LONG');
    expect(session.state).toBe('open');

    // Exactly up to the cap is fine; then commit and continue.
    await session.write(pcm16([0.1, LOUD]));
    session.commit();
    await session.write(pcm16([0.2, LOUD]));
    const result = await session.end();
    expect(result.text).toBe('turn1:16000 turn2:6400');
    expect(
      lastSocket().sent.filter(
        (message) =>
          message.type === 'input_audio_buffer.commit' && message.final,
      ),
    ).toHaveLength(2);
  });

  it('applies the 270 s default, env, and option precedence', async () => {
    expect(DEFAULT_MAX_TURN_SECONDS).toBe(270);
    expect(voxtral().turnLimit?.()).toEqual({
      maxTurnSeconds: 270,
      rollover: true,
      maxTurnBytes: 270 * BPS,
    });

    const env = { HAVE_SPEECH_STREAMING_MAX_TURN_SECONDS: '120' };
    expect(voxtral({}, env).turnLimit?.()).toMatchObject({
      maxTurnSeconds: 120,
    });
    expect(voxtral({ maxTurnSeconds: 60 }, env).turnLimit?.()).toMatchObject({
      maxTurnSeconds: 60,
    });
    expect(
      voxtral({ maxTurnSeconds: 60 }, env).turnLimit?.({ maxTurnSeconds: 30 }),
    ).toMatchObject({ maxTurnSeconds: 30 });
    expect(voxtral({ rollover: false }).turnLimit?.()).toMatchObject({
      rollover: false,
    });
    expect(
      voxtral(
        {},
        { HAVE_SPEECH_STREAMING_MAX_TURN_SECONDS: 'Infinity' },
      ).turnLimit?.(),
    ).toBeUndefined();

    expect(() => voxtral({ maxTurnSeconds: -1 })).toThrow(
      SpeechConfigurationError,
    );
    expect(() =>
      voxtral({}, { HAVE_SPEECH_STREAMING_MAX_TURN_SECONDS: 'soon' }),
    ).toThrow(/HAVE_SPEECH_STREAMING_MAX_TURN_SECONDS/);
    expect(() => voxtral().start({ maxTurnSeconds: 0 })).toThrow(
      /maxTurnSeconds/,
    );
  });
});

describe('record-then-send wrapper with a turn limit', () => {
  const wavBytes = (audio: Uint8Array) => {
    const header = new Uint8Array(44);
    const view = new DataView(header.buffer);
    header.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
    view.setUint32(4, 36 + audio.byteLength, true);
    header.set([0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20], 8); // WAVEfmt
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16_000, true);
    view.setUint32(28, BPS, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    header.set([0x64, 0x61, 0x74, 0x61], 36); // data
    view.setUint32(40, audio.byteLength, true);
    const file = new Uint8Array(44 + audio.byteLength);
    file.set(header);
    file.set(audio, 44);
    return file;
  };

  it('splits an oversize clip into rollover turns', async () => {
    const server = vllmServer();
    FakeWebSocket.onClientMessage = server.handler;
    const stt = await getTranscriber(
      {
        type: 'voxtral-realtime',
        baseUrl: 'http://vllm.local:8000',
        streaming: {
          WebSocket: VllmSocket as never,
          maxTurnSeconds: 0.5,
          rollover: { windowSeconds: 0 },
        },
      },
      { env: {} },
    );
    const audio = pcm16([1.1, LOUD]);
    const result = await stt.transcribe({
      audio: wavBytes(audio),
      mimeType: 'audio/wav',
    });
    expect(result.segments).toHaveLength(3);
    expect(Buffer.compare(server.received(), Buffer.from(audio))).toBe(0);
  });

  it('rejects an oversize clip before connecting when rollover is off', async () => {
    const stt = wrapStreamingTranscriber(
      voxtral({ maxTurnSeconds: 0.5, rollover: false }),
    );
    const error = await stt
      .transcribe({
        audio: wavBytes(pcm16([0.6, LOUD])),
        mimeType: 'audio/wav',
      })
      .catch((caught: unknown) => caught);
    expect((error as SpeechError).code).toBe('SPEECH_TURN_TOO_LONG');
    expect(FakeWebSocket.instances).toHaveLength(0);

    // A clip within the cap is sent as one turn.
    const server = vllmServer();
    FakeWebSocket.onClientMessage = server.handler;
    const result = await stt.transcribe({
      audio: wavBytes(pcm16([0.5, LOUD])),
      mimeType: 'audio/wav',
    });
    expect(result.text).toBe('turn1:16000');
  });
});

describe('openai-realtime turn limits', () => {
  const openai = (options: Record<string, unknown> = {}, env = {}) =>
    getStreamingTranscriber(
      {
        type: 'openai-realtime',
        apiKey: 'sk-test',
        WebSocket: FakeWebSocket as never,
        ...options,
      },
      { env },
    );

  it('has no default limit and ignores one under server VAD', () => {
    expect(openai().turnLimit?.()).toBeUndefined();
    expect(
      openai({ turnDetection: { type: 'manual' } }).turnLimit?.(),
    ).toBeUndefined();
    expect(openai({ maxTurnSeconds: 60 }).turnLimit?.()).toBeUndefined();
    expect(
      openai(
        { turnDetection: { type: 'manual' } },
        { HAVE_SPEECH_STREAMING_MAX_TURN_SECONDS: '60' },
      ).turnLimit?.(),
    ).toEqual({
      maxTurnSeconds: 60,
      rollover: true,
      maxTurnBytes: 60 * 48_000,
    });
    expect(
      openai({ maxTurnSeconds: 60 }).turnLimit?.({
        turnDetection: { type: 'manual' },
        format: { encoding: 'g711_ulaw' },
      }),
    ).toMatchObject({ maxTurnBytes: 60 * 8_000 });
  });

  it('rolls over manual-commit sessions that opt in', async () => {
    FakeWebSocket.onClientMessage = (socket, message) => {
      if (message.type === 'input_audio_buffer.commit') {
        const id = `item_${socket.sent.length}`;
        queueMicrotask(() => {
          socket.serverSend({
            type: 'input_audio_buffer.committed',
            item_id: id,
          });
          socket.serverSend({
            type: 'conversation.item.input_audio_transcription.completed',
            item_id: id,
            transcript: id,
          });
        });
      }
    };
    const session = openai({
      turnDetection: { type: 'manual' },
      maxTurnSeconds: 0.5,
      rollover: { windowSeconds: 0 },
    }).start();
    const audio = new Uint8Array(57_600).fill(0x40); // loud 24 kHz PCM16
    await writeAll(session, audio, 9_600);
    const result = await session.end();

    const socket = lastSocket();
    expect(
      socket.types().filter((type) => type === 'input_audio_buffer.commit'),
    ).toHaveLength(3);
    expect(result.segments).toHaveLength(3);
    const sentBytes = socket.sent
      .filter((message) => message.type === 'input_audio_buffer.append')
      .reduce(
        (sum, message) =>
          sum + Buffer.from(String(message.audio), 'base64').length,
        0,
      );
    expect(sentBytes).toBe(audio.byteLength);
  });

  /**
   * Scripts OpenAI's 100 ms minimum: a commit of a shorter buffer is rejected
   * as `input_audio_buffer_commit_empty`; otherwise the turn is transcribed
   * with its byte count as the transcript.
   */
  function openAIServerWithMinimum() {
    let buffered = 0;
    return (socket: FakeWebSocket, message: Message) => {
      if (message.type === 'input_audio_buffer.append') {
        buffered += Buffer.from(String(message.audio), 'base64').length;
        return;
      }
      if (message.type !== 'input_audio_buffer.commit') {
        return;
      }
      const bytes = buffered;
      buffered = 0;
      const id = `item_${socket.sent.length}`;
      queueMicrotask(() => {
        if (bytes < 4_800) {
          socket.serverSend({
            type: 'error',
            error: {
              code: 'input_audio_buffer_commit_empty',
              message: 'buffer too small',
            },
          });
          return;
        }
        socket.serverSend({
          type: 'input_audio_buffer.committed',
          item_id: id,
        });
        socket.serverSend({
          type: 'conversation.item.input_audio_transcription.completed',
          item_id: id,
          transcript: `${bytes}`,
        });
      });
    };
  }

  it('pads a rollover tail shorter than the 100 ms commit minimum instead of dropping it', async () => {
    FakeWebSocket.onClientMessage = openAIServerWithMinimum();
    const session = openai({
      turnDetection: { type: 'manual' },
      maxTurnSeconds: 0.5,
      rollover: { windowSeconds: 0 },
    }).start();
    // 550 ms: a 500 ms turn, then a 50 ms tail.
    const audio = new Uint8Array(26_400).fill(0x40);
    await writeAll(session, audio, 2_400);
    const result = await session.end();

    // The tail (2400 bytes) is topped up with 2400 bytes of silence.
    expect(result.segments).toEqual([{ text: '24000' }, { text: '4800' }]);
    const appends = lastSocket().sent.filter(
      (message) => message.type === 'input_audio_buffer.append',
    );
    const padding = Buffer.from(String(appends.at(-1)?.audio), 'base64');
    expect(padding).toEqual(Buffer.alloc(2_400));
    // Padding is not caller audio.
    expect(result.usage?.bytes).toBe(26_400);
    expect(result.durationSeconds).toBe(0.55);
  });

  it('rejects a cap below the 100 ms commit minimum before connecting', () => {
    const manual = openai({ turnDetection: { type: 'manual' } });
    expect(() => manual.turnLimit?.({ maxTurnSeconds: 0.05 })).toThrow(
      /below openai-realtime's minimum commit of 0.1 s/,
    );
    expect(() => manual.start({ maxTurnSeconds: 0.05 })).toThrow(
      SpeechConfigurationError,
    );
    expect(FakeWebSocket.instances).toHaveLength(0);
    // Exactly the minimum is allowed; VAD sessions ignore the limit.
    expect(manual.turnLimit?.({ maxTurnSeconds: 0.1 })).toMatchObject({
      maxTurnSeconds: 0.1,
    });
    expect(openai({ maxTurnSeconds: 0.05 }).turnLimit?.()).toBeUndefined();
  });

  it('leaves short commits alone in sessions without a turn limit', async () => {
    FakeWebSocket.onClientMessage = openAIServerWithMinimum();
    const session = openai({ turnDetection: { type: 'manual' } }).start();
    await session.write(new Uint8Array(2_400).fill(0x40));
    const result = await session.end();
    expect(result.text).toBe('');
    expect(
      lastSocket()
        .types()
        .filter((type) => type === 'input_audio_buffer.append'),
    ).toHaveLength(1);
  });
});
