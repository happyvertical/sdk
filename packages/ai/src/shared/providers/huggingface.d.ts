/**
 * Hugging Face provider implementation
 */
import type { AIInterface, HuggingFaceOptions, AIMessage, ChatOptions, CompletionOptions, EmbeddingOptions, AIResponse, EmbeddingResponse, AIModel, AICapabilities } from '../types.js';
export declare class HuggingFaceProvider implements AIInterface {
    private options;
    private baseUrl;
    constructor(options: HuggingFaceOptions);
    chat(messages: AIMessage[], options?: ChatOptions): Promise<AIResponse>;
    complete(prompt: string, options?: CompletionOptions): Promise<AIResponse>;
    embed(text: string | string[], options?: EmbeddingOptions): Promise<EmbeddingResponse>;
    stream(messages: AIMessage[], options?: ChatOptions): AsyncIterable<string>;
    countTokens(text: string): Promise<number>;
    getModels(): Promise<AIModel[]>;
    getCapabilities(): Promise<AICapabilities>;
    private messagesToPrompt;
    private makeRequest;
    private mapError;
}
//# sourceMappingURL=huggingface.d.ts.map