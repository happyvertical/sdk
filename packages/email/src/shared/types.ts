/**
 * Core types for @happyvertical/email package
 *
 * Low-level, framework-agnostic email protocol types.
 * No database dependencies - use @happyvertical/smrt-messages for persistence.
 */

import type { Logger } from '@happyvertical/logger';

// ============================================================================
// Email Message Types
// ============================================================================

export interface EmailMessage {
  // Identity
  id?: string; // Provider-specific message ID
  messageId?: string; // RFC 822 Message-ID header
  threadId?: string; // Thread ID (Gmail)
  inReplyTo?: string; // In-Reply-To header
  references?: string[]; // References header

  // Headers
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  date?: Date;

  // Content
  text?: string; // Plain text body
  html?: string; // HTML body
  attachments?: Attachment[];

  // Metadata
  folder?: string; // Current folder/label
  folders?: string[]; // Every folder path holding the message (multi-mailbox servers)
  labels?: string[]; // Gmail labels
  flags?: MessageFlag[]; // IMAP flags
  headers?: Record<string, string | string[]>;

  // Raw data
  raw?: string; // Original RFC 822 message
  size?: number; // Size in bytes
}

export interface EmailAddress {
  name?: string;
  address: string;
}

export interface Attachment {
  /** Provider-specific attachment/blob id (JMAP blobId), when the adapter has one. */
  id?: string;
  filename?: string;
  contentType: string;
  size: number;
  content?: Buffer;
  contentId?: string; // For inline images (<img src="cid:...">)
  contentDisposition?: 'attachment' | 'inline';
  path?: string; // File path (alternative to content)
}

export type MessageFlag =
  | '\\Seen' // Read
  | '\\Answered' // Replied
  | '\\Flagged' // Starred/Important
  | '\\Deleted' // Marked for deletion
  | '\\Draft' // Draft message
  | '\\Recent' // Recent message
  | string; // Custom flags

// ============================================================================
// Folder Types
// ============================================================================

export interface Folder {
  /** Provider-specific folder id (JMAP mailbox id, Gmail label id). */
  id?: string;
  name: string;
  path: string; // Full path (e.g., 'INBOX/Archive/2024')
  delimiter: string; // Hierarchy delimiter (e.g., '/')
  specialUse?: FolderSpecialUse;
  subscribed?: boolean;
  messageCount?: number;
  unreadCount?: number;
}

export type FolderSpecialUse =
  | '\\Inbox'
  | '\\Sent'
  | '\\Drafts'
  | '\\Trash'
  | '\\Junk'
  | '\\Archive'
  | '\\All';

export interface FolderInfo {
  name: string;
  exists: number; // Total messages
  recent: number; // Recent messages
  unseen: number; // Unread messages
  uidValidity: number; // IMAP UID validity
  uidNext: number; // Next UID
  flags: string[]; // Available flags
  permanentFlags: string[]; // Permanent flags
}

// ============================================================================
// Options Types
// ============================================================================

export interface SendOptions {
  // Delivery options
  envelope?: {
    from?: string;
    to?: string | string[];
  };

  // Encoding
  encoding?: string;
  textEncoding?: 'quoted-printable' | 'base64';

  // Headers
  headers?: Record<string, string | string[]>;
  messageId?: string; // Custom Message-ID
  date?: Date; // Custom Date

  // Tracking
  dsn?: {
    // Delivery Status Notification
    notify?: 'never' | 'success' | 'failure' | 'delay';
    ret?: 'full' | 'hdrs';
  };

  // Priority
  priority?: 'high' | 'normal' | 'low';
}

export interface FetchOptions {
  // Folder selection
  folder?: string; // Default: 'INBOX'
  labelIds?: string[]; // Gmail labels

  // Message selection
  messageIds?: string[];
  limit?: number;
  offset?: number;

  // Filters
  unreadOnly?: boolean;
  since?: Date;
  before?: Date;

  // Content options
  bodyParts?: string[]; // Which MIME parts to fetch
  markSeen?: boolean; // Mark as read when fetching

  // Gmail-specific
  q?: string; // Gmail search query
  maxResults?: number; // Gmail result limit
}

export interface SearchCriteria {
  // Basic search
  from?: string;
  to?: string;
  subject?: string;
  body?: string;

  // Date range
  since?: Date;
  before?: Date;
  sentSince?: Date;
  sentBefore?: Date;

  // Flags
  unread?: boolean;
  flagged?: boolean;
  answered?: boolean;
  draft?: boolean;
  deleted?: boolean;

