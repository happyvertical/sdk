/**
 * Base mailbox adapter class
 */

import { createLogger, type Logger } from '@happyvertical/logger';
import type { Database } from '@happyvertical/sql';
import {
  EmailError,
  InvalidMessageError,
  MessageNotFoundError,
} from './errors';
import type {
  AdapterType,
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
  protected db?: Database;
  protected logger: Logger;
  protected connected = false;

  constructor(config: MailboxConfig) {
    this.config = this.validateConfig(config);
    this.db = config.db;
    this.logger = config.logger || createLogger('messages');
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

    // TODO: Implement database schema and save logic
    // This will be implemented in Phase 5
    this.logger.debug('saveMessage not yet implemented', { message });
  }

  protected async loadMessage(messageId: string): Promise<EmailMessage> {
    if (!this.db) {
      throw new MessageNotFoundError(messageId, this.getAdapter());
    }

    // TODO: Implement database load logic
    // This will be implemented in Phase 5
    throw new MessageNotFoundError(messageId, this.getAdapter());
  }

  // ========================================================================
  // Utility methods
  // ========================================================================

  protected normalizeMessageIds(messageId: string | string[]): string[] {
    return Array.isArray(messageId) ? messageId : [messageId];
  }

  protected debug(message: string, data?: unknown): void {
    if (this.config.debug) {
      this.logger.debug(message, data);
    }
  }
}
