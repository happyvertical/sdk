/**
 * Base mailbox adapter class
 */

import { createLogger, type Logger } from '@happyvertical/logger';
import type { DatabaseInterface } from '@happyvertical/sql';
import {
  EmailError,
  InvalidMessageError,
  MessageNotFoundError,
} from './errors';
import { initializeSchema } from './schema';
import type {
  AdapterType,
  Attachment,
  EmailAddress,
  EmailMessage,
  FetchOptions,
  Folder,
  FolderInfo,
  Mailbox,
  MailboxCapabilities,
  MailboxConfig,
  SearchCriteria,
  SendOptions,
  SendResult,
  SyncOptions,
  SyncResult,
} from './types';

/**
 * Base adapter class providing shared functionality
 *
 * All adapter implementations should extend this class
 */
export abstract class BaseMailbox implements Mailbox {
  protected config: MailboxConfig;
  protected db?: DatabaseInterface;
  protected logger: Logger;
  protected connected = false;

  constructor(config: MailboxConfig) {
    this.config = this.validateConfig(config);
    this.db = config.db;
    this.logger = config.logger || createLogger({ level: 'info' });

    // Initialize database schema if database is provided
    if (this.db) {
      this.initializeDatabase().catch((error) => {
        this.logger.error('Failed to initialize database schema', { error });
      });
    }
  }

