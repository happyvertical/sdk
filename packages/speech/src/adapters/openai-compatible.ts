import {
  compactJson,
  HttpSpeechAdapter,
  readSynthesizedSpeechResponse,
  resolveOpenAICompatibleUrl,
  voiceToString,
} from '../shared/http.js';
import type {
  OpenAICompatibleSpeechSynthesizerOptions,
  SpeechSynthesizer,
  SynthesisRequest,
  SynthesizedSpeech,
} from '../shared/types.js';

export class OpenAICompatibleSpeechSynthesizer
  extends HttpSpeechAdapter
  implements SpeechSynthesizer
{
  readonly type = 'openai-compatible' as const;

  /** Explicit override, resolved relative to `baseUrl` (or absolute). */
  private readonly speechPath?: string;
  private readonly defaultModel: string;
  private readonly defaultVoice: string;

  constructor(options: OpenAICompatibleSpeechSynthesizerOptions) {
    super(options);
    this.speechPath = options.speechPath;
    this.defaultModel = options.defaultModel ?? 'tts-1';
    this.defaultVoice = options.defaultVoice ?? 'alloy';
  }

  async synthesize(request: SynthesisRequest): Promise<SynthesizedSpeech> {
    const outputFormat = request.outputFormat ?? 'mp3';
    const payload = compactJson({
      model: request.model ?? this.defaultModel,
      input: request.text,
      voice: voiceToString(request.voice, this.defaultVoice),
      // biome-ignore lint/style/useNamingConvention: OpenAI-compatible API uses snake_case.
      response_format: outputFormat,
      speed: request.speed,
    });

    // Without an override, resolve the endpoint the way the transcriber does:
    // a server root gets `/v1/audio/speech`, a `/vN` API root gets
    // `/audio/speech`, and a full endpoint URL is used as-is. Resolved per
    // call so an invalid baseUrl still fails at synthesize time.
    const endpoint =
      this.speechPath ??
      resolveOpenAICompatibleUrl(this.baseUrl, 'audio/speech');

    const speech = await this.post(
      this.type,
      endpoint,
      {
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: request.signal,
      },
      (response) => readSynthesizedSpeechResponse(response, this.type),
    );

    return {
      ...speech,
      format: speech.format ?? outputFormat,
      model: speech.model ?? String(payload.model),
    };
  }
}
