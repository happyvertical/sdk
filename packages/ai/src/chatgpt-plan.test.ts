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
          headers: { 'content-type': 'application/json' },
        }),
      ),
    });

    await expect(provider.getModels()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
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
    expect(error).not.toHaveProperty('token');
  });
});
