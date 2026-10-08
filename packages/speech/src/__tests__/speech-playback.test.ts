import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpeechPlayback, speechPlaybackSupported } from '../browser.js';

let lastAudio: FakeAudio | undefined;
let contexts: FakeContext[] = [];
class FakeAudio {
  static playImpl: () => Promise<void> = async () => undefined;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play = vi.fn(() => FakeAudio.playImpl());
  constructor(_url: string) {
    lastAudio = this;
  }
}
class FakeAnalyser {
  fftSize = 0;
  getByteTimeDomainData(values: Uint8Array) {
    values.fill(160);
  }
  connect() {
    return this;
  }
  disconnect = vi.fn();
}
class FakeContext {
  static resumeImpl: () => Promise<void> = async () => undefined;
  state = 'running';
  destination = {} as AudioDestinationNode;
  resume = vi.fn(() => FakeContext.resumeImpl());
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createMediaElementSource = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
  }));
  createAnalyser = vi.fn(() => new FakeAnalyser());
  constructor() {
    contexts.push(this);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  lastAudio = undefined;
  contexts = [];
  FakeContext.resumeImpl = async () => undefined;
  FakeAudio.playImpl = async () => undefined;
});

function browserFakes() {
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:audio'),
    revokeObjectURL: vi.fn(),
  });
}

