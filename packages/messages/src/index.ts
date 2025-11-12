/**
 * @happyvertical/messages - Unified messaging operations
 *
 * Multi-protocol messaging with adapter-based architecture for email
 * (SMTP, IMAP, POP3, Gmail) and future message sources.
 *
 * @packageDocumentation
 */

// ============================================================================
// Factory and Type Guards
// ============================================================================

export {
  getMailbox,
  isGmailOptions,
  isIMAPOptions,
  isPOP3Options,
  isSMTPOptions,
} from './shared/factory';

// ============================================================================
// Types
// ============================================================================

export type {
  AdapterType,
  Attachment,
  EmailAddress,
  // Core message types
  EmailMessage,
  FetchOptions,
  // Folder types
  Folder,
  FolderInfo,
  FolderSpecialUse,
  // Adapter configuration
  GetMailboxOptions,
  GmailOptions,
  IMAPOptions,
  // Mailbox interface
  Mailbox,
  MailboxCapabilities,
  MailboxConfig,
  MailboxOptions,
  MessageFlag,
  POP3Options,
  SearchCriteria,
  // Options types
  SendOptions,
  SendResult,
  SMTPOptions,
  SyncOptions,
  SyncProgress,
  SyncResult,
} from './shared/types';

// ============================================================================
// Errors
// ============================================================================

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
  SyncError,
  TimeoutError,
} from './shared/errors';

// ============================================================================
// Base class (for adapter developers)
// ============================================================================

export { BaseMailbox } from './shared/base';
