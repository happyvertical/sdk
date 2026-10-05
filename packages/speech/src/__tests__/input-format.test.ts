import { describe, expect, it } from 'vitest';
import {
  getAvailableSpeechAdapters,
  STREAMING_TRANSCRIBER_TYPES,
  type TranscriberType,
  transcriberInputFormat,
  VOXTRAL_REALTIME_AUDIO_FORMAT,
} from '../index.js';

describe('transcriberInputFormat', () => {
  it('maps every shipped transcriber type', () => {
    const expected: Record<string, unknown> = {
      'studio-server': { kind: 'compressed' },
      'openai-compatible': { kind: 'compressed' },
      local: { kind: 'compressed' },
      'openai-realtime': { kind: 'pcm16', sampleRate: 24000, channels: 1 },
      'voxtral-realtime': { kind: 'pcm16', sampleRate: 16000, channels: 1 },
    };
    const shipped = [
      ...getAvailableSpeechAdapters().transcribers,
      'local',
    ] as TranscriberType[];
    expect(new Set(shipped)).toEqual(new Set(Object.keys(expected)));
    for (const type of shipped) {
      expect(transcriberInputFormat(type)).toEqual(expected[type]);
    }
  });

  it('agrees with the adapter contracts', () => {
    expect(transcriberInputFormat('voxtral-realtime')).toMatchObject({
      sampleRate: VOXTRAL_REALTIME_AUDIO_FORMAT.sampleRate,
    });
    for (const type of STREAMING_TRANSCRIBER_TYPES) {
      expect(transcriberInputFormat(type).kind).toBe('pcm16');
    }
  });

  it('throws on an unknown type', () => {
    expect(() => transcriberInputFormat('nope' as TranscriberType)).toThrow();
  });
});
