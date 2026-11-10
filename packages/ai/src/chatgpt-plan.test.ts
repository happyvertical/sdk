import { describe, expect, it, vi } from 'vitest';

import { getAI, getAIAuto } from './shared/factory';
import {
  ChatGPTPlanProvider,
  ChatGPTPlanSessionRevokedError,
  ChatGPTPlanUsageLimitError,
  ChatGPTPlanUsageUnavailableError,
  ChatGPTPlanWorkspaceError,
} from './shared/providers/chatgpt-plan';

const TOKEN = 'secret-oauth-token';

function session(accessToken = TOKEN) {
  return { accessToken: vi.fn().mockResolvedValue(accessToken) };
}

function eventStream(events: unknown[], headers: Record<string, string> = {}) {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    {
      headers: {
        'content-type': 'text/event-stream',
        'x-request-id': 'req_test',
        ...headers,
      },
    },
  );
}

function completedEvents() {
  return [
    { type: 'response.output_text.delta', delta: 'hello' },
    { type: 'response.output_text.delta', delta: ' world' },
    {
      type: 'response.completed',
      response: {
        model: 'gpt-test',
        usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
      },
    },
  ];
}

describe('ChatGPT plan provider', () => {
  it('is available only through explicit provider selection', async () => {
    const provider = await getAI({
      type: 'chatgpt-plan',
      clientId: 'client-1',
      sessionManager: session(),
      defaultModel: 'gpt-test',
      fetch: vi.fn().mockResolvedValue(eventStream(completedEvents())),
    });
    expect(provider).toBeInstanceOf(ChatGPTPlanProvider);

    await expect(
      getAIAuto({
        clientId: 'client-1',
        sessionManager: session(),
      }),
    ).rejects.toThrow('Could not auto-detect');
  });

  it('discovers visible account models in server order without exposing the token', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            { slug: 'hidden', display_name: 'Hidden', visibility: 'hidden' },
            { slug: 'gpt-b', display_name: 'Model B', visibility: 'list' },
            { slug: 'gpt-a', display_name: 'Model A', visibility: 'list' },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const manager = session();
    const provider = new ChatGPTPlanProvider({
      type: 'chatgpt-plan',
      clientId: 'client-1',
      sessionManager: manager,
      fetch: fetcher,
    });

    await expect(provider.getModels()).resolves.toEqual([
      expect.objectContaining({ id: 'gpt-b', name: 'Model B' }),
      expect.objectContaining({ id: 'gpt-a', name: 'Model A' }),
    ]);
    expect(manager.accessToken).toHaveBeenCalledWith('client-1');
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${TOKEN}`,
        }),
      }),
    );
    expect(fetcher.mock.calls[0][0]).not.toContain(TOKEN);
  });

  it('fails closed on a malformed account model catalog', async () => {
    const provider = new ChatGPTPlanProvider({
      type: 'chatgpt-plan',
      clientId: 'client-1',
      sessionManager: session(),
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [] }), {
          headers: {
            'content-type': 'application/json',
            'x-request-id': `req_${TOKEN}`,
          },
        }),
      ),
    });

    const error = await provider.getModels().catch((value) => value);
    expect(error).toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(error.requestId).not.toContain(TOKEN);
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });

  it('sends the fail-closed SIWC Responses shape and waits for completed', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        eventStream([{ type: 'future.event', value: 1 }, ...completedEvents()]),
      );
    const progress = vi.fn();
    const provider = new ChatGPTPlanProvider({
      type: 'chatgpt-plan',
      clientId: 'client-1',
      sessionManager: session(),
      defaultModel: 'gpt-test',
      fetch: fetcher,
    });

    await expect(
      provider.chat(
        [
          { role: 'system', content: 'Plan carefully.' },
          { role: 'user', content: 'Make a plan.' },
        ],
        { onProgress: progress },
      ),
    ).resolves.toEqual({
      content: 'hello world',
      model: 'gpt-test',
      usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      finishReason: 'stop',
    });

    const init = fetcher.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'gpt-test',
      input: [
        { role: 'developer', content: 'Plan carefully.' },
        { role: 'user', content: 'Make a plan.' },
      ],
      store: false,
      stream: true,
    });
    expect(progress).toHaveBeenCalledTimes(2);
  });

  const weatherTool = {
    type: 'function' as const,
    function: {
      name: 'get_weather',
      description: 'Look up the weather.',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
      },
    },
  };

  function toolProvider(
    fetcher: ReturnType<typeof vi.fn>,
    manager = session(),
  ) {
    return new ChatGPTPlanProvider({
      type: 'chatgpt-plan',
      clientId: 'client-1',
      sessionManager: manager,
      defaultModel: 'gpt-test',
      fetch: fetcher as unknown as typeof fetch,
    });
  }

  function requestBody(fetcher: ReturnType<typeof vi.fn>) {
    return JSON.parse(String((fetcher.mock.calls[0][1] as RequestInit).body));
  }

  it('sends function tools grouped in one namespace and returns streamed function calls', async () => {
    const call = {
      type: 'function_call',
      id: 'fc_1',
      call_id: 'call_1',
      name: 'get_weather',
      namespace: 'app_tools',
      arguments: '{"city":"Paris"}',
    };
    const fetcher = vi.fn().mockResolvedValue(
      eventStream([
        { type: 'response.output_text.delta', delta: 'Checking.' },
        {
          type: 'response.output_item.added',
          item: { ...call, arguments: '' },
        },
        { type: 'response.function_call_arguments.delta', delta: '{"city"' },
        { type: 'response.output_item.done', item: call },
        {
          type: 'response.completed',
          response: {
            model: 'gpt-test',
            usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
            output: [
              call,
              {
                type: 'function_call',
                call_id: 'call_2',
                name: 'get_weather',
                arguments: '{"city":"Rome"}',
              },
            ],
          },
        },
      ]),
    );
    const finish = vi.fn();

    await expect(
      toolProvider(fetcher).chat([{ role: 'user', content: 'Weather?' }], {
        tools: [weatherTool, { type: 'function', function: { name: 'ping' } }],
        toolChoice: 'auto',
        onFinishReason: finish,
      }),
    ).resolves.toEqual({
      content: 'Checking.',
      model: 'gpt-test',
      usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      finishReason: 'tool_calls',
      toolCalls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
        },
        {
          id: 'call_2',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"city":"Rome"}' },
        },
      ],
    });
    expect(finish).toHaveBeenCalledWith('tool_calls');
    expect(requestBody(fetcher)).toEqual({
      model: 'gpt-test',
      input: [{ role: 'user', content: 'Weather?' }],
      tools: [
        {
          type: 'namespace',
          name: 'app_tools',
          description: 'Functions provided by the application.',
          tools: [
            {
              type: 'function',
              name: 'get_weather',
              description: 'Look up the weather.',
              parameters: weatherTool.function.parameters,
              strict: false,
            },
            {
              type: 'function',
              name: 'ping',
              parameters: { type: 'object', properties: {} },
              strict: false,
            },
          ],
        },
      ],
      store: false,
      stream: true,
    });
  });

  it('replays tool calls and tool results as Responses input items', async () => {
    const fetcher = vi.fn().mockResolvedValue(eventStream(completedEvents()));
    const provider = new ChatGPTPlanProvider({
      type: 'chatgpt-plan',
      clientId: 'client-1',
      sessionManager: session(),
      defaultModel: 'gpt-test',
      toolNamespace: { name: 'weather', description: 'Weather tools.' },
      fetch: fetcher,
    });

    await provider.chat(
      [
        { role: 'user', content: 'Weather?' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          name: 'get_weather',
          content: [{ type: 'text', text: '{"temp":21}' }],
        },
        {
          role: 'assistant',
          content: 'One more.',
          tool_calls: [
            {
              id: 'call_2',
              type: 'function',
              function: { name: 'get_weather', arguments: '' },
            },
          ],
        },
        { role: 'tool', tool_call_id: 'call_2', content: 'sunny' },
      ],
      { tools: [weatherTool], toolChoice: 'none' },
    );

    const body = requestBody(fetcher);
    expect(body.input).toEqual([
      { role: 'user', content: 'Weather?' },
      {
        type: 'function_call',
        call_id: 'call_1',
        name: 'get_weather',
        namespace: 'weather',
        arguments: '{"city":"Paris"}',
      },
      {
        type: 'function_call_output',
        call_id: 'call_1',
        output: '{"temp":21}',
      },
      { role: 'assistant', content: 'One more.' },
      {
        type: 'function_call',
        call_id: 'call_2',
        name: 'get_weather',
        namespace: 'weather',
        arguments: '{}',
      },
      { type: 'function_call_output', call_id: 'call_2', output: 'sunny' },
    ]);
    expect(body.tool_choice).toBe('none');
    expect(body.tools[0]).toMatchObject({
      type: 'namespace',
      name: 'weather',
      description: 'Weather tools.',
    });
  });

  it.each([
    [
      'a forced function choice',
      [{ role: 'user', content: 'hi' }],
      {
        tools: [weatherTool],
        toolChoice: { type: 'function', function: { name: 'get_weather' } },
      },
      {
        code: 'subscription_sharing_unsupported_capability',
        param: 'toolChoice',
      },
    ],
    [
      'a non-function tool',
      [{ role: 'user', content: 'hi' }],
      { tools: [{ type: 'web_search' }] },
      { code: 'subscription_sharing_unsupported_capability', param: 'tools' },
    ],
    [
      'an unnamed function tool',
      [{ role: 'user', content: 'hi' }],
      { tools: [{ type: 'function', function: {} }] },
      { code: 'INVALID_REQUEST', param: 'tools' },
    ],
    [
      'sampling and limit options next to tools',
      [{ role: 'user', content: 'hi' }],
      { tools: [weatherTool], maxTokens: 10 },
      {
        code: 'subscription_sharing_unsupported_capability',
        param: 'maxTokens',
      },
    ],
    [
      'a response format',
      [{ role: 'user', content: 'hi' }],
      { responseFormat: { type: 'json_object' } },
      {
        code: 'subscription_sharing_unsupported_capability',
        param: 'responseFormat',
      },
    ],
    [
      'a tool result without the call it answers',
      [{ role: 'tool', content: 'sunny' }],
      {},
      { code: 'INVALID_REQUEST', param: 'input' },
    ],
    [
      'an image tool result',
      [
        {
          role: 'tool',
          tool_call_id: 'call_1',
          content: [{ type: 'image_url', image_url: { url: 'data:,' } }],
        },
      ],
      {},
      { code: 'subscription_sharing_unsupported_capability', param: 'input' },
    ],
    [
      'a legacy function role message',
      [{ role: 'function', name: 'get_weather', content: 'sunny' }],
      {},
      { code: 'subscription_sharing_unsupported_capability', param: 'input' },
    ],
    [
      'tool calls on a user message',
      [
        {
          role: 'user',
          content: 'hi',
          tool_calls: [
            {
              id: 'c',
              type: 'function',
              function: { name: 'x', arguments: '' },
            },
          ],
        },
      ],
      {},
      { code: 'subscription_sharing_unsupported_capability', param: 'input' },
    ],
    [
      'a replayed tool call without an id',
      [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: '',
              type: 'function',
              function: { name: 'x', arguments: '' },
            },
          ],
        },
      ],
      {},
      { code: 'INVALID_REQUEST', param: 'input' },
    ],
  ])('rejects %s before requesting a token', async (_name, messages, options, expected) => {
    const manager = session();
    const fetcher = vi.fn();
    await expect(
      toolProvider(fetcher, manager).chat(messages as never, options as never),
    ).rejects.toMatchObject(expected);
    expect(manager.accessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fails on a streamed function call without call_id or name', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      eventStream([
        {
          type: 'response.output_item.done',
          item: { type: 'function_call', name: 'get_weather', arguments: '{}' },
        },
        ...completedEvents(),
      ]),
    );
    await expect(
      toolProvider(fetcher).chat([{ role: 'user', content: 'hi' }], {
        tools: [weatherTool],
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
      requestId: 'req_test',
    });
  });

  it('keeps stream() text-only: tool history is replayed, tools are refused', async () => {
    const manager = session();
    const fetcher = vi.fn().mockResolvedValue(eventStream(completedEvents()));
    const provider = toolProvider(fetcher, manager);
    const collect = async (options = {}) => {
      const chunks: string[] = [];
      for await (const chunk of provider.stream(
        [
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'get_weather', arguments: '{}' },
              },
            ],
          },
          { role: 'tool', tool_call_id: 'call_1', content: 'sunny' },
        ],
        options,
      ))
        chunks.push(chunk);
      return chunks;
    };

    await expect(collect({ tools: [weatherTool] })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      param: 'tools',
    });
    expect(manager.accessToken).not.toHaveBeenCalled();
    await expect(collect()).resolves.toEqual(['hello', ' world']);
    expect(requestBody(fetcher).input).toHaveLength(2);
  });

  it('reports function support', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [{ slug: 'gpt-a', display_name: 'A', visibility: 'list' }],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = toolProvider(fetcher);
    await expect(provider.getCapabilities()).resolves.toMatchObject({
      functions: true,
      supportedOperations: expect.arrayContaining(['functions']),
    });
    await expect(provider.getModels()).resolves.toEqual([
      expect.objectContaining({ id: 'gpt-a', supportsFunctions: true }),
    ]);
  });

  it('rejects unsupported Responses fields before requesting a token or making a request', async () => {
    const manager = session();
    const fetcher = vi.fn();
    const provider = new ChatGPTPlanProvider({
      type: 'chatgpt-plan',
      clientId: 'client-1',
      sessionManager: manager,
      defaultModel: 'gpt-test',
      fetch: fetcher,
    });

    await expect(
      provider.chat([{ role: 'user', content: 'hello' }], {
        maxTokens: 10,
        temperature: 0,
      }),
    ).rejects.toMatchObject({
      code: 'subscription_sharing_unsupported_capability',
      param: 'maxTokens',
    });
    expect(manager.accessToken).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('streams text but fails when the connection ends without response.completed', async () => {
    const provider = new ChatGPTPlanProvider({
      type: 'chatgpt-plan',
      clientId: 'client-1',
      sessionManager: session(),
      defaultModel: 'gpt-test',
      fetch: vi
        .fn()
        .mockResolvedValue(
          eventStream([
            { type: 'response.output_text.delta', delta: 'partial' },
          ]),
        ),
    });

    const read = async () => {
      let text = '';
      for await (const chunk of provider.stream([
        { role: 'user', content: 'hello' },
      ]))
        text += chunk;
      return text;
    };
    await expect(read()).rejects.toMatchObject({
      code: 'STREAM_INTERRUPTED',
      retryable: true,
    });
  });

  it.each([
    ['subscription_sharing_usage_limit_exceeded', ChatGPTPlanUsageLimitError],
    ['subscription_sharing_user_not_eligible', ChatGPTPlanWorkspaceError],
    [
      'subscription_sharing_usage_unavailable',
      ChatGPTPlanUsageUnavailableError,
    ],
    ['subscription_sharing_invalid_user', ChatGPTPlanSessionRevokedError],
  ])('maps streamed %s errors to an actionable type', async (code, ErrorType) => {
    const provider = new ChatGPTPlanProvider({
      type: 'chatgpt-plan',
      clientId: 'client-1',
      sessionManager: session(),
      defaultModel: 'gpt-test',
      fetch: vi.fn().mockResolvedValue(
        eventStream([
          {
            type: 'response.failed',
            response: { error: { code, message: `failure ${TOKEN}` } },
          },
        ]),
      ),
    });

    const error = await provider
      .chat([{ role: 'user', content: 'hello' }])
      .catch((value) => value);
    expect(error).toBeInstanceOf(ErrorType);
    expect(error.message).not.toContain(TOKEN);
    expect(error.requestId).toBe('req_test');
  });

  it('maps direct admission detail bodies and preserves the request id', async () => {
    const provider = new ChatGPTPlanProvider({
      type: 'chatgpt-plan',
      clientId: 'client-1',
      sessionManager: session(),
      defaultModel: 'gpt-test',
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: `denied ${TOKEN}` }), {
          status: 403,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req_admission',
          },
        }),
      ),
    });

    const error = await provider
      .chat([{ role: 'user', content: 'hello' }])
      .catch((value) => value);
    expect(error).toBeInstanceOf(ChatGPTPlanWorkspaceError);
    expect(error.message).toBe('denied [REDACTED]');
    expect(error.requestId).toBe('req_admission');
  });

  it('redacts every serialized response diagnostic', async () => {
    const provider = new ChatGPTPlanProvider({
      type: 'chatgpt-plan',
      clientId: 'client-1',
      sessionManager: session(),
      defaultModel: 'gpt-test',
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: `unknown_${TOKEN}`,
              message: `failure ${TOKEN}`,
              param: `field_${TOKEN}`,
            },
          }),
          {
            status: 400,
            headers: { 'x-request-id': `req_${TOKEN}` },
          },
        ),
      ),
    });

    const error = await provider
      .chat([{ role: 'user', content: 'hello' }])
      .catch((value) => value);
    expect(error.message).not.toContain(TOKEN);
    expect(error.code).not.toContain(TOKEN);
    expect(error.param).not.toContain(TOKEN);
    expect(error.requestId).not.toContain(TOKEN);
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });

  it('maps top-level Responses error events through the typed redacted mapper', async () => {
    const provider = new ChatGPTPlanProvider({
      type: 'chatgpt-plan',
      clientId: 'client-1',
      sessionManager: session(),
      defaultModel: 'gpt-test',
      fetch: vi.fn().mockResolvedValue(
        eventStream([
          {
            type: 'error',
            code: 'subscription_sharing_usage_limit_exceeded',
            message: `limit reached ${TOKEN}`,
            param: `field_${TOKEN}`,
          },
        ]),
      ),
    });

    const error = await provider
      .chat([{ role: 'user', content: 'hello' }])
      .catch((value) => value);
    expect(error).toBeInstanceOf(ChatGPTPlanUsageLimitError);
    expect(error.message).not.toContain(TOKEN);
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });

  it('maps protected-session revocation without copying credentials', async () => {
    const manager = {
      accessToken: vi.fn().mockRejectedValue(
        Object.assign(new Error(`refresh invalid ${TOKEN}`), {
          code: 'refresh_invalid',
        }),
      ),
    };
    const provider = new ChatGPTPlanProvider({
      type: 'chatgpt-plan',
      clientId: 'client-1',
      sessionManager: manager,
      defaultModel: 'gpt-test',
      fetch: vi.fn(),
    });

    const error = await provider
      .chat([{ role: 'user', content: 'hello' }])
      .catch((value) => value);
    expect(error).toBeInstanceOf(ChatGPTPlanSessionRevokedError);
    expect(error.code).toBe('refresh_invalid');
    expect(error.message).not.toContain(TOKEN);
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });

  it('maps uncoded protected-session transport failures to retryable unavailability', async () => {
    const manager = {
      accessToken: vi.fn().mockRejectedValue(new TypeError(`fetch ${TOKEN}`)),
    };
    const provider = new ChatGPTPlanProvider({
      type: 'chatgpt-plan',
      clientId: 'client-1',
      sessionManager: manager,
      defaultModel: 'gpt-test',
      fetch: vi.fn(),
    });

    const error = await provider
      .chat([{ role: 'user', content: 'hello' }])
      .catch((value) => value);
    expect(error).toBeInstanceOf(ChatGPTPlanUsageUnavailableError);
    expect(error).toMatchObject({ retryable: true });
    expect(error.message).not.toContain(TOKEN);
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });
});
