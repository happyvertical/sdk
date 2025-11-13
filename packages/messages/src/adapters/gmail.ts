/**
 * Gmail adapter using Gmail API with OAuth2
 */

import type { gmail_v1 } from 'googleapis';
import { google, type OAuth2Client } from 'googleapis';
import { simpleParser } from 'mailparser';
import { BaseMailbox } from '../shared/base';
import {
  AuthenticationError,
  ConnectionError,
  EmailError,
  FolderExistsError,
  FolderNotFoundError,
  MessageNotFoundError,
  SendError,
  TimeoutError,
} from '../shared/errors';
import type {
  AdapterType,
  EmailMessage,
  FetchOptions,
  Folder,
  FolderInfo,
  GmailOptions,
  MailboxCapabilities,
  SearchCriteria,
  SendOptions,
  SendResult,
} from '../shared/types';

/**
 * Gmail adapter implementation using Gmail API
 *
 * Requires OAuth2 credentials with appropriate scopes:
 * - gmail.readonly: Read emails and settings
 * - gmail.send: Send emails
 * - gmail.modify: Modify emails (mark read, delete, move)
 * - gmail.labels: Manage labels
 */
export class GmailAdapter extends BaseMailbox {
  private gmail: gmail_v1.Gmail | null = null;
  private options: GmailOptions;
  private auth: OAuth2Client | null = null;

  constructor(options: GmailOptions) {
    super(options);
    this.options = options;
  }

  // ========================================================================
  // Connection management
  // ========================================================================

  async connect(): Promise<void> {
    try {
      // Create OAuth2 client
      this.auth = new google.auth.OAuth2(
        this.options.auth.clientId,
        this.options.auth.clientSecret,
      );
      this.auth.setCredentials({
        refresh_token: this.options.auth.refreshToken,
        access_token: this.options.auth.accessToken,
      });

      // Create Gmail API client
      this.gmail = google.gmail({ version: 'v1', auth: this.auth });

      // Test connection by getting profile
      await this.gmail.users.getProfile({ userId: this.getUserId() });

      this.connected = true;
      this.debug('Connected to Gmail API');
    } catch (error) {
      throw this.mapGmailError(error);
    }
  }

  async disconnect(): Promise<void> {
    this.gmail = null;
    this.auth = null;
    this.connected = false;
    this.debug('Disconnected from Gmail API');
  }

  // ========================================================================
  // Send operations
  // ========================================================================

  async send(
    message: EmailMessage,
    options?: SendOptions,
  ): Promise<SendResult> {
    this.ensureConnected();
    this.validateMessage(message);

    try {
      // Build RFC 2822 formatted email
      const email = this.buildRFC2822Message(message, options);

      // Encode email in base64url format
      const encodedEmail = Buffer.from(email)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      // Send message
      const response = await this.gmail?.users.messages.send({
        userId: this.getUserId(),
        requestBody: {
          raw: encodedEmail,
        },
      });

      return {
        messageId: response.data.id || '',
        accepted: message.to.map((addr) => addr.address),
        rejected: [],
        response: `Message sent: ${response.data.id}`,
      };
    } catch (error) {
      throw this.mapGmailError(error);
    }
  }

  // ========================================================================
  // Receive operations
  // ========================================================================

  async fetch(options?: FetchOptions): Promise<EmailMessage[]> {
    this.ensureConnected();

    try {
      // Build query
      const query = this.buildGmailQuery(options);

      // List messages
      const listResponse = await this.gmail?.users.messages.list({
        userId: this.getUserId(),
        q: query,
        labelIds: options?.labelIds,
        maxResults: options?.maxResults || options?.limit || 100,
      });

      const messageIds = listResponse.data.messages || [];

      if (messageIds.length === 0) {
        return [];
      }

      // Fetch full message details
      const messages: EmailMessage[] = [];
      for (const msgId of messageIds) {
        if (!msgId.id) continue;

        try {
          const message = await this.getMessage(msgId.id);
          messages.push(message);

          // Apply limit
          if (options?.limit && messages.length >= options.limit) {
            break;
          }
        } catch (error) {
          this.logger.error(`Failed to fetch message ${msgId.id}:`, error);
        }
      }

      return messages;
    } catch (error) {
      throw this.mapGmailError(error);
    }
  }

