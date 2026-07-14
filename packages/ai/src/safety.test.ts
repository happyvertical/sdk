import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from './shared/providers/anthropic';
import { BifrostProvider } from './shared/providers/bifrost';
import { GeminiProvider } from './shared/providers/gemini';
import { HuggingFaceProvider } from './shared/providers/huggingface';
import { OpenAIProvider } from './shared/providers/openai';
import {
  createObservedAI,
  DEFAULT_AI_GENERATION_LIMITS,
  DEFAULT_AI_MAX_RETRIES,
  DEFAULT_AI_TIMEOUT_MS,
  normalizeBaseAIOptions,
  normalizeChatOptions,
} from './shared/safety';
import type { AIInterface, AIRequestEvent } from './shared/types';
import { AIError } from './shared/types';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function successfulChatResponse(model: string) {
  return {
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    model,
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

describe('AI generation safety defaults', () => {
  it('normalizes safe provider defaults', () => {
    expect(normalizeBaseAIOptions({})).toMatchObject({
      timeout: DEFAULT_AI_TIMEOUT_MS,
      maxRetries: DEFAULT_AI_MAX_RETRIES,
      generationLimits: DEFAULT_AI_GENERATION_LIMITS,
    });
  });

  it('keeps reasoning disabled until the caller explicitly opts in', () => {
    expect(normalizeChatOptions({}, {}).reasoning.maxTokens).toBe(0);
    expect(
      normalizeChatOptions({}, { reasoning: {} }).reasoning.maxTokens,
    ).toBe(1024);
  });

  it('rejects excessive output and reasoning before transport', () => {
    expect(() =>
      normalizeChatOptions({}, { maxTokens: 4097 }, 'openai', 'gpt-4o'),
    ).toThrowError(expect.objectContaining({ code: 'AI_LIMIT_EXCEEDED' }));
    expect(() =>
      normalizeChatOptions(
        {},
        { reasoning: { maxTokens: 1025 } },
        'gemini',
        'gemini-2.5-flash',
      ),
    ).toThrowError(expect.objectContaining({ code: 'AI_LIMIT_EXCEEDED' }));
  });

  it('clamps only when the provider explicitly opts in', () => {
    const normalized = normalizeChatOptions(
      {
        generationLimits: {
          maxOutputTokens: 100,
          maxReasoningTokens: 50,
          onExceeded: 'clamp',
        },
      },
      { maxTokens: 200, reasoning: { maxTokens: 75 } },
    );

    expect(normalized.maxTokens).toBe(100);
    expect(normalized.reasoning.maxTokens).toBe(50);
  });
});

describe('provider contracts', () => {
  it('sends OpenAI defaults and rejects an oversized request before transport', async () => {
    const create = vi.fn().mockResolvedValue(successfulChatResponse('gpt-4o'));
    const provider = new OpenAIProvider({
      apiKey: 'test',
      defaultModel: 'gpt-4o',
    });
    (provider as any).client = { chat: { completions: { create } } };

    await provider.chat([{ role: 'user', content: 'hello' }], {
      reasoning: { maxTokens: 1024 },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ max_tokens: 4096 }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        timeout: 120_000,
      }),
    );

    await expect(
      provider.chat([{ role: 'user', content: 'blocked' }], {
        maxTokens: 4097,
      }),
    ).rejects.toMatchObject({ code: 'AI_LIMIT_EXCEEDED' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('sends bounded reasoning through Bifrost OpenAI compatibility', async () => {
    const create = vi
      .fn()
      .mockResolvedValue(successfulChatResponse('gemini-2.5-flash'));
    const provider = new BifrostProvider({
      type: 'bifrost',
      apiKey: 'test',
      baseUrl: 'https://bifrost.example.com/v1',
      defaultModel: 'gemini-2.5-flash',
    });
    (provider as any).client = { chat: { completions: { create } } };

    await provider.chat([{ role: 'user', content: 'hello' }], {
      reasoning: { maxTokens: 1024 },
    });

    expect(create.mock.calls[0][0]).toMatchObject({
      max_tokens: 4096,
      reasoning: { max_tokens: 1024 },
    });
  });

  it('does not enable Anthropic thinking when reasoning is omitted', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      model: 'claude-test',
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test',
      defaultModel: 'claude-test',
    });
    (provider as any).client = { messages: { create } };

    await provider.chat([{ role: 'user', content: 'hello' }], {
      maxTokens: 500,
      temperature: 0.2,
    });

    expect(create.mock.calls[0][0]).not.toHaveProperty('thinking');
  });

  it('maps bounded output and reasoning into Anthropic native fields', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      model: 'claude-test',
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test',
      defaultModel: 'claude-test',
    });
    (provider as any).client = { messages: { create } };

    await provider.chat([{ role: 'user', content: 'hello' }], {
      reasoning: { maxTokens: 1024 },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 4096,
        thinking: { type: 'enabled', budget_tokens: 1024 },
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('maps bounded output and reasoning into Gemini native fields', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: 'ok',
      candidates: [],
      usageMetadata: {},
    });
    const provider = new GeminiProvider({
      type: 'gemini',
      apiKey: 'test',
      defaultModel: 'gemini-2.5-flash',
    });
    (provider as any).client = { models: { generateContent } };

    await provider.chat([{ role: 'user', content: 'hello' }], {
      reasoning: { maxTokens: 1024 },
    });

    expect(generateContent.mock.calls[0][0].config).toMatchObject({
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 1024 },
      abortSignal: expect.any(AbortSignal),
      httpOptions: {
        timeout: 120_000,
        retryOptions: { attempts: 1 },
      },
    });
  });

  it('maps the output ceiling into Hugging Face max_new_tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ generated_text: 'Human: hello\nok' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;
    const provider = new HuggingFaceProvider({
      type: 'huggingface',
      apiToken: 'test',
      defaultModel: 'test-model',
    });

    await provider.chat([{ role: 'user', content: 'hello' }]);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body)).parameters.max_new_tokens).toBe(4096);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps the default output ceiling into Ollama num_predict', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'llama-test',
          message: { content: 'ok' },
          done: true,
          done_reason: 'stop',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    global.fetch = fetchMock;
    const { OllamaProvider } = await import('./shared/providers/ollama');
    const provider = new OllamaProvider({
      type: 'ollama',
      baseUrl: 'http://ollama.example.test',
      defaultModel: 'llama-test',
    });

    await provider.chat([{ role: 'user', content: 'hello' }]);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body)).options.num_predict).toBe(4096);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('attempt and cancellation controls', () => {
  it.each([
    429, 500, 504,
  ])('makes one upstream attempt for HTTP %s by default', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'failed' } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = fetchMock;
    const provider = new OpenAIProvider({
      apiKey: 'test',
      baseUrl: 'https://openai.example.test/v1',
      defaultModel: 'gpt-4o',
    });

    await expect(
      provider.chat([{ role: 'user', content: 'hello' }]),
    ).rejects.toBeInstanceOf(AIError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('aborts the provider request at the SDK timeout without detached work', async () => {
    let active = false;
    let receivedSignal: AbortSignal | undefined;
    const create = vi.fn(
      (_request: unknown, requestOptions: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          active = true;
          receivedSignal = requestOptions.signal;
          requestOptions.signal.addEventListener(
            'abort',
            () => {
              active = false;
              reject(new DOMException('aborted', 'AbortError'));
            },
            { once: true },
          );
        }),
    );
    const provider = new OpenAIProvider({
      apiKey: 'test',
      defaultModel: 'gpt-4o',
      timeout: 10,
    });
    (provider as any).client = { chat: { completions: { create } } };

    await expect(
      provider.chat([{ role: 'user', content: 'hello' }]),
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
    expect(receivedSignal?.aborted).toBe(true);
    expect(active).toBe(false);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('applies the SDK timeout while fetching a remote image', async () => {
    let active = false;
    let receivedSignal: AbortSignal | undefined;
    global.fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          active = true;
          receivedSignal = init?.signal as AbortSignal;
          receivedSignal.addEventListener(
            'abort',
            () => {
              active = false;
              reject(new DOMException('aborted', 'AbortError'));
            },
            { once: true },
          );
        }),
    ) as typeof fetch;
    const events: AIRequestEvent[] = [];
    const providerOptions = {
      type: 'openai' as const,
      apiKey: 'test',
      defaultModel: 'gpt-4o',
      timeout: 10,
      onRequest: (event: AIRequestEvent) => events.push(event),
    };
    const provider = new OpenAIProvider(providerOptions);
    const observed = createObservedAI(provider, providerOptions);

    await expect(
      observed.describeImage('https://images.example.test/slow.png'),
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
    expect(receivedSignal?.aborted).toBe(true);
    expect(active).toBe(false);
    expect(events).toMatchObject([
      { operation: 'describeImage', status: 'timed_out' },
    ]);
  });
});

describe('request lifecycle events', () => {
  it('emits prompt-free terminal events for success, failure, timeout, abort, and rejection', async () => {
    const events: AIRequestEvent[] = [];
    const target = {
      chat: vi.fn(async (_messages: unknown, options?: { mode?: string }) => {
        if (options?.mode === 'failure') {
          throw new AIError('provider failed', 'API_ERROR');
        }
        if (options?.mode === 'timeout') {
          throw new AIError('provider timed out', 'AI_TIMEOUT');
        }
        if (options?.mode === 'abort') {
          throw new AIError('caller aborted', 'AI_ABORTED');
        }
        return { content: 'secret response' };
      }),
    } as unknown as AIInterface;
    const ai = createObservedAI(target, {
      type: 'bifrost',
      apiKey: 'secret-key',
      defaultModel: 'gemini-2.5-flash',
      usageTags: { app: 'test' },
      onRequest: (event) => events.push(event),
    } as any);

    await ai.chat([{ role: 'user', content: 'secret prompt' }]);
    await expect(ai.chat([], { mode: 'failure' } as any)).rejects.toMatchObject(
      { code: 'API_ERROR' },
    );
    await expect(ai.chat([], { mode: 'timeout' } as any)).rejects.toMatchObject(
      { code: 'AI_TIMEOUT' },
    );
    await expect(ai.chat([], { mode: 'abort' } as any)).rejects.toMatchObject({
      code: 'AI_ABORTED',
    });
    await expect(ai.chat([], { maxTokens: 4097 })).rejects.toMatchObject({
      code: 'AI_LIMIT_EXCEEDED',
    });

    expect(events.map((event) => event.status)).toEqual([
      'succeeded',
      'failed',
      'timed_out',
      'aborted',
      'rejected',
    ]);
    expect(target.chat).toHaveBeenCalledTimes(4);
    expect(events[0]).toMatchObject({
      attempts: 1,
      effectiveMaxOutputTokens: 4096,
      tags: { app: 'test' },
    });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('secret prompt');
    expect(serialized).not.toContain('secret response');
    expect(serialized).not.toContain('secret-key');
  });
});
