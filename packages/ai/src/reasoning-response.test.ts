import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAI } from './index';
import {
  MAX_CHAT_TEMPLATE_KWARGS_BYTES,
  MAX_CHAT_TEMPLATE_KWARGS_ENTRIES,
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
  /** Sends the events, then holds the connection open without [DONE]. */
  | { kind: 'sse-open'; events: unknown[] }
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
    } else if (reply.kind === 'sse-open') {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(
        reply.events
          .map((event) => `data: ${JSON.stringify(event)}\n\n`)
          .join(''),
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
    ['function_call', 'other'],
    ['content_filter', 'content_filter'],
    ['abort', 'other'],
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
      if (expected === 'other') expect(response.rawFinishReason).toBe(wire);
      else expect(response).not.toHaveProperty('rawFinishReason');
    });
  }

  it('does not invent tool calls for a legacy function_call reply', async () => {
    reply = {
      kind: 'json',
      body: completion(
        {
          content: null,
          function_call: { name: 'lookup', arguments: '{}' },
        },
        'function_call',
      ),
    };
    const response = await (await vllm()).chat(messages, { model: MODEL });
    expect(response.finishReason).toBe('other');
    expect(response.rawFinishReason).toBe('function_call');
    expect(response.toolCalls).toBeUndefined();
  });

  for (const wire of ['length', 'content_filter'] as const) {
    it(`keeps ${wire} on a reply that also carries tool calls`, async () => {
      reply = {
        kind: 'json',
        body: completion(
          {
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'lookup', arguments: '{"q":' },
              },
            ],
          },
          wire,
        ),
      };
      const response = await (await vllm()).chat(messages, {
        model: MODEL,
        continueOnLength: false,
      });
      expect(response.finishReason).toBe(wire);
      expect(response.toolCalls).toHaveLength(1);
    });
  }

  it('stream reports other for an aborted generation', async () => {
    reply = {
      kind: 'sse',
      events: [chunk({ content: 'partial' }), chunk({}, 'abort')],
    };
    const result = await collect('openai');
    expect(result.content).toBe('partial');
    expect(result.finish).toBe('other');
  });

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