  async getMessage(messageId: string): Promise<EmailMessage> {
    this.ensureConnected();

    try {
      const response = await this.gmail?.users.messages.get({
        userId: this.getUserId(),
        id: messageId,
        format: 'raw',
      });

      if (!response.data.raw) {
        throw new MessageNotFoundError(messageId, 'gmail');
      }

      // Decode raw message
      const rawMessage = Buffer.from(response.data.raw, 'base64').toString(
        'utf-8',
      );

      // Parse message
      const parsed = await simpleParser(rawMessage);

      // Get labels
      const labels = response.data.labelIds || [];

      return {
        id: response.data.id,
        messageId: parsed.messageId || response.data.id,
        threadId: response.data.threadId,
        inReplyTo: parsed.inReplyTo,
        references: parsed.references
          ? Array.isArray(parsed.references)
            ? parsed.references
            : [parsed.references]
          : undefined,
        from: {
          address: parsed.from?.value[0]?.address || '',
          name: parsed.from?.value[0]?.name,
        },
        to:
          parsed.to?.value.map((addr) => ({
            address: addr.address || '',
            name: addr.name,
          })) || [],
        cc: parsed.cc?.value.map((addr) => ({
          address: addr.address || '',
          name: addr.name,
        })),
        bcc: parsed.bcc?.value.map((addr) => ({
          address: addr.address || '',
          name: addr.name,
        })),
        replyTo: parsed.replyTo?.value[0]
          ? {
              address: parsed.replyTo.value[0].address || '',
              name: parsed.replyTo.value[0].name,
            }
          : undefined,
        subject: parsed.subject || '',
        date: parsed.date,
        text: parsed.text,
        html: parsed.html ? parsed.html.toString() : undefined,
        attachments: parsed.attachments?.map((att) => ({
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          content: att.content,
          contentId: att.contentId,
          contentDisposition: att.contentDisposition as 'attachment' | 'inline',
        })),
        labels,
        headers: parsed.headers as unknown as Record<string, string | string[]>,
        size: Number(response.data.sizeEstimate),
        raw: rawMessage,
      };
    } catch (error) {
      if (error instanceof MessageNotFoundError) {
        throw error;
      }
      throw this.mapGmailError(error);
    }
  }

  // ========================================================================
  // Label operations (Gmail uses labels instead of folders)
  // ========================================================================

  async listFolders(): Promise<Folder[]> {
    this.ensureConnected();

    try {
      const response = await this.gmail?.users.labels.list({
        userId: this.getUserId(),
      });

      const labels = response.data.labels || [];

      return labels.map((label) => ({
        name: label.name || '',
        path: label.id || '',
        delimiter: '/',
        specialUse: this.mapGmailLabelToSpecialUse(label.type),
        messageCount: label.messagesTotal,
        unreadCount: label.messagesUnread,
      }));
    } catch (error) {
      throw this.mapGmailError(error);
    }
  }

  async selectFolder(name: string): Promise<FolderInfo> {
    this.ensureConnected();

    try {
      // Find label by name or ID
      const labels = await this.listFolders();
      const label = labels.find((l) => l.name === name || l.path === name);

      if (!label) {
        throw new FolderNotFoundError(name, 'gmail');
      }

      return {
        name: label.name,
        exists: label.messageCount || 0,
        recent: 0,
        unseen: label.unreadCount || 0,
        uidValidity: 0,
        uidNext: 0,
        flags: [],
        permanentFlags: [],
      };
    } catch (error) {
      if (error instanceof FolderNotFoundError) {
        throw error;
      }
      throw this.mapGmailError(error);
    }
  }

