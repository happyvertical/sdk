/**
 * AWS Bedrock provider implementation
 */
import type { AIInterface, BedrockOptions, AIMessage, ChatOptions, CompletionOptions, EmbeddingOptions, AIResponse, EmbeddingResponse, AIModel, AICapabilities } from '../types.js';
export declare class BedrockProvider implements AIInterface {
    private options;
    private client;
    constructor(options: BedrockOptions);
    private initializeClientSync;
    private ensureClient;
    chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse>;
    complete(prompt: string, options?: CompletionOptions): Promise<AIResponse>;
    embed(text: string | string[], options?: EmbeddingOptions): Promise<EmbeddingResponse>;
    stream(messages: AIMessage[], options?: ChatOptions): AsyncIterable<string>;
    countTokens(text: string): Promise<number>;
    getModels(): Promise<AIModel[]>;
    getCapabilities(): Promise<AICapabilities>;
    private chatWithClaude;
    private chatWithTitan;
    private chatWithCohere;
    private chatWithLlama;
    private mapMessagesToClaude;
    private mapClaudeFinishReason;
    private mapError;
}
//# sourceMappingURL=bedrock.d.ts.map