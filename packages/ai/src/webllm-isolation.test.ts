/**
 * The root entry must never load `@mlc-ai/web-llm`; the peer loads only on the
 * first webllm request. This file deliberately never makes a webllm request
 * before asserting the root-entry cases.
 */

import { describe, expect, it, vi } from 'vitest';

const peerLoads = vi.hoisted(() => ({ count: 0 }));

vi.mock('@mlc-ai/web-llm', () => {
  peerLoads.count++;
  return {
    CreateMLCEngine: vi.fn(async () => ({
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          })),
        },
      },
      interruptGenerate: vi.fn(),
    })),
    prebuiltAppConfig: { model_list: [] },
  };
});

describe('root entry isolation', () => {
  it('never loads the peer for the root entry or other providers', async () => {
    const root = await import('./index');
    expect(typeof root.getAI).toBe('function');
    expect(root.AI_PROVIDER_TYPES).toContain('webllm');

    await root.getAI({ type: 'openai', apiKey: 'test-key' });
    await root.getAI({ type: 'ollama' });
    expect(peerLoads.count).toBe(0);
  });

  it('constructs the webllm provider without loading the peer', async () => {
    const { getAI } = await import('./index');
    const ai = await getAI({ type: 'webllm' });
    expect(await ai.getCapabilities()).toMatchObject({ embeddings: false });
    expect(peerLoads.count).toBe(0);
  });

  it('exposes the same provider from the local entry and loads the peer on first use', async () => {
    const local = await import('./local');
    expect(peerLoads.count).toBe(0);

    vi.stubGlobal('navigator', { gpu: {} });
    try {
      const provider = new local.WebLLMProvider({ type: 'webllm' });
      expect(await provider.message('hi')).toBe('ok');
      expect(peerLoads.count).toBe(1);
    } finally {
      await local.disposeWebLLMEngines();
      vi.unstubAllGlobals();
    }
  });
});
