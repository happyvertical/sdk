---
'@happyvertical/ai': patch
---

List gateway transcription and TTS models from the Bifrost and LiteLLM providers instead of filtering them out. `getModels()` now returns transcription models (model-ID tokens `whisper`, `transcribe`, `transcription`, `speech-to-text`, and Voxtral realtime checkpoints) with the `transcription` capability and TTS models (tokens `tts`, `speech`) with the `speech` capability, both with `supportsFunctions` and `supportsVision` false. Markers match whole model-ID tokens delimited by `/`, `-`, `_`, `.` or `:`, so ids that merely contain them, such as `huggingface/mattshumer/...`, are not treated as audio. Automatic chat, vision, embeddings, and image-generation model resolution never selects audio models. Moderation and rerank models remain filtered.
