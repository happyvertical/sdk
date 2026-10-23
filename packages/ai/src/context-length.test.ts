import { afterEach, describe, expect, it, vi } from 'vitest';
import { BifrostProvider } from './shared/providers/bifrost';
import { OpenAIProvider } from './shared/providers/openai';
import { ContextLengthError } from './shared/types';

afterEach(() => vi.unstubAllGlobals());

describe.each([
  ['openai', () => new OpenAIProvider({ apiKey: 'fixture', maxRetries: 0 })],
  [
    'bifrost',
    () =>
      new BifrostProvider({
        apiKey: 'fixture',
        baseUrl: 'http://fixture.invalid',
        defaultModel: 'openai/gpt-4o',
        maxRetries: 0,
      }),
  ],
] as const)('%s context length classification', (name, makeProvider) => {
  it.each([
    [400, { code: 'context_length_exceeded', message: 'Prompt too long' }],
    [
      400,
      {
        message:
          'Input tokens exceed the configured limit of 272000 tokens. Please reduce the number of tokens.',
      },
    ],
    [
      400,
      {
        message:
          "This model's maximum context length is 8192 tokens. However, you requested 9000 tokens.",
      },
    ],
    [400, { message: 'Your input exceeds the context window of this model.' }],
    [413, { message: 'Request too large' }],
  ])('maps overflow %s %j through public chat', async (status, error) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(
      makeProvider().chat([{ role: 'user', content: 'hello' }]),
    ).rejects.toMatchObject({
      name: ContextLengthError.name,
      provider: name,
    });
  });

  it.each([
    [400, { message: 'Invalid model parameter' }, 'API_ERROR'],
    [
      400,
      { code: null, message: 'Input tokens must be positive' },
      'API_ERROR',
    ],
    [
      400,
      { code: 123, message: 'Output tokens exceed the configured limit' },
      'API_ERROR',
    ],
    [
      400,
      { code: 'unknown', message: 'content_filter rejected the request' },
      'CONTENT_FILTERED',
    ],
    [
      401,
      { message: 'Input tokens exceed the configured limit of 272000 tokens' },
      'AUTH_ERROR',
    ],
    [
      429,
      { message: 'Input tokens exceed the configured limit of 272000 tokens' },
      'RATE_LIMIT',
    ],
    [404, { message: 'Model missing' }, 'MODEL_NOT_FOUND'],
    [
      500,
      { message: 'Input tokens exceed the configured limit of 272000 tokens' },
      'API_ERROR',
    ],
  ])('preserves non-overflow %s %j', async (status, error, code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    await expect(
      makeProvider().chat([{ role: 'user', content: 'hello' }]),
    ).rejects.toMatchObject({ code, provider: name });
  });
});
