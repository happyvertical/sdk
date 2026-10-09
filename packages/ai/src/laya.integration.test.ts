/**
 * Opt-in live test against a running `laya-serve` (stock, no wrapper).
 *
 *   LAYA_BASE_URL=http://127.0.0.1:8000 pnpm --filter @happyvertical/ai exec \
 *     vitest --config ../../vitest.package.config.ts run src/laya.integration.test.ts
 *
 * Optional: LAYA_API_KEY when the server sets it; LAYA_EXPECT_AUTH=1 to also
 * check that a wrong key is refused; LAYA_EXPECT_STRICT=1 when the server runs
 * with LAYA_JEV_STRICT=1 (it then omits routing and truncation facts, so the
 * checkpoint cannot be reported); and LAYA_CHECKPOINTS (a
 * comma list, default `typed-decisions`) naming checkpoints the server can
 * serve, to exercise the per-request model override. A checkpoint the server
 * has not preloaded is loaded on its first request, which can take a minute.
 *
 * Without LAYA_BASE_URL every test below is reported as skipped. A skip is not
 * a pass: nothing here ran against a real server.
 */
import { describe, expect, it } from 'vitest';

import { getAI } from './shared/factory';
import type { DecisionRequest, LayaDecisionOptions } from './shared/types';

const baseUrl = process.env.LAYA_BASE_URL;
const apiKey = process.env.LAYA_API_KEY;
const strict = Boolean(process.env.LAYA_EXPECT_STRICT);
const checkpoints = (process.env.LAYA_CHECKPOINTS || 'typed-decisions')
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);

if (!baseUrl) {
  console.warn(
    '[laya.integration] LAYA_BASE_URL is not set: the live Laya tests are SKIPPED, not passed.',
  );
}

const request: DecisionRequest = {
  state: { message: 'Please refund my duplicate charge. This is urgent!' },
  questions: {
    refund: {
      type: 'predicate',
      instructions: 'Does `message` request a refund?',
    },
    route: {
      type: 'choice',
      instructions: 'Which team should handle `message`?',
      criteria: {
        billing: 'payments, refunds and invoices',
        support: 'login and app problems',
        other: 'everything else',
      },
    },
    urgency: {
      type: 'score',
      instructions: 'How urgent is `message`?',
      criteria: ['calm', 'firm', 'angry', 'furious'],
    },
  },
};

function expectUnitMass(probabilities: Record<string, number>) {
  const sum = Object.values(probabilities).reduce((a, b) => a + b, 0);
  expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
  for (const value of Object.values(probabilities)) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  }
}

describe.skipIf(!baseUrl)('live laya-serve', () => {
  const connect = (extra: Record<string, unknown> = {}) =>
    getAI({ type: 'laya', baseUrl, apiKey, ...extra } as never);

  it('answers a mixed batch the stock server rounds to four decimals', async () => {
    const ai = await connect({ defaultModel: checkpoints[0] });
    expect((await ai.getCapabilities()).decisions).toBe(true);
    const result = await ai.decide!(request);

    expect(result.answers.refund).toMatchObject({ type: 'predicate' });
    const route = result.answers.route;
    const urgency = result.answers.urgency;
    if (route.type !== 'choice' || urgency.type !== 'score')
      throw new Error('unexpected answer types');
    expect(Object.keys(route.probabilities).sort()).toEqual([
      'billing',
      'other',
      'support',
    ]);
    expect(route.probabilities[route.choice]).toBe(
      Math.max(...Object.values(route.probabilities)),
    );
    expectUnitMass(route.probabilities);
    expectUnitMass(urgency.probabilities);
    expect(urgency.score).toBeGreaterThanOrEqual(0);
    expect(urgency.score).toBeLessThanOrEqual(3);
    expect(urgency.levels).toEqual(['calm', 'firm', 'angry', 'furious']);

    expect(result.usage?.promptTokens).toBeGreaterThan(0);
    expect(result.usage?.completionTokens).toBe(0);
    expect(result.provenance.provider).toBe('laya');
    expect(result.provenance.details).toMatchObject({
      requestedModel: checkpoints[0],
    });
    if (strict) {
      // A LAYA_JEV_STRICT server drops `routing`, so the checkpoint is unknown.
      expect(result.model).toBe('laya-rl-agent');
      expect(result.provenance.details).not.toHaveProperty('checkpoint');
    } else {
      // Stock laya-serve reports the answering checkpoint in `routing`.
      expect(result.model).toBe(checkpoints[0]);
      expect(result.provenance.details).toMatchObject({
        checkpoint: checkpoints[0],
        truncated: false,
      });
    }
  }, 180_000);

  it('records the checkpoint chosen by the server router when none is requested', async () => {
    const ai = await connect();
    const result = await ai.decide!(request);
    expect(result.provenance.details).not.toHaveProperty('requestedModel');
    if (strict) {
      expect(result.provenance.details).not.toHaveProperty('checkpoint');
      return;
    }
    expect(result.provenance.details).toHaveProperty('checkpoint');
    expect(result.model).toBe(result.provenance.details?.checkpoint);
  }, 180_000);

  it('honors a per-request checkpoint override', async () => {
    const ai = await connect({ defaultModel: checkpoints[0] });
    for (const checkpoint of checkpoints) {
      const result = await ai.decide!(request, { model: checkpoint });
      expect(result.provenance.details).toMatchObject({
        requestedModel: checkpoint,
      });
      if (!strict) expect(result.model).toBe(checkpoint);
    }
  }, 300_000);

  it('passes max_len and reports truncation', async () => {
    const ai = await connect({ defaultModel: checkpoints[0] });
    const long: DecisionRequest = {
      state: `${'The shop was quiet that day. '.repeat(200)} Please refund me.`,
      questions: request.questions,
    };
    const options: LayaDecisionOptions = { maxLen: 64 };
    const result = await ai.decide!(long, options);
    expect(result.provenance.details).toMatchObject({ maxLen: 64 });
    if (!strict) {
      expect(result.provenance.details).toMatchObject({ truncated: true });
      const truncated = result.provenance.details?.truncatedQuestions;
      expect(Array.isArray(truncated) && truncated.length).toBeGreaterThan(0);
    }

    const tooWide: LayaDecisionOptions = { maxLen: 10_000_000 };
    await expect(ai.decide!(request, tooWide)).rejects.toMatchObject({
      code: 'API_ERROR',
      retryable: false,
      message: expect.stringContaining('max_len'),
    });
  }, 180_000);

  it('rejects an unknown checkpoint explicitly', async () => {
    const ai = await connect();
    await expect(
      ai.decide!(request, { model: 'org/not-a-checkpoint' }),
    ).rejects.toMatchObject({ code: 'API_ERROR', retryable: false });
  }, 60_000);

  // Only meaningful against a server started with LAYA_API_KEY, so it is
  // reported as skipped (not passed) unless LAYA_EXPECT_AUTH=1.
  it.skipIf(!process.env.LAYA_EXPECT_AUTH)(
    'rejects a wrong key when the server requires one',
    async () => {
      const wrong = await getAI({
        type: 'laya',
        baseUrl,
        apiKey: 'definitely-wrong',
      });
      await expect(wrong.decide!(request)).rejects.toMatchObject({
        code: 'AUTH_ERROR',
      });
    },
    60_000,
  );
});
