/**
 * Two-step tool round trips per provider message mapper.
 *
 * Step 1: the model answers with a tool call. The caller replays the
 * assistant message (`tool_calls: response.toolCalls`) plus one
 * `role: 'tool'` result carrying `tool_call_id`, then makes step 2. These
 * tests assert what each provider puts on the wire for step 2.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from './shared/providers/anthropic';
import { BedrockProvider } from './shared/providers/bedrock';
import { BifrostProvider } from './shared/providers/bifrost';
import { GeminiProvider } from './shared/providers/gemini';
import { LiteLLMProvider } from './shared/providers/litellm';
import { OllamaProvider } from './shared/providers/ollama';
import { OpenAIProvider } from './shared/providers/openai';
import type { AIMessage, AIResponse, ChatOptions } from './shared/types';

const tools: ChatOptions['tools'] = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get weather',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
      },
    },
  },
];

const question: AIMessage[] = [
  { role: 'system', content: 'You are a weather bot.' },
  { role: 'user', content: 'Weather in Tokyo?' },
];

/** Append the step-1 tool call and its result, as a tool loop would. */
function continueWithToolResult(
  first: AIResponse,
  result = '{"tempC":21}',
): AIMessage[] {
  const toolCall = first.toolCalls?.[0];
  expect(toolCall).toBeDefined();
  return [
    ...question,
    {
      role: 'assistant',
      content: first.content,
      tool_calls: first.toolCalls,
    },
    { role: 'tool', tool_call_id: toolCall!.id, content: result },
  ];
}

function openAIToolCallResponse() {
  return {
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call_abc',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
    model: 'gpt-4.1-mini',
  };
}

function openAITextResponse() {
  return {
    choices: [{ message: { content: 'It is 21C.' }, finish_reason: 'stop' }],
    model: 'gpt-4.1-mini',
  };
}

const expectedOpenAIHistory = [
  { role: 'system', content: 'You are a weather bot.' },
  { role: 'user', content: 'Weather in Tokyo?' },
  {
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        id: 'call_abc',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' },
      },
    ],
  },
  { role: 'tool', content: '{"tempC":21}', tool_call_id: 'call_abc' },
];

describe.each([
  ['OpenAI', () => new OpenAIProvider({ apiKey: 'test-key' })],
  [
    'Bifrost',
    () =>
      new BifrostProvider({
        type: 'bifrost',
        apiKey: 'test-key',
        baseUrl: 'http://localhost:8080/openai',
      }),
  ],
  [
    'LiteLLM',
    () =>
      new LiteLLMProvider({
        type: 'litellm',
        apiKey: 'test-key',
        baseUrl: 'http://localhost:4000',
      }),
  ],
])('%s tool round trip', (_name, createProvider) => {
  it('forwards tool_call_id on tool results in the second call', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIToolCallResponse())
      .mockResolvedValueOnce(openAITextResponse());
    const provider = createProvider();
    (provider as any).client = { chat: { completions: { create } } };

    const first = await provider.chat(question, {
      model: 'gpt-4.1-mini',
      tools,
    });
    expect(first.finishReason).toBe('tool_calls');

    const second = await provider.chat(continueWithToolResult(first), {
      model: 'gpt-4.1-mini',
      tools,
    });

    expect(second.content).toBe('It is 21C.');
    expect(create.mock.calls[1][0].messages).toEqual(expectedOpenAIHistory);
  });

  it('forwards tool_call_id when streaming the second call', async () => {
    const create = vi.fn().mockResolvedValue(
      (async function* () {
        yield { choices: [{ delta: { content: 'ok' } }] };
      })(),
    );
    const provider = createProvider();
    (provider as any).client = { chat: { completions: { create } } };

    const first: AIResponse = {
      content: '',
      toolCalls: openAIToolCallResponse().choices[0].message.tool_calls as any,
    };
    for await (const _chunk of provider.stream(continueWithToolResult(first), {
      model: 'gpt-4.1-mini',
    })) {
      // drain
    }

    expect(create.mock.calls[0][0].messages).toEqual(expectedOpenAIHistory);
  });

  it('sends no tool_choice on a round without tools', async () => {
    const create = vi.fn().mockResolvedValue(openAITextResponse());
    const provider = createProvider();
    (provider as any).client = { chat: { completions: { create } } };

    await provider.chat(question, {
      model: 'gpt-4.1-mini',
      toolChoice: 'none',
    });
    await provider.chat(question, {
      model: 'gpt-4.1-mini',
      tools,
      toolChoice: 'none',
    });

    expect(create.mock.calls[0][0].tool_choice).toBeUndefined();
    expect(create.mock.calls[1][0].tool_choice).toBe('none');
  });

  it('does not send provider-only tool call fields', async () => {
    const create = vi.fn().mockResolvedValue(openAITextResponse());
    const provider = createProvider();
    (provider as any).client = { chat: { completions: { create } } };

    await provider.chat(
      continueWithToolResult({
        content: '',
        toolCalls: [
          {
            id: 'call_gemini',
            type: 'function',
            function: { name: 'get_weather', arguments: '{}' },
            thoughtSignature: 'sig-from-gemini',
          },
        ],
      }),
      { model: 'gpt-4.1-mini' },
    );

    const assistant = create.mock.calls[0][0].messages[2];
    expect(assistant.tool_calls[0]).not.toHaveProperty('thoughtSignature');
  });
});

