/**
 * `@happyvertical/speech/browser`: capture microphone audio as the raw PCM the
 * realtime transcribers need. No Node APIs; safe to import during SSR (it only
 * touches Web Audio when `createPcmCapture` is called).
 */

export {
  PcmCaptureError,
  type PcmCaptureErrorReason,
} from './shared/errors.js';
export {
  createPcmCapture,
  type PcmCapture,
  type PcmCaptureOptions,
  type PcmCaptureResult,
  pcmCaptureSupported,
} from './shared/pcm-capture.js';
