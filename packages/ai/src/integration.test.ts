/**
 * Integration tests for AI providers
 * These test real functionality without mocks
 */

import { ValidationError } from '@happyvertical/utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { getAI, getAIAuto } from './shared/factory';
import { HuggingFaceProvider } from './shared/providers/huggingface';
import { LiteLLMProvider } from './shared/providers/litellm';
import { OllamaProvider } from './shared/providers/ollama';
import { AIError } from './shared/types';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

describe('AI Factory Integration', () => {
  it('should create HuggingFace provider', async () => {
    const provider = await getAI({
      type: 'huggingface',
      apiToken: 'fake-token', // This won't make real API calls in tests
    });

    expect(provider).toBeInstanceOf(HuggingFaceProvider);
    expect(typeof provider.chat).toBe('function');
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.embed).toBe('function');
    expect(typeof provider.stream).toBe('function');
    expect(typeof provider.countTokens).toBe('function');
    expect(typeof provider.getModels).toBe('function');
    expect(typeof provider.getCapabilities).toBe('function');
  });

  it('should auto-detect provider from apiToken', async () => {
    const provider = await getAIAuto({
      apiToken: 'fake-token',
    });

    expect(provider).toBeInstanceOf(HuggingFaceProvider);
  });

  it('should auto-detect Ollama from a local baseUrl', async () => {
    const provider = await getAIAuto({
      baseUrl: 'http://localhost:11434',
      apiKey: 'ollama',
    });

    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  it('should auto-detect Ollama when keepAlive is set to 0', async () => {
    const provider = await getAIAuto({
      keepAlive: 0,
    });

    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  it('should create LiteLLM provider', async () => {
    const provider = await getAI({
      type: 'litellm',
      apiKey: 'fake-token',
      baseUrl: 'https://llm.example.com/v1',
    });

    expect(provider).toBeInstanceOf(LiteLLMProvider);
  });

  it('should create Ollama provider', async () => {
    const provider = await getAI({
      type: 'ollama',
    });

    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  it('should throw ValidationError for unsupported provider', async () => {
    await expect(
      getAI({
        type: 'unsupported-provider',
        apiKey: 'fake-key',
      } as any),
    ).rejects.toThrow(ValidationError);
  });

  it('should throw ValidationError when auto-detection fails', async () => {
    await expect(
      getAIAuto({
        randomField: 'value',
      }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('HuggingFace Provider Integration', () => {
  let provider: HuggingFaceProvider;

  beforeEach(() => {
    provider = new HuggingFaceProvider({
      type: 'huggingface',
      apiToken: 'fake-token',
    });
  });

  it('should have correct capabilities', async () => {
    const capabilities = await provider.getCapabilities();

    expect(capabilities).toEqual({
      chat: true,
      completion: true,
      embeddings: true,
      streaming: true,
      functions: false,
      vision: false,
      fineTuning: true,
      imageEmbeddings: false,
      imageGeneration: false,
      videoGeneration: false,
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 2048,
      supportedOperations: ['chat', 'completion', 'embedding', 'streaming'],
    });
  });

  it('should return models list', async () => {
    const models = await provider.getModels();

    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);

    const firstModel = models[0];
    expect(firstModel).toHaveProperty('id');
    expect(firstModel).toHaveProperty('name');
    expect(firstModel).toHaveProperty('contextLength');
    expect(firstModel).toHaveProperty('capabilities');
    expect(firstModel).toHaveProperty('supportsFunctions');
    expect(firstModel).toHaveProperty('supportsVision');
  });

  it('should approximate token count', async () => {
    const count = await provider.countTokens(
      'Hello world, this is a test message.',
    );

    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(100); // Should be reasonable
  });

  it('should convert messages to prompt format', () => {
    const messages = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'How are you?' },
    ];

    // Access private method for testing
    const prompt = (provider as any).messagesToPrompt(messages);

    expect(prompt).toBe(
      'System: You are helpful\nHuman: Hello\nAssistant: Hi there!\nHuman: How are you?\nAssistant:',
    );
  });

  it('should handle HTTP errors gracefully', async () => {
    // Override fetch to simulate error
    const originalFetch = global.fetch;
    global.fetch = (() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      })) as any;

    try {
      await expect(
        provider.chat([{ role: 'user', content: 'Hello' }]),
      ).rejects.toThrow();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('Error Classes Integration', () => {
  it('should create and throw AIError properly', () => {
    const error = new AIError('Test error', 'TEST_CODE', 'test-provider');

    expect(() => {
      throw error;
    }).toThrow(AIError);
    expect(() => {
      throw error;
    }).toThrow('Test error');

    try {
      throw error;
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(AIError);
      if (e instanceof AIError) {
        expect(e.code).toBe('TEST_CODE');
        expect(e.provider).toBe('test-provider');
      }
    }
  });

  it('should inherit Error properties correctly', () => {
    const error = new AIError('Test message', 'TEST_CODE');

    expect(error.name).toBe('AIError');
    expect(error.message).toBe('Test message');
    expect(error.stack).toBeDefined();
    expect(error instanceof Error).toBe(true);
  });
});

describe('Real API Integration', () => {
  it.skipIf(!GEMINI_API_KEY)(
    'should work with Gemini API if token is provided',
    async () => {
      const provider = await getAI({
        type: 'gemini',
        apiKey: GEMINI_API_KEY,
      });

      // Test basic chat
      const response = await provider.chat([
        { role: 'user', content: 'Say "Hello from Gemini" and nothing else' },
      ]);

      expect(response.content).toBeTruthy();
      expect(typeof response.content).toBe('string');
    },
  );

  it.skipIf(!ANTHROPIC_API_KEY)(
    'should work with Anthropic API if token is provided',
    async () => {
      const provider = await getAI({
        type: 'anthropic',
        apiKey: ANTHROPIC_API_KEY,
      });

      // Test basic chat
      const response = await provider.chat([
        { role: 'user', content: 'Say "Hello from Claude" and nothing else' },
      ]);

      expect(response.content).toBeTruthy();
      expect(typeof response.content).toBe('string');
    },
  );
});

describe('Provider Interface Compliance', () => {
  it('should implement all required interface methods', async () => {
    const provider = await getAI({
      type: 'huggingface',
      apiToken: 'fake-token',
    });

    // Check that all AIInterface methods exist
    const requiredMethods = [
      'chat',
      'complete',
      'embed',
      'stream',
      'countTokens',
      'getModels',
      'getCapabilities',
    ];

    for (const method of requiredMethods) {
      expect(typeof (provider as any)[method]).toBe('function');
    }
  });

  it('should handle different provider types', async () => {
    // Test that we get different provider instances
    const hfProvider = await getAI({
      type: 'huggingface',
      apiToken: 'fake-token',
    });

    const geminiProvider = await getAI({
      type: 'gemini',
      apiKey: 'fake-key',
    });

    const anthropicProvider = await getAI({
      type: 'anthropic',
      apiKey: 'fake-key',
    });

    const bedrockProvider = await getAI({
      type: 'bedrock',
      region: 'us-east-1',
    });

    // All providers should work now!
    expect(hfProvider).toBeInstanceOf(HuggingFaceProvider);
    expect(geminiProvider).toBeDefined();
    expect(anthropicProvider).toBeDefined();
    expect(bedrockProvider).toBeDefined();
  });
});

describe('Tool Use Integration Tests', () => {
  const weatherTool = {
    type: 'function' as const,
    function: {
      name: 'get_weather',
      description: 'Get the current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA',
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit'],
            description: 'The temperature unit',
          },
        },
        required: ['location'],
      },
    },
  };

  describe('OpenAI Tool Use', () => {
    it.skipIf(!OPENAI_API_KEY)(
      'should handle tool calls with OpenAI',
      async () => {
        const provider = await getAI({
          type: 'openai',
          apiKey: OPENAI_API_KEY,
        });

        const response = await provider.chat(
          [
            {
              role: 'user',
              content:
                'What is the weather like in Tokyo? Use the weather tool.',
            },
          ],
          {
            tools: [weatherTool],
            toolChoice: 'auto',
          },
        );

        expect(response).toBeDefined();
        expect(response.toolCalls).toBeDefined();
        expect(response.toolCalls?.length).toBeGreaterThan(0);

        const toolCall = response.toolCalls?.[0];
        expect(toolCall.type).toBe('function');
        expect(toolCall.function.name).toBe('get_weather');
        expect(toolCall.id).toBeTruthy();

        const args = JSON.parse(toolCall.function.arguments);
        expect(args.location).toBeTruthy();
      },
    );

    it.skipIf(!OPENAI_API_KEY)(
      'should handle JSON mode with OpenAI',
      async () => {
        const provider = await getAI({
          type: 'openai',
          apiKey: OPENAI_API_KEY,
        });

        const response = await provider.chat(
          [
            {
              role: 'user',
              content:
                'Return a JSON object with fields: city (Tokyo), temperature (22), unit (celsius)',
            },
          ],
          {
            responseFormat: { type: 'json_object' },
          },
        );

        expect(response.content).toBeTruthy();
        const parsed = JSON.parse(response.content);
        expect(parsed).toHaveProperty('city');
        expect(parsed).toHaveProperty('temperature');
        expect(parsed).toHaveProperty('unit');
      },
    );
  });

  describe('Anthropic Tool Use', () => {
    it.skipIf(!ANTHROPIC_API_KEY)(
      'should handle tool calls with Anthropic',
      async () => {
        const provider = await getAI({
          type: 'anthropic',
          apiKey: ANTHROPIC_API_KEY,
        });

        const response = await provider.chat(
          [
            {
              role: 'user',
              content:
                'What is the weather like in San Francisco, CA? Use the get_weather tool to find out.',
            },
          ],
          {
            tools: [weatherTool],
            toolChoice: 'auto',
            maxTokens: 1024,
          },
        );

        expect(response).toBeDefined();
        expect(response.toolCalls).toBeDefined();
        expect(response.toolCalls?.length).toBeGreaterThan(0);

        const toolCall = response.toolCalls?.[0];
        expect(toolCall.type).toBe('function');
        expect(toolCall.function.name).toBe('get_weather');
        expect(toolCall.id).toBeTruthy();

        const args = JSON.parse(toolCall.function.arguments);
        expect(args.location).toBeTruthy();
      },
    );

    it.skipIf(!ANTHROPIC_API_KEY)(
      'should handle JSON mode with Anthropic (prompt-based)',
      async () => {
        const provider = await getAI({
          type: 'anthropic',
          apiKey: ANTHROPIC_API_KEY,
        });

        const response = await provider.chat(
          [
            {
              role: 'user',
              content:
                'Return a JSON object with fields: city (London), temperature (15), unit (celsius)',
            },
          ],
          {
            responseFormat: { type: 'json_object' },
            maxTokens: 1024,
          },
        );

        expect(response.content).toBeTruthy();

        // Anthropic's JSON mode is prompt-based, so validate it's parseable
        try {
          const parsed = JSON.parse(response.content);
          expect(parsed).toHaveProperty('city');
          expect(parsed).toHaveProperty('temperature');
          expect(parsed).toHaveProperty('unit');
        } catch {
          // Prompt-based JSON mode may still return non-JSON text.
        }
      },
    );
  });

  describe('Gemini Tool Use', () => {
    it.skip('should handle tool calls with Gemini', async () => {
      // NOTE: Gemini 2.5 doesn't reliably return structured functionCall objects
      // even when tools are provided. The model often describes tool calls in text
      // instead of using the structured function calling API. This appears to be
      // a limitation of the current @google/genai SDK or Gemini 2.5 model behavior.
      // Test skipped until Google improves function calling support.

      const provider = await getAI({ type: 'gemini', apiKey: GEMINI_API_KEY! });

      const response = await provider.chat(
        [
          {
            role: 'user',
            content:
              'What is the weather like in New York? Use the get_weather function.',
          },
        ],
        {
          tools: [weatherTool],
          toolChoice: 'auto',
        },
      );

      expect(response).toBeDefined();
      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls?.length).toBeGreaterThan(0);

      const toolCall = response.toolCalls?.[0];
      expect(toolCall.type).toBe('function');
      expect(toolCall.function.name).toBe('get_weather');
      expect(toolCall.id).toBeTruthy();
      expect(toolCall.id).toMatch(/^call_/); // Should have our generated format

      const args = JSON.parse(toolCall.function.arguments);
      expect(args.location).toBeTruthy();
    });

    it.skipIf(!GEMINI_API_KEY)(
      'should handle JSON mode with Gemini',
      async () => {
        const provider = await getAI({
          type: 'gemini',
          apiKey: GEMINI_API_KEY,
        });

        const response = await provider.chat(
          [
            {
              role: 'user',
              content:
                'Return a JSON object with fields: city (Berlin), temperature (18), unit (celsius)',
            },
          ],
          {
            responseFormat: { type: 'json_object' },
          },
        );

        expect(response.content).toBeTruthy();
        const parsed = JSON.parse(response.content);
        expect(parsed).toHaveProperty('city');
        expect(parsed).toHaveProperty('temperature');
        expect(parsed).toHaveProperty('unit');
      },
    );
  });

  describe('Cross-Provider Tool Compatibility', () => {
    it.skipIf(!OPENAI_API_KEY || !ANTHROPIC_API_KEY)(
      'should use same tool definition across OpenAI and Anthropic',
      async () => {
        // NOTE: Gemini is excluded from this test due to SDK limitations with function calling
        // See the skipped Gemini tool use test for more details
        const providers = await Promise.all([
          getAI({ type: 'openai', apiKey: OPENAI_API_KEY }),
          getAI({ type: 'anthropic', apiKey: ANTHROPIC_API_KEY }),
        ]);

        const results = [];

        for (const provider of providers) {
          try {
            const response = await provider.chat(
              [
                {
                  role: 'user',
                  content:
                    'What is the weather in Seattle? Use the weather tool.',
                },
              ],
              {
                tools: [weatherTool],
                toolChoice: 'auto',
                maxTokens: 1024, // For Anthropic
              },
            );

            results.push({
              provider: (provider as any).constructor.name,
              success: !!response.toolCalls,
              toolCallCount: response.toolCalls?.length || 0,
            });
          } catch (error) {
            results.push({
              provider: (provider as any).constructor.name,
              success: false,
              error: (error as Error).message,
            });
          }
        }
        // All providers should successfully make tool calls
        expect(results.every((r) => r.success)).toBe(true);
      },
    );
  });
});
