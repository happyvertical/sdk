import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __getAIRateLimitStateForTests,
  __resetAIRateLimitStateForTests,
  createRateLimitedAI,
} from './shared/rate-limit';
import {
  type AIInterface,
  AuthenticationError,
  RateLimitError,
} from './shared/types';

function createTestAI(overrides: Partial<AIInterface> = {}): AIInterface {
  return {
    chat: async () => ({ content: 'ok' }),
    complete: async () => ({ content: 'ok' }),
    message: async () => 'ok',
    embed: async () => ({ embeddings: [[0]], usage: undefined }),
    embedImage: async () => ({ embeddings: [[0]], usage: undefined }),
    describeImage: async () => 'description',
    generateImage: async () => ({ created: Date.now(), images: [] }),
    stream: async function* () {},
    countTokens: async () => 0,
    getModels: async () => [],
    getCapabilities: async () => ({
      chat: true,
      completion: true,
      embeddings: true,
      streaming: true,
      functions: true,
      vision: true,
      fineTuning: false,
      imageEmbeddings: true,
      imageGeneration: true,
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 128000,
      supportedOperations: ['chat'],
    }),
    synthesizeSpeech: async () => ({
      audio: Buffer.from(''),
      mimeType: 'audio/wav',
      duration: 0,
      sampleRate: 24000,
    }),
    streamSpeech: async function* () {},
    cloneVoice: async () => ({ id: 'voice-1', name: 'Voice 1' }),
    designVoice: async () => ({ id: 'voice-2', name: 'Voice 2' }),
    getVoices: async () => [],
    ...overrides,
  } as AIInterface;
}

describe('shared AI rate limiting', () => {
  afterEach(() => {
    vi.useRealTimers();
    __resetAIRateLimitStateForTests();
  });

  it('retries retryable rate-limit failures using provider retry hints', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const callTimes: number[] = [];
    const provider = createTestAI({
      chat: vi.fn(async () => {
        callTimes.push(Date.now());

        if (callTimes.length === 1) {
          throw new RateLimitError('gemini', 2);
        }

        return { content: 'recovered' };
      }),
    });

    const ai = createRateLimitedAI(provider, {
      type: 'gemini',
      apiKey: 'test-key',
      rateLimit: {
        enabled: true,
        key: 'gemini:test-key',
        initialDelayMs: 500,
        maxAttempts: 2,
      },
    });

    const responsePromise = ai.chat([{ role: 'user', content: 'hello' }]);

    await vi.advanceTimersByTimeAsync(0);
    expect(callTimes).toEqual([0]);

    await vi.advanceTimersByTimeAsync(1999);
    expect(callTimes).toEqual([0]);

    await vi.advanceTimersByTimeAsync(1);
    await expect(responsePromise).resolves.toEqual({ content: 'recovered' });
    expect(callTimes).toEqual([0, 2000]);
  });

  it('does not retry non-retryable failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const chat = vi.fn(async () => {
      throw new AuthenticationError('openai');
    });

    const ai = createRateLimitedAI(createTestAI({ chat }), {
      apiKey: 'test-key',
      rateLimit: {
        enabled: true,
        key: 'openai:test-key',
        initialDelayMs: 1000,
        maxAttempts: 3,
      },
    });

    await expect(
      ai.chat([{ role: 'user', content: 'hello' }]),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('serializes successful calls that share the same budget key', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const callLog: Array<{ at: number; id: string }> = [];

    const aiOne = createRateLimitedAI(
      createTestAI({
        chat: vi.fn(async () => {
          callLog.push({ at: Date.now(), id: 'one' });
          return { content: 'one' };
        }),
      }),
      {
        type: 'gemini',
        apiKey: 'first-key',
        rateLimit: {
          enabled: true,
          key: 'shared-budget',
          cooldownMs: 1000,
          maxAttempts: 1,
        },
      },
    );

    const aiTwo = createRateLimitedAI(
      createTestAI({
        chat: vi.fn(async () => {
          callLog.push({ at: Date.now(), id: 'two' });
          return { content: 'two' };
        }),
      }),
      {
        type: 'gemini',
        apiKey: 'second-key',
        rateLimit: {
          enabled: true,
          key: 'shared-budget',
          cooldownMs: 1000,
          maxAttempts: 1,
        },
      },
    );

    const first = aiOne.chat([{ role: 'user', content: 'first' }]);
    const second = aiTwo.chat([{ role: 'user', content: 'second' }]);

    await vi.advanceTimersByTimeAsync(0);
    await expect(first).resolves.toEqual({ content: 'one' });
    expect(callLog).toEqual([{ at: 0, id: 'one' }]);

    await vi.advanceTimersByTimeAsync(999);
    expect(callLog).toEqual([{ at: 0, id: 'one' }]);

    await vi.advanceTimersByTimeAsync(1);
    await expect(second).resolves.toEqual({ content: 'two' });
    expect(callLog).toEqual([
      { at: 0, id: 'one' },
      { at: 1000, id: 'two' },
    ]);
  });

  it('reuses bound method references for non-paced methods', () => {
    const ai = createRateLimitedAI(createTestAI(), {
      type: 'gemini',
      apiKey: 'test-key',
      rateLimit: {
        enabled: true,
        key: 'shared-budget',
      },
    });

    expect(ai.stream).toBe(ai.stream);
    expect(ai.countTokens).toBe(ai.countTokens);
  });

  it('prunes stale idle coordinators when new keys are created', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const { ttlMs } = __getAIRateLimitStateForTests();

    const first = createRateLimitedAI(createTestAI(), {
      type: 'gemini',
      apiKey: 'key-one',
      rateLimit: {
        key: 'budget-one',
      },
    });

    await first.chat([{ role: 'user', content: 'first' }]);
    expect(__getAIRateLimitStateForTests().count).toBe(1);

    vi.setSystemTime(ttlMs + 1);

    const second = createRateLimitedAI(createTestAI(), {
      type: 'gemini',
      apiKey: 'key-two',
      rateLimit: {
        key: 'budget-two',
      },
    });

    await second.chat([{ role: 'user', content: 'second' }]);
    expect(__getAIRateLimitStateForTests().count).toBe(1);
  });

  it('keeps the coordinator cache bounded for idle entries', async () => {
    const { maxBudgetCoordinators } = __getAIRateLimitStateForTests();

    for (let index = 0; index < maxBudgetCoordinators + 5; index += 1) {
      const ai = createRateLimitedAI(createTestAI(), {
        type: 'gemini',
        apiKey: `key-${index}`,
        rateLimit: {
          key: `budget-${index}`,
        },
      });

      await ai.chat([{ role: 'user', content: `message-${index}` }]);
    }

    expect(__getAIRateLimitStateForTests().count).toBe(maxBudgetCoordinators);
  });
});
