---
'@happyvertical/speech': minor
---

Add realtime streaming transcription: `getStreamingTranscriber()` returns a `StreamingTranscriber` whose sessions take raw audio through `write()` (promise-based backpressure), emit `partial`/`final`/`speech_*`/`error`/`close` events, and resolve `end()` with the joined transcript and usage. Ships the `openai-realtime` adapter (OpenAI Realtime GA transcription sessions over WebSocket) with explicit audio format negotiation, server/semantic VAD or manual commits, header auth in Node and short-lived client-secret subprotocol auth in browsers, `HAVE_SPEECH_STREAMING_*` environment configuration, and a fail-fast no-reconnect policy. `getTranscriber({ type: 'openai-realtime' })` and `wrapStreamingTranscriber()` expose it to record-then-send callers. `SpeechAdapterAvailability` gains `streamingTranscribers`.
