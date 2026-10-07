import { describe, expect, it, vi } from 'vitest';
import {
  continuationAddition,
  createContinuingAI,
} from './shared/continuation';
import { AnthropicProvider } from './shared/providers/anthropic';
import { BedrockProvider } from './shared/providers/bedrock';
import { GeminiProvider } from './shared/providers/gemini';
import { OllamaProvider } from './shared/providers/ollama';
import { OpenAIProvider } from './shared/providers/openai';
import {
  __resetAIRateLimitStateForTests,
  createRateLimitedAI,
} from './shared/rate-limit';
import { type AIInterface, RateLimitError } from './shared/types';

const SEAM = 'the quick brown fox jumps over';

function openAIReply(content: string, finish: string, tokens = [10, 5]) {
  return {
    choices: [{ message: { content }, finish_reason: finish }],
    model: 'gpt-4o',
    usage: {
      prompt_tokens: tokens[0],
      completion_tokens: tokens[1],
      total_tokens: tokens[0] + tokens[1],
    },
  };
}

async function* openAIStream(parts: string[], finish: string) {
  for (const text of parts) {
    yield { choices: [{ delta: { content: text }, finish_reason: null }] };
  }
  yield { choices: [{ delta: {}, finish_reason: finish }] };
}

function openAI(create: ReturnType<typeof vi.fn>, extra = {}) {
  const provider = new OpenAIProvider({
    apiKey: 'test',
    defaultModel: 'gpt-4o',
    ...extra,
  });
  (provider as any).client = { chat: { completions: { create } } };
  return createContinuingAI(provider as AIInterface, extra);
}

async function collect(iterable: AsyncIterable<string>) {
  let out = '';
  for await (const chunk of iterable) out += chunk;
  return out;
}

describe('continuationAddition', () => {
  it('trims a repeated seam and keeps unrelated text', () => {
    expect(continuationAddition(`start ${SEAM}`, `${SEAM} the lazy dog`)).toBe(
      ' the lazy dog',
    );
    expect(continuationAddition('abc', ' def')).toBe(' def');
    // A short coincidental repeat is not trimmed.
    expect(continuationAddition('a b', 'b c')).toBe('b c');
  });

  it('restores the space between sentences at the seam', () => {
    expect(
      continuationAddition('The quick brown fox jumps over.', 'Next one.'),
    ).toBe(' Next one.');
    expect(continuationAddition('He said "stop."', '"Why?" she')).toBe(
      ' "Why?" she',
    );
    // After a trimmed overlap too.
    expect(continuationAddition(`a ${SEAM}.`, `${SEAM}.Then more`)).toBe(
      ' Then more',
    );
    // Words and numbers split across parts stay joined.
    expect(continuationAddition('An exam', 'ple of it')).toBe('ple of it');
    expect(continuationAddition('Version 1.', '5 shipped')).toBe('5 shipped');
    expect(continuationAddition('See example.', 'com today')).toBe('com today');
    // Existing whitespace is not doubled.
    expect(continuationAddition('Done. ', 'Next')).toBe('Next');
    expect(continuationAddition('Done.', ' Next')).toBe(' Next');
  });
});

