/**
 * Usage reporting shared by speech adapters.
 *
 * Adapters attach a {@link SpeechUsage} record to their results and call the
 * optional {@link SpeechUsageCallback} so callers can attribute each provider
 * call (for example to a tenant for billing).
 */

export type SpeechOperation = 'transcription' | 'synthesis';

export interface SpeechUsage {
  /** Operation that produced this usage record. */
  operation: SpeechOperation;
  /** Adapter type that made the provider call, e.g. `openai-compatible`. */
  provider: string;
  /** Model identifier sent to (or reported by) the provider. */
  model?: string;
  /** Audio duration in seconds, when the provider or caller reports it. */
  audioSeconds?: number;
  /** Size of the audio payload in bytes (uploaded for STT, received for TTS). */
  bytes?: number;
  /** Provider usage block, passed through untouched (e.g. OpenAI `usage`). */
  providerUsage?: Record<string, unknown>;
}

export type SpeechUsageCallback = (usage: SpeechUsage) => void | Promise<void>;

/**
 * Invokes every configured usage callback in order (adapter-level first, then
 * request-level). Callback errors propagate to the caller so that billing
 * hooks never fail silently.
 */
export async function reportSpeechUsage(
  usage: SpeechUsage,
  ...callbacks: Array<SpeechUsageCallback | undefined>
): Promise<void> {
  for (const callback of callbacks) {
    if (callback) {
      await callback(usage);
    }
  }
}

/**
 * Extracts audio seconds from an OpenAI-style `usage` block
 * (`{ type: 'duration', seconds }`).
 */
export function audioSecondsFromProviderUsage(
  providerUsage: Record<string, unknown> | undefined,
): number | undefined {
  if (!providerUsage) {
    return undefined;
  }

  const seconds = providerUsage.seconds;
  return typeof seconds === 'number' && Number.isFinite(seconds)
    ? seconds
    : undefined;
}
