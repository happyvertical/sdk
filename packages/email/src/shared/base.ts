/**
 * Base email client adapter class
 */

import { createLogger, type Logger } from '@happyvertical/logger';
import { EmailError, InvalidMessageError } from './errors';
import type {
  AdapterType,
  EmailAddress,
  EmailClient,
  EmailClientCapabilities,
  EmailClientConfig,
  EmailMessage,
  FetchOptions,
  Folder,
  FolderInfo,
  SearchCriteria,
  SendOptions,
  SendResult,
} from './types';

/**
 * Base adapter class providing shared functionality
 *
 * All adapter implementations should extend this class.
 * This is a protocol-only base class - no database persistence.
 * For database sync and AI features, use @happyvertical/smrt-messages.
 */
export abstract class BaseEmailClient implements EmailClient {
  protected config: EmailClientConfig;
  protected logger: Logger;
  protected connected = false;

  constructor(config: EmailClientConfig) {
    this.config = this.validateConfig(config);
    this.logger = config.logger || createLogger({ level: 'info' });
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

  abstract getCapabilities(): Promise<EmailClientCapabilities>;

  abstract getAdapter(): AdapterType;

  // ========================================================================
  // Connection management
  // ========================================================================

  isConnected(): boolean {
    return this.connected;
  }

  // ========================================================================
  // Validation helpers
  // ========================================================================

  protected validateConfig(config: EmailClientConfig): EmailClientConfig {
    if (!config.type) {
      throw new EmailError('Email client type is required', 'INVALID_CONFIG');
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