describe('Anthropic tool round trip', () => {
  function createProvider(create: ReturnType<typeof vi.fn>) {
    const provider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test-key',
    });
    (provider as any).client = { messages: { create } };
    return provider;
  }

  it('replays tool_use and pairs tool_result by tool_use_id', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'Checking.' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'get_weather',
            input: { city: 'Tokyo' },
          },
        ],
        model: 'claude-sonnet-4-5',
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'It is 21C.' }],
        model: 'claude-sonnet-4-5',
        stop_reason: 'end_turn',
        usage: { input_tokens: 20, output_tokens: 5 },
      });
    const provider = createProvider(create);

    const first = await provider.chat(question, { tools });
    expect(first.toolCalls?.[0]?.id).toBe('toolu_1');

    const second = await provider.chat(continueWithToolResult(first), {
      tools,
    });

    expect(second.content).toBe('It is 21C.');
    const request = create.mock.calls[1][0];
    expect(request.system).toBe('You are a weather bot.');
    expect(request.messages).toEqual([
      { role: 'user', content: 'Weather in Tokyo?' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Checking.' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'get_weather',
            input: { city: 'Tokyo' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: '{"tempC":21}',
          },
        ],
      },
    ]);
  });

  it('groups parallel tool results into one user turn', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'done' }],
      model: 'claude-sonnet-4-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = createProvider(create);

    await provider.chat(
      [
        { role: 'user', content: 'Tokyo and Paris?' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'toolu_a',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' },
            },
            {
              id: 'toolu_b',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'toolu_a', content: '21' },
        { role: 'tool', tool_call_id: 'toolu_b', content: '18' },
      ],
      { tools },
    );

    const messages = create.mock.calls[0][0].messages;
    expect(messages).toHaveLength(3);
    expect(messages[1].content).toHaveLength(2);
    expect(messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_a', content: '21' },
        { type: 'tool_result', tool_use_id: 'toolu_b', content: '18' },
      ],
    });
  });

  it('declares tools when streaming a tool conversation', async () => {
    const create = vi.fn().mockResolvedValue(
      (async function* () {
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'ok' },
        };
      })(),
    );
    const provider = createProvider(create);

    for await (const _chunk of provider.stream(
      continueWithToolResult({
        content: '',
        toolCalls: [
          {
            id: 'toolu_1',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' },
          },
        ],
      }),
      { tools },
    )) {
      // drain
    }

    const request = create.mock.calls[0][0];
    expect(request.tools).toHaveLength(1);
    expect(request.messages[2].content[0]).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      content: '{"tempC":21}',
    });
  });

  it('keeps legacy tool results without tool_call_id as plain text', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'done' }],
      model: 'claude-sonnet-4-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = createProvider(create);

    await provider.chat([
      { role: 'user', content: 'Weather?' },
      {
        role: 'assistant',
        content: 'Checking.',
        tool_calls: [
          {
            id: 'toolu_1',
            type: 'function',
            function: { name: 'get_weather', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', content: '21' },
    ]);

    expect(create.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'Weather?' },
      { role: 'assistant', content: 'Checking.' },
      { role: 'user', content: '21' },
    ]);
    expect(create.mock.calls[0][0].tools).toBeUndefined();
    expect(create.mock.calls[0][0].tool_choice).toBeUndefined();
  });

  const toolCallResponse: AIResponse = {
    content: '',
    toolCalls: [
      {
        id: 'toolu_1',
        type: 'function',
        function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' },
      },
    ],
  };

  it('declares history tools with tool_choice none on a final round without tools', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'It is 21C.' }],
      model: 'claude-sonnet-4-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = createProvider(create);

    const response = await provider.chat(
      continueWithToolResult(toolCallResponse),
      { toolChoice: 'none' },
    );

    expect(response.content).toBe('It is 21C.');
    const request = create.mock.calls[0][0];
    expect(request.tools).toEqual([
      {
        name: 'get_weather',
        description:
          'Used earlier in this conversation; not available for this turn.',
        input_schema: { type: 'object' },
      },
    ]);
    expect(request.tool_choice).toEqual({ type: 'none' });
    expect(request.messages[1].content[0].type).toBe('tool_use');
    expect(request.messages[2].content[0].type).toBe('tool_result');
  });

  it('declares history tools when streaming a final round without tools', async () => {
    const create = vi.fn().mockResolvedValue(
      (async function* () {
        yield {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'ok' },
        };
      })(),
    );
    const provider = createProvider(create);

    for await (const _chunk of provider.stream(
      continueWithToolResult(toolCallResponse),
    )) {
      // drain
    }

    const request = create.mock.calls[0][0];
    expect(request.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'get_weather',
    ]);
    expect(request.tool_choice).toEqual({ type: 'none' });
  });

  it('maps toolChoice none to tool_choice none when tools are declared', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      model: 'claude-sonnet-4-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const provider = createProvider(create);

    await provider.chat(question, { tools, toolChoice: 'none' });
    await provider.chat(question, { tools });
    await provider.chat(question, { toolChoice: 'none' });

    expect(create.mock.calls[0][0].tools).toHaveLength(1);
    expect(create.mock.calls[0][0].tool_choice).toEqual({ type: 'none' });
    expect(create.mock.calls[1][0].tool_choice).toEqual({ type: 'auto' });
    expect(create.mock.calls[2][0].tools).toBeUndefined();
    expect(create.mock.calls[2][0].tool_choice).toBeUndefined();
  });
});

