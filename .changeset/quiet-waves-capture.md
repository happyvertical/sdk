---
'@happyvertical/speech': minor
---

Add `transcriberInputFormat(type)` to the main entry, a pure `@happyvertical/speech/pcm` entry (`encodeWavPcm16`, strict `parseWavPcm16`, `resampleMono`, `float32ToPcm16`, `pcm16ToFloat32`, `WavFormatError`), and a `@happyvertical/speech/browser` entry with `createPcmCapture` for recording microphone audio as the raw PCM the realtime transcribers require.
