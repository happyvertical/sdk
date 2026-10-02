# @happyvertical/speech

## 0.99.0

### Minor Changes

- a9ed658: Add optional browser WebRTC conversational voice sessions and server call lifecycle helpers for OpenAI Realtime, preserving existing STT/TTS APIs.

## 0.98.0

### Minor Changes

- 546ac91: Add an on-device `local` transcriber behind the new `@happyvertical/speech/local` subpath. It uses transformers.js (`@huggingface/transformers`, a new optional peer dependency) to run Whisper or Moonshine ONNX models: WebGPU with WASM fallback in browsers, onnxruntime-node in Node. The adapter decodes and resamples audio to 16 kHz mono (WAV and raw PCM everywhere, `AudioContext` in browsers, or a `decodeAudio` hook), maps timestamps onto segments and words, reports usage, and honours `signal`. Model id, `dtype`, device, cache dir, custom model host, and a progress callback are configurable through options or `HAVE_SPEECH_TRANSCRIBER_*`. A Web Worker server and client keep inference off the main thread. The core entry never imports the runtime, and a build check enforces this.
- f53ceda: Add an `openai-compatible` transcriber (`POST <base>/audio/transcriptions`) behind `getTranscriber()`, with `HAVE_SPEECH_TRANSCRIBER_*` environment configuration, usage reporting (`TranscriptResult.usage` and `onUsage`), gateway `headers`, Blob/Buffer/Uint8Array/ReadableStream input with MIME-derived filenames, a 25 MB default `maxBytes`, `Retry-After`-aware retries on 429/5xx, and plain-JSON fallback for models without `verbose_json` or timestamp support.
- 3734b47: Add realtime streaming transcription: `getStreamingTranscriber()` returns a `StreamingTranscriber` whose sessions take raw audio through `write()` (promise-based backpressure), emit `partial`/`final`/`speech_*`/`error`/`close` events, and resolve `end()` with the joined transcript and usage. Ships the `openai-realtime` adapter (OpenAI Realtime GA transcription sessions over WebSocket) with explicit audio format negotiation, server/semantic VAD or manual commits, header auth in Node and short-lived client-secret subprotocol auth in browsers, `HAVE_SPEECH_STREAMING_*` environment configuration, and a fail-fast no-reconnect policy. `getTranscriber({ type: 'openai-realtime' })` and `wrapStreamingTranscriber()` expose it to record-then-send callers. `SpeechAdapterAvailability` gains `streamingTranscribers`.
- 586bf42: Add per-turn audio limits with automatic turn rollover to realtime sessions. A new `maxTurnSeconds` option (env `HAVE_SPEECH_STREAMING_MAX_TURN_SECONDS`) caps the audio of one turn. The cap is measured from bytes and the negotiated format. `voxtral-realtime` defaults it to 270 s, so a session no longer overflows vLLM's per-turn `max_model_len` (about 5.5 minutes at 4096), which failed the session and could take the engine down. When a turn nears the cap, the session commits it at the first quiet stretch (RMS energy, tunable through `rollover: { windowSeconds, silenceThreshold, minSilenceMs }`), or at the cap itself, emits the turn's `final`, and continues in a new turn without losing audio. `end()` joins all turns. With `rollover: false`, a write past the cap rejects with the non-fatal code `SPEECH_TURN_TOO_LONG`. The record-then-send wrapper splits oversize clips into rollover turns, or rejects them before connecting when rollover is off. `openai-realtime` applies a configured limit to `manual` sessions only, and pads a turn shorter than OpenAI's 100 ms commit minimum (such as a rollover tail) with silence so it is not dropped. New: `StreamingTranscriber.turnLimit()`, `RealtimeProtocol.maxTurnSeconds` and `minCommitSeconds`, `parseMaxTurnSeconds()`, and the `StreamingRolloverOptions`/`StreamingTurnLimit` types.
- 2f26a8b: Add the `voxtral-realtime` streaming transcriber for Mistral Voxtral Realtime served by vLLM (`/v1/realtime`, PCM16 16 kHz, manual turns, `transcription.delta`/`done`), available through `getStreamingTranscriber()`, `getTranscriber()`, and `HAVE_SPEECH_STREAMING_*`. Add `createStreamingClientSecret()` to mint short-lived, per-tenant OpenAI Realtime client secrets server-side (`POST /v1/realtime/client_secrets`, default 60 s TTL, tenant/session attribution echoed for usage ledgers); it refuses `voxtral-realtime`, which has no ephemeral tokens. Browser sessions now reject `sk-…` keys passed as `clientSecret`. The streaming `end()` timeout now measures provider inactivity, so long clips that are still being transcribed are not cut off. Values of supplied `headers` (e.g. gateway keys) are now redacted from surfaced provider errors.

### Patch Changes

- c05a36b: Fix the `openai-compatible` synthesizer's default endpoint. A base URL ending in a version segment (for example `http://gateway/tts/v1`) now posts to `/audio/speech` instead of `/v1/v1/audio/speech`, and a base already ending in `/audio/speech` is used as-is. Explicit `speechPath` overrides are unchanged.

## 0.96.1

## 0.96.0

## 0.95.0

## 0.94.1

## 0.94.0

## 0.93.0

## 0.92.0

## 0.91.0

## 0.90.0

## 0.89.12

## 0.89.11

## 0.89.10

## 0.89.9

## 0.89.8

## 0.89.7

## 0.89.6

## 0.89.5

## 0.89.4

## 0.89.3

## 0.89.2

## 0.89.1

## 0.89.0

## 0.88.2

## 0.88.1

## 0.88.0

## 0.87.0

## 0.86.4

## 0.86.3

## 0.86.2

## 0.86.1

## 0.86.0

## 0.85.5

## 0.85.4

## 0.85.3

## 0.85.2

## 0.85.1

## 0.85.0

## 0.84.0

## 0.83.0

## 0.82.0

## 0.81.0

## 0.80.6

## 0.80.5

## 0.80.4

## 0.80.3

## 0.80.2

## 0.80.1

## 0.80.0

## 0.79.0

## 0.78.3

## 0.78.2

## 0.78.1

## 0.78.0

### Minor Changes

- efd5d73: Add the speech provider abstraction package with Studio Server STT/TTS and Qwen3/OpenAI-compatible TTS adapters.

## 0.77.0

- Initial speech provider abstraction package.