describe('Bedrock tool round trip', () => {
  it('pairs toolResult with toolUse by toolUseId', async () => {
    const converse = vi
      .fn()
      .mockResolvedValueOnce({
        output: {
          message: {
            content: [
              {
                toolUse: {
                  toolUseId: 'tooluse_1',
                  name: 'get_weather',
                  input: { city: 'Tokyo' },
                },
              },
            ],
          },
        },
        stopReason: 'tool_use',
      })
      .mockResolvedValueOnce({
        output: { message: { content: [{ text: 'It is 21C.' }] } },
        stopReason: 'end_turn',
      });
    const provider = new BedrockProvider({
      type: 'bedrock',
      region: 'us-east-1',
    });
    (provider as any).client = { converse };

    const first = await provider.chat(question, { tools });
    const second = await provider.chat(continueWithToolResult(first), {
      tools,
    });

    expect(second.content).toBe('It is 21C.');
    const request = converse.mock.calls[1][0];
    expect(request.system).toEqual([{ text: 'You are a weather bot.' }]);
    expect(request.messages).toEqual([
      { role: 'user', content: [{ text: 'Weather in Tokyo?' }] },
      {
        role: 'assistant',
        content: [
          {
            toolUse: {
              toolUseId: 'tooluse_1',
              name: 'get_weather',
              input: { city: 'Tokyo' },
            },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            toolResult: {
              toolUseId: 'tooluse_1',
              content: [{ text: '{"tempC":21}' }],
            },
          },
        ],
      },
    ]);
  });
});

