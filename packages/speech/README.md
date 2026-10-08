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
| Voxtral Realtime STT via vLLM (streaming) | `voxtral-realtime` | WebSocket | `<base>/realtime` | JSON events, base64 PCM16 16 kHz |
| Studio Server TTS | `studio-server` | `POST` | `/v1/tts/synthesize` | Multipart |
| Qwen3 TTS | `qwen3-tts` | `POST` | `/v1/audio/speech` | Multipart |
| OpenAI-compatible TTS | `openai-compatible` | `POST` | `<base>/audio/speech` | JSON |

The OpenAI-compatible TTS base URL resolves like the transcriber's: a server root (`http://gateway:8080`) gets `/v1/audio/speech`, a base ending in a version segment (`http://gateway/tts/v1`) gets `/audio/speech`, and a URL already ending in `/audio/speech` is used as-is. The query string is preserved and a fragment is dropped. An explicit `speechPath` skips this: it resolves relative to the base URL, or is used as-is when absolute.

## Browser playback and levels

`@happyvertical/speech/browser` plays server-synthesized bytes and reports a smoothed 0..1 RMS level from the audio element's Web Audio analyser. It never synthesizes speech or handles credentials. Start it from a user action, then use `onLevel` for a character jaw, visualizer, or caption timing surface.

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
- **`end()`.** Flushes queued audio, commits whatever the provider has not committed, waits for every pending turn's `final` (failing after `timeoutMs`, default 30 s, without any server message; every message restarts the timer, so a long clip that is still being transcribed is not cut off), closes the socket, and resolves with `{ text, segments, durationSeconds, usage, raw }`. Finals are ordered by commit order. Under server VAD, a commit preceded by `speech_stopped` for the same item is treated as the provider's own, so it never stands in for the acknowledgement of the end commit. Calling it again returns the same promise.
- **Reconnect policy: none.** The provider holds the audio buffer and turn state, so a dropped socket cannot be resumed without losing or duplicating text. An unexpected close fails the session: queued audio is discarded, pending `write()` calls and `end()` reject with `SpeechProviderError` (including the close code), and `error` then `close` are emitted. Finals already emitted stay valid; start a new session to continue.
- **Timeouts and cancellation.** `connectTimeoutMs` (default 10 s) bounds token minting plus the handshake. `signal` or `session.abort()` fails the session immediately.
- **Errors.** Provider `error` events and failed turns are fatal and throw `SpeechProviderError` with the provider code in the message. An empty-buffer rejection of the final commit is tolerated. Credentials (the API key, client secret, and supplied handshake header values such as `Authorization` or a gateway `x-bf-vk`) are redacted from surfaced provider text.
- **Usage.** `result.usage` and `onUsage` (adapter-level, then session-level) report the model, audio seconds (provider `usage.seconds` when present, otherwise computed from the bytes streamed), bytes streamed, and the provider usage blocks of all turns summed.

### Voxtral Realtime (vLLM)

`type: 'voxtral-realtime'` streams to Mistral's Voxtral Realtime models (for example `mistralai/Voxtral-Mini-4B-Realtime-2602`) served by vLLM at `/v1/realtime`. vLLM borrows OpenAI's event names, but its protocol differs, so it has its own adapter. The adapter was verified against vLLM's realtime source and a live server:

- Connect, then `session.update` with a top-level `model` (vLLM sends `session.created` but never acknowledges the update).
- A non-final `input_audio_buffer.commit` starts generation; the adapter sends it before each turn's first audio.
- `input_audio_buffer.append` carries base64 PCM16 at **16 kHz mono**, the only accepted format. Write whole samples (even byte counts).
- vLLM streams `transcription.delta` events while audio arrives (the adapter drops the many empty ones) and transcribes at roughly real-time speed.
- `input_audio_buffer.commit` with `final: true` ends the turn, and vLLM answers with `transcription.done` (`{ text, usage }`, token counts only).