describe('continueOnLength (OpenAI-compatible)', () => {
  it('does nothing unless enabled, but flags truncation', async () => {
    const create = vi.fn().mockResolvedValue(openAIReply('cut', 'length'));
    const ai = openAI(create);
    const result = await ai.chat([{ role: 'user', content: 'go' }]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ content: 'cut', truncated: true });
  });

  it('continues, trims the seam, and sums usage', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIReply(`one ${SEAM}`, 'length', [10, 5]))
      .mockResolvedValueOnce(openAIReply(`${SEAM} two`, 'length', [20, 6]))
      .mockResolvedValueOnce(openAIReply(' three', 'stop', [30, 7]));
    const ai = openAI(create);
    const result = await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: true,
    });

    expect(result.content).toBe(`one ${SEAM} two three`);
    expect(result.parts).toBe(3);
    expect(result.truncated).toBe(false);
    expect(result.usage).toEqual({
      promptTokens: 60,
      completionTokens: 18,
      totalTokens: 78,
    });
    const second = create.mock.calls[1][0].messages;
    expect(second.slice(-2)).toEqual([
      { role: 'assistant', content: `one ${SEAM}` },
      expect.objectContaining({ role: 'user' }),
    ]);
  });

  it('stops at maxContinuations and reports truncated', async () => {
    const create = vi.fn().mockImplementation(async () => {
      const n = create.mock.calls.length;
      return openAIReply(`part-${n} `.repeat(3), 'length');
    });
    const ai = openAI(create);
    const result = await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: { maxContinuations: 1 },
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ parts: 2, truncated: true });
  });

  it('does not continue from an empty first part', async () => {
    const create = vi.fn().mockResolvedValue(openAIReply('', 'length'));
    const ai = openAI(create);
    const result = await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: true,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ content: '', truncated: true });

    create.mockClear();
    create.mockResolvedValue(openAIStream([], 'length'));
    const reasons: string[] = [];
    const text = await collect(
      ai.stream([{ role: 'user', content: 'go' }], {
        continueOnLength: true,
        onFinishReason: (reason) => reasons.push(reason),
      }),
    );
    expect(text).toBe('');
    expect(create).toHaveBeenCalledTimes(1);
    expect(reasons).toEqual(['length']);
  });

  it('applies the client default and reaches message()', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIReply('first ', 'length'))
      .mockResolvedValueOnce(openAIReply('second', 'stop'));
    const ai = openAI(create, { continueOnLength: true });
    expect(await ai.message('go')).toBe('first second');
  });

  it('never continues JSON output or tool use', async () => {
    const create = vi.fn().mockResolvedValue(openAIReply('{"a":', 'length'));
    const ai = openAI(create);
    const json = await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: true,
      responseFormat: { type: 'json_object' },
    });
    expect(json.truncated).toBe(true);
    const schema = await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: true,
      responseFormat: {
        type: 'json_schema',
        json_schema: {
          name: 'result',
          schema: { type: 'object' },
          strict: true,
        },
      },
    });
    expect(schema.truncated).toBe(true);
    const tools = await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: true,
      tools: [
        { type: 'function', function: { name: 'x', parameters: {} } },
      ] as any,
    });
    expect(tools.truncated).toBe(true);
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('streams one continuous stream across continuations', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIStream(['one ', SEAM], 'length'))
      .mockResolvedValueOnce(openAIStream([SEAM, ' two'], 'stop'));
    const ai = openAI(create);
    const seen: string[] = [];
    const text = await collect(
      ai.stream([{ role: 'user', content: 'go' }], {
        continueOnLength: true,
        onProgress: (chunk) => seen.push(chunk),
      }),
    );
    expect(text).toBe(`one ${SEAM} two`);
    expect(seen.join('')).toBe(text);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('reports the stream finish reason once, for the last part', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIStream(['one '], 'length'))
      .mockResolvedValueOnce(openAIStream(['two '], 'length'))
      .mockResolvedValueOnce(openAIStream(['three'], 'stop'));
    const reasons: string[] = [];
    await collect(
      openAI(create).stream([{ role: 'user', content: 'go' }], {
        continueOnLength: true,
        onFinishReason: (reason) => reasons.push(reason),
      }),
    );
    expect(reasons).toEqual(['stop']);

    const capped = vi
      .fn()
      .mockImplementation(async () => openAIStream(['more '], 'length'));
    reasons.length = 0;
    await collect(
      openAI(capped).stream([{ role: 'user', content: 'go' }], {
        continueOnLength: { maxContinuations: 1 },
        onFinishReason: (reason) => reasons.push(reason),
      }),
    );
    expect(capped).toHaveBeenCalledTimes(2);
    expect(reasons).toEqual(['length']);
  });
});

