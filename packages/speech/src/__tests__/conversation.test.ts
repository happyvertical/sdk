import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAIWebRTCVoiceSession } from '../conversation.js';
import {
  createOpenAIVoiceCall,
  hangupOpenAIVoiceCall,
  openAIConversationConfig,
} from '../conversation-server.js';

const SDP = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function fixture() {
  const trackEvents = new Map<string, () => void>();
  const track = {
    enabled: true,
    stop: vi.fn(),
    addEventListener: vi.fn((type: string, listener: () => void) =>
      trackEvents.set(type, listener),
    ),
    removeEventListener: vi.fn((type: string) => trackEvents.delete(type)),
  };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
  const audio = {
    autoplay: false,
    muted: false,
    srcObject: null,
    pause: vi.fn(),
    play: vi.fn(async () => {}),
  } as unknown as HTMLAudioElement;
  const sent: Record<string, unknown>[] = [];
  const channel = {
    readyState: 'open',
    onopen: null as (() => void) | null,
    onmessage: null as ((event: { data: string }) => void) | null,
    onclose: null as (() => void) | null,
    onerror: null as (() => void) | null,
    send: (data: string) => sent.push(JSON.parse(data)),
    close: vi.fn(),
  };
  const peer = {
    connectionState: 'new',
    ontrack: null,
    onconnectionstatechange: null as (() => void) | null,
    addTrack: vi.fn(),
    createDataChannel: () => channel,
    createOffer: async () => ({ type: 'offer', sdp: SDP }),
    setLocalDescription: vi.fn(async () => {}),
    setRemoteDescription: vi.fn(async () => {
      channel.onopen?.();
    }),
    close: vi.fn(),
  };
  const negotiate = vi.fn(async () => SDP);
  const session = createOpenAIWebRTCVoiceSession({
    getMicrophone: async () => stream,
    audio,
    createPeerConnection: () => peer as unknown as RTCPeerConnection,
    negotiate,
  });
  const event = (value: unknown) =>
    channel.onmessage?.({
      data: typeof value === 'string' ? value : JSON.stringify(value),
    });
  return {
    session,
    peer,
    channel,
    track,
    endMicrophone: () => trackEvents.get('ended')?.(),
    audio,
    sent,
    event,
    negotiate,
    stream,
  };
}

