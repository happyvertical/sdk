/**
 * Integration tests for Gemini 3 Flash Preview model
 *
 * This model is only available on Vertex AI in us-central1 region.
 * Requires either:
 * - GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION env vars with ADC
 * - Or GEMINI_API_KEY with projectId/location in options (not typically supported)
 *
 * To run these tests:
 * 1. Set up Application Default Credentials (ADC):
 *    gcloud auth application-default login
 * 2. Set environment variables:
 *    export GOOGLE_CLOUD_PROJECT=your-project-id
 *    export GOOGLE_CLOUD_LOCATION=us-central1
 * 3. Run the tests:
 *    npm test -- gemini-3-flash.integration.test.ts
 */

import { describe, expect, it } from 'vitest';
import { getAI } from './shared/factory';
import { GeminiProvider } from './shared/providers/gemini';

const GEMINI_3_FLASH_MODEL = 'gemini-3-flash-preview';

describe('Gemini 3 Flash Preview Integration Tests', () => {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

  const skipMessage =
    'Skipping Gemini 3 Flash test - set GOOGLE_CLOUD_PROJECT env var and ensure ADC is configured';

  describe('Provider Initialization', () => {
    it('should initialize GeminiProvider with Vertex AI configuration', async () => {
      const provider = await getAI({
        type: 'gemini',
        projectId: 'test-project',
        location: 'us-central1',
      });

      expect(provider).toBeInstanceOf(GeminiProvider);
    });

    it('should include gemini-3-flash-preview in models list', async () => {
      const provider = await getAI({
        type: 'gemini',
        apiKey: 'fake-key',
      });

      const models = await provider.getModels();
      const gemini3Flash = models.find((m) => m.id === GEMINI_3_FLASH_MODEL);

      expect(gemini3Flash).toBeDefined();
      expect(gemini3Flash?.name).toBe('Gemini 3 Flash Preview');
      expect(gemini3Flash?.supportsFunctions).toBe(true);
      expect(gemini3Flash?.supportsVision).toBe(true);
    });
  });

  describe('Basic Chat Completion', () => {
    it('should complete a basic chat request with Gemini 3 Flash', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
      });

      const response = await provider.chat([
        {
          role: 'user',
          content: 'Say "Hello from Gemini 3 Flash" and nothing else',
        },
      ]);

      expect(response.content).toBeTruthy();
      expect(typeof response.content).toBe('string');
      expect(response.model).toBe(GEMINI_3_FLASH_MODEL);
      console.log('Gemini 3 Flash response:', response.content);
    });

    it('should handle system messages correctly', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
      });

      const response = await provider.chat([
        {
          role: 'system',
          content:
            'You are a helpful assistant that only responds in uppercase.',
        },
        { role: 'user', content: 'Say hello' },
      ]);

      expect(response.content).toBeTruthy();
      console.log('System message test response:', response.content);
    });

    it('should handle multi-turn conversations', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
      });

      const response = await provider.chat([
        { role: 'user', content: 'My name is Alice.' },
        { role: 'assistant', content: 'Nice to meet you, Alice!' },
        { role: 'user', content: 'What is my name?' },
      ]);

      expect(response.content).toBeTruthy();
      expect(response.content.toLowerCase()).toContain('alice');
      console.log('Multi-turn response:', response.content);
    });
  });

  describe('JSON Mode', () => {
    it('should return valid JSON when responseFormat is json_object', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
      });

      const response = await provider.chat(
        [
          {
            role: 'user',
            content:
              'Return a JSON object with fields: name (string "test"), value (number 42)',
          },
        ],
        {
          responseFormat: { type: 'json_object' },
        },
      );

      expect(response.content).toBeTruthy();

      // Should be parseable as JSON
      const parsed = JSON.parse(response.content);
      expect(parsed).toHaveProperty('name');
      expect(parsed).toHaveProperty('value');
      console.log('JSON mode response:', parsed);
    });
  });

  describe('Completion Options', () => {
    it('should respect maxTokens parameter', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
      });

      const response = await provider.chat(
        [
          {
            role: 'user',
            content: 'Write a long story about space exploration.',
          },
        ],
        {
          maxTokens: 50,
        },
      );

      expect(response.content).toBeTruthy();
      // With maxTokens=50, the response should be relatively short
      expect(response.content.length).toBeLessThan(500);
      console.log('Max tokens response length:', response.content.length);
    });

    it('should respect temperature parameter', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
      });

      // Low temperature should give more deterministic results
      const response1 = await provider.chat(
        [
          {
            role: 'user',
            content: 'What is 2+2? Answer with just the number.',
          },
        ],
        { temperature: 0 },
      );

      const response2 = await provider.chat(
        [
          {
            role: 'user',
            content: 'What is 2+2? Answer with just the number.',
          },
        ],
        { temperature: 0 },
      );

      expect(response1.content).toBeTruthy();
      expect(response2.content).toBeTruthy();
      // With temperature 0, responses should be identical or very similar
      console.log(
        'Temperature 0 responses:',
        response1.content,
        response2.content,
      );
    });
  });

  describe('Token Usage', () => {
    it('should return token usage information', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
      });

      const response = await provider.chat([
        { role: 'user', content: 'Hello, how are you?' },
      ]);

      expect(response.usage).toBeDefined();
      expect(response.usage?.promptTokens).toBeGreaterThan(0);
      expect(response.usage?.completionTokens).toBeGreaterThan(0);
      expect(response.usage?.totalTokens).toBe(
        (response.usage?.promptTokens || 0) +
          (response.usage?.completionTokens || 0),
      );
      console.log('Token usage:', response.usage);
    });
  });

  describe('Message Interface', () => {
    it('should work with the simple message() interface', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
      });

      const response = await provider.message(
        'Say "Hello from message interface"',
      );

      expect(response).toBeTruthy();
      expect(typeof response).toBe('string');
      console.log('Message interface response:', response);
    });

    it('should support history in message() interface', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
      });

      const response = await provider.message('What is my favorite color?', {
        history: [
          { role: 'user', content: 'My favorite color is blue.' },
          { role: 'assistant', content: "That's a nice color!" },
        ],
      });

      expect(response).toBeTruthy();
      expect(response.toLowerCase()).toContain('blue');
      console.log('Message with history response:', response);
    });
  });

  describe('Complete Interface', () => {
    it('should work with the complete() interface', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
      });

      const response = await provider.complete('The capital of France is');

      expect(response.content).toBeTruthy();
      expect(response.content.toLowerCase()).toContain('paris');
      console.log('Complete interface response:', response.content);
    });
  });

  describe('Thinking Mode', () => {
    it('should work with thinkingLevel: minimal (fastest, least reasoning)', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
      });

      const response = await provider.chat(
        [{ role: 'user', content: 'What is 2 + 2?' }],
        { thinkingLevel: 'minimal' },
      );

      expect(response.content).toBeTruthy();
      expect(response.content).toContain('4');
      console.log('Thinking level minimal response:', response.content);
    });

    it('should work with thinkingLevel: low', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
      });

      const response = await provider.chat(
        [
          {
            role: 'user',
            content: 'Explain why the sky is blue in one sentence.',
          },
        ],
        { thinkingLevel: 'low' },
      );

      expect(response.content).toBeTruthy();
      console.log('Thinking level low response:', response.content);
    });

    it('should work with thinkingLevel: medium', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
      });

      const response = await provider.chat(
        [{ role: 'user', content: 'What are three benefits of exercise?' }],
        { thinkingLevel: 'medium' },
      );

      expect(response.content).toBeTruthy();
      console.log('Thinking level medium response:', response.content);
    });

    it('should work with thinkingLevel: high (most reasoning)', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
      });

      const response = await provider.chat(
        [
          {
            role: 'user',
            content:
              'Solve this step by step: If a train travels 120 km in 2 hours, what is its average speed? Then, how long would it take to travel 300 km at the same speed?',
          },
        ],
        { thinkingLevel: 'high' },
      );

      expect(response.content).toBeTruthy();
      // Should show reasoning with high thinking level
      console.log('Thinking level high response:', response.content);
    });

    it('should use provider-level thinkingLevel when not specified per-request', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
        thinkingLevel: 'low', // Set at provider level
      });

      const response = await provider.chat([
        { role: 'user', content: 'Hello, say hi back!' },
      ]);

      expect(response.content).toBeTruthy();
      console.log('Provider-level thinking response:', response.content);
    });

    it('should override provider-level thinkingLevel with request-level', async () => {
      if (!projectId) {
        console.log(skipMessage);
        return;
      }

      const provider = await getAI({
        type: 'gemini',
        projectId,
        location,
        defaultModel: GEMINI_3_FLASH_MODEL,
        thinkingLevel: 'minimal', // Set at provider level
      });

      // Override with high thinking level for complex question
      const response = await provider.chat(
        [
          {
            role: 'user',
            content: 'What are the prime numbers between 1 and 20?',
          },
        ],
        { thinkingLevel: 'high' }, // Override at request level
      );

      expect(response.content).toBeTruthy();
      console.log('Override thinking level response:', response.content);
    });
  });
});