  /**
   * Initialize database schema
   * Creates all necessary tables and indexes
   */
  private async initializeDatabase(): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      await initializeSchema(this.db);
      this.logger.debug('Database schema initialized');
    } catch (error) {
      throw new EmailError(
        'Failed to initialize database schema',
        'DB_INIT_ERROR',
        this.getAdapter(),
        error,
      );
    }
  }

  // ========================================================================
  // Abstract methods that adapters must implement
  // ========================================================================

  abstract send(
    message: EmailMessage,
    options?: SendOptions,
  ): Promise<SendResult>;

  abstract fetch(options?: FetchOptions): Promise<EmailMessage[]>;

  abstract getMessage(messageId: string): Promise<EmailMessage>;

  abstract listFolders(): Promise<Folder[]>;

  abstract selectFolder(name: string): Promise<FolderInfo>;

  abstract createFolder(name: string): Promise<void>;

  abstract deleteFolder(name: string): Promise<void>;

  abstract markRead(messageId: string | string[]): Promise<void>;

  abstract markUnread(messageId: string | string[]): Promise<void>;

  abstract move(messageId: string | string[], folder: string): Promise<void>;

  abstract copy(messageId: string | string[], folder: string): Promise<void>;

  abstract delete(messageId: string | string[]): Promise<void>;

  abstract search(criteria: SearchCriteria): Promise<EmailMessage[]>;

  abstract connect(): Promise<void>;

  abstract disconnect(): Promise<void>;

  abstract getCapabilities(): Promise<MailboxCapabilities>;

  abstract getAdapter(): AdapterType;

  // ========================================================================
  // Database synchronization (default implementation)
  // ========================================================================

  /**
   * Synchronize messages with local database
   *
   * Default implementation - adapters can override for optimization
   */
  async sync(options?: SyncOptions): Promise<SyncResult> {
    if (!this.db) {
      throw new EmailError(
        'Database not configured for sync',
        'DB_NOT_CONFIGURED',
        this.getAdapter(),
      );
    }

    const startTime = Date.now();
    const folders = options?.folders || ['INBOX'];
    let messagesProcessed = 0;
    let messagesDownloaded = 0;
    let messagesSkipped = 0;
    const errors: Error[] = [];

    // Sync each folder
    for (const folder of folders) {
      try {
        const fetchOptions: FetchOptions = {
          folder,
          since: options?.since,
          before: options?.before,
        };

        const messages = await this.fetch(fetchOptions);

        for (const message of messages) {
          try {
            messagesProcessed++;

            // Save to database
            await this.saveMessage(message);
            messagesDownloaded++;

            // Report progress
            if (options?.onProgress) {
              options.onProgress({
                folder,
                processed: messagesProcessed,
                total: messages.length,
                downloaded: messagesDownloaded,
                skipped: messagesSkipped,
                errors: errors.length,
              });
            }
          } catch (error) {
            messagesSkipped++;
            const err =
              error instanceof Error ? error : new Error(String(error));
            errors.push(err);

            if (options?.onError) {
              options.onError(err, message);
            }
          }
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);

        if (options?.onError) {
          options.onError(err);
        }
      }
    }

    return {
      folders,
      messagesProcessed,
      messagesDownloaded,
      messagesSkipped,
      errors,
      duration: Date.now() - startTime,
    };
  }

  // ========================================================================
  // Connection management
  // ========================================================================

  isConnected(): boolean {
    return this.connected;
  }

  // ========================================================================
  // Validation helpers
  // ========================================================================

  protected validateConfig(config: MailboxConfig): MailboxConfig {
    if (!config.type) {
      throw new EmailError('Mailbox type is required', 'INVALID_CONFIG');
    }

    return config;
  }

  protected validateEmail(email: EmailAddress): void {
    if (!email.address) {
      throw new InvalidMessageError(
        'Email address is required',
        this.getAdapter(),
      );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.address)) {
      throw new InvalidMessageError(
        `Invalid email address: ${email.address}`,
        this.getAdapter(),
      );
    }
  }

  protected validateMessage(message: EmailMessage): void {
    // Validate sender
    if (!message.from) {
      throw new InvalidMessageError(
        'Message must have a sender (from)',
        this.getAdapter(),
      );
    }
    this.validateEmail(message.from);

    // Validate recipients
    if (!message.to || message.to.length === 0) {
      throw new InvalidMessageError(
        'Message must have at least one recipient (to)',
        this.getAdapter(),
      );
    }
    for (const recipient of message.to) {
      this.validateEmail(recipient);
    }

    // Validate CC recipients
    if (message.cc) {
      for (const recipient of message.cc) {
        this.validateEmail(recipient);
      }
    }

    // Validate BCC recipients
    if (message.bcc) {
      for (const recipient of message.bcc) {
        this.validateEmail(recipient);
      }
    }

    // Validate subject
    if (!message.subject) {
      throw new InvalidMessageError(
        'Message must have a subject',
        this.getAdapter(),
      );
    }

    // Validate content
    if (!message.text && !message.html) {
      throw new InvalidMessageError(
        'Message must have either text or HTML content',
        this.getAdapter(),
      );
    }
  }

  // ========================================================================
  // Error mapping
  // ========================================================================

  protected mapError(error: unknown): EmailError {
    if (error instanceof EmailError) {
      return error;
    }

    if (error instanceof Error) {
      return new EmailError(
        error.message,
        'UNKNOWN_ERROR',
        this.getAdapter(),
        error,
      );
    }

    return new EmailError(String(error), 'UNKNOWN_ERROR', this.getAdapter());
  }

  // ========================================================================
  // Database operations
  // ========================================================================

  protected async saveMessage(message: EmailMessage): Promise<void> {
    if (!this.db) {
      return;
    }

    const now = new Date().toISOString();

    // Prepare message data for database
    const messageData = {
      id: message.id || `msg-${Date.now()}`,
      account_id: this.config.accountId || 'default',
      message_id: message.messageId || message.id || `msg-${Date.now()}`,
      thread_id: message.threadId || null,
      in_reply_to: message.inReplyTo || null,
      from_address: message.from.address,
      from_name: message.from.name || null,
      to_addresses: JSON.stringify(message.to),
      cc_addresses: message.cc ? JSON.stringify(message.cc) : null,
      bcc_addresses: message.bcc ? JSON.stringify(message.bcc) : null,
      reply_to_address: message.replyTo?.address || null,
      reply_to_name: message.replyTo?.name || null,
      subject: message.subject,
      date: message.date ? message.date.toISOString() : now,
      text_body: message.text || null,
      html_body: message.html || null,
      folder_id: null, // Will be set by folder management
      folder_path: message.folder || null,
      labels: message.labels ? JSON.stringify(message.labels) : null,
      flags: message.flags ? JSON.stringify(message.flags) : null,
      is_read: message.flags?.includes('\\Seen') ? 1 : 0,
      is_flagged: message.flags?.includes('\\Flagged') ? 1 : 0,
      is_answered: message.flags?.includes('\\Answered') ? 1 : 0,
      is_draft: message.flags?.includes('\\Draft') ? 1 : 0,
      has_attachments:
        message.attachments && message.attachments.length > 0 ? 1 : 0,
      size: message.size || null,
      raw_message: message.raw || null,
      headers: message.headers ? JSON.stringify(message.headers) : null,
      created_at: now,
      updated_at: now,
    };

    // Insert or update message
    await this.db.insert('email_messages', messageData);

    // Save attachments if present
    if (message.attachments && message.attachments.length > 0) {
      for (const attachment of message.attachments) {
        await this.db.insert('email_attachments', {
          id: `att-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          message_id: messageData.id,
          filename: attachment.filename || null,
          content_type: attachment.contentType,
          size: attachment.size,
          content_id: attachment.contentId || null,
          content_disposition: attachment.contentDisposition || 'attachment',
          content: attachment.content || null,
          file_path: attachment.path || null,
          created_at: now,
        });
      }
    }

    this.logger.debug('Message saved to database', {
      messageId: messageData.id,
    });
  }

  protected async loadMessage(messageId: string): Promise<EmailMessage> {
    if (!this.db) {
      throw new MessageNotFoundError(messageId, this.getAdapter());
    }

    // Query message from database
    const row = await this.db.get('email_messages', {
      message_id: messageId,
    });

    if (!row) {
      throw new MessageNotFoundError(messageId, this.getAdapter());
    }

    // Parse JSON fields
    const to = JSON.parse(row.to_addresses || '[]');
    const cc = row.cc_addresses ? JSON.parse(row.cc_addresses) : undefined;
    const bcc = row.bcc_addresses ? JSON.parse(row.bcc_addresses) : undefined;
    const labels = row.labels ? JSON.parse(row.labels) : undefined;
    const flags = row.flags ? JSON.parse(row.flags) : undefined;
    const headers = row.headers ? JSON.parse(row.headers) : undefined;

    // Build reply-to if present
    const replyTo = row.reply_to_address
      ? {
          address: row.reply_to_address,
          name: row.reply_to_name || undefined,
        }
      : undefined;

    // Load attachments
    let attachments: Attachment[] | undefined;
    if (row.has_attachments) {
      const attachmentRows = await this.db.list('email_attachments', {
        message_id: row.id,
      });

      // biome-ignore lint/suspicious/noExplicitAny: Database row type is dynamic
      attachments = attachmentRows.map((att: any) => ({
        filename: att.filename || undefined,
        contentType: att.content_type,
        size: att.size,
        contentId: att.content_id || undefined,
        contentDisposition: att.content_disposition || 'attachment',
        content: att.content || undefined,
        path: att.file_path || undefined,
      }));
    }

    // Reconstruct EmailMessage
    const message: EmailMessage = {
      id: row.id,
      messageId: row.message_id,
      threadId: row.thread_id || undefined,
      inReplyTo: row.in_reply_to || undefined,
      from: {
        address: row.from_address,
        name: row.from_name || undefined,
      },
      to,
      cc,
      bcc,
      replyTo,
      subject: row.subject,
      date: new Date(row.date),
      text: row.text_body || undefined,
      html: row.html_body || undefined,
      folder: row.folder_path || undefined,
      labels,
      flags,
      attachments,
      size: row.size || undefined,
      raw: row.raw_message || undefined,
      headers,
    };

    return message;
  }

  // ========================================================================
  // Utility methods
  // ========================================================================

  protected normalizeMessageIds(messageId: string | string[]): string[] {
    return Array.isArray(messageId) ? messageId : [messageId];
  }

  protected debug(message: string, data?: unknown): void {
    if (this.config.debug) {
      this.logger.debug(message, data as Record<string, unknown> | undefined);
    }
  }
}
