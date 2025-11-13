/**
 * IMAP adapter implementation using ImapFlow
 */

import type { ImapFlowOptions } from 'imapflow';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { BaseMailbox } from '../shared/base';
import {
  AuthenticationError,
  ConnectionError,
  EmailError,
  FolderExistsError,
  FolderNotFoundError,
  MessageNotFoundError,
  TimeoutError,
} from '../shared/errors';
import type {
  AdapterType,
  EmailMessage,
  FetchOptions,
  Folder,
  FolderInfo,
  IMAPOptions,
  MailboxCapabilities,
  SearchCriteria,
  SendOptions,
  SendResult,
} from '../shared/types';

/**
 * IMAP adapter for receiving email via IMAP protocol
 *
 * Uses ImapFlow for robust IMAP operations including:
 * - Fetch messages with various filters
 * - Folder management (list, create, delete, rename)
 * - Message operations (mark read, move, copy, delete)
 * - Search functionality
 * - OAuth2 authentication
 * - IDLE push notifications (optional)
 */
export class IMAPAdapter extends BaseMailbox {
  private client: ImapFlow | null = null;
  private options: IMAPOptions;

  constructor(options: IMAPOptions) {
    super({
      type: 'imap',
      debug: options.debug,
      db: options.db,
      logger: options.logger,
    });

    this.options = options;
  }

  /**
   * Create ImapFlow client
   */
  private createClient(): ImapFlow {
    const config: ImapFlowOptions = {
      host: this.options.host,
      port: this.options.port,
      secure: this.options.secure ?? true,
      auth: this.options.auth,
      tls: this.options.tls,
      logger: this.options.debug
        ? {
            debug: (msg: string) => this.debug(msg),
            info: (msg: string) => this.debug(msg),
            warn: (msg: string) => this.debug(`WARN: ${msg}`),
            error: (msg: string) => this.debug(`ERROR: ${msg}`),
          }
        : false,
    };

    return new ImapFlow(config);
  }

  getAdapter(): AdapterType {
    return 'imap';
  }

  /**
   * Connect to IMAP server
   */
  async connect(): Promise<void> {
    try {
      this.debug('Connecting to IMAP server', { host: this.options.host });
      this.client = this.createClient();
      await this.client.connect();
      this.connected = true;
      this.debug('IMAP connection established');
    } catch (error) {
      this.connected = false;
      throw this.mapIMAPError(error);
    }
  }

  /**
   * Disconnect from IMAP server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.logout();
      this.client = null;
      this.connected = false;
      this.currentFolder = null;
      this.debug('IMAP connection closed');
    }
  }

  /**
   * Fetch messages with filters
   */
  async fetch(options?: FetchOptions): Promise<EmailMessage[]> {
    this.ensureConnected();

    const folder = options?.folder || 'INBOX';
    await this.selectFolder(folder);

    try {
      // Build IMAP search criteria
      const searchQuery = this.buildSearchQuery(options);

      this.debug('Fetching messages', { folder, query: searchQuery });

      // Search for message UIDs
      const uids = await this.client!.search(searchQuery, {
        uid: true,
      });

      // Apply limit/offset
      let targetUids = uids;
      if (options?.offset || options?.limit) {
        const start = options.offset || 0;
        const end = options.limit ? start + options.limit : undefined;
        targetUids = uids.slice(start, end);
      }

      if (targetUids.length === 0) {
        return [];
      }

      // Fetch message data
      const messages: EmailMessage[] = [];
      for await (const msg of this.client!.fetch(targetUids, {
        source: true,
        flags: true,
        uid: true,
        envelope: true,
        bodyStructure: true,
      })) {
        try {
          const parsed = await simpleParser(msg.source);
          const email = this.parseMessage(parsed, msg);
          messages.push(email);

          // Mark as seen if requested
          if (options?.markSeen) {
            await this.client!.messageFlagsAdd(msg.uid, ['\\Seen'], {
              uid: true,
            });
          }
        } catch (parseError) {
          this.debug('Failed to parse message', { uid: msg.uid, parseError });
        }
      }

      return messages;
    } catch (error) {
      throw this.mapIMAPError(error);
    }
  }

  /**
   * Get a specific message by ID
   */
  async getMessage(messageId: string): Promise<EmailMessage> {
    this.ensureConnected();

    try {
      // Search for message by Message-ID header
      const uids = await this.client!.search({
        header: ['message-id', messageId],
      });

      if (uids.length === 0) {
        throw new MessageNotFoundError(messageId, 'imap');
      }

      // Fetch the message
      const messages: EmailMessage[] = [];
      for await (const msg of this.client!.fetch(uids[0], {
        source: true,
        flags: true,
        uid: true,
      })) {
        const parsed = await simpleParser(msg.source);
        messages.push(this.parseMessage(parsed, msg));
      }

      if (messages.length === 0) {
        throw new MessageNotFoundError(messageId, 'imap');
      }

      return messages[0];
    } catch (error) {
      if (error instanceof EmailError) {
        throw error;
      }
      throw this.mapIMAPError(error);
    }
  }

