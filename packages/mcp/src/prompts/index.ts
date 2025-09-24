/**
 * MCP Prompts for SMRT Framework Development
 */

import type { Prompt } from '@modelcontextprotocol/sdk/types.js';
import { aiIntegrationPrompt } from './ai-integration.js';
import { apiSetupPrompt } from './api-setup.js';
import { businessObjectPrompt } from './business-object.js';
import { migrationPrompt } from './migration.js';
import { newSmrtProjectPrompt } from './new-project.js';

export interface PromptManager {
  list(): Prompt[];
  get(name: string, args: Record<string, any>): Promise<any> | any;
}

class PromptHandler implements PromptManager {
  private prompts: Map<string, Prompt> = new Map();
  private handlers: Map<string, (args: any) => Promise<any> | any> = new Map();

  constructor() {
    this.registerPrompts();
  }

  private registerPrompts() {
    // New SMRT project setup
    this.registerPrompt(
      {
        name: 'new-smrt-project',
        description: 'Initialize a new project using the SMRT framework',
        arguments: [
          {
            name: 'projectName',
            description: 'Name of the project',
            required: true,
          },
          {
            name: 'projectType',
            description:
              'Type of project (web-app, api-server, cli-tool, mcp-server)',
            required: false,
          },
          {
            name: 'useTypeScript',
            description: 'Use TypeScript instead of JavaScript',
            required: false,
          },
          {
            name: 'includeDatabase',
            description: 'Include database setup (SQLite/PostgreSQL)',
            required: false,
          },
        ],
      },
      newSmrtProjectPrompt,
    );

    // Business object creation
    this.registerPrompt(
      {
        name: 'business-object',
        description: 'Create a business object with SMRT framework patterns',
        arguments: [
          {
            name: 'objectName',
            description:
              'Name of the business object (e.g., Product, User, Order)',
            required: true,
          },
          {
            name: 'domain',
            description:
              'Business domain (e.commerce, content, hr, finance, etc.)',
            required: false,
          },
          {
            name: 'includeRelationships',
            description: 'Include relationship fields to other objects',
            required: false,
          },
          {
            name: 'includeAI',
            description: 'Include AI-powered methods',
            required: false,
          },
        ],
      },
      businessObjectPrompt,
    );

    // AI integration
    this.registerPrompt(
      {
        name: 'ai-integration',
        description: 'Add AI capabilities to existing SMRT objects',
        arguments: [
          {
            name: 'objectName',
            description: 'Name of the existing object',
            required: true,
          },
          {
            name: 'aiCapabilities',
            description:
              'Types of AI capabilities to add (analysis, validation, generation)',
            required: false,
          },
          {
            name: 'aiProvider',
            description: 'AI provider to use (openai, anthropic, gemini)',
            required: false,
          },
        ],
      },
      aiIntegrationPrompt,
    );

    // API setup
    this.registerPrompt(
      {
        name: 'api-setup',
        description: 'Set up REST API generation for SMRT objects',
        arguments: [
          {
            name: 'objects',
            description: 'List of object names to include in API',
            required: true,
          },
          {
            name: 'includeAuth',
            description: 'Include authentication middleware',
            required: false,
          },
          {
            name: 'includeSwagger',
            description: 'Generate OpenAPI/Swagger documentation',
            required: false,
          },
        ],
      },
      apiSetupPrompt,
    );

    // Migration helper
    this.registerPrompt(
      {
        name: 'migrate-to-smrt',
        description: 'Migrate existing TypeScript classes to SMRT framework',
        arguments: [
          {
            name: 'existingCode',
            description: 'Existing class code to migrate',
            required: true,
          },
          {
            name: 'preserveExisting',
            description: 'Preserve existing methods and functionality',
            required: false,
          },
          {
            name: 'addAI',
            description: 'Add AI capabilities during migration',
            required: false,
          },
        ],
      },
      migrationPrompt,
    );

    // Quick templates
    this.registerPrompt(
      {
        name: 'quick-crud',
        description: 'Quickly create a CRUD object with standard fields',
        arguments: [
          {
            name: 'objectName',
            description: 'Name of the object',
            required: true,
          },
          {
            name: 'template',
            description: 'Template type (user, product, article, task, event)',
            required: false,
          },
        ],
      },
      this.quickCrudPrompt,
    );

    // Best practices guide
    this.registerPrompt(
      {
        name: 'best-practices',
        description: 'Get SMRT framework best practices and guidelines',
        arguments: [
          {
            name: 'topic',
            description:
              'Specific topic (field-design, ai-methods, performance, testing)',
            required: false,
          },
        ],
      },
      this.bestPracticesPrompt,
    );

    // Troubleshooting
    this.registerPrompt(
      {
        name: 'troubleshoot',
        description: 'Help troubleshoot common SMRT framework issues',
        arguments: [
          {
            name: 'issue',
            description: 'Description of the issue or error',
            required: true,
          },
          {
            name: 'context',
            description: 'Additional context (code snippets, error messages)',
            required: false,
          },
        ],
      },
      this.troubleshootPrompt,
    );
  }

