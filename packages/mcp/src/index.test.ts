/**
 * MCP Server Tests
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { setupPrompts } from './prompts/index.js';
import { setupResources } from './resources/index.js';
import { setupTools } from './tools/index.js';

describe('MCP Server Components', () => {
  describe('Resources', () => {
    let resources: any;

    beforeEach(() => {
      resources = setupResources();
    });

    it('should list all available resources', () => {
      const resourceList = resources.list();
      expect(resourceList).toBeDefined();
      expect(Array.isArray(resourceList)).toBe(true);
      expect(resourceList.length).toBeGreaterThan(0);

      // Check for key resources
      const resourceNames = resourceList.map((r: any) => r.uri);
      expect(resourceNames).toContain('smrt://docs/core/smrt-object');
      expect(resourceNames).toContain('smrt://docs/fields/overview');
      expect(resourceNames).toContain('smrt://examples/basic-object');
    });

    it('should read core documentation', async () => {
      const content = await resources.read('smrt://docs/core/smrt-object');
      expect(content).toBeDefined();
      expect(content.text).toBeDefined();
      expect(content.mimeType).toBe('text/markdown');
      expect(content.text.length).toBeGreaterThan(0);
    });

    it('should read field documentation', async () => {
      const content = await resources.read('smrt://docs/fields/overview');
      expect(content).toBeDefined();
      expect(content.text).toContain('Field definitions');
    });

    it('should return null for non-existent resources', async () => {
      const content = await resources.read('smrt://non-existent/resource');
      expect(content).toBeNull();
    });
  });

  describe('Tools', () => {
    let tools: any;

    beforeEach(() => {
      tools = setupTools();
    });

    it('should list all available tools', () => {
      const toolList = tools.list();
      expect(toolList).toBeDefined();
      expect(Array.isArray(toolList)).toBe(true);
      expect(toolList.length).toBeGreaterThan(0);

      // Check for key tools
      const toolNames = toolList.map((t: any) => t.name);
      expect(toolNames).toContain('generate-smrt-class');
      expect(toolNames).toContain('add-ai-methods');
      expect(toolNames).toContain('validate-smrt-object');
    });

    it('should generate SMRT class with basic fields', async () => {
      const result = await tools.execute('generate-smrt-class', {
        className: 'TestProduct',
        fields: [
          { name: 'name', type: 'text', options: { required: true } },
          { name: 'price', type: 'decimal', options: { min: 0 } },
          { name: 'inStock', type: 'boolean', options: { default: true } },
        ],
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).toContain('class TestProduct extends SmrtObject');
      expect(result).toContain('@smrt()');
      expect(result).toContain('name = text({ required: true })');
      expect(result).toContain('price = decimal({ min: 0 })');
      expect(result).toContain('inStock = boolean({ default: true })');
    });

    it('should add AI methods to existing class', async () => {
      const result = await tools.execute('add-ai-methods', {
        className: 'TestClass',
        methods: [
          { name: 'analyze', type: 'do', description: 'Analyze the object' },
          { name: 'isValid', type: 'is', description: 'Check if valid' },
        ],
      });

      expect(result).toBeDefined();
      expect(result).toContain('async analyze()');
      expect(result).toContain('this.do(');
      expect(result).toContain('async isValid()');
      expect(result).toContain('this.is(');
    });

    it('should validate SMRT object code', async () => {
      const validCode = `
        import { SmrtObject, smrt, text } from '@have/smrt';

        @smrt()
        export class TestObject extends SmrtObject {
          name = text({ required: true });

          constructor(options: any) {
            super(options);
            Object.assign(this, options);
          }
        }
      `;

      const result = await tools.execute('validate-smrt-object', {
        code: validCode,
      });

      expect(result).toBeDefined();
      expect(result).toContain('Validation passed');
    });

    it('should handle tool execution errors gracefully', async () => {
      await expect(tools.execute('non-existent-tool', {})).rejects.toThrow(
        'Unknown tool',
      );
    });
  });

  describe('Prompts', () => {
    let prompts: any;

    beforeEach(() => {
      prompts = setupPrompts();
    });

    it('should list all available prompts', () => {
      const promptList = prompts.list();
      expect(promptList).toBeDefined();
      expect(Array.isArray(promptList)).toBe(true);
      expect(promptList.length).toBeGreaterThan(0);

      // Check for key prompts
      const promptNames = promptList.map((p: any) => p.name);
      expect(promptNames).toContain('new-smrt-project');
      expect(promptNames).toContain('business-object');
      expect(promptNames).toContain('ai-integration');
    });

    it('should generate new project prompt', async () => {
      const result = await prompts.get('new-smrt-project', {
        projectName: 'TestApp',
        projectType: 'web-app',
        useTypeScript: true,
      });

      expect(result).toBeDefined();
      expect(result.description).toContain('TestApp');
      expect(result.messages).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('should generate business object prompt', async () => {
      const result = await prompts.get('business-object', {
        objectName: 'Customer',
        domain: 'e-commerce',
        includeAI: true,
      });

      expect(result).toBeDefined();
      expect(result.description).toContain('Customer');
      expect(result.messages[0].content.text).toContain('Customer');
      expect(result.messages[0].content.text).toContain('e-commerce');
    });

    it('should return null for non-existent prompts', async () => {
      const result = await prompts.get('non-existent-prompt', {});
      expect(result).toBeNull();
    });
  });

  describe('Integration', () => {
    it('should have consistent interfaces across components', () => {
      const resources = setupResources();
      const tools = setupTools();
      const prompts = setupPrompts();

      // All components should have list() method
      expect(typeof resources.list).toBe('function');
      expect(typeof tools.list).toBe('function');
      expect(typeof prompts.list).toBe('function');

      // All should return arrays
      expect(Array.isArray(resources.list())).toBe(true);
      expect(Array.isArray(tools.list())).toBe(true);
      expect(Array.isArray(prompts.list())).toBe(true);
    });
  });
});