```typescript
const streaming = getStreamingTranscriber({
  type: 'voxtral-realtime',
  baseUrl: 'http://vllm.internal:8000', // or a gateway's /v1 root
  model: 'voxtral-mini-4b-realtime', // whatever vLLM serves (--served-model-name)
  apiKey: process.env.VLLM_API_KEY, // optional; Authorization: Bearer (Node only)
});

const session = streaming.start(); // pcm16, 16 kHz, mono
session.on('partial', ({ text }) => showCaption(text));
for await (const chunk of microphonePcm16At16k) await session.write(chunk);
const { text, usage } = await session.end();
```

- **Turns are manual.** vLLM has no voice-activity detection: partials stream continuously and you get one `final` per `session.commit()` or `end()`. `server_vad`/`semantic_vad` throw `SpeechConfigurationError`. After `commit()`, the session holds later audio until vLLM finishes the turn, because vLLM clears its buffer at the end of each turn. It then opens the next turn on the same socket, so no audio is lost. The hold, like `end()`, fails only after `timeoutMs` without any server message. `end()` without any uncommitted audio sends nothing.
- **Turn length and automatic rollover.** A turn's audio and generated tokens share the model context (`max_model_len`). Voxtral Mini Realtime spends about 12.5 tokens per second of audio, plus a 39-token prompt. With `max_model_len` 4096, a 322-second turn completed. A 352-second turn made vLLM report `error` `processing_error` ("EngineCore encountered an issue"), and on the vLLM build tested it also took the engine down until the server restarted. The limit applies to each turn, not the session: vLLM clears the context after each final commit. So the adapter caps turns at `maxTurnSeconds` (default **270**) and, by default, rolls over to a new turn before the cap. A session that never calls `commit()` (a long dictation, say) can run indefinitely. See [Turn limits and automatic rollover](#turn-limits-and-automatic-rollover).
- **Fail-closed turn checks.** If vLLM ever sends `transcription.done` for a turn that was not committed, the session emits that `final` and then fails with `SpeechProviderError`. A final commit crossing such a `done` would leave vLLM a stale end-of-turn marker, which ends the next turn at once and silently drops its audio (verified live by sending a stray final commit). The adapter detects that audio-less turn (`usage.prompt_tokens` of 1; any audio costs 39) and fails the session too. Start a new session to continue.
- **Not sent:** `language` and `prompt`, because vLLM's realtime session accepts only `model`.
- **Errors.** vLLM reports problems as `{ type: 'error', error, code }` (for example `model_not_found`, `invalid_audio`) and keeps the socket open. The adapter treats them as fatal.
- **Usage.** `providerUsage` holds vLLM's token counts summed over turns. `audioSeconds` comes from the bytes streamed.
- `getTranscriber({ type: 'voxtral-realtime', baseUrl })` works for record-then-send callers with a 16 kHz PCM16 WAV or `audio/pcm;rate=16000`. A clip longer than `maxTurnSeconds` is split into rollover turns, never sent as one turn.

### Turn limits and automatic rollover

Some providers cap the audio of a single turn. A session with a turn limit measures the current turn from the bytes written and the negotiated format (sample rate × channels × bytes per sample), counting audio still queued as well as audio sent.

```typescript
const streaming = getStreamingTranscriber({
  type: 'voxtral-realtime',
  baseUrl: 'http://vllm.internal:8000',
  maxTurnSeconds: 270, // default for voxtral-realtime
  rollover: { windowSeconds: 15, silenceThreshold: 0.01, minSilenceMs: 300 }, // defaults
});
```

