/**
 * OpenAI provider implementation
 */
import 'openai/shims/node';
import OpenAI from 'openai';
import { AIError, AuthenticationError, RateLimitError, ModelNotFoundError, ContextLengthError, ContentFilterError, } from '../types.js';
export class OpenAIProvider {
    client;
    options;
    constructor(options) {
        this.options = {
            defaultModel: 'gpt-4o',
            ...options,
        };
        this.client = new OpenAI({
            apiKey: this.options.apiKey,
            baseURL: this.options.baseUrl,
            organization: this.options.organization,
            timeout: this.options.timeout,
            maxRetries: this.options.maxRetries,
            defaultHeaders: this.options.headers,
        });
    }
    async chat(messages, options = {}) {
        try {
            const response = await this.client.chat.completions.create({
                model: options.model || this.options.defaultModel || 'gpt-4o',
                messages: this.mapMessagesToOpenAI(messages),
                max_tokens: options.maxTokens,
                temperature: options.temperature,
                top_p: options.topP,
                n: options.n,
                stop: options.stop,
                frequency_penalty: options.frequencyPenalty,
                presence_penalty: options.presencePenalty,
                user: options.user,
                tools: options.tools?.map(tool => ({
                    type: 'function',
                    function: {
                        name: tool.function.name,
                        description: tool.function.description,
                        parameters: tool.function.parameters,
                    },
                })),
                tool_choice: this.mapToolChoice(options.toolChoice),
                response_format: options.responseFormat,
                seed: options.seed,
                stream: false,
            });
            const choice = response.choices[0];
            if (!choice) {
                throw new AIError('No choices returned from OpenAI', 'NO_CHOICES', 'openai');
            }
            return {
                content: choice.message.content || '',
                usage: this.mapUsage(response.usage),
                model: response.model,
                finishReason: this.mapFinishReason(choice.finish_reason),
                functionCalls: choice.message.function_call ? [{
                        name: choice.message.function_call.name,
                        arguments: choice.message.function_call.arguments,
                    }] : undefined,
                toolCalls: choice.message.tool_calls?.map(call => ({
                    id: call.id,
                    type: call.type,
                    function: {
                        name: call.function.name,
                        arguments: call.function.arguments,
                    },
                })),
            };
        }
        catch (error) {
            throw this.mapError(error);
        }
    }
    async complete(prompt, options = {}) {
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
    async embed(text, options = {}) {
        try {
            const input = Array.isArray(text) ? text : [text];
            const response = await this.client.embeddings.create({
                model: options.model || 'text-embedding-3-small',
                input,
                encoding_format: options.encodingFormat,
                dimensions: options.dimensions,
                user: options.user,
            });
            return {
                embeddings: response.data.map(item => item.embedding),
                usage: this.mapUsage(response.usage),
                model: response.model,
            };
        }
        catch (error) {
            throw this.mapError(error);
        }
    }
    async *stream(messages, options = {}) {
        try {
            const stream = await this.client.chat.completions.create({
                model: options.model || this.options.defaultModel || 'gpt-4o',
                messages: this.mapMessagesToOpenAI(messages),
                max_tokens: options.maxTokens,
                temperature: options.temperature,
                top_p: options.topP,
                stop: options.stop,
                frequency_penalty: options.frequencyPenalty,
                presence_penalty: options.presencePenalty,
                user: options.user,
                stream: true,
            });
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    if (options.onProgress) {
                        options.onProgress(content);
                    }
                    yield content;
                }
            }
        }
        catch (error) {
            throw this.mapError(error);
        }
    }
    async countTokens(text) {
        // OpenAI doesn't provide a direct token counting API
        // This is an approximation based on the general rule of ~4 characters per token
        return Math.ceil(text.length / 4);
    }
    async getModels() {
        try {
            const response = await this.client.models.list();
            return response.data
                .filter(model => model.id.includes('gpt') || model.id.includes('text-embedding'))
                .map(model => ({
                id: model.id,
                name: model.id,
                description: `OpenAI model: ${model.id}`,
                contextLength: this.getContextLength(model.id),
                capabilities: this.getModelCapabilities(model.id),
                supportsFunctions: model.id.includes('gpt-4') || model.id.includes('gpt-3.5'),
                supportsVision: model.id.includes('vision') || model.id === 'gpt-4o',
            }));
        }
        catch (error) {
            throw this.mapError(error);
        }
    }
    async getCapabilities() {
        return {
            chat: true,
            completion: true,
            embeddings: true,
            streaming: true,
            functions: true,
            vision: true,
            fineTuning: true,
            maxContextLength: 128000,
            supportedOperations: ['chat', 'completion', 'embedding', 'streaming', 'functions', 'vision'],
        };
    }
    mapMessagesToOpenAI(messages) {
        return messages.map(message => {
            // Build message based on role and content
            const baseMessage = {
                role: message.role,
                content: message.content,
            };
            // Add optional fields based on role and availability
            if (message.name && (message.role === 'system' || message.role === 'user' || message.role === 'function')) {
                baseMessage.name = message.name;
            }
            if (message.function_call && message.role === 'assistant') {
                baseMessage.function_call = message.function_call;
            }
            if (message.tool_calls && message.role === 'assistant') {
                baseMessage.tool_calls = message.tool_calls;
            }
            return baseMessage;
        });
    }
    mapToolChoice(toolChoice) {
        if (!toolChoice)
            return undefined;
        if (typeof toolChoice === 'string')
            return toolChoice;
        return {
            type: 'function',
            function: { name: toolChoice.function.name },
        };
    }
    mapUsage(usage) {
        if (!usage)
            return undefined;
        return {
            promptTokens: usage.prompt_tokens || 0,
            completionTokens: usage.completion_tokens || 0,
            totalTokens: usage.total_tokens || 0,
        };
    }
    mapFinishReason(reason) {
        switch (reason) {
            case 'stop': return 'stop';
            case 'length': return 'length';
            case 'function_call': return 'function_call';
            case 'tool_calls': return 'tool_calls';
            case 'content_filter': return 'content_filter';
            default: return 'stop';
        }
    }
    getContextLength(modelId) {
        if (modelId.includes('gpt-4o'))
            return 128000;
        if (modelId.includes('gpt-4-turbo'))
            return 128000;
        if (modelId.includes('gpt-4'))
            return 8192;
        if (modelId.includes('gpt-3.5-turbo'))
            return 16385;
        return 4096;
    }
    getModelCapabilities(modelId) {
        const capabilities = ['text'];
        if (modelId.includes('gpt')) {
            capabilities.push('chat', 'functions');
        }
        if (modelId.includes('vision') || modelId === 'gpt-4o') {
            capabilities.push('vision');
        }
        if (modelId.includes('embedding')) {
            capabilities.push('embeddings');
        }
        return capabilities;
    }
    mapError(error) {
        if (error instanceof OpenAI.APIError) {
            switch (error.status) {
                case 401:
                    return new AuthenticationError('openai');
                case 429:
                    // Try to extract retry-after from headers
                    const retryAfter = error.headers?.['retry-after'];
                    const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
                    return new RateLimitError('openai', retryAfterSeconds);
                case 404:
                    return new ModelNotFoundError(error.message, 'openai');
                case 413:
                    return new ContextLengthError('openai');
                default:
                    if (error.message.includes('content_filter')) {
                        return new ContentFilterError('openai');
                    }
                    return new AIError(error.message, 'API_ERROR', 'openai');
            }
        }
        if (error instanceof AIError) {
            return error;
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return new AIError(errorMessage, 'UNKNOWN_ERROR', 'openai');
    }
}
