import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from './shared/providers/anthropic';
import { BedrockProvider } from './shared/providers/bedrock';
import { BifrostProvider } from './shared/providers/bifrost';
import { OpenAIProvider } from './shared/providers/openai';

const user = [{ role: 'user' as const, content: 'Hi' }];

function anthropic(create: ReturnType<typeof vi.fn>) {
  const provider = new AnthropicProvider({
    type: 'anthropic',
    apiKey: 'test-key',
  });
  (provider as any).client = { messages: { create } };
  return provider;
}

function openAIChoice() {
  return [
    {
      index: 0,
      message: { role: 'assistant', content: 'ok' },
      finish_reason: 'stop',
    },
  ];
}

describe('token usage: Anthropic', () => {
  it('reports cache tokens and includes them in promptTokens', async () => {
    const onUsage = vi.fn();
    const provider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test-key',
      onUsage,
    });
    (provider as any).client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-opus-5-5',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 800,
            cache_creation_input_tokens: 200,
          },
        }),
      },
    };
    const response = await provider.chat(user);
    expect(response.usage).toEqual({
      promptTokens: 1010,
      completionTokens: 5,
      totalTokens: 1015,
      cacheReadInputTokens: 800,
      cacheCreationInputTokens: 200,
    });
    expect(onUsage.mock.calls[0][0].usage).toEqual(response.usage);
  });

  it('adds no cache fields when the API sends none', async () => {
    const provider = anthropic(
      vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        model: 'claude-opus-5-5',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    );
    const response = await provider.chat(user);
    expect(response.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it('reports usage for streams from message_start and message_delta', async () => {
    const onUsage = vi.fn();
    const provider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test-key',
      onUsage,
    });
    async function* events() {
      yield {
        type: 'message_start',
        message: {
          usage: {
            input_tokens: 10,
            output_tokens: 1,
            cache_read_input_tokens: 90,
          },
        },
      };
      yield {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'ok' },
      };
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 7 },
      };
    }
    (provider as any).client = {
      messages: { create: vi.fn().mockResolvedValue(events()) },
    };
    for await (const _ of provider.stream(user)) {
      // drain
    }
    expect(onUsage.mock.calls[0][0].usage).toEqual({
      promptTokens: 100,
      completionTokens: 7,
      totalTokens: 107,
      cacheReadInputTokens: 90,
    });
  });
});

describe('token usage: OpenAI-compatible', () => {
  async function bifrostUsage(usage: Record<string, unknown>) {
    const provider = new BifrostProvider({
      type: 'bifrost',
      apiKey: 'test-key',
      baseUrl: 'http://localhost:8080/openai',
    });
    (provider as any).client = {
      chat: {
        completions: {
          create: vi
            .fn()
            .mockResolvedValue({ model: 'm', choices: openAIChoice(), usage }),
        },
      },
    };
    return (await provider.chat(user, { model: 'anthropic/claude-opus-5-5' }))
      .usage;
  }

  it('reads Bifrost cache details and cost', async () => {
    expect(
      await bifrostUsage({
        prompt_tokens: 1000,
        completion_tokens: 20,
        total_tokens: 1020,
        prompt_tokens_details: {
          cached_read_tokens: 700,
          cached_write_tokens: 100,
        },
        cost: { input_tokens_cost: 0.002, total_cost: 0.0031 },
      }),
    ).toEqual({
      promptTokens: 1000,
      completionTokens: 20,
      totalTokens: 1020,
      cacheReadInputTokens: 700,
      cacheCreationInputTokens: 100,
      costUsd: 0.0031,
    });
  });

  it('reads OpenAI cached_tokens, a bare numeric cost, and ignores junk', async () => {
    const usage = await bifrostUsage({
      prompt_tokens: 10,
      completion_tokens: 2,
      total_tokens: 12,
      prompt_tokens_details: { cached_tokens: 4 },
      cost: 0.5,
    });
    expect(usage).toMatchObject({ cacheReadInputTokens: 4, costUsd: 0.5 });
    const junk = await bifrostUsage({
      prompt_tokens: 10,
      completion_tokens: 2,
      total_tokens: 12,
      prompt_tokens_details: { cached_read_tokens: 'many' },
      cost: { total_cost: null },
    });
    expect(junk).toEqual({
      promptTokens: 10,
      completionTokens: 2,
      totalTokens: 12,
    });
  });

  it('leaves usage unchanged for a plain OpenAI response', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    (provider as any).client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            model: 'gpt-4o',
            choices: openAIChoice(),
            usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
          }),
        },
      },
    };
    expect((await provider.chat(user)).usage).toEqual({
      promptTokens: 3,
      completionTokens: 1,
      totalTokens: 4,
    });
  });
});

describe('token usage: Bedrock', () => {
  it('reports Converse cache tokens and includes them in promptTokens', () => {
    const provider = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
    });
    const response = (provider as any).mapConverseResponse(
      {
        output: { message: { content: [{ text: 'ok' }] } },
        stopReason: 'end_turn',
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 115,
          cacheReadInputTokens: 90,
          cacheWriteInputTokens: 10,
        },
      },
      'us.anthropic.claude-opus-5-5',
    );
    expect(response.usage).toEqual({
      promptTokens: 110,
      completionTokens: 5,
      totalTokens: 115,
      cacheReadInputTokens: 90,
      cacheCreationInputTokens: 10,
    });
  });
});
