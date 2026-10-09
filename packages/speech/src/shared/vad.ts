/**
 * Voice activity detection for hands-free capture.
 *
 * Energy based, no model and no download: the loudness (RMS) of short audio
 * frames is compared with a noise floor learned from the room. Speech onset
 * starts an utterance and a pause ends it. No Node APIs, no DOM; safe in
 * browsers, workers and Node.
 *
 * Two pure pieces:
 * - `createVadSegmenter`: fed one frame energy at a time, answers with
 *   `start` / `end` / `split` events and a live level;
 * - `createUtteranceCollector`: fed raw mono PCM, keeps a pre-roll so the
 *   first syllable is not clipped and hands over each finished utterance.
 *
 * `createVadCapture` (`@happyvertical/speech/browser`) drives the collector
 * from a microphone.
 */

/** Tuning for the detector. Every field is optional. */
export interface VadOptions {
  /** Silence that ends an utterance, in ms. Default 800. */
  silenceMs?: number;
  /** Speech shorter than this is a click or a cough, not an utterance. Default 150. */
  minSpeechMs?: number;
  /** Audio kept from before the onset so the first syllable is not clipped. Default 300. */
  preRollMs?: number;
  /** An utterance this long is cut and the next one starts at once. Default 30000. */
  maxUtteranceMs?: number;
  /**
   * 0 (needs loud, close speech) to 1 (picks up quiet speech, and more
   * noise). Default 0.5.
   */
  sensitivity?: number;
  /**
   * How long the room is listened to before the floor is settled, in ms.
   * Default 300. Speech is still detected during this window (with a
   * conservative floor), and calibration only uses a low percentile of the
   * energies, so speaking from the first frame does not poison the floor.
   */
  calibrateMs?: number;
}

export const VAD_DEFAULTS = {
  silenceMs: 800,
  minSpeechMs: 150,
  preRollMs: 300,
  maxUtteranceMs: 30_000,
  sensitivity: 0.5,
  calibrateMs: 300,
} as const satisfies Required<VadOptions>;

/** Length of one analysed frame. */
export const VAD_FRAME_MS = 20;

/** The quietest noise floor assumed (digital silence must not make everything "speech"). */
const MIN_FLOOR = 0.0015;
/** Floor assumed before the room has been heard (a conservative, quiet-room value). */
const DEFAULT_FLOOR = 0.003;
/**
 * Highest floor calibration may settle on. If the opening frames are louder
 * than this they are taken to be speech (or a very noisy room) and the floor
 * stays conservative instead of climbing to speech level.
 */
const CALIBRATION_FLOOR_CAP = 0.006;
/** Calibration uses this low percentile of the opening energies, not the mean. */
const CALIBRATION_PERCENTILE = 0.2;
/** Highest floor slow tracking may reach between utterances. */
const MAX_FLOOR = 0.02;
/** Time constant of the slow noise-floor tracking, in ms. */
const FLOOR_TRACK_MS = 2000;
/** Silence kept at the end of an utterance when it is trimmed, in ms. */
const TRAILING_KEEP_MS = 250;

export type VadEndReason = 'silence' | 'max' | 'flush';

export type VadEvent =
  /** Speech began; `leadMs` is how much of the recent past belongs to it. */
  | { type: 'start'; leadMs: number }
  /** The utterance ended; `trailingSilenceMs` of it is silence. */
  | { type: 'end'; reason: VadEndReason; trailingSilenceMs: number }
  /** `maxUtteranceMs` reached while speaking: end this one, start the next. */
  | { type: 'split' };

export interface VadStep {
  events: VadEvent[];
  /** 0 to 1, how loud this frame is against what counts as speech. */
  level: number;
  /** Currently inside an utterance. */
  speaking: boolean;
}

export interface VadSegmenter {
  /** Feed the RMS energy (0 to 1) of the next frame of `frameMs`. */
  push(energy: number, frameMs?: number): VadStep;
  /** Finish: ends an utterance in progress (`end` with reason `flush`). */
  flush(): VadEvent[];
  readonly speaking: boolean;
  /** The learned noise floor (RMS). */
  readonly noiseFloor: number;
  /** The energy above which a frame counts as speech. */
  readonly threshold: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Resolve options against the defaults, clamping silly values. */
export function resolveVadOptions(
  options: VadOptions = {},
): Required<VadOptions> {
  const pick = (value: number | undefined, fallback: number, min: number) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(min, value)
      : fallback;
  return {
    silenceMs: pick(options.silenceMs, VAD_DEFAULTS.silenceMs, VAD_FRAME_MS),
    minSpeechMs: pick(options.minSpeechMs, VAD_DEFAULTS.minSpeechMs, 0),
    preRollMs: pick(options.preRollMs, VAD_DEFAULTS.preRollMs, 0),
    maxUtteranceMs: pick(
      options.maxUtteranceMs,
      VAD_DEFAULTS.maxUtteranceMs,
      1000,
    ),
    sensitivity: clamp(
      typeof options.sensitivity === 'number' &&
        Number.isFinite(options.sensitivity)
        ? options.sensitivity
        : VAD_DEFAULTS.sensitivity,
      0,
      1,
    ),
    calibrateMs: pick(options.calibrateMs, VAD_DEFAULTS.calibrateMs, 0),
  };
}

/** Root-mean-square loudness of a block of samples (-1 to 1). */
export function frameEnergy(samples: ArrayLike<number>): number {
  const n = samples.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i] as number;
    sum += s * s;
  }
  return Math.sqrt(sum / n);
}

