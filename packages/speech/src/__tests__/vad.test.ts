import { describe, expect, it } from 'vitest';
import {
  createUtteranceCollector,
  createVadSegmenter,
  frameEnergy,
  resolveVadOptions,
  VAD_FRAME_MS,
  type VadEvent,
  type VadUtterance,
} from '../pcm.js';

const QUIET = 0.002;
const LOUD = 0.2;

/** Feeds `ms` of constant energy and returns every event with its time. */
function feed(
  segmenter: ReturnType<typeof createVadSegmenter>,
  energy: number,
  ms: number,
): VadEvent[] {
  const events: VadEvent[] = [];
  for (let t = 0; t < ms; t += VAD_FRAME_MS) {
    events.push(...segmenter.push(energy).events);
  }
  return events;
}

const calibrated = (options = {}) => {
  const segmenter = createVadSegmenter(options);
  feed(segmenter, QUIET, 400);
  return segmenter;
};

describe('createVadSegmenter', () => {
  it('starts an utterance once speech lasts minSpeechMs', () => {
    const segmenter = calibrated();
    const events = feed(segmenter, LOUD, 200);
    expect(events.map((e) => e.type)).toEqual(['start']);
    expect(segmenter.speaking).toBe(true);
  });

  it('ends only after the silence hangover', () => {
    const segmenter = calibrated();
    feed(segmenter, LOUD, 400);
    expect(feed(segmenter, QUIET, 760)).toEqual([]);
    expect(segmenter.speaking).toBe(true);
    const end = feed(segmenter, QUIET, 60);
    expect(end).toEqual([
      { type: 'end', reason: 'silence', trailingSilenceMs: 800 },
    ]);
    expect(segmenter.speaking).toBe(false);
  });

  it('keeps one utterance across a short pause', () => {
    const segmenter = calibrated();
    const events = [
      ...feed(segmenter, LOUD, 400),
      ...feed(segmenter, QUIET, 400),
      ...feed(segmenter, LOUD, 400),
    ];
    expect(events.map((e) => e.type)).toEqual(['start']);
  });

  it('rejects a click shorter than minSpeechMs', () => {
    const segmenter = calibrated();
    const events = [
      ...feed(segmenter, LOUD, 60),
      ...feed(segmenter, QUIET, 400),
      ...feed(segmenter, LOUD, 60),
      ...feed(segmenter, QUIET, 1000),
    ];
    expect(events).toEqual([]);
    expect(segmenter.speaking).toBe(false);
  });

  it('splits an utterance at maxUtteranceMs and keeps speaking', () => {
    const segmenter = calibrated({ maxUtteranceMs: 2000 });
    const events = feed(segmenter, LOUD, 4500);
    expect(events.filter((e) => e.type === 'split').length).toBe(2);
    expect(segmenter.speaking).toBe(true);
    expect(segmenter.flush()).toEqual([
      { type: 'end', reason: 'flush', trailingSilenceMs: 0 },
    ]);
  });

  it('adapts the noise floor to a steady hum instead of hearing speech', () => {
    const segmenter = createVadSegmenter();
    feed(segmenter, QUIET, 400);
    const before = segmenter.noiseFloor;
    // A fan starts: louder than the learned floor but below the onset threshold.
    const hum = segmenter.threshold * 0.8;
    const events = feed(segmenter, hum, 10_000);
    expect(events).toEqual([]);
    expect(segmenter.noiseFloor).toBeGreaterThan(before);
    expect(segmenter.threshold).toBeGreaterThan(hum * 0.99);
  });

  it('is more eager at higher sensitivity', () => {
    const low = calibrated({ sensitivity: 0 });
    const high = calibrated({ sensitivity: 1 });
    expect(high.threshold).toBeLessThan(low.threshold);
  });

  it('reports a 0..1 level', () => {
    const segmenter = calibrated();
    expect(segmenter.push(QUIET).level).toBeLessThan(0.2);
    expect(segmenter.push(1).level).toBe(1);
    expect(segmenter.push(Number.NaN).level).toBe(0);
  });

  it('flush is a no-op outside an utterance', () => {
    expect(calibrated().flush()).toEqual([]);
  });
});

