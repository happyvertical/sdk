import {
  compactJson,
  HttpSpeechAdapter,
  readSynthesizedSpeechResponse,
  voiceToString,
} from '../shared/http.js';
import type {
  OpenAICompatibleSpeechSynthesizerOptions,
  Qwen3SpeechSynthesizerOptions,
  SpeechSynthesizer,
  SpeechSynthesizerType,
  SynthesisRequest,
  SynthesizedSpeech,
} from '../shared/types.js';

type OpenAICompatibleSpeechOptions =
  | OpenAICompatibleSpeechSynthesizerOptions
  | Qwen3SpeechSynthesizerOptions;

export class OpenAICompatibleSpeechSynthesizer
  extends HttpSpeechAdapter
  implements SpeechSynthesizer
{
  readonly type: Extract<
    SpeechSynthesizerType,
    'openai-compatible' | 'qwen3-tts'
  >;

  private readonly speechPath: string;
  private readonly defaultModel: string;
  private readonly defaultVoice: string;

  constructor(options: OpenAICompatibleSpeechOptions) {
    super(options);
    this.type = options.type;
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

    const response = await this.post(this.type, this.speechPath, {
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: request.signal,
    });
    const speech = await readSynthesizedSpeechResponse(response, this.type);

    return {
      ...speech,
      format: speech.format ?? outputFormat,
      model: speech.model ?? String(payload.model),
    };
  }
}

export class Qwen3SpeechSynthesizer extends OpenAICompatibleSpeechSynthesizer {
  constructor(options: Qwen3SpeechSynthesizerOptions) {
    super({
      ...options,
      type: 'qwen3-tts',
      defaultModel: options.defaultModel ?? 'qwen3-tts',
      defaultVoice: options.defaultVoice ?? 'default',
    });
  }
}
