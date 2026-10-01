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
| OpenAI-compatible STT | `openai-compatible` | `POST` | `<base>/audio/transcriptions` | Multipart (`file`) |
| Studio Server TTS | `studio-server` | `POST` | `/v1/tts/synthesize` | Multipart |
| Qwen3 TTS | `qwen3-tts` | `POST` | `/v1/audio/speech` | Multipart |
| OpenAI-compatible TTS | `openai-compatible` | `POST` | `/v1/audio/speech` | JSON |

Studio Server and Qwen3 accept pre-extracted provider voice prompts through `SpeechVoice.prompt`; the adapters forward these as the multipart `voice_prompt` field.

## OpenAI-compatible Transcription

`type: 'openai-compatible'` speaks the OpenAI audio API, so one adapter covers OpenAI, Groq, Fireworks, LiteLLM and Bifrost gateways, vLLM, speaches/faster-whisper-server, and whisper.cpp server.

> **Server-side only.** The adapter holds the provider API key. Never construct it in a browser. Browsers should record audio (for example with `MediaRecorder`) and post it to your own server route, which calls the transcriber.

```typescript
import { getTranscriber } from '@happyvertical/speech';

const transcriber = await getTranscriber({
  type: 'openai-compatible',
  baseUrl: 'http://bifrost:8080/openai/v1', // or https://api.openai.com
  apiKey: process.env.OPENAI_API_KEY,
  model: 'whisper-1',
  headers: { 'x-bf-vk': virtualKey }, // gateway routing / org / project headers
  onUsage: (usage) => recordUsage(tenantId, usage),
});

// Inside a server route that received the browser upload:
const result = await transcriber.transcribe({
  audio: request.body, // Blob | Buffer | Uint8Array | ArrayBuffer | ReadableStream
  mimeType: 'audio/webm;codecs=opus', // Safari sends audio/mp4
  language: 'en',
  timestampGranularities: ['word', 'segment'],
  headers: { 'x-bf-vk': tenantVirtualKey }, // per-request headers win
  signal: abortController.signal,
});

result.text;
result.segments; // present when the server returns verbose_json
result.words; // present when word timestamps were requested and supported
result.usage; // { operation, provider, model, audioSeconds, bytes, providerUsage }
```

- **Base URL.** A server root gets `/v1/audio/transcriptions`; a base ending in a version segment (`http://gateway/stt/v1`) gets `/audio/transcriptions`; a URL already ending in `/audio/transcriptions` is used as-is. Any query string (for example `?api-version=…`) is preserved and a fragment is dropped.
- **Audio formats.** The multipart filename extension comes from the MIME type (codec parameters are ignored): `webm`, `m4a` (`audio/mp4`), `mp4` (`video/mp4`), `wav`, `ogg`, `mp3`, `flac`. Pass `audio: { data, filename }` to choose the name yourself.
- **Limits.** `maxBytes` (adapter or request) defaults to 25 MB, the OpenAI upload cap. Oversized or empty input fails with `SpeechConfigurationError` before any request; streams are cancelled as soon as they exceed the limit.
- **Response formats.** Defaults to `verbose_json` so segments, duration, and (with `timestampGranularities`) word timings map onto `TranscriptResult`. Models that only return `json`/`text` (`gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, including gateway-prefixed names) are sent `json` without timestamps. If any other server rejects `verbose_json` or `timestamp_granularities[]` with a 400/422, the adapter retries once with plain `json`.
- **Retries.** 429 and 5xx responses are retried with exponential backoff (default 2 retries, 500 ms initial delay, 30 s cap), waiting at least `Retry-After`. A `Retry-After` longer than `maxDelayMs` ends retrying. Configure with `retry: { maxRetries, initialDelayMs, maxDelayMs }` or disable with `retry: false`; non-finite values (`NaN`, `Infinity`) throw `SpeechConfigurationError`. `timeoutMs` applies per attempt; `signal` cancels the request and any backoff wait.
- **Usage.** `result.usage` and `onUsage` (adapter-level, then request-level) report the model, audio seconds (provider duration, then `usage.seconds`, then `AudioInput.durationSeconds`), uploaded bytes, and the provider `usage` block untouched. Errors thrown by `onUsage` propagate.
- **Errors.** HTTP failures throw `SpeechProviderError` with `status`, `responseBody`, and `retryAfterMs`. The API key never appears in error messages and is redacted from response bodies.

## Environment Configuration

Transcriber settings switch between cloud and self-hosted models without code changes. Explicit options win over the environment:

```bash
HAVE_SPEECH_TRANSCRIBER_TYPE=openai-compatible
HAVE_SPEECH_TRANSCRIBER_BASE_URL=http://bifrost:8080/openai/v1
HAVE_SPEECH_TRANSCRIBER_MODEL=whisper-1
HAVE_SPEECH_TRANSCRIBER_API_KEY=sk-...
HAVE_SPEECH_TRANSCRIBER_TIMEOUT=60000          # milliseconds, per attempt
HAVE_SPEECH_TRANSCRIBER_MAX_BYTES=26214400     # optional
HAVE_SPEECH_TRANSCRIBER_HEADERS='{"x-bf-vk":"vk-..."}'  # optional JSON object
```

Headers merge in order environment, factory context, then explicit options (later wins per header). The `HAVE_SPEECH_STT_*` names below remain supported as fallbacks.

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

Optional overrides include `HAVE_SPEECH_STT_MODEL`, `STT_MODEL`, `STT_PATH`, `TTS_PATH`, `STT_API_KEY`, `TTS_API_KEY`, `SPEECH_API_KEY`, `STT_TIMEOUT_MS`, and `TTS_TIMEOUT_MS`.

## Testing

Default tests use tiny in-process HTTP fixture services or an injected `fetch` that mirror the Studio Server, Qwen3, and OpenAI-compatible request shapes. They validate field names, encodings, and response normalization without downloading production-scale models.

Docker or Testcontainers integration suites should run the fixture services or Studio Server with mock backends. Model-backed tests must remain opt-in, for example behind `HV_SPEECH_MODEL_TESTS=1`, so the normal SDK suite never downloads model weights.

On Apple Silicon, run model-backed Qwen tests with a host-native Metal/MLX runtime or against a remote cluster service; Docker contract tests should continue using mock backends because Linux containers do not expose the host Metal runtime.
