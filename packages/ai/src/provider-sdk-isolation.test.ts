/**
 * Importing the package must not load any provider SDK (#1503). The SDKs load
 * only when a provider that needs them is used. The tests run in order: the
 * import cases come before anything that uses a provider.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const sdkLoads = vi.hoisted(() => new Set<string>());

vi.mock('openai', async (importOriginal) => {
  sdkLoads.add('openai');
  return importOriginal();
});
vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  sdkLoads.add('@anthropic-ai/sdk');
  return importOriginal();
});
vi.mock('@google/genai', async (importOriginal) => {
  sdkLoads.add('@google/genai');
  return importOriginal();
});
vi.mock('@aws-sdk/client-bedrock-runtime', async (importOriginal) => {
  sdkLoads.add('@aws-sdk/client-bedrock-runtime');
  return importOriginal();
});

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url?.endsWith('/models')) {
      res.end(
        JSON.stringify({
          object: 'list',
          data: [{ id: 'gpt-4o', object: 'model', owned_by: 'test' }],
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('provider SDK isolation', () => {
  it('loads no provider SDK when the light, root or node entry is imported', async () => {
    const types = await import('./types');
    expect(types.AI_PROVIDER_TYPES).toContain('openai');
    expect(typeof types.AIError).toBe('function');

    const root = await import('./index');
    expect(root.AI_PROVIDER_TYPES).toBe(types.AI_PROVIDER_TYPES);

    const node = await import('./node');
    expect(typeof node.getAI).toBe('function');

    expect([...sdkLoads]).toEqual([]);
  });

  it('constructs OpenAI-compatible providers without loading the SDK', async () => {
    const { getAI } = await import('./index');
    await getAI({ type: 'openai', apiKey: 'test-key', baseUrl });
    await getAI({ type: 'litellm', apiKey: 'test-key', baseUrl });
    expect(sdkLoads.has('openai')).toBe(false);
  });

  it('loads the openai SDK when an OpenAI provider makes its first request', async () => {
    const { getAI } = await import('./index');
    const ai = await getAI({ type: 'openai', apiKey: 'test-key', baseUrl });
    const models = await ai.getModels();
    expect(models.map((model) => model.id)).toEqual(['gpt-4o']);
    expect(sdkLoads.has('openai')).toBe(true);
    expect(sdkLoads.has('@anthropic-ai/sdk')).toBe(false);
    expect(sdkLoads.has('@google/genai')).toBe(false);
  });

  it('loads the anthropic SDK only once an Anthropic provider is created', async () => {
    const { getAI } = await import('./index');
    expect(sdkLoads.has('@anthropic-ai/sdk')).toBe(false);
    await getAI({ type: 'anthropic', apiKey: 'test-key' });
    await vi.waitFor(() =>
      expect(sdkLoads.has('@anthropic-ai/sdk')).toBe(true),
    );
  });
});