  // Size
  larger?: number; // Bytes
  smaller?: number; // Bytes

  // Headers
  header?: Record<string, string>;

  // Gmail-specific
  q?: string; // Raw Gmail search query
}

export interface SendResult {
  messageId: string;
  accepted: string[]; // Accepted recipients
  rejected: string[]; // Rejected recipients
  response: string; // Server response
}

// ============================================================================
// EmailClient Interface
// ============================================================================

/**
 * Core email client interface for protocol operations.
 *
 * This interface defines low-level email operations without database persistence.
 * For database sync and AI features, use @happyvertical/smrt-messages.
 */
export interface EmailClient {
  // Send operations
  send(message: EmailMessage, options?: SendOptions): Promise<SendResult>;

  // Receive operations
  fetch(options?: FetchOptions): Promise<EmailMessage[]>;
  getMessage(messageId: string): Promise<EmailMessage>;

  // Mailbox management
  listFolders(): Promise<Folder[]>;
  selectFolder(name: string): Promise<FolderInfo>;
  createFolder(name: string): Promise<void>;
  deleteFolder(name: string): Promise<void>;

  // Message operations
  markRead(messageId: string | string[]): Promise<void>;
  markUnread(messageId: string | string[]): Promise<void>;
  move(messageId: string | string[], folder: string): Promise<void>;
  copy(messageId: string | string[], folder: string): Promise<void>;
  delete(messageId: string | string[]): Promise<void>;

  // Search
  search(criteria: SearchCriteria): Promise<EmailMessage[]>;

  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Adapter info
  getCapabilities(): Promise<EmailClientCapabilities>;
  getAdapter(): AdapterType;

  /**
   * Every message in a conversation, oldest first. Optional: adapters with
   * native threads implement it (see EmailClientCapabilities.threads); others
   * leave it undefined and callers fall back to References/In-Reply-To.
   */
  getThread?(threadId: string): Promise<EmailMessage[]>;

  // Optional incremental sync (see EmailClientCapabilities.changeFeed/push)
  getChanges?(options?: ChangeFeedOptions): Promise<ChangeFeedResult>;
  subscribeChanges?(
    listener: ChangeHintListener,
    options?: SubscribeChangesOptions,
  ): Promise<Unsubscribe>;
}

export interface EmailClientCapabilities {
  send: boolean;
  receive: boolean;
  folders: boolean;
  search: boolean;
  markRead: boolean;
  move: boolean;
  delete: boolean;
  threads: boolean;
  oauth: boolean;
  /** Supports getChanges(). Absent means false. */
  changeFeed?: boolean;
  /** Supports subscribeChanges(). Absent means false. */
  push?: boolean;
}

// ============================================================================
// Incremental Change Feed (protocol-neutral)
// ============================================================================

/**
 * Options for EmailClient.getChanges().
 *
 * The cursor is opaque: persist it exactly as returned and hand it back on
 * the next call. Its encoding is adapter-specific and may change between
 * releases; a cursor an adapter can no longer interpret yields a
 * `resync-required` result, never an exception.
 */
export interface ChangeFeedOptions {
  /** Cursor from a previous batch. Omit for the initial full pass. */
  cursor?: string;
  /** Maximum messages per batch (a hint; adapters may return fewer). Default 100. */
  limit?: number;
  /** Include bodies and attachment metadata in added/changed messages. Default false. */
  includeBodies?: boolean;
}

/**
 * One page of changes. Apply it, then persist `cursor`. While `hasMore` is
 * true call getChanges() again with the returned cursor. Persisting the cursor
 * only after the batch is applied makes the feed resumable, and applying a
 * batch twice must be harmless (consumers key on `id`).
 */
export interface ChangeFeedBatch {
  status: 'ok';
  /** Resume point after this batch. */
  cursor: string;
  /** More batches are available from `cursor` right now. */
  hasMore: boolean;
  /** True for pages of the initial pass (no cursor was supplied or it is still in progress). */
  initial: boolean;
  /** Messages new to the mailbox. During the initial pass, every message. */
  added: EmailMessage[];
  /** Messages whose flags/keywords, folders or metadata changed. */
  changed: EmailMessage[];
  /** Ids (EmailMessage.id) of messages that no longer exist. */
  removed: string[];
  /** Full folder list, present when the folder structure changed (and on the first page). */
  folders?: Folder[];
}

/** The cursor cannot be continued from; start again without a cursor. */
export interface ChangeFeedResyncRequired {
  status: 'resync-required';
  reason: 'cursor-expired' | 'cursor-invalid' | 'account-mismatch';
  message?: string;
}

