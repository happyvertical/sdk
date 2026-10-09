import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPcmCapture,
  PcmCaptureError,
  pcmCaptureSupported,
} from '../browser.js';
import { parseWavPcm16 } from '../pcm.js';

interface Fakes {
  contexts: FakeContext[];
  nodes: FakeNode[];
  revoked: string[];
  created: string[];
}

class FakePort {
  onmessage: ((event: { data: Float32Array }) => void) | null = null;
}
class FakeNode {
  port = new FakePort();
  connected: unknown[] = [];
  disconnected = false;
  connect(target: unknown) {
    this.connected.push(target);
  }
  disconnect() {
    this.disconnected = true;
  }
}
class FakeContext {
  sampleRate = 48000;
  state = 'running';
  closed = 0;
  destination = { dest: true };
  source = new FakeNode();
  addModuleError?: Error;
  modules: string[] = [];
  audioWorklet = {
    addModule: async (url: string) => {
      this.modules.push(url);
      if (this.addModuleError) throw this.addModuleError;
    },
  };
  createMediaStreamSource() {
    return this.source;
  }
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.closed += 1;
    this.state = 'closed';
  }
}

let fakes: Fakes;
let failSetup: Error | undefined;

beforeEach(() => {
  fakes = { contexts: [], nodes: [], revoked: [], created: [] };
  failSetup = undefined;
  vi.stubGlobal(
    'AudioContext',
    class extends FakeContext {
      constructor() {
        super();
        this.addModuleError = failSetup;
        fakes.contexts.push(this);
      }
    },
  );
  vi.stubGlobal(
    'AudioWorkletNode',
    class extends FakeNode {
      constructor(
        _ctx: unknown,
        public name: string,
      ) {
        super();
        fakes.nodes.push(this);
      }
    },
  );
  vi.stubGlobal(
    'Blob',
    class {
      constructor(
        public parts: unknown[],
        public opts: unknown,
      ) {}
    },
  );
  vi.stubGlobal('URL', {
    createObjectURL: (blob: unknown) => {
      const url = `blob:fake/${fakes.created.length}`;
      fakes.created.push(url);
      void blob;
      return url;
    },
    revokeObjectURL: (url: string) => fakes.revoked.push(url),
  });
});

afterEach(() => vi.unstubAllGlobals());

const stream = {} as MediaStream;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const push = (frame: Float32Array) =>
  fakes.nodes[0].port.onmessage?.({ data: frame });

describe('createPcmCapture', () => {
  it('imports and reports unsupported without Web Audio', () => {
    vi.unstubAllGlobals();
    expect(pcmCaptureSupported()).toBe(false);
    expect(() =>
      createPcmCapture(stream, { sampleRate: 16000, maxDurationMs: 1000 }),
    ).toThrow(PcmCaptureError);
  });

  it('validates its options', () => {
    expect(() =>
      createPcmCapture(stream, { sampleRate: 0, maxDurationMs: 1000 }),
    ).toThrow(RangeError);
    expect(() =>
      createPcmCapture(stream, { sampleRate: 16000, maxDurationMs: 0 }),
    ).toThrow(RangeError);
  });

  it('captures, resamples to the requested rate, returns samples and a WAV, and tears down', async () => {
    const capture = createPcmCapture(stream, {
      sampleRate: 16000,
      maxDurationMs: 5000,
    });
    await settle();
    const [context] = fakes.contexts;
    expect(fakes.nodes[0].connected).toEqual([context.destination]);
    expect(context.source.connected).toEqual([fakes.nodes[0]]);
    expect(fakes.revoked).toEqual(fakes.created);

    push(new Float32Array(24000).fill(0.5));
    push(new Float32Array(24000).fill(0.5));
    const result = await capture.stop();

    expect(result.truncated).toBe(false);
    expect(result.samples.length).toBe(16000);
    const parsed = parseWavPcm16(result.wav, {
      sampleRate: 16000,
      channels: 1,
    });
    expect(parsed.frames).toBe(16000);
    expect(result.samples[8000]).toBeCloseTo(0.5, 3);
    expect(context.closed).toBe(1);
    expect(fakes.nodes[0].disconnected).toBe(true);
    expect(context.source.disconnected).toBe(true);
    expect(fakes.nodes[0].port.onmessage).toBeNull();
    // later frames are ignored and stop is idempotent
    expect(await capture.stop()).toBe(result);
    expect(context.closed).toBe(1);
  });

  it('enforces the duration cap and reports it once', async () => {
    const onLimit = vi.fn();
    const capture = createPcmCapture(stream, {
      sampleRate: 16000,
      maxDurationMs: 500,
      onLimit,
    });
    await settle();
    // cap is 24000 input samples at 48 kHz
    push(new Float32Array(20000).fill(0.1));
    expect(onLimit).not.toHaveBeenCalled();
    push(new Float32Array(20000).fill(0.1));
    push(new Float32Array(20000).fill(0.1));
    expect(onLimit).toHaveBeenCalledTimes(1);
    const result = await capture.stop();
    expect(result.truncated).toBe(true);
    expect(result.samples.length).toBe(8000);
  });

  it('streams blocks to onSamples and, with retain false, keeps nothing', async () => {
    const seen: Array<[number, number]> = [];
    const onLimit = vi.fn();
    const capture = createPcmCapture(stream, {
      sampleRate: 16000,
      maxDurationMs: 100,
      retain: false,
      onLimit,
      onSamples: (samples, rate) => seen.push([samples.length, rate]),
    });
    await settle();
    push(new Float32Array(20000).fill(0.1));
    push(new Float32Array(20000).fill(0.1));
    expect(seen).toEqual([
      [20000, 48000],
      [20000, 48000],
    ]);
    expect(onLimit).not.toHaveBeenCalled();
    const result = await capture.stop();
    expect(result.samples.length).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('cancel tears down and makes stop reject', async () => {
    const capture = createPcmCapture(stream, {
      sampleRate: 16000,
      maxDurationMs: 5000,
    });
    await settle();
    push(new Float32Array(480));
    capture.cancel();
    capture.cancel();
    await settle();
    const [context] = fakes.contexts;
    expect(context.closed).toBe(1);
    expect(fakes.nodes[0].disconnected).toBe(true);
    await expect(capture.stop()).rejects.toMatchObject({ reason: 'cancelled' });
    expect(context.closed).toBe(1);
  });

  it('cancel before the worklet loads leaves nothing behind', async () => {
    const capture = createPcmCapture(stream, {
      sampleRate: 16000,
      maxDurationMs: 5000,
    });
    capture.cancel();
    await settle();
    expect(fakes.contexts[0].closed).toBe(1);
    expect(fakes.nodes).toHaveLength(0);
    expect(fakes.revoked).toEqual(fakes.created);
  });

  it('reports a setup failure from stop and still closes the context', async () => {
    failSetup = new Error('worklet blocked');
    const capture = createPcmCapture(stream, {
      sampleRate: 16000,
      maxDurationMs: 5000,
    });
    await expect(capture.stop()).rejects.toMatchObject({
      name: 'PcmCaptureError',
      reason: 'setup_failed',
    });
    expect(fakes.contexts[0].closed).toBe(1);
    expect(fakes.revoked).toEqual(fakes.created);
  });

  it('returns an empty but valid result when nothing was captured', async () => {
    const capture = createPcmCapture(stream, {
      sampleRate: 16000,
      maxDurationMs: 5000,
    });
    await settle();
    const result = await capture.stop();
    expect(result.samples.length).toBe(0);
    expect(result.wav.length).toBe(44);
  });
});
