import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAI } from './index';
import {
  MAX_CHAT_TEMPLATE_KWARGS_BYTES,
  prepareChatTemplateKwargs,
} from './shared/chat-template-kwargs';
import type { AIFinishReason, AIMessage, ChatOptions } from './shared/types';

/**
 * Fake vLLM / Ollama HTTP fixture: each test sets the reply the server sends
 * and inspects the request bodies it received.
 */
type Reply =
  | { kind: 'json'; body: unknown }
  | { kind: 'sse'; events: unknown[] }
  | { kind: 'ndjson'; lines: unknown[] };

let server: Server;
let baseUrl: string;
let requests: { url: string; body: Record<string, unknown> }[];
let reply: Reply;
/** Replies served first, in order, before falling back to `reply`. */
let queue: Reply[];

beforeEach(async () => {
  requests = [];
  queue = [];
  server = createServer(async (request, response) => {
    const reply = queue.shift() ?? currentReply();
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({
      url: request.url ?? '',
      body: JSON.parse(Buffer.concat(chunks).toString() || '{}'),
    });
    if (reply.kind === 'json') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(reply.body));
    } else if (reply.kind === 'sse') {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(
        `${reply.events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}data: [DONE]\n\n`,
      );
    } else {
      response.writeHead(200, { 'content-type': 'application/x-ndjson' });
      response.end(
        `${reply.lines.map((line) => JSON.stringify(line)).join('\n')}\n`,
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Expected local TCP server');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

function currentReply(): Reply {
  return reply;
}

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

const messages: AIMessage[] = [{ role: 'user', content: 'hello' }];
const MODEL = 'google/gemma-4-26b';

function completion(
  message: Record<string, unknown>,
  finishReason: string | null = 'stop',
) {
  return {
    id: 'cmpl-local',
    object: 'chat.completion',
    created: 0,
    model: MODEL,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', ...message },
        finish_reason: finishReason,
      },
    ],
  };
}

function chunk(delta: Record<string, unknown>, finishReason?: string | null) {
  return {
    id: 'cmpl-local',
    object: 'chat.completion.chunk',
    created: 0,
    model: MODEL,
    choices: [{ index: 0, delta, finish_reason: finishReason ?? null }],
  };
}

async function vllm(type: 'openai' | 'litellm' | 'bifrost' = 'openai') {
  return getAI({
    type,
    apiKey: 'local-fixture',
    baseUrl: `${baseUrl}/v1`,
    defaultModel: MODEL,
    maxRetries: 0,
  });
}

async function collect(
  type: 'openai' | 'litellm' | 'bifrost',
  options: ChatOptions = {},
) {
  const ai = await vllm(type);
  const seen: { reasoning: string[]; finish?: AIFinishReason } = {
    reasoning: [],
  };
  let content = '';
  for await (const part of ai.stream(messages, {
    model: MODEL,
    ...options,
    onReasoning: (text) => seen.reasoning.push(text),
    onFinishReason: (reason) => {
      seen.finish = reason;
    },
  }))
    content += part;
  return { content, ...seen };
}

describe('OpenAI-compatible reasoning text (vLLM)', () => {
  for (const field of ['reasoning_content', 'reasoning'] as const) {
    it(`chat maps message.${field} to reasoning`, async () => {
      reply = {
        kind: 'json',
        body: completion({ content: 'Paris.', [field]: 'Capital of France.' }),
      };
      const response = await (await vllm()).chat(messages, { model: MODEL });
      expect(response.content).toBe('Paris.');
      expect(response.reasoning).toBe('Capital of France.');
      expect(response.finishReason).toBe('stop');
    });

    it(`stream accumulates delta.${field} and reports it once`, async () => {
      reply = {
        kind: 'sse',
        events: [
          chunk({ role: 'assistant', [field]: 'Think ' }),
          chunk({ [field]: 'hard.' }),
          chunk({ content: 'Answer' }),
          chunk({}, 'stop'),
        ],
      };
      const result = await collect('openai');
      expect(result.content).toBe('Answer');
      expect(result.reasoning).toEqual(['Think hard.']);
      expect(result.finish).toBe('stop');
    });
  }

  it('surfaces an answer the reasoning parser kept out of content', async () => {
    reply = {
      kind: 'json',
      body: completion({
        content: null,
        reasoning_content: 'The answer is 4.',
      }),
    };
    const response = await (await vllm()).chat(messages, { model: MODEL });
    expect(response.content).toBe('');
    expect(response.reasoning).toBe('The answer is 4.');
  });

  it('prefers reasoning_content when both fields are present', async () => {
    reply = {
      kind: 'json',
      body: completion({
        content: 'ok',
        reasoning_content: 'primary',
        reasoning: 'secondary',
      }),
    };
    const response = await (await vllm()).chat(messages, { model: MODEL });
    expect(response.reasoning).toBe('primary');
  });

  it('leaves reasoning absent when the server sends none', async () => {
    reply = { kind: 'json', body: completion({ content: 'ok' }) };
    const response = await (await vllm()).chat(messages, { model: MODEL });
    expect(response).not.toHaveProperty('reasoning');

    reply = {
      kind: 'sse',
      events: [chunk({ content: 'ok' }), chunk({}, 'stop')],
    };
    const result = await collect('openai');
    expect(result.content).toBe('ok');
    expect(result.reasoning).toEqual([]);
  });

  it('ignores empty or non-string reasoning values', async () => {
    reply = {
      kind: 'json',
      body: completion({
        content: 'ok',
        reasoning_content: '',
        reasoning: { summary: 'structured' },
      }),
    };
    const response = await (await vllm()).chat(messages, { model: MODEL });
    expect(response).not.toHaveProperty('reasoning');
  });

  it('LiteLLM and Bifrost inherit the mapping', async () => {
    for (const type of ['litellm', 'bifrost'] as const) {
      reply = {
        kind: 'json',
        body: completion({ content: 'ok', reasoning: 'why' }),
      };
      const response = await (await vllm(type)).chat(messages, {
        model: MODEL,
      });
      expect(response.reasoning).toBe('why');
    }
  });
});

describe('OpenAI-compatible finishReason', () => {
  const cases: [string | null, AIFinishReason][] = [
    ['stop', 'stop'],
    ['length', 'length'],
    ['tool_calls', 'tool_calls'],
    ['function_call', 'tool_calls'],
    ['content_filter', 'content_filter'],
    ['abort', 'stop'],
    [null, 'stop'],
  ];
  for (const [wire, expected] of cases) {
    it(`chat maps ${String(wire)} to ${expected}`, async () => {
      reply = { kind: 'json', body: completion({ content: 'ok' }, wire) };
      const response = await (await vllm()).chat(messages, {
        model: MODEL,
        continueOnLength: false,
      });
      expect(response.finishReason).toBe(expected);
    });
  }

  it('reports tool_calls when a reply with tool calls says stop', async () => {
    reply = {
      kind: 'json',
      body: completion(
        {
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'lookup', arguments: '{}' },
            },
          ],
        },
        'stop',
      ),
    };
    const response = await (await vllm()).chat(messages, { model: MODEL });
    expect(response.finishReason).toBe('tool_calls');
    expect(response.toolCalls).toHaveLength(1);
  });

  it('stream reports stop when the server never sends a finish reason', async () => {
    reply = { kind: 'sse', events: [chunk({ content: 'ok' })] };
    expect((await collect('openai')).finish).toBe('stop');
  });
});

