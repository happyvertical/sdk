import {
  createHappyVerticalSynthesisForm,
  HttpSpeechAdapter,
  readSynthesizedSpeechResponse,
  resolveSpeechUrl,
} from '../shared/http.js';
import {
  modelsUrlFor,
  type SpeechProbeOptions,
  type SpeechProbeResult,
} from '../shared/probe.js';
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

  /**
   * `GET` of the model list beside `speechPath` (`/v1/models` by default).
   * The model is not required to be listed: Qwen3 servers name it freely.
   */
  probe(options?: SpeechProbeOptions): Promise<SpeechProbeResult> {
    return this.probeEndpoint(
      {
        adapter: this.type,
        url: () =>
          modelsUrlFor(
            resolveSpeechUrl(this.baseUrl, this.speechPath),
            'audio/speech',
          ),
        listsModels: true,
      },
      options,
    );
  }
}