  private registerPrompt(
    prompt: Prompt,
    handler: (args: any) => Promise<any> | any,
  ) {
    this.prompts.set(prompt.name, prompt);
    this.handlers.set(prompt.name, handler);
  }

  list(): Prompt[] {
    return Array.from(this.prompts.values());
  }

  async get(name: string, args: Record<string, any>): Promise<any> {
    const handler = this.handlers.get(name);
    if (!handler) {
      return null;
    }

    try {
      return await handler(args);
    } catch (error) {
      throw new Error(
        `Prompt execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Built-in prompt handlers
  private quickCrudPrompt = (args: any) => {
    const { objectName, template = 'basic' } = args;

    const templates = {
      user: 'Create a User object with email, name, role, and authentication fields',
      product:
        'Create a Product object with name, description, price, and inventory fields',
      article:
        'Create an Article object with title, content, author, and publishing fields',
      task: 'Create a Task object with title, description, priority, and status fields',
      event:
        'Create an Event object with title, description, start/end dates, and location fields',
      basic: 'Create a basic object with name, description, and common fields',
    };

    const templateDescription =
      templates[template as keyof typeof templates] || templates.basic;

    return {
      description: `Quick CRUD setup for ${objectName}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I want to create a new SMRT object called "${objectName}". ${templateDescription}.

Please help me:
1. Generate the complete class with proper @smrt decorator
2. Include appropriate field definitions with validation
3. Add basic lifecycle hooks
4. Include AI-powered methods for common operations
5. Set up collection class for managing multiple instances

Make sure to follow SMRT framework best practices and include comprehensive examples.`,
          },
        },
      ],
    };
  };

  private bestPracticesPrompt = (args: any) => {
    const { topic = 'general' } = args;

    const topics = {
      'field-design':
        'Focus on field definition patterns, validation, and database schema design',
      'ai-methods':
        'Focus on implementing effective AI-powered methods using do(), is(), and describe()',
      performance:
        'Focus on performance optimization, caching, and efficient queries',
      testing: 'Focus on testing strategies for SMRT objects and AI methods',
      security:
        'Focus on security best practices, encryption, and access control',
      deployment:
        'Focus on deployment strategies and production considerations',
      general: 'Provide general best practices and guidelines',
    };

    const focus = topics[topic as keyof typeof topics] || topics.general;

    return {
      description: `SMRT Framework Best Practices: ${topic}`,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I want to learn about SMRT framework best practices. ${focus}.

Please provide:
1. Key principles and guidelines
2. Common patterns and anti-patterns
3. Practical examples and code snippets
4. Performance considerations
5. Security and reliability best practices
6. Real-world implementation tips

Make the guidance actionable and include specific examples that I can apply to my projects.`,
          },
        },
      ],
    };
  };

  private troubleshootPrompt = (args: any) => {
    const { issue, context = '' } = args;

    return {
      description: 'SMRT Framework Troubleshooting',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `I'm having an issue with the SMRT framework: ${issue}

${context ? `Additional context:\n${context}\n` : ''}

Please help me:
1. Identify the root cause of the issue
2. Provide step-by-step troubleshooting steps
3. Suggest specific fixes or workarounds
4. Explain how to prevent similar issues in the future
5. Recommend testing strategies to verify the fix

If this is a common issue, please also provide general guidance for avoiding it in future projects.`,
          },
        },
      ],
    };
  };
}

export function setupPrompts(): PromptManager {
  return new PromptHandler();
}