- **Rollover (default).** Starting `windowSeconds` before the cap, the session looks for `minSilenceMs` of quiet audio: consecutive 20 ms frames whose RMS level is below `silenceThreshold` (0 to 1 of full scale; `0.01` is about -40 dBFS). This is a plain energy check, not a voice-activity model, and it works for PCM16 and G.711. The session commits the turn as soon as it finds such a stretch. If none turns up, it cuts at the cap itself, splitting a write if needed. The turn's transcript arrives as a normal `final` event. The next turn opens on the same socket, and audio written meanwhile is held, never dropped, until the provider finishes the turn. `end()` joins every turn, as it does for manual commits. A manual `commit()` also ends the turn, which restarts the count.
- **Hard cap (`rollover: false`).** No automatic commits. A `write()` that would push the turn past the cap rejects with a `SpeechError` with code `SPEECH_TURN_TOO_LONG`. That error is not fatal: the session stays open, so call `commit()` and keep writing.
- **Record-then-send.** `getTranscriber()` and `wrapStreamingTranscriber()` stream an oversize clip as several rollover turns, or, with `rollover: false`, reject it with `SPEECH_TURN_TOO_LONG` before connecting.
- **Which sessions.** `voxtral-realtime` enables the limit by default. `openai-realtime` has no default, because server VAD ends its turns. Its `manual` sessions can opt in by setting `maxTurnSeconds`, and a limit is ignored under `server_vad` or `semantic_vad`. OpenAI rejects a commit with less than 100 ms of audio, so in a session with a turn limit a shorter non-empty turn (such as the tail after a rollover) is padded with silence to 100 ms before it is committed. The padding is not counted in `usage.bytes` or `durationSeconds`. A `maxTurnSeconds` below that minimum throws `SpeechConfigurationError`, because the padding would exceed it. `maxTurnSeconds: Infinity` removes the limit. `streaming.turnLimit(sessionOptions)` reports the limit a session would use: `{ maxTurnSeconds, rollover, maxTurnBytes }`.
- **Precedence.** `start()` options, then adapter options, then `HAVE_SPEECH_STREAMING_MAX_TURN_SECONDS`, then the adapter default. `rollover` tuning merges field by field across those layers, so `start({ rollover: true })` keeps the adapter's `windowSeconds`. Custom realtime protocols declare their default as `RealtimeProtocol.maxTurnSeconds`.

### Browsers and per-tenant tokens

Long-lived API keys never belong in browser code. The adapters throw if `apiKey` or `headers` are set in a browser runtime, and they refuse a browser `clientSecret` that looks like a long-lived `sk-…` key. Mint a short-lived credential per tenant session on your server with `createStreamingClientSecret()`, and send the browser only `value` and `expiresAt`:

```typescript
// Server route, after your own auth check.
import { createStreamingClientSecret } from '@happyvertical/speech';

const secret = await createStreamingClientSecret({
  type: 'openai-realtime',
  apiKey: process.env.OPENAI_API_KEY, // or HAVE_SPEECH_STREAMING_API_KEY
  tenantId: tenant.id,
  sessionId: dictation.id,
  ttlSeconds: 60, // default; 10-7200
  model: 'gpt-4o-transcribe',
  language: 'en',
  headers: { 'x-bf-vk': tenant.virtualKey }, // optional gateway attribution
});
await usageLedger.recordMint(secret.tenantId, secret.sessionId, secret.expiresAt);
return { clientSecret: secret.value, expiresAt: secret.expiresAt };
```

```typescript
// Browser: mint a fresh secret per session; it travels as the
// `openai-insecure-api-key.<secret>` WebSocket subprotocol.
const streaming = getStreamingTranscriber({
  type: 'openai-realtime',
  clientSecret: async () =>
    (await (await fetch('/api/realtime-token')).json()).clientSecret,
});
```

- **OpenAI.** The helper calls `POST /v1/realtime/client_secrets` with `expires_after: { anchor: 'created_at', seconds: ttlSeconds }` and a `session.type: "transcription"` config built from the same options as the adapter. The result is an `ek_…` secret bound to that config. The browser uses it to open the socket, so keep the TTL short: mint one per session, and a leaked secret expires quickly.
- **Attribution.** OpenAI's transcription client secrets have no tenant or metadata field. `tenantId`, `sessionId`, and `metadata` are echoed in the result for your own usage ledger and never sent to the provider. For provider-side attribution, mint with a per-tenant project key or a gateway virtual key in `headers`. Pair the mint record with the session's `onUsage` report.
- **Voxtral / vLLM.** vLLM has no ephemeral-token mechanism, so `createStreamingClientSecret({ type: 'voxtral-realtime' })` throws `SpeechConfigurationError` rather than exposing the server key. Browser Voxtral needs your own proxy or token gateway in front of vLLM: it validates the short-lived tokens it minted and connects upstream with the real key. The adapter sends a browser `clientSecret` as `['realtime', 'openai-insecure-api-key.<secret>']` subprotocols, so the gateway must read the token there and echo `realtime`. Without a `clientSecret`, no subprotocol is offered, as plain vLLM expects.
- `createStreamingClientSecret()` itself throws in a browser runtime.

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

