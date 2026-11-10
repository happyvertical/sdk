/**
 * A bundle that leaves the `openai` SDK out still imports, and the first
 * OpenAI request fails with an error naming the package to install (#1503).
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('openai', () => {
  throw Object.assign(new Error("Cannot find package 'openai'"), {
    code: 'ERR_MODULE_NOT_FOUND',
  });
});

describe('missing openai SDK', () => {
  it('imports the package and constructs the provider', async () => {
    const { getAI, AI_PROVIDER_TYPES } = await import('./index');
    expect(AI_PROVIDER_TYPES).toContain('openai');
    await expect(
      getAI({ type: 'openai', apiKey: 'test-key' }),
    ).resolves.toBeDefined();
  });

  it('fails the first request with an error naming the package', async () => {
    const { getAI, AIError } = await import('./index');
    const ai = await getAI({ type: 'openai', apiKey: 'test-key' });
    const error = await ai.getModels().then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(AIError);
    expect(error).toMatchObject({
      code: 'INITIALIZATION_ERROR',
      provider: 'openai',
    });
    expect((error as Error).message).toContain('pnpm add openai');
  });

  it('names the provider that needed it for OpenAI-compatible gateways', async () => {
    const { getAI } = await import('./index');
    const ai = await getAI({
      type: 'litellm',
      apiKey: 'test-key',
      baseUrl: 'http://127.0.0.1:9/v1',
    });
    await expect(ai.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      /litellm provider needs the openai package/,
    );
  });

  it('fails the legacy getOpenAI helper the same way', async () => {
    const { getOpenAI } = await import('./index');
    await expect(getOpenAI({ apiKey: 'test-key' })).rejects.toMatchObject({
      code: 'INITIALIZATION_ERROR',
    });
  });
});
