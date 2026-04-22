/**
 * Integration tests for the LiteLLM provider.
 *
 * These tests are designed for the Happy Vertical LiteLLM gateway and are
 * skipped unless a `LITELLM_API_KEY` is available in the environment.
 */

import { describe, expect, it } from 'vitest';
import { getAI } from './index';

const baseUrl =
  process.env.LITELLM_BASE_URL || 'https://llm.happyvertical.com/v1';
const apiKey = process.env.LITELLM_API_KEY;
const configuredModel = process.env.LITELLM_MODEL;

async function getChatModel(client: Awaited<ReturnType<typeof getAI>>) {
  const models = await client.getModels();
  const chatModels = models.filter((model) =>
    model.capabilities.includes('chat'),
  );

  if (configuredModel) {
    const exactMatch = chatModels.find((model) => model.id === configuredModel);
    if (exactMatch) {
      return exactMatch.id;
    }

    const suffixMatches = chatModels.filter((model) =>
      model.id.endsWith(`/${configuredModel}`),
    );
    if (suffixMatches.length > 0) {
      return suffixMatches[0]?.id;
    }
  }

  return chatModels[0]?.id;
}

describe('LiteLLM Integration Tests', () => {
  it.skipIf(!apiKey)(
    'should list models from the configured LiteLLM gateway',
    async () => {
      const client = await getAI({
        type: 'litellm',
        apiKey,
        baseUrl,
      });

      const models = await client.getModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models.some((model) => model.capabilities.includes('chat'))).toBe(
        true,
      );
    },
    30000,
  );

  it.skipIf(!apiKey)(
    'should complete a basic chat request against llm.happyvertical.com',
    async () => {
      const client = await getAI({
        type: 'litellm',
        apiKey,
        baseUrl,
      });

      const model = await getChatModel(client);
      expect(model).toBeTruthy();

      const response = await client.chat(
        [
          {
            role: 'user',
            content: 'Reply with exactly: Hello from LiteLLM',
          },
        ],
        {
          model,
          temperature: 0,
        },
      );

      expect(response.content).toBeTruthy();
      expect(response.model).toBeTruthy();
    },
    30000,
  );
});
