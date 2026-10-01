/**
 * Per-turn audio limits for realtime sessions.
 *
 * Some providers cap the audio of one turn rather than of a session: vLLM's
 * realtime endpoint keeps a turn's audio and generated tokens in one model
 * context (`max_model_len`) and clears it after each final commit. A
 * {@link TurnSplitter} measures the audio of the current turn from byte counts
 * and the negotiated format, and picks where to roll over to a new turn: at
 * the first quiet stretch inside a window before the limit, or at the limit
 * itself when no quiet stretch turns up. The silence check is a plain RMS
 * energy test, not a voice-activity model.
 */

import { SpeechConfigurationError } from './errors.js';
import { bytesPerSecond } from './pcm.js';
import type {
  StreamingAudioEncoding,
  StreamingAudioFormat,
  StreamingRolloverOptions,
  StreamingSessionSettings,
  StreamingTurnLimit,
} from './streaming-types.js';

/** Default per-turn audio cap for providers that need one (`voxtral-realtime`). */
export const DEFAULT_MAX_TURN_SECONDS = 270;
/** How long before the cap the rollover starts looking for silence. */
export const DEFAULT_ROLLOVER_WINDOW_SECONDS = 15;
/** RMS level (0-1 of full scale, about -40 dBFS) below which audio is quiet. */
export const DEFAULT_ROLLOVER_SILENCE_THRESHOLD = 0.01;
/** Quiet audio needed before the rollover commits. */
export const DEFAULT_ROLLOVER_MIN_SILENCE_MS = 300;
/** Energy is measured over frames of this length. */
const ANALYSIS_FRAME_MS = 20;

const BYTES_PER_SAMPLE: Record<StreamingAudioEncoding, number> = {
  pcm16: 2,
  g711_ulaw: 1,
  g711_alaw: 1,
};

/** A resolved per-turn limit; `undefined` means turns are unbounded. */
export interface TurnLimit {
  maxTurnSeconds: number;
  /** `false`: writes past the cap reject with `SPEECH_TURN_TOO_LONG`. */
  rollover: boolean;
  windowSeconds: number;
  silenceThreshold: number;
  minSilenceMs: number;
}

/**
 * Resolves the turn limit from settings, highest priority first (session
 * options, then adapter options, which already carry environment values),
 * falling back to `defaultMaxTurnSeconds`. Returns `undefined` when no limit
 * applies or `maxTurnSeconds` is `Infinity`.
 */
export function resolveTurnLimit(
  adapter: string,
  defaultMaxTurnSeconds: number | undefined,
  ...settings: Array<
    Pick<StreamingSessionSettings, 'maxTurnSeconds' | 'rollover'> | undefined
  >
): TurnLimit | undefined {
  const maxTurnSeconds =
    settings.find((entry) => entry?.maxTurnSeconds !== undefined)
      ?.maxTurnSeconds ?? defaultMaxTurnSeconds;
  if (maxTurnSeconds === undefined) {
    return undefined;
  }
  if (
    typeof maxTurnSeconds !== 'number' ||
    Number.isNaN(maxTurnSeconds) ||
    maxTurnSeconds <= 0
  ) {
    throw new SpeechConfigurationError(
      `maxTurnSeconds must be a positive number of seconds or Infinity (got ${String(maxTurnSeconds)})`,
      adapter,
    );
  }
  if (maxTurnSeconds === Number.POSITIVE_INFINITY) {
    return undefined;
  }

  // On/off comes from the first layer that sets `rollover`; each tuning
  // field from the first layer whose `rollover` object sets that field, so a
  // `rollover: true` session keeps the adapter's tuning.
  const rollover = settings.find(
    (entry) => entry?.rollover !== undefined,
  )?.rollover;
  const tuning = <K extends keyof StreamingRolloverOptions>(key: K) =>
    settings
      .map((entry) => entry?.rollover)
      .find(
        (value): value is StreamingRolloverOptions =>
          typeof value === 'object' &&
          value !== null &&
          value[key] !== undefined,
      )?.[key];
  const limit: TurnLimit = {
    maxTurnSeconds,
    rollover: rollover !== false,
    windowSeconds: tuning('windowSeconds') ?? DEFAULT_ROLLOVER_WINDOW_SECONDS,
    silenceThreshold:
      tuning('silenceThreshold') ?? DEFAULT_ROLLOVER_SILENCE_THRESHOLD,
    minSilenceMs: tuning('minSilenceMs') ?? DEFAULT_ROLLOVER_MIN_SILENCE_MS,
  };
  assertNonNegative(adapter, 'rollover.windowSeconds', limit.windowSeconds);
  assertNonNegative(adapter, 'rollover.minSilenceMs', limit.minSilenceMs);
  assertNonNegative(
    adapter,
    'rollover.silenceThreshold',
    limit.silenceThreshold,
  );
  if (limit.silenceThreshold > 1) {
    throw new SpeechConfigurationError(
      `rollover.silenceThreshold is an RMS level from 0 to 1 (got ${limit.silenceThreshold})`,
      adapter,
    );
  }
  return limit;
}

