/**
 * Tests for database synchronization
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@happyvertical/sql';
import { BaseMailbox } from '../../src/shared/base';
import { initializeSchema } from '../../src/shared/schema';
import type {
  AdapterType,
  EmailMessage,
  FetchOptions,
  Folder,
  FolderInfo,
  MailboxCapabilities,
  MailboxConfig,
  SearchCriteria,
  SendOptions,
  SendResult,
  SyncOptions,
  SyncResult,
} from '../../src/shared/types';

// Test implementation of BaseMailbox
class TestMailbox extends BaseMailbox {
  private messages: EmailMessage[] = [];

  constructor(config: MailboxConfig) {
    super(config);
  }

  setMessages(messages: EmailMessage[]): void {
    this.messages = messages;
  }

  async send(
    _message: EmailMessage,
    _options?: SendOptions,
  ): Promise<SendResult> {
    throw new Error('Not implemented');
  }

  async fetch(options?: FetchOptions): Promise<EmailMessage[]> {
    let result = this.messages;

    if (options?.folder) {
      result = result.filter((m) => m.folder === options.folder);
    }

    if (options?.since) {
      result = result.filter((m) => m.date && m.date >= options.since!);
    }

    if (options?.before) {
      result = result.filter((m) => m.date && m.date < options.before!);
    }

    if (options?.unreadOnly) {
      result = result.filter((m) => !m.flags?.includes('\\Seen'));
    }

    if (options?.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  async getMessage(_messageId: string): Promise<EmailMessage> {
    throw new Error('Not implemented');
  }

  async listFolders(): Promise<Folder[]> {
    throw new Error('Not implemented');
  }

  async selectFolder(_name: string): Promise<FolderInfo> {
    throw new Error('Not implemented');
  }

  async createFolder(_name: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async deleteFolder(_name: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async markRead(_messageId: string | string[]): Promise<void> {
    throw new Error('Not implemented');
  }

  async markUnread(_messageId: string | string[]): Promise<void> {
    throw new Error('Not implemented');
  }

  async move(_messageId: string | string[], _folder: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async copy(_messageId: string | string[], _folder: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async delete(_messageId: string | string[]): Promise<void> {
    throw new Error('Not implemented');
  }

  async search(_criteria: SearchCriteria): Promise<EmailMessage[]> {
    throw new Error('Not implemented');
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async getCapabilities(): Promise<MailboxCapabilities> {
    return {
      canSend: false,
      canReceive: true,
      canSearch: true,
      canManageFolders: true,
      supportsOAuth: false,
      supportsIdle: false,
    };
  }

  getAdapter(): AdapterType {
    return 'test' as AdapterType;
  }
}

// Mock database
const createMockDatabase = (): Database => {
  const storage = new Map<string, any[]>();

  return {
    execute: vi.fn(async (sql: string) => {
      // Simple schema tracking
      if (sql.includes('CREATE TABLE')) {
        const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
        if (match) {
          const tableName = match[1];
          if (!storage.has(tableName)) {
            storage.set(tableName, []);
          }
        }
      }
    }),
    insert: vi.fn(async (table: string, data: any) => {
      const rows = storage.get(table) || [];
      rows.push({ ...data });
      storage.set(table, rows);
      return data.id;
    }),
    select: vi.fn(async (table: string, options?: any) => {
      const rows = storage.get(table) || [];
      if (!options?.where) {
        return rows;
      }

      return rows.filter((row) => {
        for (const [key, value] of Object.entries(options.where)) {
          if (row[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }),
    selectOne: vi.fn(async (table: string, options?: any) => {
      const rows = storage.get(table) || [];
      if (!options?.where) {
        return rows[0] || null;
      }

      return (
        rows.find((row) => {
          for (const [key, value] of Object.entries(options.where)) {
            if (row[key] !== value) {
              return false;
            }
          }
          return true;
        }) || null
      );
    }),
    update: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    transaction: vi.fn(async (callback: any) => {
      return await callback({
        execute: vi.fn(),
        insert: vi.fn(),
        select: vi.fn(),
        selectOne: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        query: vi.fn(),
      });
    }),
    close: vi.fn(async () => {}),
    getType: vi.fn(() => 'sqlite' as const),
    clear: () => storage.clear(),
    getStorage: () => storage,
  } as unknown as Database;
};

describe('Database Synchronization', () => {
  let db: ReturnType<typeof createMockDatabase>;
  let mailbox: TestMailbox;

  beforeEach(async () => {
    db = createMockDatabase();
    await initializeSchema(db);

    mailbox = new TestMailbox({
      type: 'test',
      db,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    db.clear();
  });

  describe('Schema Initialization', () => {
    it('should create all required tables', async () => {
      const storage = db.getStorage();

      expect(storage.has('email_accounts')).toBe(true);
      expect(storage.has('email_folders')).toBe(true);
      expect(storage.has('email_messages')).toBe(true);
      expect(storage.has('email_attachments')).toBe(true);
    });

    it('should execute all schema statements', async () => {
      expect(db.execute).toHaveBeenCalled();
      const calls = (db.execute as any).mock.calls;

      // Check for table creation
      const tableCreations = calls.filter((call: any[]) =>
        call[0].includes('CREATE TABLE'),
      );
      expect(tableCreations.length).toBeGreaterThanOrEqual(4);

      // Check for index creation
      const indexCreations = calls.filter((call: any[]) =>
        call[0].includes('CREATE INDEX'),
      );
      expect(indexCreations.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('saveMessage', () => {
    it('should save a simple message', async () => {
      const message: EmailMessage = {
        id: 'msg-1',
        messageId: 'message-id-1',
        from: { address: 'sender@example.com', name: 'Sender' },
        to: [{ address: 'recipient@example.com', name: 'Recipient' }],
        subject: 'Test message',
        text: 'Hello, world!',
        date: new Date('2024-01-01T12:00:00Z'),
        folder: 'INBOX',
      };

      mailbox.setMessages([message]);
      await mailbox.sync({ folders: ['INBOX'] });

      const saved = await db.selectOne('email_messages', {
        where: { message_id: 'message-id-1' },
      });

      expect(saved).toBeTruthy();
      expect(saved.from_address).toBe('sender@example.com');
      expect(saved.from_name).toBe('Sender');
      expect(saved.subject).toBe('Test message');
      expect(saved.text_body).toBe('Hello, world!');
    });

    it('should save message with HTML body', async () => {
      const message: EmailMessage = {
        id: 'msg-2',
        messageId: 'message-id-2',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'HTML message',
        html: '<p>Hello, world!</p>',
        date: new Date('2024-01-01T12:00:00Z'),
        folder: 'INBOX',
      };

      mailbox.setMessages([message]);
      await mailbox.sync({ folders: ['INBOX'] });

      const saved = await db.selectOne('email_messages', {
        where: { message_id: 'message-id-2' },
      });

      expect(saved).toBeTruthy();
      expect(saved.html_body).toBe('<p>Hello, world!</p>');
    });

    it('should save message with CC and BCC recipients', async () => {
      const message: EmailMessage = {
        id: 'msg-3',
        messageId: 'message-id-3',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        cc: [
          { address: 'cc1@example.com' },
          { address: 'cc2@example.com', name: 'CC2' },
        ],
        bcc: [{ address: 'bcc@example.com' }],
        subject: 'Multi-recipient message',
        text: 'Test',
        date: new Date('2024-01-01T12:00:00Z'),
        folder: 'INBOX',
      };

      mailbox.setMessages([message]);
      await mailbox.sync({ folders: ['INBOX'] });

      const saved = await db.selectOne('email_messages', {
        where: { message_id: 'message-id-3' },
      });

      expect(saved).toBeTruthy();
      expect(JSON.parse(saved.cc_addresses)).toEqual([
        { address: 'cc1@example.com' },
        { address: 'cc2@example.com', name: 'CC2' },
      ]);
      expect(JSON.parse(saved.bcc_addresses)).toEqual([
        { address: 'bcc@example.com' },
      ]);
    });

    it('should save message flags correctly', async () => {
      const message: EmailMessage = {
        id: 'msg-4',
        messageId: 'message-id-4',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Flagged message',
        text: 'Test',
        date: new Date('2024-01-01T12:00:00Z'),
        folder: 'INBOX',
        flags: ['\\Seen', '\\Flagged', '\\Answered'],
      };

      mailbox.setMessages([message]);
      await mailbox.sync({ folders: ['INBOX'] });

      const saved = await db.selectOne('email_messages', {
        where: { message_id: 'message-id-4' },
      });

      expect(saved).toBeTruthy();
      expect(JSON.parse(saved.flags)).toEqual([
        '\\Seen',
        '\\Flagged',
        '\\Answered',
      ]);
      expect(saved.is_read).toBe(1);
      expect(saved.is_flagged).toBe(1);
      expect(saved.is_answered).toBe(1);
    });

    it('should save message with attachments', async () => {
      const message: EmailMessage = {
        id: 'msg-5',
        messageId: 'message-id-5',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Message with attachments',
        text: 'See attached',
        date: new Date('2024-01-01T12:00:00Z'),
        folder: 'INBOX',
        attachments: [
          {
            filename: 'document.pdf',
            contentType: 'application/pdf',
            size: 1024,
            content: Buffer.from('fake pdf content'),
          },
          {
            filename: 'image.png',
            contentType: 'image/png',
            size: 2048,
            content: Buffer.from('fake image content'),
            contentId: 'img-123',
            contentDisposition: 'inline',
          },
        ],
      };

      mailbox.setMessages([message]);
      await mailbox.sync({ folders: ['INBOX'] });

      const saved = await db.selectOne('email_messages', {
        where: { message_id: 'message-id-5' },
      });
      expect(saved).toBeTruthy();
      expect(saved.has_attachments).toBe(1);

      const attachments = await db.select('email_attachments', {
        where: { message_id: saved.id },
      });
      expect(attachments).toHaveLength(2);

      expect(attachments[0].filename).toBe('document.pdf');
      expect(attachments[0].content_type).toBe('application/pdf');
      expect(attachments[0].size).toBe(1024);

      expect(attachments[1].filename).toBe('image.png');
      expect(attachments[1].content_id).toBe('img-123');
      expect(attachments[1].content_disposition).toBe('inline');
    });

    it('should save message with reply-to', async () => {
      const message: EmailMessage = {
        id: 'msg-6',
        messageId: 'message-id-6',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        replyTo: { address: 'reply@example.com', name: 'Reply Handler' },
        subject: 'Message with reply-to',
        text: 'Test',
        date: new Date('2024-01-01T12:00:00Z'),
        folder: 'INBOX',
      };

      mailbox.setMessages([message]);
      await mailbox.sync({ folders: ['INBOX'] });

      const saved = await db.selectOne('email_messages', {
        where: { message_id: 'message-id-6' },
      });

      expect(saved).toBeTruthy();
      expect(saved.reply_to_address).toBe('reply@example.com');
      expect(saved.reply_to_name).toBe('Reply Handler');
    });

    it('should save message with thread information', async () => {
      const message: EmailMessage = {
        id: 'msg-7',
        messageId: 'message-id-7',
        threadId: 'thread-123',
        inReplyTo: 'message-id-0',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Re: Original message',
        text: 'Reply',
        date: new Date('2024-01-01T12:00:00Z'),
        folder: 'INBOX',
      };

      mailbox.setMessages([message]);
      await mailbox.sync({ folders: ['INBOX'] });

      const saved = await db.selectOne('email_messages', {
        where: { message_id: 'message-id-7' },
      });

      expect(saved).toBeTruthy();
      expect(saved.thread_id).toBe('thread-123');
      expect(saved.in_reply_to).toBe('message-id-0');
    });
  });

  describe('loadMessage', () => {
    it('should load a simple message', async () => {
      const message: EmailMessage = {
        id: 'msg-1',
        messageId: 'message-id-1',
        from: { address: 'sender@example.com', name: 'Sender' },
        to: [{ address: 'recipient@example.com', name: 'Recipient' }],
        subject: 'Test message',
        text: 'Hello, world!',
        date: new Date('2024-01-01T12:00:00Z'),
        folder: 'INBOX',
      };

      mailbox.setMessages([message]);
      await mailbox.sync({ folders: ['INBOX'] });

      const loaded = await (mailbox as any).loadMessage('message-id-1');

      expect(loaded).toBeTruthy();
      expect(loaded.messageId).toBe('message-id-1');
      expect(loaded.from.address).toBe('sender@example.com');
      expect(loaded.from.name).toBe('Sender');
      expect(loaded.subject).toBe('Test message');
      expect(loaded.text).toBe('Hello, world!');
      expect(loaded.to).toEqual([
        { address: 'recipient@example.com', name: 'Recipient' },
      ]);
    });

    it('should load message with attachments', async () => {
      const message: EmailMessage = {
        id: 'msg-1',
        messageId: 'message-id-1',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Message with attachments',
        text: 'See attached',
        date: new Date('2024-01-01T12:00:00Z'),
        folder: 'INBOX',
        attachments: [
          {
            filename: 'document.pdf',
            contentType: 'application/pdf',
            size: 1024,
            content: Buffer.from('fake pdf content'),
          },
        ],
      };

      mailbox.setMessages([message]);
      await mailbox.sync({ folders: ['INBOX'] });

      const loaded = await (mailbox as any).loadMessage('message-id-1');

      expect(loaded.attachments).toHaveLength(1);
      expect(loaded.attachments[0].filename).toBe('document.pdf');
      expect(loaded.attachments[0].contentType).toBe('application/pdf');
      expect(loaded.attachments[0].size).toBe(1024);
    });

    it('should throw MessageNotFoundError for missing message', async () => {
      await expect(
        (mailbox as any).loadMessage('nonexistent'),
      ).rejects.toThrow('Message not found');
    });
  });

  describe('sync', () => {
    it('should sync messages from single folder', async () => {
      const messages: EmailMessage[] = [
        {
          id: 'msg-1',
          messageId: 'message-id-1',
          from: { address: 'sender@example.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Message 1',
          text: 'Text 1',
          date: new Date('2024-01-01T12:00:00Z'),
          folder: 'INBOX',
        },
        {
          id: 'msg-2',
          messageId: 'message-id-2',
          from: { address: 'sender@example.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Message 2',
          text: 'Text 2',
          date: new Date('2024-01-01T13:00:00Z'),
          folder: 'INBOX',
        },
      ];

      mailbox.setMessages(messages);

      const result: SyncResult = await mailbox.sync({ folders: ['INBOX'] });

      expect(result.messagesProcessed).toBe(2);
      expect(result.messagesDownloaded).toBe(2);
      expect(result.messagesSkipped).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.folders).toEqual(['INBOX']);

      const saved = await db.select('email_messages', {});
      expect(saved).toHaveLength(2);
    });

    it('should sync messages from multiple folders', async () => {
      const messages: EmailMessage[] = [
        {
          id: 'msg-1',
          messageId: 'message-id-1',
          from: { address: 'sender@example.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Inbox message',
          text: 'In inbox',
          date: new Date('2024-01-01T12:00:00Z'),
          folder: 'INBOX',
        },
        {
          id: 'msg-2',
          messageId: 'message-id-2',
          from: { address: 'sender@example.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Sent message',
          text: 'In sent',
          date: new Date('2024-01-01T13:00:00Z'),
          folder: 'Sent',
        },
      ];

      mailbox.setMessages(messages);

      const result: SyncResult = await mailbox.sync({
        folders: ['INBOX', 'Sent'],
      });

      expect(result.messagesProcessed).toBe(2);
      expect(result.messagesDownloaded).toBe(2);
      expect(result.folders).toEqual(['INBOX', 'Sent']);

      const saved = await db.select('email_messages', {});
      expect(saved).toHaveLength(2);
    });

    it('should call progress callback', async () => {
      const messages: EmailMessage[] = [
        {
          id: 'msg-1',
          messageId: 'message-id-1',
          from: { address: 'sender@example.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Message 1',
          text: 'Text 1',
          date: new Date('2024-01-01T12:00:00Z'),
          folder: 'INBOX',
        },
        {
          id: 'msg-2',
          messageId: 'message-id-2',
          from: { address: 'sender@example.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Message 2',
          text: 'Text 2',
          date: new Date('2024-01-01T13:00:00Z'),
          folder: 'INBOX',
        },
      ];

      mailbox.setMessages(messages);

      const progressCallback = vi.fn();
      const options: SyncOptions = {
        folders: ['INBOX'],
        onProgress: progressCallback,
      };

      await mailbox.sync(options);

      expect(progressCallback).toHaveBeenCalledTimes(2);
      expect(progressCallback).toHaveBeenCalledWith({
        folder: 'INBOX',
        processed: 1,
        total: 2,
        downloaded: 1,
        skipped: 0,
        errors: 0,
      });
      expect(progressCallback).toHaveBeenCalledWith({
        folder: 'INBOX',
        processed: 2,
        total: 2,
        downloaded: 2,
        skipped: 0,
        errors: 0,
      });
    });

    it('should filter by date range', async () => {
      const messages: EmailMessage[] = [
        {
          id: 'msg-1',
          messageId: 'message-id-1',
          from: { address: 'sender@example.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Old message',
          text: 'Text',
          date: new Date('2024-01-01T12:00:00Z'),
          folder: 'INBOX',
        },
        {
          id: 'msg-2',
          messageId: 'message-id-2',
          from: { address: 'sender@example.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Recent message',
          text: 'Text',
          date: new Date('2024-01-15T12:00:00Z'),
          folder: 'INBOX',
        },
      ];

      mailbox.setMessages(messages);

      const result: SyncResult = await mailbox.sync({
        folders: ['INBOX'],
        since: new Date('2024-01-10T00:00:00Z'),
      });

      expect(result.messagesProcessed).toBe(1);
      expect(result.messagesDownloaded).toBe(1);

      const saved = await db.select('email_messages', {});
      expect(saved).toHaveLength(1);
      expect(saved[0].subject).toBe('Recent message');
    });

    it('should handle errors during sync', async () => {
      const messages: EmailMessage[] = [
        {
          id: 'msg-1',
          messageId: 'message-id-1',
          from: { address: 'sender@example.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Good message',
          text: 'Text',
          date: new Date('2024-01-01T12:00:00Z'),
          folder: 'INBOX',
        },
      ];

      mailbox.setMessages(messages);

      // Mock database insert to fail once
      let insertCallCount = 0;
      const originalInsert = db.insert;
      db.insert = vi.fn(async (table: string, data: any) => {
        insertCallCount++;
        if (insertCallCount === 1) {
          throw new Error('Database error');
        }
        return originalInsert(table, data);
      });

      const errorCallback = vi.fn();
      const options: SyncOptions = {
        folders: ['INBOX'],
        onError: errorCallback,
      };

      const result: SyncResult = await mailbox.sync(options);

      expect(result.messagesProcessed).toBe(1);
      expect(result.messagesSkipped).toBe(1);
      expect(result.messagesDownloaded).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(errorCallback).toHaveBeenCalledTimes(1);
    });

    it('should throw error if database not configured', async () => {
      const mailboxNoDB = new TestMailbox({ type: 'test' });

      await expect(mailboxNoDB.sync()).rejects.toThrow(
        'Database not configured for sync',
      );
    });

    it('should return sync duration', async () => {
      const messages: EmailMessage[] = [
        {
          id: 'msg-1',
          messageId: 'message-id-1',
          from: { address: 'sender@example.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Message',
          text: 'Text',
          date: new Date('2024-01-01T12:00:00Z'),
          folder: 'INBOX',
        },
      ];

      mailbox.setMessages(messages);

      const result: SyncResult = await mailbox.sync({ folders: ['INBOX'] });

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe('number');
    });
  });
});