  /**
   * List all folders
   */
  async listFolders(): Promise<Folder[]> {
    this.ensureConnected();

    try {
      const list = await this.client?.list();

      return list.map((folder) => ({
        name: folder.name,
        path: folder.path,
        delimiter: folder.delimiter,
        specialUse: folder.specialUse as Folder['specialUse'],
        subscribed: folder.subscribed,
      }));
    } catch (error) {
      throw this.mapIMAPError(error);
    }
  }

  /**
   * Select a folder
   */
  async selectFolder(name: string): Promise<FolderInfo> {
    this.ensureConnected();

    try {
      const mailbox = await this.client?.mailboxOpen(name);
      this.currentFolder = name;

      return {
        name,
        exists: mailbox.exists,
        recent: 0, // ImapFlow doesn't provide this
        unseen: 0, // Would need separate STATUS command
        uidValidity: mailbox.uidValidity,
        uidNext: mailbox.uidNext,
        flags: mailbox.flags,
        permanentFlags: mailbox.permanentFlags,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('does not exist')
      ) {
        throw new FolderNotFoundError(name, 'imap');
      }
      throw this.mapIMAPError(error);
    }
  }

  /**
   * Create a new folder
   */
  async createFolder(name: string): Promise<void> {
    this.ensureConnected();

    try {
      await this.client?.mailboxCreate(name);
      this.debug('Folder created', { name });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('already exists')
      ) {
        throw new FolderExistsError(name, 'imap');
      }
      throw this.mapIMAPError(error);
    }
  }

  /**
   * Delete a folder
   */
  async deleteFolder(name: string): Promise<void> {
    this.ensureConnected();

    try {
      await this.client?.mailboxDelete(name);
      this.debug('Folder deleted', { name });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes('does not exist')
      ) {
        throw new FolderNotFoundError(name, 'imap');
      }
      throw this.mapIMAPError(error);
    }
  }

  /**
   * Mark message(s) as read
   */
  async markRead(messageId: string | string[]): Promise<void> {
    this.ensureConnected();

    const ids = Array.isArray(messageId) ? messageId : [messageId];

    try {
      for (const id of ids) {
        const uids = await this.client?.search({
          header: ['message-id', id],
        });
        if (uids.length > 0) {
          await this.client?.messageFlagsAdd(uids[0], ['\\Seen'], {
            uid: true,
          });
        }
      }
    } catch (error) {
      throw this.mapIMAPError(error);
    }
  }

  /**
   * Mark message(s) as unread
   */
  async markUnread(messageId: string | string[]): Promise<void> {
    this.ensureConnected();

    const ids = Array.isArray(messageId) ? messageId : [messageId];

    try {
      for (const id of ids) {
        const uids = await this.client?.search({
          header: ['message-id', id],
        });
        if (uids.length > 0) {
          await this.client?.messageFlagsRemove(uids[0], ['\\Seen'], {
            uid: true,
          });
        }
      }
    } catch (error) {
      throw this.mapIMAPError(error);
    }
  }

  /**
   * Move message(s) to another folder
   */
  async move(messageId: string | string[], folder: string): Promise<void> {
    this.ensureConnected();

    const ids = Array.isArray(messageId) ? messageId : [messageId];

    try {
      for (const id of ids) {
        const uids = await this.client?.search({
          header: ['message-id', id],
        });
        if (uids.length > 0) {
          await this.client?.messageMove(uids[0], folder, { uid: true });
        }
      }
    } catch (error) {
      throw this.mapIMAPError(error);
    }
  }

  /**
   * Copy message(s) to another folder
   */
  async copy(messageId: string | string[], folder: string): Promise<void> {
    this.ensureConnected();

    const ids = Array.isArray(messageId) ? messageId : [messageId];

    try {
      for (const id of ids) {
        const uids = await this.client?.search({
          header: ['message-id', id],
        });
        if (uids.length > 0) {
          await this.client?.messageCopy(uids[0], folder, { uid: true });
        }
      }
    } catch (error) {
      throw this.mapIMAPError(error);
    }
  }

  /**
   * Delete message(s)
   */
  async delete(messageId: string | string[]): Promise<void> {
    this.ensureConnected();

    const ids = Array.isArray(messageId) ? messageId : [messageId];

    try {
      for (const id of ids) {
        const uids = await this.client?.search({
          header: ['message-id', id],
        });
        if (uids.length > 0) {
          await this.client?.messageFlagsAdd(uids[0], ['\\Deleted'], {
            uid: true,
          });
        }
      }
      // Expunge to permanently delete
      await this.client?.expunge();
    } catch (error) {
      throw this.mapIMAPError(error);
    }
  }

  /**
   * Search messages
   */
  async search(criteria: SearchCriteria): Promise<EmailMessage[]> {
    this.ensureConnected();

    try {
      const query = this.buildSearchCriteria(criteria);
      const uids = await this.client!.search(query, { uid: true });

      if (uids.length === 0) {
        return [];
      }

      // Fetch matching messages
      const messages: EmailMessage[] = [];
      for await (const msg of this.client!.fetch(uids, {
        source: true,
        flags: true,
        uid: true,
      })) {
        const parsed = await simpleParser(msg.source);
        messages.push(this.parseMessage(parsed, msg));
      }

      return messages;
    } catch (error) {
      throw this.mapIMAPError(error);
    }
  }

  /**
   * Get adapter capabilities
   */
  async getCapabilities(): Promise<MailboxCapabilities> {
    return {
      send: false, // IMAP is receive-only
      receive: true,
      folders: true,
      search: true,
      markRead: true,
      move: true,
      delete: true,
      threads: false, // Thread support not implemented yet
      oauth: this.isOAuth2(),
      encryption: false,
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
  // Unsupported operations (IMAP is receive-only)
  // ========================================================================

  async send(
    _message: EmailMessage,
    _options?: SendOptions,
  ): Promise<SendResult> {
    throw new EmailError(
      'IMAP does not support sending messages. Use SMTP adapter.',
      'UNSUPPORTED_OPERATION',
      'imap',
    );
  }

  // ========================================================================
  // Helper methods
  // ========================================================================

  /**
   * Ensure client is connected
   */
  private ensureConnected(): void {
    if (!this.client || !this.connected) {
      throw new ConnectionError(
        'Not connected to IMAP server. Call connect() first.',
        'imap',
      );
    }
  }

  /**
   * Build IMAP search query from FetchOptions
   */
  private buildSearchQuery(options?: FetchOptions): Record<string, unknown> {
    const query: Record<string, unknown> = {};

    if (options?.unreadOnly) {
      query.unseen = true;
    }

    if (options?.since) {
      query.since = options.since;
    }

    if (options?.before) {
      query.before = options.before;
    }

    // If no criteria, return all messages
    if (Object.keys(query).length === 0) {
      query.all = true;
    }

    return query;
  }

  /**
   * Build IMAP search criteria from SearchCriteria
   */
  private buildSearchCriteria(
    criteria: SearchCriteria,
  ): Record<string, unknown> {
    const query: Record<string, unknown> = {};

    if (criteria.from) {
      query.from = criteria.from;
    }

    if (criteria.to) {
      query.to = criteria.to;
    }

    if (criteria.subject) {
      query.subject = criteria.subject;
    }

    if (criteria.body) {
      query.body = criteria.body;
    }

    if (criteria.since) {
      query.since = criteria.since;
    }

    if (criteria.before) {
      query.before = criteria.before;
    }

    if (criteria.unread) {
      query.unseen = true;
    }

    if (criteria.flagged) {
      query.flagged = true;
    }

    if (criteria.answered) {
      query.answered = true;
    }

    if (criteria.draft) {
      query.draft = true;
    }

    if (criteria.deleted) {
      query.deleted = true;
    }

    if (criteria.larger) {
      query.larger = criteria.larger;
    }

    if (criteria.smaller) {
      query.smaller = criteria.smaller;
    }

    if (criteria.header) {
      query.header = Object.entries(criteria.header).map(([key, value]) => [
        key,
        value,
      ]);
    }

    // If no criteria, return all messages
    if (Object.keys(query).length === 0) {
      query.all = true;
    }

    return query;
  }

  /**
   * Parse mailparser output to EmailMessage
   */
  private parseMessage(
    parsed: Awaited<ReturnType<typeof simpleParser>>,
    msg: { uid: number; flags: Set<string> },
  ): EmailMessage {
    return {
      id: String(msg.uid),
      messageId: parsed.messageId || undefined,
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
      html: parsed.html ? String(parsed.html) : undefined,
      attachments: parsed.attachments?.map((att) => ({
        filename: att.filename,
        contentType: att.contentType,
        size: att.size,
        content: att.content,
        contentId: att.contentId,
        contentDisposition: att.contentDisposition as 'attachment' | 'inline',
      })),
      flags: Array.from(msg.flags) as EmailMessage['flags'],
      inReplyTo: parsed.inReplyTo,
      references: parsed.references,
      headers: parsed.headers
        ? Object.fromEntries(
            Array.from(parsed.headers.entries()).map(([key, value]) => [
              key,
              Array.isArray(value) ? value : String(value),
            ]),
          )
        : undefined,
    };
  }

  /**
   * Map ImapFlow errors to standard error types
   */
  private mapIMAPError(error: unknown): EmailError {
    if (error instanceof EmailError) {
      return error;
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      // Authentication errors
      if (
        message.includes('authentication') ||
        message.includes('auth') ||
        message.includes('login') ||
        message.includes('invalid credentials')
      ) {
        return new AuthenticationError(error.message, 'imap', error);
      }

      // Timeout errors
      if (message.includes('timeout') || message.includes('etimedout')) {
        return new TimeoutError(error.message, 'imap', error);
      }

      // Connection errors
      if (
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('connection') ||
        message.includes('ehostunreach') ||
        message.includes('network')
      ) {
        return new ConnectionError(error.message, 'imap', error);
      }

      return new EmailError(error.message, 'IMAP_ERROR', 'imap', error);
    }

    return new EmailError(String(error), 'UNKNOWN_ERROR', 'imap');
  }
}
