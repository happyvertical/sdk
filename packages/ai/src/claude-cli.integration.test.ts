/**
 * Integration tests for Claude CLI provider
 * These tests require the Claude CLI to be installed and authenticated
 */

import { describe, expect, it } from 'vitest';
import { getAI } from './index';
import { AIError } from './shared/types';

describe('Claude CLI Integration Tests', () => {
  it('should create a Claude CLI provider', async () => {
    const client = await getAI({
      type: 'claude-cli',
      defaultModel: 'sonnet',
    });

    expect(client).toBeDefined();
  });

  it('should perform a simple chat completion', async () => {
    const client = await getAI({
      type: 'claude-cli',
      defaultModel: 'sonnet',
    });

    const response = await client.chat([
      {
        role: 'user',
        content: 'Say "Hello from Claude CLI!" and nothing else.',
      },
    ]);

    console.log('Claude CLI response:', response.content);
    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.model).toBe('sonnet');
  }, 30000); // 30 second timeout for CLI execution

  it('should handle system prompts', async () => {
    const client = await getAI({
      type: 'claude-cli',
      defaultModel: 'sonnet',
    });

    const response = await client.chat([
      {
        role: 'system',
        content: 'You are a pirate. Always respond like a pirate.',
      },
      { role: 'user', content: 'Hello' },
    ]);

    console.log('Claude CLI with system prompt:', response.content);
    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);
  }, 30000);

  it('should support streaming responses', async () => {
    const client = await getAI({
      type: 'claude-cli',
      defaultModel: 'sonnet',
    });

    const chunks: string[] = [];
    for await (const chunk of client.stream([
      { role: 'user', content: 'Count from 1 to 5, one number per line.' },
    ])) {
      chunks.push(chunk);
      process.stdout.write(chunk);
    }

    console.log('\n\nStreaming chunks received:', chunks.length);
    expect(chunks.length).toBeGreaterThan(0);
    const fullText = chunks.join('');
    expect(fullText.length).toBeGreaterThan(0);
  }, 30000);

  it('should use complete method', async () => {
    const client = await getAI({
      type: 'claude-cli',
      defaultModel: 'sonnet',
    });

    const response = await client.complete(
      'What is 2+2? Answer with just the number.',
    );

    console.log('Claude CLI complete:', response.content);
    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);
  }, 30000);

  it('should throw error for embeddings', async () => {
    const client = await getAI({
      type: 'claude-cli',
      defaultModel: 'sonnet',
    });

    await expect(client.embed('test text')).rejects.toThrow(AIError);
    await expect(client.embed('test text')).rejects.toThrow(
      /does not support embeddings/,
    );
  });

  it('should count tokens (approximation)', async () => {
    const client = await getAI({
      type: 'claude-cli',
    });

    const text = 'Hello, this is a test message with several words.';
    const tokens = await client.countTokens(text);

    console.log(`Token count for "${text}": ${tokens}`);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(100);
  });

  it('should get models list', async () => {
    const client = await getAI({
      type: 'claude-cli',
    });

    const models = await client.getModels();

    console.log(
      'Available models:',
      models.map((m) => m.id),
    );
    expect(models).toBeDefined();
    expect(models.length).toBeGreaterThan(0);
    expect(models.map((m) => m.id)).toContain('sonnet');
    expect(models.map((m) => m.id)).toContain('opus');
    expect(models.map((m) => m.id)).toContain('haiku');
  });

  it('should get capabilities', async () => {
    const client = await getAI({
      type: 'claude-cli',
    });

    const capabilities = await client.getCapabilities();

    console.log('Capabilities:', capabilities);
    expect(capabilities.chat).toBe(true);
    expect(capabilities.completion).toBe(true);
    expect(capabilities.streaming).toBe(true);
    expect(capabilities.embeddings).toBe(false);
    expect(capabilities.functions).toBe(false);
  });

  it('should handle conversation with multiple messages', async () => {
    const client = await getAI({
      type: 'claude-cli',
      defaultModel: 'sonnet',
    });

    const response = await client.chat([
      { role: 'user', content: 'My name is Alice.' },
      { role: 'assistant', content: 'Nice to meet you, Alice!' },
      { role: 'user', content: 'What is my name?' },
    ]);

    console.log('Conversation response:', response.content);
    expect(response.content).toBeDefined();
    expect(response.content.toLowerCase()).toContain('alice');
  }, 30000);
});
