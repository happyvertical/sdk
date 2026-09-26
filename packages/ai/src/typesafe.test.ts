import { describe, expect, it, vi } from 'vitest';
import { getAIAuto as getNodeAIAuto } from './node/factory';
import { getAI } from './shared/factory';
import { SeevioProvider } from './shared/providers/seevio';
import { TypeSafeProvider } from './shared/providers/typesafe';
import { createRateLimitedAI } from './shared/rate-limit';
import type {
  AICapabilities,
  AIInterface,
  AIProviderType,
  DecisionRequest,
} from './shared/types';
import { AI_PROVIDER_TYPES } from './shared/types';

const request: DecisionRequest = {
  state: { message: 'Please refund my duplicate charge' },
  questions: {
    refund: {
      type: 'predicate',
      instructions: 'Does `message` request a refund?',
    },
    route: {
      type: 'choice',
      instructions: 'Which team?',
      criteria: { billing: 'Payments', support: 'General help' },
    },
    urgency: {
      type: 'score',
      instructions: 'How urgent?',
      criteria: ['Low', 'Medium', 'High'],
    },
  },
};

function response(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function validResponse() {
  return {
    model: 'jev-1.13.0',
    answers: {
      refund: { type: 'noul', noul: 0.95 },
      route: {
        type: 'choice',
        choice: 'billing',
        probabilities: { billing: 0.8, support: 0.2 },
        confidence: 0.7,
      },
      urgency: {
        type: 'score',
        score: 1.1,
        legend: { 0: 'Low', 1: 'Medium', 2: 'High' },
        probabilities: { 0: 0.1, 1: 0.7, 2: 0.2 },
        confidence: 0.6,
      },
    },
    usage: { input_tokens: 12, output_tokens: 3 },
  };
}

describe('TypeSafeProvider', () => {
  it('translates a mixed batch and preserves model, usage, distributions, and provenance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(validResponse()));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new TypeSafeProvider({
      type: 'typesafe',
      apiKey: 'test-key',
      defaultModel: 'jev-latest',
    });

    const result = await provider.decide(request);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.typesafe.ai/v1/systemone',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      model: 'jev-latest',
      questions: { refund: { type: 'noul' } },
    });
    expect(result).toMatchObject({
      model: 'jev-1.13.0',
      usage: { promptTokens: 12, completionTokens: 3, totalTokens: 15 },
      provenance: { provider: 'typesafe', model: 'jev-1.13.0' },
      answers: {
        refund: { type: 'predicate', probability: 0.95 },
        route: {
          choice: 'billing',
          probabilities: { billing: 0.8, support: 0.2 },
        },
        urgency: { score: 1.1, levels: ['Low', 'Medium', 'High'] },
      },
    });
  });

  it('rejects malformed answer IDs, types, labels, probabilities, and score rubrics', async () => {
    const cases = [
      {
        ...validResponse(),
        answers: {
          ...validResponse().answers,
          extra: { type: 'noul', noul: 0.2 },
        },
      },
      {
        ...validResponse(),
        answers: {
          ...validResponse().answers,
          refund: {
            type: 'choice',
            choice: 'billing',
            probabilities: { billing: 1 },
            confidence: 1,
          },
        },
      },
      {
        ...validResponse(),
        answers: {
          ...validResponse().answers,
          route: {
            type: 'choice',
            choice: 'other',
            probabilities: { billing: 0.8, support: 0.2 },
            confidence: 0.7,
          },
        },
      },
      {
        ...validResponse(),
        answers: {
          ...validResponse().answers,
          route: {
            type: 'choice',
            choice: 'billing',
            probabilities: { billing: 0.8, support: 0.3 },
            confidence: 0.7,
          },
        },
      },
      {
        ...validResponse(),
        answers: {
          ...validResponse().answers,
          urgency: {
            ...validResponse().answers.urgency,
            legend: { 0: 'No', 1: 'Medium', 2: 'High' },
          },
        },
      },
    ];
    for (const body of cases) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
      await expect(
        new TypeSafeProvider({ type: 'typesafe', apiKey: 'test-key' }).decide(
          request,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });

  it('rejects invalid request shapes before network access', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const provider = new TypeSafeProvider({
      type: 'typesafe',
      apiKey: 'test-key',
    });
    await expect(
      provider.decide({
        state: 'x',
        questions: { '': { type: 'predicate', instructions: 'x' } },
      }),
    ).rejects.toThrow('question IDs');
    await expect(
      provider.decide({
        state: 'x',
        questions: {
          choice: { type: 'choice', instructions: 'x', criteria: {} },
        },
      }),
    ).rejects.toThrow('1 to 255');
    await expect(
      provider.decide({
        state: 'x',
        questions: {
          score: { type: 'score', instructions: 'x', criteria: ['one'] },
        },
      }),
    ).rejects.toThrow('2 to 10');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps authentication, failures, timeout, abort, and rate-limit retries', async () => {
    const provider = new TypeSafeProvider({
      type: 'typesafe',
      apiKey: 'test-key',
      timeout: 1,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ error: 'bad key' }, 401)),
    );
    await expect(provider.decide(request)).rejects.toMatchObject({
      code: 'AUTH_ERROR',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response({ error: 'bad request' }, 422)),
    );
    await expect(provider.decide(request)).rejects.toMatchObject({
      code: 'API_ERROR',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            if (init.signal.aborted) {
              reject(new DOMException('aborted', 'AbortError'));
            } else {
              init.signal.addEventListener('abort', () =>
                reject(new DOMException('aborted', 'AbortError')),
              );
            }
          }),
      ),
    );
    await expect(provider.decide(request)).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      new TypeSafeProvider({ type: 'typesafe', apiKey: 'test-key' }).decide(
        request,
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({}, 429, { 'retry-after': '0' }))
        .mockResolvedValueOnce(response(validResponse())),
    );
    const retrying = createRateLimitedAI(
      new TypeSafeProvider({ type: 'typesafe', apiKey: 'test-key' }),
      {
        type: 'typesafe',
        apiKey: 'test-key',
        rateLimit: { maxAttempts: 2, initialDelayMs: 0, cooldownMs: 0 },
      },
    );
    await expect(retrying.decide!(request)).resolves.toMatchObject({
      model: 'jev-1.13.0',
    });
  });

  it('is selected lazily by the factory and exposes explicit unsupported operations', async () => {
    const provider = await getAI({ type: 'typesafe', apiKey: 'test-key' });
    expect((await provider.getCapabilities()).decisions).toBe(true);
    await expect(provider.chat([])).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('preserves factory observation and usage conventions without generation controls', async () => {
    const usage = vi.fn();
    const lifecycle = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(response(validResponse()));
    vi.stubGlobal('fetch', fetchMock);
    const provider = await getAI({
      type: 'typesafe',
      apiKey: 'test-key',
      defaultModel: 'jev-default',
      onUsage: usage,
      onRequest: lifecycle,
    });

    await provider.decide!(request, {
      model: 'jev-override',
      usageTags: { route: 'test' },
      ...({ maxTokens: 999, temperature: 1 } as never),
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ model: 'jev-override', state: request.state });
    expect(body).not.toHaveProperty('maxTokens');
    expect(body).not.toHaveProperty('temperature');
    expect(usage).toHaveBeenCalledTimes(1);
    expect(lifecycle).toHaveBeenCalledTimes(1);
    expect(lifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'decide',
        model: 'jev-override',
        requestedMaxOutputTokens: undefined,
        effectiveMaxOutputTokens: undefined,
        tags: { route: 'test' },
      }),
    );
    expect(JSON.stringify(lifecycle.mock.calls[0][0])).not.toContain('refund');
  });

  it('reports factory timeout and caller abort as terminal lifecycle statuses', async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          if (init.signal.aborted) {
            reject(new DOMException('aborted', 'AbortError'));
            return;
          }
          init.signal.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const timedOut = vi.fn();
    const timeoutProvider = await getAI({
      type: 'typesafe',
      apiKey: 'test-key',
      timeout: 1,
      onRequest: timedOut,
    });
    await expect(timeoutProvider.decide!(request)).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
    });
    expect(timedOut).toHaveBeenCalledTimes(1);
    expect(timedOut).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'decide', status: 'timed_out' }),
    );

    const aborted = vi.fn();
    const abortProvider = await getAI({
      type: 'typesafe',
      apiKey: 'test-key',
      onRequest: aborted,
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      abortProvider.decide!(request, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(aborted).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'decide', status: 'aborted' }),
    );
  });

  it('keeps existing capability literals source-compatible', () => {
    const legacy: AICapabilities = {
      chat: false,
      completion: false,
      embeddings: false,
      streaming: false,
      functions: false,
      vision: false,
      fineTuning: false,
      imageEmbeddings: false,
      imageGeneration: false,
      videoGeneration: false,
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 0,
      supportedOperations: [],
    };
    expect(legacy.decisions).toBeUndefined();
    const legacyProvider: AIInterface = new SeevioProvider({ type: 'seevio' });
    expect(legacyProvider.decide).toBeUndefined();
    const providerType: AIProviderType = 'typesafe';
    expect(AI_PROVIDER_TYPES).toContain(providerType);
  });

  it('accepts structurally equal score legends and rejects malformed present usage', async () => {
    const structured = validResponse();
    const structuredRequest: DecisionRequest = {
      ...request,
      questions: {
        ...request.questions,
        urgency: {
          type: 'score',
          instructions: 'How urgent?',
          criteria: [{ label: 'Low' }, ['Medium'], { label: 'High' }],
        },
      },
    };
    structured.answers.urgency.legend = {
      0: { label: 'Low' },
      1: ['Medium'],
      2: { label: 'High' },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(structured)));
    await expect(
      new TypeSafeProvider({ type: 'typesafe', apiKey: 'test-key' }).decide(
        structuredRequest,
      ),
    ).resolves.toBeDefined();
    for (const usage of [
      'invalid',
      { input_tokens_typo: 12 },
      { input_tokens: 1 },
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(response({ ...validResponse(), usage })),
      );
      await expect(
        new TypeSafeProvider({ type: 'typesafe', apiKey: 'test-key' }).decide(
          request,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });

  it('auto-detects TypeSafe only as a last-resort Node provider', async () => {
    const keys = [
      'TYPESAFE_API_KEY',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'GEMINI_API_KEY',
      'GOOGLE_API_KEY',
      'HF_TOKEN',
      'LITELLM_BASE_URL',
      'BIFROST_BASE_URL',
      'OLLAMA_HOST',
      'OLLAMA_BASE_URL',
      'MODELARK_API_KEY',
      'ARK_API_KEY',
      'OPENAI_COMPAT_VIDEO_BASE_URL',
      'SEEVIO_API_KEY',
    ] as const;
    const previous = new Map(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    process.env.TYPESAFE_API_KEY = 'typesafe-test-key';
    try {
      const provider = await getNodeAIAuto({});
      expect((await provider.getCapabilities()).decisions).toBe(true);
    } finally {
      for (const key of keys) {
        const value = previous.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('normalizes TypeSafe transport failures as retryable AI errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(
      new TypeSafeProvider({ type: 'typesafe', apiKey: 'test-key' }).decide(
        request,
      ),
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true,
      provider: 'typesafe',
    });
  });

  it('rejects an HTTP-success malformed JSON response without retry semantics', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{not valid json', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await expect(
      new TypeSafeProvider({ type: 'typesafe', apiKey: 'test-key' }).decide(
        request,
      ),
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      retryable: false,
    });
  });
});