export function createVadSegmenter(options: VadOptions = {}): VadSegmenter {
  const o = resolveVadOptions(options);
  // Higher sensitivity: a lower multiple of the floor and a lower absolute minimum.
  const ratio = 6 - 4 * o.sensitivity;
  const absMin = 0.02 - 0.015 * o.sensitivity;

  let floor = DEFAULT_FLOOR;
  let calibratedMs = 0;
  const calibrationEnergies: number[] = [];
  let speaking = false;
  let candidateMs = 0;
  let silenceMs = 0;
  let utteranceMs = 0;

  const onThreshold = () => Math.max(floor * ratio, absMin);
  // Hysteresis: once speaking, only clearly lower energy counts as a pause.
  const offThreshold = () => Math.max(onThreshold() * 0.6, floor * 1.5);

  const reset = () => {
    speaking = false;
    candidateMs = 0;
    silenceMs = 0;
    utteranceMs = 0;
  };

  return {
    get speaking() {
      return speaking;
    },
    get noiseFloor() {
      return floor;
    },
    get threshold() {
      return onThreshold();
    },

    push(energy, frameMs = VAD_FRAME_MS) {
      const events: VadEvent[] = [];
      const e = Number.isFinite(energy) ? Math.max(0, energy) : 0;
      const level = clamp(e / (onThreshold() * 3), 0, 1);

      // Learn the room from the quietest frames of the opening window. Frames
      // inside an utterance never count, and the estimate is capped so speech
      // at t=0 cannot raise the floor to speech level. Detection stays live.
      const calibrating = calibratedMs < o.calibrateMs;
      if (calibrating) {
        calibratedMs += frameMs;
        if (!speaking) {
          calibrationEnergies.push(e);
          const sorted = [...calibrationEnergies].sort((a, b) => a - b);
          const p =
            sorted[
              Math.min(
                sorted.length - 1,
                Math.floor(sorted.length * CALIBRATION_PERCENTILE),
              )
            ] ?? DEFAULT_FLOOR;
          floor = clamp(p, MIN_FLOOR, CALIBRATION_FLOOR_CAP);
        }
      }

      if (!speaking) {
        if (e > onThreshold()) {
          candidateMs += frameMs;
          if (candidateMs >= o.minSpeechMs) {
            speaking = true;
            silenceMs = 0;
            utteranceMs = candidateMs;
            events.push({
              type: 'start',
              leadMs: o.preRollMs + candidateMs,
            });
            candidateMs = 0;
          }
        } else if (!calibrating) {
          candidateMs = 0;
          // Track the room slowly: down faster than up, so a hum that fades
          // is forgotten sooner than a noise that creeps in is accepted.
          const alpha = (frameMs / FLOOR_TRACK_MS) * (e < floor ? 4 : 1);
          floor = clamp(
            floor + (e - floor) * Math.min(1, alpha),
            MIN_FLOOR,
            MAX_FLOOR,
          );
        } else {
          candidateMs = 0;
        }
        return { events, level, speaking };
      }

      utteranceMs += frameMs;
      if (e > offThreshold()) {
        silenceMs = 0;
      } else {
        silenceMs += frameMs;
      }
      if (silenceMs >= o.silenceMs) {
        events.push({
          type: 'end',
          reason: 'silence',
          trailingSilenceMs: silenceMs,
        });
        reset();
      } else if (utteranceMs >= o.maxUtteranceMs) {
        events.push({ type: 'split' });
        utteranceMs = 0;
        silenceMs = 0;
      }
      return { events, level, speaking };
    },

    flush() {
      const events: VadEvent[] = [];
      if (speaking) {
        events.push({
          type: 'end',
          reason: 'flush',
          trailingSilenceMs: silenceMs,
        });
      }
      reset();
      return events;
    },
  };
}

/** One finished utterance. */
export interface VadUtterance {
  /** Mono samples (-1 to 1) at `sampleRate`. */
  pcm: Float32Array;
  sampleRate: number;
  durationMs: number;
  reason: VadEndReason;
}