describe('continueOnLength failures', () => {
  it('stops before the next part once the caller aborts', async () => {
    const controller = new AbortController();
    const create = vi.fn().mockImplementation(async () => {
      controller.abort();
      return openAIReply('one ', 'length');
    });
    const ai = openAI(create);
    await expect(
      ai.chat([{ role: 'user', content: 'go' }], {
        continueOnLength: true,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'AI_ABORTED' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('stops a continued stream once the caller aborts', async () => {
    const controller = new AbortController();
    const create = vi.fn().mockImplementation(async () => {
      controller.abort();
      return openAIStream(['one '], 'length');
    });
    const ai = openAI(create);
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const chunk of ai.stream([{ role: 'user', content: 'go' }], {
          continueOnLength: true,
          signal: controller.signal,
        })) {
          seen.push(chunk);
        }
      })(),
    ).rejects.toMatchObject({ code: 'AI_ABORTED' });
    expect(seen).toEqual(['one ']);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('throws when a later part fails, without returning partial text', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIReply('one ', 'length'))
      .mockRejectedValueOnce(new Error('upstream down'));
    const ai = openAI(create);
    await expect(
      ai.chat([{ role: 'user', content: 'go' }], { continueOnLength: true }),
    ).rejects.toThrow('upstream down');
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('continueOnLength with rate limiting', () => {
  // Same stack getAI() builds: continuation outside the rate limiter.
  function limitedOpenAI(create: ReturnType<typeof vi.fn>) {
    const options = {
      apiKey: 'test',
      defaultModel: 'gpt-4o',
      rateLimit: {
        key: 'continuation-test',
        maxAttempts: 3,
        initialDelayMs: 1,
      },
    };
    const provider = new OpenAIProvider(options);
    (provider as any).client = { chat: { completions: { create } } };
    return createContinuingAI(
      createRateLimitedAI(provider as AIInterface, options),
      options,
      provider as AIInterface,
    );
  }

  it('retries only the part that hit the rate limit', async () => {
    __resetAIRateLimitStateForTests();
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIReply('one ', 'length'))
      .mockRejectedValueOnce(new RateLimitError('openai'))
      .mockResolvedValueOnce(openAIReply('two', 'stop'));
    const ai = limitedOpenAI(create);
    const result = await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: true,
    });
    expect(result).toMatchObject({ content: 'one two', parts: 2 });
    // part 1 once, part 2 twice: part 1 is never re-requested.
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[2][0].messages.at(-2)).toEqual({
      role: 'assistant',
      content: 'one',
    });
  });

  it('paces each part of a continued complete() on its own', async () => {
    __resetAIRateLimitStateForTests();
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIReply('one ', 'length'))
      .mockRejectedValueOnce(new RateLimitError('openai'))
      .mockResolvedValueOnce(openAIReply('two', 'stop'));
    const ai = limitedOpenAI(create);
    const result = await ai.complete('go', { continueOnLength: true });
    expect(result.content).toBe('one two');
    expect(create).toHaveBeenCalledTimes(3);
  });
});

describe('continueOnLength (Anthropic)', () => {
  it('continues on stop_reason max_tokens', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: `alpha ${SEAM}` }],
        model: 'claude-test',
        stop_reason: 'max_tokens',
        usage: { input_tokens: 4, output_tokens: 2 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: `${SEAM} beta` }],
        model: 'claude-test',
        stop_reason: 'end_turn',
        usage: { input_tokens: 6, output_tokens: 3 },
      });
    const provider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test',
      defaultModel: 'claude-test',
    });
    (provider as any).client = { messages: { create } };
    const ai = createContinuingAI(provider as AIInterface, {});
    const result = await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: true,
    });
    expect(result.content).toBe(`alpha ${SEAM} beta`);
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it('streams across continuations using the message_delta stop reason', async () => {
    async function* events(text: string, stop: string) {
      yield {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text },
      };
      yield { type: 'message_delta', delta: { stop_reason: stop } };
    }
    const create = vi
      .fn()
      .mockResolvedValueOnce(events('alpha ', 'max_tokens'))
      .mockResolvedValueOnce(events('beta', 'end_turn'));
    const provider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test',
      defaultModel: 'claude-test',
    });
    (provider as any).client = { messages: { create } };
    const ai = createContinuingAI(provider as AIInterface, {});
    expect(
      await collect(
        ai.stream([{ role: 'user', content: 'go' }], {
          continueOnLength: true,
        }),
      ),
    ).toBe('alpha beta');
  });
});