describe('OpenAI conversational WebRTC session', () => {
  it('coalesces connect, negotiates once, and releases every resource on repeated close', async () => {
    const f = fixture();
    const states: string[] = [];
    f.session.on('state', (state) => states.push(state));
    const first = f.session.connect();
    expect(f.session.connect()).toBe(first);
    await first;
    expect(f.session.state).toBe('connected');
    expect(f.negotiate).toHaveBeenCalledOnce();
    f.session.close();
    f.session.close();
    expect(states).toEqual(['connecting', 'connected', 'closed']);
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.peer.close).toHaveBeenCalledOnce();
    expect(f.channel.close).toHaveBeenCalledOnce();
    expect(f.audio.srcObject).toBeNull();
    expect(f.channel.onmessage).toBeNull();
    await expect(f.session.connect()).rejects.toThrow('new voice session');
  });
  it('settles close during a permission prompt and stops a late granted stream', async () => {
    const f = fixture();
    let grant!: (stream: MediaStream) => void;
    const session = createOpenAIWebRTCVoiceSession({
      getMicrophone: () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
      negotiate: f.negotiate,
    });
    const connection = session.connect();
    const rejection = expect(connection).rejects.toBeDefined();
    session.close();
    await rejection;
    grant(f.stream);
    await Promise.resolve();
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.negotiate).not.toHaveBeenCalled();
  });
  it('fails permission denial and preserves the cause for the caller', async () => {
    const denied = new DOMException('Denied', 'NotAllowedError');
    const session = createOpenAIWebRTCVoiceSession({
      getMicrophone: async () => {
        throw denied;
      },
      negotiate: async () => SDP,
    });
    await expect(session.connect()).rejects.toBe(denied);
    expect(session.state).toBe('failed');
  });
  it('times out even when negotiation ignores cancellation', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const session = createOpenAIWebRTCVoiceSession({
      getMicrophone: async () => f.stream,
      audio: f.audio,
      createPeerConnection: () => f.peer as unknown as RTCPeerConnection,
      negotiate: () => new Promise(() => {}),
      connectTimeoutMs: 50,
    });
    const result = expect(session.connect()).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(50);
    await result;
    expect(session.state).toBe('failed');
    expect(f.track.stop).toHaveBeenCalledOnce();
  });
  it('cleans up negotiation failure without exposing its message in the error event', async () => {
    const f = fixture();
    f.negotiate.mockRejectedValueOnce(new Error('secret from host'));
    const errors: Error[] = [];
    f.session.on('error', (error) => errors.push(error));
    await expect(f.session.connect()).rejects.toThrow('secret from host');
    expect(errors[0].message).not.toContain('secret');
    expect(f.track.stop).toHaveBeenCalledOnce();
  });
  it('upserts partial/final transcripts and ignores late duplicates, missing fields and unknown events', async () => {
    const f = fixture();
    const turns: unknown[] = [];
    f.session.on('transcript', (turn) => turns.push(turn));
    await f.session.connect();
    f.event({
      type: 'response.output_audio_transcript.delta',
      item_id: 'a',
      delta: 'Hello',
    });
    f.event({
      type: 'response.output_audio_transcript.delta',
      item_id: 'a',
      delta: ' there',
    });
    f.event({
      type: 'response.output_audio_transcript.done',
      item_id: 'a',
      transcript: 'Hello there.',
    });
    f.event({
      type: 'response.output_audio_transcript.delta',
      item_id: 'a',
      delta: 'duplicate',
    });
    f.event({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'u',
      transcript: 'Hi',
    });
    f.event({ type: 'future.event' });
    f.event({ type: 'response.output_audio_transcript.delta' });
    f.event('bad JSON');
    f.event([]);
    expect(turns).toEqual([
      { itemId: 'a', role: 'assistant', text: 'Hello', final: false },
      { itemId: 'a', role: 'assistant', text: 'Hello there', final: false },
      { itemId: 'a', role: 'assistant', text: 'Hello there.', final: true },
      { itemId: 'u', role: 'user', text: 'Hi', final: true },
    ]);
    f.session.close();
  });
  it('sends typed text once, requests a reply and validates input', async () => {
    const f = fixture();
    expect(() => f.session.sendText('hello')).toThrow('not connected');
    await f.session.connect();
    const id = f.session.sendText(' hello ');
    expect(id.length).toBeLessThanOrEqual(32);
    expect(f.sent).toEqual([
      {
        type: 'conversation.item.create',
        item: {
          id,
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'hello' }],
        },
      },
      expect.objectContaining({
        type: 'response.create',
        event_id: expect.any(String),
      }),
    ]);
    expect(() => f.session.sendText('  ')).toThrow('1–16000');
    expect(() => f.session.sendText('a'.repeat(16001))).toThrow();
    f.session.close();
  });
  it('queues interrupted typed turns until the active response is terminal', async () => {
    const f = fixture();
    await f.session.connect();
    f.session.respond('intro');
    f.session.interrupt();
    f.session.sendText('first typed turn');
    f.session.sendText('second typed turn');

    expect(f.sent.map((event) => event.type)).toEqual([
      'response.create',
      'response.cancel',
      'output_audio_buffer.clear',
      'conversation.item.create',
      'conversation.item.create',
    ]);
    expect(
      f.sent.filter((event) => event.type === 'response.create'),
    ).toHaveLength(1);

    // An error for another client event cannot release or retry the queued turn.
    f.event({
      type: 'error',
      error: {
        code: 'conversation_already_has_active_response',
        event_id: 'different-client-event',
      },
    });
    expect(
      f.sent.filter((event) => event.type === 'response.create'),
    ).toHaveLength(1);

    f.event({
      type: 'response.done',
      response: { id: 'intro', status: 'cancelled' },
    });
    expect(
      f.sent.filter((event) => event.type === 'response.create'),
    ).toHaveLength(2);
    expect(f.sent.at(-1)).toEqual(
      expect.objectContaining({
        type: 'response.create',
        event_id: expect.any(String),
      }),
    );
    f.session.close();
  });
  it('keeps queued text pending after an uncorrelated active-response error', async () => {
    const f = fixture();
    await f.session.connect();
    f.session.respond();
    f.event({ type: 'response.created', response: { id: 'active' } });
    f.session.sendText('typed while active');

    f.event({ type: 'error', error: { code: 'server_error' } });
    expect(
      f.sent.filter((event) => event.type === 'response.create'),
    ).toHaveLength(1);

    f.event({
      type: 'response.done',
      response: { id: 'active', status: 'completed' },
    });
    expect(
      f.sent.filter((event) => event.type === 'response.create'),
    ).toHaveLength(2);
    f.session.close();
  });
  it('releases queued text after a correlated response.create rejection', async () => {
    const f = fixture();
    const errors: Error[] = [];
    f.session.on('error', (error) => errors.push(error));
    await f.session.connect();
    f.session.respond('intro');
    const rejected = f.sent.at(-1);
    expect(rejected).toEqual(
      expect.objectContaining({
        type: 'response.create',
        event_id: expect.any(String),
      }),
    );
    f.session.sendText('typed after rejected intro');

    f.event({
      type: 'error',
      error: { event_id: rejected?.event_id, code: 'invalid_event' },
    });

    const responses = f.sent.filter(
      (event) => event.type === 'response.create',
    );
    expect(responses).toHaveLength(2);
    expect(responses[1]).toEqual(
      expect.objectContaining({
        type: 'response.create',
        event_id: expect.any(String),
      }),
    );
    expect(responses[1]?.event_id).not.toBe(rejected?.event_id);
    expect(errors).toHaveLength(1);
    f.session.close();
  });
  it.each([
    'completed',
    'cancelled',
    'failed',
    'incomplete',
  ] as const)('releases a queued typed response after terminal %s completion', async (status) => {
    const f = fixture();
    await f.session.connect();
    f.session.respond();
    f.session.sendText('queued');
    f.event({ type: 'response.done', response: { id: 'active', status } });
    expect(
      f.sent.filter((event) => event.type === 'response.create'),
    ).toHaveLength(2);
    f.session.close();
  });
  it('lets a terminal tool continuation consume a queued response request once', async () => {
    const f = fixture();
    await f.session.connect();
    f.session.respond();
    f.session.sendText('typed while the tool response is active');
    f.session.submitToolResult('tool', { ok: true });
    f.session.on('response', ({ active }) => {
      if (!active) f.session.respond();
    });
    f.event({
      type: 'response.done',
      response: { id: 'tool-response', status: 'completed' },
    });
    expect(
      f.sent.filter((event) => event.type === 'response.create'),
    ).toHaveLength(2);
    expect(f.sent.at(-1)).toEqual(
      expect.objectContaining({
        type: 'response.create',
        event_id: expect.any(String),
      }),
    );
    f.session.close();
  });
  it('retains an error-callback response until the continuation response is terminal', async () => {
    const f = fixture();
    await f.session.connect();
    f.session.respond();
    f.session.sendText('typed while active');
    f.session.on('response', ({ active }) => {
      if (!active) f.session.respond();
    });
    f.session.on('error', () => f.session.respond());

    f.event({
      type: 'response.done',
      response: { id: 'failed', status: 'failed' },
    });
    expect(
      f.sent.filter((event) => event.type === 'response.create'),
    ).toHaveLength(2);

    f.event({
      type: 'response.done',
      response: { id: 'continuation', status: 'completed' },
    });
    expect(
      f.sent.filter((event) => event.type === 'response.create'),
    ).toHaveLength(3);
    f.session.close();
  });
  it('drops a queued typed response when the session disconnects', async () => {
    const f = fixture();
    await f.session.connect();
    f.session.respond();
    f.session.sendText('do not replay after disconnect');
    f.session.close();
    f.event({
      type: 'response.done',
      response: { id: 'active', status: 'cancelled' },
    });
    expect(
      f.sent.filter((event) => event.type === 'response.create'),
    ).toHaveLength(1);
  });
  it('separates mic and output mute and interrupts active generation plus queued playback', async () => {
    const f = fixture();
    await f.session.connect();
    f.session.setMicMuted(true);
    expect(f.track.enabled).toBe(false);
    expect(f.audio.muted).toBe(false);
    f.session.setOutputMuted(true);
    expect(f.audio.muted).toBe(true);
    f.session.setMicMuted(false);
    expect(f.track.enabled).toBe(true);
    f.event({ type: 'response.created', response: { id: 'r' } });
    f.session.interrupt();
    expect(f.sent).toContainEqual({
      event_id: expect.any(String),
      type: 'response.cancel',
      response_id: 'r',
    });
    expect(f.sent).toContainEqual({ type: 'output_audio_buffer.clear' });
    f.session.close();
    expect(() => f.session.interrupt()).not.toThrow();
  });
  it('preserves speech item identity before tools and late transcripts without changing boolean listeners', async () => {
    const f = fixture();
    const speech: unknown[] = [];
    const legacy: boolean[] = [];
    const turns: unknown[] = [];
    f.session.on('inputSpeech', (active, metadata) =>
      speech.push({ active, metadata }),
    );
    f.session.on('inputSpeech', (active) => legacy.push(active));
    f.session.on('transcript', (turn) => turns.push(turn));
    await f.session.connect();
    f.event({ type: 'input_audio_buffer.speech_started', item_id: 'older' });
    f.event({ type: 'input_audio_buffer.speech_stopped', item_id: 'older' });
    f.event({ type: 'input_audio_buffer.speech_started', item_id: 'current' });
    f.event({
      type: 'response.function_call_arguments.done',
      call_id: 'c',
      name: 'navigate',
      arguments: '{}',
    });
    expect(speech.at(-1)).toEqual({
      active: true,
      metadata: { itemId: 'current' },
    });
    expect(turns).toEqual([]);
    f.event({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'older',
      transcript: 'Earlier request',
    });
    f.event({ type: 'input_audio_buffer.speech_stopped', item_id: 'current' });
    f.event({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'current',
      transcript: 'Yes',
    });
    expect(turns).toEqual([
      { itemId: 'older', role: 'user', text: 'Earlier request', final: true },
      { itemId: 'current', role: 'user', text: 'Yes', final: true },
    ]);
    expect(speech.at(-1)).toEqual({
      active: false,
      metadata: { itemId: 'current' },
    });
    expect(legacy).toEqual([true, false, true, false]);
    for (const itemId of [undefined, null, 42, {}, '']) {
      f.event({ type: 'input_audio_buffer.speech_started', item_id: itemId });
      expect(speech.at(-1)).toEqual({
        active: true,
        metadata: { itemId: undefined },
      });
    }
    f.session.close();
  });
  it('appends bounded assistant context without transcripts, responses or implicit reconnects', async () => {
    const f = fixture();
    const turns: unknown[] = [];
    f.session.on('transcript', (turn) => turns.push(turn));
    expect(() => f.session.appendAssistantContext('receipt')).toThrow(
      'not connected',
    );
    expect(f.negotiate).not.toHaveBeenCalled();
    await f.session.connect();
    f.event({ type: 'response.created', response: { id: 'active' } });
    const before = f.sent.length;
    const id = f.session.appendAssistantContext('  Verified receipt.  ');
    expect(id).toMatch(/^hv_[a-f0-9]{24}$/);
    expect(f.sent.slice(before)).toEqual([
      {
        type: 'conversation.item.create',
        item: {
          id,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Verified receipt.' }],
        },
      },
    ]);
    expect(turns).toEqual([]);
    for (const text of ['', '   ', 'a'.repeat(16_001)])
      expect(() => f.session.appendAssistantContext(text)).toThrow('1–16000');
    expect(f.sent).toHaveLength(before + 1);
    const boundary = f.session.appendAssistantContext('a'.repeat(16_000));
    expect(boundary).not.toBe(id);
    f.event({ type: 'response.done', response: { id: 'active' } });
    expect(f.sent.filter((event) => event.type === 'response.create')).toEqual(
      [],
    );
    f.session.close();
    expect(() => f.session.appendAssistantContext('receipt')).toThrow(
      'not connected',
    );
    expect(f.negotiate).toHaveBeenCalledOnce();
  });
  it('owns a granted stream before close can race the acquisition continuation', async () => {
    const f = fixture();
    let grant!: (stream: MediaStream) => void;
    const permission = new Promise<MediaStream>((resolve) => {
      grant = resolve;
    });
    const session = createOpenAIWebRTCVoiceSession({
      getMicrophone: () => permission,
      negotiate: f.negotiate,
    });
    const connection = session.connect();
    const rejection = expect(connection).rejects.toBeDefined();
    // Acquisition's first callback runs, then close, before the await resumes.
    void permission.then(() => session.close());
    grant(f.stream);
    await rejection;
    expect(session.state).toBe('closed');
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.negotiate).not.toHaveBeenCalled();
    await expect(session.connect()).rejects.toThrow('new voice session');
    const fresh = fixture();
    await fresh.session.connect();
    expect(fresh.session.state).toBe('connected');
    fresh.session.close();
    expect(fresh.track.stop).toHaveBeenCalledOnce();
  });
  it('times out pending permission, disposes a late grant and permits a fresh session', async () => {
    vi.useFakeTimers();
    const f = fixture();
    let grant!: (stream: MediaStream) => void;
    const session = createOpenAIWebRTCVoiceSession({
      getMicrophone: () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
      negotiate: f.negotiate,
      connectTimeoutMs: 25,
    });
    const connection = session.connect();
    const rejection = expect(connection).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(25);
    await rejection;
    expect(session.state).toBe('failed');
    grant(f.stream);
    await Promise.resolve();
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.negotiate).not.toHaveBeenCalled();
    await expect(session.connect()).rejects.toThrow('new voice session');
    const fresh = fixture();
    await fresh.session.connect();
    expect(fresh.session.state).toBe('connected');
    fresh.session.close();
  });
  it('preserves provider response identity across generation and overlapping playback', async () => {
    const f = fixture();
    const playback: unknown[] = [];
    const legacy: boolean[] = [];
    const turns: unknown[] = [];
    f.session.on('speaking', (active, metadata) =>
      playback.push({ active, metadata }),
    );
    f.session.on('speaking', (active) => legacy.push(active));
    f.session.on('transcript', (turn) => turns.push(turn));
    await f.session.connect();
    f.event({ type: 'output_audio_buffer.started', response_id: 'A' });
    f.event({ type: 'output_audio_buffer.started', response_id: 'A' });
    f.event({ type: 'response.done', response: { id: 'A' } });
    f.event({ type: 'response.created', response: { id: 'B' } });
    f.event({
      type: 'response.output_audio_transcript.delta',
      response_id: 'A',
      item_id: 'a',
      delta: 'Still playing',
    });
    f.event({
      type: 'response.output_audio_transcript.done',
      response_id: 'B',
      item_id: 'b',
      transcript: 'New reply',
    });
    expect(turns).toEqual([
      {
        itemId: 'a',
        role: 'assistant',
        text: 'Still playing',
        final: false,
        responseId: 'A',
      },
      {
        itemId: 'b',
        role: 'assistant',
        text: 'New reply',
        final: true,
        responseId: 'B',
      },
    ]);
    f.event({ type: 'output_audio_buffer.started', response_id: 'B' });
    f.event({ type: 'output_audio_buffer.stopped', response_id: 'A' });
    f.event({ type: 'output_audio_buffer.cleared', response_id: 'A' });
    f.session.interrupt();
    expect(playback).toEqual([
      { active: true, metadata: { responseId: 'A', reason: 'started' } },
      { active: true, metadata: { responseId: 'B', reason: 'started' } },
      { active: true, metadata: { responseId: 'A', reason: 'stopped' } },
      { active: true, metadata: { responseId: 'A', reason: 'cleared' } },
      { active: false, metadata: { responseId: 'B', reason: 'interrupted' } },
    ]);
    expect(legacy).toEqual([true, true, true, true, false]);
    f.session.close();
  });
  it('uses only playback identity for local mute and close, leaving malformed provider IDs absent', async () => {
    for (const action of ['muted', 'closed'] as const) {
      const f = fixture();
      const events: unknown[] = [];
      f.session.on('speaking', (active, metadata) =>
        events.push({ active, metadata }),
      );
      await f.session.connect();
      f.event({ type: 'output_audio_buffer.started', response_id: 'A' });
      f.event({ type: 'response.created', response: { id: 'B' } });
      if (action === 'muted') f.session.setOutputMuted(true);
      else f.session.close();
      expect(events.at(-1)).toEqual({
        active: false,
        metadata: { responseId: 'A', reason: action },
      });
      f.session.close();
    }
    const f = fixture();
    const events: unknown[] = [];
    const turns: unknown[] = [];
    f.session.on('speaking', (active, metadata) =>
      events.push({ active, metadata }),
    );
    f.session.on('transcript', (turn) => turns.push(turn));
    await f.session.connect();
    for (const [index, responseId] of [undefined, null, 42, {}, ''].entries()) {
      f.event({ type: 'output_audio_buffer.started', response_id: responseId });
      f.event({ type: 'output_audio_buffer.stopped', response_id: responseId });
      f.event({
        type: 'response.output_text.done',
        response_id: responseId,
        item_id: `unknown-${index}`,
        text: 'Text',
      });
    }
    expect(events).toEqual(
      Array.from({ length: 5 }, () => [
        { active: true, metadata: { reason: 'started' } },
        { active: false, metadata: { reason: 'stopped' } },
      ]).flat(),
    );
    expect(
      turns.every((turn) => !(turn as Record<string, unknown>).responseId),
    ).toBe(true);
    f.session.close();
  });
  it('keeps muted provider playback identity changes silent for legacy listeners', async () => {
    const f = fixture();
    const speaking = vi.fn();
    f.session.on('speaking', speaking);
    await f.session.connect();
    f.session.setOutputMuted(true);
    f.event({ type: 'output_audio_buffer.started', response_id: 'a' });
    f.event({ type: 'output_audio_buffer.started', response_id: 'b' });
    f.event({ type: 'output_audio_buffer.stopped', response_id: 'b' });
    expect(speaking).not.toHaveBeenCalled();
    f.session.setOutputMuted(false);
    f.event({ type: 'output_audio_buffer.started', response_id: 'c' });
    expect(speaking).toHaveBeenCalledExactlyOnceWith(true, {
      responseId: 'c',
      reason: 'started',
    });
    f.session.close();
  });
  it.each([
    'peer',
    'channel',
    'microphone',
  ] as const)('does not label %s failure cleanup as an intentional close', async (failure) => {
    const f = fixture();
    const speaking = vi.fn();
    f.session.on('speaking', speaking);
    await f.session.connect();
    f.event({ type: 'output_audio_buffer.started', response_id: 'playing' });
    if (failure === 'peer') {
      f.peer.connectionState = 'failed';
      f.peer.onconnectionstatechange?.();
    } else if (failure === 'channel') {
      f.channel.onerror?.();
    } else {
      f.endMicrophone();
    }
    expect(f.session.state).toBe('failed');
    expect(speaking).toHaveBeenLastCalledWith(false, { responseId: 'playing' });
    expect(f.track.stop).toHaveBeenCalledOnce();
    f.session.close();
  });
  it('exposes only safe completion status and reason from response.done', async () => {
    const f = fixture();
    const responses: unknown[] = [];
    f.session.on('response', (value) => responses.push(value));
    await f.session.connect();
    for (const [status, reason] of [
      ['completed', undefined],
      ['incomplete', 'max_output_tokens'],
      ['incomplete', 'content_filter'],
      ['cancelled', 'turn_detected'],
      ['cancelled', 'client_cancelled'],
      ['failed', undefined],
    ]) {
      f.event({
        type: 'response.created',
        response: { id: 'r', status, status_details: { reason } },
      });
      expect(responses.at(-1)).toEqual({ active: true, responseId: 'r' });
      f.event({
        type: 'response.done',
        response: {
          id: 'r',
          status,
          status_details: { reason, error: { message: 'private error' } },
          instructions: 'private instructions',
        },
      });
      expect(responses.at(-1)).toEqual({
        active: false,
        responseId: 'r',
        status,
        ...(reason ? { statusReason: reason } : {}),
      });
    }
    for (const status of [undefined, null, 42, {}, 'unknown']) {
      f.event({
        type: 'response.done',
        response: { status, status_details: { reason: 'max_output_tokens' } },
      });
      expect(responses.at(-1)).toEqual({ active: false, responseId: 'r' });
    }
    for (const reason of [
      undefined,
      null,
      42,
      {},
      'private unknown',
      'client_cancelled',
    ]) {
      f.event({
        type: 'response.done',
        response: { status: 'incomplete', status_details: { reason } },
      });
      expect(responses.at(-1)).toEqual({
        active: false,
        responseId: 'r',
        status: 'incomplete',
      });
    }
    expect(JSON.stringify(responses)).not.toContain('private');
    f.session.close();
  });
  it('suppresses only one exact benign error correlated to its own cancellation', async () => {
    const f = fixture();
    const errors: Error[] = [];
    f.session.on('error', (error) => errors.push(error));
    await f.session.connect();
    f.session.respond();
    f.session.interrupt();
    const cancel = f.sent.find((event) => event.type === 'response.cancel');
    expect(cancel?.event_id).toEqual(expect.any(String));
    f.event({ type: 'response.done', response: { status: 'cancelled' } });
    const benign = {
      type: 'invalid_request_error',
      code: 'response_cancel_not_active',
      event_id: cancel?.event_id,
    };
    f.event({ type: 'error', event_id: 'server-event', error: benign });
    expect(errors).toEqual([]);
    expect(f.session.state).toBe('connected');
    // Consumed IDs cannot suppress replay, nor can a top-level server event ID.
    f.event({ type: 'error', error: benign });
    f.event({
      type: 'error',
      event_id: cancel?.event_id,
      error: { code: 'response_cancel_not_active' },
    });
    for (const eventId of [undefined, null, 42, {}, 'forged'])
      f.event({
        type: 'error',
        error: { code: 'response_cancel_not_active', event_id: eventId },
      });
    expect(errors).toHaveLength(7);
    f.session.respond();
    f.session.interrupt();
    const next = f.sent
      .filter((event) => event.type === 'response.cancel')
      .at(-1);
    f.event({
      type: 'error',
      error: {
        code: 'server_error',
        event_id: next?.event_id,
        message: 'private',
      },
    });
    f.event({
      type: 'error',
      error: { code: 'response_cancel_not_active', event_id: next?.event_id },
    });
    expect(errors).toHaveLength(9);
    expect(
      errors.every(
        (error) =>
          error.message === 'Realtime provider rejected a conversation event',
      ),
    ).toBe(true);
    f.session.close();
  });
  it('bounds cancellation correlation and keeps evicted IDs visible', async () => {
    const f = fixture();
    const errors: Error[] = [];
    f.session.on('error', (error) => errors.push(error));
    await f.session.connect();
    f.session.respond();
    for (let index = 0; index < 33; index++) f.session.interrupt();
    const cancels = f.sent.filter((event) => event.type === 'response.cancel');
    expect(new Set(cancels.map((event) => event.event_id)).size).toBe(33);
    f.event({
      type: 'error',
      error: {
        code: 'response_cancel_not_active',
        event_id: cancels[0].event_id,
      },
    });
    f.event({
      type: 'error',
      error: {
        code: 'response_cancel_not_active',
        event_id: cancels[1].event_id,
      },
    });
    f.event({
      type: 'error',
      error: {
        code: 'response_cancel_not_active',
        event_id: cancels[32].event_id,
      },
    });
    expect(errors).toHaveLength(1);
    expect(f.session.state).toBe('connected');
    f.session.close();
  });
  it('appends a host-owned typed turn without scheduling generation', async () => {
    const f = fixture();
    await f.session.connect();
    const turns: unknown[] = [];
    f.session.on('transcript', (turn) => turns.push(turn));
    f.session.respond('intro');
    f.event({ type: 'response.created', response: { id: 'intro' } });
    f.session.interrupt();
    const id = f.session.sendText(' host-owned turn ', false);
    f.event({
      type: 'response.done',
      response: { id: 'intro', status: 'cancelled' },
    });
    expect(
      f.sent.filter((event) => event.type === 'response.create'),
    ).toHaveLength(1);
    expect(f.sent.some((event) => event.type === 'response.cancel')).toBe(true);
    expect(
      f.sent.some((event) => event.type === 'output_audio_buffer.clear'),
    ).toBe(true);
    expect(turns).toEqual([
      { itemId: id, role: 'user', text: 'host-owned turn', final: true },
    ]);
    f.session.respond('trusted host intake accepted');
    expect(
      f.sent.filter((event) => event.type === 'response.create'),
    ).toHaveLength(2);
    f.session.close();
  });
  it('keeps VAD and asynchronous empty ASR independent of host generation', async () => {
    const f = fixture();
    await f.session.connect();
    const input: boolean[] = [];
    f.session.on('inputSpeech', (active) => input.push(active));
    f.event({
      type: 'input_audio_buffer.speech_started',
      item_id: 'utterance',
    });
    f.event({
      type: 'input_audio_buffer.speech_stopped',
      item_id: 'utterance',
    });
    f.event({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'utterance',
      transcript: '',
    });
    expect(input).toEqual([true, false]);
    expect(
      f.sent.filter((event) => event.type === 'response.create'),
    ).toHaveLength(0);
    f.session.respond('accepted later');
    expect(
      f.sent.filter((event) => event.type === 'response.create'),
    ).toHaveLength(1);
    f.session.close();
  });
  it('distinguishes actual playback, input speech and response generation; forwards usage and tools', async () => {
    const f = fixture();
    const speaking: boolean[] = [];
    const input: boolean[] = [];
    const usage: unknown[] = [];
    const tools: unknown[] = [];
    f.session.on('speaking', (v) => speaking.push(v));
    f.session.on('inputSpeech', (v) => input.push(v));
    f.session.on('usage', (v) => usage.push(v));
    f.session.on('toolCall', (v) => tools.push(v));
    await f.session.connect();
    f.event({ type: 'response.created', response: {} });
    expect(speaking).toEqual([]);
    f.event({ type: 'output_audio_buffer.started' });
    f.event({ type: 'output_audio_buffer.stopped' });
    f.event({ type: 'input_audio_buffer.speech_started' });
    f.event({ type: 'input_audio_buffer.speech_stopped' });
    f.event({
      type: 'response.done',
      response: { usage: { total_tokens: 7 } },
    });
    f.event({
      type: 'response.function_call_arguments.done',
      call_id: 'c',
      name: 'navigate',
      arguments: '{}',
    });
    expect(speaking).toEqual([true, false]);
    expect(input).toEqual([true, false]);
    expect(usage).toEqual([{ total_tokens: 7 }]);
    expect(tools).toHaveLength(1);
    f.session.submitToolResult('c', { ok: true });
    expect(f.sent.at(-1)?.type).toBe('conversation.item.create');
    f.session.respond();
    expect(f.sent.at(-1)).toEqual(
      expect.objectContaining({
        type: 'response.create',
        event_id: expect.any(String),
      }),
    );
    f.session.close();
  });
  it('fails unexpected channel/peer loss without replaying any turn', async () => {
    const f = fixture();
    await f.session.connect();
    f.peer.connectionState = 'disconnected';
    f.peer.onconnectionstatechange?.();
    expect(f.session.state).toBe('failed');
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.sent).toHaveLength(0);
  });
});

