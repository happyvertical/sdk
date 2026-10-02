/** Server-only OpenAI conversational call lifecycle. Hosts own authorization and admission policy. */
import {
  SpeechConfigurationError,
  SpeechProviderError,
} from './shared/errors.js';
import type { StreamingTurnDetection } from './shared/streaming-types.js';
import type { SpeechFetch } from './shared/types.js';
import { isBrowserRuntime } from './shared/websocket.js';

export interface OpenAIVoiceCallOptions {
  apiKey: string;
  /** Fixed by the host, never copied from untrusted browser JSON. */
  model: string;
  voice?: string;
  instructions?: string;
  transcriptionModel?: string;
  turnDetection?: StreamingTurnDetection;
  maxOutputTokens?: number;
  tools?: Array<{
    type: 'function';
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  }>;
  baseUrl?: string;
  fetch?: SpeechFetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface OpenAIVoiceCall {
  answer: string;
  callId: string;
}

/** Build the GA speech-to-speech session config. Transcription is an optional side channel. */
export function openAIConversationConfig(
  options: Pick<
    OpenAIVoiceCallOptions,
    | 'model'
    | 'voice'
    | 'instructions'
    | 'transcriptionModel'
    | 'turnDetection'
    | 'maxOutputTokens'
    | 'tools'
  >,
): Record<string, unknown> {
  if (!options.model?.trim())
    throw new SpeechConfigurationError('Conversation model is required');
  const detection = options.turnDetection ?? {
    type: 'semantic_vad',
    eagerness: 'auto',
  };
  let turnDetection: Record<string, unknown> | null;
  switch (detection.type) {
    case 'manual':
      turnDetection = null;
      break;
    case 'semantic_vad':
      turnDetection = {
        type: 'semantic_vad',
        eagerness: detection.eagerness ?? 'auto',
        create_response: true,
        interrupt_response: true,
      };
      break;
    case 'server_vad':
      turnDetection = {
        type: 'server_vad',
        ...(detection.threshold === undefined
          ? {}
          : { threshold: detection.threshold }),
        ...(detection.prefixPaddingMs === undefined
          ? {}
          : { prefix_padding_ms: detection.prefixPaddingMs }),
        ...(detection.silenceDurationMs === undefined
          ? {}
          : { silence_duration_ms: detection.silenceDurationMs }),
        create_response: true,
        interrupt_response: true,
      };
      break;
    default:
      throw new SpeechConfigurationError('Unknown conversation turn detection');
  }
  return {
    type: 'realtime',
    model: options.model.trim(),
    output_modalities: ['audio'],
    ...(options.instructions ? { instructions: options.instructions } : {}),
    audio: {
      input: {
        turn_detection: turnDetection,
        ...(options.transcriptionModel
          ? { transcription: { model: options.transcriptionModel } }
          : {}),
      },
      output: { voice: options.voice ?? 'marin' },
    },
    ...(options.maxOutputTokens === undefined
      ? {}
      : { max_output_tokens: options.maxOutputTokens }),
    ...(options.tools ? { tools: options.tools } : {}),
  };
}

/** No retries: retrying call creation can create duplicate billable sessions. */
export async function createOpenAIVoiceCall(
  offer: string,
  options: OpenAIVoiceCallOptions,
): Promise<OpenAIVoiceCall> {
  assertServer(options);
  if (!validSdp(offer))
    throw new SpeechConfigurationError('Expected a bounded SDP offer');
  const body = new FormData();
  body.set('sdp', offer);
  body.set('session', JSON.stringify(openAIConversationConfig(options)));
  let callId: string | undefined;
  try {
    const response = await request(
      callBase(options.baseUrl),
      { body },
      options,
      (headers) => {
        const value = headers.get('location')?.split('/').pop();
        if (!value || !/^rtc_[A-Za-z0-9_-]+$/.test(value))
          throw new SpeechProviderError(
            'openai-conversation',
            'Call response did not contain a WebRTC call id',
          );
        // Capture identity before consuming a response body that can fail or time out.
        callId = value;
      },
    );
    const answer = await response.text();
    if (!validSdp(answer))
      throw new SpeechProviderError(
        'openai-conversation',
        'Call response did not contain a valid SDP answer',
      );
    options.signal?.throwIfAborted();
    return { answer, callId: callId! };
  } catch (error) {
    if (callId) {
      try {
        await hangupOpenAIVoiceCall(callId, { ...options, signal: undefined });
      } catch {
        throw new VoiceCallSetupError(callId);
      }
    }
    throw error;
  }
}

export type OpenAIVoiceCallControlOptions = Pick<
  OpenAIVoiceCallOptions,
  'apiKey' | 'baseUrl' | 'fetch' | 'signal' | 'timeoutMs'
>;

/** Hosts should call this on close, idle/hard timeout and failed client setup. */
export async function hangupOpenAIVoiceCall(
  callId: string,
  options: OpenAIVoiceCallControlOptions,
): Promise<void> {
  assertServer(options);
  if (!/^rtc_[A-Za-z0-9_-]+$/.test(callId))
    throw new SpeechConfigurationError('Invalid WebRTC call id');
  await request(`${callBase(options.baseUrl)}/${callId}/hangup`, {}, options);
}

function assertServer(options: OpenAIVoiceCallControlOptions): void {
  if (isBrowserRuntime())
    throw new SpeechConfigurationError(
      'Voice call management is server-only; never expose a provider key',
    );
  if (!options.apiKey?.trim())
    throw new SpeechConfigurationError(
      'Voice call management requires a server API key',
    );
  const timeout = options.timeoutMs ?? 15_000;
  if (!Number.isFinite(timeout) || timeout <= 0)
    throw new SpeechConfigurationError('timeoutMs must be positive');
}

function callBase(baseUrl = 'https://api.openai.com/v1'): string {
  const url = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new SpeechConfigurationError('Invalid voice call API base URL');
  url.pathname = `${url.pathname.replace(/\/$/, '')}${/\/v\d+$/.test(url.pathname.replace(/\/$/, '')) ? '' : '/v1'}/realtime/calls`;
  return url.toString();
}

function validSdp(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.length <= 65_536 &&
    value.startsWith('v=0') &&
    value.includes('m=audio')
  );
}

