# @happyvertical/speech

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Speech provider abstraction for STT and TTS backends

## Package Map
- Package: `@happyvertical/speech`
- Hierarchy path: `@happyvertical/sdk > packages > speech`
- Workspace position: `26 of 31` local packages
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
- Implements: Studio Server STT, Studio Server TTS, Qwen3 TTS, OpenAI-compatible TTS
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
- Studio Server TTS (`type: 'studio-server'`) posts multipart form data to `/v1/tts/synthesize`.
- Qwen3 TTS (`type: 'qwen3-tts'`) posts multipart form data to `/v1/audio/speech`.
- OpenAI-compatible TTS (`type: 'openai-compatible'`) posts OpenAI-shaped JSON to `/v1/audio/speech`.
