/**
 * Browser PCM capture: `MediaStream` -> mono Float32 at a requested rate and a
 * ready 16-bit PCM WAV, via `AudioContext` + `AudioWorklet`. The worklet code
 * is inlined and loaded from a Blob URL, so no bundler configuration is
 * needed. Nothing here touches Node APIs; the Web Audio globals are read when
 * `createPcmCapture` is called, so importing this module is SSR-safe.
 */

import { PcmCaptureError } from './errors.js';
import { resampleMono } from './resample.js';
import { encodeWavPcm16 } from './wav.js';

const PROCESSOR_NAME = 'hv-pcm-tap';

// Mixes every input channel to mono and posts one transferable block per
// render quantum. Returns true to stay alive until the node is disconnected.
const WORKLET_SOURCE = `
class HvPcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const channels = inputs[0];
    if (channels && channels.length > 0 && channels[0].length > 0) {
      const frames = channels[0].length;
      const mono = new Float32Array(frames);
      for (let c = 0; c < channels.length; c += 1) {
        const data = channels[c];
        for (let i = 0; i < frames; i += 1) mono[i] += data[i];
      }
      if (channels.length > 1) {
        for (let i = 0; i < frames; i += 1) mono[i] /= channels.length;
      }
      this.port.postMessage(mono, [mono.buffer]);
    }
    return true;
  }
}
registerProcessor('${PROCESSOR_NAME}', HvPcmTap);
`;

export interface PcmCaptureOptions {
  /** Rate of the returned samples and WAV, in Hz (e.g. 16000 for Voxtral). */
  sampleRate: number;
  /** Audio beyond this duration is dropped, not stored. */
  maxDurationMs: number;
  /** Called once, when the cap is reached; the capture keeps running until stopped. */
  onLimit?: () => void;
  /**
   * Streams every mono block as it arrives, at the audio context's own rate
   * (`contextSampleRate`), before any cap or resampling. The block is yours to
   * keep. Used by `createVadCapture` for live analysis.
   */
  onSamples?: (samples: Float32Array, contextSampleRate: number) => void;
  /**
   * Keep the audio for `stop()`. Default true. `false` only streams to
   * `onSamples`: memory stays flat for open-ended listening, `maxDurationMs`
   * never trims, and `stop()` resolves with empty samples.
   */
  retain?: boolean;
}

export interface PcmCaptureResult {
  /** Mono samples at `sampleRate`, -1..1. */
  samples: Float32Array;
  /** The same audio as a 16-bit PCM mono WAV. */
  wav: Uint8Array;
  /** True when audio past `maxDurationMs` was dropped. */
  truncated: boolean;
}

export interface PcmCapture {
  /** Settles once the audio graph is running; rejects if setup failed. Optional for custom capture factories. */
  readonly ready?: Promise<void>;
  /** Ends capture, tears everything down, and resolves with the audio. Idempotent. */
  stop(): Promise<PcmCaptureResult>;
  /** Discards the audio and tears everything down. Idempotent; a pending `stop()` rejects. */
  cancel(): void;
}

/** Whether this runtime has the Web Audio pieces `createPcmCapture` needs. */
export function pcmCaptureSupported(): boolean {
  return (
    typeof AudioContext !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined' &&
    typeof Blob !== 'undefined' &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
  );
}

/**
 * Starts capturing `stream`. Throws `PcmCaptureError` (`unsupported`) when Web
 * Audio is unavailable. The caller keeps ownership of the stream and its
 * tracks: stop them yourself after `stop()` or `cancel()`.
 */
export function createPcmCapture(
  stream: MediaStream,
  options: PcmCaptureOptions,
): PcmCapture {
  const { sampleRate, maxDurationMs } = options;
  if (!Number.isInteger(sampleRate) || sampleRate < 1) {
    throw new RangeError('sampleRate must be a positive integer');
  }
  if (!Number.isFinite(maxDurationMs) || maxDurationMs <= 0) {
    throw new RangeError('maxDurationMs must be a positive number');
  }
  if (!pcmCaptureSupported()) {
    throw new PcmCaptureError(
      'unsupported',
      'PCM capture needs AudioContext, AudioWorkletNode and Blob URLs',
    );
  }

  const context = new AudioContext();
  const capSamples = Math.ceil((maxDurationMs / 1000) * context.sampleRate);
  const frames: Float32Array[] = [];
  let captured = 0;
  let truncated = false;
  let limitFired = false;
  let cancelled = false;
  let finished = false;
  let url: string | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let node: AudioWorkletNode | undefined;
  let closing: Promise<void> | undefined;

  const onFrame = (event: MessageEvent<Float32Array>): void => {
    if (finished) return;
    let frame = event.data;
    options.onSamples?.(frame, context.sampleRate);
    if (options.retain === false) return;
    const room = capSamples - captured;
    if (frame.length > room) {
      frame = frame.subarray(0, Math.max(0, room));
      truncated = true;
    }
    if (frame.length > 0) {
      frames.push(frame);
      captured += frame.length;
    }
    if (captured >= capSamples && !limitFired) {
      limitFired = true;
      options.onLimit?.();
    }
  };

  const revoke = (): void => {
    if (url !== undefined) {
      const stale = url;
      url = undefined;
      try {
        URL.revokeObjectURL(stale);
      } catch {
        // already revoked
      }
    }
  };

  const teardown = (): Promise<void> => {
    if (closing) return closing;
    finished = true;
    revoke();
    if (node) node.port.onmessage = null;
    try {
      source?.disconnect();
      node?.disconnect();
    } catch {
      // graph already torn down
    }
    closing = (async () => {
      try {
        if (context.state !== 'closed') await context.close();
      } catch {
        // closing a dead context is not worth reporting
      }
    })();
    return closing;
  };

  const ready = (async (): Promise<void> => {
    url = URL.createObjectURL(
      new Blob([WORKLET_SOURCE], { type: 'text/javascript' }),
    );
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      revoke();
    }
    if (finished) return;
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    node.port.onmessage = onFrame;
    source.connect(node);
    // A worklet only runs while connected to the destination; it emits silence.
    node.connect(context.destination);
    if (context.state === 'suspended') await context.resume();
  })();
  // Failure is reported by stop(); never an unhandled rejection.
  ready.catch(() => undefined);

  let result: Promise<PcmCaptureResult> | undefined;

  return {
    ready,
    stop(): Promise<PcmCaptureResult> {
      result ??= (async () => {
        try {
          await ready;
        } catch (error) {
          await teardown();
          throw new PcmCaptureError(
            'setup_failed',
            'PCM capture could not start',
            error,
          );
        }
        await teardown();
        if (cancelled) {
          throw new PcmCaptureError('cancelled', 'PCM capture was cancelled');
        }
        const joined = new Float32Array(captured);
        let offset = 0;
        for (const frame of frames.splice(0)) {
          joined.set(frame, offset);
          offset += frame.length;
        }
        const samples = resampleMono(joined, context.sampleRate, sampleRate);
        return { samples, wav: encodeWavPcm16(samples, sampleRate), truncated };
      })();
      return result;
    },
    cancel(): void {
      if (cancelled) return;
      cancelled = true;
      frames.length = 0;
      void teardown();
    },
  };
}