export type ChangeFeedResult = ChangeFeedBatch | ChangeFeedResyncRequired;

export function isResyncRequired(
  result: ChangeFeedResult,
): result is ChangeFeedResyncRequired {
  return result.status === 'resync-required';
}

/** A push hint: something changed, call getChanges(). Carries no data. */
export interface ChangeHint {
  /** Kinds of data that changed when the server says (e.g. 'Email', 'Mailbox'). */
  types?: string[];
}

export type ChangeHintListener = (hint: ChangeHint) => void;

export interface SubscribeChangesOptions {
  /** Stops the subscription. */
  signal?: AbortSignal;
  /** Called when the push channel fails; the adapter reconnects unless aborted. */
  onError?: (error: Error) => void;
}

export type Unsubscribe = () => void;

// ============================================================================
// Adapter Configuration Types
// ============================================================================

export type AdapterType = 'smtp' | 'imap' | 'pop3' | 'gmail' | 'jmap';

export interface SMTPOptions {
  type: 'smtp';

  // Connection
  host: string;
  port: number;
  secure?: boolean; // true for 465, false for other ports
  /** Require a successful STARTTLS upgrade when secure is false. Default false. */
  requireTLS?: boolean;

  // Authentication
  auth?:
    | {
        user: string;
        pass: string;
      }
    | {
        type: 'OAuth2';
        user: string;
        clientId: string;
        clientSecret: string;
        refreshToken: string;
        accessToken?: string;
      };

  // Options
  tls?: {
    rejectUnauthorized?: boolean;
    minVersion?: string;
  };
  connectionTimeout?: number;
  greetingTimeout?: number;
  socketTimeout?: number;
  pool?: boolean; // Use connection pooling
  maxConnections?: number;
  maxMessages?: number;

  // Logging
  debug?: boolean;
}

export interface IMAPOptions {
  type: 'imap';

  // Connection
  host: string;
  port: number;
  secure?: boolean; // true for 993, false for 143

  // Authentication
  auth:
    | {
        user: string;
        pass: string;
      }
    | {
        type: 'OAuth2';
        user: string;
        accessToken: string;
      };

  // Options
  tls?: {
    rejectUnauthorized?: boolean;
    minVersion?: string;
  };
  connectionTimeout?: number;
  greetingTimeout?: number;

  // Fetch behavior
  fetchOptions?: {
    bodyParts?: string[]; // Which MIME parts to fetch
    markSeen?: boolean; // Mark as read when fetching
  };

  // Logging
  debug?: boolean;
}

export interface POP3Options {
  type: 'pop3';

  // Connection
  host: string;
  port: number;
  secure?: boolean; // true for 995, false for 110

  // Authentication
  auth: {
    user: string;
    pass: string;
  };

  // Options
  tls?: {
    rejectUnauthorized?: boolean;
  };
  connectionTimeout?: number;

  // POP3-specific
  leaveOnServer?: boolean; // Don't delete messages after fetch

  // Logging
  debug?: boolean;
}

export interface GmailOptions {
  type: 'gmail';

  // OAuth2 authentication (required)
  auth: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accessToken?: string; // Optional, will be refreshed if expired
  };

  // Options
  userId?: string; // Default: 'me'

  // Logging
  debug?: boolean;
}

export interface JMAPOptions {
  type: 'jmap';

  /**
   * Server origin or base URL (e.g. 'https://mail.example.com'). The session
   * resource is discovered at `/.well-known/jmap` (RFC 8620 section 2.2).
   */
  url: string;
  /** Explicit session resource URL; skips /.well-known/jmap discovery. */
  sessionUrl?: string;

  // Authentication: caller-supplied app password (Basic) or bearer token.
  auth:
    | {
        user: string;
        pass: string;
      }
    | {
        type: 'bearer';
        token: string;
      };

  /** Mail account id. Defaults to the session's primary mail account. */
  accountId?: string;

  /** Custom fetch (proxies, tests). Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. Default 30000. */
  timeoutMs?: number;

  // Logging
  debug?: boolean;
}

export type GetEmailClientOptions =
  | SMTPOptions
  | IMAPOptions
  | POP3Options
  | GmailOptions
  | JMAPOptions;

// ============================================================================
// Base Configuration
// ============================================================================

export interface EmailClientConfig {
  type: AdapterType;
  debug?: boolean;
  logger?: Logger;
}

export interface EmailClientOptions {
  type: AdapterType;
  debug?: boolean;
}
