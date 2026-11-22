/**
 * Usage part identity (sdk#1576): every usage event names its public call
 * and its position in it, and chat/complete responses list the call's parts.
 */
import { createServer, type Server } from 'node:http';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { getAI } from './index';
import { createContinuingAI } from './shared/continuation';
import { AnthropicProvider } from './shared/providers/anthropic';
import { HuggingFaceProvider } from './shared/providers/huggingface';
import { OllamaProvider } from './shared/providers/ollama';
import { OpenAIProvider } from './shared/providers/openai';
import type { AIInterface, PartedUsageEvent, UsageEvent } from './shared/types';
import {
  AI_USAGE_PARTS,
  createUsagePartRecorder,
  createUsagePartsAI,
  withUsagePartRecorder,
} from './shared/usage-parts';

const SEAM = 'the quick brown fox jumps over';

function openAIReply(
  content: string,
  finish: string,
  tokens: [number, number] | null = [10, 5],
) {
  return {
    choices: [{ message: { content }, finish_reason: finish }],
    model: 'gpt-4o',
    ...(tokens
      ? {
          usage: {
            prompt_tokens: tokens[0],
            completion_tokens: tokens[1],
            total_tokens: tokens[0] + tokens[1],
          },
        }
      : {}),
  };
}

async function* openAIStream(parts: string[], finish: string) {
  for (const text of parts) {
    yield { choices: [{ delta: { content: text }, finish_reason: null }] };
  }
  yield { choices: [{ delta: {}, finish_reason: finish }] };
}

/** The getAI() wrapping order, without pacing or request observation. */
function wrap(provider: AIInterface, extra: Record<string, unknown> = {}) {
  return createUsagePartsAI(createContinuingAI(provider, extra, provider));
}

function openAI(
  create: ReturnType<typeof vi.fn>,
  extra: Record<string, unknown> = {},
) {
  const events: PartedUsageEvent[] = [];
  const provider = new OpenAIProvider({
    apiKey: 'test',
    defaultModel: 'gpt-4o',
    onUsage: (event) => events.push(event as PartedUsageEvent),
    ...extra,
  });
  (provider as any).client = { chat: { completions: { create } } };
  return { ai: wrap(provider as AIInterface, extra), events };
}

async function collect(iterable: AsyncIterable<string>) {
  let out = '';
  for await (const chunk of iterable) out += chunk;
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usage parts on a continued reply', () => {
  it('names both parts of a two-part chat and marks the last on the response', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIReply(`one ${SEAM}`, 'length', [10, 5]))
      .mockResolvedValueOnce(openAIReply(`${SEAM} two`, 'stop', [20, 6]));
    const { ai, events } = openAI(create);

    const result = await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: true,
    });

    expect(events).toHaveLength(2);
    const call = events[0].part.call;
    expect(typeof call).toBe('string');
    expect(call.length).toBeGreaterThan(0);
    // A continued reply's events never carry `last`.
    expect(events.map((event) => event.part)).toEqual([
      { call, index: 0 },
      { call, index: 1 },
    ]);
    expect(result.usageParts).toEqual({
      call,
      parts: [
        {
          index: 0,
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        },
        {
          index: 1,
          last: true,
          usage: { promptTokens: 20, completionTokens: 6, totalTokens: 26 },
        },
      ],
      complete: true,
    });
    expect(result.usage).toEqual({
      promptTokens: 30,
      completionTokens: 11,
      totalTokens: 41,
    });
  });

  it('names both parts of a two-part stream, count-less, never marking the last', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIStream([`one ${SEAM}`], 'length'))
      .mockResolvedValueOnce(openAIStream([`${SEAM} two`], 'stop'));
    const { ai, events } = openAI(create);

    const text = await collect(
      ai.stream([{ role: 'user', content: 'go' }], { continueOnLength: true }),
    );

    expect(text).toBe(`one ${SEAM} two`);
    expect(events).toHaveLength(2);
    const call = events[0].part.call;
    expect(events.map((event) => event.part)).toEqual([
      { call, index: 0 },
      { call, index: 1 },
    ]);
    // OpenAI-compatible streams report no counts; the events still arrive.
    expect(events.every((event) => event.usage === undefined)).toBe(true);
  });

  it('reports usageParts as incomplete when a part has no counts', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIReply(`one ${SEAM}`, 'length', [10, 5]))
      .mockResolvedValueOnce(openAIReply(`${SEAM} two`, 'stop', null));
    const { ai, events } = openAI(create);

    const result = await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: true,
    });

    expect(events).toHaveLength(2);
    expect(events[1].usage).toBeUndefined();
    expect(events[1].part).toEqual({ call: events[0].part.call, index: 1 });
    expect(result.usageParts?.complete).toBe(false);
    expect(result.usageParts?.parts).toEqual([
      {
        index: 0,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      },
      { index: 1, last: true },
    ]);
    // usage is the sum of the parts that reported.
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
  });

  it('gives two requests with identical counts in the same millisecond different indexes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIReply(`one ${SEAM}`, 'length', [7, 7]))
      .mockResolvedValueOnce(openAIReply(`${SEAM} two`, 'stop', [7, 7]));
    const { ai, events } = openAI(create);

    await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: true,
    });

    expect(events).toHaveLength(2);
    const strip = ({ part: _part, timestamp: _t, ...rest }: PartedUsageEvent) =>
      rest;
    // Same provider, model, counts and duration: only the part tells them apart.
    expect(strip(events[0])).toEqual(strip(events[1]));
    expect(events[0].part.index).toBe(0);
    expect(events[1].part.index).toBe(1);
  });

  it('carries one call id through a continued complete()', async () => {
    const events: PartedUsageEvent[] = [];
    const provider = new OllamaProvider({
      type: 'ollama',
      defaultModel: 'llama3',
      onUsage: (event) => events.push(event as PartedUsageEvent),
    });
    (provider as any).requestJson = vi
      .fn()
      .mockResolvedValueOnce({
        model: 'llama3',
        message: { role: 'assistant', content: 'uno ' },
        done_reason: 'length',
        prompt_eval_count: 3,
        eval_count: 2,
      })
      .mockResolvedValueOnce({
        model: 'llama3',
        message: { role: 'assistant', content: 'dos' },
        done_reason: 'stop',
        prompt_eval_count: 4,
        eval_count: 1,
      });
    const ai = wrap(provider as AIInterface);

    const result = await ai.complete('go', { continueOnLength: true });

    expect(result.content).toBe('uno dos');
    const call = result.usageParts?.call;
    expect(events.map((event) => event.part)).toEqual([
      { call, index: 0 },
      { call, index: 1 },
    ]);
    expect(result.usageParts?.parts.map((part) => part.last)).toEqual([
      undefined,
      true,
    ]);
    expect(result.usageParts?.complete).toBe(true);
  });
});