A clip longer than the adapter's `maxTurnSeconds` is split into rollover turns, or rejected with `SPEECH_TURN_TOO_LONG` before connecting when `rollover: false` (see [Turn limits and automatic rollover](#turn-limits-and-automatic-rollover)).

The input must be raw audio: a 16-bit PCM or G.711 WAV (the header sets the format), `audio/pcm` (little-endian) or `audio/L16` (big-endian per RFC 2586, byte-swapped before sending, so an odd byte length is rejected; both take optional `rate` and `channels` parameters, or `AudioInput.sampleRate`/`channels`), `audio/pcmu`, `audio/pcma`, or untyped bytes in the adapter default format. Compressed recordings such as `audio/webm` are rejected; send those to `openai-compatible` instead.

### Streaming environment configuration

Explicit options win over these variables:

```bash
HAVE_SPEECH_STREAMING_TYPE=openai-realtime        # default; or voxtral-realtime
HAVE_SPEECH_STREAMING_BASE_URL=wss://api.openai.com/v1/realtime  # or http://host:8000/v1
HAVE_SPEECH_STREAMING_MODEL=gpt-4o-transcribe
HAVE_SPEECH_STREAMING_API_KEY=sk-...
HAVE_SPEECH_STREAMING_LANGUAGE=en
HAVE_SPEECH_STREAMING_TURN_DETECTION=server_vad   # server_vad | semantic_vad | manual
HAVE_SPEECH_STREAMING_TIMEOUT=30000               # ms of provider silence tolerated after end()
HAVE_SPEECH_STREAMING_CONNECT_TIMEOUT_MS=10000
HAVE_SPEECH_STREAMING_HEADERS='{"x-bf-vk":"vk-..."}'
HAVE_SPEECH_STREAMING_MAX_TURN_SECONDS=270        # per-turn cap; Infinity removes it (voxtral default 270)
```

A base URL may be `ws(s)://` or `http(s)://`: a server root gets `/v1/realtime`, a base ending in a version segment gets `/realtime`, and for `openai-realtime` `intent=transcription` is added unless an `intent` is present. `voxtral-realtime` requires a base URL. `createStreamingClientSecret()` reads the same `TYPE`, `BASE_URL` (mapped to `…/v1/realtime/client_secrets`), `API_KEY`, `MODEL`, `LANGUAGE`, `TURN_DETECTION`, `TIMEOUT`, and `HEADERS` variables. `HAVE_SPEECH_TRANSCRIBER_TYPE=openai-realtime` also routes `getTranscriber()` to the wrapped streaming adapter, which then reads `HAVE_SPEECH_STREAMING_*`.

## Capturing audio for the realtime transcribers

`voxtral-realtime` and `openai-realtime` take raw 16-bit little-endian mono PCM (raw, or in a WAV) at one exact rate and reject compressed containers such as the webm/ogg a browser's `MediaRecorder` produces. `transcriberInputFormat(type)` says what to record:

| Type | Input |
| --- | --- |
| `voxtral-realtime` | `{ kind: 'pcm16', sampleRate: 16000, channels: 1 }` |
| `openai-realtime` | `{ kind: 'pcm16', sampleRate: 24000, channels: 1 }` (the default `audio/pcm` format; G.711 is an explicit adapter option) |
| `studio-server`, `openai-compatible`, `local` | `{ kind: 'compressed' }` (any container the backend or platform decodes) |

Three entry points, none of which loads Node-only code:

- `@happyvertical/speech` exports `transcriberInputFormat` and `TranscriberInputFormat`.
- `@happyvertical/speech/pcm` (browser, workers, Node): `encodeWavPcm16(samples, sampleRate)`, `parseWavPcm16(bytes, { sampleRate?, channels? })`, `resampleMono(samples, fromRate, toRate)`, `float32ToPcm16`, `pcm16ToFloat32`, and `WavFormatError` (stable `reason`).
- `@happyvertical/speech/browser` (SSR-safe to import): `createPcmCapture(stream, { sampleRate, maxDurationMs })`, `pcmCaptureSupported()`, and `PcmCaptureError`.

