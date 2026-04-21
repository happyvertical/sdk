/**
 * Hugging Face provider implementation
 */

import type {
  AICapabilities,
  AIInterface,
  AIMessage,
  AIModel,
  AIResponse,
  ChatOptions,
  CompletionOptions,
  EmbeddingOptions,
  EmbeddingResponse,
  HuggingFaceOptions,
  ImageDescriptionOptions,
  ImageEmbeddingOptions,
  ImageGenerationOptions,
  ImageGenerationResponse,
  MessageOptions,
  TokenUsage,
  TTSOptions,
  TTSResponse,
  Voice,
  VoiceCloneOptions,
  VoiceDesignOptions,
  VoiceListOptions,
} from '../types';
import {
  AIError,
  AuthenticationError,
  ContextLengthError,
  extractTextContent,
  ModelNotFoundError,
  RateLimitError,
} from '../types';
import { emitUsage } from './usage';

export class HuggingFaceProvider implements AIInterface {
  private options: HuggingFaceOptions;
  private baseUrl: string;

  constructor(options: HuggingFaceOptions) {
    this.options = {
      defaultModel: 'microsoft/DialoGPT-medium',
      useCache: true,
      waitForModel: true,
      ...options,
    };

    this.baseUrl =
      this.options.endpoint || 'https://api-inference.huggingface.co';
  }