describe('usage parts on a single request', () => {
  it('marks the only part last on the event and the response', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIReply('done', 'stop', [3, 4]));
    const { ai, events } = openAI(create);

    const result = await ai.chat([{ role: 'user', content: 'go' }]);

    expect(events).toHaveLength(1);
    const call = events[0].part.call;
    expect(events[0].part).toEqual({ call, index: 0, last: true });
    expect(result.usageParts).toEqual({
      call,
      parts: [
        {
          index: 0,
          last: true,
          usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 },
        },
      ],
      complete: true,
    });
  });

  it('still emits a count-less request, and the response says it is incomplete', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIReply('done', 'stop', null));
    const { ai, events } = openAI(create);

    const result = await ai.chat([{ role: 'user', content: 'go' }]);

    expect(events).toHaveLength(1);
    expect(events[0].usage).toBeUndefined();
    expect(events[0].part).toEqual({
      call: result.usageParts?.call,
      index: 0,
      last: true,
    });
    expect(result.usageParts).toEqual({
      call: events[0].part.call,
      parts: [{ index: 0, last: true }],
      complete: false,
    });
  });

  it('marks the last part when continuation is enabled but the call cannot continue', async () => {
    const create = vi.fn().mockResolvedValueOnce(openAIReply('{}', 'stop'));
    const { ai, events } = openAI(create);

    await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: true,
      responseFormat: { type: 'json_object' },
    });

    expect(events[0].part.last).toBe(true);
  });

  it('mints a new call id for every invocation, even with reused options', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(openAIReply('a', 'stop'))
      .mockResolvedValueOnce(openAIReply('b', 'stop'));
    const { ai, events } = openAI(create);
    const options = { usageTags: { feature: 'x' } };

    const first = await ai.chat([{ role: 'user', content: 'go' }], options);
    const second = await ai.chat([{ role: 'user', content: 'go' }], options);

    expect(events).toHaveLength(2);
    expect(events[0].part.call).not.toBe(events[1].part.call);
    expect(events.map((event) => event.part.index)).toEqual([0, 0]);
    expect(first.usageParts?.call).toBe(events[0].part.call);
    expect(second.usageParts?.call).toBe(events[1].part.call);
    // The caller's options object is not modified.
    expect(Object.getOwnPropertySymbols(options)).toEqual([]);
  });

  it('records parts when no onUsage callback is configured', async () => {
    const provider = new OpenAIProvider({ apiKey: 'test', defaultModel: 'm' });
    (provider as any).client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(openAIReply('ok', 'stop', [1, 1])),
        },
      },
    };
    const result = await wrap(provider as AIInterface).chat([
      { role: 'user', content: 'go' },
    ]);
    expect(result.usageParts?.complete).toBe(true);
    expect(result.usageParts?.parts).toHaveLength(1);
  });

  it('keeps the call id through describeImage(), message() and complete() delegating to chat()', async () => {
    const recorderCall = async (
      run: (options: Record<string, unknown>) => Promise<unknown>,
    ) => {
      const recorder = createUsagePartRecorder();
      await run(withUsagePartRecorder({}, recorder));
      return recorder.call;
    };
    const openAIEvents: PartedUsageEvent[] = [];
    const openai = new OpenAIProvider({
      apiKey: 'test',
      defaultModel: 'gpt-4o',
      onUsage: (event) => openAIEvents.push(event as PartedUsageEvent),
    });
    (openai as any).client = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue(openAIReply('ok', 'stop')),
        },
      },
    };
    const ollamaEvents: PartedUsageEvent[] = [];
    const ollama = new OllamaProvider({
      type: 'ollama',
      defaultModel: 'llama3',
      onUsage: (event) => ollamaEvents.push(event as PartedUsageEvent),
    });
    (ollama as any).requestJson = vi.fn().mockResolvedValue({
      model: 'llava',
      message: { role: 'assistant', content: 'ok' },
      done_reason: 'stop',
      prompt_eval_count: 1,
      eval_count: 1,
    });
    const image = Buffer.from('not really an image');

    const expected = [
      await recorderCall((o) => openai.describeImage(image, 'what', o)),
      await recorderCall((o) => openai.message('go', o)),
      await recorderCall((o) => openai.complete('go', o)),
    ];
    expect(openAIEvents.map((event) => event.part.call)).toEqual(expected);
    const ollamaExpected = [
      await recorderCall((o) => ollama.describeImage(image, 'what', o)),
      await recorderCall((o) => ollama.message('go', o)),
    ];
    expect(ollamaEvents.map((event) => event.part.call)).toEqual(
      ollamaExpected,
    );
  });

  it('keeps the call id through Anthropic complete() and message()', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      model: 'claude-test',
      stop_reason: 'end_turn',
      usage: { input_tokens: 2, output_tokens: 1 },
    });
    const events: PartedUsageEvent[] = [];
    const provider = new AnthropicProvider({
      type: 'anthropic',
      apiKey: 'test',
      defaultModel: 'claude-test',
      onUsage: (event) => events.push(event as PartedUsageEvent),
    });
    (provider as any).client = { messages: { create } };
    const ai = wrap(provider as AIInterface);

    const completed = await ai.complete('go');
    await ai.message('go');

    expect(events).toHaveLength(2);
    expect(events[0].part).toEqual({
      call: completed.usageParts?.call,
      index: 0,
      last: true,
    });
    expect(events[1].part).toMatchObject({ index: 0, last: true });
    expect(events[1].part.call).not.toBe(events[0].part.call);
  });

  it('marks an embedding request as its call’s only, last part', async () => {
    const create = vi.fn().mockResolvedValue({
      data: [{ embedding: [0.1, 0.2] }],
      model: 'text-embedding-3-small',
      usage: { prompt_tokens: 2, total_tokens: 2 },
    });
    const events: PartedUsageEvent[] = [];
    const provider = new OpenAIProvider({
      apiKey: 'test',
      onUsage: (event) => events.push(event as PartedUsageEvent),
    });
    (provider as any).client = { embeddings: { create } };
    await wrap(provider as AIInterface).embed('hello');
    expect(events).toHaveLength(1);
    expect(events[0].part).toMatchObject({ index: 0, last: true });
  });

  it('gives a directly constructed provider’s events a single, last part', async () => {
    const create = vi.fn().mockResolvedValue(openAIReply('ok', 'stop'));
    const events: PartedUsageEvent[] = [];
    const provider = new OpenAIProvider({
      apiKey: 'test',
      onUsage: (event) => events.push(event as PartedUsageEvent),
    });
    (provider as any).client = { chat: { completions: { create } } };
    await provider.chat([{ role: 'user', content: 'go' }]);
    await provider.chat([{ role: 'user', content: 'go' }]);
    expect(events[0].part).toMatchObject({ index: 0, last: true });
    expect(events[1].part).toMatchObject({ index: 0, last: true });
    expect(events[0].part.call).not.toBe(events[1].part.call);
  });
});

