# @happyvertical/speech

Speech provider abstraction for HappyVertical STT and TTS backends.

This package owns runtime speech backend contracts. It is intentionally separate from SMRT model packages such as `@happyvertical/smrt-voice`, which persist voice profiles, samples, and generated outputs.

## Install

```bash
pnpm add @happyvertical/speech
```

## Usage

```typescript
import { getSpeech } from '@happyvertical/speech';

const speech = await getSpeech({
  transcriber: {
    type: 'studio-server',
    baseUrl: 'http://studio-server.studio-server.svc.cluster.local',
  },
  synthesizer: {
    type: 'qwen3-tts',
    baseUrl: 'http://qwen3-tts.qwen3-tts.svc.cluster.local',
  },
});

const transcript = await speech.transcribe({
  audio: {
    data: audioBytes,
    contentType: 'audio/wav',
    filename: 'utterance.wav',
  },
  language: 'en',
});

const spoken = await speech.synthesize({
  text: transcript.text,
  outputFormat: 'mp3',
});
```

## Adapters

| Provider | Type | Method | Path | Encoding |
| --- | --- | --- | --- | --- |
| Studio Server STT | `studio-server` | `POST` | `/v1/transcribe` | Multipart (`audio`) |
| Studio Server TTS | `studio-server` | `POST` | `/v1/tts/synthesize` | Multipart |
| Qwen3 TTS | `qwen3-tts` | `POST` | `/v1/audio/speech` | Multipart |
| OpenAI-compatible TTS | `openai-compatible` | `POST` | `/v1/audio/speech` | JSON |

Studio Server and Qwen3 accept pre-extracted provider voice prompts through `SpeechVoice.prompt`; the adapters forward these as the multipart `voice_prompt` field.

## Environment Configuration

SDK-style names are preferred:

```bash
HAVE_SPEECH_STT_TYPE=studio-server
HAVE_SPEECH_STT_BASE_URL=http://studio-server.studio-server.svc.cluster.local
HAVE_SPEECH_TTS_TYPE=qwen3-tts
HAVE_SPEECH_TTS_BASE_URL=http://qwen3-tts.qwen3-tts.svc.cluster.local
```

STT defaults to `studio-server` when only a base URL is present. TTS requires an explicit type because multiple TTS wire protocols are supported.

For gateway compatibility, the package also accepts:

```bash
STT_ADAPTER=studio-server
STT_BASE_URL=http://studio-server.studio-server.svc.cluster.local
TTS_ADAPTER=qwen3-tts
TTS_BASE_URL=http://qwen3-tts.qwen3-tts.svc.cluster.local
```

Optional overrides include `STT_PATH`, `TTS_PATH`, `STT_API_KEY`, `TTS_API_KEY`, `SPEECH_API_KEY`, `STT_TIMEOUT_MS`, and `TTS_TIMEOUT_MS`.

## Testing

Default tests use tiny in-process HTTP fixture services that mirror the Studio Server, Qwen3, and OpenAI-compatible request shapes. They validate field names, encodings, and response normalization without downloading production-scale models.

Docker or Testcontainers integration suites should run the fixture services or Studio Server with mock backends. Model-backed tests must remain opt-in, for example behind `HV_SPEECH_MODEL_TESTS=1`, so the normal SDK suite never downloads model weights.

On Apple Silicon, run model-backed Qwen tests with a host-native Metal/MLX runtime or against a remote cluster service; Docker contract tests should continue using mock backends because Linux containers do not expose the host Metal runtime.
