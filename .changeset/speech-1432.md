---
"@happyvertical/speech": patch
---

Allow host-owned realtime response scheduling while preserving defaults. Reply suppression is exposed only on the concrete OpenAIWebRTCVoiceSession capability; the generic VoiceSession contract retains its baseline one-argument sendText method.
