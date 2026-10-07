import { afterEach, expect, expectTypeOf, it, vi } from 'vitest';
import type {
  AIResponseFormat,
  AITextCompletionOptions,
  ChatOptions,
  MessageOptions,
  OpenAITextCompletionOptions,
} from './index';
import { OpenAIClient } from './shared/client';
import type { AIMessageOptions } from './shared/message';
import { OpenAIProvider } from './shared/providers/openai';

const format = {
  type: 'json_schema',
  json_schema: {
    name: 'evaluation',
    description: 'A typed result',
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean' } },
      required: ['ok'],
      additionalProperties: false,
    },
    strict: true,
  },
} satisfies AIResponseFormat;

afterEach(() => vi.restoreAllMocks());

it('exports one response format contract across current and legacy options', () => {
  expectTypeOf<ChatOptions['responseFormat']>().toEqualTypeOf<
    AIResponseFormat | undefined
  >();
  expectTypeOf<MessageOptions['responseFormat']>().toEqualTypeOf<
    AIResponseFormat | undefined
  >();
  expectTypeOf<AITextCompletionOptions['responseFormat']>().toEqualTypeOf<
    AIResponseFormat | undefined
  >();
  expectTypeOf<OpenAITextCompletionOptions['responseFormat']>().toEqualTypeOf<
    AIResponseFormat | undefined
  >();
  expectTypeOf<AIMessageOptions['responseFormat']>().toEqualTypeOf<
    AIResponseFormat | undefined
  >();
  // @ts-expect-error JSON schema requires schema metadata.
  const invalid: AIResponseFormat = { type: 'json_schema' };
  expect(invalid.type).toBe('json_schema');
});

it.each([
  'provider',
  'legacy',
] as const)('serializes the complete JSON schema format through the %s OpenAI API', async (implementation) => {
  const fetch = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (_url, init) => {
      expect(JSON.parse(String(init?.body)).response_format).toEqual(format);
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: '{"ok":true}' }, finish_reason: 'stop' },
          ],
          model: 'gpt-4o',
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    });
  if (implementation === 'provider') {
    const provider = new OpenAIProvider({
      apiKey: 'test-key',
      defaultModel: 'gpt-4o',
    });
    expect(
      (
        await provider.chat([{ role: 'user', content: 'evaluate' }], {
          responseFormat: format,
        })
      ).content,
    ).toBe('{"ok":true}');
  } else {
    const client = await OpenAIClient.create({ apiKey: 'test-key' });
    expect(
      await client.textCompletion('evaluate', { responseFormat: format }),
    ).toBe('{"ok":true}');
  }
  expect(fetch).toHaveBeenCalledOnce();
});
