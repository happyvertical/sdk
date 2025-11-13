/**
 * Core types for @happyvertical/messages package
 */

import type { Logger } from '@happyvertical/logger';
import type { DatabaseInterface } from '@happyvertical/sql';

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

export interface SyncOptions {
  // Folder selection
  folders?: string[]; // Default: ['INBOX']

  // Date range
  since?: Date;
  before?: Date;

  // Sync behavior
  fullSync?: boolean; // Sync all messages (vs incremental)
  deleteRemoved?: boolean; // Delete local messages removed from server

  // Content options
  downloadAttachments?: boolean;
  maxAttachmentSize?: number; // Skip large attachments

  // Performance
  batchSize?: number; // Messages per batch
  maxConcurrency?: number; // Parallel operations

  // Callbacks
  onProgress?: (stats: SyncProgress) => void;
  onError?: (error: Error, message?: EmailMessage) => void;
}

export interface SyncProgress {
  folder: string;
  processed: number;
  total: number;
  downloaded: number;
  skipped: number;
  errors: number;
}

export interface SyncResult {
  folders: string[];
  messagesProcessed: number;
  messagesDownloaded: number;
  messagesSkipped: number;
  errors: Error[];
  duration: number; // Milliseconds
}

export interface SendResult {
  messageId: string;
  accepted: string[]; // Accepted recipients
  rejected: string[]; // Rejected recipients
  response: string; // Server response
}

// ============================================================================
// Mailbox Interface
// ============================================================================

export interface Mailbox {
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

  // Database synchronization
  sync(options?: SyncOptions): Promise<SyncResult>;

  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Adapter info
  getCapabilities(): Promise<MailboxCapabilities>;
  getAdapter(): AdapterType;
}

export interface MailboxCapabilities {
  send: boolean;
  receive: boolean;
  folders: boolean;
  search: boolean;
  markRead: boolean;
  move: boolean;
  delete: boolean;
  threads: boolean;
  oauth: boolean;
  encryption: boolean; // If @happyvertical/encryption available
}

// ============================================================================
// Adapter Configuration Types
// ============================================================================

export type AdapterType = 'smtp' | 'imap' | 'pop3' | 'gmail';

export interface SMTPOptions {
  type: 'smtp';

  // Connection
  host: string;
  port: number;
  secure?: boolean; // true for 465, false for other ports

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

  // Database
  db?: DatabaseInterface;

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

  // Database
  db?: DatabaseInterface;

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

  // Database
  db?: DatabaseInterface;

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

  // Database
  db?: DatabaseInterface;

  // Logging
  debug?: boolean;
}

export type GetMailboxOptions =
  | SMTPOptions
  | IMAPOptions
  | POP3Options
  | GmailOptions;

// ============================================================================
// Base Configuration
// ============================================================================

export interface MailboxConfig {
  type: AdapterType;
  debug?: boolean;
  db?: Database;
  logger?: Logger;
}

export interface MailboxOptions {
  type: AdapterType;
  debug?: boolean;
  db?: Database;
}
