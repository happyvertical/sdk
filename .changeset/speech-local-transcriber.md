---
'@happyvertical/speech': minor
---

Add an on-device `local` transcriber behind the new `@happyvertical/speech/local` subpath. It uses transformers.js (`@huggingface/transformers`, a new optional peer dependency) to run Whisper or Moonshine ONNX models: WebGPU with WASM fallback in browsers, onnxruntime-node in Node. The adapter decodes and resamples audio to 16 kHz mono (WAV and raw PCM everywhere, `AudioContext` in browsers, or a `decodeAudio` hook), maps timestamps onto segments and words, reports usage, and honours `signal`. Model id, `dtype`, device, cache dir, custom model host, and a progress callback are configurable through options or `HAVE_SPEECH_TRANSCRIBER_*`. A Web Worker server and client keep inference off the main thread. The core entry never imports the runtime, and a build check enforces this.
