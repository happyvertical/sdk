/**
 * @happyvertical/email
 *
 * Low-level email protocol operations with adapter-based architecture.
 * Supports SMTP, IMAP, POP3, and Gmail API protocols.
 */

// Adapters (for direct instantiation if needed)
export { GmailAdapter } from './adapters/gmail.js';
export { IMAPAdapter } from './adapters/imap.js';
export { JMAPAdapter } from './adapters/jmap.js';
export { POP3Adapter } from './adapters/pop3.js';
export { SMTPAdapter } from './adapters/smtp.js';
// Base class (for extension)
export { BaseEmailClient } from './shared/base.js';
// Error classes
export {
  AttachmentError,
  AuthenticationError,
  AuthorizationError,
  ConnectionError,
  EmailError,
  FolderExistsError,
  FolderNotFoundError,
  InvalidMessageError,
  MessageNotFoundError,
  SendError,
  TimeoutError,
} from './shared/errors.js';
// Factory function
// Type guards
export {
  getEmailClient,
  isGmailOptions,
  isIMAPOptions,
  isJMAPOptions,
  isPOP3Options,
  isSMTPOptions,
} from './shared/factory.js';
// Types
export type {
  AdapterType,
  Attachment,
  ChangeFeedBatch,
  ChangeFeedOptions,
  ChangeFeedResult,
  ChangeFeedResyncRequired,
  ChangeHint,
  ChangeHintListener,
  DraftResult,
  EmailAddress,
  EmailClient,
  EmailClientCapabilities,
  EmailClientConfig,
  EmailIdentity,
  EmailMessage,
  FetchOptions,
  FlagChange,
  Folder,
  FolderInfo,
  FolderSpecialUse,
  GetEmailClientOptions,
  GmailOptions,
  IMAPOptions,
  JMAPOptions,
  LabelChange,
  MessageFlag,
  POP3Options,
  SearchCriteria,
  SendOptions,
  SendResult,
  SMTPOptions,
  SubscribeChangesOptions,
  Unsubscribe,
  WriteBackCapabilities,
  WriteBackFailure,
  WriteBackOptions,
  WriteBackResult,
} from './shared/types.js';
export { isResyncRequired } from './shared/types.js';
