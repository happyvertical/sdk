import {
  compactJson,
  HttpSpeechAdapter,
  readSynthesizedSpeechResponse,
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

  private readonly speechPath: string;
  private readonly defaultModel: string;
  private readonly defaultVoice: string;

  constructor(options: OpenAICompatibleSpeechSynthesizerOptions) {
    super(options);
    this.speechPath = options.speechPath ?? '/v1/audio/speech';
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

    const speech = await this.post(
      this.type,
      this.speechPath,
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
