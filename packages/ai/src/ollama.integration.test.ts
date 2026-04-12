/**
 * Integration tests for the Ollama provider.
 *
 * These tests are opt-in and run against either a local Ollama host or a
 * remote host configured via environment variables.
 */

import { describe, expect, it } from 'vitest';
import { getAI } from './index';

const isCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
const shouldRun =
  !isCI &&
  Boolean(
    process.env.OLLAMA_INTEGRATION ||
      process.env.OLLAMA_BASE_URL ||
      process.env.OLLAMA_HOST ||
      process.env.OLLAMA_API_KEY,
  );

const baseUrl =
  process.env.OLLAMA_BASE_URL ||
  process.env.OLLAMA_HOST ||
  (process.env.OLLAMA_API_KEY
    ? 'https://ollama.com/api'
    : 'http://localhost:11434');
const apiKey = process.env.OLLAMA_API_KEY;
const configuredModel = process.env.OLLAMA_MODEL;
const configuredVisionModel = process.env.OLLAMA_VISION_MODEL;
const configuredEmbeddingModel = process.env.OLLAMA_EMBED_MODEL;
const RED_SQUARE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAF0lEQVR4nGP4z8BAEiJN9aiGUQ1DSgMAkPn/Afnh+ngAAAAASUVORK5CYII=';

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

  return chatModels
    .slice()
    .sort((left, right) => scoreChatModel(right) - scoreChatModel(left))[0]?.id;
}

async function getVisionModel(client: Awaited<ReturnType<typeof getAI>>) {
  const models = await client.getModels();
  const visionModels = models.filter(
    (model) =>
      model.capabilities.includes('vision') || model.supportsVision === true,
  );

  if (configuredVisionModel) {
    const exactMatch = visionModels.find(
      (model) => model.id === configuredVisionModel,
    );
    if (exactMatch) {
      return exactMatch.id;
    }

    const suffixMatches = visionModels.filter((model) =>
      model.id.endsWith(`/${configuredVisionModel}`),
    );
    if (suffixMatches.length > 0) {
      return suffixMatches[0]?.id;
    }
  }

  return visionModels
    .slice()
    .sort((left, right) => scoreVisionModel(right) - scoreVisionModel(left))[0]
    ?.id;
}

async function getEmbeddingModel(client: Awaited<ReturnType<typeof getAI>>) {
  const models = await client.getModels();
  const embeddingModels = models.filter((model) =>
    model.capabilities.includes('embeddings'),
  );

  if (configuredEmbeddingModel) {
    const exactMatch = embeddingModels.find(
      (model) => model.id === configuredEmbeddingModel,
    );
    if (exactMatch) {
      return exactMatch.id;
    }

    const suffixMatches = embeddingModels.filter((model) =>
      model.id.endsWith(`/${configuredEmbeddingModel}`),
    );
    if (suffixMatches.length > 0) {
      return suffixMatches[0]?.id;
    }
  }

  return embeddingModels
    .slice()
    .sort(
      (left, right) => scoreEmbeddingModel(right) - scoreEmbeddingModel(left),
    )[0]?.id;
}

function scoreChatModel(model: { id: string; supportsFunctions?: boolean }) {
  const id = model.id.toLowerCase();
  let score = 0;

  if (id.includes(':latest')) score += 6;
  if (id.includes('instruct') || id.includes('-it')) score += 6;
  if (model.supportsFunctions) score += 4;
  if (/llama|mistral|qwen|gemma|phi|command-r|deepseek-coder/.test(id)) {
    score += 8;
  }
  if (id.startsWith('hf.co/')) score -= 8;
  if (/ocr|embed|image|diffusion|flux/.test(id)) score -= 12;
  if (/gpt-oss/.test(id)) score -= 3;

  return score;
}

function scoreVisionModel(model: { id: string; supportsFunctions?: boolean }) {
  const id = model.id.toLowerCase();
  let score = 0;

  if (id.includes(':latest')) score += 4;
  if (id.includes('instruct') || id.includes('-it')) score += 4;
  if (/gemma4|gemma3/.test(id)) score += 14;
  if (/qwen.*vl|llava|moondream|vision/.test(id)) score += 8;
  if (/ocr/.test(id)) score -= 10;
  if (model.supportsFunctions) score += 2;

  return score;
}

function scoreEmbeddingModel(model: { id: string }) {
  const id = model.id.toLowerCase();
  let score = 0;

  if (id.includes(':latest')) score += 4;
  if (/nomic|mxbai|embed/.test(id)) score += 12;
  if (id.startsWith('hf.co/')) score -= 6;

  return score;
}

describe('Ollama Integration Tests', () => {
  it.skipIf(!shouldRun)(
    'should list models from the configured Ollama host',
    async () => {
      const client = await getAI({
        type: 'ollama',
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

  it.skipIf(!shouldRun)(
    'should complete a basic chat request against Ollama',
    async () => {
      const client = await getAI({
        type: 'ollama',
        apiKey,
        baseUrl,
      });

      const model = await getChatModel(client);
      expect(model).toBeTruthy();

      const response = await client.chat(
        [
          {
            role: 'user',
            content: 'Reply with exactly: Hello from Ollama',
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

  it.skipIf(!shouldRun)(
    'should describe a simple image with a vision-capable Ollama model',
    async () => {
      const client = await getAI({
        type: 'ollama',
        apiKey,
        baseUrl,
      });

      const model = await getVisionModel(client);
      if (!model) {
        console.warn(
          'Skipping vision test: no vision-capable Ollama model found',
        );
        return;
      }

      const description = await client.describeImage(
        Buffer.from(RED_SQUARE_PNG_BASE64, 'base64'),
        'Reply with the single lowercase word for the dominant color in this image.',
        {
          model,
          maxTokens: 32,
        },
      );

      expect(description.toLowerCase()).toContain('red');
    },
    45000,
  );

  it.skipIf(!shouldRun)(
    'should generate text embeddings when an embedding model is available',
    async () => {
      const client = await getAI({
        type: 'ollama',
        apiKey,
        baseUrl,
      });

      const model = await getEmbeddingModel(client);
      if (!model) {
        console.warn(
          'Skipping embedding test: no embedding-capable Ollama model found',
        );
        return;
      }

      const response = await client.embed('Hello from Ollama embeddings', {
        model,
      });

      expect(response.embeddings.length).toBe(1);
      expect(response.embeddings[0]?.length).toBeGreaterThan(0);
      expect(response.model).toBeTruthy();
    },
    30000,
  );
});
