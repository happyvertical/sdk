/**
 * Tests for the async video-generation job abstraction (issue #1181):
 * handle serialization round-trip and resume, cancellation (best-effort),
 * NOT_IMPLEMENTED throws on providers without video support, per-provider
 * status mapping, reference-image submission, rate-limit behavior on
 * submit, onRequest lifecycle events, and getAIAuto precedence.
 */

import { writeFile } from 'node:fs/promises';
import { GenerateVideosOperation } from '@google/genai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAIAuto } from './node/factory';
import { getAI } from './shared/factory';
import {
  __resetByteplusModelArkRateLimitersForTests,
  ByteplusModelArkProvider,
} from './shared/providers/byteplus-modelark';
import { GeminiProvider } from './shared/providers/gemini';
import { OpenAIProvider } from './shared/providers/openai';
import { OpenAICompatVideoProvider } from './shared/providers/openai-compat-video';
import { SeevioProvider } from './shared/providers/seevio';
import { createRateLimitedAI } from './shared/rate-limit';
import { createObservedAI } from './shared/safety';
import {
  AIError,
  type AIInterface,
  AuthenticationError,
  RateLimitError,
  type VideoGenerationJob,
} from './shared/types';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

/**
 * Construct a GeminiProvider with a mocked `@google/genai` client and a
 * real `GenerateVideosOperation` constructor.
 *
 * The provider constructor fires a background `import('@google/genai')`
 * that later assigns `this.client`/`this.operationCtor` asynchronously
 * (see `initializeClientSync`). Since `@google/genai` is already loaded
 * (statically imported at the top of this file), that background import
 * resolves within a handful of microtask ticks — racing a same-tick
 * `(provider as any).client = mock` assignment. Flushing past a macrotask
 * boundary before assigning the mock guarantees the background write has
 * already landed, so the mock assignment below is always the final,
 * un-raced write.
 */
