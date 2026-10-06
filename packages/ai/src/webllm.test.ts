// biome-ignore-all lint/style/useNamingConvention: WebLLM's wire format is snake_case.
/**
 * WebLLM provider tests. The engine is a mock: no WebGPU, model download, or
 * network is involved.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAI } from './index';
import { disposeWebLLMEngines, WebLLMProvider } from './local';
import { resolveContinuation } from './shared/continuation';
import type { UsageEvent, WebLLMEngineLike } from './shared/types';
import { AIError, WebGPUUnavailableError } from './shared/types';

const h = vi.hoisted(() => ({
  create: vi.fn(),
  interrupt: vi.fn(),
  unload: vi.fn(async () => {}),
  createEngine: vi.fn(),
}));

vi.mock('@mlc-ai/web-llm', () => ({
  CreateMLCEngine: h.createEngine,
  functionCallingModelIds: ['Hermes-3-Llama-3.1-8B-q4f16_1-MLC'],
  prebuiltAppConfig: {
    model_list: [
      {
        model_id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        vram_required_MB: 879.04,
        overrides: { context_window_size: 4096 },
      },
      {
        model_id: 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC',
        vram_required_MB: 5000,
        overrides: { context_window_size: 8192 },
      },
      { model_id: 'Phi-3.5-vision-instruct-q4f16_1-MLC', model_type: 2 },
      { model_id: 'snowflake-arctic-embed-s-q0f32-MLC', model_type: 1 },
    ],
  },
}));

function completion(overrides: Record<string, unknown> = {}) {
  return {
    model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    choices: [
      {
        message: { role: 'assistant', content: 'hello' },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    ...overrides,
  };
}

async function* chunksOf(parts: string[], usage?: unknown) {
  for (const content of parts) {
    yield { choices: [{ delta: { content }, finish_reason: null }] };
  }
  yield { choices: [{ delta: {}, finish_reason: 'stop' }] };
  if (usage) yield { choices: [], usage };
}

function mockEngine(): WebLLMEngineLike {
  return {
    chat: { completions: { create: h.create } },
    interruptGenerate: h.interrupt,
    unload: h.unload,
  };
}

function provider(extra: Record<string, unknown> = {}) {
  return new WebLLMProvider({ type: 'webllm', ...extra });
}

const lastRequest = () => h.create.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.stubGlobal('navigator', { gpu: {} });
  h.create.mockReset().mockResolvedValue(completion());
  h.interrupt.mockReset();
  h.createEngine.mockReset().mockImplementation(async (_model, config) => {
    config?.initProgressCallback?.({
      progress: 0.5,
      text: 'Fetching params',
      timeElapsed: 1,
    });
    return mockEngine();
  });
});

afterEach(async () => {
  await disposeWebLLMEngines();
  vi.unstubAllGlobals();
});

describe('message mapping', () => {
  it('maps roles, multipart user content, tool calls and tool results', async () => {
    await provider().chat([
      { role: 'system', content: 'be brief' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
        ],
      },
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'lookup', arguments: '{"q":1}' },
          },
        ],
      },
      { role: 'tool', content: '{"ok":true}', tool_call_id: 'call_1' },
      { role: 'function', content: 'legacy', name: 'lookup' },
      { role: 'assistant', content: 'done' },
    ]);

    expect(lastRequest().messages).toEqual([
      { role: 'system', content: 'be brief' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AA' } },
        ],
      },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'lookup', arguments: '{"q":1}' },
          },
        ],
      },
      { role: 'tool', content: '{"ok":true}', tool_call_id: 'call_1' },
      { role: 'tool', content: 'legacy', tool_call_id: 'lookup' },
      { role: 'assistant', content: 'done' },
    ]);
  });

  it('maps generation options and the response', async () => {
    h.create.mockResolvedValue(
      completion({
        choices: [{ message: { content: 'cut' }, finish_reason: 'length' }],
      }),
    );
    const response = await provider().chat([{ role: 'user', content: 'hi' }], {
      temperature: 0.2,
      topP: 0.9,
      maxTokens: 64,
      stop: ['x'],
      seed: 7,
      frequencyPenalty: 0.1,
      presencePenalty: 0.2,
    });

    expect(lastRequest()).toMatchObject({
      model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 64,
      stop: ['x'],
      seed: 7,
      frequency_penalty: 0.1,
      presence_penalty: 0.2,
      stream: false,
    });
    expect(response).toMatchObject({
      content: 'cut',
      finishReason: 'length',
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
    });
  });

  it('builds complete() and message() on chat()', async () => {
    const ai = provider();
    expect((await ai.complete('finish me')).content).toBe('hello');
    expect(lastRequest().messages).toEqual([
      { role: 'user', content: 'finish me' },
    ]);

    expect(
      await ai.message('and?', {
        history: [{ role: 'user', content: 'first' }],
      }),
    ).toBe('hello');
    expect(
      lastRequest().messages.map((m: { content: string }) => m.content),
    ).toEqual(['first', 'and?']);
  });

  it('emits usage through onUsage', async () => {
    const events: UsageEvent[] = [];
    await provider({ onUsage: (e: UsageEvent) => events.push(e) }).chat([
      { role: 'user', content: 'hi' },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      provider: 'webllm',
      operation: 'chat',
      usage: { totalTokens: 5 },
    });
  });
});

describe('streaming', () => {
  it('yields text, reports progress, usage and finish reason', async () => {
    h.create.mockResolvedValue(
      chunksOf(['a', 'b'], {
        prompt_tokens: 1,
        completion_tokens: 2,
        total_tokens: 3,
      }),
    );
    const events: UsageEvent[] = [];
    const progress: string[] = [];
    const finish = vi.fn();
    const out: string[] = [];
    for await (const piece of provider({
      onUsage: (e: UsageEvent) => events.push(e),
    }).stream([{ role: 'user', content: 'hi' }], {
      onProgress: (c) => progress.push(c),
      onFinishReason: finish,
    })) {
      out.push(piece);
    }

    expect(out).toEqual(['a', 'b']);
    expect(progress).toEqual(['a', 'b']);
    expect(finish).toHaveBeenCalledWith('stop');
    expect(lastRequest()).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(events[0]).toMatchObject({
      operation: 'stream',
      usage: { totalTokens: 3 },
    });
  });

  it('lets the engine generator finish after an early stop so its lock is released', async () => {
    // Model WebLLM: the per-model lock is freed only when the generator completes.
    let locked = false;
    let interrupted = false;
    const lockedStream = async function* () {
      locked = true;
      try {
        yield { choices: [{ delta: { content: 'a' }, finish_reason: null }] };
        while (!interrupted) {
          yield { choices: [{ delta: { content: 'x' }, finish_reason: null }] };
        }
        yield { choices: [{ delta: {}, finish_reason: 'abort' }] };
      } finally {
        locked = false;
      }
    };
    h.interrupt.mockImplementation(() => {
      interrupted = true;
    });
    h.create.mockImplementationOnce(async () => lockedStream());

    const ai = provider({ engine: mockEngine() });
    for await (const _ of ai.stream([{ role: 'user', content: 'hi' }])) {
      break;
    }
    expect(h.interrupt).toHaveBeenCalledTimes(1);
    expect(locked).toBe(false);
    // The next request on the same engine is admitted and completes.
    await expect(ai.message('again')).resolves.toBe('hello');
  });

  it('interrupts generation when the consumer stops early', async () => {
    h.create.mockResolvedValue(chunksOf(['a', 'b', 'c']));
    for await (const _ of provider().stream([
      { role: 'user', content: 'hi' },
    ])) {
      break;
    }
    expect(h.interrupt).toHaveBeenCalledTimes(1);
  });
});

describe('structured output', () => {
  const schema = {
    type: 'object',
    properties: { pick: { enum: ['a', 'b'] } },
    required: ['pick'],
  };

  it('maps responseSchema to a grammar-constrained response_format', async () => {
    await provider().chat([{ role: 'user', content: 'pick' }], {
      responseSchema: schema,
    });
    expect(lastRequest().response_format).toEqual({
      type: 'json_object',
      schema: JSON.stringify(schema),
    });
  });

  it('passes a serialized schema through unchanged', async () => {
    await provider().chat([{ role: 'user', content: 'pick' }], {
      responseSchema: '{"type":"object"}',
    });
    expect(lastRequest().response_format).toEqual({
      type: 'json_object',
      schema: '{"type":"object"}',
    });
  });

  it('maps plain JSON mode and omits the format otherwise', async () => {
    const ai = provider();
    await ai.chat([{ role: 'user', content: 'x' }], {
      responseFormat: { type: 'json_object' },
    });
    expect(lastRequest().response_format).toEqual({ type: 'json_object' });
    await ai.chat([{ role: 'user', content: 'x' }], {
      responseFormat: { type: 'text' },
    });
    expect(lastRequest()).not.toHaveProperty('response_format');
  });

  it('forwards responseSchema from message()', async () => {
    h.create.mockResolvedValue(
      completion({
        choices: [
          { message: { content: '{"pick":"a"}' }, finish_reason: 'stop' },
        ],
      }),
    );
    const text = await provider().message('pick', { responseSchema: schema });
    expect(JSON.parse(text)).toEqual({ pick: 'a' });
    expect(lastRequest().response_format.schema).toBe(JSON.stringify(schema));
  });
});

describe('tool calls', () => {
  it('sends tools and maps returned tool calls', async () => {
    h.create.mockResolvedValue(
      completion({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'c1',
                  type: 'function',
                  function: { name: 'lookup', arguments: '{"q":"x"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    );
    const response = await provider().chat([{ role: 'user', content: 'go' }], {
      tools: [
        {
          type: 'function',
          function: {
            name: 'lookup',
            description: 'find',
            parameters: { type: 'object', properties: {} },
          },
        },
      ],
      toolChoice: 'auto',
    });

    expect(lastRequest().tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'lookup',
          description: 'find',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);
    expect(lastRequest().tool_choice).toBe('auto');
    expect(response.finishReason).toBe('tool_calls');
    expect(response.toolCalls).toEqual([
      {
        id: 'c1',
        type: 'function',
        function: { name: 'lookup', arguments: '{"q":"x"}' },
      },
    ]);
  });

  it('does not send tool_choice without tools', async () => {
    await provider().chat([{ role: 'user', content: 'go' }], {
      toolChoice: 'none',
    });
    expect(lastRequest()).not.toHaveProperty('tool_choice');
  });
});

describe('abort and timeout', () => {
  it('interrupts the engine and throws AI_ABORTED when the signal fires', async () => {
    const controller = new AbortController();
    h.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          h.interrupt.mockImplementation(() => resolve(completion()));
        }),
    );
    const pending = provider().chat([{ role: 'user', content: 'hi' }], {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(h.create).toHaveBeenCalled());
    controller.abort();

    await expect(pending).rejects.toMatchObject({ code: 'AI_ABORTED' });
    expect(h.interrupt).toHaveBeenCalled();
  });

  it('aborts a stream', async () => {
    const controller = new AbortController();
    h.create.mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: 'a' } }] };
        controller.abort();
        yield { choices: [{ delta: { content: 'b' } }] };
      })(),
    );
    const run = async () => {
      for await (const _ of provider().stream(
        [{ role: 'user', content: 'hi' }],
        { signal: controller.signal },
      )) {
        // drain
      }
    };
    await expect(run()).rejects.toMatchObject({ code: 'AI_ABORTED' });
    expect(h.interrupt).toHaveBeenCalled();
  });

  it('serializes requests per engine and only interrupts the running one', async () => {
    const ai = provider({ engine: mockEngine() });
    const first = new AbortController();
    const second = new AbortController();
    const releases: Array<() => void> = [];
    h.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve(completion()));
        }),
    );
    const running = ai.chat([{ role: 'user', content: '1' }], {
      signal: first.signal,
    });
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    const queued = ai.chat([{ role: 'user', content: '2' }], {
      signal: second.signal,
    });
    queued.catch(() => {});

    // Aborting the queued request rejects it at once without touching the engine.
    second.abort();
    await expect(queued).rejects.toMatchObject({ code: 'AI_ABORTED' });
    expect(h.interrupt).not.toHaveBeenCalled();
    expect(h.create).toHaveBeenCalledTimes(1);

    // The running request is unaffected and a later request still gets its turn.
    releases[0]();
    await expect(running).resolves.toMatchObject({ content: 'hello' });
    const third = ai.chat([{ role: 'user', content: '3' }]);
    await vi.waitFor(() => expect(h.create).toHaveBeenCalledTimes(2));
    releases[1]();
    await expect(third).resolves.toMatchObject({ content: 'hello' });
    expect(first.signal.aborted).toBe(false);
  });

  it('keeps the queue closed until an abandoned generation has really stopped', async () => {
    const ai = provider({ engine: mockEngine() });
    let finishFirst: () => void = () => {};
    h.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = () => resolve(completion());
        }),
    );
    // The engine ignores the interrupt for a while: the first call still
    // rejects at its timeout, but its generation is still running.
    await expect(
      ai.chat([{ role: 'user', content: '1' }], { timeout: 20 }),
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
    expect(h.interrupt).toHaveBeenCalledTimes(1);

    const next = ai.chat([{ role: 'user', content: '2' }]);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(h.create).toHaveBeenCalledTimes(1); // not admitted yet

    finishFirst();
    await expect(next).resolves.toMatchObject({ content: 'hello' });
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.interrupt).toHaveBeenCalledTimes(1); // second call never interrupted the first
  });

  it('does not report an engine-side interruption as a normal stop', async () => {
    h.create.mockResolvedValue(
      completion({
        choices: [{ message: { content: 'cut' }, finish_reason: 'abort' }],
      }),
    );
    await expect(
      provider().chat([{ role: 'user', content: 'hi' }]),
    ).rejects.toMatchObject({ code: 'AI_INTERRUPTED', retryable: true });

    h.create.mockResolvedValue(
      (async function* () {
        yield {
          choices: [{ delta: { content: 'a' }, finish_reason: 'abort' }],
        };
      })(),
    );
    const drain = async () => {
      for await (const _ of provider().stream([
        { role: 'user', content: 'hi' },
      ])) {
        // drain
      }
    };
    await expect(drain()).rejects.toMatchObject({ code: 'AI_INTERRUPTED' });
  });

  it('rejects immediately when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      provider().chat([{ role: 'user', content: 'hi' }], {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'AI_ABORTED' });
    expect(h.create).not.toHaveBeenCalled();
  });

  it('times out generation with AI_TIMEOUT', async () => {
    h.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          h.interrupt.mockImplementation(() => resolve(completion()));
        }),
    );
    await expect(
      provider().chat([{ role: 'user', content: 'hi' }], { timeout: 20 }),
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
  });

  it('does not count model loading against the request timeout', async () => {
    h.createEngine.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return mockEngine();
    });
    await expect(
      provider().chat([{ role: 'user', content: 'hi' }], { timeout: 30 }),
    ).resolves.toMatchObject({ content: 'hello' });
  });
});

describe('model lifecycle', () => {
  it('reports load progress and reuses one engine per model', async () => {
    const first = vi.fn();
    const second = vi.fn();
    await provider({ onLoadProgress: first }).chat([
      { role: 'user', content: 'a' },
    ]);
    await provider({ onLoadProgress: second }).chat([
      { role: 'user', content: 'b' },
    ]);

    expect(h.createEngine).toHaveBeenCalledTimes(1);
    expect(h.createEngine).toHaveBeenCalledWith(
      'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      expect.objectContaining({ initProgressCallback: expect.any(Function) }),
    );
    expect(first).toHaveBeenCalledWith({
      progress: 0.5,
      text: 'Fetching params',
      timeElapsed: 1,
    });
    expect(second).not.toHaveBeenCalled();
  });

  it('shares an in-flight load between instances', async () => {
    const a = vi.fn();
    const b = vi.fn();
    let release: () => void = () => {};
    h.createEngine.mockImplementation(async (_model, config) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      config?.initProgressCallback?.({
        progress: 1,
        text: 'done',
        timeElapsed: 2,
      });
      return mockEngine();
    });
    const one = provider({ onLoadProgress: a }).chat([
      { role: 'user', content: '1' },
    ]);
    const two = provider({ onLoadProgress: b }).chat([
      { role: 'user', content: '2' },
    ]);
    await vi.waitFor(() => expect(h.createEngine).toHaveBeenCalled());
    release();
    await Promise.all([one, two]);

    expect(h.createEngine).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('keeps separate engines per model and honors defaultModel / model', async () => {
    await provider({ model: 'm-one' }).chat([{ role: 'user', content: 'a' }]);
    await provider({ defaultModel: 'm-two' }).chat([
      { role: 'user', content: 'a' },
    ]);
    await provider().chat([{ role: 'user', content: 'a' }], { model: 'm-one' });
    expect(h.createEngine.mock.calls.map((call) => call[0])).toEqual([
      'm-one',
      'm-two',
    ]);
  });

  it('evicts a failed load so the next call retries', async () => {
    h.createEngine.mockRejectedValueOnce(new Error('boom'));
    const ai = provider();
    await expect(
      ai.chat([{ role: 'user', content: 'a' }]),
    ).rejects.toBeInstanceOf(AIError);
    await expect(
      ai.chat([{ role: 'user', content: 'a' }]),
    ).resolves.toBeDefined();
    expect(h.createEngine).toHaveBeenCalledTimes(2);
  });

  it('keeps a custom appConfig engine private to the instance', async () => {
    const appConfig = { model_list: [] };
    await provider({ appConfig }).chat([{ role: 'user', content: 'a' }]);
    await provider({ appConfig }).chat([{ role: 'user', content: 'a' }]);
    expect(h.createEngine).toHaveBeenCalledTimes(2);
    expect(h.createEngine.mock.calls[0][1].appConfig).toBe(appConfig);
  });

  it('uses a caller-supplied engine without loading, caching or checking WebGPU', async () => {
    vi.stubGlobal('navigator', {});
    const ai = provider({ engine: mockEngine() });
    await ai.chat([{ role: 'user', content: 'a' }]);

    expect(h.createEngine).not.toHaveBeenCalled();
    // The engine already has its model loaded: no model unless asked for.
    expect(lastRequest()).not.toHaveProperty('model');
    await ai.chat([{ role: 'user', content: 'a' }], { model: 'explicit' });
    expect(lastRequest().model).toBe('explicit');
  });

  it('awaits a caller-supplied engine factory once', async () => {
    const factory = vi.fn(async () => mockEngine());
    const ai = provider({ engine: factory, model: 'worker-model' });
    await ai.chat([{ role: 'user', content: 'a' }]);
    await ai.chat([{ role: 'user', content: 'b' }]);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(h.createEngine).not.toHaveBeenCalled();
    expect(lastRequest().model).toBe('worker-model');
  });
});

describe('errors', () => {
  it('throws a typed, catchable error when WebGPU is missing', async () => {
    vi.stubGlobal('navigator', {});
    const error = await provider()
      .chat([{ role: 'user', content: 'hi' }])
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(WebGPUUnavailableError);
    expect(error).toBeInstanceOf(AIError);
    expect(error).toMatchObject({
      code: 'WEBGPU_UNAVAILABLE',
      provider: 'webllm',
    });
    expect(h.createEngine).not.toHaveBeenCalled();
  });

  it('also reports no navigator at all as missing WebGPU', async () => {
    vi.stubGlobal('navigator', undefined);
    await expect(
      provider().chat([{ role: 'user', content: 'hi' }]),
    ).rejects.toBeInstanceOf(WebGPUUnavailableError);
  });

  it.each([
    ['ContextWindowSizeExceededError', 'CONTEXT_LENGTH_EXCEEDED'],
    ['SpecifiedModelNotFoundError', 'MODEL_NOT_FOUND'],
    ['WebGPUNotAvailableError', 'WEBGPU_UNAVAILABLE'],
    ['DeviceLostError', 'WEBGPU_DEVICE_LOST'],
    ['SomethingElse', 'API_ERROR'],
  ])('maps engine error %s to %s', async (name, code) => {
    const failure = Object.assign(new Error('engine said no'), { name });
    h.create.mockRejectedValue(failure);
    const error = await provider()
      .chat([{ role: 'user', content: 'hi' }])
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AIError);
    expect((error as AIError).code).toBe(code);
  });
});

describe('capabilities and models', () => {
  it('reports chat features and no embeddings/images/TTS/video', async () => {
    const caps = await provider().getCapabilities();
    expect(caps).toMatchObject({
      chat: true,
      completion: true,
      streaming: true,
      functions: true,
      embeddings: false,
      imageEmbeddings: false,
      imageGeneration: false,
      videoGeneration: false,
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
    });
    expect(caps.supportedOperations).not.toContain('embedding');
  });

  it('lists WebLLM prebuilt chat models without embedding models', async () => {
    const models = await provider().getModels();
    expect(models.map((m) => m.id)).toEqual([
      'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      'Hermes-3-Llama-3.1-8B-q4f16_1-MLC',
      'Phi-3.5-vision-instruct-q4f16_1-MLC',
    ]);
    const hermes = models.find((m) => m.id.startsWith('Hermes'));
    expect(hermes).toMatchObject({
      supportsFunctions: true,
      contextLength: 8192,
    });
    expect(models[0]).toMatchObject({
      supportsFunctions: false,
      supportsVision: false,
    });
    expect(models[2].supportsVision).toBe(true);
    expect(h.createEngine).not.toHaveBeenCalled();
  });

  it('lists models from a custom appConfig', async () => {
    const models = await provider({
      appConfig: { model_list: [{ model_id: 'custom' }] },
    }).getModels();
    expect(models.map((m) => m.id)).toEqual(['custom']);
  });

  it('estimates token counts', async () => {
    expect(await provider().countTokens('12345678')).toBe(2);
  });
});

describe('unsupported capabilities', () => {
  it('throws NOT_SUPPORTED for every method with no in-browser equivalent', async () => {
    const ai = provider();
    const calls: Array<() => Promise<unknown>> = [
      () => ai.embed('x'),
      () => ai.embedImage('x'),
      () => ai.describeImage('x'),
      () => ai.generateImage('x'),
      () => ai.submitVideoGenerationJob({ prompt: 'x' }),
      () => ai.getVideoGenerationJob({} as never),
      () => ai.fetchVideoGenerationResult({} as never),
      () => ai.cancelVideoGenerationJob({} as never),
      () => ai.validateVideoGenerationAccess(),
      () => ai.synthesizeSpeech('x'),
      async () => {
        for await (const _ of ai.streamSpeech('x')) {
          // drain
        }
      },
      () => ai.cloneVoice({} as never),
      () => ai.designVoice({} as never),
      () => ai.getVoices(),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toMatchObject({
        code: 'NOT_SUPPORTED',
        provider: 'webllm',
      });
    }
    expect(h.createEngine).not.toHaveBeenCalled();
  });
});

describe('getAI routing', () => {
  it('creates the webllm provider from the root entry', async () => {
    const ai = await getAI({ type: 'webllm', model: 'm-routed' });
    await ai.message('hi');
    expect(h.createEngine.mock.calls[0][0]).toBe('m-routed');
    expect(lastRequest().model).toBe('m-routed');
  });

  it('applies the shared generation limits', async () => {
    const ai = await getAI({
      type: 'webllm',
      generationLimits: { maxOutputTokens: 100, onExceeded: 'clamp' },
    });
    await ai.chat([{ role: 'user', content: 'hi' }], { maxTokens: 5000 });
    expect(lastRequest().max_tokens).toBe(100);
  });
});

describe('continuation', () => {
  it('never continues structured (schema) output', () => {
    expect(
      resolveContinuation({}, { continueOnLength: true, responseSchema: {} }),
    ).toBeUndefined();
    expect(resolveContinuation({}, { continueOnLength: true })).toBeDefined();
  });
});
