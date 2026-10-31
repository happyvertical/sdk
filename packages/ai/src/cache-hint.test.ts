import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from './shared/providers/anthropic';
import { BifrostProvider } from './shared/providers/bifrost';
import { OpenAIProvider } from './shared/providers/openai';
import type { AIMessage } from './shared/types';

const anthropicReply = {
  content: [{ type: 'text', text: 'ok' }],
  model: 'claude-opus-5-5',
  stop_reason: 'end_turn',
  usage: { input_tokens: 1, output_tokens: 1 },
};

const openAIReply = {
  model: 'anthropic/claude-opus-5-5',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'ok' },
      finish_reason: 'stop',
    },
  ],
};

function anthropic() {
  const create = vi.fn().mockResolvedValue(anthropicReply);
  const provider = new AnthropicProvider({
    type: 'anthropic',
    apiKey: 'test-key',
  });
  (provider as any).client = { messages: { create } };
  return { provider, create };
}

function gateway<T extends OpenAIProvider>(provider: T) {
  const create = vi.fn().mockResolvedValue(openAIReply);
  (provider as any).client = { chat: { completions: { create } } };
  return { provider, create };
}

const bifrost = () =>
  gateway(
    new BifrostProvider({
      type: 'bifrost',
      apiKey: 'test-key',
      baseUrl: 'http://localhost:8080/openai',
    }),
  );

describe('prompt-cache hint: Anthropic', () => {
  it('sends plain strings when no hint is set (unchanged wire shape)', async () => {
    const { provider, create } = anthropic();
    await provider.chat([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'Hi' },
    ]);
    const body = create.mock.calls[0][0];
    expect(body.system).toBe('Be brief.');
    expect(body.messages).toEqual([{ role: 'user', content: 'Hi' }]);
  });

  it('forwards a system-message hint as cache_control on a system block', async () => {
    const { provider, create } = anthropic();
    await provider.chat([
      { role: 'system', content: 'Long rubric', cacheHint: true },
      { role: 'user', content: 'Hi' },
    ]);
    const body = create.mock.calls[0][0];
    expect(body.system).toEqual([
      {
        type: 'text',
        text: 'Long rubric',
        cache_control: { type: 'ephemeral' },
      },
    ]);
  });

  it('forwards ttl and part-level hints on user content', async () => {
    const { provider, create } = anthropic();
    const messages: AIMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Document', cacheHint: { ttl: '1h' } },
          { type: 'text', text: 'Question' },
        ],
      },
    ];
    await provider.chat(messages);
    expect(create.mock.calls[0][0].messages[0].content).toEqual([
      {
        type: 'text',
        text: 'Document',
        cache_control: { type: 'ephemeral', ttl: '1h' },
      },
      { type: 'text', text: 'Question' },
    ]);
  });

  it('puts a message-level hint on the last text part', async () => {
    const { provider, create } = anthropic();
    await provider.chat([
      {
        role: 'user',
        cacheHint: true,
        content: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
      },
    ]);
    const content = create.mock.calls[0][0].messages[0].content;
    expect(content[0].cache_control).toBeUndefined();
    expect(content[1].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('appends the JSON instruction after cached system blocks', async () => {
    const { provider, create } = anthropic();
    await provider.chat(
      [
        { role: 'system', content: 'Rubric', cacheHint: true },
        { role: 'user', content: 'Hi' },
      ],
      { responseFormat: { type: 'json_object' } },
    );
    const system = create.mock.calls[0][0].system;
    expect(system).toHaveLength(2);
    expect(system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(system[1].cache_control).toBeUndefined();
  });

  it('never marks empty text', async () => {
    const { provider, create } = anthropic();
    await provider.chat([
      { role: 'user', content: '', cacheHint: true },
      { role: 'user', content: 'Hi' },
    ]);
    expect(JSON.stringify(create.mock.calls[0][0])).not.toContain(
      'cache_control',
    );
  });
});

describe('prompt-cache hint: Bifrost', () => {
  it('turns hinted string content into cache_control text blocks', async () => {
    const { provider, create } = bifrost();
    await provider.chat(
      [
        { role: 'system', content: 'Rubric', cacheHint: true },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Doc', cacheHint: { ttl: '5m' } },
            { type: 'text', text: 'Q' },
          ],
        },
        { role: 'user', content: 'plain' },
      ],
      { model: 'anthropic/claude-opus-5-5' },
    );
    const messages = create.mock.calls[0][0].messages;
    expect(messages[0].content).toEqual([
      { type: 'text', text: 'Rubric', cache_control: { type: 'ephemeral' } },
    ]);
    expect(messages[1].content[0]).toEqual({
      type: 'text',
      text: 'Doc',
      cache_control: { type: 'ephemeral', ttl: '5m' },
    });
    expect(messages[1].content[1]).toEqual({ type: 'text', text: 'Q' });
    expect(messages[2].content).toBe('plain');
  });

  it('is ignored by the hosted OpenAI provider', async () => {
    const { provider, create } = gateway(
      new OpenAIProvider({ apiKey: 'test-key' }),
    );
    await provider.chat([
      { role: 'system', content: 'Rubric', cacheHint: true },
      {
        role: 'user',
        content: [{ type: 'text', text: 'x', cacheHint: true }],
      },
    ]);
    expect(JSON.stringify(create.mock.calls[0][0])).not.toContain(
      'cache_control',
    );
  });
});
