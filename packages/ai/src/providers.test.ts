/**
 * Real-world tests for AI providers
 * Tests actual functionality without complex mocks
 */

import { ValidationError } from '@happyvertical/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from './shared/providers/anthropic';
import { BedrockProvider } from './shared/providers/bedrock';
import { ClaudeCliProvider } from './shared/providers/claude-cli';
import { GeminiProvider } from './shared/providers/gemini';
import { HuggingFaceProvider } from './shared/providers/huggingface';
import { LiteLLMProvider } from './shared/providers/litellm';
import { OllamaProvider } from './shared/providers/ollama';
import { OpenAIProvider } from './shared/providers/openai';
import { AIError } from './shared/types';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function ndjsonResponse(lines: unknown[]): Response {
  return new Response(lines.map((line) => JSON.stringify(line)).join('\n'), {
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

describe('OpenAI Provider', () => {
  it('should initialize with valid options', () => {
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      defaultModel: 'gpt-4o',
    });

    expect(provider).toBeInstanceOf(OpenAIProvider);
    expect((provider as any).options.apiKey).toBe('test-key');
    expect((provider as any).options.defaultModel).toBe('gpt-4o');
  });

  it('should have all required interface methods', () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key' });

    expect(typeof provider.chat).toBe('function');
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.embed).toBe('function');
    expect(typeof provider.stream).toBe('function');
    expect(typeof provider.countTokens).toBe('function');
    expect(typeof provider.getModels).toBe('function');
    expect(typeof provider.getCapabilities).toBe('function');
  });

  it('should return correct capabilities', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    const capabilities = await provider.getCapabilities();

    expect(capabilities).toEqual({
      chat: true,
      completion: true,
      embeddings: true,
      streaming: true,
      functions: true,
      vision: true,
      fineTuning: true,
      imageEmbeddings: true,
      imageGeneration: true,
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 128000,
      supportedOperations: [
        'chat',
        'completion',
        'embedding',
        'streaming',
        'functions',
        'vision',
        'image_embedding',
        'image_generation',
      ],
    });
  });
});

describe('LiteLLM Provider', () => {
  it('should initialize with valid options', () => {
    const provider = new LiteLLMProvider({
      type: 'litellm',
      apiKey: 'test-key',
      baseUrl: 'https://llm.example.com/v1',
      defaultModel: 'claude-3-5-sonnet',
    });

    expect(provider).toBeInstanceOf(LiteLLMProvider);
    expect((provider as any).options.baseUrl).toBe(
      'https://llm.example.com/v1',
    );
    expect((provider as any).options.defaultModel).toBe('claude-3-5-sonnet');
  });

  it('should require a baseUrl', () => {
    expect(
      () =>
        new LiteLLMProvider({
          type: 'litellm',
          apiKey: 'test-key',
        }),
    ).toThrow(ValidationError);
  });

  it('should return LiteLLM-specific capabilities', async () => {
    const provider = new LiteLLMProvider({
      type: 'litellm',
      apiKey: 'test-key',
      baseUrl: 'https://llm.example.com/v1',
    });

    const capabilities = await provider.getCapabilities();

    expect(capabilities).toEqual({
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
      supportedOperations: [
        'chat',
        'completion',
        'embedding',
        'streaming',
        'functions',
        'vision',
        'image_embedding',
        'image_generation',
      ],
    });
  });

  it('should not filter non-OpenAI chat models from getModels()', async () => {
    const provider = new LiteLLMProvider({
      type: 'litellm',
      apiKey: 'test-key',
      baseUrl: 'https://llm.example.com/v1',
    });

    (provider as any).client = {
      models: {
        list: vi.fn().mockResolvedValue({
          data: [
            { id: 'claude-3-5-sonnet' },
            { id: 'gemini-2.5-flash' },
            { id: 'text-embedding-3-small' },
          ],
        }),
      },
    };

    const models = await provider.getModels();

    expect(models.map((model) => model.id)).toEqual([
      'claude-3-5-sonnet',
      'gemini-2.5-flash',
      'text-embedding-3-small',
    ]);
  });

  it('should auto-resolve a chat model from the gateway when no defaultModel is configured', async () => {
    const createChatCompletion = vi.fn().mockResolvedValue({
      choices: [
        {
          message: { content: 'ok' },
          finish_reason: 'stop',
        },
      ],
      model: 'claude-3-5-sonnet',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    });

    const provider = new LiteLLMProvider({
      type: 'litellm',
      apiKey: 'test-key',
      baseUrl: 'https://llm.example.com/v1',
    });

    (provider as any).client = {
      models: {
        list: vi.fn().mockResolvedValue({
          data: [{ id: 'claude-3-5-sonnet' }, { id: 'text-embedding-3-small' }],
        }),
      },
      chat: {
        completions: {
          create: createChatCompletion,
        },
      },
    };

    await provider.chat([{ role: 'user', content: 'Hello' }]);

    expect(createChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'claude-3-5-sonnet' }),
    );
  });

  it('should auto-resolve an embedding model from the gateway when none is provided', async () => {
    const createEmbedding = vi.fn().mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
      model: 'text-embedding-3-small',
      usage: {
        prompt_tokens: 5,
        total_tokens: 5,
      },
    });

    const provider = new LiteLLMProvider({
      type: 'litellm',
      apiKey: 'test-key',
      baseUrl: 'https://llm.example.com/v1',
    });

    (provider as any).client = {
      models: {
        list: vi.fn().mockResolvedValue({
          data: [{ id: 'claude-3-5-sonnet' }, { id: 'text-embedding-3-small' }],
        }),
      },
      embeddings: {
        create: createEmbedding,
      },
    };

    await provider.embed('Hello');

    expect(createEmbedding).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'text-embedding-3-small' }),
    );
  });

  it('should emit usage events tagged as litellm', async () => {
    const onUsage = vi.fn();
    const provider = new LiteLLMProvider({
      type: 'litellm',
      apiKey: 'test-key',
      baseUrl: 'https://llm.example.com/v1',
      defaultModel: 'claude-3-5-sonnet',
      onUsage,
    });

    (provider as any).client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: { content: 'ok' },
                finish_reason: 'stop',
              },
            ],
            model: 'claude-3-5-sonnet',
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          }),
        },
      },
    };

    await provider.chat([{ role: 'user', content: 'Hello' }]);

    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage.mock.calls[0][0].provider).toBe('litellm');
    expect(onUsage.mock.calls[0][0].model).toBe('claude-3-5-sonnet');
  });

  it('should auto-resolve an image generation model from the gateway', async () => {
    const generateImage = vi.fn().mockResolvedValue({
      data: [
        {
          b64_json: Buffer.from('image-bytes').toString('base64'),
        },
      ],
    });

    const provider = new LiteLLMProvider({
      type: 'litellm',
      apiKey: 'test-key',
      baseUrl: 'https://llm.example.com/v1',
    });

    (provider as any).client = {
      models: {
        list: vi.fn().mockResolvedValue({
          data: [{ id: 'claude-3-5-sonnet' }, { id: 'gpt-image-1' }],
        }),
      },
      images: {
        generate: generateImage,
      },
    };

    await provider.generateImage('A lighthouse on a cliff');

    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-image-1' }),
    );
  });
});

