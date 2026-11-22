/**
 * Usage parts counters (sdk#1576, review round 3): figures without a known
 * token split are `uncounted`, Gemini totals follow Google's accounting, a
 * failure after billed parts is not retryable, and malformed counters never
 * reach arithmetic.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContinuingAI } from './shared/continuation';
import { AnthropicProvider } from './shared/providers/anthropic';
import { BedrockProvider } from './shared/providers/bedrock';
import { GeminiProvider } from './shared/providers/gemini';
import { OpenAIProvider } from './shared/providers/openai';
import {
  __resetAIRateLimitStateForTests,
  createRateLimitedAI,
} from './shared/rate-limit';
import {
  type AIInterface,
  type PartedUsageEvent,
  RateLimitError,
} from './shared/types';
import { createUsagePartsAI } from './shared/usage-parts';

function wrap(provider: AIInterface, paced?: Record<string, unknown>) {
  const inner = paced ? createRateLimitedAI(provider, paced as any) : provider;
  return createUsagePartsAI(createContinuingAI(inner, {}, provider));
}

function recorder() {
  const events: PartedUsageEvent[] = [];
  return {
    events,
    onUsage: (event: unknown) => events.push(event as PartedUsageEvent),
  };
}

function openAIWith(usage: unknown) {
  const { events, onUsage } = recorder();
  const provider = new OpenAIProvider({ apiKey: 'test', onUsage });
  (provider as any).client = {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage,
        }),
      },
    },
  };
  return { ai: wrap(provider as AIInterface), events };
}

function gemini(models: Record<string, unknown>) {
  const { events, onUsage } = recorder();
  const provider = new GeminiProvider({
    type: 'gemini',
    apiKey: 'test',
    defaultModel: 'gemini-test',
    onUsage,
  });
  (provider as any).client = { models };
  return { provider, events };
}

afterEach(() => {
  vi.restoreAllMocks();
  __resetAIRateLimitStateForTests();
});

describe('figures without a known token split are uncounted', () => {
  it('OpenAI-compatible cost-only usage keeps its cost but never completes the call', async () => {
    const { ai, events } = openAIWith({ cost: { total_cost: 0.02 } });
    const result = await ai.chat([{ role: 'user', content: 'go' }]);
    expect(events[0].usage?.costUsd).toBe(0.02);
    expect(events[0].part).toMatchObject({ last: true, uncounted: true });
    expect(result.usageParts?.parts[0]).toMatchObject({ uncounted: true });
    expect(result.usageParts?.complete).toBe(false);
  });

  it('OpenAI-compatible cache-only usage keeps its cache figures but never completes the call', async () => {
    const { ai, events } = openAIWith({
      prompt_tokens_details: { cached_tokens: 5 },
    });
    const result = await ai.chat([{ role: 'user', content: 'go' }]);
    expect(events[0].usage?.cacheReadInputTokens).toBe(5);
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });

  it('genuinely reported zero counters are counted', async () => {
    const { ai, events } = openAIWith({
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      cost: { total_cost: 0 },
    });
    const result = await ai.chat([{ role: 'user', content: 'go' }]);
    expect(events[0].part.uncounted).toBeUndefined();
    expect(result.usageParts?.parts[0].uncounted).toBeUndefined();
    expect(result.usageParts?.complete).toBe(true);
  });

  it('Anthropic and Bedrock cache-only usage is uncounted', async () => {
    const a = recorder();
    const anthropic = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test',
      defaultModel: 'claude-test',
      onUsage: a.onUsage,
    });
    (anthropic as any).client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          usage: { cache_read_input_tokens: 9 },
        }),
      },
    };
    const anthropicResult = await wrap(anthropic as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(a.events[0].part.uncounted).toBe(true);
    expect(anthropicResult.usageParts?.complete).toBe(false);

    const b = recorder();
    const bedrock = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
      defaultModel: 'anthropic.claude-test',
      onUsage: b.onUsage,
    });
    (bedrock as any).client = {
      converse: vi.fn().mockResolvedValue({
        output: { message: { role: 'assistant', content: [{ text: 'ok' }] } },
        stopReason: 'end_turn',
        usage: { cacheReadInputTokens: 4 },
      }),
    };
    const bedrockResult = await wrap(bedrock as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(b.events[0].part.uncounted).toBe(true);
    expect(bedrockResult.usageParts?.complete).toBe(false);
  });
});

describe('Gemini totals follow Google’s accounting', () => {
  const reply = (usageMetadata: unknown) => ({
    text: 'ok',
    candidates: [{ finishReason: 'STOP' }],
    usageMetadata,
  });

  it('includes thought and tool-use prompt tokens when no total is given', async () => {
    const generateContent = vi.fn().mockResolvedValue(
      reply({
        promptTokenCount: 4,
        toolUsePromptTokenCount: 3,
        candidatesTokenCount: 2,
        thoughtsTokenCount: 10,
      }),
    );
    const { provider, events } = gemini({ generateContent });
    const result = await wrap(provider as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    const expected = { promptTokens: 7, completionTokens: 12, totalTokens: 19 };
    expect(events[0].usage).toEqual(expected);
    expect(result.usage).toEqual(expected);
  });

  it('keeps the provider total when one is given', async () => {
    const generateContent = vi.fn().mockResolvedValue(
      reply({
        promptTokenCount: 4,
        candidatesTokenCount: 2,
        thoughtsTokenCount: 10,
        totalTokenCount: 16,
      }),
    );
    const { provider, events } = gemini({ generateContent });
    await wrap(provider as AIInterface).chat([{ role: 'user', content: 'go' }]);
    expect(events[0].usage).toEqual({
      promptTokens: 4,
      completionTokens: 12,
      totalTokens: 16,
    });
  });
});

describe('a call that fails after billed parts is not retryable', () => {
  it('batch embed: a short-window rate limit on the second input reports retryable: false', async () => {
    const embedContent = vi
      .fn()
      .mockResolvedValueOnce({ embeddings: [{ values: [0.1] }] })
      .mockRejectedValueOnce(new RateLimitError('gemini', 1, {}));
    const { provider, events } = gemini({ embedContent });

    const error = await wrap(provider as AIInterface)
      .embed(['a', 'b'])
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryable).toBe(false);
    // The provider's reset hint is kept.
    expect((error as RateLimitError).retryAfterMs).toBe(1000);
    expect(events).toHaveLength(1);
  });

  it('paced batch embed: not replayed internally and not advertised as retryable', async () => {
    const embedContent = vi
      .fn()
      .mockResolvedValueOnce({ embeddings: [{ values: [0.1] }] })
      .mockRejectedValueOnce(new RateLimitError('gemini', 0, {}));
    const { provider } = gemini({ embedContent });
    const ai = wrap(provider as AIInterface, {
      type: 'gemini',
      apiKey: 'test',
      rateLimit: {
        enabled: true,
        key: 'usage-parts-retry-flag',
        initialDelayMs: 1,
        maxAttempts: 3,
      },
    });

    const error = await ai.embed(['a', 'b']).catch((caught: unknown) => caught);

    expect(embedContent).toHaveBeenCalledTimes(2);
    expect((error as RateLimitError).retryable).toBe(false);
  });

  it('a rate limit before any usage keeps its retryable flag', async () => {
    const embedContent = vi
      .fn()
      .mockRejectedValueOnce(new RateLimitError('gemini', 1, {}));
    const { provider, events } = gemini({ embedContent });
    const error = await wrap(provider as AIInterface)
      .embed(['a', 'b'])
      .catch((caught: unknown) => caught);
    expect(events).toHaveLength(0);
    expect((error as RateLimitError).retryable).toBe(true);
  });

  it('a stream that fails after a billed part reports retryable: false', async () => {
    const { events, onUsage } = recorder();
    const provider = new OpenAIProvider({
      apiKey: 'test',
      defaultModel: 'gpt-4o',
      onUsage,
    });
    async function* first() {
      yield {
        choices: [
          {
            delta: { content: 'the quick brown fox jumps over' },
            finish_reason: null,
          },
        ],
      };
      yield { choices: [{ delta: {}, finish_reason: 'length' }] };
    }
    (provider as any).client = {
      chat: {
        completions: {
          create: vi
            .fn()
            .mockResolvedValueOnce(first())
            .mockRejectedValueOnce(new RateLimitError('openai', 1, {})),
        },
      },
    };
    const error = await (async () => {
      for await (const _chunk of wrap(provider as AIInterface).stream(
        [{ role: 'user', content: 'go' }],
        { continueOnLength: true },
      )) {
        // drain
      }
    })().catch((caught: unknown) => caught);
    expect(events).toHaveLength(1);
    expect((error as RateLimitError).retryable).toBe(false);
  });
});

describe('malformed counters never reach arithmetic', () => {
  it('a string completion count cannot corrupt a numeric total or complete the call', async () => {
    const { ai, events } = openAIWith({
      prompt_tokens: 5,
      completion_tokens: '2',
      total_tokens: 7,
    });
    const result = await ai.chat([{ role: 'user', content: 'go' }]);
    expect(events[0].usage).toEqual({
      promptTokens: 5,
      completionTokens: 0,
      totalTokens: 7,
    });
    expect(typeof result.usage?.totalTokens).toBe('number');
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });

  it('a string Gemini counter is treated as not reported', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: 'ok',
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: '2' },
    });
    const { provider, events } = gemini({ generateContent });
    const result = await wrap(provider as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(events[0].usage).toEqual({
      promptTokens: 4,
      completionTokens: 0,
      totalTokens: 4,
    });
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });
});
