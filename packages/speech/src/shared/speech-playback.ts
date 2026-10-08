import type { SynthesizedSpeech } from './types.js';

/** Events from actual browser audio playback, never from synthesis completion. */
export interface SpeechPlaybackEvents {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
  /** Smoothed RMS amplitude, bounded to the inclusive 0..1 range. */
  onLevel?: (level: number) => void;
}

export interface SpeechPlaybackOptions extends SpeechPlaybackEvents {
  /** Defaults to 0.28; higher values follow the waveform more closely. */
  smoothing?: number;
}

export interface SpeechPlayback {
  /** Call directly from the user's Play action to unlock browser audio. */
  prepare(): Promise<void>;
  play(speech: Pick<SynthesizedSpeech, 'audio' | 'contentType'>): Promise<void>;
  stop(): void;
  destroy(): void;
  readonly playing: boolean;
}

export function speechPlaybackSupported(): boolean {
  return typeof Audio !== 'undefined' && typeof AudioContext !== 'undefined';
}

/**
 * Plays server-produced speech in a browser and samples the playing element's
 * analyser node. Provider credentials and synthesis deliberately stay server-side.
 */
export function createSpeechPlayback(
  options: SpeechPlaybackOptions = {},
): SpeechPlayback {
  const requestedSmoothing = options.smoothing ?? 0.28;
  if (!Number.isFinite(requestedSmoothing))
    throw new RangeError('speech playback smoothing must be finite');
  const smoothing = Math.min(1, Math.max(0.01, requestedSmoothing));
  let audio: HTMLAudioElement | undefined;
  let context: AudioContext | undefined;
  let source: MediaElementAudioSourceNode | undefined;
  let analyser: AnalyserNode | undefined;
  let frame: number | undefined;
  let url: string | undefined;
  let disposed = false;
  let active = 0;
  let playing = false;
  let operation:
    | {
        token: number;
        resolve: () => void;
        reject: (error: Error) => void;
      }
    | undefined;

  const emitLevel = (level: number) =>
    options.onLevel?.(Math.min(1, Math.max(0, level)));
  const finish = (
    token: number,
    {
      ended = false,
      failure,
      closeContext = false,
    }: {
      ended?: boolean;
      failure?: Error;
      closeContext?: boolean;
    } = {},
  ) => {
    if (token !== active) return;
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    audio?.pause();
    audio = undefined;
    source?.disconnect();
    source = undefined;
    analyser?.disconnect();
    analyser = undefined;
    if (url) URL.revokeObjectURL(url);
    url = undefined;
    if (closeContext) {
      const closing = context;
      context = undefined;
      if (closing && closing.state !== 'closed') void closing.close();
    }
    const emittedAudioLevel = playing;
    playing = false;
    if (operation?.token === token) {
      if (failure) operation.reject(failure);
      else operation.resolve();
      operation = undefined;
    }
    ++active;
    if (emittedAudioLevel) emitLevel(0);
    if (ended) options.onEnd?.();
  };

  return {
    get playing() {
      return playing;
    },
    async prepare() {
      if (disposed) throw new Error('Speech playback has been destroyed');
      if (!speechPlaybackSupported())
        throw new Error('Browser audio playback is unavailable');
      context ??= new AudioContext();
      if (context.state === 'suspended') await context.resume();
    },
    async play(speech) {
      if (disposed) throw new Error('Speech playback has been destroyed');
      if (!speechPlaybackSupported())
        throw new Error('Browser audio playback is unavailable');
      this.stop();
      const token = ++active;
      let resolveCompletion!: () => void;
      let rejectCompletion!: (error: Error) => void;
      const completion = new Promise<void>((resolve, reject) => {
        resolveCompletion = resolve;
        rejectCompletion = reject;
      });
      // A native resume/play promise cannot be cancelled. Keep a rejection
      // observer attached while cancellation settles this public operation.
      void completion.catch(() => {});
      operation = {
        token,
        resolve: resolveCompletion,
        reject: rejectCompletion,
      };
      try {
        url = URL.createObjectURL(
          new Blob([speech.audio], { type: speech.contentType }),
        );
        const nextAudio = new Audio(url);
        const nextContext = context ?? new AudioContext();
        context = nextContext;
        const nextSource = nextContext.createMediaElementSource(nextAudio);
        const nextAnalyser = nextContext.createAnalyser();
        nextAnalyser.fftSize = 512;
        nextSource.connect(nextAnalyser);
        nextAnalyser.connect(nextContext.destination);
        source = nextSource;
        analyser = nextAnalyser;
        const samples = new Uint8Array(nextAnalyser.fftSize);
        let level = 0;
        const sample = () => {
          if (token !== active || !playing) return;
          nextAnalyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const value of samples) {
            const normalized = (value - 128) / 128;
            sum += normalized * normalized;
          }
          const target = Math.min(1, Math.sqrt(sum / samples.length) * 4);
          level += (target - level) * smoothing;
          emitLevel(level);
          frame = requestAnimationFrame(sample);
        };
        audio = nextAudio;
        nextAudio.onended = () => finish(token, { ended: true });
        nextAudio.onerror = () => {
          if (token !== active) return;
          const error = new Error('Browser speech audio playback failed');
          finish(token, { failure: error });
          options.onError?.(error);
        };
        await Promise.race([nextContext.resume(), completion]);
        if (token !== active || disposed) return;
        await Promise.race([nextAudio.play(), completion]);
        if (token !== active || disposed) return;
        playing = true;
        options.onStart?.();
        if (token !== active || disposed) return;
        sample();
        await completion;
      } catch (cause) {
        const error =
          cause instanceof Error
            ? cause
            : new Error('Browser speech audio playback failed');
        if (token === active) {
          finish(token, { failure: error });
          options.onError?.(error);
        }
        throw error;
      }
    },
    stop() {
      finish(active);
    },
    destroy() {
      if (!disposed) {
        disposed = true;
        finish(active, { closeContext: true });
      }
    },
  };
}
