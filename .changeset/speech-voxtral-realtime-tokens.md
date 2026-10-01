---
'@happyvertical/speech': minor
---

Add the `voxtral-realtime` streaming transcriber for Mistral Voxtral Realtime served by vLLM (`/v1/realtime`, PCM16 16 kHz, manual turns, `transcription.delta`/`done`), available through `getStreamingTranscriber()`, `getTranscriber()`, and `HAVE_SPEECH_STREAMING_*`. Add `createStreamingClientSecret()` to mint short-lived, per-tenant OpenAI Realtime client secrets server-side (`POST /v1/realtime/client_secrets`, default 60 s TTL, tenant/session attribution echoed for usage ledgers); it refuses `voxtral-realtime`, which has no ephemeral tokens. Browser sessions now reject `sk-…` keys passed as `clientSecret`. The streaming `end()` timeout now measures provider inactivity, so long clips that are still being transcribed are not cut off.
