import { AIClient, type AIClientOptions } from './client.js';
import { AIMessage } from './message.js';
import OpenAI from 'openai';
export interface AIThreadOptions {
  ai: AIClientOptions;
}

export class AIThread {
  protected ai!: AIClient;
  protected options: AIThreadOptions;
  private messages: AIMessage[] = [];
  private references: { [name: string]: string } = {}; // Store references

  constructor(options: AIThreadOptions) {
    this.options = options;
  }

  static async create(options: AIThreadOptions) {
    const thread = new AIThread(options);
    await thread.initialize();
    return thread; // No need to add system message here, do it in addSystem
  }

  public async initialize() {
    this.ai = await AIClient.create(this.options.ai);
  }

  public async addSystem(prompt: string) {
    const message = await AIMessage.create({
      thread: this,
      role: 'system',
      name: 'system',
      content: prompt,
    });

    this.messages.push(message);
    return message;
  }

  public async add(options: {
    role: 'user' | 'assistant' | 'system';
    name?: string; // Optional name
    content: string;
  }) {
    const message = await AIMessage.create({
      thread: this,
      role: options.role,
      name: options.name || options.role, // Default name to role if not provided
      content: options.content,
    });

    this.messages.push(message);
    return message;
  }

  public get(): AIMessage[] {
    return this.messages;
  }

  public addReference(name: string, body: string): void {
    this.references[name] = body;
  }

  public assembleHistory(): OpenAI.Chat.ChatCompletionMessageParam[] {
    const history: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Add system message first
    const systemMessage = this.messages.find((m) => m.role === 'system');
    if (systemMessage) {
      history.push({
        role: systemMessage.role,
        content: systemMessage.content,
      });
    }

    // Add references as user messages (before other user/assistant messages)
    for (const name in this.references) {
      history.push({
        role: 'user',
        content: `Reference - ${name}:\n${this.references[name]}`,
      });
    }

    // Add other messages
    this.messages
      .filter((m) => m.role !== 'system')
      .forEach((message) => {
        history.push({ role: message.role, content: message.content });
      });

    return history;
  }

  public async do(
    prompt: string,
    options: {
      responseFormat?: 'html' | 'text' | 'json';
    } = {
      responseFormat: 'text',
    },
  ) {
    const { responseFormat } = options;
    const history = this.assembleHistory();

    // Now you can use the assembled history:
    const response = await this.ai.textCompletion(prompt, {
      history, // Use the messages array here
      responseFormat: {
        type: responseFormat === 'json' ? 'json_object' : 'text',
      },
    });
    return response;
  }
}
