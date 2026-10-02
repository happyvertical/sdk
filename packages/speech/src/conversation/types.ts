/** Additive speech-to-speech conversation contract; independent of streaming STT. */
export type VoiceSessionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'failed';

export interface VoiceTranscript {
  itemId: string;
  role: 'user' | 'assistant';
  text: string;
  final: boolean;
}

export interface VoiceSessionEvents {
  state: VoiceSessionState;
  transcript: VoiceTranscript;
  /** Actual remote playback, rather than model response generation. */
  speaking: boolean;
  inputSpeech: boolean;
  response: { active: boolean; responseId?: string };
  usage: Record<string, unknown>;
  toolCall: { callId: string; name: string; arguments: string };
  /** Recoverable protocol/playback errors also use this event. */
  error: Error;
}

export interface VoiceSession {
  readonly state: VoiceSessionState;
  /** Coalesced while connecting; terminal sessions cannot be reconnected. */
  connect(): Promise<void>;
  sendText(text: string): string;
  /** Request a response, e.g. an opening introduction. */
  respond(instructions?: string): void;
  /** Cancels active generation and clears unplayed WebRTC audio. */
  interrupt(): void;
  setMicMuted(muted: boolean): void;
  setOutputMuted(muted: boolean): void;
  /** Resolve a tool call; policy and execution belong to the host. */
  submitToolResult(callId: string, result: unknown): void;
  /** Idempotently releases tracks, peer connection, playback and listeners. */
  close(): void;
  on<E extends keyof VoiceSessionEvents>(
    event: E,
    listener: (value: VoiceSessionEvents[E]) => void,
  ): () => void;
}

export interface OpenAIWebRTCVoiceOptions {
  /** Host-authenticated negotiation: post the offer to your server, return its answer. */
  negotiate(offer: string, signal: AbortSignal): Promise<string>;
  /** Called during connect. Ownership transfers to the session, including late resolution. */
  getMicrophone(): Promise<MediaStream>;
  audio?: HTMLAudioElement;
  createPeerConnection?: () => RTCPeerConnection;
  connectTimeoutMs?: number;
  /** Starts muted to let the host introduce its character before listening. Default false. */
  micMuted?: boolean;
  outputMuted?: boolean;
  signal?: AbortSignal;
}
