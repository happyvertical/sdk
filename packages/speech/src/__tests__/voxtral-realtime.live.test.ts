/**
 * Opt-in live test against a real vLLM Voxtral realtime server. Skipped unless
 * HAVE_SPEECH_STREAMING_LIVE=1 and HAVE_SPEECH_STREAMING_BASE_URL are set.
 *
 * Optional: HAVE_SPEECH_STREAMING_API_KEY, HAVE_SPEECH_STREAMING_MODEL, and
 * HAVE_SPEECH_STREAMING_LIVE_AUDIO (a 16 kHz mono PCM16 WAV or raw `.pcm`
 * file containing speech; without it the test streams one second of silence
 * and only checks the protocol round trip).
 */

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getStreamingTranscriber } from '../index.js';

const env = process.env;
const enabled =
  env.HAVE_SPEECH_STREAMING_LIVE === '1' &&
  Boolean(env.HAVE_SPEECH_STREAMING_BASE_URL);

describe.skipIf(!enabled)('voxtral-realtime live', () => {
  it('streams audio and receives a final transcript', async () => {
    const file = env.HAVE_SPEECH_STREAMING_LIVE_AUDIO;
    let audio = new Uint8Array(32_000);
    if (file) {
      const bytes = new Uint8Array(await readFile(file));
      audio = file.endsWith('.wav') ? bytes.subarray(44) : bytes;
    }

    const session = getStreamingTranscriber({
      type: 'voxtral-realtime',
    }).start();
    const partials: string[] = [];
    session.on('partial', (event) => partials.push(event.delta));

    for (let offset = 0; offset < audio.byteLength; offset += 3200) {
      await session.write(audio.subarray(offset, offset + 3200));
    }
    const result = await session.end();

    expect(result.provider).toBe('voxtral-realtime');
    expect(result.usage?.providerUsage).toHaveProperty('total_tokens');
    if (file) {
      expect(result.text.length).toBeGreaterThan(0);
      expect(partials.length).toBeGreaterThan(0);
    }
  }, 120_000);

  it('runs two manual turns on one socket', async () => {
    const session = getStreamingTranscriber({
      type: 'voxtral-realtime',
    }).start();
    const finals: string[] = [];
    session.on('final', (event) => finals.push(event.text));

    const audio = env.HAVE_SPEECH_STREAMING_LIVE_AUDIO
      ? new Uint8Array(await readFile(env.HAVE_SPEECH_STREAMING_LIVE_AUDIO))
      : new Uint8Array(16_000);
    await session.write(audio);
    session.commit();
    await session.write(audio);
    const result = await session.end();

    expect(finals).toHaveLength(2);
    expect(result.segments).toHaveLength(
      env.HAVE_SPEECH_STREAMING_LIVE_AUDIO ? 2 : 0,
    );
  }, 120_000);

  it('rolls over short turns without a manual commit', async () => {
    // Short turns only: never probe the server's per-turn context limit.
    const session = getStreamingTranscriber({
      type: 'voxtral-realtime',
      maxTurnSeconds: 3,
      rollover: { windowSeconds: 1 },
    }).start();
    let finals = 0;
    session.on('final', () => {
      finals += 1;
    });

    const file = env.HAVE_SPEECH_STREAMING_LIVE_AUDIO;
    const bytes = file
      ? new Uint8Array(await readFile(file))
      : new Uint8Array(32_000 * 8);
    // At most 20 s of audio, in 100 ms writes.
    const audio = (
      file?.endsWith('.wav') ? bytes.subarray(44) : bytes
    ).subarray(0, 32_000 * 20);
    for (let offset = 0; offset < audio.byteLength; offset += 3200) {
      await session.write(audio.subarray(offset, offset + 3200));
    }
    const result = await session.end();

    expect(finals).toBeGreaterThanOrEqual(Math.ceil(audio.byteLength / 96_000));
    expect(result.durationSeconds).toBeCloseTo(audio.byteLength / 32_000, 2);
  }, 180_000);
});
