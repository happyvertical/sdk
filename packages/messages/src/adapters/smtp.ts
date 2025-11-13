/**
 * SMTP adapter implementation using Nodemailer
 */

import type { Transporter } from 'nodemailer';
import nodemailer from 'nodemailer';
import { BaseMailbox } from '../shared/base';
import {
  AuthenticationError,
  ConnectionError,
  EmailError,
  SendError,
  TimeoutError,
} from '../shared/errors';
import type {
  AdapterType,
  EmailMessage,
  FetchOptions,
  Folder,
  FolderInfo,
  MailboxCapabilities,
  SearchCriteria,
  SendOptions,
  SendResult,
  SMTPOptions,
} from '../shared/types';

/**
 * SMTP adapter for sending email via SMTP protocol
 *
 * Uses Nodemailer for robust SMTP operations including:
 * - Plain text and HTML email
 * - Attachments (files and inline images)
 * - Multiple recipients (To, CC, BCC)
 * - Connection pooling
 * - OAuth2 authentication
 * - TLS/SSL support
 */
export class SMTPAdapter extends BaseMailbox {
  private transporter: Transporter;
  private options: SMTPOptions;

  constructor(options: SMTPOptions) {
    super({
      type: 'smtp',
      debug: options.debug,
      db: options.db,
      logger: options.logger,
    });

    this.options = options;
    this.transporter = this.createTransporter();
  }

  /**
   * Create Nodemailer transporter with configuration
   */
  private createTransporter(): Transporter {
    const config: nodemailer.TransportOptions = {
      host: this.options.host,
      port: this.options.port,
      secure: this.options.secure ?? false,
      auth: this.options.auth,
      tls: this.options.tls,
      connectionTimeout: this.options.connectionTimeout,
      greetingTimeout: this.options.greetingTimeout,
      socketTimeout: this.options.socketTimeout,
      pool: this.options.pool,
      maxConnections: this.options.maxConnections,
      maxMessages: this.options.maxMessages,
      debug: this.options.debug,
    };

    return nodemailer.createTransport(config);
  }

  getAdapter(): AdapterType {
    return 'smtp';
  }

