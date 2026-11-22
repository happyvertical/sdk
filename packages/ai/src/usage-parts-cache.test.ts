/**
 * Counted parts carry the right amount (sdk#1576, review round 5): Claude
 * CLI and Gemini cache counters, and OpenAI-compatible embedding usage
 * normalized to the figures the counted rule validated.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContinuingAI } from './shared/continuation';
import { BedrockProvider } from './shared/providers/bedrock';
import { ClaudeCliProvider } from './shared/providers/claude-cli';
import { GeminiProvider } from './shared/providers/gemini';
import { OpenAIProvider } from './shared/providers/openai';
import type { AIInterface, PartedUsageEvent } from './shared/types';
import { createUsagePartsAI } from './shared/usage-parts';

function wrap(provider: AIInterface) {
  return createUsagePartsAI(createContinuingAI(provider, {}, provider));
}

function recorder() {
  const events: PartedUsageEvent[] = [];
  return {
    events,
    onUsage: (event: unknown) => events.push(event as PartedUsageEvent),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Claude CLI cache counters', () => {
  function claudeCli(usage: unknown) {
    const { events, onUsage } = recorder();
    const provider = new ClaudeCliProvider({ type: 'claude-cli', onUsage });
    (provider as any).initializeFallback = async () => {};
    (provider as any).executeCommand = vi
      .fn()
      .mockResolvedValue({ result: 'ok', usage });
    return { ai: wrap(provider as AIInterface), events };
  }

  it('include cache reads and writes in the prompt on the event and the response', async () => {
    const { ai, events } = claudeCli({
      input_tokens: 5,
      output_tokens: 2,
      cache_read_input_tokens: 90,
      cache_creation_input_tokens: 10,
    });
    const result = await ai.chat([{ role: 'user', content: 'go' }]);
    const expected = {
      promptTokens: 105,
      completionTokens: 2,
      totalTokens: 107,
      cacheReadInputTokens: 90,
      cacheCreationInputTokens: 10,
    };
    expect(events[0].usage).toEqual(expected);
    expect(result.usage).toEqual(expected);
    expect(events[0].part.uncounted).toBeUndefined();
    expect(result.usageParts?.complete).toBe(true);
  });

  it('a malformed cache counter leaves the part uncounted', async () => {
    const { ai, events } = claudeCli({
      input_tokens: 5,
      output_tokens: 2,
      cache_read_input_tokens: '90',
    });
    const result = await ai.chat([{ role: 'user', content: 'go' }]);
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });

  it('a cache-only report is emitted uncounted', async () => {
    const { ai, events } = claudeCli({ cache_read_input_tokens: 90 });
    await ai.chat([{ role: 'user', content: 'go' }]);
    expect(events[0].usage?.cacheReadInputTokens).toBe(90);
    expect(events[0].part.uncounted).toBe(true);
  });
});

describe('Gemini cachedContentTokenCount', () => {
  function gemini(usageMetadata: unknown) {
    const { events, onUsage } = recorder();
    const provider = new GeminiProvider({
      type: 'gemini',
      apiKey: 'test',
      defaultModel: 'gemini-test',
      onUsage,
    });
    (provider as any).client = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: 'ok',
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata,
        }),
      },
    };
    return { ai: wrap(provider as AIInterface), events };
  }

  it('is reported as cache reads without adding it to the prompt again', async () => {
    const { ai, events } = gemini({
      promptTokenCount: 100,
      cachedContentTokenCount: 80,
      candidatesTokenCount: 5,
      totalTokenCount: 105,
    });
    const result = await ai.chat([{ role: 'user', content: 'go' }]);
    const expected = {
      promptTokens: 100,
      completionTokens: 5,
      totalTokens: 105,
      cacheReadInputTokens: 80,
    };
    expect(events[0].usage).toEqual(expected);
    expect(result.usage).toEqual(expected);
    expect(result.usageParts?.complete).toBe(true);
  });

  it('a cache-only report is emitted uncounted', async () => {
    const { ai, events } = gemini({ cachedContentTokenCount: 80 });
    const result = await ai.chat([{ role: 'user', content: 'go' }]);
    expect(events[0].usage?.cacheReadInputTokens).toBe(80);
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });

  it('a malformed cache counter leaves a full split uncounted', async () => {
    const { ai, events } = gemini({
      promptTokenCount: 100,
      cachedContentTokenCount: 'eighty',
      candidatesTokenCount: 5,
    });
    const result = await ai.chat([{ role: 'user', content: 'go' }]);
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });
});

describe('OpenAI-compatible embedding usage', () => {
  function embedWith(usage: unknown) {
    const { events, onUsage } = recorder();
    const provider = new OpenAIProvider({ apiKey: 'test', onUsage });
    (provider as any).client = {
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: [0.1] }],
          model: 'text-embedding-3-small',
          usage,
        }),
      },
    };
    return { ai: wrap(provider as AIInterface), events };
  }

  it('a gateway completion counter is not emitted as counted output', async () => {
    const { ai, events } = embedWith({
      prompt_tokens: 5,
      completion_tokens: 2,
      total_tokens: 5,
    });
    const result = await ai.embed('hello');
    expect(events[0].usage).toEqual({
      promptTokens: 5,
      completionTokens: 0,
      totalTokens: 5,
    });
    expect(result.usage).toEqual(events[0].usage);
    expect(events[0].part.uncounted).toBe(true);
  });

  it('a total other than the prompt is not counted', async () => {
    const { ai, events } = embedWith({ prompt_tokens: 5, total_tokens: 7 });
    await ai.embed('hello');
    expect(events[0].usage).toMatchObject({
      completionTokens: 0,
      totalTokens: 5,
    });
    expect(events[0].part.uncounted).toBe(true);
  });

  it('the canonical payload is counted as prompt only', async () => {
    const { ai, events } = embedWith({ prompt_tokens: 5, total_tokens: 5 });
    await ai.embed('hello');
    expect(events[0].usage).toEqual({
      promptTokens: 5,
      completionTokens: 0,
      totalTokens: 5,
    });
    expect(events[0].part.uncounted).toBeUndefined();
  });
});

describe('inconsistent counters are uncounted', () => {
  it('Gemini: a cached count above the prompt count (prompt 0, cached 8, candidates 2, total 10)', async () => {
    const { events, onUsage } = recorder();
    const provider = new GeminiProvider({
      type: 'gemini',
      apiKey: 'test',
      defaultModel: 'gemini-test',
      onUsage,
    });
    (provider as any).client = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: 'ok',
          candidates: [{ finishReason: 'STOP' }],
          usageMetadata: {
            promptTokenCount: 0,
            cachedContentTokenCount: 8,
            candidatesTokenCount: 2,
            totalTokenCount: 10,
          },
        }),
      },
    };
    const result = await wrap(provider as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(events[0].usage?.cacheReadInputTokens).toBe(8);
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });

  it('OpenAI-compatible embedding: cached_tokens 8 above prompt_tokens 0', async () => {
    const { events, onUsage } = recorder();
    const provider = new OpenAIProvider({ apiKey: 'test', onUsage });
    (provider as any).client = {
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: [0.1] }],
          usage: {
            prompt_tokens: 0,
            prompt_tokens_details: { cached_tokens: 8 },
          },
        }),
      },
    };
    await wrap(provider as AIInterface).embed('hello');
    expect(events[0].part.uncounted).toBe(true);
  });

  it('Bedrock: a reported total below input plus output', async () => {
    const { events, onUsage } = recorder();
    const provider = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
      defaultModel: 'anthropic.claude-test',
      onUsage,
    });
    (provider as any).client = {
      converse: vi.fn().mockResolvedValue({
        output: { message: { role: 'assistant', content: [{ text: 'ok' }] } },
        stopReason: 'end_turn',
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 3 },
      }),
    };
    const result = await wrap(provider as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });
});
