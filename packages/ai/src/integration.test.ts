/**
 * Integration tests for AI providers
 * These test real functionality without mocks
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationError } from '@have/utils';
import { getAI, getAIAuto } from './factory.js';
import { AIError } from './types.js';
import { HuggingFaceProvider } from './providers/huggingface.js';

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

  it('should throw ValidationError for unsupported provider', async () => {
    await expect(getAI({
      type: 'unsupported-provider',
      apiKey: 'fake-key',
    } as any)).rejects.toThrow(ValidationError);
  });

  it('should throw ValidationError when auto-detection fails', async () => {
    await expect(getAIAuto({
      randomField: 'value',
    })).rejects.toThrow(ValidationError);
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
      streaming: false,
      functions: false,
      vision: false,
      fineTuning: true,
      maxContextLength: 2048,
      supportedOperations: ['chat', 'completion', 'embedding'],
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
    const count = await provider.countTokens('Hello world, this is a test message.');
    
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
      'System: You are helpful\nHuman: Hello\nAssistant: Hi there!\nHuman: How are you?\nAssistant:'
    );
  });

  it('should handle HTTP errors gracefully', async () => {
    // Override fetch to simulate error
    const originalFetch = global.fetch;
    global.fetch = (() => Promise.resolve({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    })) as any;

    try {
      await expect(provider.chat([
        { role: 'user', content: 'Hello' }
      ])).rejects.toThrow();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('Error Classes Integration', () => {
  it('should create and throw AIError properly', () => {
    const error = new AIError('Test error', 'TEST_CODE', 'test-provider');
    
    expect(() => { throw error; }).toThrow(AIError);
    expect(() => { throw error; }).toThrow('Test error');
    
    try {
      throw error;
    } catch (e) {
      expect(e).toBeInstanceOf(AIError);
      expect(e.code).toBe('TEST_CODE');
      expect(e.provider).toBe('test-provider');
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
  it('should work with Gemini API if token is provided', async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.log('Skipping Gemini API test - no GEMINI_API_KEY provided');
      return;
    }

    const provider = await getAI({
      type: 'gemini',
      apiKey,
    });

    // Test basic chat
    const response = await provider.chat([
      { role: 'user', content: 'Say "Hello from Gemini" and nothing else' }
    ]);

    expect(response.content).toBeTruthy();
    expect(typeof response.content).toBe('string');
    console.log('Gemini response:', response.content);
  });

  it('should work with Anthropic API if token is provided', async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log('Skipping Anthropic API test - no ANTHROPIC_API_KEY provided');
      return;
    }

    const provider = await getAI({
      type: 'anthropic',
      apiKey,
    });

    // Test basic chat
    const response = await provider.chat([
      { role: 'user', content: 'Say "Hello from Claude" and nothing else' }
    ]);

    expect(response.content).toBeTruthy();
    expect(typeof response.content).toBe('string');
    console.log('Anthropic response:', response.content);
  });
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
      'getCapabilities'
    ];

    for (const method of requiredMethods) {
      expect(typeof provider[method]).toBe('function');
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