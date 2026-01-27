/**
 * Claude CLI provider implementation
 *
 * Provides a standardized interface for interacting with Claude via the Claude Code CLI,
 * enabling users with Claude Max subscriptions to use their subscription instead of
 * paying for API usage. Supports chat completions and streaming responses.
 * Authentication is handled via existing Claude session or setup-token.
 *
 * **Authentication Priority:**
 * 1. ANTHROPIC_API_KEY environment variable (uses Anthropic SDK, no keychain prompts)
 * 2. Claude CLI with setup-token (for CI/CD, no keychain prompts)
 * 3. Claude CLI with keychain (may prompt for password on macOS)
 */

import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  AICapabilities,
  AIInterface,
  AIMessage,
  AIModel,
  AIResponse,
  ChatOptions,
  ClaudeCliOptions,
  CompletionOptions,
  EmbeddingOptions,
  EmbeddingResponse,
  ImageDescriptionOptions,
  ImageEmbeddingOptions,
  ImageGenerationOptions,
  ImageGenerationResponse,
  MessageOptions,
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
  RateLimitError,
} from '../types';

const execAsync = promisify(exec);

/**
 * Claude CLI provider implementation that shells out to the Claude Code CLI.
 * Supports chat completions, streaming, and leverages Claude Max subscription.
 * Does not support embeddings (use OpenAI or another provider for embeddings).
 *
 * If ANTHROPIC_API_KEY environment variable is set, automatically falls back to
 * using the Anthropic provider to avoid macOS keychain password prompts.
 */
export class ClaudeCliProvider implements AIInterface {
  private options: ClaudeCliOptions;
  private cliPath: string | null = null;
  private anthropicFallback: AIInterface | null = null;

  /**
   * Creates a new Claude CLI provider instance
   * @param options - Configuration options for the Claude CLI provider
   */
  constructor(options: ClaudeCliOptions) {
    this.options = {
      defaultModel: 'sonnet',
      ...options,
    };
  }

  /**
   * Checks if ANTHROPIC_API_KEY is available and initializes fallback provider if needed
   * @private
   */
  private async initializeFallback(): Promise<void> {
    if (this.anthropicFallback !== null) {
      return; // Already initialized
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return; // No API key, will use CLI
    }

    // Lazy load Anthropic provider to avoid circular dependency
    const { AnthropicProvider } = await import('./anthropic.js');

    // Map claude-cli model names to Anthropic model IDs
    const modelMap: Record<string, string> = {
      sonnet: 'claude-3-5-sonnet-20241022',
      opus: 'claude-3-opus-20240229',
      haiku: 'claude-3-haiku-20240307',
    };

    const defaultModel =
      modelMap[this.options.defaultModel || 'sonnet'] ||
      'claude-3-5-sonnet-20241022';

    this.anthropicFallback = new AnthropicProvider({
      type: 'anthropic',
      apiKey,
      defaultModel,
    });
  }

  /**
   * Finds the Claude CLI binary in PATH or uses custom cliPath
   * Does NOT execute the CLI during detection to avoid keychain prompts
   * @throws {AIError} When CLI cannot be found
   * @private
   */
  private async findCli(): Promise<string> {
    if (this.cliPath) {
      return this.cliPath;
    }

    // If custom path provided, check if it exists (don't execute it)
    if (this.options.cliPath) {
      const fs = await import('node:fs/promises');
      try {
        await fs.access(this.options.cliPath);
        this.cliPath = this.options.cliPath;
        return this.cliPath;
      } catch (_error) {
        throw new AIError(
          `Claude CLI not found at specified path: ${this.options.cliPath}. Set ANTHROPIC_API_KEY environment variable to avoid CLI dependency.`,
          'CLI_NOT_FOUND',
          'claude-cli',
        );
      }
    }

    // Try common installation locations first
    const commonPaths = [
      `${process.env.HOME}/.claude/local/claude`, // Default installation path
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
    ];

    const fs = await import('node:fs/promises');
    for (const path of commonPaths) {
      try {
        await fs.access(path);
        this.cliPath = path;
        return this.cliPath;
      } catch (_error) {
        // Try next path
      }
    }

    // Try to find in PATH with which (doesn't execute the binary)
    try {
      const { stdout } = await execAsync('which claude');
      const path = stdout.trim();
      if (path) {
        this.cliPath = path;
        return this.cliPath;
      }
    } catch (_error) {
      // Not found
    }

    throw new AIError(
      'Claude CLI not found. Set ANTHROPIC_API_KEY environment variable to use Anthropic SDK instead, or install Claude Code CLI. Visit https://docs.claude.com/en/docs/claude-code/ for installation instructions.',
      'CLI_NOT_FOUND',
      'claude-cli',
    );
  }