  /**
   * Send an email message
   */
  async send(
    message: EmailMessage,
    options?: SendOptions,
  ): Promise<SendResult> {
    // Validate message before sending
    this.validateMessage(message);

    try {
      // Build mail options
      const mailOptions: nodemailer.SendMailOptions = {
        from: this.formatEmailAddress(message.from),
        to: message.to.map((addr) => this.formatEmailAddress(addr)),
        cc: message.cc?.map((addr) => this.formatEmailAddress(addr)),
        bcc: message.bcc?.map((addr) => this.formatEmailAddress(addr)),
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo
          ? this.formatEmailAddress(message.replyTo)
          : undefined,
        inReplyTo: message.inReplyTo,
        references: message.references,
        attachments: message.attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
          path: att.path,
          contentType: att.contentType,
          cid: att.contentId,
          contentDisposition: att.contentDisposition,
        })),
        headers: message.headers,
        messageId: message.messageId || options?.messageId,
        date: message.date || options?.date,
        encoding: options?.encoding,
        textEncoding: options?.textEncoding,
        envelope: options?.envelope,
        priority: options?.priority,
        dsn: options?.dsn,
      };

      // Send email
      this.debug('Sending email', {
        to: mailOptions.to,
        subject: message.subject,
      });
      const info = await this.transporter.sendMail(mailOptions);

      // Save sent message to database if configured
      if (this.db) {
        try {
          const messageToSave = {
            ...message,
            messageId: info.messageId,
            date: message.date || new Date(),
          };
          await this.saveMessage(messageToSave);
        } catch (error) {
          // Log but don't fail the send operation
          this.logger.warn('Failed to save sent message to database', {
            error,
          });
        }
      }

      return {
        messageId: info.messageId,
        accepted: info.accepted as string[],
        rejected: info.rejected as string[],
        response: info.response,
      };
    } catch (error) {
      throw this.mapSMTPError(error);
    }
  }

  /**
   * Format email address for Nodemailer
   */
  private formatEmailAddress(addr: { address: string; name?: string }): string {
    if (addr.name) {
      // Escape quotes in name
      const name = addr.name.replace(/"/g, '\\"');
      return `"${name}" <${addr.address}>`;
    }
    return addr.address;
  }

  /**
   * Map Nodemailer/SMTP errors to standard error types
   */
  private mapSMTPError(error: unknown): EmailError {
    if (error instanceof EmailError) {
      return error;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Authentication errors
      if (
        message.includes('authentication') ||
        message.includes('invalid login') ||
        message.includes('535')
      ) {
        return new AuthenticationError(error.message, 'smtp', error);
      }

      // Timeout errors (check before connection errors as timeout messages may contain "connection")
      if (message.includes('timeout') || message.includes('etimedout')) {
        return new TimeoutError(error.message, 'smtp', error);
      }

      // Connection errors
      if (
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('connection') ||
        message.includes('ehostunreach')
      ) {
        return new ConnectionError(error.message, 'smtp', error);
      }

      // Send errors (with recipient info if available)
      if ('accepted' in error && 'rejected' in error) {
        return new SendError(
          error.message,
          (error as never).accepted || [],
          (error as never).rejected || [],
          'smtp',
          error,
        );
      }

      return new EmailError(error.message, 'SMTP_ERROR', 'smtp', error);
    }

    return new EmailError(String(error), 'UNKNOWN_ERROR', 'smtp');
  }

  /**
   * Connect to SMTP server (verify connection)
   */
  async connect(): Promise<void> {
    try {
      this.debug('Verifying SMTP connection', { host: this.options.host });
      await this.transporter.verify();
      this.connected = true;
      this.debug('SMTP connection verified');
    } catch (error) {
      this.connected = false;
      throw this.mapSMTPError(error);
    }
  }

  /**
   * Disconnect from SMTP server
   */
  async disconnect(): Promise<void> {
    this.transporter.close();
    this.connected = false;
    this.debug('SMTP connection closed');
  }

  /**
   * Get adapter capabilities
   */
  async getCapabilities(): Promise<MailboxCapabilities> {
    return {
      send: true,
      receive: false, // SMTP is send-only
      folders: false,
      search: false,
      markRead: false,
      move: false,
      delete: false,
      threads: false,
      oauth: this.isOAuth2(),
      encryption: false, // Will be true if encryption package available
    };
  }

  /**
   * Check if using OAuth2 authentication
   */
  private isOAuth2(): boolean {
    return (
      this.options.auth !== undefined &&
      'type' in this.options.auth &&
      this.options.auth.type === 'OAuth2'
    );
  }

  // ========================================================================
  // Unsupported operations (SMTP is send-only)
  // ========================================================================

  async fetch(_options?: FetchOptions): Promise<EmailMessage[]> {
    throw new EmailError(
      'SMTP does not support receiving messages. Use IMAP or POP3 adapter.',
      'UNSUPPORTED_OPERATION',
      'smtp',
    );
  }

  async getMessage(_messageId: string): Promise<EmailMessage> {
    throw new EmailError(
      'SMTP does not support receiving messages. Use IMAP or POP3 adapter.',
      'UNSUPPORTED_OPERATION',
      'smtp',
    );
  }

  async listFolders(): Promise<Folder[]> {
    throw new EmailError(
      'SMTP does not support folder operations.',
      'UNSUPPORTED_OPERATION',
      'smtp',
    );
  }

  async selectFolder(_name: string): Promise<FolderInfo> {
    throw new EmailError(
      'SMTP does not support folder operations.',
      'UNSUPPORTED_OPERATION',
      'smtp',
    );
  }

  async createFolder(_name: string): Promise<void> {
    throw new EmailError(
      'SMTP does not support folder operations.',
      'UNSUPPORTED_OPERATION',
      'smtp',
    );
  }

  async deleteFolder(_name: string): Promise<void> {
    throw new EmailError(
      'SMTP does not support folder operations.',
      'UNSUPPORTED_OPERATION',
      'smtp',
    );
  }

  async markRead(_messageId: string | string[]): Promise<void> {
    throw new EmailError(
      'SMTP does not support message operations.',
      'UNSUPPORTED_OPERATION',
      'smtp',
    );
  }

  async markUnread(_messageId: string | string[]): Promise<void> {
    throw new EmailError(
      'SMTP does not support message operations.',
      'UNSUPPORTED_OPERATION',
      'smtp',
    );
  }

  async move(_messageId: string | string[], _folder: string): Promise<void> {
    throw new EmailError(
      'SMTP does not support message operations.',
      'UNSUPPORTED_OPERATION',
      'smtp',
    );
  }

  async copy(_messageId: string | string[], _folder: string): Promise<void> {
    throw new EmailError(
      'SMTP does not support message operations.',
      'UNSUPPORTED_OPERATION',
      'smtp',
    );
  }

  async delete(_messageId: string | string[]): Promise<void> {
    throw new EmailError(
      'SMTP does not support message operations.',
      'UNSUPPORTED_OPERATION',
      'smtp',
    );
  }

  async search(_criteria: SearchCriteria): Promise<EmailMessage[]> {
    throw new EmailError(
      'SMTP does not support search operations.',
      'UNSUPPORTED_OPERATION',
      'smtp',
    );
  }
}