  async createFolder(name: string): Promise<void> {
    this.ensureConnected();

    try {
      // Check if label already exists
      const labels = await this.listFolders();
      if (labels.some((l) => l.name === name)) {
        throw new FolderExistsError(name, 'gmail');
      }

      await this.gmail?.users.labels.create({
        userId: this.getUserId(),
        requestBody: {
          name,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });
    } catch (error) {
      if (error instanceof FolderExistsError) {
        throw error;
      }
      throw this.mapGmailError(error);
    }
  }

  async deleteFolder(name: string): Promise<void> {
    this.ensureConnected();

    try {
      // Find label by name
      const labels = await this.listFolders();
      const label = labels.find((l) => l.name === name);

      if (!label) {
        throw new FolderNotFoundError(name, 'gmail');
      }

      // Can't delete system labels
      if (label.specialUse) {
        throw new EmailError(
          `Cannot delete system label: ${name}`,
          'INVALID_OPERATION',
          'gmail',
        );
      }

      await this.gmail?.users.labels.delete({
        userId: this.getUserId(),
        id: label.path,
      });
    } catch (error) {
      if (error instanceof FolderNotFoundError || error instanceof EmailError) {
        throw error;
      }
      throw this.mapGmailError(error);
    }
  }

  // ========================================================================
  // Message operations
  // ========================================================================

  async markRead(messageId: string | string[]): Promise<void> {
    this.ensureConnected();

    const ids = this.normalizeMessageIds(messageId);

    try {
      for (const id of ids) {
        await this.gmail?.users.messages.modify({
          userId: this.getUserId(),
          id,
          requestBody: {
            removeLabelIds: ['UNREAD'],
          },
        });
      }
    } catch (error) {
      throw this.mapGmailError(error);
    }
  }

  async markUnread(messageId: string | string[]): Promise<void> {
    this.ensureConnected();

    const ids = this.normalizeMessageIds(messageId);

    try {
      for (const id of ids) {
        await this.gmail?.users.messages.modify({
          userId: this.getUserId(),
          id,
          requestBody: {
            addLabelIds: ['UNREAD'],
          },
        });
      }
    } catch (error) {
      throw this.mapGmailError(error);
    }
  }

  async move(messageId: string | string[], folder: string): Promise<void> {
    this.ensureConnected();

    const ids = this.normalizeMessageIds(messageId);

    try {
      // Find label ID
      const labels = await this.listFolders();
      const label = labels.find((l) => l.name === folder || l.path === folder);

      if (!label) {
        throw new FolderNotFoundError(folder, 'gmail');
      }

      for (const id of ids) {
        await this.gmail?.users.messages.modify({
          userId: this.getUserId(),
          id,
          requestBody: {
            addLabelIds: [label.path],
          },
        });
      }
    } catch (error) {
      if (error instanceof FolderNotFoundError) {
        throw error;
      }
      throw this.mapGmailError(error);
    }
  }

  async copy(messageId: string | string[], folder: string): Promise<void> {
    // Gmail doesn't support copying messages directly
    // Move is more appropriate since messages can have multiple labels
    await this.move(messageId, folder);
  }

  async delete(messageId: string | string[]): Promise<void> {
    this.ensureConnected();

    const ids = this.normalizeMessageIds(messageId);

    try {
      for (const id of ids) {
        // Move to trash instead of permanent delete
        await this.gmail?.users.messages.trash({
          userId: this.getUserId(),
          id,
        });
      }
    } catch (error) {
      throw this.mapGmailError(error);
    }
  }

  // ========================================================================
  // Search
  // ========================================================================

  async search(criteria: SearchCriteria): Promise<EmailMessage[]> {
    this.ensureConnected();

    try {
      // Use Gmail's search query if provided
      if (criteria.q) {
        return await this.fetch({ q: criteria.q });
      }

      // Build Gmail query from criteria
      const queryParts: string[] = [];

      if (criteria.from) queryParts.push(`from:${criteria.from}`);
      if (criteria.to) queryParts.push(`to:${criteria.to}`);
      if (criteria.subject) queryParts.push(`subject:${criteria.subject}`);
      if (criteria.body) queryParts.push(criteria.body);

      if (criteria.since) {
        queryParts.push(`after:${this.formatGmailDate(criteria.since)}`);
      }
      if (criteria.before) {
        queryParts.push(`before:${this.formatGmailDate(criteria.before)}`);
      }

      if (criteria.unread === true) queryParts.push('is:unread');
      if (criteria.unread === false) queryParts.push('is:read');
      if (criteria.flagged) queryParts.push('is:starred');

      if (criteria.larger) queryParts.push(`larger:${criteria.larger}`);
      if (criteria.smaller) queryParts.push(`smaller:${criteria.smaller}`);

      const query = queryParts.join(' ');

      return await this.fetch({ q: query });
    } catch (error) {
      throw this.mapGmailError(error);
    }
  }

  // ========================================================================
  // Adapter info
  // ========================================================================

  async getCapabilities(): Promise<MailboxCapabilities> {
    return {
      send: true,
      receive: true,
      folders: true,
      search: true,
      markRead: true,
      move: true,
      delete: true,
      threads: true,
      oauth: true,
      encryption: false,
    };
  }

  getAdapter(): AdapterType {
    return 'gmail';
  }

  // ========================================================================
  // Private helper methods
  // ========================================================================

  private ensureConnected(): void {
    if (!this.connected || !this.gmail) {
      throw new ConnectionError(
        'Not connected to Gmail. Call connect() first.',
        'gmail',
      );
    }
  }

  private getUserId(): string {
    return this.options.userId || 'me';
  }

  private buildRFC2822Message(
    message: EmailMessage,
    options?: SendOptions,
  ): string {
    const lines: string[] = [];
    const hasAttachments =
      message.attachments && message.attachments.length > 0;

    // Headers
    lines.push(`From: ${this.formatEmailAddress(message.from)}`);
    lines.push(
      `To: ${message.to.map((a) => this.formatEmailAddress(a)).join(', ')}`,
    );

    if (message.cc && message.cc.length > 0) {
      lines.push(
        `Cc: ${message.cc.map((a) => this.formatEmailAddress(a)).join(', ')}`,
      );
    }

    if (message.replyTo) {
      lines.push(`Reply-To: ${this.formatEmailAddress(message.replyTo)}`);
    }

    lines.push(`Subject: ${message.subject}`);
    lines.push(
      `Date: ${options?.date?.toUTCString() || new Date().toUTCString()}`,
    );

    if (options?.messageId) {
      lines.push(`Message-ID: <${options.messageId}>`);
    }

    lines.push('MIME-Version: 1.0');

    // If there are attachments, use multipart/mixed
    if (hasAttachments) {
      lines.push('Content-Type: multipart/mixed; boundary="mixed-boundary"');
      lines.push('');
      lines.push('--mixed-boundary');

      // Message body (text/html alternative)
      if (message.html) {
        lines.push(
          'Content-Type: multipart/alternative; boundary="alt-boundary"',
        );
        lines.push('');
        lines.push('--alt-boundary');
        lines.push('Content-Type: text/plain; charset="UTF-8"');
        lines.push('Content-Transfer-Encoding: 7bit');
        lines.push('');
        lines.push(message.text || '');
        lines.push('');
        lines.push('--alt-boundary');
        lines.push('Content-Type: text/html; charset="UTF-8"');
        lines.push('Content-Transfer-Encoding: 7bit');
        lines.push('');
        lines.push(message.html);
        lines.push('');
        lines.push('--alt-boundary--');
      } else {
        lines.push('Content-Type: text/plain; charset="UTF-8"');
        lines.push('Content-Transfer-Encoding: 7bit');
        lines.push('');
        lines.push(message.text || '');
      }

      // Attachments
      for (const attachment of message.attachments) {
        lines.push('');
        lines.push('--mixed-boundary');
        lines.push(
          `Content-Type: ${attachment.contentType}; name="${attachment.filename}"`,
        );
        lines.push('Content-Transfer-Encoding: base64');
        lines.push(
          `Content-Disposition: ${attachment.contentDisposition || 'attachment'}; filename="${attachment.filename}"`,
        );
        if (attachment.contentId) {
          lines.push(`Content-ID: <${attachment.contentId}>`);
        }
        lines.push('');

        // Encode attachment content as base64
        const content = attachment.content || Buffer.from('');
        const base64Content = content.toString('base64');

        // Split base64 into 76-character lines (RFC 2045)
        const base64Lines = base64Content.match(/.{1,76}/g) || [];
        lines.push(...base64Lines);
      }

      lines.push('');
      lines.push('--mixed-boundary--');
    } else {
      // No attachments - simple message
      if (message.html) {
        lines.push(
          'Content-Type: multipart/alternative; boundary="alt-boundary"',
        );
        lines.push('');
        lines.push('--alt-boundary');
        lines.push('Content-Type: text/plain; charset="UTF-8"');
        lines.push('Content-Transfer-Encoding: 7bit');
        lines.push('');
        lines.push(message.text || '');
        lines.push('');
        lines.push('--alt-boundary');
        lines.push('Content-Type: text/html; charset="UTF-8"');
        lines.push('Content-Transfer-Encoding: 7bit');
        lines.push('');
        lines.push(message.html);
        lines.push('');
        lines.push('--alt-boundary--');
      } else {
        lines.push('Content-Type: text/plain; charset="UTF-8"');
        lines.push('Content-Transfer-Encoding: 7bit');
        lines.push('');
        lines.push(message.text || '');
      }
    }

    return lines.join('\r\n');
  }

  private formatEmailAddress(addr: { address: string; name?: string }): string {
    if (addr.name) {
      return `${addr.name} <${addr.address}>`;
    }
    return addr.address;
  }

  private buildGmailQuery(options?: FetchOptions): string {
    const queryParts: string[] = [];

    // Use provided query if available
    if (options?.q) {
      return options.q;
    }

    // Date filters
    if (options?.since) {
      queryParts.push(`after:${this.formatGmailDate(options.since)}`);
    }
    if (options?.before) {
      queryParts.push(`before:${this.formatGmailDate(options.before)}`);
    }

    // Unread filter
    if (options?.unreadOnly) {
      queryParts.push('is:unread');
    }

    return queryParts.join(' ');
  }

  private formatGmailDate(date: Date): string {
    // Format: YYYY/MM/DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  private mapGmailLabelToSpecialUse(
    type?: string | null,
  ):
    | '\\Inbox'
    | '\\Sent'
    | '\\Drafts'
    | '\\Trash'
    | '\\Junk'
    | '\\Archive'
    | '\\All'
    | undefined {
    switch (type) {
      case 'system':
        return '\\Inbox';
      default:
        return undefined;
    }
  }

  private mapGmailError(error: unknown): EmailError {
    if (error instanceof EmailError) {
      return error;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      const errorObj = error as Record<string, unknown>;

      // Timeout errors
      if (
        message.includes('timeout') ||
        errorObj.code === 'ETIMEDOUT' ||
        errorObj.code === 'ESOCKETTIMEDOUT'
      ) {
        return new TimeoutError(error.message, 'gmail', error);
      }

      // Connection errors
      if (
        message.includes('network') ||
        message.includes('connect') ||
        errorObj.code === 'ECONNREFUSED' ||
        errorObj.code === 'ENOTFOUND' ||
        errorObj.code === 'ECONNRESET'
      ) {
        return new ConnectionError(error.message, 'gmail', error);
      }

      // Authentication errors
      if (
        message.includes('auth') ||
        message.includes('invalid_grant') ||
        message.includes('unauthorized') ||
        errorObj.code === 401
      ) {
        return new AuthenticationError(error.message, 'gmail', error);
      }

      // Send errors
      if (message.includes('recipient') || message.includes('invalid email')) {
        return new SendError(error.message, [], [], 'gmail', error);
      }

      return new EmailError(error.message, 'GMAIL_ERROR', 'gmail', error);
    }

    return new EmailError(String(error), 'GMAIL_ERROR', 'gmail');
  }
}