describe('browser speech playback', () => {
  it('reports lifecycle from actual audio playback and returns to zero at end', async () => {
    browserFakes();
    const levels: number[] = [];
    const start = vi.fn();
    const end = vi.fn();
    const playback = createSpeechPlayback({
      onLevel: (value) => levels.push(value),
      onStart: start,
      onEnd: end,
    });
    const pending = playback.play({
      audio: new ArrayBuffer(3),
      contentType: 'audio/wav',
    });
    await new Promise((resolve) => setTimeout(resolve));
    expect(playback.playing).toBe(true);
    expect(start).toHaveBeenCalledOnce();
    expect(levels.some((value) => value > 0)).toBe(true);
    lastAudio?.onended?.();
    await pending;
    expect(playback.playing).toBe(false);
    expect(levels.at(-1)).toBe(0);
    expect(end).toHaveBeenCalledOnce();
  });

  it('stops and revokes an active playback without reporting a completed turn', async () => {
    browserFakes();
    const end = vi.fn();
    const playback = createSpeechPlayback({ onEnd: end });
    const pending = playback.play({
      audio: new ArrayBuffer(3),
      contentType: 'audio/wav',
    });
    await new Promise((resolve) => setTimeout(resolve));
    playback.stop();
    await pending;
    expect(lastAudio?.pause).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:audio');
    expect(end).not.toHaveBeenCalled();
  });

  it('is SSR-safe until playback is requested', () => {
    expect(speechPlaybackSupported()).toBe(false);
  });

  it('does not start stale audio after stop during an async audio unlock', async () => {
    browserFakes();
    let unlock: (() => void) | undefined;
    FakeContext.resumeImpl = () =>
      new Promise<void>((resolve) => {
        unlock = resolve;
      });
    const playback = createSpeechPlayback();
    const pending = playback.play({
      audio: new ArrayBuffer(3),
      contentType: 'audio/wav',
    });
    playback.stop();
    unlock?.();
    await pending;
    expect(lastAudio?.play).not.toHaveBeenCalled();
    expect(playback.playing).toBe(false);
  });

  it('settles immediately when stop or destroy interrupts an unresolved audio unlock', async () => {
    browserFakes();
    FakeContext.resumeImpl = () => new Promise<void>(() => {});
    const stopped = createSpeechPlayback();
    const stopPending = stopped.play({
      audio: new ArrayBuffer(3),
      contentType: 'audio/wav',
    });
    stopped.stop();
    await expect(stopPending).resolves.toBeUndefined();

    const destroyed = createSpeechPlayback();
    const destroyPending = destroyed.play({
      audio: new ArrayBuffer(3),
      contentType: 'audio/wav',
    });
    destroyed.destroy();
    await expect(destroyPending).resolves.toBeUndefined();
  });

  it('settles a replaced operation even when its native audio promise never resolves', async () => {
    browserFakes();
    let release: (() => void) | undefined;
    FakeAudio.playImpl = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const playback = createSpeechPlayback();
    const first = playback.play({
      audio: new ArrayBuffer(3),
      contentType: 'audio/wav',
    });
    await new Promise((resolve) => setTimeout(resolve));
    FakeAudio.playImpl = async () => undefined;
    const second = playback.play({
      audio: new ArrayBuffer(3),
      contentType: 'audio/wav',
    });
    await expect(first).resolves.toBeUndefined();
    lastAudio?.onended?.();
    await expect(second).resolves.toBeUndefined();
    release?.();
  });

  it('uses the AudioContext unlocked by prepare after delayed audio arrives', async () => {
    browserFakes();
    const playback = createSpeechPlayback();
    await playback.prepare();
    const prepared = contexts[0];
    expect(prepared).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve));
    const pending = playback.play({
      audio: new ArrayBuffer(3),
      contentType: 'audio/wav',
    });
    await new Promise((resolve) => setTimeout(resolve));

    expect(contexts).toEqual([prepared]);
    expect(lastAudio?.play).toHaveBeenCalledOnce();
    lastAudio?.onended?.();
    await pending;
    playback.destroy();
    expect(prepared.close).toHaveBeenCalledOnce();
  });

  it('does not start playback after audio ends while play is still pending', async () => {
    browserFakes();
    let release: (() => void) | undefined;
    FakeAudio.playImpl = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    const start = vi.fn();
    const end = vi.fn();
    const playback = createSpeechPlayback({ onStart: start, onEnd: end });
    const pending = playback.play({
      audio: new ArrayBuffer(3),
      contentType: 'audio/wav',
    });
    await new Promise((resolve) => setTimeout(resolve));
    lastAudio?.onended?.();
    release?.();
    await pending;
    expect(playback.playing).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(end).toHaveBeenCalledOnce();
  });

  it.each([
    'stop',
    'destroy',
  ] as const)('settles when onStart calls %s without scheduling a frame', async (action) => {
    browserFakes();
    let playback: ReturnType<typeof createSpeechPlayback>;
    playback = createSpeechPlayback({ onStart: () => playback[action]() });
    const pending = playback.play({
      audio: new ArrayBuffer(3),
      contentType: 'audio/wav',
    });
    await expect(pending).resolves.toBeUndefined();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(playback.playing).toBe(false);
  });

  it.each([
    'stop',
    'destroy',
  ] as const)('settles when terminal onLevel calls %s without recursion', async (action) => {
    browserFakes();
    let playback: ReturnType<typeof createSpeechPlayback>;
    playback = createSpeechPlayback({
      onLevel: (level) => {
        if (level === 0) playback[action]();
      },
    });
    const pending = playback.play({
      audio: new ArrayBuffer(3),
      contentType: 'audio/wav',
    });
    await new Promise((resolve) => setTimeout(resolve));
    lastAudio?.onended?.();
    await expect(pending).resolves.toBeUndefined();
    expect(playback.playing).toBe(false);
  });

  it('reports a current native playback failure exactly once', async () => {
    browserFakes();
    const onError = vi.fn();
    FakeAudio.playImpl = async () => {
      throw new Error('autoplay denied');
    };
    const playback = createSpeechPlayback({ onError });
    await expect(
      playback.play({ audio: new ArrayBuffer(3), contentType: 'audio/wav' }),
    ).rejects.toThrow('autoplay denied');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'autoplay denied' }),
    );
  });

  it('reports a current audio-unlock failure exactly once', async () => {
    browserFakes();
    const onError = vi.fn();
    FakeContext.resumeImpl = async () => {
      throw new Error('unlock denied');
    };
    const playback = createSpeechPlayback({ onError });
    await expect(
      playback.play({ audio: new ArrayBuffer(3), contentType: 'audio/wav' }),
    ).rejects.toThrow('unlock denied');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'unlock denied' }),
    );
  });
});