describe('Gemini tool round trip', () => {
  it('sends structured functionCall/functionResponse turns', async () => {
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce({
        text: '',
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: 'get_weather',
                    args: { city: 'Tokyo' },
                  },
                  thoughtSignature: 'sig-1',
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        text: 'It is 21C.',
        candidates: [{ content: { parts: [{ text: 'It is 21C.' }] } }],
      });
    const provider = new GeminiProvider({ type: 'gemini', apiKey: 'test-key' });
    (provider as any).client = { models: { generateContent } };

    const first = await provider.chat(question, { tools });
    expect(first.toolCalls?.[0]?.thoughtSignature).toBe('sig-1');

    // Result name is omitted on purpose: it is resolved from tool_call_id.
    const second = await provider.chat(continueWithToolResult(first), {
      tools,
    });

    expect(second.content).toBe('It is 21C.');
    const request = generateContent.mock.calls[1][0];
    expect(request.config.systemInstruction).toBe('You are a weather bot.');
    expect(request.contents).toEqual([
      { role: 'user', parts: [{ text: 'Weather in Tokyo?' }] },
      {
        role: 'model',
        parts: [
          {
            functionCall: { name: 'get_weather', args: { city: 'Tokyo' } },
            thoughtSignature: 'sig-1',
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'get_weather',
              response: { tempC: 21 },
            },
          },
        ],
      },
    ]);
  });

  it('wraps non-object tool results', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: 'ok',
      candidates: [{ content: { parts: [{ text: 'ok' }] } }],
    });
    const provider = new GeminiProvider({ type: 'gemini', apiKey: 'test-key' });
    (provider as any).client = { models: { generateContent } };

    await provider.chat(
      continueWithToolResult(
        {
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'get_weather', arguments: '{}' },
            },
          ],
        },
        'sunny',
      ),
    );

    const lastTurn = generateContent.mock.calls[0][0].contents.at(-1);
    expect(lastTurn.parts[0].functionResponse).toEqual({
      name: 'get_weather',
      response: { result: 'sunny' },
    });
  });

  it('keeps the flattened prompt for conversations without tools', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: 'hi',
      candidates: [{ content: { parts: [{ text: 'hi' }] } }],
    });
    const provider = new GeminiProvider({ type: 'gemini', apiKey: 'test-key' });
    (provider as any).client = { models: { generateContent } };

    await provider.chat(question);

    const request = generateContent.mock.calls[0][0];
    expect(typeof request.contents).toBe('string');
    expect(request.config).not.toHaveProperty('systemInstruction');
  });
});

describe('Ollama tool round trip', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('resolves tool_name from tool_call_id in the second call', async () => {
    const bodies: any[] = [];
    global.fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body || '{}')));
        const body =
          bodies.length === 1
            ? {
                model: 'qwen3',
                message: {
                  content: '',
                  tool_calls: [
                    {
                      type: 'function',
                      function: {
                        name: 'get_weather',
                        arguments: { city: 'Tokyo' },
                      },
                    },
                  ],
                },
                done: true,
                done_reason: 'stop',
              }
            : {
                model: 'qwen3',
                message: { content: 'It is 21C.' },
                done: true,
                done_reason: 'stop',
              };
        return new Response(JSON.stringify(body), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    ) as any;

    const provider = new OllamaProvider({ type: 'ollama' });
    const first = await provider.chat(question, { model: 'qwen3', tools });
    const second = await provider.chat(continueWithToolResult(first), {
      model: 'qwen3',
      tools,
    });

    expect(second.content).toBe('It is 21C.');
    expect(bodies[1].messages.slice(2)).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            type: 'function',
            function: {
              index: 0,
              name: 'get_weather',
              arguments: { city: 'Tokyo' },
            },
          },
        ],
      },
      { role: 'tool', content: '{"tempC":21}', tool_name: 'get_weather' },
    ]);
  });
});

