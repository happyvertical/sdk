/**
 * Real-world tests for AI providers
 * Tests actual functionality without complex mocks
 */

import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from './shared/providers/anthropic';
import { BedrockProvider } from './shared/providers/bedrock';
import { ClaudeCliProvider } from './shared/providers/claude-cli';
import { GeminiProvider } from './shared/providers/gemini';
import { HuggingFaceProvider } from './shared/providers/huggingface';
import { OpenAIProvider } from './shared/providers/openai';
import { AIError } from './shared/types';

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
      maxContextLength: 128000,
      supportedOperations: [
        'chat',
        'completion',
        'embedding',
        'streaming',
        'functions',
        'vision',
      ],
    });
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
  });

  it('should create all providers successfully', () => {
    // All providers should work now!
    expect(() => new OpenAIProvider({ apiKey: 'test-key' })).not.toThrow();
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
  });

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