describe('resolveVadOptions / frameEnergy', () => {
  it('fills defaults and clamps nonsense', () => {
    expect(resolveVadOptions()).toMatchObject({
      silenceMs: 800,
      minSpeechMs: 150,
      preRollMs: 300,
      maxUtteranceMs: 30_000,
    });
    const clamped = resolveVadOptions({
      sensitivity: 9,
      silenceMs: Number.NaN,
      maxUtteranceMs: 5,
    });
    expect(clamped.sensitivity).toBe(1);
    expect(clamped.silenceMs).toBe(800);
    expect(clamped.maxUtteranceMs).toBe(1000);
  });

  it('computes RMS', () => {
    expect(frameEnergy([])).toBe(0);
    expect(frameEnergy([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5);
  });
});

describe('createUtteranceCollector', () => {
  const RATE = 16_000;
  /** Constant-valued block; a ramp marker makes pre-roll checkable. */
  const block = (ms: number, value: number) =>
    new Float32Array(Math.round((RATE * ms) / 1000)).fill(value);

  function setup(extra = {}) {
    const utterances: VadUtterance[] = [];
    const speaking: boolean[] = [];
    const levels: number[] = [];
    const collector = createUtteranceCollector({
      sampleRate: RATE,
      onUtterance: (u) => utterances.push(u),
      onSpeaking: (s) => speaking.push(s),
      onLevel: (l) => levels.push(l),
      ...extra,
    });
    collector.push(block(400, 0.002));
    return { collector, utterances, speaking, levels };
  }

  it('hands over an utterance with pre-roll and a trimmed tail', () => {
    const { collector, utterances, speaking } = setup();
    collector.push(block(500, 0.003)); // quiet lead-in, kept as pre-roll
    collector.push(block(600, 0.3));
    collector.push(block(1000, 0.002));
    expect(speaking).toEqual([true, false]);
    expect(utterances).toHaveLength(1);
    const u = utterances[0];
    expect(u.reason).toBe('silence');
    // 600 ms speech + ~300 ms pre-roll + ~250 ms kept tail.
    expect(u.durationMs).toBeGreaterThan(1000);
    expect(u.durationMs).toBeLessThan(1300);
    // Starts with the pre-roll (quiet), not the speech.
    expect(Math.abs(u.pcm[0])).toBeLessThan(0.01);
    expect(u.pcm.some((v) => v > 0.2)).toBe(true);
  });

  it('emits nothing for a click', () => {
    const { collector, utterances, speaking } = setup();
    collector.push(block(60, 0.3));
    collector.push(block(1500, 0.002));
    expect(utterances).toEqual([]);
    expect(speaking).toEqual([]);
  });

  it('splits long speech into back-to-back utterances', () => {
    const { collector, utterances } = setup({ maxUtteranceMs: 2000 });
    collector.push(block(4500, 0.3));
    expect(utterances.map((u) => u.reason)).toEqual(['max', 'max']);
    collector.flush();
    expect(utterances.map((u) => u.reason)).toEqual(['max', 'max', 'flush']);
  });

  it('flush delivers an utterance in progress and reports not speaking', () => {
    const { collector, utterances, speaking, levels } = setup();
    collector.push(block(500, 0.3));
    collector.flush();
    expect(utterances).toHaveLength(1);
    expect(utterances[0].reason).toBe('flush');
    expect(speaking).toEqual([true, false]);
    expect(levels.at(-1)).toBe(0);
  });

  it('copies input so callers can reuse their buffer', () => {
    const { collector, utterances } = setup();
    const reused = block(600, 0.3);
    collector.push(reused);
    reused.fill(0);
    collector.flush();
    expect(utterances[0].pcm.some((v) => v > 0.2)).toBe(true);
  });
});
