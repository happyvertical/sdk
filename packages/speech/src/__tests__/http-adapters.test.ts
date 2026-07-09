import { Buffer } from 'node:buffer';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getAvailableSpeechAdapters,
  getSpeech,
  getSpeechSynthesizer,
  getTranscriber,
  type SpeechProviderError,
} from '../index.js';

type FixtureHandler = (
  req: IncomingMessage,
  body: Buffer,
  res: ServerResponse,
) => void | Promise<void>;

const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

async function withFixtureServer<T>(
  handler: FixtureHandler,
  run: (baseUrl: string) => Promise<T>,
): Promise<T> {
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', async () => {
      try {
        await handler(req, Buffer.concat(chunks), res);
      } catch (error) {
        res.statusCode = 500;
        res.end(error instanceof Error ? error.stack : String(error));
      }
    });
  });
  servers.push(server);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Fixture server did not expose a TCP address');
  }

  return run(`http://127.0.0.1:${address.port}`);
}

describe('@happyvertical/speech HTTP adapters', () => {
  it('reports adapter availability by capability', () => {
    expect(getAvailableSpeechAdapters()).toEqual({
      transcribers: ['studio-server'],
      synthesizers: ['studio-server', 'qwen3-tts', 'openai-compatible'],
    });
  });

  it('returns an injectable speech service that fails clearly when no provider is configured', async () => {
    const speech = await getSpeech(
      {},
      {
        env: {},
      },
    );

    await expect(
      speech.transcribe({
        audio: {
          data: new Uint8Array([1]),
        },
      }),
    ).rejects.toThrow('No STT provider configured');
    await expect(
      speech.synthesize({
        text: 'hello',
      }),
    ).rejects.toThrow('No TTS provider configured');
  });

  it('rejects invalid adapter types and empty required env values', async () => {
    await expect(
      getTranscriber({
        type: 'qwen3-tts',
        baseUrl: 'http://speech.example',
      } as never),
    ).rejects.toThrow('Invalid STT speech adapter type: qwen3-tts');

    await expect(
      getSpeech(
        {},
        {
          env: Object.fromEntries([
            ['TTS_ADAPTER', 'qwen3-tts'],
            ['TTS_BASE_URL', ''],
          ]),
        },
      ),
    ).rejects.toThrow('TTS baseUrl is required');

    await expect(
      getSpeech(
        {},
        {
          env: Object.fromEntries([['TTS_BASE_URL', 'http://speech.example']]),
        },
      ),
    ).rejects.toThrow('TTS provider type is required');
  });

  it('posts Studio Server STT audio to /v1/transcribe as multipart form data', async () => {
    await withFixtureServer(
      (req, body, res) => {
        expect(req.method).toBe('POST');
        expect(req.url).toBe('/v1/transcribe');
        expect(req.headers['content-type']).toContain('multipart/form-data');

        const multipart = body.toString('utf8');
        expect(multipart).toContain('name="file"; filename="fixture.wav"');
        expect(multipart).toContain('Content-Type: audio/wav');
        expect(req.headers.authorization).toBe('Bearer test-token');
        expect(multipart).toContain('name="language"');
        expect(multipart).toContain('en');
        expect(multipart).toContain('name="sample_rate"');
        expect(multipart).toContain('16000');

        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            text: 'hello from studio',
            language: 'en',
            words: [{ word: 'hello', start: 0, end: 0.4 }],
          }),
        );
      },
      async (baseUrl) => {
        const transcriber = await getTranscriber({
          type: 'studio-server',
          baseUrl,
          apiKey: 'test-token',
        });
        const result = await transcriber.transcribe({
          audio: {
            data: new Uint8Array([1, 2, 3, 4]),
            contentType: 'audio/wav',
            filename: 'fixture.wav',
            sampleRate: 16000,
          },
          language: 'en',
        });

        expect(result.text).toBe('hello from studio');
        expect(result.words).toEqual([
          { word: 'hello', startSeconds: 0, endSeconds: 0.4 },
        ]);
      },
    );
  });

  it('uses explicit contentType for Blob audio inputs', async () => {
    await withFixtureServer(
      (req, body, res) => {
        expect(req.method).toBe('POST');
        expect(req.url).toBe('/v1/transcribe');

        const multipart = body.toString('utf8');
        expect(multipart).toContain('Content-Type: audio/custom');

        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ text: 'blob ok' }));
      },
      async (baseUrl) => {
        const transcriber = await getTranscriber({
          type: 'studio-server',
          baseUrl,
        });
        const result = await transcriber.transcribe({
          audio: {
            data: new Blob(['blob audio']),
            contentType: 'audio/custom',
            filename: 'fixture.audio',
          },
        });

        expect(result.text).toBe('blob ok');
      },
    );
  });

  it('posts Studio Server TTS to /v1/tts/synthesize with Studio-shaped JSON', async () => {
    await withFixtureServer(
      (req, body, res) => {
        expect(req.method).toBe('POST');
        expect(req.url).toBe('/v1/tts/synthesize');
        expect(req.headers['content-type']).toContain('application/json');

        const payload = JSON.parse(body.toString('utf8')) as Record<
          string,
          unknown
        >;
        expect(payload).toMatchObject(
          Object.fromEntries([
            ['text', 'Speak through Studio Server.'],
            ['voice', 'narrator'],
            ['format', 'wav'],
            ['sample_rate', 24000],
            ['speed', 1.1],
          ]),
        );
        expect(payload).not.toHaveProperty('input');
        expect(payload).not.toHaveProperty('response_format');

        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            audio: Buffer.from('studio-audio').toString('base64'),
            contentType: 'audio/wav',
            sampleRate: 24000,
            wordTimings: [{ word: 'Speak', start: 0, end: 0.25 }],
          }),
        );
      },
      async (baseUrl) => {
        const synthesizer = await getSpeechSynthesizer({
          type: 'studio-server',
          baseUrl,
        });
        const result = await synthesizer.synthesize({
          text: 'Speak through Studio Server.',
          voice: 'narrator',
          outputFormat: 'wav',
          sampleRate: 24000,
          speed: 1.1,
        });

        expect(Buffer.from(result.audio).toString('utf8')).toBe('studio-audio');
        expect(result.contentType).toBe('audio/wav');
        expect(result.sampleRate).toBe(24000);
        expect(result.words).toEqual([
          { word: 'Speak', startSeconds: 0, endSeconds: 0.25 },
        ]);
      },
    );
  });

  it('configures Qwen3 TTS through env and posts OpenAI-shaped JSON to /v1/audio/speech', async () => {
    await withFixtureServer(
      (req, body, res) => {
        expect(req.method).toBe('POST');
        expect(req.url).toBe('/v1/audio/speech');
        expect(req.headers['content-type']).toContain('application/json');

        const payload = JSON.parse(body.toString('utf8')) as Record<
          string,
          unknown
        >;
        expect(payload).toEqual(
          Object.fromEntries([
            ['model', 'qwen3-tts'],
            ['input', 'Speak through Qwen.'],
            ['voice', 'default'],
            ['response_format', 'mp3'],
          ]),
        );

        res.setHeader('content-type', 'audio/mpeg');
        res.end(Buffer.from('qwen-audio'));
      },
      async (baseUrl) => {
        const speech = await getSpeech(
          {},
          {
            env: Object.fromEntries([
              ['TTS_ADAPTER', 'qwen3-tts'],
              ['TTS_BASE_URL', baseUrl],
            ]),
          },
        );
        const result = await speech.synthesize({
          text: 'Speak through Qwen.',
          outputFormat: 'mp3',
        });

        expect(Buffer.from(result.audio).toString('utf8')).toBe('qwen-audio');
        expect(result.contentType).toBe('audio/mpeg');
        expect(result.provider).toBe('qwen3-tts');
        expect(result.model).toBe('qwen3-tts');
      },
    );
  });

  it('posts OpenAI-compatible TTS with defaults and custom path', async () => {
    await withFixtureServer(
      (req, body, res) => {
        expect(req.method).toBe('POST');
        expect(req.url).toBe('/custom/audio');

        const payload = JSON.parse(body.toString('utf8')) as Record<
          string,
          unknown
        >;
        expect(payload).toEqual(
          Object.fromEntries([
            ['model', 'tts-1'],
            ['input', 'Use defaults.'],
            ['voice', 'alloy'],
            ['response_format', 'opus'],
          ]),
        );

        res.setHeader('content-type', 'audio/ogg');
        res.end(Buffer.from('openai-compatible-audio'));
      },
      async (baseUrl) => {
        const synthesizer = await getSpeechSynthesizer({
          type: 'openai-compatible',
          baseUrl,
          speechPath: '/custom/audio',
        });
        const result = await synthesizer.synthesize({
          text: 'Use defaults.',
          outputFormat: 'opus',
        });

        expect(Buffer.from(result.audio).toString('utf8')).toBe(
          'openai-compatible-audio',
        );
        expect(result.format).toBe('ogg');
        expect(result.model).toBe('tts-1');
      },
    );
  });

  it('wraps provider HTTP errors with status and response body', async () => {
    await withFixtureServer(
      (_req, _body, res) => {
        res.statusCode = 503;
        res.end('provider unavailable');
      },
      async (baseUrl) => {
        const synthesizer = await getSpeechSynthesizer({
          type: 'qwen3-tts',
          baseUrl,
        });

        await expect(
          synthesizer.synthesize({
            text: 'fail',
          }),
        ).rejects.toMatchObject({
          name: 'SpeechProviderError',
          status: 503,
          responseBody: 'provider unavailable',
        } satisfies Partial<SpeechProviderError>);
      },
    );
  });

  it('rejects JSON TTS responses without audio content', async () => {
    await withFixtureServer(
      (_req, _body, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ contentType: 'audio/wav' }));
      },
      async (baseUrl) => {
        const synthesizer = await getSpeechSynthesizer({
          type: 'studio-server',
          baseUrl,
        });

        await expect(
          synthesizer.synthesize({
            text: 'missing audio',
          }),
        ).rejects.toThrow(
          'studio-server JSON speech response did not include base64 audio',
        );
      },
    );
  });

  it('honors caller abort signals when timeoutMs also creates an adapter signal', async () => {
    const controller = new AbortController();
    const transcriber = await getTranscriber({
      type: 'studio-server',
      baseUrl: 'http://speech.example',
      timeoutMs: 1000,
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const fallback = setTimeout(
            () => reject(new Error('caller signal was not composed')),
            25,
          );
          const signal = init?.signal;
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(fallback);
              reject(signal.reason);
            },
            { once: true },
          );
        }),
    });

    const request = transcriber.transcribe({
      audio: {
        data: new Uint8Array([1]),
      },
      signal: controller.signal,
    });
    controller.abort(new DOMException('caller abort', 'AbortError'));

    await expect(request).rejects.toMatchObject({
      name: 'AbortError',
      message: 'caller abort',
    });
  });

  it('aborts requests when timeoutMs elapses', async () => {
    const transcriber = await getTranscriber({
      type: 'studio-server',
      baseUrl: 'http://speech.example',
      timeoutMs: 1,
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const fallback = setTimeout(
            () => reject(new Error('timeout signal was not fired')),
            50,
          );
          const signal = init?.signal;
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(fallback);
              reject(new Error('request timeout signal fired'));
            },
            { once: true },
          );
        }),
    });

    await expect(
      transcriber.transcribe({
        audio: {
          data: new Uint8Array([1]),
        },
      }),
    ).rejects.toThrow('request timeout signal fired');
  });
});