`parseWavPcm16` is strict because it reads untrusted bytes. It rejects, with `WavFormatError`, anything that is not a well-formed RIFF/WAVE with `fmt ` before `data`, format tag 1 (or `WAVE_FORMAT_EXTENSIBLE` whose subtype GUID is PCM), 16 bits, a consistent block align and byte rate, a non-empty data chunk that is a whole number of frames, and any declared size (RIFF, chunk or data) that exceeds the buffer. Nothing is clamped, nothing is allocated from a declared size, and work is linear in the input. It returns `{ sampleRate, channels, frames, durationMs, samples, data }`.

`resampleMono` is a windowed-sinc (Hann, 16 zero crossings per side) interpolator. Downsampling low-passes at 95% of the target Nyquist first, so a 12 kHz tone does not alias when going 48 kHz to 16 kHz. It is built for speech recognition, not mastering, and output length is `floor(n * to / from)`, capped at 2^28 samples.

`createPcmCapture` uses `AudioContext` + `AudioWorklet` (worklet inlined via a Blob URL, no bundler setup), mixes all channels to mono, drops audio past `maxDurationMs` (`truncated: true`, optional `onLimit`), and on `stop()` or `cancel()` disconnects the nodes, closes the context and revokes the Blob URL. You keep ownership of the `MediaStream` and its tracks.

```typescript
import { createPcmCapture } from '@happyvertical/speech/browser';
import { transcriberInputFormat } from '@happyvertical/speech';

const format = transcriberInputFormat('voxtral-realtime');
if (format.kind !== 'pcm16') throw new Error('expected a raw PCM transcriber');
const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
const capture = createPcmCapture(mic, { sampleRate: format.sampleRate, maxDurationMs: 30_000 });
// ...on release:
const { wav } = await capture.stop(); // mono 16-bit WAV at format.sampleRate
for (const track of mic.getTracks()) track.stop();
await fetch('/transcribe', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav });
```

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

Inference can take seconds on long recordings, so in a browser run it in a worker to keep the UI responsive. The main-thread client transfers WAV and raw PCM bytes to the worker, which parses, downmixes, and resamples them there. `AudioContext` is not available in workers, so other formats (MediaRecorder WebM/Opus, Safari `audio/mp4`, MP3) are decoded on the main thread with `decodeAudioData` or the client's `decodeAudio` hook, and the decoded channels are transferred to the worker for downmixing and resampling. Without either, the bytes go to the worker's own `decodeAudio`:

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

Aborting a worker call rejects right away and interrupts generation inside the worker. `close()` rejects in-flight calls (including ones still decoding) and every later call, and aborts posted work in the worker; it does not terminate the worker. Progress events are forwarded to `onProgress`. Usage reports the original encoded byte count.

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

