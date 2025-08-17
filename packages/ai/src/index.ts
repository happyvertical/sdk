/**
 * @have/ai - A standardized interface for AI model interactions
 * 
 * This package provides a unified interface for interacting with various AI models.
 * Supports multiple providers: OpenAI, Gemini, Anthropic, Hugging Face, and AWS Bedrock.
 * 
 * Key components:
 * - getAI() - Factory function for creating AI provider instances
 * - AIInterface - Standardized interface for all AI providers
 * - Provider-specific implementations for each supported service
 */

export * from './types.js';
export * from './factory.js';

// Legacy exports for backward compatibility - explicitly excluding AIMessage to avoid conflict
export * from './client.js';
export { AIMessage as AIMessageClass } from './message.js';
export * from './thread.js';