describe('continuation keeps reasoning from every part', () => {
  it('chat joins reasoning across continued parts', async () => {
    queue = [
      {
        kind: 'json',
        body: completion(
          { content: 'First half', reasoning_content: 'one ' },
          'length',
        ),
      },
    ];
    reply = {
      kind: 'json',
      body: completion({ content: ' second half.', reasoning_content: 'two' }),
    };
    const response = await (await vllm()).chat(messages, {
      model: MODEL,
      continueOnLength: true,
    });
    expect(response.parts).toBe(2);
    expect(response.content).toBe('First half second half.');
    expect(response.reasoning).toBe('one two');
    expect(response.finishReason).toBe('stop');
  });

  it('stream reports joined reasoning once across continued parts', async () => {
    queue = [
      {
        kind: 'sse',
        events: [
          chunk({ reasoning: 'one ' }),
          chunk({ content: 'First half' }, 'length'),
        ],
      },
    ];
    reply = {
      kind: 'sse',
      events: [
        chunk({ reasoning: 'two' }),
        chunk({ content: ' second half, which is long enough.' }, 'stop'),
      ],
    };
    const result = await collect('openai', { continueOnLength: true });
    expect(result.content).toContain('First half');
    expect(result.reasoning).toEqual(['one two']);
    expect(result.finish).toBe('stop');
  });
});

