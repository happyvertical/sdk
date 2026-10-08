import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpeechPlayback, speechPlaybackSupported } from '../browser.js';

let lastAudio: FakeAudio | undefined;
class FakeAudio {
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play = vi.fn(async () => undefined);
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
}
class FakeContext {
  static resumeImpl: () => Promise<void> = async () => undefined;
  state = 'running';
  destination = {} as AudioDestinationNode;
  resume = vi.fn(() => FakeContext.resumeImpl());
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createMediaElementSource = vi.fn(() => ({ connect: vi.fn() }));
  createAnalyser = vi.fn(() => new FakeAnalyser());
}

afterEach(() => {
  vi.unstubAllGlobals();
  lastAudio = undefined;
  FakeContext.resumeImpl = async () => undefined;
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
    await playback.play({
      audio: new ArrayBuffer(3),
      contentType: 'audio/wav',
    });
    expect(playback.playing).toBe(true);
    expect(start).toHaveBeenCalledOnce();
    expect(levels.some((value) => value > 0)).toBe(true);
    lastAudio?.onended?.();
    expect(playback.playing).toBe(false);
    expect(levels.at(-1)).toBe(0);
    expect(end).toHaveBeenCalledOnce();
  });

  it('stops and revokes an active playback without reporting a completed turn', async () => {
    browserFakes();
    const end = vi.fn();
    const playback = createSpeechPlayback({ onEnd: end });
    await playback.play({
      audio: new ArrayBuffer(3),
      contentType: 'audio/wav',
    });
    playback.stop();
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
});
