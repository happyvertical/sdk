/**
 * OpenAI provider implementation
 */
import 'openai/shims/node';
import type { AIInterface, OpenAIOptions, AIMessage, ChatOptions, CompletionOptions, EmbeddingOptions, AIResponse, EmbeddingResponse, AIModel, AICapabilities } from '../types.js';
export declare class OpenAIProvider implements AIInterface {
    private client;
    private options;
    constructor(options: OpenAIOptions);
    chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse>;
    complete(prompt: string, options?: CompletionOptions): Promise<AIResponse>;
    embed(text: string | string[], options?: EmbeddingOptions): Promise<EmbeddingResponse>;
    stream(messages: AIMessage[], options?: ChatOptions): AsyncIterable<string>;
    countTokens(text: string): Promise<number>;
    getModels(): Promise<AIModel[]>;
    getCapabilities(): Promise<AICapabilities>;
    private mapMessagesToOpenAI;
    private mapToolChoice;
    private mapUsage;
    private mapFinishReason;
    private getContextLength;
    private getModelCapabilities;
    private mapError;
}
//# sourceMappingURL=openai.d.ts.map