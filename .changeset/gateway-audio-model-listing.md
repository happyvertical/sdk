---
'@happyvertical/ai': patch
---

List gateway transcription and TTS models from the Bifrost and LiteLLM providers instead of filtering them out. `getModels()` now returns transcription models (`whisper`, `*transcrib*`, `speech-to-text`) with the `transcription` capability and TTS models (`tts`, `speech`) with the `speech` capability, both with `supportsFunctions` and `supportsVision` false. Automatic chat, vision, embeddings, and image-generation model resolution never selects them. Moderation and rerank models remain filtered.
