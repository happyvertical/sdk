/**
 * POP3 adapter for receiving email
 */

import { simpleParser } from 'mailparser';
import Pop3Command from 'node-pop3';
import { BaseMailbox } from '../shared/base';
import {
  AuthenticationError,
  ConnectionError,
  EmailError,
  MessageNotFoundError,
  TimeoutError,
} from '../shared/errors';
import type {
  AdapterType,
  EmailMessage,
  FetchOptions,
  Folder,
  FolderInfo,
  MailboxCapabilities,
  POP3Options,
  SearchCriteria,
  SendOptions,
  SendResult,
} from '../shared/types';

/**
 * POP3 adapter implementation
 *
 * POP3 is a simple protocol for retrieving email. It does not support:
 * - Folders (POP3 has no folder concept)
 * - Marking messages as read/unread
 * - Moving or copying messages
 * - Server-side search
 *
 * By default, POP3 deletes messages from the server after retrieval.
 * Use leaveOnServer: true to keep messages on the server.
 */
export class POP3Adapter extends BaseMailbox {
  private client: Pop3Command | null = null;
  private options: POP3Options;
  private messageCache: Map<string, string> = new Map(); // msgNum -> UID

  constructor(options: POP3Options) {
    super(options);
    this.options = options;
  }

  // ========================================================================
  // Connection management
  // ========================================================================

  async connect(): Promise<void> {
    try {
      this.client = new Pop3Command({
        user: this.options.auth.user,
        password: this.options.auth.pass,
        host: this.options.host,
        port: this.options.port,
        tls: this.options.secure ?? this.options.port === 995,
        timeout: this.options.connectionTimeout,
        tlsOptions: this.options.tls,
      });

      await this.client.connect();
      this.connected = true;
      this.debug('Connected to POP3 server');
    } catch (error) {
      throw this.mapPOP3Error(error);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.QUIT();
      this.client = null;
      this.connected = false;
      this.messageCache.clear();
      this.debug('Disconnected from POP3 server');
    } catch (error) {
      this.client = null;
      this.connected = false;
      this.messageCache.clear();
      throw this.mapPOP3Error(error);
    }
  }

  // ========================================================================
  // Message operations
  // ========================================================================

  async fetch(options?: FetchOptions): Promise<EmailMessage[]> {
    this.ensureConnected();

    try {
      // Get list of message UIDs
      const uidlResponse = await this.client?.UIDL();
      const uidList = this.parseUidlResponse(uidlResponse[0]);

      if (uidList.length === 0) {
        return [];
      }

      // Update message cache
      this.messageCache.clear();
      for (const { msgNum, uid } of uidList) {
        this.messageCache.set(msgNum, uid);
      }

      // Apply limit and offset
      let messageNums = uidList.map((item) => item.msgNum);
      if (options?.offset) {
        messageNums = messageNums.slice(options.offset);
      }
      if (options?.limit) {
        messageNums = messageNums.slice(0, options.limit);
      }

      // Fetch messages
      const messages: EmailMessage[] = [];
      for (const msgNum of messageNums) {
        try {
          const message = await this.fetchMessage(msgNum);

          // Apply filters
          if (this.shouldIncludeMessage(message, options)) {
            messages.push(message);

            // Delete from server if not leaving on server
            if (!this.options.leaveOnServer) {
              await this.deleteMessageByNum(msgNum);
            }
          }
        } catch (error) {
          this.logger.error(`Failed to fetch message ${msgNum}:`, error);
        }
      }

      return messages;
    } catch (error) {
      throw this.mapPOP3Error(error);
    }
  }

  async getMessage(messageId: string): Promise<EmailMessage> {
    this.ensureConnected();

    try {
      // First try to find by UID in cache
      let msgNum: string | null = null;
      for (const [num, uid] of this.messageCache.entries()) {
        if (uid === messageId) {
          msgNum = num;
          break;
        }
      }

      // If not in cache, refresh UIDL
      if (!msgNum) {
        const uidlResponse = await this.client?.UIDL();
        const uidList = this.parseUidlResponse(uidlResponse[0]);

        this.messageCache.clear();
        for (const { msgNum: num, uid } of uidList) {
          this.messageCache.set(num, uid);
          if (uid === messageId) {
            msgNum = num;
          }
        }
      }

      if (!msgNum) {
        throw new MessageNotFoundError(messageId, 'pop3');
      }

      return await this.fetchMessage(msgNum);
    } catch (error) {
      if (error instanceof MessageNotFoundError) {
        throw error;
      }
      throw this.mapPOP3Error(error);
    }
  }

  async delete(messageId: string | string[]): Promise<void> {
    this.ensureConnected();

    const ids = this.normalizeMessageIds(messageId);

    for (const id of ids) {
      try {
        // Find message number by UID
        let msgNum: string | null = null;
        for (const [num, uid] of this.messageCache.entries()) {
          if (uid === id) {
            msgNum = num;
            break;
          }
        }

        if (!msgNum) {
          // Refresh UIDL
          const uidlResponse = await this.client?.UIDL();
          const uidList = this.parseUidlResponse(uidlResponse[0]);

          for (const { msgNum: num, uid } of uidList) {
            if (uid === id) {
              msgNum = num;
              break;
            }
          }
        }

        if (!msgNum) {
          throw new MessageNotFoundError(id, 'pop3');
        }

        await this.deleteMessageByNum(msgNum);
      } catch (error) {
        throw this.mapPOP3Error(error);
      }
    }
  }

  // ========================================================================
  // Unsupported operations (POP3 limitations)
  // ========================================================================

