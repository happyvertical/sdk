import { describe, expect, it, vi } from 'vitest';
import type { PcmCapture, PcmCaptureOptions } from '../browser.js';
import { createVadCapture, VAD_CAPTURE_SAMPLE_RATE } from '../browser.js';

const CONTEXT_RATE = 48_000;
const block = (ms: number, value: number) =>
  new Float32Array(Math.round((CONTEXT_RATE * ms) / 1000)).fill(value);

function harness() {
  let tap: PcmCaptureOptions | undefined;
  const cancel = vi.fn();
  const createCapture = vi.fn(
    (_stream: MediaStream, options: PcmCaptureOptions): PcmCapture => {
      tap = options;
      return {
        stop: async () => ({
          samples: new Float32Array(),
          wav: new Uint8Array(),
          truncated: false,
        }),
        cancel,
      };
    },
  );
  const trackStop = vi.fn();
  const stream = {
    getTracks: () => [{ stop: trackStop }],
  } as unknown as MediaStream;
  const feed = (samples: Float32Array) =>
    tap?.onSamples?.(samples, CONTEXT_RATE);
  return {
    createCapture,
    cancel,
    trackStop,
    stream,
    feed,
    get tap() {
      return tap;
    },
  };
}

describe('createVadCapture', () => {
  it('streams without retaining and emits events with 16 kHz PCM', async () => {
    const h = harness();
    const vad = await createVadCapture({
      stream: h.stream,
      createCapture: h.createCapture,
    });
    expect(h.tap?.retain).toBe(false);
    const starts: number[] = [];
    const ends: Array<{ n: number; rate: number; reason: string }> = [];
    const levels: number[] = [];
    vad.on('speechstart', () => starts.push(1));
    vad.on('speechend', (e) =>
      ends.push({ n: e.samples.length, rate: e.sampleRate, reason: e.reason }),
    );
    vad.on('level', (e) => levels.push(e.level));

    h.feed(block(400, 0.002));
    h.feed(block(600, 0.3));
    expect(vad.speaking).toBe(true);
    h.feed(block(1000, 0.002));

    expect(starts).toHaveLength(1);
    expect(levels.length).toBeGreaterThan(10);
    expect(ends).toHaveLength(1);
    expect(ends[0].rate).toBe(VAD_CAPTURE_SAMPLE_RATE);
    expect(ends[0].reason).toBe('silence');
    // About 1.1 s of audio resampled to 16 kHz.
    expect(ends[0].n).toBeGreaterThan(14_000);
    expect(ends[0].n).toBeLessThan(21_000);
    expect(vad.speaking).toBe(false);
  });

  it('stop() delivers the utterance in progress, then releases the capture', async () => {
    const h = harness();
    const vad = await createVadCapture({
      stream: h.stream,
      createCapture: h.createCapture,
    });
    const ends: string[] = [];
    vad.on('speechend', (e) => ends.push(e.reason));
    h.feed(block(400, 0.002));
    h.feed(block(600, 0.3));
    await vad.stop();
    expect(ends).toEqual(['flush']);
    expect(h.cancel).toHaveBeenCalledTimes(1);
    // Caller-owned stream is left alone; later audio is ignored; idempotent.
    expect(h.trackStop).not.toHaveBeenCalled();
    h.feed(block(600, 0.3));
    await vad.stop();
    expect(ends).toEqual(['flush']);
    expect(h.cancel).toHaveBeenCalledTimes(1);
  });

  it('cancel() discards the utterance in progress', async () => {
    const h = harness();
    const vad = await createVadCapture({
      stream: h.stream,
      createCapture: h.createCapture,
    });
    const ends: string[] = [];
    vad.on('speechend', (e) => ends.push(e.reason));
    h.feed(block(400, 0.002));
    h.feed(block(600, 0.3));
    vad.cancel();
    expect(ends).toEqual([]);
    expect(h.cancel).toHaveBeenCalledTimes(1);
  });

  it('opens and later stops its own microphone stream', async () => {
    const h = harness();
    const getUserMedia = vi.fn(async () => h.stream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    try {
      const vad = await createVadCapture({ createCapture: h.createCapture });
      expect(getUserMedia).toHaveBeenCalledTimes(1);
      await vad.stop();
      expect(h.trackStop).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a throwing listener does not break capture; unsubscribe works', async () => {
    const h = harness();
    const vad = await createVadCapture({
      stream: h.stream,
      createCapture: h.createCapture,
    });
    const seen: number[] = [];
    vad.on('level', () => {
      throw new Error('boom');
    });
    const off = vad.on('level', () => seen.push(1));
    h.feed(block(100, 0.002));
    const count = seen.length;
    expect(count).toBeGreaterThan(0);
    off();
    h.feed(block(100, 0.002));
    expect(seen.length).toBe(count);
  });

  it('rejects as unsupported without Web Audio or a microphone API', async () => {
    await expect(createVadCapture()).rejects.toMatchObject({
      name: 'PcmCaptureError',
      reason: 'unsupported',
    });
  });

  it('releases its own stream when capture setup throws', async () => {
    const h = harness();
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: async () => h.stream },
    });
    try {
      await expect(
        createVadCapture({
          createCapture: () => {
            throw new Error('no audio');
          },
        }),
      ).rejects.toThrow('no audio');
      expect(h.trackStop).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