Default tests use tiny in-process HTTP fixture services or an injected `fetch` that mirror the Studio Server, Qwen3, and OpenAI-compatible request shapes, and an in-memory fake WebSocket for the realtime protocols (scripted to OpenAI's documented event sequence and to the sequence recorded from a live vLLM server). They validate field names, encodings, and response normalization without downloading production-scale models. Local transcriber tests inject a fake transformers.js module, so CI never downloads weights.

`src/__tests__/local-transcriber.smoke.test.ts` runs a real `onnx-community/whisper-tiny.en` model on onnxruntime-node. It is skipped unless `HV_SPEECH_MODEL_TESTS=1`:

```bash
HV_SPEECH_MODEL_TESTS=1 pnpm --filter @happyvertical/speech test local-transcriber.smoke
```

`src/__tests__/voxtral-realtime.live.test.ts` is an opt-in live check against a real vLLM server, skipped unless `HAVE_SPEECH_STREAMING_LIVE=1` and `HAVE_SPEECH_STREAMING_BASE_URL` are set. It also reads `HAVE_SPEECH_STREAMING_API_KEY`, `HAVE_SPEECH_STREAMING_MODEL`, and `HAVE_SPEECH_STREAMING_LIVE_AUDIO` (a 16 kHz mono PCM16 file containing speech).

Docker or Testcontainers integration suites should run the fixture services or Studio Server with mock backends. Model-backed tests must remain opt-in, for example behind `HV_SPEECH_MODEL_TESTS=1`, so the normal SDK suite never downloads model weights.

On Apple Silicon, run model-backed Qwen tests with a host-native Metal/MLX runtime or against a remote cluster service; Docker contract tests should continue using mock backends because Linux containers do not expose the host Metal runtime.

## Conversational voice (OpenAI WebRTC)

`@happyvertical/speech/conversation` is an optional browser-safe speech-to-speech session API. It is separate from `getStreamingTranscriber()`: transcription sessions recognize audio, while conversational sessions also generate replies and audio. Existing STT/TTS entry points remain compatible.

```typescript
import { createOpenAIWebRTCVoiceSession } from '@happyvertical/speech/conversation';

const voice = createOpenAIWebRTCVoiceSession({
  getMicrophone: () => navigator.mediaDevices.getUserMedia({ audio: true }),
  negotiate: async (offer, signal) => {
    const response = await fetch('/api/voice/call', { method: 'POST', body: offer, signal });
    if (!response.ok) throw new Error('Voice unavailable');
    return response.text();
  },
});
voice.on('transcript', (turn) => renderTurn(turn)); // upsert by itemId
voice.on('speaking', (active) => animatePlayback(active));
await voice.connect();
voice.sendText('What can you help me with?');
// voice.interrupt(); voice.setMicMuted(true); voice.setOutputMuted(true);
voice.close();
```

The host server imports `createOpenAIVoiceCall` and `hangupOpenAIVoiceCall` from `@happyvertical/speech/conversation/server`. Call creation accepts the SDP offer and a server-owned model, voice (default `marin`), instructions, optional transcription model, turn detection and tools. It returns `{ answer, callId }`; return only the answer to the browser and retain the call id for termination. The browser never receives a long-lived provider key. Optional server helpers are not reachable from the browser conversation entry or the core entry.

The host owns authorization, tenant/session attribution, origin checks, request/admission limits, idle/hard timeouts and server-side termination. Configuration sent at creation is not an immutable authorization boundary: an untrusted WebRTC client can send protocol events. Use provider spend controls and server-side monitoring when enforcing call policy. Never expose privileged tools to an anonymous client. Creating a call is not automatically retried because a retry may create another billable session. Setup failures after call identification trigger hangup; if that cleanup also fails, `VoiceCallSetupError.callId` provides the server recovery handle. Keep its admission slot reserved and retry termination.

A session takes ownership of the stream returned by `getMicrophone`, including stopping tracks returned after cancellation. `connect()` coalesces pending requests; closed/failed sessions are terminal. `close()` releases playback, tracks, peer/data channel and listeners. The host must separately end its server call lease, including on client negotiation failure. Connection timeout includes permission acquisition; a late permission grant is cleaned up. Microphone track termination (revoked permission or a lost input device) and unexpected channel/peer loss fail the session; create a new session and explicitly restore only completed history rather than replaying unacknowledged audio.

Transcript events contain `itemId`, `role`, full accumulated `text` and `final`. Final transcripts are deduplicated. Input transcription is an optional asynchronous side channel and does not drive model replies. `speaking` follows WebRTC output-buffer playback events, while `response` describes generation. Muting input disables tracks and clears buffered input; muting output silences playback independently. `commitInput()` commits microphone audio and requests a response when turn detection is manual (`commitInput(false)` commits without a reply). `interrupt()` cancels active generation and clears queued playback; OpenAI WebRTC handles interruption history truncation. A typed turn or `respond()` request received during an active response waits for terminal `response.done`; multiple typed turns coalesce into one next response while retaining every conversation item. A provider error correlated to the pending `response.create` clears that speculative active state and releases queued work; other provider errors leave the active response unchanged. Submit every function output with `submitToolResult`, then call `respond()` once after generation has finished and all tools have resolved; output submission does not create a reply. Incomplete replies and failed input transcription also emit recoverable `error` events without provider payloads. Recoverable provider/playback errors emit `error`; callers should show an actionable status. No raw audio is retained by this adapter.

Protocol reference: [OpenAI WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc), [server controls](https://developers.openai.com/api/docs/guides/voice-server-controls). Real media behavior still requires browser QA; deterministic transport tests do not prove microphone permissions or echo cancellation.
