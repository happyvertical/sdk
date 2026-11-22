/**
 * The shared counted rule (sdk#1576, review round 4): a part is counted only
 * when prompt and completion are both valid and every supplemental counter
 * the provider reported is valid. Anything else with a valid figure is
 * emitted `uncounted`, keeping every valid figure.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContinuingAI } from './shared/continuation';
import { AnthropicProvider } from './shared/providers/anthropic';
import { BedrockProvider } from './shared/providers/bedrock';
import { ClaudeCliProvider } from './shared/providers/claude-cli';
import { GeminiProvider } from './shared/providers/gemini';
import { OllamaProvider } from './shared/providers/ollama';
import { OpenAIProvider } from './shared/providers/openai';
import { WebLLMProvider } from './shared/providers/webllm';
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

async function collect(iterable: AsyncIterable<unknown>) {
  const out: unknown[] = [];
  for await (const chunk of iterable) out.push(chunk);
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a total or one side alone is uncounted', () => {
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

  it('OpenAI-compatible total_tokens alone keeps the total but does not complete the call', async () => {
    const { ai, events } = openAIWith({ total_tokens: 7 });
    const result = await ai.chat([{ role: 'user', content: 'go' }]);
    expect(events[0].usage?.totalTokens).toBe(7);
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.parts[0].uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });

  it('OpenAI-compatible prompt_tokens alone is uncounted', async () => {
    const { ai, events } = openAIWith({ prompt_tokens: 5 });
    const result = await ai.chat([{ role: 'user', content: 'go' }]);
    expect(events[0].usage?.promptTokens).toBe(5);
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });
});

describe('a malformed cache counter makes the part uncounted', () => {
  it('Anthropic: input 5, output 2, cache read "9"', async () => {
    const { events, onUsage } = recorder();
    const provider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test',
      defaultModel: 'claude-test',
      onUsage,
    });
    (provider as any).client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 5,
            output_tokens: 2,
            cache_read_input_tokens: '9',
          },
        }),
      },
    };
    const result = await wrap(provider as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(events[0].usage).toMatchObject({
      promptTokens: 5,
      completionTokens: 2,
    });
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.parts[0].uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });

  it('Bedrock: input 5, output 2, cache read "9"', async () => {
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
        usage: { inputTokens: 5, outputTokens: 2, cacheReadInputTokens: '9' },
      }),
    };
    const result = await wrap(provider as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(events[0].usage).toMatchObject({
      promptTokens: 5,
      completionTokens: 2,
    });
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });
});

describe('Gemini supplemental-only reports keep their figures, uncounted', () => {
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

  it('thought tokens alone', async () => {
    const { ai, events } = gemini({ thoughtsTokenCount: 10 });
    const result = await ai.chat([{ role: 'user', content: 'go' }]);
    const expected = { promptTokens: 0, completionTokens: 10, totalTokens: 10 };
    expect(events[0].usage).toEqual(expected);
    expect(result.usage).toEqual(expected);
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });

  it('tool-use prompt tokens alone', async () => {
    const { ai, events } = gemini({ toolUsePromptTokenCount: 4 });
    await ai.chat([{ role: 'user', content: 'go' }]);
    expect(events[0].usage).toEqual({
      promptTokens: 4,
      completionTokens: 0,
      totalTokens: 4,
    });
    expect(events[0].part.uncounted).toBe(true);
  });
});

describe('one malformed counter keeps the valid figures, uncounted', () => {
  it('Claude CLI: input 5, output "2"', async () => {
    const { events, onUsage } = recorder();
    const provider = new ClaudeCliProvider({ type: 'claude-cli', onUsage });
    (provider as any).initializeFallback = async () => {};
    (provider as any).executeCommand = vi.fn().mockResolvedValue({
      result: 'ok',
      usage: { input_tokens: 5, output_tokens: '2' },
    });
    const result = await wrap(provider as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(events[0].usage).toEqual({
      promptTokens: 5,
      completionTokens: 0,
      totalTokens: 5,
    });
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });

  it('Ollama: prompt 5, eval "2"', async () => {
    const { events, onUsage } = recorder();
    const provider = new OllamaProvider({
      type: 'ollama',
      defaultModel: 'llama3',
      onUsage,
    });
    (provider as any).requestJson = vi.fn().mockResolvedValue({
      model: 'llama3',
      message: { role: 'assistant', content: 'ok' },
      done_reason: 'stop',
      prompt_eval_count: 5,
      eval_count: '2',
    });
    const result = await wrap(provider as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(events[0].usage?.promptTokens).toBe(5);
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });

  it('WebLLM chat: prompt 5, completion "2"', async () => {
    const { events, onUsage } = recorder();
    const create = vi.fn().mockResolvedValue({
      model: 'web-model',
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: '2' },
    });
    const provider = new WebLLMProvider({
      type: 'webllm',
      defaultModel: 'web-model',
      engine: {
        chat: { completions: { create } },
        interruptGenerate: vi.fn(),
        unload: vi.fn(),
      },
      onUsage,
    } as any);
    const result = await wrap(provider as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(events[0].usage?.promptTokens).toBe(5);
    expect(events[0].part.uncounted).toBe(true);
    expect(result.usageParts?.complete).toBe(false);
  });

  it('WebLLM stream: a malformed terminal report after a valid snapshot leaves it uncounted', async () => {
    const { events, onUsage } = recorder();
    async function* chunks() {
      yield {
        choices: [{ delta: { content: 'ok' }, finish_reason: null }],
        usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
      };
      yield {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 'x', completion_tokens: 'y' },
      };
    }
    const provider = new WebLLMProvider({
      type: 'webllm',
      defaultModel: 'web-model',
      engine: {
        chat: { completions: { create: vi.fn().mockResolvedValue(chunks()) } },
        interruptGenerate: vi.fn(),
        unload: vi.fn(),
      },
      onUsage,
    } as any);
    await collect(
      wrap(provider as AIInterface).stream([{ role: 'user', content: 'go' }]),
    );
    expect(events).toHaveLength(1);
    expect(events[0].usage?.totalTokens).toBe(7);
    expect(events[0].part.uncounted).toBe(true);
  });
});

describe('counted controls', () => {
  it('a full split with valid cache counters is counted', async () => {
    const { events, onUsage } = recorder();
    const provider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test',
      defaultModel: 'claude-test',
      onUsage,
    });
    (provider as any).client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 5,
            output_tokens: 2,
            cache_read_input_tokens: 9,
          },
        }),
      },
    };
    const result = await wrap(provider as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(events[0].part.uncounted).toBeUndefined();
    expect(result.usageParts?.complete).toBe(true);
  });
});