  /**
   * Normalizes model name to full model ID or short name
   * @private
   */
  private normalizeModel(model?: string): string {
    const m = model || this.options.defaultModel || 'sonnet';

    // Map short names to CLI-compatible values
    const modelMap: Record<string, string> = {
      sonnet: 'sonnet',
      opus: 'opus',
      haiku: 'haiku',
    };

    return modelMap[m] || m;
  }

  /**
   * Execute Claude CLI command and return parsed JSON output
   * @private
   */
  private async executeCommand(
    prompt: string,
    options: {
      model?: string;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
    } = {},
  ): Promise<any> {
    const cliPath = await this.findCli();
    const model = this.normalizeModel(options.model);

    const args = ['--print', '--output-format', 'json', '--model', model];

    if (options.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt);
    }

    args.push(prompt);

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const child = spawn(cliPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (error) => {
        reject(
          new AIError(
            `Failed to execute Claude CLI: ${error.message}`,
            'EXECUTION_ERROR',
            'claude-cli',
          ),
        );
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(this.mapCliError(stderr, code || undefined));
          return;
        }

        try {
          // Parse JSON output
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (_error) {
          reject(
            new AIError(
              'Failed to parse CLI output as JSON',
              'PARSE_ERROR',
              'claude-cli',
            ),
          );
        }
      });
    });
  }

  /**
   * Execute Claude CLI command with streaming output
   * @private
   */
  private async *executeStreamingCommand(
    prompt: string,
    options: {
      model?: string;
      systemPrompt?: string;
      onProgress?: (chunk: string) => void;
    } = {},
  ): AsyncIterable<string> {
    const cliPath = await this.findCli();
    const model = this.normalizeModel(options.model);

    const args = [
      '--print',
      '--output-format',
      'stream-json',
      '--verbose', // Required for stream-json format
      '--model',
      model,
    ];

    if (options.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt);
    }

    args.push(prompt);

    const child = spawn(cliPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Process streaming JSON chunks
    let buffer = '';

    for await (const chunk of child.stdout) {
      buffer += chunk.toString();

      // Process complete JSON objects (one per line)
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            // Claude CLI stream-json format outputs complete messages
            // Look for assistant message with content
            if (parsed.type === 'assistant' && parsed.message?.content) {
              for (const contentBlock of parsed.message.content) {
                if (contentBlock.type === 'text' && contentBlock.text) {
                  const text = contentBlock.text;
                  if (options.onProgress) {
                    options.onProgress(text);
                  }
                  yield text;
                }
              }
            }
            // Also handle result type for final output
            else if (parsed.type === 'result' && parsed.result) {
              const text = parsed.result;
              if (options.onProgress) {
                options.onProgress(text);
              }
              yield text;
            }
          } catch (_error) {
            // Skip malformed JSON lines
          }
        }
      }
    }

    // Wait for process to complete
    const exitCode = await new Promise<number>((resolve) => {
      child.on('close', (code) => resolve(code || 0));
    });

    if (exitCode !== 0) {
      throw this.mapCliError(stderr, exitCode);
    }
  }

  /**
   * Maps messages to a single prompt for CLI
   * @private
   */
  private mapMessagesToPrompt(messages: AIMessage[]): {
    prompt: string;
    systemPrompt?: string;
  } {
    let systemPrompt: string | undefined;
    const conversationParts: string[] = [];

    for (const message of messages) {
      const textContent = extractTextContent(message.content);
      if (message.role === 'system') {
        systemPrompt = systemPrompt
          ? `${systemPrompt}\n\n${textContent}`
          : textContent;
      } else if (message.role === 'user') {
        conversationParts.push(`User: ${textContent}`);
      } else if (message.role === 'assistant') {
        conversationParts.push(`Assistant: ${textContent}`);
      }
    }

    // If only one user message and no conversation, return it directly
    if (
      conversationParts.length === 1 &&
      conversationParts[0].startsWith('User: ')
    ) {
      return {
        prompt: conversationParts[0].substring(6), // Remove "User: " prefix
        systemPrompt,
      };
    }

    return {
      prompt: conversationParts.join('\n\n'),
      systemPrompt,
    };
  }

  /**
   * Maps CLI errors to standardized error types
   * @private
   */
  private mapCliError(stderr: string, exitCode?: number): AIError {
    const errorText = stderr.toLowerCase();

    // Authentication errors
    if (
      errorText.includes('not authenticated') ||
      errorText.includes('login required')
    ) {
      return new AuthenticationError('claude-cli');
    }

    // Rate limiting
    if (
      errorText.includes('rate limit') ||
      errorText.includes('too many requests')
    ) {
      return new RateLimitError('claude-cli');
    }

    // Context length
    if (
      errorText.includes('context length') ||
      errorText.includes('too long')
    ) {
      return new ContextLengthError('claude-cli');
    }

    return new AIError(
      `Claude CLI error (exit code ${exitCode}): ${stderr}`,
      'CLI_ERROR',
      'claude-cli',
    );
  }

  /**
   * Generate a chat completion using Claude CLI
   * @param messages - Array of conversation messages
   * @param options - Optional configuration for the chat completion
   * @returns Promise resolving to the AI response with content and metadata
   * @throws {AIError} When the CLI execution fails
   *
   * @example
   * ```typescript
   * const response = await provider.chat([
   *   { role: 'system', content: 'You are a helpful assistant.' },
   *   { role: 'user', content: 'Explain quantum computing' }
   * ], {
   *   model: 'sonnet'
   * });
   * ```
   */
  async chat(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): Promise<AIResponse> {
    // Check if ANTHROPIC_API_KEY is available and use fallback if so
    await this.initializeFallback();
    if (this.anthropicFallback) {
      return this.anthropicFallback.chat(messages, options);
    }

    let { prompt, systemPrompt } = this.mapMessagesToPrompt(messages);

    // Add JSON format instruction if requested
    // NOTE: Claude CLI doesn't have native JSON mode like OpenAI. This is a prompt-based
    // approach that instructs the model to output JSON, similar to Anthropic provider.
    if (options.responseFormat?.type === 'json_object') {
      const jsonInstruction =
        '\n\nIMPORTANT: You must respond with valid JSON only. Do not include any explanatory text outside the JSON object.';
      systemPrompt = systemPrompt
        ? systemPrompt + jsonInstruction
        : jsonInstruction.trim();
    }

    const result = await this.executeCommand(prompt, {
      model: options.model,
      systemPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });

    // Parse Claude CLI JSON output
    // CLI returns format: { type: 'result', result: '...', usage: {...}, ... }
    return {
      content:
        result.result ||
        result.content ||
        result.text ||
        JSON.stringify(result),
      model: options.model || this.options.defaultModel,
      finishReason: result.is_error ? 'stop' : 'stop',
      // Extract usage from CLI response if available
      usage: result.usage
        ? {
            promptTokens: result.usage.input_tokens || 0,
            completionTokens: result.usage.output_tokens || 0,
            totalTokens:
              (result.usage.input_tokens || 0) +
              (result.usage.output_tokens || 0),
          }
        : undefined,
    };
  }

  /**
   * Generate a text completion (delegates to chat)
   */
  async complete(
    prompt: string,
    options: CompletionOptions = {},
  ): Promise<AIResponse> {
    // Check if ANTHROPIC_API_KEY is available and use fallback if so
    await this.initializeFallback();
    if (this.anthropicFallback) {
      return this.anthropicFallback.complete(prompt, options);
    }

    return this.chat([{ role: 'user', content: prompt }], {
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      topP: options.topP,
      n: options.n,
      stop: options.stop,
      stream: options.stream,
      onProgress: options.onProgress,
    });
  }

  /**
   * Simple message interface for single-turn interactions with optional history
   *
   * @param text - The message text to send
   * @param options - Configuration options including history, model, etc.
   * @returns Promise resolving to the response content string
   *
   * @example
   * ```typescript
   * // Simple usage
   * const response = await provider.message('Hello!');
   *
   * // With history
   * const response = await provider.message('What was my question?', {
   *   history: [
   *     { role: 'user', content: 'What is 2+2?' },
   *     { role: 'assistant', content: '4' }
   *   ]
   * });
   * ```
   */
  async message(text: string, options: MessageOptions = {}): Promise<string> {
    // Check if ANTHROPIC_API_KEY is available and use fallback if so
    await this.initializeFallback();
    if (this.anthropicFallback) {
      return this.anthropicFallback.message(text, options);
    }

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
    });

    return response.content;
  }

  /**
   * Embeddings are not supported by Claude CLI or Anthropic
   */
  async embed(
    _text: string | string[],
    _options: EmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    // Note: Even with fallback, Anthropic doesn't support embeddings
    throw new AIError(
      'Claude CLI does not support embeddings. Use OpenAI or another provider for embeddings.',
      'NOT_SUPPORTED',
      'claude-cli',
    );
  }

  /**
   * Image embeddings are not supported by Claude CLI
   */
  async embedImage(
    _image: string | Buffer,
    _options: ImageEmbeddingOptions = {},
  ): Promise<EmbeddingResponse> {
    throw new AIError(
      'Claude CLI does not support image embeddings. Use OpenAI or Gemini.',
      'NOT_SUPPORTED',
      'claude-cli',
    );
  }

  /**
   * Image description is not yet implemented for Claude CLI
   * Note: Claude supports vision, but this would require significant implementation
   */
  async describeImage(
    _image: string | Buffer,
    _prompt?: string,
    _options: ImageDescriptionOptions = {},
  ): Promise<string> {
    throw new AIError(
      'Image description is not yet implemented for Claude CLI. Use OpenAI or Gemini.',
      'NOT_IMPLEMENTED',
      'claude-cli',
    );
  }

  /**
   * Image generation is not supported by Claude
   */
  async generateImage(
    _prompt: string,
    _options: ImageGenerationOptions = {},
  ): Promise<ImageGenerationResponse> {
    throw new AIError(
      'Claude does not support image generation. Use OpenAI or Gemini.',
      'NOT_SUPPORTED',
      'claude-cli',
    );
  }

  /**
   * Stream chat completion using Claude CLI
   */
  async *stream(
    messages: AIMessage[],
    options: ChatOptions = {},
  ): AsyncIterable<string> {
    // Check if ANTHROPIC_API_KEY is available and use fallback if so
    await this.initializeFallback();
    if (this.anthropicFallback) {
      yield* this.anthropicFallback.stream(messages, options);
      return;
    }

    let { prompt, systemPrompt } = this.mapMessagesToPrompt(messages);

    // Add JSON format instruction if requested
    if (options.responseFormat?.type === 'json_object') {
      const jsonInstruction =
        '\n\nIMPORTANT: You must respond with valid JSON only. Do not include any explanatory text outside the JSON object.';
      systemPrompt = systemPrompt
        ? systemPrompt + jsonInstruction
        : jsonInstruction.trim();
    }

    yield* this.executeStreamingCommand(prompt, {
      model: options.model,
      systemPrompt,
      onProgress: options.onProgress,
    });
  }

  /**
   * Count tokens in text (approximation)
   */
  async countTokens(text: string): Promise<number> {
    // Check if ANTHROPIC_API_KEY is available and use fallback if so
    await this.initializeFallback();
    if (this.anthropicFallback) {
      return this.anthropicFallback.countTokens(text);
    }

    // Claude uses a different tokenizer, approximate similar to Anthropic
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Get available models (static list of Claude models)
   */
  async getModels(): Promise<AIModel[]> {
    // Check if ANTHROPIC_API_KEY is available and use fallback if so
    await this.initializeFallback();
    if (this.anthropicFallback) {
      return this.anthropicFallback.getModels();
    }

    return [
      {
        id: 'sonnet',
        name: 'Claude Sonnet',
        description: 'Balanced Claude model via CLI',
        contextLength: 200000,
        capabilities: ['text', 'chat', 'vision'],
        supportsFunctions: false,
        supportsVision: false,
      },
      {
        id: 'opus',
        name: 'Claude Opus',
        description: 'Most powerful Claude model via CLI',
        contextLength: 200000,
        capabilities: ['text', 'chat'],
        supportsFunctions: false,
        supportsVision: false,
      },
      {
        id: 'haiku',
        name: 'Claude Haiku',
        description: 'Fast Claude model via CLI',
        contextLength: 200000,
        capabilities: ['text', 'chat'],
        supportsFunctions: false,
        supportsVision: false,
      },
    ];
  }

  /**
   * Get provider capabilities
   */
  async getCapabilities(): Promise<AICapabilities> {
    // Check if ANTHROPIC_API_KEY is available and use fallback if so
    await this.initializeFallback();
    if (this.anthropicFallback) {
      return this.anthropicFallback.getCapabilities();
    }

    return {
      chat: true,
      completion: true,
      embeddings: false, // Claude CLI doesn't support embeddings
      streaming: true,
      functions: false, // Not supported via CLI
      vision: false, // Not supported in current CLI version
      fineTuning: false,
      imageEmbeddings: false,
      imageGeneration: false,
      tts: false,
      voiceCloning: false,
      voiceDesign: false,
      maxContextLength: 200000,
      supportedOperations: ['chat', 'completion', 'streaming'],
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
      'TTS is not supported by Claude CLI provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'claude-cli',
    );
  }

  streamSpeech(_text: string, _options?: TTSOptions): AsyncIterable<Buffer> {
    const error = new AIError(
      'TTS streaming is not supported by Claude CLI provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'claude-cli',
    );
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(error),
      }),
    };
  }

  async cloneVoice(_options: VoiceCloneOptions): Promise<Voice> {
    throw new AIError(
      'Voice cloning is not supported by Claude CLI provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'claude-cli',
    );
  }

  async designVoice(_options: VoiceDesignOptions): Promise<Voice> {
    throw new AIError(
      'Voice design is not supported by Claude CLI provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'claude-cli',
    );
  }

  async getVoices(_options?: VoiceListOptions): Promise<Voice[]> {
    throw new AIError(
      'Voice listing is not supported by Claude CLI provider. Use Qwen3-TTS provider.',
      'NOT_IMPLEMENTED',
      'claude-cli',
    );
  }
}