describe('chatTemplateKwargs', () => {
  for (const stream of [false, true]) {
    it(`${stream ? 'stream' : 'chat'} sends chat_template_kwargs`, async () => {
      reply = stream
        ? { kind: 'sse', events: [chunk({ content: 'ok' }, 'stop')] }
        : { kind: 'json', body: completion({ content: 'ok' }) };
      const kwargs = { enable_thinking: false };
      if (stream) await collect('openai', { chatTemplateKwargs: kwargs });
      else
        await (await vllm()).chat(messages, {
          model: MODEL,
          chatTemplateKwargs: kwargs,
        });
      expect(requests.at(-1)?.url).toBe('/v1/chat/completions');
      expect(requests.at(-1)?.body.chat_template_kwargs).toEqual({
        enable_thinking: false,
      });
    });
  }

  it('omits the field when unset or empty', async () => {
    reply = { kind: 'json', body: completion({ content: 'ok' }) };
    const ai = await vllm();
    await ai.chat(messages, { model: MODEL });
    await ai.chat(messages, { model: MODEL, chatTemplateKwargs: {} });
    for (const request of requests) {
      expect(request.body).not.toHaveProperty('chat_template_kwargs');
    }
  });

  it('rejects invalid values before any request, without echoing them', async () => {
    reply = { kind: 'json', body: completion({ content: 'ok' }) };
    const ai = await vllm();
    const secret = 'sk-do-not-echo';
    const invalid: unknown[] = [
      [secret],
      'enable_thinking',
      { token: () => secret },
      { nested: new Date() },
      { n: Number.NaN },
      { big: 1n },
      { deep: { a: { b: { c: { d: secret } } } } },
      { big: 'x'.repeat(MAX_CHAT_TEMPLATE_KWARGS_BYTES) },
      Object.fromEntries(
        Array.from({ length: 33 }, (_, i) => [`k${i}`, secret]),
      ),
      JSON.parse(`{"__proto__": {"polluted": "${secret}"}}`),
    ];
    for (const value of invalid) {
      const error = await ai
        .chat(messages, {
          model: MODEL,
          chatTemplateKwargs: value as Record<string, unknown>,
        })
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: 'AI_INVALID_CHAT_TEMPLATE_KWARGS' });
      expect(String((error as Error).message)).not.toContain(secret);
    }
    expect(requests).toHaveLength(0);
  });

  it('sends a detached copy of the caller object', () => {
    const value = { enable_thinking: false, nested: { list: [1, 'two'] } };
    const prepared = prepareChatTemplateKwargs(value);
    expect(prepared).toEqual(value);
    expect(prepared).not.toBe(value);
    value.nested.list.push(3);
    expect(prepared?.nested).toEqual({ list: [1, 'two'] });
  });
});

describe('Ollama thinking text', () => {
  const ollama = () =>
    getAI({ type: 'ollama', baseUrl, defaultModel: 'gemma4', maxRetries: 0 });

  it('chat maps message.thinking to reasoning', async () => {
    reply = {
      kind: 'json',
      body: {
        model: 'gemma4',
        message: { role: 'assistant', content: 'ok', thinking: 'hmm' },
        done: true,
        done_reason: 'stop',
      },
    };
    const response = await (await ollama()).chat(messages, {
      model: 'gemma4',
    });
    expect(requests.at(-1)?.url).toBe('/api/chat');
    expect(response.reasoning).toBe('hmm');
    expect(response.finishReason).toBe('stop');
  });

  it('chat leaves reasoning absent without thinking', async () => {
    reply = {
      kind: 'json',
      body: {
        model: 'gemma4',
        message: { role: 'assistant', content: 'ok' },
        done: true,
        done_reason: 'stop',
      },
    };
    const response = await (await ollama()).chat(messages, {
      model: 'gemma4',
    });
    expect(response).not.toHaveProperty('reasoning');
  });

  it('stream accumulates thinking and reports it once', async () => {
    reply = {
      kind: 'ndjson',
      lines: [
        { model: 'gemma4', message: { role: 'assistant', thinking: 'a ' } },
        { model: 'gemma4', message: { role: 'assistant', thinking: 'b' } },
        { model: 'gemma4', message: { role: 'assistant', content: 'ok' } },
        { model: 'gemma4', done: true, done_reason: 'stop' },
      ],
    };
    const ai = await ollama();
    const seen: string[] = [];
    let content = '';
    for await (const part of ai.stream(messages, {
      model: 'gemma4',
      onReasoning: (text) => seen.push(text),
    }))
      content += part;
    expect(content).toBe('ok');
    expect(seen).toEqual(['a b']);
  });
});