describe('continueOnLength (Gemini)', () => {
  it('maps MAX_TOKENS to length and continues', async () => {
    const reply = (text: string, finishReason: string, total: number) => ({
      text,
      candidates: [{ finishReason, content: { parts: [{ text }] } }],
      usageMetadata: {
        promptTokenCount: total - 1,
        candidatesTokenCount: 1,
        totalTokenCount: total,
      },
    });
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce(reply('uno ', 'MAX_TOKENS', 5))
      .mockResolvedValueOnce(reply('dos', 'STOP', 7));
    const provider = new GeminiProvider({
      type: 'gemini',
      apiKey: 'test',
      defaultModel: 'gemini-2.5-flash',
    });
    (provider as any).client = { models: { generateContent } };
    const ai = createContinuingAI(provider as AIInterface, {});
    const result = await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: true,
    });
    expect(result.content).toBe('uno dos');
    expect(result.usage?.totalTokens).toBe(12);
    expect(result.parts).toBe(2);
  });

  it('streams across continuations using candidate finishReason', async () => {
    async function* chunks(text: string, finishReason: string) {
      yield { text, candidates: [{ finishReason }] };
    }
    const generateContentStream = vi
      .fn()
      .mockResolvedValueOnce(chunks('uno ', 'MAX_TOKENS'))
      .mockResolvedValueOnce(chunks('dos', 'STOP'));
    const provider = new GeminiProvider({
      type: 'gemini',
      apiKey: 'test',
      defaultModel: 'gemini-2.5-flash',
    });
    (provider as any).client = { models: { generateContentStream } };
    const ai = createContinuingAI(provider as AIInterface, {});
    expect(
      await collect(
        ai.stream([{ role: 'user', content: 'go' }], {
          continueOnLength: true,
        }),
      ),
    ).toBe('uno dos');
  });
});

describe('continueOnLength (Ollama)', () => {
  it('continues complete() through chat', async () => {
    const provider = new OllamaProvider({
      type: 'ollama',
      defaultModel: 'llama3',
    });
    const requestJson = vi
      .fn()
      .mockResolvedValueOnce({
        model: 'llama3',
        message: { role: 'assistant', content: 'uno ' },
        done_reason: 'length',
      })
      .mockResolvedValueOnce({
        model: 'llama3',
        message: { role: 'assistant', content: 'dos' },
        done_reason: 'stop',
      });
    (provider as any).requestJson = requestJson;
    const ai = createContinuingAI(provider as AIInterface, {});
    const result = await ai.complete('go', { continueOnLength: true });
    expect(result).toMatchObject({ content: 'uno dos', parts: 2 });
    expect(requestJson.mock.calls.map((call) => call[0])).toEqual([
      '/chat',
      '/chat',
    ]);
  });
});

describe('continueOnLength (Bedrock)', () => {
  it('continues on stopReason max_tokens', async () => {
    const reply = (text: string, stopReason: string) => ({
      output: { message: { role: 'assistant', content: [{ text }] } },
      stopReason,
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    });
    const converse = vi
      .fn()
      .mockResolvedValueOnce(reply('uno ', 'max_tokens'))
      .mockResolvedValueOnce(reply('dos', 'end_turn'));
    const provider = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
      defaultModel: 'anthropic.claude-test',
    });
    (provider as any).client = { converse };
    const ai = createContinuingAI(provider as AIInterface, {});
    const result = await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: true,
    });
    expect(result).toMatchObject({ content: 'uno dos', parts: 2 });
    expect(result.usage?.totalTokens).toBe(10);
    expect(converse).toHaveBeenCalledTimes(2);
  });
});
