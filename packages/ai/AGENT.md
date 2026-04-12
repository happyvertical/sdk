# @happyvertical/ai

<!-- BEGIN AGENT:GENERATED -->
## Purpose
Standardized AI interface supporting OpenAI, LiteLLM, Anthropic, Gemini, Bedrock, Hugging Face, Claude CLI, and Qwen3-TTS with a unified API

## Package Map
- Package: `@happyvertical/ai`
- Hierarchy path: `@happyvertical/sdk > packages > ai`
- Workspace position: `2 of 29` local packages
- Internal dependencies: `@happyvertical/utils`
- Internal dependents: `@happyvertical/sdk-mcp`
- Knowledge graph files: `AGENT.md`, `metadata.json`, `ecosystem-manifest.json`

## Build & Test
```bash
pnpm --filter @happyvertical/ai build
pnpm --filter @happyvertical/ai test
pnpm --filter @happyvertical/ai clean
```

## Agent Correction Loops
- If module resolution or export errors mention a workspace dependency, build the dependency first (`pnpm --filter @happyvertical/utils build`) and then rerun `pnpm --filter @happyvertical/ai build`.
- If tests or exports fail after API, type, or bundle changes, run `pnpm --filter @happyvertical/ai clean` followed by `pnpm --filter @happyvertical/ai build` and `pnpm --filter @happyvertical/ai test`.
- If failures span multiple packages or Turborepo ordering looks wrong, run `pnpm build` and `pnpm typecheck` from the repo root before retrying package-scoped commands.

## Ecosystem Relationships
- Provides: Standardized AI interface supporting OpenAI, LiteLLM, Anthropic, Gemini, Bedrock, Hugging Face, Claude CLI, and Qwen3-TTS with a unified API
- Implements: none
- Requires: @happyvertical/utils, @anthropic-ai/sdk, @aws-sdk/client-bedrock-runtime, @google/genai, openai
- Stability: stable (Primary package surface is described as implemented and production-oriented.)
<!-- END AGENT:GENERATED -->
