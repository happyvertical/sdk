import 'openai/shims/node';
import OpenAI from 'openai';

import type { AIMessageOptions } from './message.js';

export interface AIClientOptions {
  type?: string;
  responseFormat?: string;
  apiKey?: string;
  baseUrl?: string;
}


export interface AIClientInterface {
  options: AIClientOptions;
  message(text: string, options: AIMessageOptions): Promise<unknown>;
  textCompletion(text: string, options: AIMessageOptions): Promise<unknown>;
}

function isOpenAIClientOptions(
  options: AIClientOptions,
): options is OpenAIClientOptions {
  return options.type === 'openai' && 'apiKey' in options;
}

export interface AITextCompletionOptions {
  model?: string;
  timeout?: number;
  role?: OpenAI.Chat.ChatCompletionRole;
  history?: OpenAI.Chat.ChatCompletionMessageParam[];
  name?: string;
  frequencyPenalty?: number;
  logitBias?: Record<string, number>;
  logprobs?: boolean;
  topLogprobs?: number;
  maxTokens?: number;
  n?: number;
  presencePenalty?: number;
  responseFormat?: { type: 'text' | 'json_object' };
  seed?: number;
  stop?: string | Array<string>;
  stream?: boolean;
  temperature?: number;
  topProbability?: number;
  tools?: Array<any>; // todo: figure out generic solution - Array<OpenAI.Chat.ChatCompletionTool>;
  toolChoice?:
    | 'none'
    | 'auto'
    | { type: 'function'; function: { name: string } };
  user?: string;
  onProgress?: (partialMessage: string) => void;
}

export class AIClient {
  public options: AIClientOptions;

  constructor(options: AIClientOptions) {
    this.options = options;
  }

  public async message(
    text: string,
    options: AITextCompletionOptions = { role: 'user' },
  ) {
    return 'not a real ai message, this is the base class!';
  }

  public static async create<T extends AIClientOptions>(
    options: T,
  ): Promise<AIClient | OpenAIClient> {
    if (isOpenAIClientOptions(options)) {
      return OpenAIClient.create(options);
    }
    throw new Error('Invalid client type');
  }

  public textCompletion(
    text: string,
    options: AITextCompletionOptions = {
      role: 'user',
    },
  ) {
    return this.message(text, options);
  }
}

export async function getOpenAI(options: {
  apiKey?: string;
  baseUrl?: string;
}) {
  return new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseUrl,
  });
}

export interface OpenAITextCompletionOptions {
  model?: string;
  timeout?: number;
  role?: OpenAI.Chat.ChatCompletionRole;
  history?: Array<OpenAI.Chat.ChatCompletionMessageParam>;
  name?: string;
  frequencyPenalty?: number;
  logitBias?: Record<string, number>;
  logprobs?: boolean;
  topLogprobs?: number;
  maxTokens?: number;
  n?: number;
  presencePenalty?: number;
  responseFormat?: { type: 'text' | 'json_object' };
  seed?: number;
  stop?: string | Array<string>;
  stream?: boolean;
  temperature?: number;
  topProbability?: number;
  tools?: Array<OpenAI.Chat.ChatCompletionTool>;
  toolChoice?:
    | 'none'
    | 'auto'
    | { type: 'function'; function: { name: string } };
  user?: string;
  onProgress?: (partialMessage: string) => void;
}

export interface OpenAIClientOptions extends AIClientOptions {
  apiKey?: string;
  baseUrl?: string;
}

export class OpenAIClient extends AIClient {
  protected openai!: OpenAI;
  public options: OpenAIClientOptions;

  constructor(options: OpenAIClientOptions) {
    super(options);
    this.options = options;
  }

  public async message(
    text: string,
    options: AIMessageOptions = { role: 'user' },
  ) {
    const response = await this.textCompletion(text, options);
    return response;
  }

  public static async create(
    options: OpenAIClientOptions,
  ): Promise<OpenAIClient> {
    const client = new OpenAIClient(options);
    await client.initialize();
    return client;
  }

  protected async initialize() {
    this.openai = new OpenAI({
      apiKey: this.options.apiKey,
      baseURL: this.options.baseUrl,
    });
  }