async function request(
  url: string,
  init: RequestInit,
  options: OpenAIVoiceCallControlOptions,
  onHeaders?: (headers: Headers) => void,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 15_000,
  );
  const signal = AbortSignal.any([
    controller.signal,
    ...(options.signal ? [options.signal] : []),
  ]);
  try {
    const response = await (options.fetch ?? fetch)(url, {
      ...init,
      method: 'POST',
      headers: { authorization: `Bearer ${options.apiKey}` },
      signal,
    });
    if (!response.ok)
      throw new SpeechProviderError(
        'openai-conversation',
        'OpenAI voice call request failed',
        { status: response.status },
      );
    onHeaders?.(response.headers);
    const body = await readBody(response, signal);
    return new Response(response.status === 204 ? null : body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    if (error instanceof SpeechProviderError) throw error;
    // Deliberately omit provider payloads and transport messages, which can contain credentials.
    throw new SpeechProviderError(
      'openai-conversation',
      signal.aborted
        ? 'OpenAI voice call request cancelled or timed out'
        : 'OpenAI voice call transport failed',
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Failed setup whose cleanup also failed. The host must reserve admission and retry termination. */
export class VoiceCallSetupError extends SpeechProviderError {
  constructor(readonly callId: string) {
    super(
      'openai-conversation',
      'Voice setup failed and termination needs retry',
    );
  }
}

async function readBody(
  response: Response,
  signal: AbortSignal,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536)
        throw new SpeechProviderError(
          'openai-conversation',
          'Voice call response exceeded its size limit',
        );
      chunks.push(value);
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(data);
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
