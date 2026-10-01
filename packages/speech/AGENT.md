# @happyvertical/speech

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Speech provider abstraction for STT and TTS backends

## Package Map
- Package: `@happyvertical/speech`
- Hierarchy path: `@happyvertical/sdk > packages > speech`
- Workspace position: `27 of 32` local packages
- Internal dependencies: none
- Internal dependents: none
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/speech build
pnpm --filter @happyvertical/speech test
pnpm --filter @happyvertical/speech typecheck
pnpm --filter @happyvertical/speech clean
```

## Agent Correction Loops
- If Vite or TypeScript reports missing packages, run `pnpm install` at the repo root and rerun `pnpm --filter @happyvertical/speech build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/speech clean` followed by `pnpm --filter @happyvertical/speech build` and `pnpm --filter @happyvertical/speech test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Speech provider abstraction for STT and TTS backends
- Implements: Studio Server STT, OpenAI-compatible STT, OpenAI Realtime streaming STT, Voxtral Realtime streaming STT, On-device STT, Studio Server TTS, Qwen3 TTS, OpenAI-compatible TTS
- Requires: @huggingface/transformers
- Stability: experimental (Marked as preview or experimental in package guidance.)
<!-- END AGENT:GENERATED -->


## SDK Pattern

Use factory functions as the public surface:

- `getSpeech(config)` returns a service with optional STT and TTS providers.
- `getTranscriber(config)` creates an STT provider.
- `getSpeechSynthesizer(config)` creates a TTS provider.

Adapter constructors are internal implementation details. Keep new backends behind the `type` option and the factory switch.

## Adapters

- Studio Server STT (`type: 'studio-server'`) posts multipart audio to `/v1/transcribe`.
- OpenAI-compatible STT (`type: 'openai-compatible'`) posts multipart `file`/`model` to `<base>/audio/transcriptions`.
- OpenAI Realtime streaming STT (`type: 'openai-realtime'`) streams raw PCM16/G.711 over a WebSocket to `<base>/realtime?intent=transcription` via `getStreamingTranscriber()`; `getTranscriber()` wraps it for record-then-send callers.
- Voxtral Realtime streaming STT (`type: 'voxtral-realtime'`, served by vLLM) streams PCM16 16 kHz mono to `<base>/realtime` with vLLM's protocol: a top-level `session.update` model, a non-final commit to start each turn, a `final: true` commit to end it, `transcription.delta`/`done` events, manual turns only, and a required `baseUrl`.
- On-device STT (`type: 'local'`) runs Whisper/Moonshine ONNX models with transformers.js behind the `@happyvertical/speech/local` subpath; importing that subpath registers the type with the factory.
- Studio Server TTS (`type: 'studio-server'`) posts multipart form data to `/v1/tts/synthesize`.
- Qwen3 TTS (`type: 'qwen3-tts'`) posts multipart form data to `/v1/audio/speech`.
- OpenAI-compatible TTS (`type: 'openai-compatible'`) posts OpenAI-shaped JSON to `<base>/audio/speech`, resolved like the transcriber (`resolveOpenAICompatibleUrl`: server root → `/v1/audio/speech`, `/vN` root → `/audio/speech`, full endpoint as-is; an explicit `speechPath` resolves relative to `baseUrl` instead).

## Shared Building Blocks

New adapters (including streaming/realtime transcribers) should reuse these modules in `src/shared/` instead of re-implementing them:

- `usage.ts`: `SpeechUsage`, `SpeechUsageCallback`, `reportSpeechUsage()` (adapter `onUsage` first, then request `onUsage`; callback errors propagate), and `audioSecondsFromProviderUsage()`.
- `env.ts`: `resolveTranscriberConfig(options, context)` reads `HAVE_SPEECH_TRANSCRIBER_*` (then legacy `HAVE_SPEECH_STT_*`/`STT_*`) with explicit options winning; headers merge env → context → options via `mergeHeaderInits()`.
- `audio.ts`: `normalizeAudioInput()` accepts `AudioInput` or a bare Blob/Buffer/Uint8Array/ArrayBuffer/ReadableStream, enforces `maxBytes` while buffering, and derives the multipart filename through `mimeTypeToAudioExtension()`.
- `retry.ts`: `withSpeechRetry()` retries 429/5xx `SpeechProviderError`s with exponential backoff, honours `Retry-After` (`retryAfterMs`), and stops on abort.
- `http.ts`: `HttpSpeechAdapter.post(..., retry)` sends auth/extra headers (`headers` option plus per-request `headers`), applies `timeoutMs` per attempt, and redacts the API key from provider error bodies; `resolveOpenAICompatibleUrl()` normalises OpenAI-style base URLs.

