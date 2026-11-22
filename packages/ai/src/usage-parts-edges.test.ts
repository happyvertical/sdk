/**
 * Usage parts edge cases (sdk#1576, review round 2): no replay after an
 * attempt reported usage, the continuation cap flag, partial and gateway
 * counters, tags and model on every path, batch snapshots, options classes,
 * usage-only stream chunks, and direct multi-request calls.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContinuingAI } from './shared/continuation';
import { BedrockProvider } from './shared/providers/bedrock';
import { ChatGPTPlanProvider } from './shared/providers/chatgpt-plan';
import { GeminiProvider } from './shared/providers/gemini';
import { OpenAIProvider } from './shared/providers/openai';
import { Qwen3TTSProvider } from './shared/providers/qwen-tts';
import { emitUsage } from './shared/providers/usage';
import {
  __resetAIRateLimitStateForTests,
  createRateLimitedAI,
} from './shared/rate-limit';
import { createObservedAI } from './shared/safety';
import {
  type AIInterface,
  type ChatOptions,
  type PartedUsageEvent,
  RateLimitError,
} from './shared/types';
import { createUsagePartsAI } from './shared/usage-parts';

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

function body(payload: unknown) {
  return { body: new TextEncoder().encode(JSON.stringify(payload)) };
}

async function collect(iterable: AsyncIterable<unknown>) {
  const out: unknown[] = [];
  for await (const chunk of iterable) out.push(chunk);
  return out;
}

const pacing = {
  enabled: true,
  initialDelayMs: 1,
  maxAttempts: 3,
};

afterEach(() => {
  vi.restoreAllMocks();
  __resetAIRateLimitStateForTests();
});

describe('no replay after an attempt reported usage', () => {
  it('ChatGPT plan: a RateLimitError from onFinishReason after the event is thrown, not retried', async () => {
    const { events, onUsage } = recorder();
    const options = {
      type: 'chatgpt-plan' as const,
      clientId: 'client',
      sessionManager: { accessToken: async () => 'token' },
      onUsage,
      rateLimit: { ...pacing, key: 'usage-parts-chatgpt-plan' },
    };
    const provider = new ChatGPTPlanProvider(options as any);
    const upstream = vi.fn(async function* () {
      yield { delta: 'ok' };
      yield {
        completed: {
          model: 'gpt-plan',
          usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
        },
      };
    });
    (provider as any).events = upstream;
    const paced = createRateLimitedAI(provider as AIInterface, options as any);
    const ai = createUsagePartsAI(
      createContinuingAI(paced, {}, provider as AIInterface),
    );

    await expect(
      ai.chat([{ role: 'user', content: 'go' }], {
        onFinishReason: () => {
          throw new RateLimitError('chatgpt-plan', 0, {});
        },
      }),
    ).rejects.toBeInstanceOf(RateLimitError);

    expect(upstream).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0].part).toMatchObject({ index: 0, last: true });
  });

  it('a rate-limit failure before any usage is still retried', async () => {
    const { events, onUsage } = recorder();
    let attempts = 0;
    const fake = {
      async chat(_messages: unknown, options: ChatOptions = {}) {
        attempts++;
        if (attempts === 1) throw new RateLimitError('fake', 0, {});
        emitUsage(
          { onUsage },
          'fake',
          'chat',
          'm',
          undefined,
          Date.now(),
          undefined,
          options,
          { finishReason: 'stop' },
        );
        return { content: 'ok', finishReason: 'stop' as const };
      },
    } as unknown as AIInterface;
    const paced = createRateLimitedAI(fake, {
      type: 'openai',
      apiKey: 'k',
      rateLimit: { ...pacing, key: 'usage-parts-pre-emit' },
    } as any);
    await createUsagePartsAI(createContinuingAI(paced, {}, fake)).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(attempts).toBe(2);
    expect(events.map((event) => event.part.index)).toEqual([0]);
  });
});

describe('the continuation layer flags the capped request', () => {
  it('does not mark a part last because its index reached the cap', async () => {
    const { events, onUsage } = recorder();
    let requests = 0;
    // The first request reports two parts (as a provider that padded or
    // split its report might); only the capped second request is last.
    const fake = {
      async chat(_messages: unknown, options: ChatOptions = {}) {
        requests++;
        const emit = () =>
          emitUsage(
            { onUsage },
            'fake',
            'chat',
            'm',
            undefined,
            Date.now(),
            undefined,
            options,
            { finishReason: 'length' },
          );
        emit();
        if (requests === 1) emit();
        return {
          content: requests === 1 ? 'first part ' : 'second part',
          finishReason: 'length' as const,
        };
      },
    } as unknown as AIInterface;
    await wrap(fake).chat([{ role: 'user', content: 'go' }], {
      continueOnLength: { maxContinuations: 1 },
    });
    expect(requests).toBe(2);
    expect(events.map((event) => event.part.last)).toEqual([
      undefined,
      undefined,
      true,
    ]);
  });
});

describe('partial counters never give a zero total', () => {
  it('Bedrock without totalTokens derives it from input and output', async () => {
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
        usage: { inputTokens: 7, outputTokens: 3 },
      }),
    };
    const result = await wrap(provider as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(events[0].usage).toEqual({
      promptTokens: 7,
      completionTokens: 3,
      totalTokens: 10,
    });
    expect(result.usage?.totalTokens).toBe(10);
  });

  it('Gemini without totalTokenCount derives it', async () => {
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
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 },
        }),
      },
    };
    await wrap(provider as AIInterface).chat([{ role: 'user', content: 'go' }]);
    expect(events[0].usage?.totalTokens).toBe(6);
  });

  it('OpenAI-compatible without total_tokens derives it', async () => {
    const { events, onUsage } = recorder();
    const provider = new OpenAIProvider({ apiKey: 'test', onUsage });
    (provider as any).client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 1 },
          }),
        },
      },
    };
    await wrap(provider as AIInterface).chat([{ role: 'user', content: 'go' }]);
    expect(events[0].usage?.totalTokens).toBe(6);
  });
});

describe('gateway cost and cache figures are reported', () => {
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

  it('a cost-only usage object reaches the event and the response', async () => {
    const { ai, events } = openAIWith({ cost: { total_cost: 0.0125 } });
    const result = await ai.chat([{ role: 'user', content: 'go' }]);
    expect(events[0].usage?.costUsd).toBe(0.0125);
    expect(result.usage?.costUsd).toBe(0.0125);
  });

  it('a cache-only usage object is reported with its cache counters', async () => {
    const { ai, events } = openAIWith({
      prompt_tokens_details: { cached_tokens: 5 },
    });
    await ai.chat([{ role: 'user', content: 'go' }]);
    expect(events[0].usage).toMatchObject({
      cacheReadInputTokens: 5,
      promptTokens: 5,
      totalTokens: 5,
    });
  });
});

describe('per-call tags and model identity on image embeddings and speech', () => {
  it('Bedrock embedImage carries the call’s tags, never on the wire', async () => {
    const { events, onUsage } = recorder();
    const provider = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
      usageTags: { team: 'global' },
      onUsage,
    });
    const invokeModel = vi.fn().mockResolvedValue(body({ embedding: [0.1] }));
    (provider as any).client = { invokeModel };
    await wrap(provider as AIInterface).embedImage(PNG, {
      usageTags: { team: 'call-override', feature: 'image' },
    });
    expect(events[0].tags).toEqual({ team: 'call-override', feature: 'image' });
    expect(JSON.stringify(invokeModel.mock.calls[0])).not.toContain(
      'call-override',
    );
  });

  it('Qwen3-TTS synthesis: call tags on the event, endpoint model as its label, neither on the wire', async () => {
    const { events, onUsage } = recorder();
    const provider = new Qwen3TTSProvider({
      type: 'qwen3-tts',
      defaultModel: 'qwen3-tts-1.7b',
      onUsage,
    });
    const request = vi.fn().mockResolvedValue({
      audio: Buffer.from('audio').toString('base64'),
      mime_type: 'audio/wav',
      duration: 1,
      sample_rate: 24000,
    });
    (provider as any).request = request;
    const ai = wrap(provider as unknown as AIInterface);
    await ai.synthesizeSpeech('hello', {
      model: 'some-other-model',
      usageTags: { feature: 'tts' },
    } as any);
    expect(events[0]).toMatchObject({
      model: 'qwen3-tts-1.7b',
      tags: { feature: 'tts' },
    });
    const wire = JSON.stringify(request.mock.calls[0]);
    expect(wire).not.toContain('some-other-model');
    expect(wire).not.toContain('tts"}');
    expect(wire).not.toContain('usageTags');
  });

  it('Qwen3-TTS streaming: call tags and endpoint model on the event', async () => {
    const { events, onUsage } = recorder();
    const provider = new Qwen3TTSProvider({
      type: 'qwen3-tts',
      defaultModel: 'qwen3-tts-1.7b',
      onUsage,
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2]));
            controller.close();
          },
        }),
      ),
    );
    await collect(
      wrap(provider as unknown as AIInterface).streamSpeech('hello', {
        model: 'some-other-model',
        usageTags: { feature: 'tts-stream' },
      } as any),
    );
    expect(events[0]).toMatchObject({
      operation: 'streamSpeech',
      model: 'qwen3-tts-1.7b',
      tags: { feature: 'tts-stream' },
      part: { index: 0, last: true },
    });
    const sent = String(fetchSpy.mock.calls[0][1]?.body);
    expect(sent).not.toContain('tts-stream');
    expect(sent).not.toContain('some-other-model');
  });
});

describe('batch embeddings iterate a snapshot of their input', () => {
  it('Gemini: input appended from onUsage after the final event sends nothing more', async () => {
    const input = ['a', 'b'];
    const events: PartedUsageEvent[] = [];
    const provider = new GeminiProvider({
      type: 'gemini',
      apiKey: 'test',
      onUsage: (event) => {
        events.push(event as PartedUsageEvent);
        if (event.part?.last) input.push('late');
      },
    });
    const embedContent = vi
      .fn()
      .mockResolvedValue({ embeddings: [{ values: [0.1] }] });
    (provider as any).client = { models: { embedContent } };
    await wrap(provider as AIInterface).embed(input);
    expect(embedContent).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => event.part.last)).toHaveLength(1);
  });

  it('Bedrock: input appended from onUsage sends nothing more', async () => {
    const input = ['a', 'b'];
    const events: PartedUsageEvent[] = [];
    const provider = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
      onUsage: (event) => {
        events.push(event as PartedUsageEvent);
        input.push('late');
      },
    });
    const invokeModel = vi
      .fn()
      .mockImplementation(async () => body({ embedding: [0.1] }));
    (provider as any).client = { invokeModel };
    await wrap(provider as AIInterface).embed(input);
    expect(invokeModel).toHaveBeenCalledTimes(2);
    expect(events.map((event) => event.part.last)).toEqual([undefined, true]);
  });
});

describe('options classes on an observed client', () => {
  it('keep getter-backed model and tags and prototype callbacks, without evaluating unrelated getters', async () => {
    const seen: string[] = [];
    class StreamRequest {
      get model() {
        return 'gpt-4o-mini';
      }
      get usageTags() {
        return { feature: 'observed-getter' };
      }
      get unrelated(): string {
        throw new Error('unrelated getter evaluated');
      }
      onProgress(text: string) {
        seen.push(text);
      }
    }
    const { events, onUsage } = recorder();
    const providerOptions = { apiKey: 'test', onUsage, onRequest: () => {} };
    const provider = new OpenAIProvider(providerOptions);
    async function* chunks() {
      yield { choices: [{ delta: { content: 'ok' }, finish_reason: null }] };
      yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
    }
    const create = vi.fn().mockResolvedValue(chunks());
    (provider as any).client = { chat: { completions: { create } } };
    const ai = createObservedAI(wrap(provider as AIInterface), providerOptions);

    await collect(
      ai.stream([{ role: 'user', content: 'go' }], new StreamRequest() as any),
    );

    expect(create.mock.calls[0][0].model).toBe('gpt-4o-mini');
    expect(events[0].tags).toEqual({ feature: 'observed-getter' });
    expect(seen).toEqual(['ok']);
  });
});

describe('an OpenAI-compatible usage chunk without choices', () => {
  it('does not throw and reports its usage', async () => {
    const { events, onUsage } = recorder();
    const provider = new OpenAIProvider({ apiKey: 'test', onUsage });
    async function* chunks() {
      yield { choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] };
      yield {
        usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
      };
    }
    (provider as any).client = {
      chat: { completions: { create: vi.fn().mockResolvedValue(chunks()) } },
    };
    await expect(
      collect(
        wrap(provider as AIInterface).stream([{ role: 'user', content: 'go' }]),
      ),
    ).resolves.toEqual(['ok']);
    expect(events[0].usage?.totalTokens).toBe(4);
  });
});

describe('directly constructed providers', () => {
  it('report a multi-request method as one call and separate invocations as separate calls', async () => {
    const { events, onUsage } = recorder();
    const provider = new GeminiProvider({
      type: 'gemini',
      apiKey: 'test',
      onUsage,
    });
    (provider as any).client = {
      models: {
        embedContent: vi
          .fn()
          .mockResolvedValue({ embeddings: [{ values: [0.1] }] }),
      },
    };
    await provider.embed(['a', 'b']);
    await provider.embed('c');
    const [first, second, third] = events.map((event) => event.part);
    expect(first).toEqual({ call: first.call, index: 0 });
    expect(second).toEqual({ call: first.call, index: 1, last: true });
    expect(third).toMatchObject({ index: 0, last: true });
    expect(third.call).not.toBe(first.call);
  });
});