describe('Anthropic extended thinking tool loop', () => {
  function createProvider(create: ReturnType<typeof vi.fn>) {
    const provider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test-key',
    });
    (provider as any).client = { messages: { create } };
    return provider;
  }

  it('replays thinking blocks with signatures before tool_use', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [
          { type: 'thinking', thinking: 'Need weather.', signature: 'sig-a' },
          { type: 'redacted_thinking', data: 'opaque' },
          { type: 'text', text: 'Checking.' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'get_weather',
            input: { city: 'Tokyo' },
          },
        ],
        model: 'claude-sonnet-4-5',
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'It is 21C.' }],
        model: 'claude-sonnet-4-5',
        stop_reason: 'end_turn',
        usage: { input_tokens: 20, output_tokens: 5 },
      });
    const provider = createProvider(create);
    const reasoning = { maxTokens: 1024 };

    const first = await provider.chat(question, { tools, reasoning });
    expect(first.content).toBe('Checking.');

    await provider.chat(continueWithToolResult(first), { tools, reasoning });

    const request = create.mock.calls[1][0];
    expect(request.thinking).toEqual({ type: 'enabled', budget_tokens: 1024 });
    expect(request.messages[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Need weather.', signature: 'sig-a' },
        { type: 'redacted_thinking', data: 'opaque' },
        { type: 'text', text: 'Checking.' },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'get_weather',
          input: { city: 'Tokyo' },
        },
      ],
    });
  });

  it('does not send thinking blocks to OpenAI-compatible providers', async () => {
    const create = vi.fn().mockResolvedValue(openAITextResponse());
    const provider = new OpenAIProvider({ apiKey: 'test-key' });
    (provider as any).client = { chat: { completions: { create } } };

    await provider.chat(
      continueWithToolResult({
        content: '',
        toolCalls: [
          {
            id: 'toolu_1',
            type: 'function',
            function: { name: 'get_weather', arguments: '{}' },
            thinkingBlocks: [
              { type: 'thinking', thinking: 'hm', signature: 'sig' },
            ],
          },
        ],
      }),
      { model: 'gpt-4.1-mini' },
    );

    const assistant = create.mock.calls[0][0].messages[2];
    expect(assistant.tool_calls[0]).not.toHaveProperty('thinkingBlocks');
  });

  it('disables thinking when the replayed tool_use turn has no thinking block', async () => {
    const text = {
      content: [{ type: 'text', text: 'It is 21C.' }],
      model: 'claude-sonnet-4-5',
      stop_reason: 'end_turn',
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const create = vi
      .fn()
      .mockResolvedValueOnce(text)
      .mockResolvedValueOnce(
        (async function* () {
          yield {
            type: 'content_block_delta',
            delta: { type: 'text_delta', text: 'ok' },
          };
        })(),
      )
      .mockResolvedValueOnce(text);
    const provider = createProvider(create);
    const withoutThinking = continueWithToolResult({
      content: '',
      toolCalls: [
        {
          id: 'toolu_1',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' },
        },
      ],
    });

    await provider.chat(withoutThinking, {
      tools,
      reasoning: { maxTokens: 1024 },
    });
    for await (const _chunk of provider.stream(withoutThinking, {
      tools,
      reasoning: { maxTokens: 1024 },
    })) {
      // drain
    }
    await provider.chat(question, { tools, reasoning: { maxTokens: 1024 } });

    expect(create.mock.calls[0][0].thinking).toBeUndefined();
    expect(create.mock.calls[1][0].thinking).toBeUndefined();
    expect(create.mock.calls[2][0].thinking).toEqual({
      type: 'enabled',
      budget_tokens: 1024,
    });
  });
});