function assertNonNegative(adapter: string, name: string, value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new SpeechConfigurationError(
      `${name} must be a non-negative finite number (got ${String(value)})`,
      adapter,
    );
  }
}

/** Bytes of one sample frame (one sample per channel). */
export function blockAlign(format: StreamingAudioFormat): number {
  return BYTES_PER_SAMPLE[format.encoding] * format.channels;
}

/** Whole sample frames in `seconds` of audio, as bytes (rounded down). */
export function bytesForSeconds(
  seconds: number,
  format: StreamingAudioFormat,
): number {
  const align = blockAlign(format);
  // The epsilon keeps decimal seconds such as 0.3 from losing a frame.
  return Math.floor((seconds * bytesPerSecond(format)) / align + 1e-9) * align;
}

/** Digital silence in `format`: zero samples, encoded. */
export function silence(
  bytes: number,
  format: StreamingAudioFormat,
): Uint8Array {
  const fill =
    format.encoding === 'g711_ulaw'
      ? 0xff
      : format.encoding === 'g711_alaw'
        ? 0xd5
        : 0;
  return new Uint8Array(bytes).fill(fill);
}

/** Bytes of audio one turn may hold: whole sample frames, at least one. */
export function turnCapBytes(
  limit: TurnLimit,
  format: StreamingAudioFormat,
): number {
  return Math.max(
    blockAlign(format),
    bytesForSeconds(limit.maxTurnSeconds, format),
  );
}

/** The public view of a resolved limit for a session format. */
export function describeTurnLimit(
  limit: TurnLimit | undefined,
  format: StreamingAudioFormat,
): StreamingTurnLimit | undefined {
  return (
    limit && {
      maxTurnSeconds: limit.maxTurnSeconds,
      rollover: limit.rollover,
      maxTurnBytes: turnCapBytes(limit, format),
    }
  );
}

/**
 * Tracks the audio of the current turn and finds rollover points.
 *
 * Feed every chunk in write order to {@link split} (rollover on) or
 * {@link add} (rollover off), and call {@link reset} whenever the turn ends
 * for another reason (a manual commit).
 */
export class TurnSplitter {
  /** Bytes of the current turn so far. */
  turnBytes = 0;
  readonly capBytes: number;
  private readonly windowStartBytes: number;
  private readonly frameBytes: number;
  private readonly minSilenceBytes: number;
  private readonly threshold: number;
  private readonly encoding: StreamingAudioEncoding;
  private readonly sampleBytes: number;
  // Energy of the analysis frame being filled.
  private frameFill = 0;
  private frameSumSquares = 0;
  private frameSamples = 0;
  /** Trailing bytes of a sample split across chunks. */
  private carry: number[] = [];
  /** Consecutive quiet bytes ending at the last complete frame. */
  private quietRun = 0;

  constructor(limit: TurnLimit, format: StreamingAudioFormat) {
    const align = blockAlign(format);
    this.capBytes = turnCapBytes(limit, format);
    this.windowStartBytes = Math.max(
      0,
      this.capBytes - bytesForSeconds(limit.windowSeconds, format),
    );
    this.frameBytes = Math.max(
      align,
      bytesForSeconds(ANALYSIS_FRAME_MS / 1000, format),
    );
    this.minSilenceBytes = Math.max(
      this.frameBytes,
      bytesForSeconds(limit.minSilenceMs / 1000, format),
    );
    this.threshold = limit.silenceThreshold;
    this.encoding = format.encoding;
    this.sampleBytes = BYTES_PER_SAMPLE[format.encoding];
  }

  /** Ends the current turn: the next byte starts a new one. */
  reset(): void {
    this.turnBytes = 0;
    this.frameFill = 0;
    this.frameSumSquares = 0;
    this.frameSamples = 0;
    this.carry = [];
    this.quietRun = 0;
  }

  /** Whether `bytes` more would push the current turn past the cap. */
  wouldOverflow(bytes: number): boolean {
    return this.turnBytes + bytes > this.capBytes;
  }

