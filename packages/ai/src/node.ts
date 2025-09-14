/**
 * Node.js entry point for @have/ai
 * Exports universal AI functionality plus Node.js-specific enhancements
 */

export * from './shared/types.js';
export * from './node/factory.js';

// Legacy exports for backward compatibility
export * from './shared/client.js';
export { AIMessage as AIMessageClass } from './shared/message.js';
export * from './shared/thread.js';