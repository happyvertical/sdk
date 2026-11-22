/**
 * Usage parts per provider (sdk#1576, review round 1): count-less requests,
 * one part per completed request, one call id across a method's requests,
 * events before finish callbacks, and `last` on continued replies.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContinuingAI } from './shared/continuation';
import { AnthropicProvider } from './shared/providers/anthropic';
import { BedrockProvider } from './shared/providers/bedrock';
import { GeminiProvider } from './shared/providers/gemini';
import { HuggingFaceProvider } from './shared/providers/huggingface';
import { OllamaProvider } from './shared/providers/ollama';
import { OpenAIProvider } from './shared/providers/openai';
import { Qwen3TTSProvider } from './shared/providers/qwen-tts';
import { emitUsage } from './shared/providers/usage';
import {
  __resetAIRateLimitStateForTests,
  createRateLimitedAI,
} from './shared/rate-limit';
import {
  type AIInterface,
  type ChatOptions,
  type PartedUsageEvent,
  RateLimitError,
} from './shared/types';
import { createUsagePartsAI } from './shared/usage-parts';

const SEAM = 'the quick brown fox jumps over';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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

function gemini(models: Record<string, unknown>) {
  const { events, onUsage } = recorder();
  const provider = new GeminiProvider({
    type: 'gemini',
    apiKey: 'test',
    defaultModel: 'gemini-test',
    onUsage,
  });
  (provider as any).client = { models };
  return { provider, ai: wrap(provider as AIInterface), events };
}

function bedrock(client: Record<string, unknown>) {
  const { events, onUsage } = recorder();
  const provider = new BedrockProvider({
    type: 'bedrock',
    region: 'us-east-1',
    defaultModel: 'anthropic.claude-test',
    onUsage,
  });
  (provider as any).client = client;
  return { ai: wrap(provider as AIInterface), events };
}

function body(payload: unknown) {
  return { body: new TextEncoder().encode(JSON.stringify(payload)) };
}

function openAIReply(content: string, finish: string, usage?: unknown) {
  return {
    choices: [{ message: { content }, finish_reason: finish }],
    model: 'gpt-4o',
    ...(usage !== undefined ? { usage } : {}),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a request without token counters is count-less, not zero', () => {
  const geminiReply = (usageMetadata?: unknown) => ({
    text: 'ok',
    candidates: [{ finishReason: 'STOP' }],
    ...(usageMetadata !== undefined ? { usageMetadata } : {}),
  });

  it('Gemini chat: absent and empty usageMetadata are count-less; reported zeros are counted', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce(geminiReply())
      .mockResolvedValueOnce(geminiReply({}))
      .mockResolvedValueOnce(
        geminiReply({
          promptTokenCount: 0,
          candidatesTokenCount: 0,
          totalTokenCount: 0,
        }),
      );
    const { ai, events } = gemini({ generateContent });
    const absent = await ai.chat([{ role: 'user', content: 'go' }]);
    const empty = await ai.chat([{ role: 'user', content: 'go' }]);
    const zeros = await ai.chat([{ role: 'user', content: 'go' }]);

    expect(events.map((event) => event.usage)).toEqual([
      undefined,
      undefined,
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    ]);
    expect(absent.usageParts?.complete).toBe(false);
    expect(empty.usageParts?.complete).toBe(false);
    expect(zeros.usageParts?.complete).toBe(true);
    // The response's own usage is unchanged.
    expect(absent.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  it('Anthropic chat: a response without usage is count-less; reported zeros are counted', async () => {
    const reply = (usage?: unknown) => ({
      content: [{ type: 'text', text: 'ok' }],
      model: 'claude-test',
      stop_reason: 'end_turn',
      ...(usage !== undefined ? { usage } : {}),
    });
    const create = vi
      .fn()
      .mockResolvedValueOnce(reply())
      .mockResolvedValueOnce(reply({}))
      .mockResolvedValueOnce(reply({ input_tokens: 0, output_tokens: 0 }));
    const { events, onUsage } = recorder();
    const provider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test',
      defaultModel: 'claude-test',
      onUsage,
    });
    (provider as any).client = { messages: { create } };
    const ai = wrap(provider as AIInterface);

    const absent = await ai.chat([{ role: 'user', content: 'go' }]);
    await ai.chat([{ role: 'user', content: 'go' }]);
    const zeros = await ai.chat([{ role: 'user', content: 'go' }]);

    expect(events.map((event) => event.usage)).toEqual([
      undefined,
      undefined,
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    ]);
    expect(absent.usageParts?.complete).toBe(false);
    expect(zeros.usageParts?.complete).toBe(true);
  });

  it('Bedrock Converse: an empty usage object is count-less', async () => {
    const reply = (usage: unknown) => ({
      output: { message: { role: 'assistant', content: [{ text: 'ok' }] } },
      stopReason: 'end_turn',
      usage,
    });
    const converse = vi
      .fn()
      .mockResolvedValueOnce(reply({}))
      .mockResolvedValueOnce(
        reply({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
      );
    const { ai, events } = bedrock({ converse });

    const empty = await ai.chat([{ role: 'user', content: 'go' }]);
    const zeros = await ai.chat([{ role: 'user', content: 'go' }]);

    expect(events[0].usage).toBeUndefined();
    expect(events[1].usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
    expect(empty.usageParts?.complete).toBe(false);
    expect(zeros.usageParts?.complete).toBe(true);
  });

  it('Ollama embed: an omitted prompt_eval_count is count-less; an explicit zero is counted', async () => {
    const { events, onUsage } = recorder();
    const provider = new OllamaProvider({
      type: 'ollama',
      defaultModel: 'llama3',
      onUsage,
    });
    (provider as any).resolveModel = vi.fn().mockResolvedValue('embed');
    (provider as any).requestJson = vi
      .fn()
      .mockResolvedValueOnce({ model: 'embed', embeddings: [[0.1]] })
      .mockResolvedValueOnce({
        model: 'embed',
        embeddings: [[0.1]],
        prompt_eval_count: 0,
      });
    const ai = wrap(provider as AIInterface);
    await ai.embed('a');
    await ai.embed('a');
    expect(events[0].usage).toBeUndefined();
    expect(events[1].usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    });
  });

  it('OpenAI-compatible chat: an empty usage object is count-less', async () => {
    const { events, onUsage } = recorder();
    const provider = new OpenAIProvider({ apiKey: 'test', onUsage });
    (provider as any).client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(openAIReply('ok', 'stop', {})),
        },
      },
    };
    const result = await wrap(provider as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(events[0].usage).toBeUndefined();
    expect(result.usageParts?.complete).toBe(false);
  });
});

describe('batch embeddings report one part per completed request', () => {
  it('Gemini: one event per input, counts from embeddings[].statistics, last only on the final one', async () => {
    const embedContent = vi
      .fn()
      .mockResolvedValueOnce({
        embeddings: [{ values: [0.1], statistics: { tokenCount: 3 } }],
      })
      .mockResolvedValueOnce({ embeddings: [{ values: [0.2] }] });
    const { ai, events } = gemini({ embedContent });

    const result = await ai.embed(['a', 'b']);

    expect(result.embeddings).toEqual([[0.1], [0.2]]);
    expect(result.usage).toEqual({
      promptTokens: 3,
      completionTokens: 0,
      totalTokens: 3,
    });
    const call = events[0].part.call;
    expect(events.map((event) => event.part)).toEqual([
      { call, index: 0 },
      { call, index: 1, last: true },
    ]);
    expect(events.map((event) => event.usage)).toEqual([
      { promptTokens: 3, completionTokens: 0, totalTokens: 3 },
      undefined,
    ]);
  });

  it('Gemini: a failure on the second input leaves the first reported and nothing marked last', async () => {
    const embedContent = vi
      .fn()
      .mockResolvedValueOnce({
        embeddings: [{ values: [0.1], statistics: { tokenCount: 3 } }],
      })
      .mockRejectedValueOnce(new Error('boom'));
    const { ai, events } = gemini({ embedContent });

    await expect(ai.embed(['a', 'b'])).rejects.toThrow();
    expect(events).toHaveLength(1);
    expect(events[0].part.last).toBeUndefined();
    expect(events[0].usage?.totalTokens).toBe(3);
  });

  it('Gemini and Bedrock: an empty batch emits no part', async () => {
    const embedContent = vi.fn();
    const g = gemini({ embedContent });
    await g.ai.embed([]);
    expect(g.events).toHaveLength(0);

    const invokeModel = vi.fn();
    const b = bedrock({ invokeModel });
    await b.ai.embed([]);
    expect(b.events).toHaveLength(0);
  });

  it('Bedrock: one event per input with its own count', async () => {
    const invokeModel = vi
      .fn()
      .mockResolvedValueOnce(body({ embedding: [0.1], inputTextTokenCount: 4 }))
      .mockResolvedValueOnce(body({ embedding: [0.2] }));
    const { ai, events } = bedrock({ invokeModel });

    await ai.embed(['a', 'b']);

    const call = events[0].part.call;
    expect(events.map((event) => event.part)).toEqual([
      { call, index: 0 },
      { call, index: 1, last: true },
    ]);
    expect(events[0].usage?.totalTokens).toBe(4);
    expect(events[1].usage).toBeUndefined();
  });
});

describe('embedImage keeps one call id across its two requests', () => {
  it('OpenAI: description then embedding, indexes 0 and 1, last only on the embedding, tags on both', async () => {
    const { events, onUsage } = recorder();
    const provider = new OpenAIProvider({
      apiKey: 'test',
      defaultModel: 'gpt-4o',
      onUsage,
    });
    (provider as any).client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(
            openAIReply('a red square', 'stop', {
              prompt_tokens: 5,
              completion_tokens: 3,
              total_tokens: 8,
            }),
          ),
        },
      },
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: [0.1] }],
          model: 'text-embedding-3-small',
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }),
      },
    };

    await wrap(provider as AIInterface).embedImage(PNG, {
      usageTags: { feature: 'image-search' },
    });

    expect(events).toHaveLength(2);
    const call = events[0].part.call;
    expect(events.map((event) => event.part)).toEqual([
      { call, index: 0 },
      { call, index: 1, last: true },
    ]);
    expect(events.map((event) => event.operation)).toEqual(['chat', 'embed']);
    expect(events.map((event) => event.tags)).toEqual([
      { feature: 'image-search' },
      { feature: 'image-search' },
    ]);
  });

  it('Ollama: description then embedding share the call, last only on the embedding', async () => {
    const { events, onUsage } = recorder();
    const provider = new OllamaProvider({
      type: 'ollama',
      defaultModel: 'llava',
      onUsage,
    });
    (provider as any).resolveModel = vi.fn().mockResolvedValue('embed');
    (provider as any).requestJson = vi.fn(async (path: string) =>
      path === '/embed'
        ? { model: 'embed', embeddings: [[0.1]], prompt_eval_count: 2 }
        : {
            model: 'llava',
            message: { role: 'assistant', content: 'a red square' },
            done_reason: 'stop',
            prompt_eval_count: 4,
            eval_count: 3,
          },
    );

    await wrap(provider as AIInterface).embedImage(PNG);

    const call = events[0].part.call;
    expect(events.map((event) => event.part)).toEqual([
      { call, index: 0 },
      { call, index: 1, last: true },
    ]);
  });
});

describe('completed requests on formerly silent operations emit their event', () => {
  it('Gemini describeImage reports its usage', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: 'a red square',
      usageMetadata: {
        promptTokenCount: 9,
        candidatesTokenCount: 4,
        totalTokenCount: 13,
      },
    });
    const { ai, events } = gemini({ generateContent });
    await ai.describeImage(PNG, 'what');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      operation: 'describeImage',
      usage: { promptTokens: 9, completionTokens: 4, totalTokens: 13 },
      part: { index: 0, last: true },
    });
  });

  it('Gemini native image embedding and image generation emit events', async () => {
    const { ai, events } = gemini({
      embedContent: vi.fn().mockResolvedValue({
        embeddings: [{ values: [0.1] }],
      }),
      generateImages: vi.fn().mockResolvedValue({
        generatedImages: [{ image: { imageBytes: PNG.toString('base64') } }],
      }),
    });
    await ai.embedImage(PNG);
    await ai.generateImage('a red square');
    expect(events.map((event) => [event.operation, event.part.last])).toEqual([
      ['embedImage', true],
      ['generateImage', true],
    ]);
    expect(events.every((event) => event.usage === undefined)).toBe(true);
  });

  it('OpenAI image generation reports gpt-image token usage', async () => {
    const { events, onUsage } = recorder();
    const provider = new OpenAIProvider({ apiKey: 'test', onUsage });
    (provider as any).client = {
      images: {
        generate: vi.fn().mockResolvedValue({
          data: [{ b64_json: PNG.toString('base64') }],
          usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
        }),
      },
    };
    await wrap(provider as AIInterface).generateImage('a red square', {
      model: 'gpt-image-1',
    });
    expect(events[0]).toMatchObject({
      operation: 'generateImage',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      part: { index: 0, last: true },
    });
  });

  it('Bedrock and Ollama image generation emit count-less events', async () => {
    const b = bedrock({
      invokeModel: vi
        .fn()
        .mockResolvedValue(body({ images: [PNG.toString('base64')] })),
    });
    await b.ai.generateImage('a red square');
    expect(b.events[0]).toMatchObject({
      operation: 'generateImage',
      part: { index: 0, last: true },
    });

    const { events, onUsage } = recorder();
    const ollama = new OllamaProvider({
      type: 'ollama',
      defaultModel: 'llama3',
      onUsage,
    });
    (ollama as any).resolveModel = vi.fn().mockResolvedValue('flux');
    (ollama as any).requestJson = vi.fn().mockResolvedValue({
      data: [{ b64_json: PNG.toString('base64') }],
    });
    await wrap(ollama as AIInterface).generateImage('a red square');
    expect(events[0]).toMatchObject({
      operation: 'generateImage',
      part: { index: 0, last: true },
    });
  });

  it('Qwen3-TTS speech synthesis emits an event', async () => {
    const { events, onUsage } = recorder();
    const provider = new Qwen3TTSProvider({ type: 'qwen3-tts', onUsage });
    (provider as any).request = vi.fn().mockResolvedValue({
      audio: Buffer.from('audio').toString('base64'),
      mime_type: 'audio/wav',
      duration: 1,
      sample_rate: 24000,
    });
    await wrap(provider as unknown as AIInterface).synthesizeSpeech('hello');
    expect(events[0]).toMatchObject({
      operation: 'synthesizeSpeech',
      part: { index: 0, last: true },
    });
  });
});

describe('Hugging Face stream reports its request when it completes', () => {
  it('emits one event even when the consumer stops after the first chunk', async () => {
    const { events, onUsage } = recorder();
    const provider = new HuggingFaceProvider({
      type: 'huggingface',
      apiToken: 'test',
      defaultModel: 'gpt2',
      onUsage,
    });
    (provider as any).makeRequest = vi
      .fn()
      .mockResolvedValue([{ generated_text: 'a reply long enough to chunk' }]);
    for await (const _chunk of wrap(provider as AIInterface).stream([
      { role: 'user', content: 'go' },
    ])) {
      break;
    }
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      operation: 'stream',
      part: { index: 0, last: true },
    });
  });
});

describe('a throwing finish callback cannot suppress the event', () => {
  const throwing: Pick<ChatOptions, 'onFinishReason'> = {
    onFinishReason: () => {
      throw new Error('callback failed');
    },
  };

  it('OpenAI-compatible stream', async () => {
    const { events, onUsage } = recorder();
    const provider = new OpenAIProvider({ apiKey: 'test', onUsage });
    async function* chunks() {
      yield { choices: [{ delta: { content: 'ok' }, finish_reason: null }] };
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
    }
    (provider as any).client = {
      chat: { completions: { create: vi.fn().mockResolvedValue(chunks()) } },
    };
    await expect(
      collect(
        wrap(provider as AIInterface).stream(
          [{ role: 'user', content: 'go' }],
          throwing,
        ),
      ),
    ).rejects.toThrow('callback failed');
    expect(events).toHaveLength(1);
    expect(events[0].part).toMatchObject({ index: 0, last: true });
  });

  it('Anthropic stream', async () => {
    const { events, onUsage } = recorder();
    const provider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test',
      defaultModel: 'claude-test',
      onUsage,
    });
    async function* chunks() {
      yield {
        type: 'message_start',
        message: { usage: { input_tokens: 3, output_tokens: 1 } },
      };
      yield {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'ok' },
      };
      yield {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 2 },
      };
    }
    (provider as any).client = {
      messages: { create: vi.fn().mockResolvedValue(chunks()) },
    };
    await expect(
      collect(
        wrap(provider as AIInterface).stream(
          [{ role: 'user', content: 'go' }],
          throwing,
        ),
      ),
    ).rejects.toThrow('callback failed');
    expect(events).toHaveLength(1);
    expect(events[0].usage?.totalTokens).toBe(5);
  });
});

describe('a stream’s terminal usage chunk is reported', () => {
  it('OpenAI-compatible stream keeps the server’s usage chunk', async () => {
    const { events, onUsage } = recorder();
    const provider = new OpenAIProvider({ apiKey: 'test', onUsage });
    async function* chunks() {
      yield { choices: [{ delta: { content: 'ok' }, finish_reason: null }] };
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
      yield {
        choices: [],
        usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 },
      };
    }
    (provider as any).client = {
      chat: { completions: { create: vi.fn().mockResolvedValue(chunks()) } },
    };
    await collect(
      wrap(provider as AIInterface).stream([{ role: 'user', content: 'go' }]),
    );
    expect(events[0].usage).toEqual({
      promptTokens: 7,
      completionTokens: 2,
      totalTokens: 9,
    });
  });
});

describe('options with prototype getters', () => {
  it('keep their model and usage tags through the recorder copy', async () => {
    class EmbeddingRequest {
      get model() {
        return 'text-embedding-3-large';
      }
      get usageTags() {
        return { feature: 'getter' };
      }
    }
    const { events, onUsage } = recorder();
    const provider = new OpenAIProvider({ apiKey: 'test', onUsage });
    const create = vi.fn().mockResolvedValue({
      data: [{ embedding: [0.1] }],
      usage: { prompt_tokens: 1, total_tokens: 1 },
    });
    (provider as any).client = { embeddings: { create } };
    const options = new EmbeddingRequest();

    await wrap(provider as AIInterface).embed('a', options);

    expect(create.mock.calls[0][0].model).toBe('text-embedding-3-large');
    expect(events[0].tags).toEqual({ feature: 'getter' });
    // The caller's object is untouched.
    expect(Object.getOwnPropertySymbols(options)).toEqual([]);
  });
});

describe('`last` on continued replies', () => {
  function continuing(replies: Array<[string, string]>) {
    const { events, onUsage } = recorder();
    const provider = new OpenAIProvider({
      apiKey: 'test',
      defaultModel: 'gpt-4o',
      onUsage,
    });
    const create = vi.fn();
    for (const [text, finish] of replies) {
      create.mockResolvedValueOnce(
        openAIReply(text, finish, {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        }),
      );
    }
    (provider as any).client = { chat: { completions: { create } } };
    return { ai: wrap(provider as AIInterface), events };
  }

  it('marks a continued message() part that stopped for another reason', async () => {
    const { ai, events } = continuing([
      [`one ${SEAM}`, 'length'],
      [`${SEAM} two`, 'stop'],
    ]);
    await ai.message('go', { continueOnLength: true });
    const call = events[0].part.call;
    expect(events.map((event) => event.part)).toEqual([
      { call, index: 0 },
      { call, index: 1, last: true },
    ]);
  });

  it('marks the part at the maxContinuations cap even when it hit the limit', async () => {
    const { ai, events } = continuing([
      [`one ${SEAM}`, 'length'],
      [`${SEAM} two`, 'length'],
    ]);
    const result = await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: { maxContinuations: 1 },
    });
    expect(result.truncated).toBe(true);
    expect(events.map((event) => event.part.last)).toEqual([undefined, true]);
  });

  it('marks a single continued part that did not hit the limit', async () => {
    const { ai, events } = continuing([['short', 'stop']]);
    await ai.message('go', { continueOnLength: true });
    expect(events[0].part).toMatchObject({ index: 0, last: true });
  });

  it('marks the last part of a continued stream at the cap', async () => {
    const { events, onUsage } = recorder();
    const provider = new OpenAIProvider({
      apiKey: 'test',
      defaultModel: 'gpt-4o',
      onUsage,
    });
    async function* chunks(text: string) {
      yield { choices: [{ delta: { content: text }, finish_reason: null }] };
      yield { choices: [{ delta: {}, finish_reason: 'length' }] };
    }
    (provider as any).client = {
      chat: {
        completions: {
          create: vi
            .fn()
            .mockResolvedValueOnce(chunks(`one ${SEAM}`))
            .mockResolvedValueOnce(chunks(`${SEAM} two`)),
        },
      },
    };
    await collect(
      wrap(provider as AIInterface).stream([{ role: 'user', content: 'go' }], {
        continueOnLength: { maxContinuations: 1 },
      }),
    );
    expect(events.map((event) => event.part.last)).toEqual([undefined, true]);
  });
});

describe('pacing retries', () => {
  afterEach(() => {
    __resetAIRateLimitStateForTests();
  });

  it('never reuse an index, even if a request emitted before a rate-limit error', async () => {
    const { events, onUsage } = recorder();
    const providerOptions = { onUsage };
    let attempts = 0;
    const fake = {
      async chat(_messages: unknown, options: ChatOptions = {}) {
        attempts++;
        emitUsage(
          providerOptions,
          'fake',
          'chat',
          'm',
          { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          Date.now(),
          undefined,
          options,
          { finishReason: 'stop' },
        );
        if (attempts === 1) {
          throw new RateLimitError('fake', 0, {});
        }
        return { content: 'ok', finishReason: 'stop' as const };
      },
    } as unknown as AIInterface;
    const paced = createRateLimitedAI(fake, {
      type: 'openai',
      apiKey: 'k',
      rateLimit: {
        enabled: true,
        key: 'usage-parts-retry',
        initialDelayMs: 1,
        maxAttempts: 2,
      },
    } as any);
    const ai = createUsagePartsAI(createContinuingAI(paced, {}, fake));

    await ai.chat([{ role: 'user', content: 'go' }]);

    expect(attempts).toBe(2);
    expect(events.map((event) => event.part.index)).toEqual([0, 1]);
    expect(new Set(events.map((event) => event.part.call)).size).toBe(1);
  });
});
