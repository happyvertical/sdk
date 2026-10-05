/**
 * Mono resampler: windowed-sinc (Hann, 16 zero crossings per side)
 * interpolation. When downsampling, the kernel's cutoff is scaled to 95% of
 * the target Nyquist frequency so content above it is attenuated before it can
 * alias; when upsampling it is a plain band-limited interpolator. Edges treat
 * missing samples as absent and renormalise the kernel, so DC gain stays 1.
 * Quality is suited to speech recognition (passband flat to roughly 90% of
 * Nyquist, stopband well below -40 dB), not mastering. Cost is
 * O(output length x taps), taps ~ 32 x max(1, fromRate / toRate).
 */

import { WavFormatError } from './errors.js';

/** Largest output a single call may produce (samples). */
export const MAX_RESAMPLE_OUTPUT_SAMPLES = 2 ** 28;

const ZERO_CROSSINGS = 16;
const DOWNSAMPLE_CUTOFF = 0.95;

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

/** Resamples mono float samples from `fromRate` to `toRate` (Hz). */
export function resampleMono(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  for (const [name, rate] of [
    ['fromRate', fromRate],
    ['toRate', toRate],
  ] as const) {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new WavFormatError(
        'invalid_argument',
        `${name} must be a positive finite number (got ${String(rate)})`,
      );
    }
  }
  if (fromRate === toRate) return samples.slice();

  const length = Math.floor((samples.length * toRate) / fromRate);
  if (length > MAX_RESAMPLE_OUTPUT_SAMPLES) {
    throw new WavFormatError(
      'invalid_argument',
      `resampled output would be ${length} samples; the limit is ${MAX_RESAMPLE_OUTPUT_SAMPLES}`,
    );
  }
  const out = new Float32Array(length);
  const step = fromRate / toRate;
  // Cutoff relative to the input Nyquist; 1 means no low-pass.
  const cutoff = step > 1 ? DOWNSAMPLE_CUTOFF / step : 1;
  const halfWidth = ZERO_CROSSINGS / cutoff;
  const last = samples.length - 1;

  for (let index = 0; index < length; index += 1) {
    const center = index * step;
    const first = Math.max(0, Math.ceil(center - halfWidth));
    const end = Math.min(last, Math.floor(center + halfWidth));
    let sum = 0;
    let weights = 0;
    for (let tap = first; tap <= end; tap += 1) {
      const distance = tap - center;
      const window = 0.5 + 0.5 * Math.cos((Math.PI * distance) / halfWidth);
      const weight = cutoff * sinc(cutoff * distance) * window;
      sum += weight * samples[tap];
      weights += weight;
    }
    out[index] = weights !== 0 ? sum / weights : 0;
  }
  return out;
}
