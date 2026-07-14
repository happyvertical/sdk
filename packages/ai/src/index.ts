/**
 * @happyvertical/ai - A standardized interface for AI model interactions
 *
 * This package provides a unified interface for interacting with various AI models.
 * Supports multiple providers: OpenAI, LiteLLM, Ollama, Gemini, Anthropic,
 * Hugging Face, AWS Bedrock, Claude CLI, and Qwen3-TTS.
 *
 * Key components:
 * - getAI() - Factory function for creating AI provider instances
 * - AIInterface - Standardized interface for all AI providers
 * - Provider-specific implementations for each supported service
 */

// Legacy exports for backward compatibility
export * from './shared/client';
export * from './shared/factory';
export { AIMessage as AIMessageClass } from './shared/message';
export {
  DEFAULT_AI_GENERATION_LIMITS,
  DEFAULT_AI_MAX_RETRIES,
  DEFAULT_AI_TIMEOUT_MS,
} from './shared/safety';
export * from './shared/thread';
export * from './shared/types';

/** @internal */
export const PACKAGE_VERSION_INITIALIZED = true;