describe('server call lifecycle', () => {
  const config = { apiKey: 'test-server-key', model: 'test-model' };
  it('creates a GA audio session using multipart and returns only SDP/call id', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(SDP, {
          headers: { location: '/v1/realtime/calls/rtc_123' },
        }),
    );
    await expect(
      createOpenAIVoiceCall(SDP, { ...config, fetch }),
    ).resolves.toEqual({ answer: SDP, callId: 'rtc_123' });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/realtime/calls');
    const body = init.body as FormData;
    expect(body.get('sdp')).toBe(SDP);
    expect(JSON.parse(body.get('session') as string)).toMatchObject({
      type: 'realtime',
      model: 'test-model',
      audio: { output: { voice: 'marin' } },
    });
    expect(JSON.stringify(body.get('session'))).not.toContain(config.apiKey);
  });
  it('maps manual and server VAD and omits absent optional fields', () => {
    expect(
      openAIConversationConfig({
        model: 'm',
        turnDetection: { type: 'manual' },
      }),
    ).toMatchObject({ audio: { input: { turn_detection: null } } });
    expect(
      openAIConversationConfig({
        model: 'm',
        turnDetection: { type: 'server_vad', silenceDurationMs: 300 },
      }),
    ).toMatchObject({
      audio: { input: { turn_detection: { silence_duration_ms: 300 } } },
    });
    expect(() =>
      openAIConversationConfig({
        model: 'm',
        turnDetection: { type: 'future' } as never,
      }),
    ).toThrow('Unknown');
  });
  it.each([
    'server_vad',
    'semantic_vad',
  ] as const)('opts out of automatic %s replies while preserving boundaries and interruption', (type) => {
    for (const automaticResponse of [undefined, true, false]) {
      expect(
        openAIConversationConfig({
          model: 'm',
          turnDetection: { type },
          automaticResponse,
          transcriptionModel: 'asr',
        }),
      ).toMatchObject({
        audio: {
          input: {
            turn_detection: {
              type,
              create_response: automaticResponse !== false,
              interrupt_response: true,
            },
            transcription: { model: 'asr' },
          },
        },
      });
    }
    expect(
      openAIConversationConfig({
        model: 'm',
        automaticResponse: false,
        turnDetection: { type: 'manual' },
      }),
    ).toMatchObject({ audio: { input: { turn_detection: null } } });
  });
  it.each([
    '',
    'invalid',
    'v=0' + 'a'.repeat(66000),
  ])('rejects invalid/oversize SDP before the provider', async (sdp) => {
    const fetch = vi.fn();
    await expect(
      createOpenAIVoiceCall(sdp, { ...config, fetch }),
    ).rejects.toThrow('SDP');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects missing credentials and invalid model/control ids', async () => {
    await expect(
      createOpenAIVoiceCall(SDP, { ...config, apiKey: '' }),
    ).rejects.toThrow('API key');
    await expect(
      createOpenAIVoiceCall(SDP, { ...config, model: '' }),
    ).rejects.toThrow('model');
    await expect(hangupOpenAIVoiceCall('../bad', config)).rejects.toThrow(
      'call id',
    );
  });
  it('hangs up a call if its answer is malformed', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('bad', {
          headers: { location: '/v1/realtime/calls/rtc_123' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(
      createOpenAIVoiceCall(SDP, { ...config, fetch }),
    ).rejects.toThrow('SDP answer');
    expect(fetch.mock.calls[1][0]).toContain('/rtc_123/hangup');
  });
  it('rejects missing call id and provider errors without payload/key leakage or retries', async () => {
    await expect(
      createOpenAIVoiceCall(SDP, {
        ...config,
        fetch: async () => new Response(SDP),
      }),
    ).rejects.toThrow('call id');
    const fetch = vi.fn(
      async () => new Response(config.apiKey, { status: 429 }),
    );
    await expect(
      createOpenAIVoiceCall(SDP, { ...config, fetch }),
    ).rejects.toMatchObject({
      status: 429,
      message: 'OpenAI voice call request failed',
      responseBody: undefined,
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('passes abort to transport and redacts transport errors', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = vi.fn(async (_url, init) => {
      init?.signal?.throwIfAborted();
      throw new Error(config.apiKey);
    });
    await expect(
      createOpenAIVoiceCall(SDP, {
        ...config,
        fetch,
        signal: controller.signal,
      }),
    ).rejects.toThrow('cancelled');
    await expect(
      hangupOpenAIVoiceCall('rtc_1', { ...config, fetch }),
    ).rejects.toThrow('transport failed');
  });
});

describe('review regressions: manual audio turns and post-header setup failure', () => {
  const config = { apiKey: 'test-key', model: 'test-model' };
  it('commits manual microphone input before creating a reply', async () => {
    const f = fixture();
    await f.session.connect();
    f.session.commitInput();
    expect(f.sent).toEqual([
      { type: 'input_audio_buffer.commit' },
      expect.objectContaining({
        type: 'response.create',
        event_id: expect.any(String),
      }),
    ]);
    f.session.commitInput(false);
    expect(f.sent.at(-1)).toEqual({ type: 'input_audio_buffer.commit' });
    f.session.close();
  });
  it.each([
    'oversize',
    'broken',
    'stalled',
  ])('terminates identified calls after %s response body failure', async (mode) => {
    const body =
      mode === 'oversize'
        ? 'a'.repeat(65537)
        : new ReadableStream({
            start(controller) {
              if (mode === 'broken') controller.error(new Error('body failed'));
            },
          });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(body, {
          headers: { location: '/v1/realtime/calls/rtc_recovery' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(
      createOpenAIVoiceCall(SDP, { ...config, fetch, timeoutMs: 15 }),
    ).rejects.toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toContain('/rtc_recovery/hangup');
    expect(fetch.mock.calls[1][1].signal.aborted).toBe(false);
  });
  it('preserves a recovery handle when setup and hangup both fail', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('bad answer', {
          headers: { location: '/v1/realtime/calls/rtc_recovery' },
        }),
      )
      .mockResolvedValueOnce(new Response('failed', { status: 503 }));
    await expect(
      createOpenAIVoiceCall(SDP, { ...config, fetch }),
    ).rejects.toMatchObject({
      callId: 'rtc_recovery',
      message: 'Voice setup failed and termination needs retry',
    });
  });
});

describe('microphone revocation', () => {
  it('fails visibly and releases media when the connected microphone ends', async () => {
    const f = fixture();
    const errors: Error[] = [];
    f.session.on('error', (error) => errors.push(error));
    await f.session.connect();
    f.endMicrophone();
    expect(f.session.state).toBe('failed');
    expect(errors[0]?.message).toContain('Microphone');
    expect(f.peer.close).toHaveBeenCalledOnce();
    expect(f.track.stop).toHaveBeenCalledOnce();
    expect(f.track.removeEventListener).toHaveBeenCalledWith(
      'ended',
      expect.any(Function),
    );
  });
});

describe('GitHub review regressions', () => {
  it('submits every parallel tool result before a host requests one continuation', async () => {
    const f = fixture();
    await f.session.connect();
    f.session.submitToolResult('c1', { ok: true });
    f.session.submitToolResult('c2', { ok: true });
    expect(f.sent.map((event) => event.type)).toEqual([
      'conversation.item.create',
      'conversation.item.create',
    ]);
    f.session.respond();
    expect(f.sent.at(-1)).toEqual(
      expect.objectContaining({
        type: 'response.create',
        event_id: expect.any(String),
      }),
    );
    f.session.close();
  });
  it('reports incomplete replies and failed transcription without exposing provider payloads', async () => {
    const f = fixture();
    const errors: Error[] = [];
    f.session.on('error', (error) => errors.push(error));
    await f.session.connect();
    f.event({
      type: 'response.done',
      response: {
        status: 'incomplete',
        status_details: { reason: 'max_output_tokens' },
      },
    });
    f.event({
      type: 'conversation.item.input_audio_transcription.failed',
      item_id: 'u',
      error: { message: 'private provider payload' },
    });
    expect(errors.map((error) => error.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('incomplete'),
        expect.stringContaining('transcription'),
      ]),
    );
    expect(errors).toHaveLength(2);
    expect(f.session.state).toBe('connected');
    expect(JSON.stringify(errors)).not.toContain('private provider payload');
    f.session.close();
  });
});
