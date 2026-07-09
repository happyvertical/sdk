import {
  createHappyVerticalSynthesisForm,
  HttpSpeechAdapter,
  readSynthesizedSpeechResponse,
} from '../shared/http.js';
import type {
  Qwen3SpeechSynthesizerOptions,
  SpeechSynthesizer,
  SynthesisRequest,
  SynthesizedSpeech,
} from '../shared/types.js';

export class Qwen3SpeechSynthesizer
  extends HttpSpeechAdapter
  implements SpeechSynthesizer
{
  readonly type = 'qwen3-tts' as const;

  private readonly speechPath: string;
  private readonly defaultModel: string;
  private readonly defaultVoice?: string;

  constructor(options: Qwen3SpeechSynthesizerOptions) {
    super(options);
    this.speechPath = options.speechPath ?? '/v1/audio/speech';
    this.defaultModel = options.defaultModel ?? 'qwen3-tts';
    this.defaultVoice = options.defaultVoice;
  }

  async synthesize(request: SynthesisRequest): Promise<SynthesizedSpeech> {
    const form = createHappyVerticalSynthesisForm(request, this.defaultVoice);
    const speech = await this.post(
      this.type,
      this.speechPath,
      {
        body: form,
        signal: request.signal,
      },
      (response) => readSynthesizedSpeechResponse(response, this.type),
    );

    return {
      ...speech,
      format: speech.format ?? request.outputFormat,
      model: speech.model ?? request.model ?? this.defaultModel,
    };
  }
}