- `registry.ts`: `registerOptionalTranscriber()` lets subpath entries add opt-in transcriber types without the core entry importing them. `getTranscriber()` throws `SpeechConfigurationError` naming the subpath when such a type is requested before registration.

The OpenAI-compatible transcriber holds an API key and is server-side only.

## Streaming (Realtime) Transcribers

- Contract: `src/shared/streaming-types.ts` (`StreamingTranscriber.start()` → `StreamingSession` with `write()`, `commit()`, `end()`, `abort()`, `on()`). Keep it additive; `Transcriber` stays request/response.
- `src/shared/realtime-session.ts`: `RealtimeTranscriptionSession` owns the socket, ordered write queue, backpressure (`write()` resolves after the socket drains to `highWaterMark`; `maxBufferedBytes` rejects), connect/final timeouts, turn bookkeeping, events, the joined `TranscriptResult`, and usage. A mid-session socket drop fails the session; there is no reconnect.
- A new realtime adapter implements `RealtimeProtocol` (`sessionMessages`, `appendMessage`, `commitMessage`, `parse` → `RealtimeProtocolEvent[]`, plus `commitAck`, `endCommit`, and optional `turnStartMessage` for servers that need an explicit turn start; the session then holds audio written after a commit until outstanding turns are acknowledged) and a small `StreamingTranscriber` class that resolves auth/URL/format and constructs the session. See `src/adapters/openai-realtime.ts` and `src/adapters/voxtral-realtime.ts`.
- The end timeout and the held-turn wait are inactivity timeouts: every server message restarts them.
- For `commitAck: 'final'` protocols the session fails closed when the server ends a turn it was not asked to end, and when a final reports `audioConsumed: false` for a turn that carried audio (vLLM's stale end marker), instead of losing audio silently. Supplied header values are redacted from provider text alongside the API key and client secret.
- Register new types in `STREAMING_TRANSCRIBER_TYPES` and the `getStreamingTranscriber()` switch (`src/shared/streaming-factory.ts`), and extend `StreamingTranscriberType`; `getTranscriber()` then wraps them automatically.
- Env: `HAVE_SPEECH_STREAMING_*` (`STREAMING_TRANSCRIBER_ENV_KEYS`), explicit options first.
- Auth: `apiKey` → `Authorization` header (Node only, refused in browsers); `clientSecret` (string or per-session mint function) → subprotocol, with `sk-…` keys refused in browsers. Shared helpers live in `src/shared/realtime-auth.ts`. Never put long-lived keys in browser code paths.
- Browser tokens: `createStreamingClientSecret()` (`src/shared/streaming-client-secret.ts`) mints OpenAI `ek_…` secrets server-side via `POST /v1/realtime/client_secrets` (default TTL 60 s), echoing `tenantId`/`sessionId`/`metadata` for the caller's ledger. It throws `SpeechConfigurationError` for `voxtral-realtime` (vLLM has no ephemeral tokens; consumers need their own gateway) and in browsers.
- Tests use an in-memory fake WebSocket (`src/__tests__/fake-websocket.ts`) injected through `WebSocket`/`createWebSocket`, and an injected `fetch`; no network. `voxtral-realtime.live.test.ts` is opt-in (`HAVE_SPEECH_STREAMING_LIVE=1`).

## Optional Peer Isolation (`local`)

- `@huggingface/transformers` is an optional peer dependency (dev dependency for tests). Only `src/adapters/local/runtime.ts` names it, through a dynamic `import()` reached solely from `src/local.ts`. Never import `adapters/local/*` from `src/index.ts` or `src/shared/*`, except as `import type`.
- `pnpm --filter @happyvertical/speech build` runs `scripts/check-core-isolation.mjs`. The check fails if `dist/index.js`, or any module reachable from it through static or dynamic imports, references the peer. `src/__tests__/local-isolation.test.ts` asserts the same at runtime.
- The package tsconfig maps the peer to `src/adapters/local/transformers-shim.ts`, because the peer's own declarations (4.3.0) fail this repo's `skipLibCheck: false`. The adapter uses structural types in `runtime.ts` instead.
- Unit tests inject a fake transformers module (`transformers` option); never download models in CI. The real-model smoke test is opt-in via `HV_SPEECH_MODEL_TESTS=1`.
