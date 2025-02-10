import { AIThread } from './thread';

export interface AIMessageOptions {
  role?: 'user' | 'assistant' | 'system';
  responseFormat?: { type: 'text' | 'json_object' };
}

export class AIMessage {
  protected options;
  public name: string;
  public content: string;
  public role: 'user' | 'assistant' | 'system';

  constructor(options: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    name: string;
  }) {
    this.options = options;
    this.role = options.role;
    this.content = options.content;
    this.name = options.name;
  }

  static async create(options: {
    thread: AIThread;
    role: 'user' | 'assistant' | 'system';
    content: string;
    name: string;
  }) {
    return new AIMessage(options);
  }
}
