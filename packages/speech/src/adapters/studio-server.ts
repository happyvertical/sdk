import {
  appendAudioInput,
  appendOptionalFormValue,
  createHappyVerticalSynthesisForm,
  HttpSpeechAdapter,
  readSynthesizedSpeechResponse,
  readTranscriptResponse,
} from '../shared/http.js';
import type {
  SpeechSynthesizer,
  StudioServerSpeechSynthesizerOptions,
  StudioServerTranscriberOptions,
  SynthesisRequest,
  SynthesizedSpeech,
  Transcriber,
  TranscriptionRequest,
  TranscriptResult,
} from '../shared/types.js';

export class StudioServerTranscriber
  extends HttpSpeechAdapter
  implements Transcriber
{
  readonly type = 'studio-server' as const;
  private readonly transcribePath: string;

  constructor(options: StudioServerTranscriberOptions) {
    super(options);
    this.transcribePath = options.transcribePath ?? '/v1/transcribe';
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptResult> {
    const form = new FormData();
    appendAudioInput(form, request.audio);
    appendOptionalFormValue(form, 'language', request.language);

    return this.post(
      this.type,
      this.transcribePath,
      {
        body: form,
        signal: request.signal,
      },
      (response) => readTranscriptResponse(response, this.type),
    );
  }
}

export class StudioServerSpeechSynthesizer
  extends HttpSpeechAdapter
  implements SpeechSynthesizer
{
  readonly type = 'studio-server' as const;
  private readonly synthesizePath: string;
  private readonly defaultVoice?: string;

  constructor(options: StudioServerSpeechSynthesizerOptions) {
    super(options);
    this.synthesizePath = options.synthesizePath ?? '/v1/tts/synthesize';
    this.defaultVoice = options.defaultVoice;
  }

  async synthesize(request: SynthesisRequest): Promise<SynthesizedSpeech> {
    const form = createHappyVerticalSynthesisForm(request, this.defaultVoice);

    return this.post(
      this.type,
      this.synthesizePath,
      {
        body: form,
        signal: request.signal,
      },
      (response) => readSynthesizedSpeechResponse(response, this.type),
    );
  }
}
