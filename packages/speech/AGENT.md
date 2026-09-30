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
- Implements: Studio Server STT, OpenAI-compatible STT, Studio Server TTS, Qwen3 TTS, OpenAI-compatible TTS
- Requires: none
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
- Studio Server TTS (`type: 'studio-server'`) posts multipart form data to `/v1/tts/synthesize`.
- Qwen3 TTS (`type: 'qwen3-tts'`) posts multipart form data to `/v1/audio/speech`.
- OpenAI-compatible TTS (`type: 'openai-compatible'`) posts OpenAI-shaped JSON to `/v1/audio/speech`.

## Shared Building Blocks

New adapters (including streaming/realtime transcribers) should reuse these modules in `src/shared/` instead of re-implementing them:

- `usage.ts`: `SpeechUsage`, `SpeechUsageCallback`, `reportSpeechUsage()` (adapter `onUsage` first, then request `onUsage`; callback errors propagate), and `audioSecondsFromProviderUsage()`.
- `env.ts`: `resolveTranscriberConfig(options, context)` reads `HAVE_SPEECH_TRANSCRIBER_*` (then legacy `HAVE_SPEECH_STT_*`/`STT_*`) with explicit options winning; headers merge env → context → options via `mergeHeaderInits()`.
- `audio.ts`: `normalizeAudioInput()` accepts `AudioInput` or a bare Blob/Buffer/Uint8Array/ArrayBuffer/ReadableStream, enforces `maxBytes` while buffering, and derives the multipart filename through `mimeTypeToAudioExtension()`.
- `retry.ts`: `withSpeechRetry()` retries 429/5xx `SpeechProviderError`s with exponential backoff, honours `Retry-After` (`retryAfterMs`), and stops on abort.
- `http.ts`: `HttpSpeechAdapter.post(..., retry)` sends auth/extra headers (`headers` option plus per-request `headers`), applies `timeoutMs` per attempt, and redacts the API key from provider error bodies; `resolveOpenAICompatibleUrl()` normalises OpenAI-style base URLs.

The OpenAI-compatible transcriber holds an API key and is server-side only.
