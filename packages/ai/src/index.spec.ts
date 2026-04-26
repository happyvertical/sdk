import { expect, it } from 'vitest';
import { AIClient } from './shared/client';
import type {
  AnthropicOptions,
  BedrockOptions,
  BifrostOptions,
  GeminiOptions,
  HuggingFaceOptions,
  OllamaOptions,
} from './shared/types';

it('should support creating Anthropic client via AIClient.create', async () => {
  const options: AnthropicOptions = {
    type: 'anthropic',
    apiKey: 'test-key',
  };
  const client = await AIClient.create(options);
  expect(client).toBeDefined();
  expect(client.options.type).toBe('anthropic');
});

it('should support creating Gemini client via AIClient.create', async () => {
  const options: GeminiOptions = {
    type: 'gemini',
    apiKey: 'test-key',
  };
  const client = await AIClient.create(options);
  expect(client).toBeDefined();
  expect(client.options.type).toBe('gemini');
});

it('should support creating Bedrock client via AIClient.create', async () => {
  const options: BedrockOptions = {
    type: 'bedrock',
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret',
    },
  };
  const client = await AIClient.create(options);
  expect(client).toBeDefined();
  expect(client.options.type).toBe('bedrock');
});

it('should support creating HuggingFace client via AIClient.create', async () => {
  const options: HuggingFaceOptions = {
    type: 'huggingface',
    apiToken: 'test-token',
    model: 'microsoft/DialoGPT-medium',
  };
  const client = await AIClient.create(options);
  expect(client).toBeDefined();
  expect(client.options.type).toBe('huggingface');
});

it('should support creating Ollama client via AIClient.create', async () => {
  const options: OllamaOptions = {
    type: 'ollama',
  };
  const client = await AIClient.create(options);
  expect(client).toBeDefined();
  expect(client.options.type).toBe('ollama');
});

it('should support creating Bifrost client via AIClient.create', async () => {
  const options: BifrostOptions = {
    type: 'bifrost',
    apiKey: 'test-key',
    baseUrl: 'https://bifrost.example.com/openai',
  };
  const client = await AIClient.create(options);
  expect(client).toBeDefined();
  expect(client.options.type).toBe('bifrost');
});

it('should throw helpful error for unsupported provider type', async () => {
  await expect(
    // @ts-expect-error - Testing invalid provider type
    AIClient.create({
      type: 'invalid-provider',
      apiKey: 'test-key',
    }),
  ).rejects.toThrow('Unsupported AI provider type');
});

it('should list all supported providers in error message', async () => {
  try {
    // @ts-expect-error - Testing invalid provider type
    await AIClient.create({
      type: 'invalid-provider',
      apiKey: 'test-key',
    });
    // Should not reach here
    expect(true).toBe(false);
  } catch (error: unknown) {
    const err = error as { context: { supportedTypes: string[] } };
    expect(err.context.supportedTypes).toContain('openai');
    expect(err.context.supportedTypes).toContain('litellm');
    expect(err.context.supportedTypes).toContain('bifrost');
    expect(err.context.supportedTypes).toContain('ollama');
    expect(err.context.supportedTypes).toContain('anthropic');
    expect(err.context.supportedTypes).toContain('gemini');
    expect(err.context.supportedTypes).toContain('bedrock');
    expect(err.context.supportedTypes).toContain('huggingface');
    expect(err.context.supportedTypes).toContain('claude-cli');
    expect(err.context.supportedTypes).toContain('qwen3-tts');
  }
});
