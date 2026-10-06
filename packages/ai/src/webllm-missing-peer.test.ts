/**
 * When the optional `@mlc-ai/web-llm` peer is not installed, the webllm
 * provider fails with a typed error and an install hint.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@mlc-ai/web-llm', () => {
  const error = new Error(
    "Cannot find package '@mlc-ai/web-llm' imported from webllm.js",
  ) as Error & { code?: string };
  error.code = 'ERR_MODULE_NOT_FOUND';
  throw error;
});

describe('missing @mlc-ai/web-llm peer', () => {
  it('throws WebLLMPeerMissingError with an install hint', async () => {
    vi.stubGlobal('navigator', { gpu: {} });
    try {
      const { AIError } = await import('./index');
      const { WebLLMProvider, WebLLMPeerMissingError } = await import(
        './local'
      );
      const provider = new WebLLMProvider({ type: 'webllm' });

      const error = await provider
        .chat([{ role: 'user', content: 'hi' }])
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(WebLLMPeerMissingError);
      expect(error).toBeInstanceOf(AIError);
      expect(error).toMatchObject({
        code: 'WEBLLM_PEER_MISSING',
        provider: 'webllm',
      });
      expect((error as Error).message).toContain('pnpm add @mlc-ai/web-llm');
      expect((error as Error).cause).toBeDefined();
      await expect(provider.getModels()).rejects.toBeInstanceOf(
        WebLLMPeerMissingError,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not affect the root entry or other providers', async () => {
    const { getAI } = await import('./index');
    await expect(getAI({ type: 'ollama' })).resolves.toBeDefined();
  });
});
