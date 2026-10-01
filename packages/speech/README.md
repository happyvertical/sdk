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
| OpenAI Realtime STT (streaming) | `openai-realtime` | WebSocket | `<base>/realtime?intent=transcription` | JSON events, base64 PCM16/G.711 |
| On-device STT | `local` | In-process | `@happyvertical/speech/local` | 16 kHz mono PCM |
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

## Realtime (Streaming) Transcription

`getStreamingTranscriber()` opens WebSocket sessions that take raw audio as it is captured and emit partial and final transcripts. It sits alongside the request/response `Transcriber`; nothing about `getTranscriber()` changes for HTTP adapters.

`type: 'openai-realtime'` speaks the OpenAI Realtime API (GA) transcription session: `session.update` with `session.type: "transcription"`, `input_audio_buffer.append`/`commit`, and `conversation.item.input_audio_transcription.delta`/`completed`. It also fits local servers that imitate that protocol. See the [OpenAI realtime transcription guide](https://developers.openai.com/api/docs/guides/realtime-transcription).

```typescript
import { getStreamingTranscriber } from '@happyvertical/speech';

// Node: the API key travels in the Authorization header.
const streaming = getStreamingTranscriber({
  type: 'openai-realtime',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-transcribe',
  headers: { 'x-bf-vk': virtualKey }, // gateway routing (Node only)
  onUsage: (usage) => recordUsage(tenantId, usage),
});

const session = streaming.start({
  format: { encoding: 'pcm16', sampleRate: 24000, channels: 1 },
  language: 'en',
  turnDetection: { type: 'server_vad', silenceDurationMs: 500 },
});

session.on('partial', ({ text, itemId }) => showCaption(itemId, text));
session.on('final', ({ text, itemId }) => commitCaption(itemId, text));
session.on('error', (error) => console.error(error));

for await (const chunk of microphonePcm16) {
  await session.write(chunk); // resolves once the socket has drained
}

const result = await session.end(); // all finals joined, plus usage
```

- **Audio format.** Negotiated explicitly as `{ encoding, sampleRate, channels }`. The adapter never decodes or resamples. OpenAI accepts `pcm16` at 24 kHz mono (the default) and `g711_ulaw`/`g711_alaw` at 8 kHz mono; anything else throws `SpeechConfigurationError` before connecting.
- **Turn detection.** `server_vad` (default: the provider ends a turn after silence and emits one `final` per turn), `semantic_vad` (`eagerness`), or `manual` (nothing is transcribed until `session.commit()` or `end()`). Use `manual` for `gpt-live-transcribe`, which does not accept VAD; pass its `delay`/`languages` through `transcriptionOptions` (the typed `model`, `language`, and `prompt` win over the same keys there).
- **Events.** `open`, `partial` (`delta` plus the turn's text so far), `final`, `speech_started`, `speech_stopped`, `error` (once, fatal), and `close`. `on()` returns an unsubscribe function. A listener that throws fails the session, so the bug surfaces from `end()`.
- **Backpressure.** `write()` returns a promise that resolves after the chunk is handed to the socket and the socket's `bufferedAmount` is at or below `highWaterMark` (default 1 MiB). Writes are queued in order, including before the socket opens. A write that would queue more than `maxBufferedBytes` (default 16 MiB) of unsent audio rejects with code `SPEECH_BACKPRESSURE`. A socket that stays above `highWaterMark` for `timeoutMs` fails the session instead of leaving `write()` pending.
- **`end()`.** Flushes queued audio, commits whatever the provider has not committed, waits up to `timeoutMs` (default 30 s) for every pending turn's `final`, closes the socket, and resolves with `{ text, segments, durationSeconds, usage, raw }`. Finals are ordered by commit order. Under server VAD, a commit preceded by `speech_stopped` for the same item is treated as the provider's own, so it never stands in for the acknowledgement of the end commit. Calling it again returns the same promise.
- **Reconnect policy: none.** The provider holds the audio buffer and turn state, so a dropped socket cannot be resumed without losing or duplicating text. An unexpected close fails the session: queued audio is discarded, pending `write()` calls and `end()` reject with `SpeechProviderError` (including the close code), and `error` then `close` are emitted. Finals already emitted stay valid; start a new session to continue.
- **Timeouts and cancellation.** `connectTimeoutMs` (default 10 s) bounds token minting plus the handshake. `signal` or `session.abort()` fails the session immediately.
- **Errors.** Provider `error` events and failed turns are fatal and throw `SpeechProviderError` with the provider code in the message. An empty-buffer rejection of the final commit is tolerated. Credentials, including handshake header values such as `Authorization` or a gateway key, are redacted from surfaced provider text.
- **Usage.** `result.usage` and `onUsage` (adapter-level, then session-level) report the model, audio seconds (provider `usage.seconds` when present, otherwise computed from the bytes streamed), bytes streamed, and the provider usage blocks of all turns summed.

### Browsers

Long-lived API keys never belong in browser code: the adapter throws if `apiKey` or `headers` are set in a browser runtime. Mint a short-lived client secret on your server and pass it as `clientSecret`; it is sent as the `openai-insecure-api-key.<secret>` WebSocket subprotocol. Pass a function to mint a fresh secret per session:

```typescript
const streaming = getStreamingTranscriber({
  type: 'openai-realtime',
  clientSecret: async () => (await fetch('/api/realtime-token')).text(),
});
```

### Runtimes and custom sockets

The default socket is `globalThis.WebSocket` (Node 22+, browsers, Deno, Bun). Handshake headers are passed as `new WebSocket(url, { protocols, headers })`, which Node's built-in client supports. Inject another client with `WebSocket` (a constructor) or `createWebSocket(url, { protocols, headers })`, for example to use the `ws` package: `createWebSocket: (url, { protocols, headers }) => new WS(url, protocols, { headers })`.

### Record-then-send callers

`getTranscriber({ type: 'openai-realtime' })` wraps the streaming adapter as a normal `Transcriber`: each `transcribe()` opens a session with `manual` turn detection, streams the recording in 64 KiB chunks, and returns `session.end()`. Use `wrapStreamingTranscriber(streaming, { chunkBytes, maxBytes, turnDetection })` to wrap one you built yourself. Streaming-only settings go in `streaming`:

```typescript
const transcriber = await getTranscriber({
  type: 'openai-realtime',
  apiKey: process.env.OPENAI_API_KEY,
  streaming: { connectTimeoutMs: 5000 },
});

await transcriber.transcribe({ audio: wavBytes, mimeType: 'audio/wav' });
```

The input must be raw audio: a 16-bit PCM or G.711 WAV (the header sets the format), `audio/pcm` (little-endian) or `audio/L16` (big-endian per RFC 2586, byte-swapped before sending, so an odd byte length is rejected; both take optional `rate` and `channels` parameters, or `AudioInput.sampleRate`/`channels`), `audio/pcmu`, `audio/pcma`, or untyped bytes in the adapter default format. Compressed recordings such as `audio/webm` are rejected; send those to `openai-compatible` instead.

### Streaming environment configuration

Explicit options win over these variables:

```bash
HAVE_SPEECH_STREAMING_TYPE=openai-realtime        # default
HAVE_SPEECH_STREAMING_BASE_URL=wss://api.openai.com/v1/realtime  # or http://host:8000/v1
HAVE_SPEECH_STREAMING_MODEL=gpt-4o-transcribe
HAVE_SPEECH_STREAMING_API_KEY=sk-...
HAVE_SPEECH_STREAMING_LANGUAGE=en
HAVE_SPEECH_STREAMING_TURN_DETECTION=server_vad   # server_vad | semantic_vad | manual
HAVE_SPEECH_STREAMING_TIMEOUT=30000               # ms to wait for finals after end()
HAVE_SPEECH_STREAMING_CONNECT_TIMEOUT_MS=10000
HAVE_SPEECH_STREAMING_HEADERS='{"x-bf-vk":"vk-..."}'
```

A base URL may be `ws(s)://` or `http(s)://`: a server root gets `/v1/realtime`, a base ending in a version segment gets `/realtime`, and `intent=transcription` is added unless an `intent` is present. `HAVE_SPEECH_TRANSCRIBER_TYPE=openai-realtime` also routes `getTranscriber()` to the wrapped streaming adapter, which then reads `HAVE_SPEECH_STREAMING_*`.

## On-device Transcription

`type: 'local'` runs Whisper or Moonshine ONNX models on the device with [transformers.js](https://huggingface.co/docs/transformers.js). In a browser it uses WebGPU or WASM; in Node it uses onnxruntime-node. Audio never leaves the device, there is no API key or per-call cost, and once the model is cached it works offline.

The runtime is an **optional peer dependency** behind the `@happyvertical/speech/local` subpath. The core `@happyvertical/speech` entry never imports it, so apps that do not use local transcription neither install nor bundle it. The build checks this guarantee: `scripts/check-core-isolation.mjs` fails if the core entry can reach `@huggingface/transformers`.

```bash
pnpm add @happyvertical/speech @huggingface/transformers   # tested with 4.3.0
```

```typescript
import { getTranscriber } from '@happyvertical/speech';
import '@happyvertical/speech/local'; // registers type: 'local'

const transcriber = await getTranscriber({
  type: 'local',
  model: 'onnx-community/whisper-base', // default
  device: 'auto', // 'webgpu' | 'wasm' | 'cpu' | 'cuda' | 'dml' | 'coreml' | 'auto'
  dtype: 'q8', // or { encoder_model: 'fp32', decoder_model_merged: 'q4' }
  onProgress: (progress) => console.log(progress.status, progress.file, progress.progress),
});

const result = await transcriber.transcribe({
  audio: recordingBlob, // Blob | Buffer | Uint8Array | ArrayBuffer | ReadableStream
  mimeType: 'audio/webm;codecs=opus',
  language: 'en',
  timestampGranularities: ['segment'],
  signal: abortController.signal,
});
result.usage; // { operation, provider: 'local', model, audioSeconds, bytes }
```

You can also call `createLocalTranscriber(options)` from the subpath directly. It returns a `LocalTranscriber` with `preload()` and `dispose()`. `getAvailableSpeechAdapters()` lists `local` once the subpath has been imported. `isLocalTranscriberAvailable()` checks whether the peer can be imported.

- **Models.** Any transformers.js `automatic-speech-recognition` model id works. The default is `onnx-community/whisper-base` (multilingual, about 80 MB at `q8`). Smaller and faster choices are `onnx-community/whisper-tiny.en` (English), `onnx-community/moonshine-tiny-ONNX`, and `onnx-community/moonshine-base-ONNX`. For better accuracy, use `onnx-community/whisper-small` or `onnx-community/whisper-large-v3-turbo`. The first use downloads the weights; after that they load from cache. Call `preload()` with `onProgress` to show a download bar before the user records.
- **Devices.** With `device: 'auto'` (the default), a browser uses WebGPU when `navigator.gpu` returns an adapter and retries on WASM if WebGPU fails to initialise; Node uses `cpu`. WebGPU is available in current Chromium-based browsers, and in Safari and Firefox depending on version and platform. Without it, WASM still works, only more slowly. An explicit device never falls back. In Node, `cuda`/`dml`/`coreml` need the matching onnxruntime-node build.
- **Timestamps.** `timestampGranularities: ['segment']` maps Whisper chunks onto `segments`. `['word']` maps word timings onto `words`, and needs a model exported with cross attentions, such as `onnx-community/whisper-base_timestamped`. Moonshine returns text only. Audio longer than 30 s is chunked (`chunkLengthSeconds`, default 30, `0` disables chunking).
- **Audio decoding.** Input is decoded and resampled to 16 kHz mono Float32. WAV (PCM 8/16/24/32-bit, float, extensible) and raw `audio/pcm` (`audio/pcm;rate=24000;channels=1;encoding=s16le|f32le`, or `AudioInput.sampleRate`/`channels`) decode everywhere. Browsers decode other formats with `OfflineAudioContext.decodeAudioData`: MediaRecorder `audio/webm;codecs=opus`, Safari `audio/mp4`, MP3, and so on. Node has no `AudioContext`, so compressed formats need a `decodeAudio` hook, for example with ffmpeg:

  ```typescript
  decodeAudio: async ({ bytes }) => {
    const pcm = await runFfmpeg(['-i', 'pipe:0', '-f', 'f32le', '-ac', '1', '-ar', '16000', 'pipe:1'], bytes);
    return { samples: new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4), sampleRate: 16000 };
  }
  ```

- **Model storage.** Browsers cache weights in Cache Storage. In Node, set `cacheDir` (default: transformers.js's cache inside `node_modules`). `modelHost` points downloads at self-hosted weights. It sets the process-wide `env.remoteHost`, which uses the Hugging Face `{model}/resolve/{revision}/` layout. `configureEnv(env)` adjusts any other transformers.js setting, for example `localModelPath`, `allowRemoteModels: false` for fully offline use, or WASM thread counts. `revision` pins a model revision.
- **Cancellation.** `signal` rejects immediately with the abort reason, including while the model is loading, and interrupts Whisper/Moonshine generation at the next token. Calls on one transcriber run one at a time. `dispose()` waits for in-flight inference, then releases the ONNX sessions.
- **Errors.** If the peer is missing, the adapter throws `SpeechConfigurationError` with an install hint. Calling `getTranscriber({ type: 'local' })` without importing the subpath also throws `SpeechConfigurationError`. Model load and inference failures throw `SpeechProviderError`.
- **Limits.** `maxBytes` defaults to 25 MB of encoded input. Uncompressed WAV fills that faster (about 13 minutes at 16 kHz 16-bit mono), so raise it for long WAV recordings. Request fields `prompt`, `temperature`, `responseFormat`, and `headers` do not apply to local models.

### Web Worker

Inference can take seconds on long recordings, so in a browser run it in a worker to keep the UI responsive. `AudioContext` is not available in workers, so the main-thread client decodes and resamples the audio and then transfers the 16 kHz samples to the worker without copying:

```typescript
// transcriber.worker.ts
import { serveLocalTranscriber } from '@happyvertical/speech/local';

serveLocalTranscriber({ model: 'onnx-community/whisper-base', device: 'auto' });
```

```typescript
// main thread
import { LocalTranscriberWorkerClient } from '@happyvertical/speech/local';

const worker = new Worker(new URL('./transcriber.worker.ts', import.meta.url), { type: 'module' });
const transcriber = new LocalTranscriberWorkerClient(worker, { onProgress, onUsage });

await transcriber.preload(); // optional: download the model before recording
const { text } = await transcriber.transcribe({ audio: recordingBlob, signal });
```

Aborting a worker call rejects right away and interrupts generation inside the worker. Progress events are forwarded to `onProgress`. Usage reports the original encoded byte count.

### Local Environment Configuration

In Node, `getSpeech()`/`getTranscriber()` can select the local adapter from the environment once the subpath has been imported. Explicit options win:

```bash
HAVE_SPEECH_TRANSCRIBER_TYPE=local
HAVE_SPEECH_TRANSCRIBER_MODEL=onnx-community/whisper-base
HAVE_SPEECH_TRANSCRIBER_DEVICE=cpu
HAVE_SPEECH_TRANSCRIBER_DTYPE=q8
HAVE_SPEECH_TRANSCRIBER_CACHE_DIR=/var/cache/hv-models
HAVE_SPEECH_TRANSCRIBER_MODEL_HOST=https://models.example.com/
```

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

Default tests use tiny in-process HTTP fixture services or an injected `fetch` that mirror the Studio Server, Qwen3, and OpenAI-compatible request shapes, and an in-memory fake WebSocket for the realtime protocol. They validate field names, encodings, and response normalization without downloading production-scale models. Local transcriber tests inject a fake transformers.js module, so CI never downloads weights.

`src/__tests__/local-transcriber.smoke.test.ts` runs a real `onnx-community/whisper-tiny.en` model on onnxruntime-node. It is skipped unless `HV_SPEECH_MODEL_TESTS=1`:

```bash
HV_SPEECH_MODEL_TESTS=1 pnpm --filter @happyvertical/speech test local-transcriber.smoke
```

Docker or Testcontainers integration suites should run the fixture services or Studio Server with mock backends. Model-backed tests must remain opt-in, for example behind `HV_SPEECH_MODEL_TESTS=1`, so the normal SDK suite never downloads model weights.

On Apple Silicon, run model-backed Qwen tests with a host-native Metal/MLX runtime or against a remote cluster service; Docker contract tests should continue using mock backends because Linux containers do not expose the host Metal runtime.
