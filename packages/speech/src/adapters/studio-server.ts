import {
  appendAudioInput,
  appendOptionalFormValue,
  compactJson,
  HttpSpeechAdapter,
  readSynthesizedSpeechResponse,
  readTranscriptResponse,
  voiceToString,
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
    appendOptionalFormValue(form, 'model', request.model);
    appendOptionalFormValue(form, 'prompt', request.prompt);
    appendOptionalFormValue(form, 'temperature', request.temperature);
    appendOptionalFormValue(form, 'response_format', request.responseFormat);
    appendOptionalFormValue(form, 'sample_rate', request.audio.sampleRate);
    appendOptionalFormValue(form, 'channels', request.audio.channels);

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
  private readonly defaultVoice: string;

  constructor(options: StudioServerSpeechSynthesizerOptions) {
    super(options);
    this.synthesizePath = options.synthesizePath ?? '/v1/tts/synthesize';
    this.defaultVoice = options.defaultVoice ?? 'default';
  }

  async synthesize(request: SynthesisRequest): Promise<SynthesizedSpeech> {
    const payload = compactJson({
      text: request.text,
      voice: voiceToString(request.voice, this.defaultVoice),
      model: request.model,
      language: request.language,
      format: request.outputFormat,
      // biome-ignore lint/style/useNamingConvention: Studio Server API uses snake_case.
      sample_rate: request.sampleRate,
      speed: request.speed,
      pitch: request.pitch,
      // biome-ignore lint/style/useNamingConvention: Studio Server API uses snake_case.
      response_format: request.responseFormat,
      metadata: request.metadata,
    });

    return this.post(
      this.type,
      this.synthesizePath,
      {
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: request.signal,
      },
      (response) => readSynthesizedSpeechResponse(response, this.type),
    );
  }
}
