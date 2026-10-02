/** Browser-safe, optional bidirectional voice conversation entry. */
export { createOpenAIWebRTCVoiceSession } from './conversation/openai-webrtc.js';
export type {
  OpenAIWebRTCVoiceOptions,
  VoiceSession,
  VoiceSessionEvents,
  VoiceSessionState,
  VoiceTranscript,
} from './conversation/types.js';
