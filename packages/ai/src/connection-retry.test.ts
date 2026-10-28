/**
 * One-shot stale keep-alive retry for the OpenAI-compatible providers
 * (#1467), exercised against a local HTTP server that kills connections.
 */
import { createServer, type Server, type ServerResponse } from 'node:http';
import OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAI } from './index';
import { isStaleConnectionError } from './shared/providers/connection-retry';
import type { AIRequestEvent } from './shared/types';

type Behavior =
  | 'reset' // destroy the socket before any response bytes
  | 'ok' // normal success
  | 'reset-before-chunk' // stream: headers sent, then destroy before any data
  | 'reset-after-chunk' // stream: one content chunk, then destroy
  | 'hang' // never answer (abort test)
  | 'status-503';

const chunk = (content: string) =>
  `data: ${JSON.stringify({ id: 'local', model: 'm', choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`;

describe('stale-connection retry (OpenAI-compatible providers)', () => {
  let server: Server;
  let baseUrl: string;
  let plan: Behavior[];
  let hits: number;

  function respond(behavior: Behavior, stream: boolean, res: ServerResponse) {
    switch (behavior) {
      case 'reset':
        res.socket?.destroy();
        return;
      case 'hang':
        return;
      case 'status-503':
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'overloaded' } }));
        return;
      case 'reset-before-chunk':
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.flushHeaders();
        setTimeout(() => res.socket?.destroy(), 20);
        return;
      case 'reset-after-chunk':
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(chunk('partial'));
        setTimeout(() => res.socket?.destroy(), 20);
        return;
      case 'ok':
        if (stream) {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.end(
            `${chunk('ok')}data: ${JSON.stringify({ id: 'local', model: 'm', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
          );
        } else {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              id: 'local',
              model: 'm',
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: 'ok' },
                  finish_reason: 'stop',
                },
              ],
            }),
          );
        }
    }
  }

  beforeEach(async () => {
    plan = [];
    hits = 0;
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const part of req) chunks.push(Buffer.from(part));
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      hits += 1;
      respond(plan.shift() ?? 'ok', Boolean(body.stream), res);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected local TCP server');
    baseUrl = `http://127.0.0.1:${address.port}/v1`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  async function client(
    type: 'openai' | 'litellm' | 'bifrost' = 'openai',
    extra: { retryConnectionErrors?: boolean } = {},
  ) {
    const events: AIRequestEvent[] = [];
    const ai = await getAI({
      type,
      apiKey: 'local-fixture',
      baseUrl,
      defaultModel: 'gpt-4o-mini',
      onRequest: (event) => events.push(event),
      ...extra,
    });
    return { ai, events };
  }

  const messages = [{ role: 'user' as const, content: 'hello' }];
  const callOptions = { model: 'gpt-4o-mini', continueOnLength: false };

  async function collect(iterable: AsyncIterable<string>) {
    let text = '';
    for await (const part of iterable) text += part;
    return text;
  }

  for (const type of ['openai', 'litellm', 'bifrost'] as const) {
    it(`${type} chat succeeds after a pre-response reset and records attempts`, async () => {
      plan = ['reset', 'ok'];
      const { ai, events } = await client(type);
      const response = await ai.chat(messages, callOptions);
      expect(response.content).toBe('ok');
      expect(hits).toBe(2);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ status: 'succeeded', attempts: 2 });
    });

    it(`${type} stream succeeds after a reset before the first chunk`, async () => {
      plan = ['reset-before-chunk', 'ok'];
      const { ai, events } = await client(type);
      expect(await collect(ai.stream(messages, callOptions))).toBe('ok');
      expect(hits).toBe(2);
      expect(events[0]).toMatchObject({ status: 'succeeded', attempts: 2 });
    });
  }

  it('stream retries a reset before any response bytes', async () => {
    plan = ['reset', 'ok'];
    const { ai, events } = await client();
    expect(await collect(ai.stream(messages, callOptions))).toBe('ok');
    expect(hits).toBe(2);
    expect(events[0]).toMatchObject({ attempts: 2 });
  });

  it('reports one attempt when no retry happens', async () => {
    plan = ['ok'];
    const { ai, events } = await client();
    await ai.chat(messages, callOptions);
    expect(hits).toBe(1);
    expect(events[0]).toMatchObject({ status: 'succeeded', attempts: 1 });
  });

  it('does not retry a stream that already yielded a chunk', async () => {
    plan = ['reset-after-chunk', 'ok'];
    const { ai, events } = await client();
    const seen: string[] = [];
    await expect(
      (async () => {
        for await (const part of ai.stream(messages, callOptions))
          seen.push(part);
      })(),
    ).rejects.toThrow();
    expect(seen).toEqual(['partial']);
    expect(hits).toBe(1);
    expect(events[0]).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('does not retry after a caller abort', async () => {
    plan = ['hang', 'ok'];
    const { ai, events } = await client();
    const controller = new AbortController();
    const pending = ai.chat(messages, {
      ...callOptions,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 50);
    await expect(pending).rejects.toMatchObject({ code: 'AI_ABORTED' });
    expect(hits).toBe(1);
    expect(events[0]).toMatchObject({ status: 'aborted', attempts: 1 });
  });

  it('does not retry after a timeout', async () => {
    plan = ['hang', 'ok'];
    const { ai } = await client();
    await expect(
      ai.chat(messages, { ...callOptions, timeout: 100 }),
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
    expect(hits).toBe(1);
  });

  it('does not retry an HTTP 5xx response', async () => {
    plan = ['status-503', 'ok'];
    const { ai, events } = await client();
    await expect(ai.chat(messages, callOptions)).rejects.toMatchObject({
      code: 'API_ERROR',
    });
    expect(hits).toBe(1);
    expect(events[0]).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('surfaces the connection error when the retry also fails', async () => {
    plan = ['reset', 'reset', 'ok'];
    const { ai, events } = await client();
    await expect(ai.chat(messages, callOptions)).rejects.toMatchObject({
      message: 'Connection error.',
      code: 'API_ERROR',
    });
    expect(hits).toBe(2);
    expect(events[0]).toMatchObject({ status: 'failed', attempts: 2 });
  });

  it('honours retryConnectionErrors: false', async () => {
    plan = ['reset', 'ok'];
    const { ai, events } = await client('openai', {
      retryConnectionErrors: false,
    });
    await expect(ai.chat(messages, callOptions)).rejects.toMatchObject({
      message: 'Connection error.',
    });
    expect(hits).toBe(1);
    expect(events[0]).toMatchObject({ status: 'failed', attempts: 1 });

    plan = ['reset-before-chunk', 'ok'];
    hits = 0;
    await expect(collect(ai.stream(messages, callOptions))).rejects.toThrow();
    expect(hits).toBe(1);
  });
});

describe('isStaleConnectionError', () => {
  const coded = (code: string) => Object.assign(new Error('x'), { code });

  it('matches stale-socket shapes anywhere on the cause chain', () => {
    expect(
      isStaleConnectionError(
        new OpenAI.APIConnectionError({ cause: new Error('fetch failed') }),
      ),
    ).toBe(true);
    for (const code of ['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET']) {
      expect(
        isStaleConnectionError(
          new TypeError('terminated', { cause: coded(code) }),
        ),
      ).toBe(true);
    }
    expect(isStaleConnectionError(new Error('socket hang up'))).toBe(true);
  });

  it('rejects timeouts, aborts, HTTP statuses and unrelated errors', () => {
    expect(isStaleConnectionError(new OpenAI.APIConnectionTimeoutError())).toBe(
      false,
    );
    expect(isStaleConnectionError(new OpenAI.APIUserAbortError())).toBe(false);
    expect(
      isStaleConnectionError(
        new OpenAI.InternalServerError(503, undefined, 'x', new Headers()),
      ),
    ).toBe(false);
    expect(
      isStaleConnectionError(
        Object.assign(new Error('aborted'), {
          name: 'AbortError',
          cause: coded('ECONNRESET'),
        }),
      ),
    ).toBe(false);
    expect(isStaleConnectionError(coded('ENOTFOUND'))).toBe(false);
    expect(isStaleConnectionError(new Error('boom'))).toBe(false);
  });
});
