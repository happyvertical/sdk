/**
 * @happyvertical/messages
 *
 * Unified multi-channel messaging with adapter-based architecture.
 * Supports Slack, Twitter/X, and Email (via @happyvertical/email bridge).
 */

// Re-export from @happyvertical/email for convenience
export {
  type EmailClient,
  type EmailMessage,
  type GetEmailClientOptions,
  getEmailClient,
  type SendResult as EmailSendResult,
} from '@happyvertical/email';
// Adapters (for direct instantiation)
export { EmailBridgeAdapter } from './adapters/email-bridge.js';
export { SlackAdapter } from './adapters/slack.js';
export { TwitterAdapter } from './adapters/twitter.js';
// Base class (for extension)
export { BaseMessageClient } from './shared/base.js';
// Error classes
export {
  AuthenticationError,
  ChannelNotFoundError,
  ConnectionError,
  InvalidMessageError,
  MessageNotFoundError,
  MessagingError,
  RateLimitError,
  SendError,
} from './shared/errors.js';
// Factory function + type guards
export {
  getMessageClient,
  isEmailBridgeOptions,
  isSlackOptions,
  isTwitterOptions,
} from './shared/factory.js';

// Types
export type {
  Channel,
  EmailBridgeOptions,
  FetchOptions,
  GetMessageClientOptions,
  Message,
  MessageAdapterType,
  MessageAttachment,
  MessageClient,
  MessageClientCapabilities,
  MessageClientConfig,
  MessageRecipient,
  MessageSender,
  SendOptions,
  SendResult,
  SlackOptions,
  TwitterOptions,
} from './shared/types.js';
