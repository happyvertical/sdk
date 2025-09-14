/**
 * Browser entry point for @have/ai
 * Exports universal AI functionality that works in browser environments
 */

export * from './shared/types.js';
export * from './shared/factory.js';

// Legacy exports for backward compatibility
export * from './shared/client.js';
export { AIMessage as AIMessageClass } from './shared/message.js';
export * from './shared/thread.js';