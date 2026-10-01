import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStreamingClientSecret,
  resolveClientSecretUrl,
  SpeechConfigurationError,
  SpeechProviderError,
} from '../index.js';

interface Call {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

function mockFetch(
  response: () => Response = () =>
    Response.json({
      value: 'ek_minted',
      expires_at: 1_790_000_060,
      session: { type: 'transcription', id: 'sess_1' },
    }),
) {
  const calls: Call[] = [];
  const fetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        init: init ?? {},
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return response();
    },
  );
  return { fetch, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createStreamingClientSecret (openai-realtime)', () => {
  it('mints a 60-second transcription client secret and echoes tenant attribution', async () => {
    const { fetch, calls } = mockFetch();
    const result = await createStreamingClientSecret(
      {
        apiKey: 'sk-server-key',
        tenantId: 'tenant-42',
        sessionId: 'dictation-7',
        metadata: { plan: 'pro' },
        language: 'en',
        headers: { 'x-bf-vk': 'vk-tenant-42' },
        fetch,
      },
      { env: {} },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      'https://api.openai.com/v1/realtime/client_secrets',
    );
    const headers = new Headers(calls[0].init.headers);
    expect(calls[0].init.method).toBe('POST');
    expect(headers.get('authorization')).toBe('Bearer sk-server-key');
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-bf-vk')).toBe('vk-tenant-42');
    expect(calls[0].body).toEqual({
      expires_after: { anchor: 'created_at', seconds: 60 },
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: { model: 'gpt-4o-transcribe', language: 'en' },
            turn_detection: { type: 'server_vad' },
          },
        },
      },
    });
    // Attribution stays on your server; nothing tenant-specific is sent.
    expect(JSON.stringify(calls[0].body)).not.toContain('tenant-42');

    expect(result).toEqual({
      type: 'openai-realtime',
      value: 'ek_minted',
      expiresAt: 1_790_000_060_000,
      ttlSeconds: 60,
      model: 'gpt-4o-transcribe',
      tenantId: 'tenant-42',
      sessionId: 'dictation-7',
      metadata: { plan: 'pro' },
      session: { type: 'transcription', id: 'sess_1' },
    });
  });

  it('reads HAVE_SPEECH_STREAMING_* and honours ttlSeconds and session options', async () => {
    const { fetch, calls } = mockFetch();
    await createStreamingClientSecret(
      {
        ttlSeconds: 300,
        turnDetection: { type: 'manual' },
        noiseReduction: 'far_field',
        transcriptionOptions: { delay: 'low' },
        fetch,
      },
      {
        env: {
          HAVE_SPEECH_STREAMING_BASE_URL:
            'wss://gateway.example/openai/v1/realtime?intent=transcription',
          HAVE_SPEECH_STREAMING_API_KEY: 'sk-env-key',
          HAVE_SPEECH_STREAMING_MODEL: 'gpt-live-transcribe',
          HAVE_SPEECH_STREAMING_HEADERS: '{"x-bf-vk":"vk-env"}',
        },
      },
    );

    expect(calls[0].url).toBe(
      'https://gateway.example/openai/v1/realtime/client_secrets',
    );
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get('authorization')).toBe('Bearer sk-env-key');
    expect(headers.get('x-bf-vk')).toBe('vk-env');
    expect(calls[0].body).toEqual({
      expires_after: { anchor: 'created_at', seconds: 300 },
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            transcription: { model: 'gpt-live-transcribe', delay: 'low' },
            turn_detection: null,
            noise_reduction: { type: 'far_field' },
          },
        },
      },
    });
  });

  it('resolves the endpoint from any accepted realtime base', () => {
    expect(resolveClientSecretUrl('https://api.openai.com')).toBe(
      'https://api.openai.com/v1/realtime/client_secrets',
    );
    expect(resolveClientSecretUrl('wss://api.openai.com/v1/realtime')).toBe(
      'https://api.openai.com/v1/realtime/client_secrets',
    );
    expect(resolveClientSecretUrl('http://gateway/stt/v1/')).toBe(
      'http://gateway/stt/v1/realtime/client_secrets',
    );
    expect(
      resolveClientSecretUrl('https://gateway/v1/realtime/client_secrets'),
    ).toBe('https://gateway/v1/realtime/client_secrets');
  });

  it('rejects out-of-range TTLs and a missing API key before any request', async () => {
    const { fetch } = mockFetch();
    for (const ttlSeconds of [5, 7201, 1.5]) {
      await expect(
        createStreamingClientSecret(
          { apiKey: 'sk', ttlSeconds, fetch },
          { env: {} },
        ),
      ).rejects.toThrow(/ttlSeconds must be an integer from 10 to 7200/);
    }
    await expect(
      createStreamingClientSecret({ fetch }, { env: {} }),
    ).rejects.toThrow(/requires apiKey/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('surfaces provider failures with the server key redacted', async () => {
    const { fetch } = mockFetch(
      () =>
        new Response('{"error":{"message":"bad key sk-server-key"}}', {
          status: 401,
        }),
    );
    const error = await createStreamingClientSecret(
      { apiKey: 'sk-server-key', fetch },
      { env: {} },
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SpeechProviderError);
    expect((error as SpeechProviderError).status).toBe(401);
    expect((error as SpeechProviderError).responseBody).toBe(
      '{"error":{"message":"bad key [REDACTED]"}}',
    );

    const { fetch: noValue } = mockFetch(() => Response.json({}));
    await expect(
      createStreamingClientSecret(
        { apiKey: 'sk', fetch: noValue },
        { env: {} },
      ),
    ).rejects.toThrow(/did not include a value/);
  });
});

describe('createStreamingClientSecret refusals', () => {
  it('refuses voxtral-realtime: vLLM has no ephemeral tokens', async () => {
    const { fetch } = mockFetch();
    const error = await createStreamingClientSecret(
      { type: 'voxtral-realtime', apiKey: 'vllm-key', fetch },
      { env: {} },
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SpeechConfigurationError);
    expect((error as Error).message).toMatch(/no ephemeral-token mechanism/);
    expect((error as Error).message).not.toContain('vllm-key');

    await expect(
      createStreamingClientSecret(
        { fetch },
        {
          env: {
            HAVE_SPEECH_STREAMING_TYPE: 'voxtral-realtime',
            HAVE_SPEECH_STREAMING_API_KEY: 'vllm-key',
          },
        },
      ),
    ).rejects.toThrow(SpeechConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses to run in a browser', async () => {
    vi.stubGlobal('process', undefined);
    vi.stubGlobal('document', {});
    const { fetch } = mockFetch();
    await expect(
      createStreamingClientSecret({ apiKey: 'sk', fetch }, { env: {} }),
    ).rejects.toThrow(/runs on your server/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects unknown adapter types', async () => {
    await expect(
      createStreamingClientSecret(
        { type: 'nope' as never, apiKey: 'sk' },
        { env: {} },
      ),
    ).rejects.toThrow(/nope/);
  });
});
