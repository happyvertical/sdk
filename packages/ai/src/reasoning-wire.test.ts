import { createServer, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAI } from './index';
import type { AIReasoningOptions } from './shared/types';

describe('explicit reasoning on the public HTTP boundary', () => {
  let server: Server;
  let baseUrl: string;
  let requests: Record<string, unknown>[];
  let reject = false;
  let protocol: 'openai' | 'litellm' | 'bifrost' = 'openai';
  beforeEach(async () => {
    requests = [];
    reject = false;
    server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString());
      requests.push(body);
      // LiteLLM's documented /chat/completions protocol uses top-level
      // reasoning_effort; nested reasoning belongs to Responses/Bifrost.
      // https://docs.litellm.ai/blog/gpt_6_sol_luna
      if (
        protocol === 'litellm' &&
        (request.url !== '/v1/chat/completions' || 'reasoning' in body)
      ) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: {
              message: 'unsupported chat parameter: reasoning',
              type: 'invalid_request_error',
            },
          }),
        );
      } else if (reject) {
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
    protocol = type;
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
        if (type !== 'bifrost') expect(body.reasoning_effort).toBe('none');
        else expect(body.reasoning).toMatchObject({ effort: 'none' });
      });
      for (const effort of ['none', 'low'] as const) {
        it(`${type} ${stream ? 'stream' : 'chat'} preserves ${effort} without a token cap`, async () => {
          const body = await send(type, stream, { effort });
          if (type !== 'bifrost') {
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
  it('bifrost preserves an explicit reasoning cap and thoughts flag', async () => {
    expect(
      (
        await send('bifrost', false, {
          effort: 'low',
          maxTokens: 32,
          includeThoughts: true,
        })
      ).reasoning,
    ).toEqual({ effort: 'low', max_tokens: 32, include_thoughts: true });
  });
  for (const stream of [false, true]) {
    it.each([
      { maxTokens: 32 },
      { maxTokens: 0 },
      { includeThoughts: true },
      { includeThoughts: false },
    ])(`litellm ${stream ? 'stream' : 'chat'} rejects unsupported controls before transport: %j`, async (reasoning) => {
      await expect(
        send('litellm', stream, { effort: 'none', ...reasoning }),
      ).rejects.toThrow('LiteLLM Chat Completions does not support');
      expect(requests).toHaveLength(0);
    });
  }
  it('litellm rejects legacy explicit thoughts before model discovery or transport', async () => {
    protocol = 'litellm';
    const ai = await getAI({
      type: 'litellm',
      apiKey: 'local-fixture',
      baseUrl,
    });
    await expect(
      ai.chat([{ role: 'user', content: 'hello' }], { includeThoughts: true }),
    ).rejects.toThrow('LiteLLM Chat Completions does not support');
    expect(requests).toHaveLength(0);
  });
  it.each([
    undefined,
    { effort: 'none' as const },
  ])('litellm image descriptions preserve original optional reasoning: %j', async (reasoning) => {
    protocol = 'litellm';
    const ai = await getAI({
      type: 'litellm',
      apiKey: 'local-fixture',
      baseUrl,
      defaultModel: 'gpt-6-luna',
    });
    const image = 'data:image/png;base64,iVBORw0KGgo=';
    expect(await ai.describeImage(image, 'describe', { reasoning })).toBe('ok');
    expect(requests[0]).not.toHaveProperty('reasoning');
    if (reasoning) expect(requests[0].reasoning_effort).toBe('none');
    else expect(requests[0]).not.toHaveProperty('reasoning_effort');
    await expect(
      ai.describeImage(image, 'describe', { reasoning: { maxTokens: 32 } }),
    ).rejects.toThrow('LiteLLM Chat Completions does not support');
    expect(requests).toHaveLength(1);
  });
  it('surfaces upstream effort rejection without retry', async () => {
    reject = true;
    await expect(send('openai', false, { effort: 'none' })).rejects.toThrow(
      'unsupported reasoning effort',
    );
    expect(requests).toHaveLength(1);
  });
});