  /** Counts `bytes` toward the current turn without analysing them. */
  add(bytes: number): void {
    this.turnBytes += bytes;
  }

  /**
   * Feeds one chunk and returns the offsets inside it where the turn should
   * end (each in `1..chunk.byteLength`, ascending). The splitter resets at
   * each offset, so bytes after it count toward the next turn.
   */
  split(chunk: Uint8Array): number[] {
    const cuts: number[] = [];
    let offset = 0;
    while (offset < chunk.byteLength) {
      if (this.turnBytes < this.windowStartBytes) {
        // Before the window only the length matters.
        const skip = Math.min(
          chunk.byteLength - offset,
          this.windowStartBytes - this.turnBytes,
        );
        offset += skip;
        this.turnBytes += skip;
        // With no window (`windowSeconds: 0`) the window starts at the cap.
        if (this.turnBytes >= this.capBytes) {
          cuts.push(offset);
          this.reset();
        }
        continue;
      }

      const take = Math.min(
        chunk.byteLength - offset,
        this.frameBytes - this.frameFill,
        this.capBytes - this.turnBytes,
      );
      this.measure(chunk, offset, take);
      offset += take;
      this.turnBytes += take;
      this.frameFill += take;

      let cut = false;
      if (this.frameFill >= this.frameBytes) {
        const quiet = this.frameIsQuiet();
        this.quietRun = quiet ? this.quietRun + this.frameFill : 0;
        this.frameFill = 0;
        this.frameSumSquares = 0;
        this.frameSamples = 0;
        cut = this.quietRun >= this.minSilenceBytes;
      }
      if (cut || this.turnBytes >= this.capBytes) {
        cuts.push(offset);
        this.reset();
      }
    }
    return cuts;
  }

  private frameIsQuiet(): boolean {
    if (this.frameSamples === 0) {
      return false;
    }
    const rms = Math.sqrt(this.frameSumSquares / this.frameSamples) / 32_768;
    return rms < this.threshold;
  }

  private measure(chunk: Uint8Array, start: number, length: number): void {
    const end = start + length;
    let index = start;
    // Complete a sample left over from the previous chunk.
    while (this.carry.length > 0 && index < end) {
      this.carry.push(chunk[index] ?? 0);
      index += 1;
      if (this.carry.length === this.sampleBytes) {
        this.addSample(this.carry);
        this.carry = [];
      }
    }
    for (; index + this.sampleBytes <= end; index += this.sampleBytes) {
      this.addSampleAt(chunk, index);
    }
    for (; index < end; index += 1) {
      this.carry.push(chunk[index] ?? 0);
    }
  }

  private addSample(bytes: number[]): void {
    this.addLinear(
      this.encoding === 'pcm16'
        ? pcm16Sample(bytes[0] ?? 0, bytes[1] ?? 0)
        : this.decodeG711(bytes[0] ?? 0),
    );
  }

  private addSampleAt(chunk: Uint8Array, index: number): void {
    this.addLinear(
      this.encoding === 'pcm16'
        ? pcm16Sample(chunk[index] ?? 0, chunk[index + 1] ?? 0)
        : this.decodeG711(chunk[index] ?? 0),
    );
  }

  private addLinear(sample: number): void {
    this.frameSumSquares += sample * sample;
    this.frameSamples += 1;
  }

  private decodeG711(byte: number): number {
    return this.encoding === 'g711_ulaw' ? decodeMuLaw(byte) : decodeALaw(byte);
  }
}

/** Signed 16-bit little-endian sample. */
function pcm16Sample(low: number, high: number): number {
  const value = low | (high << 8);
  return value >= 0x8000 ? value - 0x10000 : value;
}

/** G.711 mu-law byte to a 16-bit linear sample (ITU-T G.711). */
export function decodeMuLaw(byte: number): number {
  const value = ~byte & 0xff;
  const exponent = (value >> 4) & 0x07;
  const mantissa = value & 0x0f;
  const magnitude = (((mantissa << 3) + 0x84) << exponent) - 0x84;
  return value & 0x80 ? -magnitude : magnitude;
}

/** G.711 A-law byte to a 16-bit linear sample (ITU-T G.711). */
export function decodeALaw(byte: number): number {
  const value = byte ^ 0x55;
  const exponent = (value >> 4) & 0x07;
  const mantissa = value & 0x0f;
  const magnitude =
    exponent === 0
      ? (mantissa << 4) + 8
      : ((mantissa << 4) + 0x108) << (exponent - 1);
  return value & 0x80 ? magnitude : -magnitude;
}
