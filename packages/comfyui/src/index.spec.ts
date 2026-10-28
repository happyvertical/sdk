import { ApiError } from '@happyvertical/utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ComfyUIClient,
  ComfyUIRequestError,
  injectWorkflowParams,
} from './index.js';

describe('comfyui package', () => {
  describe('exports', () => {
    it('should export ComfyUIClient class', () => {
      expect(ComfyUIClient).toBeDefined();
      expect(typeof ComfyUIClient).toBe('function');
    });

    it('should export injectWorkflowParams function', () => {
      expect(typeof injectWorkflowParams).toBe('function');
    });
  });

  describe('ComfyUIClient', () => {
    it('should create client with url', () => {
      const client = new ComfyUIClient({
        url: 'http://localhost:8188',
      });
      expect(client).toBeInstanceOf(ComfyUIClient);
    });

    it('should create client with custom options', () => {
      const client = new ComfyUIClient({
        url: 'http://localhost:8188',
        timeout: 60000,
        clientId: 'test-client',
      });
      expect(client).toBeInstanceOf(ComfyUIClient);
    });

    it('should create client with basic auth credentials', () => {
      const client = new ComfyUIClient({
        url: 'http://localhost:8188',
        username: 'admin',
        password: 'secret',
      });
      expect(client).toBeInstanceOf(ComfyUIClient);
    });

    it('should generate Authorization header from credentials', () => {
      const client = new ComfyUIClient({
        url: 'http://localhost:8188',
        username: 'admin',
        password: 'secret',
      });
      const options = (client as any).options;
      const expected = `Basic ${btoa('admin:secret')}`;
      expect(options.headers.Authorization).toBe(expected);
    });

    it('should not generate Authorization header without both credentials', () => {
      const clientNoPass = new ComfyUIClient({
        url: 'http://localhost:8188',
        username: 'admin',
      });
      expect(
        (clientNoPass as any).options.headers.Authorization,
      ).toBeUndefined();

      const clientNoUser = new ComfyUIClient({
        url: 'http://localhost:8188',
        password: 'secret',
      });
      expect(
        (clientNoUser as any).options.headers.Authorization,
      ).toBeUndefined();
    });

    it('should embed credentials in WebSocket URL', () => {
      const client = new ComfyUIClient({
        url: 'http://localhost:8188',
        username: 'admin',
        password: 'secret',
      });
      const wsUrl = (client as any).wsUrl;
      expect(wsUrl).toMatch(/^ws:\/\/admin:secret@localhost:8188\/ws/);
    });

    it('should not embed credentials in WebSocket URL without auth', () => {
      const client = new ComfyUIClient({
        url: 'http://localhost:8188',
      });
      const wsUrl = (client as any).wsUrl;
      expect(wsUrl).toMatch(/^ws:\/\/localhost:8188\/ws/);
      expect(wsUrl).not.toContain('@');
    });
  });

  describe('injectWorkflowParams', () => {
    it('should inject parameters into workflow', () => {
      const workflow = {
        '3': {
          inputs: { image: 'placeholder.png' },
          class_type: 'LoadImage',
        },
        '6': {
          inputs: { text: 'default prompt' },
          class_type: 'CLIPTextEncode',
        },
      };

      const nodeMapping = {
        seedImage: '3',
        prompt: '6',
      };

      const params = {
        seedImage: 'input/anchor.png',
        prompt: 'professional news anchor',
      };

      const result = injectWorkflowParams(workflow, nodeMapping, params);

      expect(result['3'].inputs.image).toBe('input/anchor.png');
      expect(result['6'].inputs.text).toBe('professional news anchor');
    });
  });
});

describe('ComfyUIRequestError', () => {
  // ComfyUI 0.34 answers a prompt that fails validation with this HTTP 400 body.
  const validationBody = {
    error: {
      type: 'prompt_outputs_failed_validation',
      message: 'Prompt outputs failed validation',
      details: '',
      extra_info: {},
    },
    node_errors: {
      '1': {
        errors: [
          {
            type: 'value_not_in_list',
            message: 'Value not in list',
            details: "unet_name: 'missing.safetensors' not in []",
          },
        ],
        class_type: 'UNETLoader',
      },
    },
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respondWith(status: number, body: string) {
    const fetchMock = vi.fn(async () => new Response(body, { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('carries the status and node errors of a rejected prompt', async () => {
    respondWith(400, JSON.stringify(validationBody));
    const client = new ComfyUIClient({ url: 'http://comfy.test' });

    const error = await client.queuePrompt({}).catch((caught) => caught);

    expect(error).toBeInstanceOf(ComfyUIRequestError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      name: 'ComfyUIRequestError',
      status: 400,
      method: 'POST',
      path: '/prompt',
      nodeErrors: validationBody.node_errors,
      promptError: validationBody.error,
    });
    expect(error.body).toEqual(validationBody);
    // The message keeps the earlier text so callers matching on it still work.
    expect(error.message).toBe(
      `ComfyUI request failed: 400 ${JSON.stringify(validationBody)}`,
    );
  });

  it('keeps a non-JSON body as text and reports no node errors', async () => {
    respondWith(502, 'Bad Gateway');
    const client = new ComfyUIClient({ url: 'http://comfy.test' });

    const error = await client.getSystemStats().catch((caught) => caught);

    expect(error).toBeInstanceOf(ComfyUIRequestError);
    expect(error).toMatchObject({
      status: 502,
      method: 'GET',
      body: 'Bad Gateway',
    });
    expect(error.nodeErrors).toBeUndefined();
    expect(error.promptError).toBeUndefined();
  });

  it('reports no node errors when ComfyUI sends an empty map', () => {
    const error = new ComfyUIRequestError({
      status: 400,
      method: 'POST',
      path: '/prompt',
      bodyText: JSON.stringify({
        error: { type: 'invalid_prompt' },
        node_errors: {},
      }),
    });
    expect(error.nodeErrors).toBeUndefined();
    expect(error.promptError).toEqual({ type: 'invalid_prompt' });
  });
});