  async chat(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): Promise<AIResponse> {
    const startTime = Date.now();
    try {
      // Convert messages to a single prompt for text generation models
      const prompt = this.messagesToPrompt(messages);
      const model =
        options.model || this.options.model || this.options.defaultModel;

      const response = await this.makeRequest(`/models/${model}`, {
        inputs: prompt,
        parameters: {
          max_new_tokens: options.maxTokens || 512,
          temperature: options.temperature || 1.0,
          top_p: options.topP || 1.0,
          do_sample: (options.temperature && options.temperature > 0) || false,
          stop_sequences: Array.isArray(options.stop)
            ? options.stop
            : options.stop
              ? [options.stop]
              : undefined,
        },
        options: {
          use_cache: this.options.useCache,
          wait_for_model: this.options.waitForModel,
        },
      });

      if (Array.isArray(response) && response[0]?.generated_text) {
        const generatedText = response[0].generated_text;
        // Remove the input prompt from the response
        const content = generatedText.replace(prompt, '').trim();

        emitUsage(
          this.options,
          'huggingface',
          'chat',
          model!,
          undefined,
          startTime,
          options.usageTags,
        );

        return {
          content,
          model,
          finishReason: 'stop',
        };
      }

      throw new AIError(
        'Invalid response format from Hugging Face',
        'INVALID_RESPONSE',
        'huggingface',
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async complete(
    prompt: string,
    options: CompletionOptions = {},
  ): Promise<AIResponse> {
    return this.chat([{ role: 'user', content: prompt }], {
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      n: options.n,
      stop: options.stop,
      stream: options.stream,
      onProgress: options.onProgress,
      usageTags: options.usageTags,
    });
  }

  /**
   * Simple message interface for single-turn interactions with optional history
   *
   * @param text - The message text to send
   * @param options - Configuration options including history, model, etc.
   * @returns Promise resolving to the response content string
   */
  async message(text: string, options: MessageOptions = {}): Promise<string> {
    // Build messages array from history + current message
    const messages: AIMessage[] = [
      ...(options.history || []),
      { role: options.role || 'user', content: text },
    ];

    const response = await this.chat(messages, {
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      stop: options.stop,
      stream: options.stream,
      frequencyPenalty: options.frequencyPenalty,
      presencePenalty: options.presencePenalty,
      responseFormat: options.responseFormat,
      seed: options.seed,
      tools: options.tools,
      toolChoice: options.toolChoice,
      onProgress: options.onProgress,
      usageTags: options.usageTags,
    });

    return response.content;
  }

  async embed(
    text: string | string[],
    options: EmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    const startTime = Date.now();
    try {
      const input = Array.isArray(text) ? text : [text];
      const model = options.model || 'sentence-transformers/all-MiniLM-L6-v2';

      const response = await this.makeRequest(`/models/${model}`, {
        inputs: input,
        options: {
          use_cache: this.options.useCache,
          wait_for_model: this.options.waitForModel,
        },
      });

      // Handle different response formats from different embedding models
      let embeddings: number[][];
      if (Array.isArray(response) && Array.isArray(response[0])) {
        // Direct array of embeddings
        embeddings = Array.isArray(text) ? response : [response[0]];
      } else if (
        response &&
        typeof response === 'object' &&
        response.embeddings
      ) {
        // Response with embeddings property
        embeddings = response.embeddings;
      } else {
        throw new AIError(
          'Invalid embedding response format',
          'INVALID_RESPONSE',
          'huggingface',
        );
      }

      emitUsage(
        this.options,
        'huggingface',
        'embed',
        model,
        undefined,
        startTime,
        options.usageTags,
      );

      return {
        embeddings,
        model,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async embedImage(
    _image: string | Buffer,
    _options: ImageEmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    throw new AIError(
      'Hugging Face image embeddings not implemented. Use OpenAI or Gemini.',
      'NOT_IMPLEMENTED',
      'huggingface',
    );
  }

  async describeImage(
    _image: string | Buffer,
    _prompt?: string,
    _options: ImageDescriptionOptions = {},
  ): Promise<string> {
    throw new AIError(
      'Image description is not implemented for Hugging Face. Use OpenAI or Gemini.',
      'NOT_IMPLEMENTED',
      'huggingface',
    );
  }

  async generateImage(
    _prompt: string,
    _options: ImageGenerationOptions = {},
  ): Promise<ImageGenerationResponse> {
    // Note: Hugging Face has image generation models (Stable Diffusion), but we're keeping this as a stub
    throw new AIError(
      'Image generation is not implemented for Hugging Face. Use OpenAI or Gemini.',
      'NOT_IMPLEMENTED',
      'huggingface',
    );
  }

  async *stream(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): AsyncIterable<string> {
    // Hugging Face Inference API doesn't support streaming for most models
    // Fall back to regular completion and yield the result
    const startTime = Date.now();
    const response = await this.chat(messages, {
      ...options,
      _skipUsage: true,
    } as any);

    // Simulate streaming by yielding chunks
    const content = response.content;
    const chunkSize = 10;

    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize);
      if (options.onProgress) {
        options.onProgress(chunk);
      }
      yield chunk;

      // Add small delay to simulate streaming
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const model = options.model || this.options.defaultModel || 'gpt2';
    emitUsage(
      this.options,
      'huggingface',
      'stream',
      model,
      undefined,
      startTime,
      options.usageTags,
    );
  }

  async countTokens(text: string): Promise<number> {
    // Approximation - Hugging Face models use different tokenizers
    return Math.ceil(text.length / 4);
  }

  async getModels(): Promise<AIModel[]> {
    // Return some popular text generation models available on Hugging Face
    return [
      {
        id: 'microsoft/DialoGPT-medium',
        name: 'DialoGPT Medium',
        description: 'Conversational AI model by Microsoft',
        contextLength: 1024,
        capabilities: ['text', 'chat'],
        supportsFunctions: false,
        supportsVision: false,
      },
      {
        id: 'microsoft/DialoGPT-large',
        name: 'DialoGPT Large',
        description: 'Large conversational AI model by Microsoft',
        contextLength: 1024,
        capabilities: ['text', 'chat'],
        supportsFunctions: false,
        supportsVision: false,
      },
      {
        id: 'facebook/blenderbot-400M-distill',
        name: 'BlenderBot 400M',
        description: 'Conversational AI model by Meta',
        contextLength: 512,
        capabilities: ['text', 'chat'],
        supportsFunctions: false,
        supportsVision: false,
      },
      {
        id: 'gpt2',
        name: 'GPT-2',
        description: 'OpenAI GPT-2 model',
        contextLength: 1024,
        capabilities: ['text', 'completion'],
        supportsFunctions: false,
        supportsVision: false,
      },
      {
        id: 'sentence-transformers/all-MiniLM-L6-v2',
        name: 'All-MiniLM-L6-v2',
        description: 'Sentence embedding model',
        contextLength: 512,
        capabilities: ['embeddings'],
        supportsFunctions: false,
        supportsVision: false,
      },
    ];
  }

  async getCapabilities(): Promise<AICapabilities> {
    return {
      chat: true,
      completion: true,
      embeddings: true,
      streaming: true,
      functions: false, // Most HF models don't support function calling
      vision: false, // Limited vision model support
      fineTuning: true, // Via Hugging Face training API
      imageEmbeddings: false,
      imageGeneration: false, // Stable Diffusion exists but not implemented
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 2048,
      supportedOperations: ['chat', 'completion', 'embedding', 'streaming'],
    };
  }

  // ============================================================================
  // TTS Methods (Not supported - use Qwen3-TTS provider)
  // ============================================================================

  async synthesizeSpeech(
    _text: string,
    _options?: TTSOptions,
  ): Promise<TTSResponse> {
    throw new AIError(
      'TTS is not supported by HuggingFace provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'huggingface',
    );
  }

  streamSpeech(_text: string, _options?: TTSOptions): AsyncIterable<Buffer> {
    const error = new AIError(
      'TTS streaming is not supported by HuggingFace provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'huggingface',
    );
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(error),
      }),
    };
  }

  async cloneVoice(_options: VoiceCloneOptions): Promise<Voice> {
    throw new AIError(
      'Voice cloning is not supported by HuggingFace provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'huggingface',
    );
  }

  async designVoice(_options: VoiceDesignOptions): Promise<Voice> {
    throw new AIError(
      'Voice design is not supported by HuggingFace provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'huggingface',
    );
  }

  async getVoices(_options?: VoiceListOptions): Promise<Voice[]> {
    throw new AIError(
      'Voice listing is not supported by HuggingFace provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'huggingface',
    );
  }

  private messagesToPrompt(messages: AIMessage[]): string {
    // Convert chat messages to a single prompt format
    return `${messages
      .map((message) => {
        const textContent = extractTextContent(message.content);
        switch (message.role) {
          case 'system':
            return `System: ${textContent}`;
          case 'user':
            return `Human: ${textContent}`;
          case 'assistant':
            return `Assistant: ${textContent}`;
          default:
            return textContent;
        }
      })
      .join('\n')}\nAssistant:`;
  }

  private async makeRequest(endpoint: string, data: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiToken}`,
        'Content-Type': 'application/json',
        ...this.options.headers,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  private mapError(error: unknown): AIError {
    if (error instanceof AIError) {
      return error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';

    // Map common HTTP status codes
    if (message.includes('401') || message.includes('Unauthorized')) {
      return new AuthenticationError('huggingface');
    }

    if (message.includes('429') || message.includes('rate limit')) {
      return new RateLimitError('huggingface');
    }

    if (message.includes('404') || message.includes('not found')) {
      return new ModelNotFoundError(message, 'huggingface');
    }

    if (message.includes('413') || message.includes('too large')) {
      return new ContextLengthError('huggingface');
    }

    return new AIError(message, 'UNKNOWN_ERROR', 'huggingface');
  }
}
