/**
 * Audio model classification shared by the Bifrost and LiteLLM gateway
 * providers.
 *
 * Markers are matched as whole model-ID tokens (split on `/`, `-`, `_`, `.`,
 * `:` and whitespace), never as raw substrings, so an author or model segment
 * that merely contains a marker (e.g. `tts` inside `mattshumer`) is not
 * classified as audio.
 */

function modelIdTokens(modelId: string): string[] {
  return modelId
    .toLowerCase()
    .split(/[/_.:\s-]+/)
    .filter(Boolean);
}

function hasTokenSequence(tokens: string[], sequence: string[]): boolean {
  for (let i = 0; i + sequence.length <= tokens.length; i++) {
    if (sequence.every((token, offset) => tokens[i + offset] === token)) {
      return true;
    }
  }
  return false;
}

const TRANSCRIPTION_TOKENS = new Set([
  'transcribe',
  'transcriber',
  'transcription',
  'whisper',
]);

const SPEECH_TOKENS = new Set(['tts', 'speech']);

/**
 * Speech-to-text models (e.g. `whisper-1`, `gpt-4o-transcribe`,
 * `speech-to-text-v1`, `voxtral-mini-4b-realtime`). Listed with the
 * `transcription` capability so gateway consumers can route audio to them;
 * never eligible for chat, vision, embeddings, or image generation.
 */
export function isTranscriptionModel(modelId: string): boolean {
  const tokens = modelIdTokens(modelId);
  return (
    tokens.some((token) => TRANSCRIPTION_TOKENS.has(token)) ||
    hasTokenSequence(tokens, ['speech', 'to', 'text']) ||
    // Voxtral realtime checkpoints are streaming speech-to-text only; other
    // Voxtral models are audio-understanding chat models.
    (tokens.includes('voxtral') && tokens.includes('realtime'))
  );
}

/**
 * Text-to-speech models (e.g. `tts-1`, `gpt-4o-mini-tts`). Listed with the
 * `speech` capability; never eligible for chat, vision, embeddings, or image
 * generation.
 */
export function isSpeechModel(modelId: string): boolean {
  return (
    !isTranscriptionModel(modelId) &&
    modelIdTokens(modelId).some((token) => SPEECH_TOKENS.has(token))
  );
}

export function isAudioModel(modelId: string): boolean {
  return isTranscriptionModel(modelId) || isSpeechModel(modelId);
}
