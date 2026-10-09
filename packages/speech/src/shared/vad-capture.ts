/**
 * Hands-free microphone capture: opens the microphone, runs its audio through
 * the on-device voice activity detector (`vad.ts`) and emits one finished
 * utterance at a time as 16 kHz mono Float32 PCM. Audio stays in memory; the
 * microphone is released by `stop()`. Nothing here touches Node APIs; the Web
 * Audio globals are read when `createVadCapture` is called, so importing this
 * module is SSR-safe.
 */

import { PcmCaptureError } from './errors.js';
import {
  createPcmCapture,
  type PcmCapture,
  type PcmCaptureOptions,
  pcmCaptureSupported,
} from './pcm-capture.js';
import { resampleMono } from './resample.js';
import {
  createUtteranceCollector,
  type UtteranceCollector,
  type VadEndReason,
  type VadOptions,
} from './vad.js';

/** Rate of the PCM in `speechend` events. */
export const VAD_CAPTURE_SAMPLE_RATE = 16_000;

/** Events emitted by a `VadCapture`. */
export interface VadCaptureEventMap {
  /** An utterance began. */
  speechstart: Record<string, never>;
  /** An utterance ended (a pause, the length cap, or `stop()`). */
  speechend: {
    /** Mono samples, -1..1, at `sampleRate`, including the pre-roll. */
    samples: Float32Array;
    sampleRate: number;
    durationMs: number;
    reason: VadEndReason;
  };
  /** Loudness 0..1 for each analysed frame, for a meter. */
  level: { level: number };
}

export type VadCaptureEventType = keyof VadCaptureEventMap;

export interface VadCaptureOptions extends VadOptions {
  /**
   * Use this stream instead of opening the microphone. The caller keeps
   * ownership: `stop()` does not stop its tracks.
   */
  stream?: MediaStream;
  /**
   * Constraints for the microphone when no `stream` is given. Default:
   * `{ audio: { echoCancellation, noiseSuppression, autoGainControl: true } }`,
   * a secondary defence against hearing the page's own playback. Browsers do
   * not reliably cancel `speechSynthesis`; use `suspend()` while it plays.
   */
  constraints?: MediaStreamConstraints;
  /**
   * After `resume()`, audio of this length is still ignored so the tail of the
   * playback and its room reverb are not heard as speech. Default 350.
   */
  resumeGuardMs?: number;
  /** Test seam: replaces `createPcmCapture`. */
  createCapture?: (
    stream: MediaStream,
    options: PcmCaptureOptions,
  ) => PcmCapture;
}

export interface VadCapture {
  /** Subscribes to an event; returns the unsubscribe function. */
  on<T extends VadCaptureEventType>(
    type: T,
    listener: (event: VadCaptureEventMap[T]) => void,
  ): () => void;
  /** Currently inside an utterance. */
  readonly speaking: boolean;
  /** Half-duplex gate is closed (between `suspend()` and `resume()`). */
  readonly suspended: boolean;
  /**
   * Half-duplex gate: stops listening while the page itself is playing audio
   * (for example `speechSynthesis`). Frames are dropped, an utterance in
   * progress is discarded (no `speechend`), the noise floor does not adapt to
   * the played audio, and the microphone stays open. Idempotent.
   */
  suspend(): void;
  /**
   * Reopens the gate after `resumeGuardMs` of further audio has been ignored.
   * No-op when not suspended.
   */
  resume(): void;
  /**
   * Ends an utterance in progress (a final `speechend` with reason `flush`),
   * then releases the microphone. Idempotent.
   */
  stop(): Promise<void>;
  /** Releases the microphone and discards any utterance in progress. Idempotent. */
  cancel(): void;
}