describe('Ollama Provider', () => {
  it('should initialize with sensible defaults', () => {
    const provider = new OllamaProvider({
      type: 'ollama',
    });

    expect(provider).toBeInstanceOf(OllamaProvider);
    expect((provider as any).options.baseUrl).toBe('http://localhost:11434');
  });

  it('should normalize bare host:port values to http URLs', () => {
    const provider = new OllamaProvider({
      type: 'ollama',
      baseUrl: 'warthog:11434',
    });

    expect((provider as any).options.baseUrl).toBe('http://warthog:11434');
  });

  it('should return Ollama capabilities', async () => {
    const provider = new OllamaProvider({
      type: 'ollama',
    });

    const capabilities = await provider.getCapabilities();

    expect(capabilities).toEqual({
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
      maxContextLength: 131072,
      supportedOperations: [
        'chat',
        'completion',
        'embedding',
        'streaming',
        'functions',
        'vision',
        'image_embedding',
        'image_generation',
      ],
    });
  });

  it('should discover models from /api/tags and /api/show', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === 'http://localhost:11434/api/tags') {
          return jsonResponse({
            models: [
              { name: 'gemma3' },
              { name: 'mxbai-embed-large' },
              { name: 'x/z-image-turbo' },
            ],
          });
        }

        if (url === 'http://localhost:11434/api/show') {
          const body = JSON.parse(String(init?.body || '{}'));

          if (body.model === 'gemma3') {
            return jsonResponse({
              capabilities: ['completion', 'vision'],
              details: { family: 'gemma3', parameter_size: '4.3B' },
              model_info: { 'gemma3.context_length': 131072 },
            });
          }

          if (body.model === 'mxbai-embed-large') {
            return jsonResponse({
              capabilities: ['embedding'],
              details: { family: 'bert', parameter_size: '670M' },
              model_info: { 'bert.context_length': 8192 },
            });
          }

          if (body.model === 'x/z-image-turbo') {
            return jsonResponse({
              capabilities: [],
              details: { family: 'flux', parameter_size: '12B' },
            });
          }
        }

        throw new Error(`Unexpected fetch call: ${url}`);
      },
    );

    global.fetch = fetchMock as any;

    try {
      const provider = new OllamaProvider({
        type: 'ollama',
        baseUrl: 'http://localhost:11434/api',
      });

      const models = await provider.getModels();

      expect(models).toEqual([
        expect.objectContaining({
          id: 'gemma3',
          contextLength: 131072,
          capabilities: expect.arrayContaining(['chat', 'vision']),
          supportsVision: true,
        }),
        expect.objectContaining({
          id: 'mxbai-embed-large',
          contextLength: 8192,
          capabilities: ['embeddings'],
          supportsFunctions: false,
          supportsVision: false,
        }),
        expect.objectContaining({
          id: 'x/z-image-turbo',
          capabilities: ['image_generation'],
        }),
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should map native chat requests with multimodal content and tools', async () => {
    const originalFetch = global.fetch;
    const onUsage = vi.fn();
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        expect(url).toBe('http://localhost:11434/api/chat');

        const body = JSON.parse(String(init?.body || '{}'));
        expect(body.keep_alive).toBe('5m');
        expect(body.format).toBe('json');
        expect(body.messages).toEqual([
          {
            role: 'user',
            content: 'What is in this image?',
            images: [Buffer.from('hello-image').toString('base64')],
          },
        ]);
        expect(body.tools).toEqual([
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object' },
            },
          },
        ]);

        return jsonResponse({
          model: 'gemma3',
          message: {
            content: '{"ok":true}',
            tool_calls: [
              {
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: { city: 'Tokyo' },
                },
              },
            ],
          },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 12,
          eval_count: 6,
        });
      },
    );

    global.fetch = fetchMock as any;

    try {
      const provider = new OllamaProvider({
        type: 'ollama',
        keepAlive: '5m',
        onUsage,
      });

      const response = await provider.chat(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${Buffer.from('hello-image').toString('base64')}`,
                },
              },
            ],
          },
        ],
        {
          model: 'gemma3',
          responseFormat: { type: 'json_object' },
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get weather',
                parameters: { type: 'object' },
              },
            },
          ],
          toolChoice: 'auto',
        },
      );

      expect(response.content).toBe('{"ok":true}');
      expect(response.finishReason).toBe('tool_calls');
      expect(response.toolCalls?.[0]?.function.name).toBe('get_weather');
      expect(response.toolCalls?.[0]?.function.arguments).toBe(
        JSON.stringify({ city: 'Tokyo' }),
      );
      expect(onUsage).toHaveBeenCalledTimes(1);
      expect(onUsage.mock.calls[0][0].provider).toBe('ollama');
      expect(onUsage.mock.calls[0][0].usage.totalTokens).toBe(18);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should disable thinking for describeImage so short vision replies stay visible', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        expect(url).toBe('http://localhost:11434/api/chat');

        const body = JSON.parse(String(init?.body || '{}'));
        expect(body.model).toBe('gemma4');
        expect(body.think).toBe(false);
        expect(body.options).toEqual({ num_predict: 32 });
        expect(body.messages).toEqual([
          {
            role: 'user',
            content: 'Reply with one word.',
            images: [Buffer.from('red-square').toString('base64')],
          },
        ]);

        return jsonResponse({
          model: 'gemma4',
          message: { content: 'red' },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 20,
          eval_count: 1,
        });
      },
    );

    global.fetch = fetchMock as any;

    try {
      const provider = new OllamaProvider({
        type: 'ollama',
      });

      const description = await provider.describeImage(
        Buffer.from('red-square'),
        'Reply with one word.',
        {
          model: 'gemma4',
          maxTokens: 32,
        },
      );

      expect(description).toBe('red');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should stream ndjson chat responses', async () => {
    const originalFetch = global.fetch;
    const onUsage = vi.fn();
    const onProgress = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('http://localhost:11434/api/chat');
      return ndjsonResponse([
        {
          model: 'qwen3',
          message: { content: 'Hello' },
          done: false,
        },
        {
          model: 'qwen3',
          message: { content: ' world' },
          done: false,
        },
        {
          model: 'qwen3',
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 4,
          eval_count: 2,
        },
      ]);
    });

    global.fetch = fetchMock as any;

    try {
      const provider = new OllamaProvider({
        type: 'ollama',
        onUsage,
      });

      const chunks: string[] = [];
      for await (const chunk of provider.stream(
        [{ role: 'user', content: 'Say hello' }],
        {
          model: 'qwen3',
          onProgress,
        },
      )) {
        chunks.push(chunk);
      }

      expect(chunks.join('')).toBe('Hello world');
      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onUsage).toHaveBeenCalledTimes(1);
      expect(onUsage.mock.calls[0][0].provider).toBe('ollama');
      expect(onUsage.mock.calls[0][0].usage.totalTokens).toBe(6);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should use the OpenAI-compatible image generation endpoint when requested', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        expect(url).toBe('http://localhost:11434/v1/images/generations');

        const body = JSON.parse(String(init?.body || '{}'));
        expect(body).toEqual({
          model: 'x/z-image-turbo',
          prompt: 'A lighthouse on a cliff',
          n: 1,
          size: '1024x1024',
          response_format: 'b64_json',
        });

        return jsonResponse({
          data: [
            {
              b64_json: Buffer.from('image-bytes').toString('base64'),
            },
          ],
        });
      },
    );

    global.fetch = fetchMock as any;

    try {
      const provider = new OllamaProvider({
        type: 'ollama',
      });

      const result = await provider.generateImage('A lighthouse on a cliff', {
        model: 'x/z-image-turbo',
      });

      expect(result.images).toHaveLength(1);
      expect(Buffer.isBuffer(result.images[0]?.data)).toBe(true);
      expect((result.images[0]?.data as Buffer).toString()).toBe('image-bytes');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('should prefer stable local chat models over hf.co variants when auto-selecting', async () => {
    const originalFetch = global.fetch;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === 'http://localhost:11434/api/tags') {
          return jsonResponse({
            models: [
              {
                name: 'hf.co/DavidAU/OpenAi-GPT-oss-20b-abliterated-uncensored-NEO-Imatrix-gguf:Q5_1',
              },
              { name: 'llama3.2:latest' },
            ],
          });
        }

        if (url === 'http://localhost:11434/api/show') {
          const body = JSON.parse(String(init?.body || '{}'));

          if (
            body.model ===
            'hf.co/DavidAU/OpenAi-GPT-oss-20b-abliterated-uncensored-NEO-Imatrix-gguf:Q5_1'
          ) {
            return jsonResponse({
              capabilities: ['completion', 'thinking'],
              details: { family: 'gpt-oss' },
            });
          }

          if (body.model === 'llama3.2:latest') {
            return jsonResponse({
              capabilities: ['completion', 'tools'],
              details: { family: 'llama' },
            });
          }
        }

        if (url === 'http://localhost:11434/api/chat') {
          const body = JSON.parse(String(init?.body || '{}'));
          expect(body.model).toBe('llama3.2:latest');
          return jsonResponse({
            model: 'llama3.2:latest',
            message: { content: 'Hello from Ollama' },
            done: true,
            done_reason: 'stop',
            prompt_eval_count: 10,
            eval_count: 4,
          });
        }

        throw new Error(`Unexpected fetch call: ${url}`);
      },
    );

    global.fetch = fetchMock as any;

    try {
      const provider = new OllamaProvider({
        type: 'ollama',
      });

      const response = await provider.chat([
        { role: 'user', content: 'Reply with exactly: Hello from Ollama' },
      ]);

      expect(response.content).toBe('Hello from Ollama');
      expect(response.model).toBe('llama3.2:latest');
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('Gemini Provider', () => {
  it('should return correct capabilities', async () => {
    const provider = new GeminiProvider({
      type: 'gemini',
      apiKey: 'test-key',
    });

    const capabilities = await provider.getCapabilities();

    expect(capabilities).toEqual({
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
      maxContextLength: 2000000,
      supportedOperations: [
        'chat',
        'completion',
        'embedding',
        'streaming',
        'functions',
        'vision',
        'image_embedding',
        'image_generation',
      ],
    });
  });

  it('should send generateContent config using the current SDK shape', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: '{"ok":true}',
      candidates: [{ content: { parts: [] } }],
      usageMetadata: {
        promptTokenCount: 5,
        candidatesTokenCount: 2,
        totalTokenCount: 7,
      },
    });

    const provider = new GeminiProvider({
      type: 'gemini',
      apiKey: 'test-key',
    });

    (provider as any).client = {
      models: {
        generateContent,
      },
    };

    await provider.chat([{ role: 'user', content: 'Hello' }], {
      maxTokens: 128,
      responseFormat: { type: 'json_object' },
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather',
            parameters: { type: 'object' },
          },
        },
      ],
      toolChoice: 'auto',
    });

    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-2.5-flash',
        config: expect.objectContaining({
          maxOutputTokens: 128,
          responseMimeType: 'application/json',
          tools: [expect.any(Object)],
          toolConfig: expect.any(Object),
        }),
      }),
    );
  });

  it('should stream chunks with the Gemini streaming API', async () => {
    async function* streamChunks() {
      yield { text: 'Hello', usageMetadata: { totalTokenCount: 3 } };
      yield { text: ' world' };
    }

    const onProgress = vi.fn();
    const provider = new GeminiProvider({
      type: 'gemini',
      apiKey: 'test-key',
    });

    (provider as any).client = {
      models: {
        generateContentStream: vi.fn().mockResolvedValue(streamChunks()),
      },
    };

    const chunks: string[] = [];
    for await (const chunk of provider.stream(
      [{ role: 'user', content: 'Say hello' }],
      { onProgress },
    )) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('Hello world');
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('should use the SDK token counting endpoint when available', async () => {
    const countTokens = vi.fn().mockResolvedValue({ totalTokens: 42 });
    const provider = new GeminiProvider({
      type: 'gemini',
      apiKey: 'test-key',
    });

    (provider as any).client = {
      models: {
        countTokens,
      },
    };

    await expect(provider.countTokens('Hello world')).resolves.toBe(42);
    expect(countTokens).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: 'Hello world',
    });
  });
});

describe('Bedrock Provider', () => {
  it('should return correct capabilities', async () => {
    const provider = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
    });

    const capabilities = await provider.getCapabilities();

    expect(capabilities).toEqual({
      chat: true,
      completion: true,
      embeddings: true,
      streaming: true,
      functions: true,
      vision: true,
      fineTuning: true,
      imageEmbeddings: true,
      imageGeneration: true,
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 200000,
      supportedOperations: [
        'chat',
        'completion',
        'embedding',
        'streaming',
        'functions',
        'vision',
        'image_embedding',
        'image_generation',
      ],
    });
  });

  it('should use Converse for chat requests and map tool use', async () => {
    const converse = vi.fn().mockResolvedValue({
      output: {
        message: {
          content: [
            { text: 'Working on it.' },
            {
              toolUse: {
                toolUseId: 'tool-1',
                name: 'get_weather',
                input: { location: 'Tokyo' },
              },
            },
          ],
        },
      },
      stopReason: 'tool_use',
      usage: {
        inputTokens: 10,
        outputTokens: 4,
        totalTokens: 14,
      },
    });

    const provider = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
    });

    (provider as any).client = {
      converse,
    };

    const response = await provider.chat(
      [{ role: 'user', content: 'What is the weather in Tokyo?' }],
      {
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: { type: 'object' },
            },
          },
        ],
        toolChoice: 'auto',
      },
    );

    expect(converse).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        toolConfig: expect.objectContaining({
          tools: [expect.any(Object)],
          toolChoice: { auto: {} },
        }),
      }),
    );
    expect(response.finishReason).toBe('tool_calls');
    expect(response.toolCalls?.[0]).toEqual({
      id: 'tool-1',
      type: 'function',
      function: {
        name: 'get_weather',
        arguments: JSON.stringify({ location: 'Tokyo' }),
      },
    });
  });

  it('should stream chunks with ConverseStream', async () => {
    async function* streamEvents() {
      yield { contentBlockDelta: { delta: { text: 'Hello' } } };
      yield { contentBlockDelta: { delta: { text: ' world' } } };
      yield {
        metadata: {
          usage: {
            inputTokens: 2,
            outputTokens: 2,
            totalTokens: 4,
          },
        },
      };
    }

    const onProgress = vi.fn();
    const provider = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
    });

    (provider as any).client = {
      converseStream: vi.fn().mockResolvedValue({ stream: streamEvents() }),
    };

    const chunks: string[] = [];
    for await (const chunk of provider.stream(
      [{ role: 'user', content: 'Say hello' }],
      { onProgress },
    )) {
      chunks.push(chunk);
    }

    expect(chunks.join('')).toBe('Hello world');
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('should use Titan embeddings for text embeddings', async () => {
    const invokeModel = vi.fn().mockResolvedValue({
      body: Buffer.from(
        JSON.stringify({
          embedding: [0.1, 0.2, 0.3],
          inputTextTokenCount: 6,
        }),
      ),
    });

    const provider = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
    });

    (provider as any).client = {
      invokeModel,
    };

    const response = await provider.embed('Hello world');

    expect(invokeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'amazon.titan-embed-text-v2:0',
      }),
    );
    expect(response.embeddings).toEqual([[0.1, 0.2, 0.3]]);
    expect(response.usage?.totalTokens).toBe(6);
  });

  it('should generate images with Titan image generation', async () => {
    const invokeModel = vi.fn().mockResolvedValue({
      body: Buffer.from(
        JSON.stringify({
          images: [Buffer.from('image-bytes').toString('base64')],
        }),
      ),
    });

    const provider = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
    });

    (provider as any).client = {
      invokeModel,
    };

    const response = await provider.generateImage('A mountain cabin', {
      aspectRatio: '16:9',
      outputFormat: 'base64',
    });

    expect(invokeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'amazon.titan-image-generator-v2:0',
      }),
    );
    expect(response.images[0]?.data).toBeTypeOf('string');
  });
});

describe('Claude CLI Provider', () => {
  it('should initialize with valid options', () => {
    const provider = new ClaudeCliProvider({
      type: 'claude-cli',
      defaultModel: 'sonnet',
    });

    expect(provider).toBeInstanceOf(ClaudeCliProvider);
    expect((provider as any).options.defaultModel).toBe('sonnet');
  });

  it('should initialize with custom CLI path', () => {
    const provider = new ClaudeCliProvider({
      type: 'claude-cli',
      cliPath: '/custom/path/to/claude',
    });

    expect(provider).toBeInstanceOf(ClaudeCliProvider);
    expect((provider as any).options.cliPath).toBe('/custom/path/to/claude');
  });

  it('should have all required interface methods', () => {
    const provider = new ClaudeCliProvider({ type: 'claude-cli' });

    expect(typeof provider.chat).toBe('function');
    expect(typeof provider.complete).toBe('function');
    expect(typeof provider.embed).toBe('function');
    expect(typeof provider.stream).toBe('function');
    expect(typeof provider.countTokens).toBe('function');
    expect(typeof provider.getModels).toBe('function');
    expect(typeof provider.getCapabilities).toBe('function');
  });

  it('should return correct capabilities', async () => {
    const provider = new ClaudeCliProvider({ type: 'claude-cli' });
    const capabilities = await provider.getCapabilities();

    expect(capabilities).toEqual({
      chat: true,
      completion: true,
      embeddings: false, // Claude CLI doesn't support embeddings
      streaming: true,
      functions: false, // Not supported via CLI
      vision: false, // Not supported in current CLI version
      fineTuning: false,
      imageEmbeddings: false,
      imageGeneration: false,
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 200000,
      supportedOperations: ['chat', 'completion', 'streaming'],
    });
  });

  it('should return static models list', async () => {
    const provider = new ClaudeCliProvider({ type: 'claude-cli' });

    const models = await provider.getModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('name');
    expect(models.map((m) => m.id)).toContain('sonnet');
  });

  it('should throw error for embeddings', async () => {
    const provider = new ClaudeCliProvider({ type: 'claude-cli' });

    await expect(provider.embed('test text')).rejects.toThrow(AIError);
    await expect(provider.embed('test text')).rejects.toThrow(
      /does not support embeddings/,
    );
  });
});

describe('HuggingFace Provider', () => {
  it('should initialize with valid options', () => {
    const provider = new HuggingFaceProvider({
      type: 'huggingface',
      apiToken: 'test-token',
      model: 'gpt2',
    });

    expect(provider).toBeInstanceOf(HuggingFaceProvider);
    expect((provider as any).options.apiToken).toBe('test-token');
    expect((provider as any).options.model).toBe('gpt2');
  });

  it('should convert messages to prompt correctly', () => {
    const provider = new HuggingFaceProvider({
      type: 'huggingface',
      apiToken: 'test-token',
    });

    const messages = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'How are you?' },
    ];

    const prompt = (provider as any).messagesToPrompt(messages);
    expect(prompt).toBe(
      'System: You are helpful\nHuman: Hello\nAssistant: Hi!\nHuman: How are you?\nAssistant:',
    );
  });

  it('should return static models list', async () => {
    const provider = new HuggingFaceProvider({
      type: 'huggingface',
      apiToken: 'test-token',
    });

    const models = await provider.getModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('name');
  });
});

describe('Provider Implementations', () => {
  it('should create all provider instances successfully', () => {
    // OpenAI should work
    const openaiProvider = new OpenAIProvider({ apiKey: 'test-key' });
    expect(openaiProvider).toBeInstanceOf(OpenAIProvider);

    const litellmProvider = new LiteLLMProvider({
      type: 'litellm',
      apiKey: 'test-token',
      baseUrl: 'https://llm.example.com/v1',
    });
    expect(litellmProvider).toBeInstanceOf(LiteLLMProvider);

    // HuggingFace should work
    const hfProvider = new HuggingFaceProvider({
      type: 'huggingface',
      apiToken: 'test-token',
    });
    expect(hfProvider).toBeInstanceOf(HuggingFaceProvider);

    // Gemini should work now
    const geminiProvider = new GeminiProvider({
      type: 'gemini',
      apiKey: 'test-key',
    });
    expect(geminiProvider).toBeInstanceOf(GeminiProvider);

    // Anthropic should work now
    const anthropicProvider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test-key',
    });
    expect(anthropicProvider).toBeInstanceOf(AnthropicProvider);

    // Bedrock should work now
    const bedrockProvider = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
    });
    expect(bedrockProvider).toBeInstanceOf(BedrockProvider);

    // Claude CLI should work now
    const claudeCliProvider = new ClaudeCliProvider({
      type: 'claude-cli',
    });
    expect(claudeCliProvider).toBeInstanceOf(ClaudeCliProvider);

    const ollamaProvider = new OllamaProvider({
      type: 'ollama',
    });
    expect(ollamaProvider).toBeInstanceOf(OllamaProvider);
  });

  it('should create all providers successfully', () => {
    // All providers should work now!
    expect(() => new OpenAIProvider({ apiKey: 'test-key' })).not.toThrow();
    expect(
      () =>
        new LiteLLMProvider({
          type: 'litellm',
          apiKey: 'test-token',
          baseUrl: 'https://llm.example.com/v1',
        }),
    ).not.toThrow();
    expect(
      () =>
        new HuggingFaceProvider({
          type: 'huggingface',
          apiToken: 'test-token',
        }),
    ).not.toThrow();
    expect(
      () => new GeminiProvider({ type: 'gemini', apiKey: 'test-key' }),
    ).not.toThrow();
    expect(
      () => new AnthropicProvider({ type: 'anthropic', apiKey: 'test-key' }),
    ).not.toThrow();
    expect(
      () => new BedrockProvider({ type: 'bedrock', region: 'us-east-1' }),
    ).not.toThrow();
    expect(() => new ClaudeCliProvider({ type: 'claude-cli' })).not.toThrow();
    expect(() => new OllamaProvider({ type: 'ollama' })).not.toThrow();
  });
});

describe('Token Counting', () => {
  it('should provide reasonable token estimates', async () => {
    const openaiProvider = new OpenAIProvider({ apiKey: 'test-key' });
    const hfProvider = new HuggingFaceProvider({
      type: 'huggingface',
      apiToken: 'test-token',
    });
    const claudeCliProvider = new ClaudeCliProvider({ type: 'claude-cli' });

    const text = 'Hello, this is a test message with several words.';

    const openaiTokens = await openaiProvider.countTokens(text);
    const hfTokens = await hfProvider.countTokens(text);
    const claudeCliTokens = await claudeCliProvider.countTokens(text);

    expect(typeof openaiTokens).toBe('number');
    expect(typeof hfTokens).toBe('number');
    expect(typeof claudeCliTokens).toBe('number');
    expect(openaiTokens).toBeGreaterThan(0);
    expect(hfTokens).toBeGreaterThan(0);
    expect(claudeCliTokens).toBeGreaterThan(0);

    // Should be reasonable estimates (not wildly off)
    expect(openaiTokens).toBeLessThan(100);
    expect(hfTokens).toBeLessThan(100);
    expect(claudeCliTokens).toBeLessThan(100);
  });
});

describe('Error Mapping', () => {
  it('should handle error mapping correctly', () => {
    const hfProvider = new HuggingFaceProvider({
      type: 'huggingface',
      apiToken: 'test-token',
    });

    // Test private mapError method
    const mappedError = (hfProvider as any).mapError(new Error('Test error'));
    expect(mappedError).toBeInstanceOf(AIError);
    expect(mappedError.message).toBe('Test error');
    expect(mappedError.provider).toBe('huggingface');
  });
});

describe('Environment Variable Configuration', () => {
  // Store original env vars to restore after tests
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original environment variables
    process.env = { ...originalEnv };
  });

  it('should load provider type from HAVE_AI_PROVIDER', async () => {
    process.env.HAVE_AI_PROVIDER = 'claude-cli';
    process.env.HAVE_AI_MODEL = 'sonnet';

    const { getAI } = await import('./shared/factory');
    const client = await getAI({});

    expect(client).toBeInstanceOf(ClaudeCliProvider);
  }, 15000); // Increased timeout for CLI process initialization

  it('should load provider type from HAVE_AI_TYPE', async () => {
    process.env.HAVE_AI_TYPE = 'claude-cli';

    const { getAI } = await import('./shared/factory');
    const client = await getAI({});

    expect(client).toBeInstanceOf(ClaudeCliProvider);
  });

  it('should load timeout and maxRetries from env vars', async () => {
    process.env.HAVE_AI_TYPE = 'openai';
    process.env.HAVE_AI_API_KEY = 'test-key';
    process.env.HAVE_AI_TIMEOUT = '60000';
    process.env.HAVE_AI_MAX_RETRIES = '5';

    const { getAI } = await import('./shared/factory');
    const client = await getAI({});

    expect(client).toBeInstanceOf(OpenAIProvider);
    expect((client as any).options.timeout).toBe(60000);
    expect((client as any).options.maxRetries).toBe(5);
  });

  it('should load model from HAVE_AI_MODEL', async () => {
    process.env.HAVE_AI_TYPE = 'openai';
    process.env.HAVE_AI_API_KEY = 'test-key';
    process.env.HAVE_AI_MODEL = 'gpt-3.5-turbo';

    const { getAI } = await import('./shared/factory');
    const client = await getAI({});

    expect(client).toBeInstanceOf(OpenAIProvider);
    expect((client as any).options.defaultModel).toBe('gpt-3.5-turbo');
  });

  it('should load baseUrl from HAVE_AI_BASE_URL', async () => {
    process.env.HAVE_AI_TYPE = 'openai';
    process.env.HAVE_AI_API_KEY = 'test-key';
    process.env.HAVE_AI_BASE_URL = 'https://custom.openai.proxy';

    const { getAI } = await import('./shared/factory');
    const client = await getAI({});

    expect(client).toBeInstanceOf(OpenAIProvider);
    expect((client as any).options.baseUrl).toBe('https://custom.openai.proxy');
  });

  it('should load LiteLLM provider from HAVE_AI_TYPE', async () => {
    process.env.HAVE_AI_TYPE = 'litellm';
    process.env.HAVE_AI_API_KEY = 'test-key';
    process.env.HAVE_AI_BASE_URL = 'https://llm.example.com/v1';

    const { getAI } = await import('./shared/factory');
    const client = await getAI({});

    expect(client).toBeInstanceOf(LiteLLMProvider);
    expect((client as any).options.baseUrl).toBe('https://llm.example.com/v1');
  });

  it('should load Ollama provider from HAVE_AI_TYPE', async () => {
    process.env.HAVE_AI_TYPE = 'ollama';
    delete process.env.HAVE_AI_BASE_URL;

    const { getAI } = await import('./shared/factory');
    const client = await getAI({});

    expect(client).toBeInstanceOf(OllamaProvider);
    expect((client as any).options.baseUrl).toBe('http://localhost:11434');
  });

  it('should prioritize user options over env vars', async () => {
    process.env.HAVE_AI_TYPE = 'openai';
    process.env.HAVE_AI_MODEL = 'gpt-3.5-turbo';
    process.env.HAVE_AI_TIMEOUT = '30000';

    const { getAI } = await import('./shared/factory');
    const client = await getAI({
      type: 'claude-cli',
      defaultModel: 'opus',
      timeout: 90000,
    });

    expect(client).toBeInstanceOf(ClaudeCliProvider);
    expect((client as any).options.defaultModel).toBe('opus');
    expect((client as any).options.timeout).toBe(90000);
  });

  it('should support HAVE_AI_API_KEY as fallback', async () => {
    process.env.HAVE_AI_TYPE = 'openai';
    process.env.HAVE_AI_API_KEY = 'fallback-key';

    const { getAI } = await import('./shared/factory');
    const client = await getAI({});

    expect(client).toBeInstanceOf(OpenAIProvider);
    expect((client as any).options.apiKey).toBe('fallback-key');
  });

  it('should handle getAIAuto with HAVE_AI_PROVIDER', async () => {
    process.env.HAVE_AI_PROVIDER = 'claude-cli';
    process.env.HAVE_AI_MODEL = 'sonnet';

    const { getAIAuto } = await import('./node/factory');
    const client = await getAIAuto({});

    expect(client).toBeInstanceOf(ClaudeCliProvider);
  });

  it('should auto-detect LiteLLM from LITELLM_BASE_URL', async () => {
    process.env.LITELLM_BASE_URL = 'https://llm.example.com/v1';
    process.env.LITELLM_API_KEY = 'litellm-key';

    const { getAIAuto } = await import('./node/factory');
    const client = await getAIAuto({});

    expect(client).toBeInstanceOf(LiteLLMProvider);
    expect((client as any).options.baseUrl).toBe('https://llm.example.com/v1');
    expect((client as any).options.apiKey).toBe('litellm-key');
  });

  it('should auto-detect Ollama from OLLAMA_HOST', async () => {
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.OLLAMA_HOST = 'https://ollama.example.com/api';
    process.env.OLLAMA_API_KEY = 'ollama-key';

    const { getAIAuto } = await import('./node/factory');
    const client = await getAIAuto({});

    expect(client).toBeInstanceOf(OllamaProvider);
    expect((client as any).options.baseUrl).toBe('https://ollama.example.com');
    expect((client as any).options.apiKey).toBe('ollama-key');
  });

  it('should not treat a custom baseUrl as LiteLLM when Ollama env signals are present', async () => {
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.OLLAMA_API_KEY = 'ollama-key';

    const { getAIAuto } = await import('./node/factory');
    const client = await getAIAuto({
      baseUrl: 'https://ollama.example.com/api',
    });

    expect(client).toBeInstanceOf(OllamaProvider);
    expect((client as any).options.baseUrl).toBe('https://ollama.example.com');
    expect((client as any).options.apiKey).toBe('ollama-key');
  });

  it('should auto-detect Anthropic from ANTHROPIC_API_KEY', async () => {
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_API_KEY;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'anthropic-key';

    const { getAIAuto } = await import('./node/factory');
    const client = await getAIAuto({});

    expect(client).toBeInstanceOf(AnthropicProvider);
    expect((client as any).options.apiKey).toBe('anthropic-key');
  });

  it('should auto-detect Gemini from GEMINI_API_KEY', async () => {
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_API_KEY;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_API_KEY;
    process.env.GEMINI_API_KEY = 'gemini-key';

    const { getAIAuto } = await import('./node/factory');
    const client = await getAIAuto({});

    expect(client).toBeInstanceOf(GeminiProvider);
    expect((client as any).options.apiKey).toBe('gemini-key');
  });

  it('should handle numeric conversion correctly', async () => {
    process.env.HAVE_AI_TYPE = 'openai';
    process.env.HAVE_AI_API_KEY = 'test-key';
    process.env.HAVE_AI_TIMEOUT = '45000';
    process.env.HAVE_AI_MAX_RETRIES = '3';

    const { getAI } = await import('./shared/factory');
    const client = await getAI({});

    expect((client as any).options.timeout).toBe(45000);
    expect((client as any).options.timeout).not.toBe('45000');
    expect((client as any).options.maxRetries).toBe(3);
    expect((client as any).options.maxRetries).not.toBe('3');
  });

  it('should pass Issue #258 test case - claude-cli provider from env', async () => {
    // This is the exact test case from Issue #258
    process.env.HAVE_AI_PROVIDER = 'claude-cli';
    process.env.HAVE_AI_MODEL = 'sonnet';

    const { getAI } = await import('./shared/factory');
    const ai = await getAI({}); // Should use claude-cli provider, not default to OpenAI

    expect(ai).toBeInstanceOf(ClaudeCliProvider);
    expect((ai as any).options.defaultModel).toBe('sonnet');
  });

  it('should work with empty object when env vars are set', async () => {
    process.env.HAVE_AI_TYPE = 'claude-cli';
    process.env.HAVE_AI_MODEL = 'opus';

    const { getAI } = await import('./shared/factory');
    const client = await getAI({});

    expect(client).toBeInstanceOf(ClaudeCliProvider);
    expect((client as any).options.defaultModel).toBe('opus');
  });
});
