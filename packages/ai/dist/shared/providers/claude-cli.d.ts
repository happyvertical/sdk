import { AICapabilities, AIInterface, AIMessage, AIModel, AIResponse, ChatOptions, ClaudeCliOptions, CompletionOptions, EmbeddingOptions, EmbeddingResponse } from '../types';
/**
 * Claude CLI provider implementation that shells out to the Claude Code CLI.
 * Supports chat completions, streaming, and leverages Claude Max subscription.
 * Does not support embeddings (use OpenAI or another provider for embeddings).
 */
export declare class ClaudeCliProvider implements AIInterface {
    private options;
    private cliPath;
    /**
     * Creates a new Claude CLI provider instance
     * @param options - Configuration options for the Claude CLI provider
     */
    constructor(options: ClaudeCliOptions);
    /**
     * Finds the Claude CLI binary in PATH or uses custom cliPath
     * @throws {AIError} When CLI cannot be found
     * @private
     */
    private findCli;
    /**
     * Normalizes model name to full model ID or short name
     * @private
     */
    private normalizeModel;
    /**
     * Execute Claude CLI command and return parsed JSON output
     * @private
     */
    private executeCommand;
    /**
     * Execute Claude CLI command with streaming output
     * @private
     */
    private executeStreamingCommand;
    /**
     * Maps messages to a single prompt for CLI
     * @private
     */
    private mapMessagesToPrompt;
    /**
     * Maps CLI errors to standardized error types
     * @private
     */
    private mapCliError;
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
    chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse>;
    /**
     * Generate a text completion (delegates to chat)
     */
    complete(prompt: string, options?: CompletionOptions): Promise<AIResponse>;
    /**
     * Embeddings are not supported by Claude CLI
     */
    embed(_text: string | string[], _options?: EmbeddingOptions): Promise<EmbeddingResponse>;
    /**
     * Stream chat completion using Claude CLI
     */
    stream(messages: AIMessage[], options?: ChatOptions): AsyncIterable<string>;
    /**
     * Count tokens in text (approximation)
     */
    countTokens(text: string): Promise<number>;
    /**
     * Get available models (static list of Claude models)
     */
    getModels(): Promise<AIModel[]>;
    /**
     * Get provider capabilities
     */
    getCapabilities(): Promise<AICapabilities>;
}
//# sourceMappingURL=claude-cli.d.ts.map