/** Whether this runtime can open a microphone and tap it with Web Audio. */
export function vadCaptureSupported(): boolean {
  return (
    pcmCaptureSupported() &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

/** One hour; with `retain: false` this is never reached, it only satisfies validation. */
const UNBOUNDED_MS = 3_600_000;

/**
 * Opens the microphone (or uses `options.stream`) and starts detecting speech.
 * Rejects with `PcmCaptureError` (`unsupported`) when Web Audio or the
 * microphone API is missing, and with the browser's own error when permission
 * is denied.
 */
export async function createVadCapture(
  options: VadCaptureOptions = {},
): Promise<VadCapture> {
  const makeCapture = options.createCapture ?? createPcmCapture;
  if (!options.createCapture && !vadCaptureSupported() && !options.stream) {
    throw new PcmCaptureError(
      'unsupported',
      'Hands-free capture needs the microphone API and Web Audio',
    );
  }

  const ownsStream = !options.stream;
  const stream =
    options.stream ??
    (await navigator.mediaDevices.getUserMedia(
      options.constraints ?? {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      },
    ));

  const listeners: {
    [T in VadCaptureEventType]: Set<(event: VadCaptureEventMap[T]) => void>;
  } = { speechstart: new Set(), speechend: new Set(), level: new Set() };
  const emit = <T extends VadCaptureEventType>(
    type: T,
    event: VadCaptureEventMap[T],
  ): void => {
    for (const listener of [...listeners[type]]) {
      try {
        listener(event);
      } catch {
        // A throwing listener must not break capture or its siblings.
      }
    }
  };

  let collector: UtteranceCollector | undefined;
  let closed = false;
  let suspended = false;
  // Milliseconds of audio still to drop after `resume()`.
  let guardMsLeft = 0;
  const resumeGuardMs = Math.max(0, options.resumeGuardMs ?? 350);
  const releaseStream = (): void => {
    if (!ownsStream) return;
    for (const track of stream.getTracks()) track.stop();
  };

  let capture: PcmCapture;
  try {
    capture = makeCapture(stream, {
      sampleRate: VAD_CAPTURE_SAMPLE_RATE,
      maxDurationMs: UNBOUNDED_MS,
      retain: false,
      onSamples: (samples, contextRate) => {
        if (closed) return;
        if (suspended) return;
        if (guardMsLeft > 0) {
          guardMsLeft -= (samples.length / contextRate) * 1000;
          return;
        }
        collector ??= createUtteranceCollector({
          ...options,
          sampleRate: contextRate,
          onSpeaking: (speaking) => {
            if (speaking) emit('speechstart', {});
          },
          onLevel: (level) => emit('level', { level }),
          onUtterance: (utterance) => {
            const pcm = resampleMono(
              utterance.pcm,
              utterance.sampleRate,
              VAD_CAPTURE_SAMPLE_RATE,
            );
            emit('speechend', {
              samples: pcm,
              sampleRate: VAD_CAPTURE_SAMPLE_RATE,
              durationMs: utterance.durationMs,
              reason: utterance.reason,
            });
          },
        });
        collector.push(samples);
      },
    });
  } catch (error) {
    releaseStream();
    throw error;
  }

  const finish = async (flush: boolean): Promise<void> => {
    if (closed) return;
    // Flush before `closed` so the final utterance is still delivered.
    if (flush) collector?.flush();
    closed = true;
    capture.cancel();
    releaseStream();
  };

  return {
    on(type, listener) {
      const set = listeners[type] as Set<typeof listener>;
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    get speaking() {
      return collector?.speaking ?? false;
    },
    get suspended() {
      return suspended;
    },
    suspend() {
      if (closed || suspended) return;
      suspended = true;
      guardMsLeft = 0;
      collector?.discard();
      emit('level', { level: 0 });
    },
    resume() {
      if (closed || !suspended) return;
      suspended = false;
      guardMsLeft = resumeGuardMs;
    },
    stop: () => finish(true),
    cancel: () => {
      void finish(false);
    },
  };
}

export type { VadEndReason, VadOptions } from './vad.js';
