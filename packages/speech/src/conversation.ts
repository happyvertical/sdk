/** Browser-safe, optional bidirectional voice conversation entry. */
export { createOpenAIWebRTCVoiceSession } from './conversation/openai-webrtc.js';
export type {
  OpenAIWebRTCVoiceOptions,
  OpenAIWebRTCVoiceSession,
  VoiceInputSpeechMetadata,
  VoiceSession,
  VoiceSessionEventMetadata,
  VoiceSessionEvents,
  VoiceSessionState,
  VoiceTranscript,
} from './conversation/types.js';
