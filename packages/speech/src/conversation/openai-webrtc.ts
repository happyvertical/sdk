import {
  SpeechConfigurationError,
  SpeechProviderError,
} from '../shared/errors.js';
import type {
  OpenAIWebRTCVoiceOptions,
  VoiceSession,
  VoiceSessionEvents,
  VoiceSessionState,
  VoiceTranscript,
} from './types.js';

const ADAPTER = 'openai-conversation';

/** Browser WebRTC transport. No credentials, Node dependencies or globals are read at import. */
export function createOpenAIWebRTCVoiceSession(
  options: OpenAIWebRTCVoiceOptions,
): VoiceSession {
  let state: VoiceSessionState = 'idle';
  let pending: Promise<void> | undefined;
  let peer: RTCPeerConnection | undefined;
  let channel: RTCDataChannel | undefined;
  let microphone: MediaStream | undefined;
  let audio: HTMLAudioElement | undefined;
  let micMuted = options.micMuted ?? false;
  let outputMuted = options.outputMuted ?? false;
  let responseId: string | undefined;
  let responseActive = false;
  let speaking = false;
  const abort = new AbortController();
  const listeners = new Map<
    keyof VoiceSessionEvents,
    Set<(value: never) => void>
  >();
  const turns = new Map<string, VoiceTranscript>();
  const disposers: (() => void)[] = [];

  function emit<E extends keyof VoiceSessionEvents>(
    event: E,
    value: VoiceSessionEvents[E],
  ): void {
    for (const listener of listeners.get(event) ?? []) listener(value as never);
  }
  function change(next: VoiceSessionState): void {
    state = next;
    emit('state', next);
  }
  function playback(value: boolean): void {
    if (speaking === value) return;
    speaking = value;
    emit('speaking', value);
  }
  function cleanup(): void {
    abort.abort();
    for (const dispose of disposers.splice(0)) dispose();
    microphone?.getTracks().forEach((track) => {
      track.stop();
    });
    microphone = undefined;
    if (channel) {
      channel.onopen =
        channel.onmessage =
        channel.onclose =
        channel.onerror =
          null;
      channel.close();
    }
    if (peer) {
      peer.ontrack = peer.onconnectionstatechange = null;
      peer.close();
    }
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
    playback(false);
    responseActive = false;
    turns.clear();
  }
  function fail(message: string): void {
    if (state === 'closed' || state === 'failed') return;
    state = 'failed';
    cleanup();
    emit('state', state);
    emit('error', new SpeechProviderError(ADAPTER, message));
  }
  function send(event: Record<string, unknown>): void {
    if (state !== 'connected' || channel?.readyState !== 'open')
      throw new SpeechConfigurationError(
        'Voice session is not connected',
        ADAPTER,
      );
    channel.send(JSON.stringify(event));
  }
  function transcript(
    itemId: unknown,
    role: VoiceTranscript['role'],
    text: unknown,
    final: boolean,
    delta = false,
  ): void {
    if (typeof itemId !== 'string' || typeof text !== 'string') return;
    const prior = turns.get(itemId);
    // Late duplicates/deltas must not overwrite a final turn or its role.
    if (prior?.final || (prior && prior.role !== role)) return;
    const turn = {
      itemId,
      role,
      text: delta ? (prior?.text ?? '') + text : text,
      final,
    };
    turns.set(itemId, turn);
    emit('transcript', turn);
  }
  function receive(data: unknown): void {
    let event: Record<string, unknown>;
    try {
      const parsed: unknown =
        typeof data === 'string' ? JSON.parse(data) : data;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return;
      event = parsed as Record<string, unknown>;
    } catch {
      return;
    }
    switch (event.type) {
      case 'conversation.item.input_audio_transcription.delta':
        transcript(event.item_id, 'user', event.delta, false, true);
        break;
      case 'conversation.item.input_audio_transcription.completed':
        transcript(event.item_id, 'user', event.transcript, true);
        break;
      case 'conversation.item.input_audio_transcription.failed':
        emit(
          'error',
          new SpeechProviderError(ADAPTER, 'Input transcription failed'),
        );
        break;
      case 'response.output_audio_transcript.delta':
        transcript(event.item_id, 'assistant', event.delta, false, true);
        break;
      case 'response.output_audio_transcript.done':
        transcript(event.item_id, 'assistant', event.transcript, true);
        break;
      case 'response.output_text.delta':
        transcript(event.item_id, 'assistant', event.delta, false, true);
        break;
      case 'response.output_text.done':
        transcript(event.item_id, 'assistant', event.text, true);
        break;
      case 'input_audio_buffer.speech_started':
        emit('inputSpeech', true);
        break;
      case 'input_audio_buffer.speech_stopped':
        emit('inputSpeech', false);
        break;
      case 'output_audio_buffer.started':
        playback(!outputMuted);
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        playback(false);
        break;
      case 'response.created': {
        const response = record(event.response);
        responseId = typeof response.id === 'string' ? response.id : undefined;
        responseActive = true;
        emit('response', { active: true, responseId });
        break;
      }
      case 'response.done': {
        const response = record(event.response);
        responseActive = false;
        emit('response', { active: false, responseId });
        if (response.usage && typeof response.usage === 'object')
          emit('usage', record(response.usage));
        if (response.status === 'failed' || response.status === 'incomplete')
          emit(
            'error',
            new SpeechProviderError(
              ADAPTER,
              response.status === 'incomplete'
                ? 'Voice response incomplete'
                : 'Voice response failed',
            ),
          );
        break;
      }
      case 'response.function_call_arguments.done':
        if (
          typeof event.call_id === 'string' &&
          typeof event.name === 'string' &&
          typeof event.arguments === 'string'
        )
          emit('toolCall', {
            callId: event.call_id,
            name: event.name,
            arguments: event.arguments,
          });
        break;
      case 'error':
        emit(
          'error',
          new SpeechProviderError(
            ADAPTER,
            'Realtime provider rejected a conversation event',
          ),
        );
        break;
    }
  }

  const session: VoiceSession = {
    get state() {
      return state;
    },
    connect() {
      if (pending) return pending;
      if (state === 'connected') return Promise.resolve();
      if (state !== 'idle')
        return Promise.reject(
          new SpeechConfigurationError(
            'Create a new voice session after close or failure',
            ADAPTER,
          ),
        );
      const timeoutMs = options.connectTimeoutMs ?? 20_000;
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
        return Promise.reject(
          new SpeechConfigurationError(
            'connectTimeoutMs must be positive',
            ADAPTER,
          ),
        );
      change('connecting');
      const signal = AbortSignal.any([
        abort.signal,
        ...(options.signal ? [options.signal] : []),
      ]);
      pending = (async () => {
        const timeout = setTimeout(
          () => fail('Voice connection timed out'),
          timeoutMs,
        );
        const onAbort = () => {
          if (state !== 'closed' && state !== 'failed')
            fail('Voice connection cancelled');
        };
        signal.addEventListener('abort', onAbort, { once: true });
        disposers.push(() => signal.removeEventListener('abort', onAbort));
        try {
          signal.throwIfAborted();
          // Permission acquisition cannot be aborted; dispose even if it resolves after close.
          const acquisition = options.getMicrophone().then((stream) => {
            if (signal.aborted)
              stream.getTracks().forEach((track) => {
                track.stop();
              });
            return stream;
          });
          const stream = await abortable(acquisition, signal);
          signal.throwIfAborted();
          microphone = stream;
          stream.getAudioTracks().forEach((track) => {
            track.enabled = !micMuted;
            const ended = () =>
              fail('Microphone ended; allow access and start a new session');
            track.addEventListener('ended', ended);
            disposers.push(() => track.removeEventListener('ended', ended));
            if (track.readyState === 'ended')
              throw new SpeechConfigurationError(
                'Microphone stream has ended',
                ADAPTER,
              );
          });
          if (!stream.getAudioTracks().length)
            throw new SpeechConfigurationError(
              'Microphone stream has no audio tracks',
              ADAPTER,
            );
          peer = options.createPeerConnection?.() ?? new RTCPeerConnection();
          audio = options.audio ?? new Audio();
          audio.autoplay = true;
          audio.muted = outputMuted;
          peer.ontrack = (event) => {
            if (!audio || signal.aborted) return;
            audio.srcObject =
              event.streams[0] ?? new MediaStream([event.track]);
            void audio
              .play()
              .catch(() =>
                emit(
                  'error',
                  new SpeechProviderError(
                    ADAPTER,
                    'Audio playback needs a user gesture',
                  ),
                ),
              );
          };
          peer.onconnectionstatechange = () => {
            if (
              peer?.connectionState === 'failed' ||
              peer?.connectionState === 'disconnected'
            )
              fail('Voice connection lost; start a new session');
          };
          for (const track of stream.getAudioTracks())
            peer.addTrack(track, stream);
          channel = peer.createDataChannel('oai-events');
          channel.onmessage = (event) => receive(event.data);
          // Attach before SDP negotiation; some transports open during setRemoteDescription.
          const opened = new Promise<void>((resolve, reject) => {
            const cancel = () =>
              reject(
                new SpeechProviderError(ADAPTER, 'Voice connection cancelled'),
              );
            signal.addEventListener('abort', cancel, { once: true });
            disposers.push(() => signal.removeEventListener('abort', cancel));
            if (channel) {
              channel.onopen = () => {
                signal.removeEventListener('abort', cancel);
                resolve();
              };
              channel.onclose = () => {
                fail('Voice channel closed');
                reject(
                  new SpeechProviderError(ADAPTER, 'Voice channel closed'),
                );
              };
              channel.onerror = () => {
                fail('Voice channel failed');
                reject(
                  new SpeechProviderError(ADAPTER, 'Voice channel failed'),
                );
              };
            }
          });
          // Keep an early rejection handled while negotiation is pending.
          void opened.catch(() => undefined);
          const offer = await abortable(peer.createOffer(), signal);
          await abortable(peer.setLocalDescription(offer), signal);
          signal.throwIfAborted();
          if (!offer.sdp)
            throw new SpeechConfigurationError(
              'WebRTC did not produce an SDP offer',
              ADAPTER,
            );
          const answer = await abortable(
            options.negotiate(offer.sdp, signal),
            signal,
          );
          signal.throwIfAborted();
          await abortable(
            peer.setRemoteDescription({ type: 'answer', sdp: answer }),
            signal,
          );
          await opened;
          signal.throwIfAborted();
          change('connected');
        } catch (error) {
          fail('Unable to connect voice session');
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      })().finally(() => {
        pending = undefined;
      });
      return pending;
    },
    sendText(text) {
      const trimmed = text.trim();
      if (!trimmed || trimmed.length > 16_000)
        throw new SpeechConfigurationError(
          'Text must contain 1–16000 characters',
          ADAPTER,
        );
      const id = `hv_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
      send({
        type: 'conversation.item.create',
        item: {
          id,
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: trimmed }],
        },
      });
      transcript(id, 'user', trimmed, true);
      session.respond();
      return id;
    },
    commitInput(respond = true) {
      send({ type: 'input_audio_buffer.commit' });
      if (respond) session.respond();
    },
    respond(instructions) {
      send({
        type: 'response.create',
        ...(instructions ? { response: { instructions } } : {}),
      });
    },
    interrupt() {
      if (state !== 'connected') return;
      if (responseActive)
        send({
          type: 'response.cancel',
          ...(responseId ? { response_id: responseId } : {}),
        });
      send({ type: 'output_audio_buffer.clear' });
      playback(false);
    },
    setMicMuted(muted) {
      micMuted = muted;
      microphone?.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
      if (muted && state === 'connected')
        send({ type: 'input_audio_buffer.clear' });
    },
    setOutputMuted(muted) {
      outputMuted = muted;
      if (audio) audio.muted = muted;
      if (muted) playback(false);
    },
    submitToolResult(callId, result) {
      send({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: JSON.stringify(result),
        },
      });
    },
    close() {
      if (state === 'closed') return;
      state = 'closed';
      cleanup();
      emit('state', state);
      listeners.clear();
    },
    on(event, listener) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener as (value: never) => void);
      listeners.set(event, set);
      return () => {
        set.delete(listener as (value: never) => void);
      };
    },
  };
  return session;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', cancel));
  });
}
