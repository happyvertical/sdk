/**
 * Real-world tests for AI providers
 * Tests actual functionality without complex mocks
 */

import { describe, it, expect } from 'vitest';
import { OpenAIProvider } from './providers/openai.js';
import { HuggingFaceProvider } from './providers/huggingface.js';
import { GeminiProvider } from './providers/gemini.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { BedrockProvider } from './providers/bedrock.js';
import { AIError } from './types.js';

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
      supportedOperations: ['chat', 'completion', 'embedding', 'streaming', 'functions', 'vision'],
    });
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
    expect(prompt).toBe('System: You are helpful\nHuman: Hello\nAssistant: Hi!\nHuman: How are you?\nAssistant:');
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
  it('should throw not implemented errors for incomplete providers', () => {
    // Gemini should throw
    expect(() => new GeminiProvider({
      type: 'gemini',
      apiKey: 'test-key',
    })).toThrow(AIError);

    // Anthropic should throw  
    expect(() => new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test-key',
    })).toThrow(AIError);

    // Bedrock should throw
    expect(() => new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
    })).toThrow(AIError);
  });

  it('should create working providers for implemented ones', () => {
    // OpenAI should work
    const openaiProvider = new OpenAIProvider({ apiKey: 'test-key' });
    expect(openaiProvider).toBeInstanceOf(OpenAIProvider);

    // HuggingFace should work
    const hfProvider = new HuggingFaceProvider({
      type: 'huggingface',
      apiToken: 'test-token',
    });
    expect(hfProvider).toBeInstanceOf(HuggingFaceProvider);
  });
});

describe('Token Counting', () => {
  it('should provide reasonable token estimates', async () => {
    const openaiProvider = new OpenAIProvider({ apiKey: 'test-key' });
    const hfProvider = new HuggingFaceProvider({
      type: 'huggingface',
      apiToken: 'test-token',
    });

    const text = 'Hello, this is a test message with several words.';
    
    const openaiTokens = await openaiProvider.countTokens(text);
    const hfTokens = await hfProvider.countTokens(text);

    expect(typeof openaiTokens).toBe('number');
    expect(typeof hfTokens).toBe('number');
    expect(openaiTokens).toBeGreaterThan(0);
    expect(hfTokens).toBeGreaterThan(0);
    
    // Should be reasonable estimates (not wildly off)
    expect(openaiTokens).toBeLessThan(100);
    expect(hfTokens).toBeLessThan(100);
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