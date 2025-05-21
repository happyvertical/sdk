/**
 * @have/ai - A standardized interface for AI model interactions
 * 
 * This package provides a unified interface for interacting with various AI models.
 * Currently supports OpenAI's models through their API.
 * 
 * Key components:
 * - AIClient - Base class and factory for creating AI service clients
 * - AIMessage - Represents messages in AI conversations
 * - AIThread - Manages conversation threads with AI models
 */

export * from './client.js';
export * from './message.js';
export * from './thread.js';
