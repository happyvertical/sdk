---
'@happyvertical/speech': minor
---

Add an `openai-compatible` transcriber (`POST <base>/audio/transcriptions`) behind `getTranscriber()`, with `HAVE_SPEECH_TRANSCRIBER_*` environment configuration, usage reporting (`TranscriptResult.usage` and `onUsage`), gateway `headers`, Blob/Buffer/Uint8Array/ReadableStream input with MIME-derived filenames, a 25 MB default `maxBytes`, `Retry-After`-aware retries on 429/5xx, and plain-JSON fallback for models without `verbose_json` or timestamp support.