describe('onReasoning delivery', () => {
  it('a throwing onReasoning cannot break the stream', async () => {
    reply = {
      kind: 'sse',
      events: [
        chunk({ reasoning_content: 'why' }),
        chunk({ content: 'ok' }, 'stop'),
      ],
    };
    const ai = await vllm();
    let content = '';
    let finish: AIFinishReason | undefined;
    let calls = 0;
    for await (const part of ai.stream(messages, {
      model: MODEL,
      onReasoning: () => {
        calls++;
        throw new Error('callback failure');
      },
      onFinishReason: (reason) => {
        finish = reason;
      },
    }))
      content += part;
    expect(content).toBe('ok');
    expect(finish).toBe('stop');
    expect(calls).toBe(1);
  });

  it('delivers partial reasoning when the consumer stops early', async () => {
    reply = {
      kind: 'sse-open',
      events: [chunk({ reasoning: 'half a thought' }), chunk({ content: 'a' })],
    };
    const ai = await vllm();
    const seen: string[] = [];
    for await (const _part of ai.stream(messages, {
      model: MODEL,
      onReasoning: (text) => seen.push(text),
    }))
      break;
    expect(seen).toEqual(['half a thought']);
  });

  it('delivers partial reasoning when the stream is aborted', async () => {
    reply = {
      kind: 'sse-open',
      events: [chunk({ reasoning: 'half a thought' }), chunk({ content: 'a' })],
    };
    const ai = await vllm();
    const controller = new AbortController();
    const seen: string[] = [];
    const error = await (async () => {
      for await (const _part of ai.stream(messages, {
        model: MODEL,
        signal: controller.signal,
        continueOnLength: false,
        onReasoning: (text) => {
          seen.push(text);
          throw new Error('callback failure must not mask the abort');
        },
      }))
        controller.abort();
    })().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'AI_ABORTED' });
    expect(seen).toEqual(['half a thought']);
  });

  it('a mid-stream timeout raises AI_TIMEOUT and still delivers reasoning', async () => {
    reply = {
      kind: 'sse-open',
      events: [chunk({ reasoning: 'half a thought' }), chunk({ content: 'a' })],
    };
    const ai = await vllm();
    const seen: string[] = [];
    let finish: AIFinishReason | undefined;
    let content = '';
    const error = await (async () => {
      for await (const part of ai.stream(messages, {
        model: MODEL,
        timeout: 200,
        continueOnLength: false,
        onReasoning: (text) => seen.push(text),
        onFinishReason: (reason) => {
          finish = reason;
        },
      }))
        content += part;
    })().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'AI_TIMEOUT' });
    expect(content).toBe('a');
    expect(seen).toEqual(['half a thought']);
    expect(finish).toBeUndefined();
  });

  it('continued streams deliver joined reasoning on early stop', async () => {
    queue = [
      {
        kind: 'sse',
        events: [
          chunk({ reasoning: 'one ' }),
          chunk({ content: 'First half' }, 'length'),
        ],
      },
    ];
    reply = { kind: 'sse-open', events: [chunk({ reasoning: 'two' })] };
    const ai = await vllm();
    const seen: string[] = [];
    const controller = new AbortController();
    await (async () => {
      for await (const _part of ai.stream(messages, {
        model: MODEL,
        signal: controller.signal,
        continueOnLength: true,
        onReasoning: (text) => seen.push(text),
      })) {
        setTimeout(() => controller.abort(), 50);
      }
    })().catch(() => undefined);
    expect(seen).toEqual(['one two']);
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

  it('rejects chatTemplateKwargs on the hosted OpenAI API', async () => {
    const saved = process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_BASE_URL;
    try {
      for (const configured of [undefined, 'https://API.openai.com/v1']) {
        const ai = await getAI({
          type: 'openai',
          apiKey: 'local-fixture',
          ...(configured ? { baseUrl: configured } : {}),
          defaultModel: MODEL,
          maxRetries: 0,
        });
        const error = await ai
          .chat(messages, {
            model: MODEL,
            chatTemplateKwargs: { enable_thinking: false },
          })
          .catch((caught: unknown) => caught);
        expect(error).toMatchObject({ code: 'AI_UNSUPPORTED_OPTION' });
        const streamError = await (async () => {
          for await (const _part of ai.stream(messages, {
            model: MODEL,
            chatTemplateKwargs: { enable_thinking: false },
          }));
        })().catch((caught: unknown) => caught);
        expect(streamError).toMatchObject({ code: 'AI_UNSUPPORTED_OPTION' });
        // Without the option the hosted API is not touched by this check.
      }
    } finally {
      if (saved === undefined) delete process.env.OPENAI_BASE_URL;
      else process.env.OPENAI_BASE_URL = saved;
    }
  });

  it('honours OPENAI_BASE_URL when baseUrl is unset', async () => {
    const saved = process.env.OPENAI_BASE_URL;
    process.env.OPENAI_BASE_URL = `${baseUrl}/v1`;
    try {
      reply = { kind: 'json', body: completion({ content: 'ok' }) };
      const ai = await getAI({
        type: 'openai',
        apiKey: 'local-fixture',
        defaultModel: MODEL,
        maxRetries: 0,
      });
      await ai.chat(messages, {
        model: MODEL,
        chatTemplateKwargs: { enable_thinking: false },
      });
      expect(requests.at(-1)?.body.chat_template_kwargs).toEqual({
        enable_thinking: false,
      });
    } finally {
      if (saved === undefined) delete process.env.OPENAI_BASE_URL;
      else process.env.OPENAI_BASE_URL = saved;
    }
  });

  it('LiteLLM and Bifrost send it to their configured gateway', async () => {
    for (const type of ['litellm', 'bifrost'] as const) {
      reply = { kind: 'json', body: completion({ content: 'ok' }) };
      await (await vllm(type)).chat(messages, {
        model: MODEL,
        chatTemplateKwargs: { enable_thinking: false },
      });
      expect(requests.at(-1)?.body.chat_template_kwargs).toEqual({
        enable_thinking: false,
      });
    }
  });

  it('never echoes key names in errors', () => {
    const secret = 'sk-key-name-secret';
    for (const value of [
      { [secret]: () => 1 },
      { ok: { [secret]: Number.POSITIVE_INFINITY } },
      { list: [{ [secret]: undefined }] },
    ]) {
      let message = '';
      try {
        prepareChatTemplateKwargs(value);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/^chatTemplateKwargs /);
      expect(message).not.toContain(secret);
    }
    expect(() => prepareChatTemplateKwargs({ a: [0, { b: 1n }] })).toThrow(
      'chatTemplateKwargs{#0}[1]{#0} must be JSON data',
    );
  });

  it('accepts exactly the byte limit and rejects one byte more', () => {
    // {"k":"..."} is 8 bytes of framing around the string.
    const fits = { k: 'x'.repeat(MAX_CHAT_TEMPLATE_KWARGS_BYTES - 8) };
    expect(JSON.stringify(fits)).toHaveLength(MAX_CHAT_TEMPLATE_KWARGS_BYTES);
    expect(prepareChatTemplateKwargs(fits)).toEqual(fits);
    const over = { k: 'x'.repeat(MAX_CHAT_TEMPLATE_KWARGS_BYTES - 7) };
    expect(() => prepareChatTemplateKwargs(over)).toThrow(/exceeds 8192 bytes/);
    // Multi-byte characters count as UTF-8 bytes, not string length.
    const wide = {
      k: 'é'.repeat((MAX_CHAT_TEMPLATE_KWARGS_BYTES - 8) / 2 + 1),
    };
    expect(() => prepareChatTemplateKwargs(wide)).toThrow(/exceeds/);
  });

  it('accepts 4 levels of nesting and rejects 5', () => {
    const four = { a: { b: { c: { d: 1 } } } };
    expect(prepareChatTemplateKwargs(four)).toEqual(four);
    const fourWithArray = { a: { b: [1, 2] } };
    expect(prepareChatTemplateKwargs(fourWithArray)).toEqual(fourWithArray);
    expect(() =>
      prepareChatTemplateKwargs({ a: { b: { c: { d: {} } } } }),
    ).toThrow(/nests deeper than 4/);
    expect(() =>
      prepareChatTemplateKwargs({ a: { b: { c: { d: [1] } } } }),
    ).toThrow(/nests deeper than 4/);
  });

  it('accepts 32 entries and rejects 33, for objects and arrays', () => {
    const keys = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, i) => [`k${i}`, i]));
    const items = (count: number) => Array.from({ length: count }, (_, i) => i);
    expect(
      prepareChatTemplateKwargs(keys(MAX_CHAT_TEMPLATE_KWARGS_ENTRIES)),
    ).toEqual(keys(32));
    expect(() => prepareChatTemplateKwargs(keys(33))).toThrow(
      /more than 32 keys/,
    );
    expect(prepareChatTemplateKwargs({ list: items(32) })).toEqual({
      list: items(32),
    });
    expect(() => prepareChatTemplateKwargs({ list: items(33) })).toThrow(
      /more than 32 items/,
    );
  });

  it('reads each property once, so validation and send see one value', () => {
    let reads = 0;
    const value = {
      get flip() {
        reads++;
        return reads === 1 ? false : () => 'not json';
      },
    };
    expect(prepareChatTemplateKwargs(value)).toEqual({ flip: false });
    expect(reads).toBe(1);
  });

  it('accepts null-prototype objects and sends ordinary ones', () => {
    const value = Object.assign(Object.create(null), {
      enable_thinking: false,
      nested: Object.assign(Object.create(null), { level: 1 }),
    });
    const prepared = prepareChatTemplateKwargs(value);
    expect(prepared).toEqual({ enable_thinking: false, nested: { level: 1 } });
    expect(Object.getPrototypeOf(prepared)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(prepared?.nested)).toBe(Object.prototype);
  });

  it('stops walking once the running size passes the limit', () => {
    let reads = 0;
    const value = {
      big: 'x'.repeat(MAX_CHAT_TEMPLATE_KWARGS_BYTES),
      get later() {
        reads++;
        return 1;
      },
    };
    expect(() => prepareChatTemplateKwargs(value)).toThrow(
      /exceeds 8192 bytes/,
    );
    expect(reads).toBe(0);
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

  it('complete maps /api/generate thinking to reasoning', async () => {
    reply = {
      kind: 'json',
      body: {
        model: 'gemma4',
        response: 'ok',
        thinking: 'pondered',
        done: true,
        done_reason: 'stop',
      },
    };
    const response = await (await ollama()).complete('hello', {
      model: 'gemma4',
    });
    expect(requests.at(-1)?.url).toBe('/api/generate');
    expect(response.content).toBe('ok');
    expect(response.reasoning).toBe('pondered');
  });

  it('complete leaves reasoning absent without thinking', async () => {
    reply = {
      kind: 'json',
      body: {
        model: 'gemma4',
        response: 'ok',
        done: true,
        done_reason: 'stop',
      },
    };
    const response = await (await ollama()).complete('hello', {
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