describe('Hugging Face stream', () => {
  it('reports its one request once', async () => {
    vi.useFakeTimers();
    try {
      const events: PartedUsageEvent[] = [];
      const provider = new HuggingFaceProvider({
        type: 'huggingface',
        apiToken: 'test',
        defaultModel: 'gpt2',
        onUsage: (event) => events.push(event as PartedUsageEvent),
      });
      (provider as any).makeRequest = vi
        .fn()
        .mockResolvedValue([{ generated_text: 'User: go\nshort reply' }]);
      const pending = collect(
        wrap(provider as AIInterface).stream([{ role: 'user', content: 'go' }]),
      );
      await vi.runAllTimersAsync();
      await pending;
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        operation: 'stream',
        part: { index: 0, last: true },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('usage event shape', () => {
  it('is deep-equal on every copy', async () => {
    const create = vi.fn().mockResolvedValue(openAIReply('ok', 'stop'));
    const { ai, events } = openAI(create, {
      usageTags: { app: 'test' },
    });
    await ai.chat([{ role: 'user', content: 'go' }], {
      usageTags: { feature: 'copy' },
    });
    const [event] = events;
    expect(structuredClone(event)).toEqual(event);
    expect(JSON.parse(JSON.stringify(event.part))).toEqual(event.part);
    expect(Object.getOwnPropertySymbols(event)).toEqual([]);
    expect(event.tags).toEqual({ app: 'test', feature: 'copy' });
  });

  it('sends no usage tag, sink or part recorder to the provider', async () => {
    const create = vi.fn().mockResolvedValue(openAIReply('ok', 'stop'));
    const { ai } = openAI(create, { usageTags: { app: 'global-tag-value' } });
    await ai.chat([{ role: 'user', content: 'go' }], {
      usageTags: { feature: 'call-tag-value' },
    });
    const [body, requestOptions] = create.mock.calls[0];
    const wire = JSON.stringify([body, requestOptions ?? {}]);
    expect(wire).not.toContain('global-tag-value');
    expect(wire).not.toContain('call-tag-value');
    expect(wire).not.toContain('usageTags');
    expect(wire).not.toContain('onUsage');
    expect(Object.getOwnPropertySymbols(body)).not.toContain(AI_USAGE_PARTS);
  });

  it('lets a producer build a UsageEvent without part', () => {
    const legacy: UsageEvent = {
      provider: 'host',
      model: 'm',
      operation: 'chat',
      duration: 1,
      timestamp: new Date(0),
    };
    expect(legacy.part).toBeUndefined();
  });
});

describe('getAI() clients', () => {
  let server: Server;
  let baseUrl: string;
  let replies: Array<Record<string, unknown>>;
  const bodies: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => {
        raw += chunk;
      });
      req.on('end', () => {
        bodies.push(raw);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(replies.shift()));
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no port');
    baseUrl = `http://127.0.0.1:${address.port}/v1`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('declare usageFeatures.parts', async () => {
    const ai = await getAI({ type: 'openai', apiKey: 'test', baseUrl });
    expect(ai.usageFeatures).toEqual({ parts: true });
    expect(Object.isFrozen(ai.usageFeatures)).toBe(true);
    expect('usageFeatures' in ai).toBe(true);
    const observed = await getAI({
      type: 'openai',
      apiKey: 'test',
      baseUrl,
      onRequest: () => {},
    });
    expect(observed.usageFeatures?.parts).toBe(true);
  });

  it('name every part of a continued chat end to end', async () => {
    replies = [
      { id: 'a', ...openAIReply(`one ${SEAM}`, 'length', [10, 5]) },
      { id: 'b', ...openAIReply(`${SEAM} two`, 'stop', [20, 6]) },
    ];
    bodies.length = 0;
    const events: PartedUsageEvent[] = [];
    const ai = await getAI({
      type: 'openai',
      apiKey: 'test',
      baseUrl,
      maxRetries: 0,
      usageTags: { app: 'tag-value-global' },
      onUsage: (event) => events.push(event as PartedUsageEvent),
      onRequest: () => {},
    });

    const result = await ai.chat([{ role: 'user', content: 'go' }], {
      continueOnLength: true,
      usageTags: { feature: 'tag-value-call' },
    });

    expect(result.content).toBe(`one ${SEAM} two`);
    const call = result.usageParts?.call;
    expect(events.map((event) => event.part)).toEqual([
      { call, index: 0 },
      { call, index: 1 },
    ]);
    expect(result.usageParts?.complete).toBe(true);
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body).not.toContain('tag-value');
      expect(body).not.toContain('onUsage');
    }
  });
});