export interface UtteranceCollectorOptions extends VadOptions {
  /** Sample rate of the PCM fed in. */
  sampleRate: number;
  onUtterance: (utterance: VadUtterance) => void;
  /** An utterance began (`true`) or ended (`false`). */
  onSpeaking?: (speaking: boolean) => void;
  /** Loudness 0 to 1 for each frame, for a meter. */
  onLevel?: (level: number) => void;
}

export interface UtteranceCollector {
  /** Feed any amount of mono PCM. */
  push(samples: Float32Array): void;
  /** Hand over an utterance in progress and reset. */
  flush(): void;
  /**
   * Drop an utterance in progress and all buffered audio (pre-roll included)
   * without emitting it. The learned noise floor is kept.
   */
  discard(): void;
  readonly speaking: boolean;
  readonly segmenter: VadSegmenter;
}

export function createUtteranceCollector(
  options: UtteranceCollectorOptions,
): UtteranceCollector {
  const o = resolveVadOptions(options);
  const segmenter = createVadSegmenter(o);
  const frameSize = Math.max(
    1,
    Math.round((options.sampleRate * VAD_FRAME_MS) / 1000),
  );
  const frameMs = (frameSize / options.sampleRate) * 1000;
  // Past audio kept for the pre-roll, plus the frames that proved it was speech.
  const ringFrames = Math.ceil((o.preRollMs + o.minSpeechMs) / frameMs) + 1;
  const ring: Float32Array[] = [];
  let carry = new Float32Array(0);
  let utterance: Float32Array[] | null = null;
  let wasSpeaking = false;

  const emit = (
    frames: Float32Array[],
    reason: VadEndReason,
    trailMs: number,
  ) => {
    // Drop silence beyond a short tail; the model gains nothing from it.
    const dropFrames = Math.max(
      0,
      Math.floor((trailMs - TRAILING_KEEP_MS) / frameMs),
    );
    const kept = frames.slice(0, Math.max(1, frames.length - dropFrames));
    let total = 0;
    for (const f of kept) total += f.length;
    const pcm = new Float32Array(total);
    let at = 0;
    for (const f of kept) {
      pcm.set(f, at);
      at += f.length;
    }
    options.onUtterance({
      pcm,
      sampleRate: options.sampleRate,
      durationMs: (total / options.sampleRate) * 1000,
      reason,
    });
  };

  const setSpeaking = (speaking: boolean) => {
    if (speaking === wasSpeaking) return;
    wasSpeaking = speaking;
    options.onSpeaking?.(speaking);
  };

  const handleFrame = (frame: Float32Array) => {
    const step = segmenter.push(frameEnergy(frame), frameMs);
    options.onLevel?.(step.level);
    ring.push(frame);
    if (ring.length > ringFrames) ring.shift();
    if (utterance) utterance.push(frame);
    for (const event of step.events) {
      if (event.type === 'start') {
        // The ring already holds this frame; the utterance starts with it, and
        // it is buffered from the very first frame of capture, so an utterance
        // that begins during calibration keeps its first syllables.
        utterance = [...ring];
        // Near capture start there is less past than the pre-roll asks for.
        // Transcribers do better with a little lead-in, so pad with silence.
        const wantLead = Math.ceil(o.preRollMs / frameMs);
        const haveLead = Math.max(
          0,
          ring.length - Math.ceil(o.minSpeechMs / frameMs),
        );
        for (let i = haveLead; i < wantLead; i++) {
          utterance.unshift(new Float32Array(frameSize));
        }
      } else if (event.type === 'end') {
        const frames = utterance ?? [];
        utterance = null;
        ring.length = 0;
        if (frames.length > 0)
          emit(frames, event.reason, event.trailingSilenceMs);
      } else if (event.type === 'split') {
        const frames = utterance ?? [];
        utterance = [];
        if (frames.length > 0) emit(frames, 'max', 0);
      }
    }
    setSpeaking(segmenter.speaking);
  };

  return {
    get speaking() {
      return segmenter.speaking;
    },
    segmenter,
    push(samples) {
      let data = samples;
      if (carry.length > 0) {
        data = new Float32Array(carry.length + samples.length);
        data.set(carry, 0);
        data.set(samples, carry.length);
      }
      let at = 0;
      while (at + frameSize <= data.length) {
        // Copy: the caller reuses its buffer.
        handleFrame(data.slice(at, at + frameSize));
        at += frameSize;
      }
      carry = data.slice(at);
    },
    flush() {
      const events = segmenter.flush();
      for (const event of events) {
        if (event.type === 'end' && utterance && utterance.length > 0) {
          emit(utterance, 'flush', event.trailingSilenceMs);
        }
      }
      utterance = null;
      ring.length = 0;
      carry = new Float32Array(0);
      setSpeaking(false);
      options.onLevel?.(0);
    },
    discard() {
      segmenter.flush();
      utterance = null;
      ring.length = 0;
      carry = new Float32Array(0);
      setSpeaking(false);
      options.onLevel?.(0);
    },
  };
}