async function mockedGeminiProvider(
  clientMock: Record<string, unknown>,
  options: { apiKey?: string; projectId?: string; location?: string } = {},
): Promise<GeminiProvider> {
  const provider = new GeminiProvider({
    type: 'gemini',
    apiKey: options.apiKey ?? 'test-key',
    projectId: options.projectId,
    location: options.location,
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  (provider as any).client = clientMock;
  (provider as any).operationCtor = GenerateVideosOperation;
  return provider;
}

describe('Video generation capability flag and NOT_IMPLEMENTED behavior', () => {
  it('reports videoGeneration: false and throws NOT_IMPLEMENTED for a text-only provider', async () => {
    const provider = new OpenAIProvider({ type: 'openai', apiKey: 'test-key' });

    const capabilities = await provider.getCapabilities();
    expect(capabilities.videoGeneration).toBe(false);

    await expect(
      provider.submitVideoGenerationJob({ prompt: 'a video' }),
    ).rejects.toMatchObject({ name: 'AIError', code: 'NOT_IMPLEMENTED' });
    await expect(
      provider.getVideoGenerationJob({
        jobId: 'x',
        provider: 'openai',
        model: 'gpt-4o',
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    await expect(
      provider.fetchVideoGenerationResult({
        jobId: 'x',
        provider: 'openai',
        model: 'gpt-4o',
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    await expect(
      provider.cancelVideoGenerationJob({
        jobId: 'x',
        provider: 'openai',
        model: 'gpt-4o',
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    await expect(
      provider.validateVideoGenerationAccess(),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});

describe('Gemini video generation (Veo)', () => {
  it('submits a job and returns a JSON-serializable handle', async () => {
    const generateVideos = vi.fn().mockResolvedValue({
      name: 'models/veo-3.1-generate-preview/operations/abc123',
    });
    const provider = await mockedGeminiProvider({ models: { generateVideos } });

    const job = await provider.submitVideoGenerationJob({
      prompt: 'A neon hologram of a cat driving at top speed',
      durationSeconds: 8,
      aspectRatio: '16:9',
    });

    expect(job).toEqual({
      jobId: 'models/veo-3.1-generate-preview/operations/abc123',
      provider: 'gemini',
      model: 'veo-3.1-generate-preview',
      createdAt: expect.any(String),
      raw: { vertexai: false },
    });
    expect(generateVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'veo-3.1-generate-preview',
        prompt: 'A neon hologram of a cat driving at top speed',
        config: expect.objectContaining({
          durationSeconds: 8,
          aspectRatio: '16:9',
        }),
      }),
    );

    // The handle must be plain JSON: no closures, functions, or class instances.
    const serialized = JSON.parse(JSON.stringify(job));
    expect(serialized).toEqual(job);
  });

  it('converts a URL reference image to the { imageBytes, mimeType } shape generateVideos expects (not inlineData)', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/jpeg' },
      }),
    ) as any;

    const generateVideos = vi
      .fn()
      .mockResolvedValue({ name: 'operations/img2vid-url' });
    const provider = await mockedGeminiProvider({ models: { generateVideos } });

    try {
      await provider.submitVideoGenerationJob({
        prompt: 'animate this photo',
        referenceImages: [{ image: 'https://example.com/first-frame.jpg' }],
      });
    } finally {
      global.fetch = originalFetch;
    }

    expect(generateVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        image: {
          imageBytes: Buffer.from([1, 2, 3]).toString('base64'),
          mimeType: 'image/jpeg',
        },
      }),
    );
    // Must NOT use the chat/vision inlineData wrapper shape — the SDK's
    // video converters only read imageBytes/mimeType/gcsUri and silently
    // drop anything else.
    const call = generateVideos.mock.calls[0][0];
    expect(call.image.inlineData).toBeUndefined();
  });

  it('converts a Buffer reference image to the { imageBytes, mimeType } shape', async () => {
    const generateVideos = vi
      .fn()
      .mockResolvedValue({ name: 'operations/img2vid-buffer' });
    const provider = await mockedGeminiProvider({ models: { generateVideos } });

    const buf = Buffer.from([9, 9, 9]);
    await provider.submitVideoGenerationJob({
      prompt: 'animate this photo',
      referenceImages: [{ image: buf, mimeType: 'image/png' }],
    });

    expect(generateVideos).toHaveBeenCalledWith(
      expect.objectContaining({
        image: { imageBytes: buf.toString('base64'), mimeType: 'image/png' },
      }),
    );
  });

  it('resumes polling from a handle round-tripped through JSON on a fresh provider instance, constructing a real GenerateVideosOperation', async () => {
    const generateVideos = vi
      .fn()
      .mockResolvedValue({ name: 'operations/resume-me' });
    const submitter = await mockedGeminiProvider({
      models: { generateVideos },
    });

    const job = await submitter.submitVideoGenerationJob({ prompt: 'hello' });

    // Simulate a process restart: persist as JSON, then rehydrate.
    const persisted = JSON.stringify(job);
    const resumedHandle: VideoGenerationJob = JSON.parse(persisted);

    // A brand new provider instance with no memory of the original submit call.
    const getVideosOperation = vi.fn().mockResolvedValue({
      done: true,
      response: {
        generatedVideos: [
          {
            video: {
              uri: 'https://example.com/out.mp4',
              mimeType: 'video/mp4',
            },
          },
        ],
      },
    });
    const resumer = await mockedGeminiProvider({
      operations: { getVideosOperation },
    });

    const status = await resumer.getVideoGenerationJob(resumedHandle);

    // The critical regression check: getVideosOperation must be called with
    // a real GenerateVideosOperation instance, not a plain { name } literal
    // — the SDK calls operation._fromAPIResponse(...), an instance method
    // that doesn't exist on a plain object and throws at runtime.
    const passedOperation = getVideosOperation.mock.calls[0][0].operation;
    expect(passedOperation).toBeInstanceOf(GenerateVideosOperation);
    expect(passedOperation.name).toBe(resumedHandle.jobId);

    expect(status).toEqual({
      status: 'succeeded',
      result: {
        url: 'https://example.com/out.mp4',
        mimeType: 'video/mp4',
      },
    });
  });

  it('throws a mode-mismatch error when resuming a Vertex AI handle against an AI Studio provider', async () => {
    const vertexHandle: VideoGenerationJob = {
      jobId: 'projects/p/locations/l/operations/abc',
      provider: 'gemini',
      model: 'veo-3.1-generate-preview',
      createdAt: new Date().toISOString(),
      raw: { vertexai: true },
    };

    const provider = await mockedGeminiProvider({
      operations: { getVideosOperation: vi.fn() },
    });

    await expect(
      provider.getVideoGenerationJob(vertexHandle),
    ).rejects.toMatchObject({ code: 'VIDEO_JOB_MODE_MISMATCH' });
  });

  it.each([
    [{ done: false }, { status: 'running' }],
    [
      { done: true, error: { message: 'quota exceeded' } },
      { status: 'failed', error: 'quota exceeded' },
    ],
    [
      { done: true, error: { message: 'operation was cancelled by caller' } },
      { status: 'cancelled' },
    ],
    [
      // google.rpc.Code.CANCELLED === 1, preferred over the message regex.
      { done: true, error: { code: 1, message: 'terminated' } },
      { status: 'cancelled' },
    ],
  ])('maps operation shape %j to status %j', async (operation, expected) => {
    const provider = await mockedGeminiProvider({
      operations: {
        getVideosOperation: vi.fn().mockResolvedValue(operation),
      },
    });

    const status = await provider.getVideoGenerationJob({
      jobId: 'operations/xyz',
      provider: 'gemini',
      model: 'veo-3.1-generate-preview',
      createdAt: new Date().toISOString(),
    });

    expect(status).toMatchObject(expected);
  });

  it('fetchVideoGenerationResult throws when the job has not succeeded', async () => {
    const provider = await mockedGeminiProvider({
      operations: {
        getVideosOperation: vi.fn().mockResolvedValue({ done: false }),
      },
    });

    await expect(
      provider.fetchVideoGenerationResult({
        jobId: 'operations/xyz',
        provider: 'gemini',
        model: 'veo-3.1-generate-preview',
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'VIDEO_JOB_NOT_READY' });
  });

  it('fetchVideoGenerationResult downloads bytes via ai.files.download for a succeeded job', async () => {
    const download = vi.fn(
      async ({ downloadPath }: { downloadPath: string }) => {
        await writeFile(downloadPath, Buffer.from('fake-mp4-bytes'));
      },
    );
    const provider = await mockedGeminiProvider({
      operations: {
        getVideosOperation: vi.fn().mockResolvedValue({
          done: true,
          response: {
            generatedVideos: [
              {
                video: {
                  uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media',
                  mimeType: 'video/mp4',
                },
              },
            ],
          },
        }),
      },
      files: { download },
    });

    const result = await provider.fetchVideoGenerationResult({
      jobId: 'operations/xyz',
      provider: 'gemini',
      model: 'veo-3.1-generate-preview',
      createdAt: new Date().toISOString(),
    });

    expect(download).toHaveBeenCalledTimes(1);
    expect(result.mimeType).toBe('video/mp4');
    expect(result.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/files/abc123:download?alt=media',
    );
    expect(Buffer.from(result.data as Buffer).toString()).toBe(
      'fake-mp4-bytes',
    );
  });

  it('fetchVideoGenerationResult uses inline videoBytes directly, without downloading, when the provider returns them', async () => {
    const download = vi.fn();
    const inlineBytes = Buffer.from('inline-bytes').toString('base64');
    const provider = await mockedGeminiProvider({
      operations: {
        getVideosOperation: vi.fn().mockResolvedValue({
          done: true,
          response: {
            generatedVideos: [
              {
                video: { videoBytes: inlineBytes, mimeType: 'video/mp4' },
              },
            ],
          },
        }),
      },
      files: { download },
    });

    const result = await provider.fetchVideoGenerationResult({
      jobId: 'operations/xyz',
      provider: 'gemini',
      model: 'veo-3.1-generate-preview',
      createdAt: new Date().toISOString(),
    });

    expect(download).not.toHaveBeenCalled();
    expect(Buffer.from(result.data as Buffer).toString()).toBe('inline-bytes');
  });

  describe('cancellation (unsupported by the Gemini API)', () => {
    const originalFetch = global.fetch;
    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('always throws in AI Studio mode without making any HTTP request (the API has no video-job cancel endpoint)', async () => {
      const fetchMock = vi.fn();
      global.fetch = fetchMock as any;

      const provider = new GeminiProvider({
        type: 'gemini',
        apiKey: 'test-key',
      });

      await expect(
        provider.cancelVideoGenerationJob({
          jobId: 'operations/abc123',
          provider: 'gemini',
          model: 'veo-3.1-generate-preview',
          createdAt: new Date().toISOString(),
        }),
      ).rejects.toMatchObject({ code: 'VIDEO_CANCEL_UNSUPPORTED' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws NOT_IMPLEMENTED in Vertex AI mode', async () => {
      const provider = new GeminiProvider({
        type: 'gemini',
        apiKey: 'test-key',
        projectId: 'my-project',
        location: 'us-central1',
      });

      await expect(
        provider.cancelVideoGenerationJob({
          jobId: 'projects/p/locations/l/operations/abc',
          provider: 'gemini',
          model: 'veo-3.1-generate-preview',
          createdAt: new Date().toISOString(),
        }),
      ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    });
  });

  it('validateVideoGenerationAccess performs a cheap list-shaped call', async () => {
    const list = vi.fn().mockResolvedValue({});
    const provider = await mockedGeminiProvider({ models: { list } });

    await expect(provider.validateVideoGenerationAccess()).resolves.toBe(true);
    expect(list).toHaveBeenCalledWith({ config: { pageSize: 1 } });
  });
});

describe('BytePlus ModelArk video generation (Seedance)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    __resetByteplusModelArkRateLimitersForTests();
  });

  it('submits a task with the documented ModelArk request shape', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks',
        );
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toBe('Bearer modelark-key-1');
        const body = JSON.parse(String(init?.body));
        expect(body).toEqual({
          model: 'seedance-1-0-lite-t2v-250428',
          content: [{ type: 'text', text: 'a cinematic drone shot' }],
          resolution: '720p',
          ratio: '16:9',
          duration: 5,
          seed: undefined,
        });
        return jsonResponse({ id: 'cgt-2025-abc' });
      },
    );
    global.fetch = fetchMock as any;

    const provider = new ByteplusModelArkProvider({
      type: 'byteplus-modelark',
      apiKey: 'modelark-key-1',
    });

    const job = await provider.submitVideoGenerationJob({
      prompt: 'a cinematic drone shot',
      resolution: '720p',
      aspectRatio: '16:9',
      durationSeconds: 5,
    });

    expect(job).toEqual({
      jobId: 'cgt-2025-abc',
      provider: 'byteplus-modelark',
      model: 'seedance-1-0-lite-t2v-250428',
      createdAt: expect.any(String),
    });
    expect(JSON.parse(JSON.stringify(job))).toEqual(job);
  });

  it('auto-selects the i2v default model when referenceImages are present and no model is given', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe('seedance-1-0-lite-i2v-250428');
        return jsonResponse({ id: 'cgt-i2v-auto' });
      },
    );
    global.fetch = fetchMock as any;

    const provider = new ByteplusModelArkProvider({
      type: 'byteplus-modelark',
      apiKey: 'modelark-key-i2v-auto',
    });

    const job = await provider.submitVideoGenerationJob({
      prompt: 'animate this',
      referenceImages: [{ image: 'https://example.com/ref.jpg' }],
    });

    expect(job.model).toBe('seedance-1-0-lite-i2v-250428');
  });

  it('submits a string-URL reference image as a content-array image_url entry with role', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.content).toEqual([
          { type: 'text', text: 'animate' },
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/ref.jpg' },
            role: 'reference_image',
          },
        ]);
        return jsonResponse({ id: 'cgt-ref-url' });
      },
    );
    global.fetch = fetchMock as any;

    const provider = new ByteplusModelArkProvider({
      type: 'byteplus-modelark',
      apiKey: 'modelark-key-ref-url',
    });

    await provider.submitVideoGenerationJob({
      prompt: 'animate',
      referenceImages: [{ image: 'https://example.com/ref.jpg' }],
    });
  });

  it('submits a Buffer reference image as a base64 data URL content-array entry with role', async () => {
    const buf = Buffer.from([1, 2, 3]);
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.content).toEqual([
          { type: 'text', text: 'animate' },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${buf.toString('base64')}`,
            },
            role: 'reference_image',
          },
        ]);
        return jsonResponse({ id: 'cgt-ref-buf' });
      },
    );
    global.fetch = fetchMock as any;

    const provider = new ByteplusModelArkProvider({
      type: 'byteplus-modelark',
      apiKey: 'modelark-key-ref-buf',
    });

    await provider.submitVideoGenerationJob({
      prompt: 'animate',
      referenceImages: [{ image: buf, mimeType: 'image/png' }],
    });
  });

  it.each([
    ['queued', {}, { status: 'queued' }],
    ['running', {}, { status: 'running' }],
    ['cancelled', {}, { status: 'cancelled' }],
    [
      'failed',
      { error: { code: 'E', message: 'render failed' } },
      { status: 'failed', error: 'render failed' },
    ],
    [
      'expired',
      {},
      { status: 'failed', error: expect.stringContaining('expired') },
    ],
    [
      'succeeded',
      { content: { video_url: 'https://cdn.example.com/v.mp4' }, duration: 5 },
      {
        status: 'succeeded',
        result: {
          url: 'https://cdn.example.com/v.mp4',
          mimeType: 'video/mp4',
          durationSeconds: 5,
        },
      },
    ],
    [
      // An unrecognized future status must never be read as terminal.
      'a_future_status_this_package_does_not_know',
      {},
      {
        status: 'running',
        rawStatus: 'a_future_status_this_package_does_not_know',
      },
    ],
  ])('maps ModelArk task status %s', async (status, extra, expected) => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'cgt-1',
        model: 'seedance-1-0-lite-t2v-250428',
        status,
        created_at: 0,
        updated_at: 0,
        ...extra,
      }),
    ) as any;

    const provider = new ByteplusModelArkProvider({
      type: 'byteplus-modelark',
      apiKey: 'modelark-key-status',
    });

    const result = await provider.getVideoGenerationJob({
      jobId: 'cgt-1',
      provider: 'byteplus-modelark',
      model: 'seedance-1-0-lite-t2v-250428',
      createdAt: new Date().toISOString(),
    });

    expect(result).toEqual(expected);
  });

  it('fetchVideoGenerationResult succeeds and returns the video_url + duration for a succeeded task', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'cgt-success',
        model: 'seedance-1-0-lite-t2v-250428',
        status: 'succeeded',
        content: { video_url: 'https://cdn.example.com/done.mp4' },
        duration: 5,
        created_at: 0,
        updated_at: 0,
      }),
    ) as any;

    const provider = new ByteplusModelArkProvider({
      type: 'byteplus-modelark',
      apiKey: 'modelark-key-fetch-success',
    });

    const result = await provider.fetchVideoGenerationResult({
      jobId: 'cgt-success',
      provider: 'byteplus-modelark',
      model: 'seedance-1-0-lite-t2v-250428',
      createdAt: new Date().toISOString(),
    });

    expect(result).toEqual({
      url: 'https://cdn.example.com/done.mp4',
      mimeType: 'video/mp4',
      durationSeconds: 5,
    });
  });

  it('resumes polling from a JSON round-tripped handle on a fresh ModelArk provider instance', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'cgt-resume' })) as any;

    const submitter = new ByteplusModelArkProvider({
      type: 'byteplus-modelark',
      apiKey: 'modelark-key-resume',
    });
    const job = await submitter.submitVideoGenerationJob({ prompt: 'x' });
    const resumedHandle: VideoGenerationJob = JSON.parse(JSON.stringify(job));

    const resumeFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-resume',
      );
      return jsonResponse({
        id: 'cgt-resume',
        model: 'seedance-1-0-lite-t2v-250428',
        status: 'succeeded',
        content: { video_url: 'https://cdn.example.com/resumed.mp4' },
        created_at: 0,
        updated_at: 0,
      });
    });
    global.fetch = resumeFetchMock as any;

    // A brand new provider instance simulating a process restart.
    const resumer = new ByteplusModelArkProvider({
      type: 'byteplus-modelark',
      apiKey: 'modelark-key-resume',
    });
    const status = await resumer.getVideoGenerationJob(resumedHandle);

    expect(status.status).toBe('succeeded');
    expect(status.result?.url).toBe('https://cdn.example.com/resumed.mp4');
  });

  it('cancels a queued task via DELETE', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks/cgt-1',
        );
        expect(init?.method).toBe('DELETE');
        return jsonResponse({});
      },
    );
    global.fetch = fetchMock as any;

    const provider = new ByteplusModelArkProvider({
      type: 'byteplus-modelark',
      apiKey: 'modelark-key-cancel',
    });

    await expect(
      provider.cancelVideoGenerationJob({
        jobId: 'cgt-1',
        provider: 'byteplus-modelark',
        model: 'seedance-1-0-lite-t2v-250428',
        createdAt: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
  });

  it('surfaces a clear error when ModelArk refuses to cancel a running task (best-effort cancel)', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response('task is running and cannot be cancelled', {
        status: 409,
      }),
    ) as any;

    const provider = new ByteplusModelArkProvider({
      type: 'byteplus-modelark',
      apiKey: 'modelark-key-cancel-blocked',
    });

    await expect(
      provider.cancelVideoGenerationJob({
        jobId: 'cgt-running',
        provider: 'byteplus-modelark',
        model: 'seedance-1-0-lite-t2v-250428',
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(AIError);
  });

  it('maps a 401 response to AuthenticationError', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('unauthorized', { status: 401 })) as any;

    const provider = new ByteplusModelArkProvider({
      type: 'byteplus-modelark',
      apiKey: 'bad-key',
    });

    await expect(
      provider.validateVideoGenerationAccess(),
    ).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('wraps a fetch()-level network failure into an AIError', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as any;

    const provider = new ByteplusModelArkProvider({
      type: 'byteplus-modelark',
      apiKey: 'modelark-key-network-fail',
    });

    await expect(
      provider.validateVideoGenerationAccess(),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
  });

  describe('submit-time rate limiting', () => {
    it('throttles concurrent submissions to the configured maxConcurrent', async () => {
      let inFlight = 0;
      let maxObservedInFlight = 0;
      const releasers: Array<() => void> = [];

      const fetchMock = vi.fn(async () => {
        inFlight += 1;
        maxObservedInFlight = Math.max(maxObservedInFlight, inFlight);
        await new Promise<void>((resolve) => releasers.push(resolve));
        inFlight -= 1;
        return jsonResponse({ id: `task-${releasers.length}` });
      });
      global.fetch = fetchMock as any;

      const provider = new ByteplusModelArkProvider({
        type: 'byteplus-modelark',
        apiKey: 'modelark-key-concurrency',
        rateLimit: { maxConcurrent: 1 },
      });

      const first = provider.submitVideoGenerationJob({ prompt: 'first' });
      const second = provider.submitVideoGenerationJob({ prompt: 'second' });

      // Give both calls a chance to reach the limiter/fetch layer.
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fetchMock).toHaveBeenCalledTimes(1); // second is still waiting

      releasers.shift()?.();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      releasers.shift()?.();

      await Promise.all([first, second]);
      expect(maxObservedInFlight).toBe(1);
    });

    it('caps burst capacity: a burst of 5 instant submits is paced, not all resolved at once', async () => {
      const callTimestamps: number[] = [];
      global.fetch = vi.fn(async () => {
        callTimestamps.push(Date.now());
        return jsonResponse({ id: `task-${callTimestamps.length}` });
      }) as any;

      const provider = new ByteplusModelArkProvider({
        type: 'byteplus-modelark',
        apiKey: 'modelark-key-burst',
      });

      const start = Date.now();
      await Promise.all(
        Array.from({ length: 5 }, (_, index) =>
          provider.submitVideoGenerationJob({ prompt: `p${index}` }),
        ),
      );

      expect(callTimestamps).toHaveLength(5);
      // Burst capacity is capped at ~2 tokens with a ~2 req/s refill, so
      // 5 submits cannot all clear instantly — the tail end must be
      // paced. Under the old bug (bucket starting full at
      // `requestsPerMinute`, e.g. 120), all 5 would resolve in the same
      // tick and this would be ~0ms.
      const elapsed = callTimestamps[4] - start;
      expect(elapsed).toBeGreaterThan(500);
    }, 10000);

    it('shares the submit limiter across provider instances constructed with the same apiKey', async () => {
      const callTimestamps: number[] = [];
      global.fetch = vi.fn(async () => {
        callTimestamps.push(Date.now());
        return jsonResponse({ id: `task-${callTimestamps.length}` });
      }) as any;

      const providerA = new ByteplusModelArkProvider({
        type: 'byteplus-modelark',
        apiKey: 'modelark-key-shared',
      });
      const providerB = new ByteplusModelArkProvider({
        type: 'byteplus-modelark',
        apiKey: 'modelark-key-shared',
      });

      const start = Date.now();
      await Promise.all([
        providerA.submitVideoGenerationJob({ prompt: 'a1' }),
        providerA.submitVideoGenerationJob({ prompt: 'a2' }),
        // 3rd submission overall against the shared bucket (capacity ~2) —
        // must wait for a token even though it's providerB's first call.
        providerB.submitVideoGenerationJob({ prompt: 'b1' }),
      ]);

      expect(callTimestamps).toHaveLength(3);
      expect(callTimestamps[2] - start).toBeGreaterThan(300);
    }, 10000);

    it('does NOT share the limiter across instances with different apiKeys', async () => {
      const callTimestamps: number[] = [];
      global.fetch = vi.fn(async () => {
        callTimestamps.push(Date.now());
        return jsonResponse({ id: `task-${callTimestamps.length}` });
      }) as any;

      const providerA = new ByteplusModelArkProvider({
        type: 'byteplus-modelark',
        apiKey: 'modelark-key-distinct-a',
      });
      const providerB = new ByteplusModelArkProvider({
        type: 'byteplus-modelark',
        apiKey: 'modelark-key-distinct-b',
      });

      // Both providers' buckets start full (capacity 2 each), so one
      // submission from each should clear near-instantly.
      const start = Date.now();
      await Promise.all([
        providerA.submitVideoGenerationJob({ prompt: 'a1' }),
        providerB.submitVideoGenerationJob({ prompt: 'b1' }),
      ]);

      expect(callTimestamps).toHaveLength(2);
      expect(Date.now() - start).toBeLessThan(300);
    });

    it('never lets activeRequests exceed maxConcurrent under contention that interleaves the slot-wait and token-wait loops (TOCTOU)', async () => {
      let inFlight = 0;
      let maxObservedInFlight = 0;
      const releasers: Array<() => void> = [];

      const fetchMock = vi.fn(async () => {
        inFlight += 1;
        maxObservedInFlight = Math.max(maxObservedInFlight, inFlight);
        await new Promise<void>((resolve) => releasers.push(resolve));
        inFlight -= 1;
        return jsonResponse({ id: `task-${releasers.length}` });
      });
      global.fetch = fetchMock as any;

      const provider = new ByteplusModelArkProvider({
        type: 'byteplus-modelark',
        apiKey: 'modelark-key-toctou',
        // Only 2 burst tokens and only 2 concurrent slots for 5 submitters:
        // callers 3-5 must wait on BOTH the slot-wait loop and the
        // token-wait loop, and slots free up (via the release loop below)
        // while other callers are still mid-wait for a token — exactly the
        // interleaving window the TOCTOU bug required.
        rateLimit: { maxConcurrent: 2, requestsPerMinute: 120 },
      });

      const submissionCount = 5;
      const submissions = Array.from({ length: submissionCount }, (_, index) =>
        provider.submitVideoGenerationJob({ prompt: `p${index}` }),
      );

      // Release fetches as they actually arrive rather than on a fixed
      // schedule: under heavy rate-limit contention, later callers may not
      // reach fetch() until well after earlier ones have been released, so
      // a fixed-cadence release loop can run out of scheduled releases
      // before a late caller ever starts (and then hang forever waiting on
      // a release that never comes). Polling for a releaser to appear
      // instead makes this robust to however long the limiter makes each
      // caller wait.
      let released = 0;
      const releaseLoop = (async () => {
        while (released < submissionCount) {
          if (releasers.length > 0) {
            releasers.shift()?.();
            released += 1;
            // Hold each response open briefly so multiple submissions can
            // genuinely overlap in-flight (exercising real concurrency),
            // rather than releasing so fast that submissions never overlap.
            await new Promise((resolve) => setTimeout(resolve, 20));
          } else {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }
      })();

      await Promise.all([...submissions, releaseLoop]);

      expect(fetchMock).toHaveBeenCalledTimes(submissionCount);
      // The core assertion: at no point did more than maxConcurrent (2)
      // submissions have an in-flight fetch simultaneously.
      expect(maxObservedInFlight).toBeLessThanOrEqual(2);
    }, 15000);
  });

  describe('abort-signal handling', () => {
    it('honors an already-aborted signal at submit time: no fetch call, and the limiter slot/token is not consumed', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ id: 'ok' }));
      global.fetch = fetchMock as any;

      const provider = new ByteplusModelArkProvider({
        type: 'byteplus-modelark',
        apiKey: 'modelark-key-preaborted',
      });

      const controller = new AbortController();
      controller.abort();

      await expect(
        provider.submitVideoGenerationJob({
          prompt: 'x',
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ code: 'AI_ABORTED' });
      expect(fetchMock).not.toHaveBeenCalled();

      // The burst-capacity bucket (2 tokens) must still be full — the
      // aborted attempt must not have consumed a token or a concurrency
      // slot. Two legitimate submits right after should both clear
      // near-instantly, proving nothing was consumed.
      const start = Date.now();
      await provider.submitVideoGenerationJob({ prompt: 'y' });
      await provider.submitVideoGenerationJob({ prompt: 'z' });
      expect(Date.now() - start).toBeLessThan(300);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('aborting while waiting for a concurrency slot never calls fetch', async () => {
      let releaseFirst: (() => void) | undefined;
      const blockingFetch = vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            releaseFirst = () => resolve(jsonResponse({ id: 'blocking' }));
          }),
      );
      global.fetch = blockingFetch as any;

      const provider = new ByteplusModelArkProvider({
        type: 'byteplus-modelark',
        apiKey: 'modelark-key-abort-slot-wait',
        rateLimit: { maxConcurrent: 1 },
      });

      // Occupy the single concurrency slot with a submission whose fetch
      // never resolves, forcing the next submission to wait in
      // acquire()'s slot-wait loop.
      const first = provider.submitVideoGenerationJob({ prompt: 'first' });
      await vi.waitFor(() => expect(blockingFetch).toHaveBeenCalledTimes(1));

      const controller = new AbortController();
      const second = provider.submitVideoGenerationJob({
        prompt: 'second',
        signal: controller.signal,
      });

      // Let the second call enter the slot-wait loop, then abort it while
      // it is still waiting for a concurrency slot (well before the
      // loop's own 100ms poll interval would naturally wake it).
      await new Promise((resolve) => setTimeout(resolve, 20));
      controller.abort();

      await expect(second).rejects.toMatchObject({ code: 'AI_ABORTED' });
      expect(blockingFetch).toHaveBeenCalledTimes(1); // second never reached fetch

      releaseFirst?.();
      await first;
    });

    it('aborting while waiting for a token refill never calls fetch', async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ id: 'ok' }));
      global.fetch = fetchMock as any;

      const provider = new ByteplusModelArkProvider({
        type: 'byteplus-modelark',
        apiKey: 'modelark-key-abort-token-wait',
        // No slot contention (maxConcurrent is generous); the bottleneck
        // is the 2-token burst bucket refilling slowly.
        rateLimit: { requestsPerMinute: 12, maxConcurrent: 10 },
      });

      // Drain the burst capacity with two quick, unaborted submits.
      await provider.submitVideoGenerationJob({ prompt: 'first' });
      await provider.submitVideoGenerationJob({ prompt: 'second' });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // A third submission now has to wait for a token refill (~5s at
      // this rate); abort it while it is still waiting.
      const controller = new AbortController();
      const third = provider.submitVideoGenerationJob({
        prompt: 'third',
        signal: controller.signal,
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      controller.abort();

      await expect(third).rejects.toMatchObject({ code: 'AI_ABORTED' });
      expect(fetchMock).toHaveBeenCalledTimes(2); // third never reached fetch
    });
  });

  it('participates in the shared createRateLimitedAI submit-time pacing wrapper', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const callTimes: number[] = [];
      const stub: Partial<AIInterface> = {
        submitVideoGenerationJob: vi.fn(async () => {
          callTimes.push(Date.now());
          return {
            jobId: `job-${callTimes.length}`,
            provider: 'byteplus-modelark',
            model: 'seedance-1-0-lite-t2v-250428',
            createdAt: new Date().toISOString(),
          };
        }),
      };

      const ai = createRateLimitedAI(stub as AIInterface, {
        type: 'byteplus-modelark',
        apiKey: 'test-key',
        rateLimit: { enabled: true, cooldownMs: 500, maxAttempts: 1 },
      });

      const first = ai.submitVideoGenerationJob({ prompt: 'first' });
      await vi.advanceTimersByTimeAsync(0);
      await expect(first).resolves.toMatchObject({ jobId: 'job-1' });

      const second = ai.submitVideoGenerationJob({ prompt: 'second' });
      await vi.advanceTimersByTimeAsync(499);
      expect(callTimes).toEqual([0]);

      await vi.advanceTimersByTimeAsync(1);
      await expect(second).resolves.toMatchObject({ jobId: 'job-2' });
      expect(callTimes).toEqual([0, 500]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves configured video-submit retries for non-Seevio providers', async () => {
    let attempts = 0;
    const stub: Partial<AIInterface> = {
      submitVideoGenerationJob: vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) throw new RateLimitError('byteplus-modelark', 0);
        return {
          jobId: 'job',
          provider: 'byteplus-modelark',
          model: 'seedance-1-0-lite-t2v-250428',
          createdAt: new Date().toISOString(),
        };
      }),
    };
    const ai = createRateLimitedAI(stub as AIInterface, {
      type: 'byteplus-modelark',
      apiKey: 'test-key',
      rateLimit: { enabled: true, initialDelayMs: 0, maxAttempts: 2 },
    });
    await expect(
      ai.submitVideoGenerationJob({ prompt: 'retry' }),
    ).resolves.toMatchObject({
      jobId: 'job',
    });
    expect(attempts).toBe(2);
  });
});

describe('Seevio video generation (Seedance 2.5)', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('is selectable through the provider-neutral factory', async () => {
    await expect(
      getAI({ type: 'seevio', apiKey: 'seevio-key' }),
    ).resolves.toBeInstanceOf(SeevioProvider);
  });

  it('submits the documented, pinned Seedance 2.5 request without retry metadata', async () => {
    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          'https://api.seevio.ai/v1/videos/generations',
        );
        expect(init?.method).toBe('POST');
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          'Bearer seevio-key',
        );
        expect(JSON.parse(String(init?.body))).toEqual({
          model: 'seedance-2-5',
          input: {
            prompt: 'A cinematic sunrise',
            generation_type: 'text-to-video',
            duration: 5,
            aspect_ratio: '16:9',
            resolution: '720p',
            generate_audio: true,
            return_last_frame: false,
          },
        });
        return jsonResponse({ taskId: 'seevio-task-1', credits: 100 });
      },
    ) as any;

    const provider = new SeevioProvider({
      type: 'seevio',
      apiKey: 'seevio-key',
    });
    const job = await provider.submitVideoGenerationJob({
      prompt: 'A cinematic sunrise',
      aspectRatio: '16:9',
    });

    expect(job).toEqual({
      jobId: 'seevio-task-1',
      provider: 'seevio',
      model: 'seedance-2-5',
      createdAt: expect.any(String),
      raw: { credits: 100, billingStatus: 'reserved' },
    });
    expect(JSON.parse(JSON.stringify(job))).toEqual(job);
  });

  it('normalizes first/last-frame and multimodal references without changing the generic input contract', async () => {
    const bodies: unknown[] = [];
    global.fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ taskId: `task-${bodies.length}` });
      },
    ) as any;
    const provider = new SeevioProvider({
      type: 'seevio',
      apiKey: 'seevio-key',
    });

    await provider.submitVideoGenerationJob({
      prompt: 'animate product',
      referenceImages: [
        { image: 'https://assets.example.com/first.jpg' },
        { image: 'https://assets.example.com/last.jpg' },
      ],
    });
    await provider.submitVideoGenerationJob({
      prompt: 'use the product and motion',
      referenceMedia: [
        { type: 'image', url: 'https://assets.example.com/product.jpg' },
        {
          type: 'video',
          url: 'https://assets.example.com/motion.mp4',
          durationSeconds: 4,
        },
        {
          type: 'audio',
          url: 'https://assets.example.com/music.mp3',
          durationSeconds: 5,
        },
      ],
    });

    expect(bodies).toEqual([
      expect.objectContaining({
        input: expect.objectContaining({
          generation_type: 'image-to-video',
          aspect_ratio: 'adaptive',
          image_urls: [
            'https://assets.example.com/first.jpg',
            'https://assets.example.com/last.jpg',
          ],
        }),
      }),
      expect.objectContaining({
        input: expect.objectContaining({
          generation_type: 'reference-to-video',
          image_urls: ['https://assets.example.com/product.jpg'],
          video_urls: ['https://assets.example.com/motion.mp4'],
          audio_urls: ['https://assets.example.com/music.mp3'],
        }),
      }),
    ]);
  });

  it('honors an abort that races listener registration', async () => {
    let aborted = false;
    const signal = {
      get aborted() {
        return aborted;
      },
      reason: new DOMException('aborted', 'AbortError'),
      addEventListener() {
        aborted = true;
      },
      removeEventListener() {},
    } as unknown as AbortSignal;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      init?.signal?.aborted
        ? Promise.reject(new DOMException('aborted', 'AbortError'))
        : Promise.resolve(jsonResponse({ taskId: 'unexpected' })),
    );
    global.fetch = fetchMock as any;
    const provider = new SeevioProvider({
      type: 'seevio',
      apiKey: 'seevio-key',
    });

    await expect(
      provider.submitVideoGenerationJob({ prompt: 'x', signal }),
    ).rejects.toMatchObject({ code: 'AI_ABORTED' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(
      true,
    );
  });

  it('rejects reference video or audio durations over Seevio’s 30-second category limit before POST', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;
    const provider = new SeevioProvider({
      type: 'seevio',
      apiKey: 'seevio-key',
    });
    await expect(
      provider.submitVideoGenerationJob({
        prompt: 'x',
        referenceMedia: [
          {
            type: 'video',
            url: 'https://assets.example.com/a.mp4',
            durationSeconds: 20,
          },
          {
            type: 'video',
            url: 'https://assets.example.com/b.mp4',
            durationSeconds: 20,
          },
          { type: 'video', url: 'https://assets.example.com/unknown.mp4' },
        ],
      }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(
      provider.submitVideoGenerationJob({
        prompt: 'x',
        referenceMedia: [
          {
            type: 'audio',
            url: 'https://assets.example.com/a.mp3',
            durationSeconds: 20,
          },
          {
            type: 'audio',
            url: 'https://assets.example.com/b.mp3',
            durationSeconds: 20,
          },
        ],
      }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unpinned models, local media, invalid image-mode ratio, and unsupported seed before a paid POST', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;
    const provider = new SeevioProvider({
      type: 'seevio',
      apiKey: 'seevio-key',
    });

    await expect(
      provider.submitVideoGenerationJob({ prompt: 'x', model: 'latest' }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(
      provider.submitVideoGenerationJob({
        prompt: 'x',
        referenceImages: [{ image: Buffer.from([1]) }],
      }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(
      provider.submitVideoGenerationJob({
        prompt: 'x',
        referenceImages: [{ image: 'https://assets.example.com/x.jpg' }],
        aspectRatio: '16:9',
      }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(
      provider.submitVideoGenerationJob({ prompt: 'x', seed: 1 }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(
      provider.submitVideoGenerationJob({
        prompt: 'x',
        referenceMedia: [
          {
            type: 'image',
            url: 'https://user:password@assets.example.com/x.jpg',
          },
        ],
      }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(
      provider.submitVideoGenerationJob({
        prompt: 'x',
        referenceMedia: [{ type: 'image', url: 'https://127.0.0.1/x.jpg' }],
      }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(
      provider.submitVideoGenerationJob({
        prompt: 'x',
        referenceMedia: [{ type: 'image', url: 'https://localhost/x.jpg' }],
      }),
    ).rejects.toMatchObject({ name: 'ValidationError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps task state, credit reservation, expiry, and reviewed result URLs', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'seevio-task-1',
        status: 'completed',
        model: 'seedance-2-5',
        billing_status: 'charged',
        credits: 100,
        data: {
          results: ['https://cdn.seevio.ai/renders/video.mp4'],
          video_expires_at: '2026-08-14T00:00:00Z',
          last_frame_url: 'https://cdn.seevio.ai/renders/final.jpg',
        },
      }),
    ) as any;
    const provider = new SeevioProvider({
      type: 'seevio',
      apiKey: 'seevio-key',
    });
    await expect(
      provider.getVideoGenerationJob({
        jobId: 'seevio-task-1',
        provider: 'seevio',
        model: 'seedance-2-5',
        createdAt: new Date().toISOString(),
      }),
    ).resolves.toEqual({
      status: 'succeeded',
      result: {
        url: 'https://cdn.seevio.ai/renders/video.mp4',
        mimeType: 'video/mp4',
        expiresAt: '2026-08-14T00:00:00Z',
        lastFrameUrl: 'https://cdn.seevio.ai/renders/final.jpg',
      },
      billing: { status: 'charged', credits: 100 },
    });
  });

  it('enforces the documented 10-second polling cadence before another network request', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ id: 'task', status: 'queued' }));
      global.fetch = fetchMock as any;
      const provider = new SeevioProvider({
        type: 'seevio',
        apiKey: 'seevio-key',
      });
      const handle = {
        jobId: 'task',
        provider: 'seevio',
        model: 'seedance-2-5',
        createdAt: new Date().toISOString(),
      };
      await provider.getVideoGenerationJob(handle);
      await expect(
        provider.getVideoGenerationJob(handle),
      ).rejects.toMatchObject({ code: 'VIDEO_POLL_TOO_FREQUENT' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reuses a completed task snapshot for immediate result download without a second task poll', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task',
          status: 'completed',
          data: { results: ['https://cdn.seevio.ai/render.mp4'] },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1]), {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        }),
      );
    global.fetch = fetchMock as any;
    const provider = new SeevioProvider({
      type: 'seevio',
      apiKey: 'seevio-key',
    });
    const handle = {
      jobId: 'task',
      provider: 'seevio',
      model: 'seedance-2-5',
      createdAt: new Date().toISOString(),
    };
    await expect(provider.getVideoGenerationJob(handle)).resolves.toMatchObject(
      {
        status: 'succeeded',
      },
    );
    await expect(
      provider.fetchVideoGenerationResult(handle),
    ).resolves.toMatchObject({
      data: Buffer.from([1]),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      'https://cdn.seevio.ai/render.mp4',
    );
  });

  it('expires a completed handoff snapshot after 10 seconds and fetches a fresh authenticated task state', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({
            id: 'task',
            status: 'completed',
            data: { results: ['https://cdn.seevio.ai/old.mp4'] },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            id: 'task',
            status: 'completed',
            data: { results: ['https://cdn.seevio.ai/fresh.mp4'] },
          }),
        )
        .mockResolvedValueOnce(
          new Response(new Uint8Array([2]), {
            status: 200,
            headers: { 'content-type': 'video/mp4' },
          }),
        );
      global.fetch = fetchMock as any;
      const provider = new SeevioProvider({
        type: 'seevio',
        apiKey: 'seevio-key',
      });
      const handle = {
        jobId: 'task',
        provider: 'seevio',
        model: 'seedance-2-5',
        createdAt: new Date().toISOString(),
      };
      await provider.getVideoGenerationJob(handle);
      vi.advanceTimersByTime(10_000);
      expect((provider as any).nextPollAt.size).toBe(0);
      await expect(
        provider.fetchVideoGenerationResult(handle),
      ).resolves.toMatchObject({
        url: 'https://cdn.seevio.ai/fresh.mp4',
        data: Buffer.from([2]),
      });
      expect(String(fetchMock.mock.calls[1][0])).toBe(
        'https://api.seevio.ai/v1/tasks/task',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses an unbilled GET probe and classifies authenticated 404 as access', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'not_found' } }), {
        status: 404,
      }),
    );
    global.fetch = fetchMock as any;
    const provider = new SeevioProvider({
      type: 'seevio',
      apiKey: 'seevio-key',
    });
    await expect(provider.validateVideoGenerationAccess()).resolves.toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(
      /^https:\/\/api\.seevio\.ai\/v1\/tasks\/have-ai-access-probe-/,
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET');
  });

  it('preserves 401, 403, 402, and 429 as distinct normalized errors', async () => {
    const cases = [
      [401, 'AUTH_ERROR'],
      [403, 'SEEVIO_FORBIDDEN'],
      [402, 'INSUFFICIENT_CREDITS'],
      [429, 'RATE_LIMIT'],
    ] as const;
    for (const [httpStatus, code] of cases) {
      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'nope' } }), {
          status: httpStatus,
          headers: httpStatus === 429 ? { 'retry-after': '3' } : undefined,
        }),
      ) as any;
      const provider = new SeevioProvider({
        type: 'seevio',
        apiKey: 'seevio-key',
      });
      await expect(
        provider.validateVideoGenerationAccess(),
      ).rejects.toMatchObject({ code });
    }
  });

  it('never retries a billable POST after a rate limit, even if generic pacing permits retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'slow down' } }), {
        status: 429,
        headers: { 'retry-after': '0' },
      }),
    );
    global.fetch = fetchMock as any;
    const provider = createRateLimitedAI(
      new SeevioProvider({ type: 'seevio', apiKey: 'seevio-key' }),
      {
        type: 'seevio',
        apiKey: 'seevio-key',
        rateLimit: { enabled: true, maxAttempts: 2 },
      },
    );
    await expect(
      provider.submitVideoGenerationJob({ prompt: 'x' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('validates each redirect before downloading a completed video and rejects unreviewed targets', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task',
          status: 'completed',
          data: { results: ['https://cdn.seevio.ai/render.mp4'] },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://cdn.seevio.ai/signed/render.mp4' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        }),
      );
    global.fetch = fetchMock as any;
    const provider = new SeevioProvider({
      type: 'seevio',
      apiKey: 'seevio-key',
    });
    const handle = {
      jobId: 'task',
      provider: 'seevio',
      model: 'seedance-2-5',
      createdAt: new Date().toISOString(),
    };
    await expect(
      provider.fetchVideoGenerationResult(handle),
    ).resolves.toMatchObject({
      url: 'https://cdn.seevio.ai/signed/render.mp4',
      mimeType: 'video/mp4',
      data: Buffer.from([1, 2, 3]),
    });
    expect(fetchMock.mock.calls[1][1]?.redirect).toBe('manual');

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-2',
          status: 'completed',
          data: { results: ['https://cdn.seevio.ai/render.mp4'] },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://evil.example/render.mp4' },
        }),
      ) as any;
    await expect(
      provider.fetchVideoGenerationResult({ ...handle, jobId: 'task-2' }),
    ).rejects.toMatchObject({ code: 'UNTRUSTED_RESULT_URL' });
  });

  it('rejects an oversized or non-video download before buffering it', async () => {
    const handle = {
      jobId: 'task',
      provider: 'seevio',
      model: 'seedance-2-5',
      createdAt: new Date().toISOString(),
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task',
          status: 'completed',
          data: { results: ['https://cdn.seevio.ai/render.mp4'] },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { 'content-type': 'video/mp4', 'content-length': '11' },
        }),
      ) as any;
    const provider = new SeevioProvider({
      type: 'seevio',
      apiKey: 'seevio-key',
      maxResultBytes: 10,
    });
    await expect(
      provider.fetchVideoGenerationResult(handle),
    ).rejects.toMatchObject({ code: 'SEEVIO_RESULT_TOO_LARGE' });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task',
          status: 'completed',
          data: { results: ['https://cdn.seevio.ai/render.mp4'] },
        }),
      )
      .mockResolvedValueOnce(
        new Response('not a video', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ) as any;
    const mimeProvider = new SeevioProvider({
      type: 'seevio',
      apiKey: 'seevio-key',
      maxResultBytes: 10,
    });
    await expect(
      mimeProvider.fetchVideoGenerationResult(handle),
    ).rejects.toMatchObject({ code: 'SEEVIO_RESULT_MIME_INVALID' });

    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task',
          status: 'completed',
          data: { results: ['https://cdn.seevio.ai/render.mp4'] },
        }),
      )
      .mockResolvedValueOnce(
        new Response('not a video', { status: 200 }),
      ) as any;
    const missingTypeProvider = new SeevioProvider({
      type: 'seevio',
      apiKey: 'seevio-key',
    });
    await expect(
      missingTypeProvider.fetchVideoGenerationResult(handle),
    ).rejects.toMatchObject({ code: 'SEEVIO_RESULT_MIME_INVALID' });
  });

  it('reports cancellation as explicitly unsupported', async () => {
    const provider = new SeevioProvider({
      type: 'seevio',
      apiKey: 'seevio-key',
    });
    await expect(
      provider.cancelVideoGenerationJob({
        jobId: 'task',
        provider: 'seevio',
        model: 'seedance-2-5',
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });

  it('does not advertise unsupported cancellation as a capability', async () => {
    const provider = new SeevioProvider({
      type: 'seevio',
      apiKey: 'seevio-key',
    });
    await expect(provider.getCapabilities()).resolves.toMatchObject({
      supportedOperations: [
        'submitVideoGenerationJob',
        'getVideoGenerationJob',
        'fetchVideoGenerationResult',
      ],
    });
  });
});

describe('openai-compat-video provider', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('requires a baseUrl', () => {
    expect(
      () =>
        new OpenAICompatVideoProvider({
          type: 'openai-compat-video',
          apiKey: 'key',
        } as any),
    ).toThrow(/baseUrl/i);
  });

  it('honors an already-aborted signal at submit time: no fetch call', async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as any;

    const provider = new OpenAICompatVideoProvider({
      type: 'openai-compat-video',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'gw-key',
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.submitVideoGenerationJob({
        prompt: 'x',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'AI_ABORTED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('submits a job using the OpenAI videos request shape', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('https://gateway.example.com/v1/videos');
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toBe('Bearer gw-key');
        const body = JSON.parse(String(init?.body));
        expect(body).toEqual({
          model: 'sora-2',
          prompt: 'a time-lapse of clouds',
          seconds: '8',
        });
        return jsonResponse({
          id: 'video_123',
          status: 'queued',
          model: 'sora-2',
        });
      },
    );
    global.fetch = fetchMock as any;

    const provider = new OpenAICompatVideoProvider({
      type: 'openai-compat-video',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'gw-key',
    });

    const job = await provider.submitVideoGenerationJob({
      prompt: 'a time-lapse of clouds',
      durationSeconds: 8,
    });

    expect(job).toEqual({
      jobId: 'video_123',
      provider: 'openai-compat-video',
      model: 'sora-2',
      createdAt: expect.any(String),
    });
    expect(JSON.parse(JSON.stringify(job))).toEqual(job);
  });

  it('submits a string-URL reference image as input_reference.image_url', async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.input_reference).toEqual({
          image_url: 'https://example.com/ref.jpg',
        });
        return jsonResponse({
          id: 'video_ref_url',
          status: 'queued',
          model: 'sora-2',
        });
      },
    );
    global.fetch = fetchMock as any;

    const provider = new OpenAICompatVideoProvider({
      type: 'openai-compat-video',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'gw-key',
    });

    await provider.submitVideoGenerationJob({
      prompt: 'p',
      referenceImages: [{ image: 'https://example.com/ref.jpg' }],
    });
  });

  it('submits a Buffer reference image as a base64 data URL input_reference.image_url', async () => {
    const buf = Buffer.from([5, 6, 7]);
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        expect(body.input_reference).toEqual({
          image_url: `data:image/png;base64,${buf.toString('base64')}`,
        });
        return jsonResponse({
          id: 'video_ref_buf',
          status: 'queued',
          model: 'sora-2',
        });
      },
    );
    global.fetch = fetchMock as any;

    const provider = new OpenAICompatVideoProvider({
      type: 'openai-compat-video',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'gw-key',
    });

    await provider.submitVideoGenerationJob({
      prompt: 'p',
      referenceImages: [{ image: buf, mimeType: 'image/png' }],
    });
  });

  it.each([
    ['queued', {}, { status: 'queued' }],
    ['in_progress', { progress: 42 }, { status: 'running', progress: 42 }],
    // LiteLLM (the primary target gateway) documents 'processing' as its
    // mid-render status rather than OpenAI's own 'in_progress'.
    ['processing', {}, { status: 'running' }],
    ['pending', {}, { status: 'running' }],
    [
      'failed',
      { error: { message: 'render error' } },
      { status: 'failed', error: 'render error' },
    ],
    ['cancelled', {}, { status: 'cancelled' }],
    [
      // An unrecognized status must map to 'running', never a terminal
      // state, so a caller never misreads a mid-render job as failed and
      // resubmits (double-billing).
      'some_future_status',
      {},
      { status: 'running', rawStatus: 'some_future_status' },
    ],
  ])('maps openai-compat-video status %s', async (status, extra, expected) => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ id: 'video_1', model: 'sora-2', status, ...extra }),
      ) as any;

    const provider = new OpenAICompatVideoProvider({
      type: 'openai-compat-video',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'gw-key',
    });

    const result = await provider.getVideoGenerationJob({
      jobId: 'video_1',
      provider: 'openai-compat-video',
      model: 'sora-2',
      createdAt: new Date().toISOString(),
    });

    expect(result).toMatchObject(expected);
  });

  it('downloads content bytes for a succeeded job when the gateway does not include a direct url', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/videos/video_1')) {
        return jsonResponse({
          id: 'video_1',
          model: 'sora-2',
          status: 'completed',
          seconds: '8',
          size: '1280x720',
        });
      }
      if (url.endsWith('/videos/video_1/content')) {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'Content-Type': 'video/mp4' },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock as any;

    const provider = new OpenAICompatVideoProvider({
      type: 'openai-compat-video',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'gw-key',
    });

    const result = await provider.fetchVideoGenerationResult({
      jobId: 'video_1',
      provider: 'openai-compat-video',
      model: 'sora-2',
      createdAt: new Date().toISOString(),
    });

    expect(result.mimeType).toBe('video/mp4');
    expect(result.durationSeconds).toBe(8);
    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
    expect(Buffer.from(result.data as Buffer)).toEqual(Buffer.from([1, 2, 3]));
  });

  it('returns the gateway-provided url directly without downloading content when present (fast path)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/videos/video_2')) {
        return jsonResponse({
          id: 'video_2',
          model: 'sora-2',
          status: 'completed',
          seconds: '4',
          url: 'https://cdn.example.com/direct.mp4',
        });
      }
      throw new Error(`Unexpected fetch (should not download content): ${url}`);
    });
    global.fetch = fetchMock as any;

    const provider = new OpenAICompatVideoProvider({
      type: 'openai-compat-video',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'gw-key',
    });

    const result = await provider.fetchVideoGenerationResult({
      jobId: 'video_2',
      provider: 'openai-compat-video',
      model: 'sora-2',
      createdAt: new Date().toISOString(),
    });

    expect(result.url).toBe('https://cdn.example.com/direct.mp4');
    expect(result.data).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the status GET
  });

  it('resumes polling from a JSON round-tripped handle on a fresh provider instance', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: 'video_resume', status: 'queued', model: 'sora-2' }),
      ) as any;

    const submitter = new OpenAICompatVideoProvider({
      type: 'openai-compat-video',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'gw-key',
    });
    const job = await submitter.submitVideoGenerationJob({ prompt: 'x' });
    const resumedHandle: VideoGenerationJob = JSON.parse(JSON.stringify(job));

    const resumeFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        'https://gateway.example.com/v1/videos/video_resume',
      );
      return jsonResponse({
        id: 'video_resume',
        model: 'sora-2',
        status: 'completed',
        url: 'https://cdn.example.com/resumed.mp4',
      });
    });
    global.fetch = resumeFetchMock as any;

    // A brand new provider instance simulating a process restart.
    const resumer = new OpenAICompatVideoProvider({
      type: 'openai-compat-video',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'gw-key',
    });
    const status = await resumer.getVideoGenerationJob(resumedHandle);

    expect(status.status).toBe('succeeded');
    expect(status.result?.url).toBe('https://cdn.example.com/resumed.mp4');
  });

  it('fetchVideoGenerationResult throws when the job has not succeeded', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ id: 'video_1', model: 'sora-2', status: 'in_progress' }),
      ) as any;

    const provider = new OpenAICompatVideoProvider({
      type: 'openai-compat-video',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'gw-key',
    });

    await expect(
      provider.fetchVideoGenerationResult({
        jobId: 'video_1',
        provider: 'openai-compat-video',
        model: 'sora-2',
        createdAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'VIDEO_JOB_NOT_READY' });
  });

  it('cancels a job via POST /videos/{id}/cancel (best-effort)', async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          'https://gateway.example.com/v1/videos/video_1/cancel',
        );
        expect(init?.method).toBe('POST');
        return jsonResponse({ id: 'video_1', status: 'cancelled' });
      },
    );
    global.fetch = fetchMock as any;

    const provider = new OpenAICompatVideoProvider({
      type: 'openai-compat-video',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'gw-key',
    });

    await expect(
      provider.cancelVideoGenerationJob({
        jobId: 'video_1',
        provider: 'openai-compat-video',
        model: 'sora-2',
        createdAt: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
  });

  describe('validateVideoGenerationAccess (sentinel-id probe)', () => {
    it('treats a 404 on the sentinel id as valid access (authenticated, resource just missing)', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(new Response('not found', { status: 404 })) as any;

      const provider = new OpenAICompatVideoProvider({
        type: 'openai-compat-video',
        baseUrl: 'https://gateway.example.com/v1',
        apiKey: 'gw-key',
      });

      await expect(provider.validateVideoGenerationAccess()).resolves.toBe(
        true,
      );
    });

    it('treats a 2xx on the sentinel id as valid access', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        jsonResponse({
          id: 'have-ai-validate-video-access',
          model: 'sora-2',
          status: 'queued',
        }),
      ) as any;

      const provider = new OpenAICompatVideoProvider({
        type: 'openai-compat-video',
        baseUrl: 'https://gateway.example.com/v1',
        apiKey: 'gw-key',
      });

      await expect(provider.validateVideoGenerationAccess()).resolves.toBe(
        true,
      );
    });

    it('throws AuthenticationError on 401', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          new Response('unauthorized', { status: 401 }),
        ) as any;

      const provider = new OpenAICompatVideoProvider({
        type: 'openai-compat-video',
        baseUrl: 'https://gateway.example.com/v1',
        apiKey: 'bad-key',
      });

      await expect(
        provider.validateVideoGenerationAccess(),
      ).rejects.toBeInstanceOf(AuthenticationError);
    });
  });

  it('wraps a fetch()-level network failure into an AIError', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as any;

    const provider = new OpenAICompatVideoProvider({
      type: 'openai-compat-video',
      baseUrl: 'https://gateway.example.com/v1',
      apiKey: 'gw-key',
    });

    await expect(
      provider.validateVideoGenerationAccess(),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
  });
});

describe('onRequest lifecycle events for video-generation operations', () => {
  it('fires onRequest for submitVideoGenerationJob and a handle-taking operation, without a chat-shaped token ceiling', async () => {
    const events: Array<Record<string, unknown>> = [];
    const stub: Partial<AIInterface> = {
      submitVideoGenerationJob: vi.fn(async () => ({
        jobId: 'job-1',
        provider: 'gemini',
        model: 'veo-3.1-generate-preview',
        createdAt: new Date().toISOString(),
      })),
      getVideoGenerationJob: vi.fn(async () => ({
        status: 'running' as const,
      })),
    };

    const observed = createObservedAI(
      stub as AIInterface,
      {
        type: 'gemini',
        onRequest: (event: unknown) =>
          events.push(event as Record<string, unknown>),
      } as any,
    );

    await observed.submitVideoGenerationJob({
      prompt: 'x',
      model: 'veo-3.1-generate-preview',
    });
    await observed.getVideoGenerationJob({
      jobId: 'job-1',
      provider: 'gemini',
      model: 'veo-3.1-generate-preview',
      createdAt: new Date().toISOString(),
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      operation: 'submitVideoGenerationJob',
      status: 'succeeded',
      model: 'veo-3.1-generate-preview',
    });
    expect(events[0].effectiveMaxOutputTokens).toBeUndefined();
    expect(events[1]).toMatchObject({
      operation: 'getVideoGenerationJob',
      status: 'succeeded',
      model: 'veo-3.1-generate-preview',
    });
    expect(events[1].effectiveMaxOutputTokens).toBeUndefined();
  });
});

describe('getAIAuto video-provider precedence', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('prefers a general-purpose provider over a video-only env signal', async () => {
    delete process.env.HAVE_AI_PROVIDER;
    delete process.env.HAVE_AI_TYPE;
    delete process.env.HAVE_AI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-precedence-test';
    process.env.MODELARK_API_KEY = 'modelark-precedence-test';
    process.env.OPENAI_COMPAT_VIDEO_BASE_URL = 'https://gateway.example.com/v1';

    const client = await getAIAuto({});

    expect(client).toBeInstanceOf(OpenAIProvider);
  });

  it('falls back to a video-only provider only when nothing general-purpose matches', async () => {
    delete process.env.HAVE_AI_PROVIDER;
    delete process.env.HAVE_AI_TYPE;
    delete process.env.HAVE_AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.HF_TOKEN;
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_DEFAULT_REGION;
    delete process.env.OLLAMA_HOST;
    delete process.env.OLLAMA_BASE_URL;
    delete process.env.OLLAMA_API_KEY;
    delete process.env.LITELLM_BASE_URL;
    delete process.env.LITELLM_API_KEY;
    delete process.env.BIFROST_BASE_URL;
    delete process.env.OPENAI_COMPAT_VIDEO_BASE_URL;
    process.env.MODELARK_API_KEY = 'modelark-fallback-test';

    const client = await getAIAuto({});

    expect(client).toBeInstanceOf(ByteplusModelArkProvider);
  });
});
