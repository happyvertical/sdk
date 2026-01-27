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
