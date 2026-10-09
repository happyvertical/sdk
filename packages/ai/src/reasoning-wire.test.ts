import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAI } from './index';
import type { AIReasoningOptions } from './shared/types';

describe('explicit reasoning on the public HTTP boundary', () => {
  let server: Server;
  let baseUrl: string;
  let requests: Record<string, unknown>[];
  let reject = false;
  beforeEach(async () => {
    requests = [];
    reject = false;
    server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push(body);
      if (reject) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: {
              message: 'unsupported reasoning effort',
              type: 'invalid_request_error',
            },
          }),
        );
      } else if (body.stream) {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end(
          `data: ${JSON.stringify({ id: 'local', model: body.model, choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
        );
      } else {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            id: 'local',
            model: body.model,
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
    await new Promise<void>((resolve, rejectClose) =>
      server.close((error) => (error ? rejectClose(error) : resolve())),
    );
  });
  async function send(
    type: 'openai' | 'litellm' | 'bifrost',
    stream: boolean,
    reasoning?: AIReasoningOptions,
    model = 'gpt-5-mini',
  ) {
    const ai = await getAI({
      type,
      apiKey: 'local-fixture',
      baseUrl,
      defaultModel: model,
      maxRetries: 0,
      generationLimits: { maxReasoningTokens: 8192 },
    });
    const messages = [{ role: 'user' as const, content: 'hello' }];
    const options = {
      model,
      reasoning,
      temperature: 0.1,
      maxTokens: 128,
      continueOnLength: false,
    };
    if (stream) {
      let content = '';
      for await (const chunk of ai.stream(messages, options)) content += chunk;
      expect(content).toBe('ok');
    } else expect((await ai.chat(messages, options)).content).toBe('ok');
    return requests.at(-1)!;
  }
  for (const stream of [false, true]) {
    for (const type of ['openai', 'litellm', 'bifrost'] as const) {
      it(`${type} ${stream ? 'stream' : 'chat'} combines Luna token and explicit-none shaping`, async () => {
        const body = await send(type, stream, { effort: 'none' }, 'gpt-6-luna');
        expect(body.model).toBe('gpt-6-luna');
        expect(body.max_completion_tokens).toBe(128);
        expect(body).not.toHaveProperty('max_tokens');
        expect(body).not.toHaveProperty('temperature');
        if (type === 'openai') expect(body.reasoning_effort).toBe('none');
        else expect(body.reasoning).toMatchObject({ effort: 'none' });
      });
      for (const effort of ['none', 'low'] as const) {
        it(`${type} ${stream ? 'stream' : 'chat'} preserves ${effort} without a token cap`, async () => {
          const body = await send(type, stream, { effort });
          if (type === 'openai') {
            expect(body.reasoning_effort).toBe(effort);
            expect(body).not.toHaveProperty('reasoning');
          } else {
            expect(body.reasoning).toMatchObject({ effort });
            expect(body).not.toHaveProperty('reasoning_effort');
          }
          expect(body.max_completion_tokens).toBe(128);
          expect(body).not.toHaveProperty('max_tokens');
        });
      }
      it(`${type} ${stream ? 'stream' : 'chat'} leaves reasoning absent by default`, async () => {
        const body = await send(type, stream);
        expect(body).not.toHaveProperty('reasoning');
        expect(body).not.toHaveProperty('reasoning_effort');
      });
    }
  }
  it.each([
    'litellm',
    'bifrost',
  ] as const)('%s preserves an explicit reasoning cap and thoughts flag', async (type) => {
    expect(
      (
        await send(type, false, {
          effort: 'low',
          maxTokens: 32,
          includeThoughts: true,
        })
      ).reasoning,
    ).toEqual({ effort: 'low', max_tokens: 32, include_thoughts: true });
  });
  it('surfaces upstream effort rejection without retry', async () => {
    reject = true;
    await expect(send('openai', false, { effort: 'none' })).rejects.toThrow(
      'unsupported reasoning effort',
    );
    expect(requests).toHaveLength(1);
  });
});