  /**
   * Sends a message using the OpenAI Chat API.
   *
   * @param {string} message - The message to send.
   * @param {object} options - Configuration options for the message.
   * @param {OpenAI} options.openai - The OpenAI instance to use.
   * @param {string} [options.model='gpt-4'] - ID of the model to use. See the model endpoint compatibility table for details on which models work with the Chat API.
   * @param {number} [options.timeout=10000] - Timeout for the API call in milliseconds.
   * @param {string} [options.role='user'] - The role of the sender in the conversation.
   * @param {Array<object>} [options.history=[]] - A list of previous messages in the conversation.
   * @param {string} options.name - The name of the sender.
   * @param {number} [options.frequencyPenalty=0] - Number between -2.0 and 2.0. Penalizes new tokens based on their existing frequency in the text.
   * @param {Record<string, number>} [options.logitBias] - Modifies the likelihood of specified tokens appearing in the completion.
   * @param {boolean} [options.logprobs=false] - Whether to return log probabilities of the output tokens.
   * @param {number} [options.topLogprobs] - Specifies the number of most likely tokens to return at each token position with log probabilities.
   * @param {number} [options.maxTokens] - The maximum number of tokens for chat completion.
   * @param {number} [options.n=1] - Number of chat completion choices to generate.
   * @param {number} [options.presencePenalty=0] - Number between -2.0 and 2.0. Penalizes new tokens based on their appearance in the text.
   * @param {object} [options.responseFormat] - Specifies the format of the model's output.
   * @param {number} [options.seed] - Seed for deterministic sampling.
   * @param {string|string[]} [options.stop] - Sequences where the API stops generating further tokens.
   * @param {boolean} [options.stream=false] - If true, sends partial message deltas.
   * @param {number} [options.temperature=1] - Sampling temperature, between 0 and 2.
   * @param {number} [options.topProbability=1] - Nucleus sampling parameter.
   * @param {Array<OpenAI.Chat.ChatCompletionTool>} [options.tools] - List of tools the model may call.
   * @param {string|object} [options.toolChoice] - Controls which function is called by the model.
   * @param {string} [options.user] - Unique identifier for the end-user.
   * @param {function} [options.onProgress] - Callback function to handle partial message updates.
   *
   * @returns {Promise<string>} The response from the OpenAI API.
   */

  public async textCompletion(
    message: string,
    options: OpenAITextCompletionOptions = {},
  ): Promise<string> {
    const {
      model = 'gpt-4o',
      role = 'user',
      history = [],
      name,
      frequencyPenalty: frequency_penalty = 0,
      logitBias: logit_bias,
      logprobs = false,
      topLogprobs: top_logprobs,
      maxTokens: max_tokens,
      n = 1,
      presencePenalty: presence_penalty = 0,
      responseFormat: response_format,
      seed,
      stop,
      stream = false,
      temperature = 1,
      topProbability: top_p = 1,
      tools,
      toolChoice: tool_choice,
      user,
      onProgress,
    } = options;

    const messages = [
      ...history,
      {
        role: role as OpenAI.Chat.ChatCompletionRole,
        content: message,
      } as OpenAI.Chat.ChatCompletionSystemMessageParam,
    ];

    if (onProgress) {
      const stream = await this.openai.chat.completions.create({
        model,
        messages,
        stream: true,
        frequency_penalty,
        logit_bias,
        logprobs,
        top_logprobs,
        max_tokens,
        n,
        presence_penalty,
        response_format,
        seed,
        stop,
        temperature,
        top_p,
        tools,
        tool_choice,
        user,
      });

      let fullContent = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        fullContent += content;
        onProgress(content);
      }

      return fullContent;
    } else {
      const response = await this.openai.chat.completions.create({
        model,
        messages,
        frequency_penalty,
        logit_bias,
        logprobs,
        top_logprobs,
        max_tokens,
        n,
        presence_penalty,
        response_format,
        seed,
        stop,
        stream: false,
        temperature,
        top_p,
        tools,
        tool_choice,
        user,
      });

      const choice = response.choices[0];
      if (!choice || !choice.message || !choice.message.content) {
        throw new Error('Invalid response from OpenAI API: Missing content');
      }
      return choice.message.content;
    }
  }
}

type GetAIClientOptions = OpenAIClientOptions & { type?: 'openai' };

export async function getAIClient(
  options: GetAIClientOptions,
): Promise<AIClient> {
  if (options.type === 'openai') {
    return OpenAIClient.create(options);
  } else {
    throw new Error('Invalid client type');
  }
}
