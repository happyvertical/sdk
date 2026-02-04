import { describe, expect, it } from 'vitest';
import { ComfyUIClient, injectWorkflowParams } from './index.js';

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