  async send(
    _message: EmailMessage,
    _options?: SendOptions,
  ): Promise<SendResult> {
    throw new EmailError(
      'POP3 does not support sending email. Use SMTP instead.',
      'UNSUPPORTED_OPERATION',
      'pop3',
    );
  }

  async listFolders(): Promise<Folder[]> {
    throw new EmailError(
      'POP3 does not support folders',
      'UNSUPPORTED_OPERATION',
      'pop3',
    );
  }

  async selectFolder(_name: string): Promise<FolderInfo> {
    throw new EmailError(
      'POP3 does not support folders',
      'UNSUPPORTED_OPERATION',
      'pop3',
    );
  }

  async createFolder(_name: string): Promise<void> {
    throw new EmailError(
      'POP3 does not support folders',
      'UNSUPPORTED_OPERATION',
      'pop3',
    );
  }

  async deleteFolder(_name: string): Promise<void> {
    throw new EmailError(
      'POP3 does not support folders',
      'UNSUPPORTED_OPERATION',
      'pop3',
    );
  }

  async markRead(_messageId: string | string[]): Promise<void> {
    throw new EmailError(
      'POP3 does not support marking messages as read',
      'UNSUPPORTED_OPERATION',
      'pop3',
    );
  }

  async markUnread(_messageId: string | string[]): Promise<void> {
    throw new EmailError(
      'POP3 does not support marking messages as unread',
      'UNSUPPORTED_OPERATION',
      'pop3',
    );
  }

  async move(_messageId: string | string[], _folder: string): Promise<void> {
    throw new EmailError(
      'POP3 does not support moving messages',
      'UNSUPPORTED_OPERATION',
      'pop3',
    );
  }

  async copy(_messageId: string | string[], _folder: string): Promise<void> {
    throw new EmailError(
      'POP3 does not support copying messages',
      'UNSUPPORTED_OPERATION',
      'pop3',
    );
  }

  async search(_criteria: SearchCriteria): Promise<EmailMessage[]> {
    throw new EmailError(
      'POP3 does not support server-side search. Use fetch() with filters instead.',
      'UNSUPPORTED_OPERATION',
      'pop3',
    );
  }

  // ========================================================================
  // Adapter info
  // ========================================================================

  async getCapabilities(): Promise<MailboxCapabilities> {
    return {
      send: false,
      receive: true,
      folders: false,
      search: false,
      markRead: false,
      move: false,
      delete: true,
      threads: false,
      oauth: false,
      encryption: false,
    };
  }

  getAdapter(): AdapterType {
    return 'pop3';
  }

  // ========================================================================
  // Private helper methods
  // ========================================================================

  private ensureConnected(): void {
    if (!this.connected || !this.client) {
      throw new ConnectionError(
        'Not connected to POP3 server. Call connect() first.',
        'pop3',
      );
    }
  }

  private async fetchMessage(msgNum: string): Promise<EmailMessage> {
    try {
      // Retrieve full message
      const response = await this.client?.RETR(msgNum);
      const messageData = response[0];

      // Parse message
      const parsed = await simpleParser(messageData);

      // Get UID
      const uid = this.messageCache.get(msgNum);

      return {
        id: uid || msgNum,
        messageId: parsed.messageId || uid || msgNum,
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
        headers: parsed.headers as unknown as Record<string, string | string[]>,
        size: messageData.length,
        raw: messageData,
      };
    } catch (error) {
      throw this.mapPOP3Error(error);
    }
  }

  private async deleteMessageByNum(msgNum: string): Promise<void> {
    try {
      await this.client?.command(`DELE ${msgNum}`);
      this.messageCache.delete(msgNum);
      this.debug(`Deleted message ${msgNum}`);
    } catch (error) {
      throw this.mapPOP3Error(error);
    }
  }

  private parseUidlResponse(
    response: string,
  ): Array<{ msgNum: string; uid: string }> {
    const lines = response.split('\n');
    const result: Array<{ msgNum: string; uid: string }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '.' || trimmed.startsWith('+OK')) {
        continue;
      }

      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        result.push({
          msgNum: parts[0],
          uid: parts[1],
        });
      }
    }

    return result;
  }

  private shouldIncludeMessage(
    message: EmailMessage,
    options?: FetchOptions,
  ): boolean {
    // Date filters
    if (options?.since && message.date) {
      if (message.date < options.since) {
        return false;
      }
    }

    if (options?.before && message.date) {
      if (message.date >= options.before) {
        return false;
      }
    }

    // Note: POP3 doesn't support unreadOnly filter since it can't track read status

    return true;
  }

  private mapPOP3Error(error: unknown): EmailError {
    if (error instanceof EmailError) {
      return error;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      const errorObj = error as Record<string, unknown>;

      // Timeout errors
      if (
        message.includes('timeout') ||
        errorObj.eventName === 'timeout' ||
        errorObj.code === 'ETIMEDOUT'
      ) {
        return new TimeoutError(error.message, 'pop3', error);
      }

      // Connection errors
      if (
        message.includes('connect') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('ehostunreach') ||
        errorObj.eventName === 'error' ||
        errorObj.eventName === 'close' ||
        errorObj.code === 'ECONNREFUSED' ||
        errorObj.code === 'ENOTFOUND'
      ) {
        return new ConnectionError(error.message, 'pop3', error);
      }

      // Authentication errors
      if (
        message.includes('auth') ||
        message.includes('login') ||
        message.includes('password') ||
        message.includes('user') ||
        message.includes('-err')
      ) {
        return new AuthenticationError(error.message, 'pop3', error);
      }

      return new EmailError(error.message, 'POP3_ERROR', 'pop3', error);
    }

    return new EmailError(String(error), 'POP3_ERROR', 'pop3');
  }
}
