import { beforeEach, describe, expect, it } from 'vitest';
import { BaseMailbox } from '../../src/shared/base';
import { EmailError, InvalidMessageError } from '../../src/shared/errors';
import type {
  AdapterType,
  EmailAddress,
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
  getAdapter(): AdapterType {
    return 'smtp';
  }

  async send(
    _message: EmailMessage,
    _options?: SendOptions,
  ): Promise<SendResult> {
    return {
      messageId: 'test-id',
      accepted: ['recipient@example.com'],
      rejected: [],
      response: 'OK',
    };
  }

  async fetch(_options?: FetchOptions): Promise<EmailMessage[]> {
    return [];
  }

  async getMessage(_messageId: string): Promise<EmailMessage> {
    return {
      id: 'test-id',
      from: { address: 'sender@example.com' },
      to: [{ address: 'recipient@example.com' }],
      subject: 'Test',
      text: 'Test body',
    };
  }

  async listFolders(): Promise<Folder[]> {
    return [];
  }

  async selectFolder(_name: string): Promise<FolderInfo> {
    return {
      name: 'INBOX',
      exists: 0,
      recent: 0,
      unseen: 0,
      uidValidity: 1,
      uidNext: 1,
      flags: [],
      permanentFlags: [],
    };
  }

  async createFolder(_name: string): Promise<void> {
    // No-op for testing
  }

  async deleteFolder(_name: string): Promise<void> {
    // No-op for testing
  }

  async markRead(_messageId: string | string[]): Promise<void> {
    // No-op for testing
  }

  async markUnread(_messageId: string | string[]): Promise<void> {
    // No-op for testing
  }

  async move(_messageId: string | string[], _folder: string): Promise<void> {
    // No-op for testing
  }

  async copy(_messageId: string | string[], _folder: string): Promise<void> {
    // No-op for testing
  }

  async delete(_messageId: string | string[]): Promise<void> {
    // No-op for testing
  }

  async search(_criteria: SearchCriteria): Promise<EmailMessage[]> {
    return [];
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async getCapabilities(): Promise<MailboxCapabilities> {
    return {
      send: true,
      receive: false,
      folders: false,
      search: false,
      markRead: false,
      move: false,
      delete: false,
      threads: false,
      oauth: false,
      encryption: false,
    };
  }

  // Expose protected methods for testing
  public testValidateEmail(email: EmailAddress): void {
    this.validateEmail(email);
  }

  public testValidateMessage(message: EmailMessage): void {
    this.validateMessage(message);
  }

  public testMapError(error: unknown): EmailError {
    return this.mapError(error);
  }

  public testNormalizeMessageIds(messageId: string | string[]): string[] {
    return this.normalizeMessageIds(messageId);
  }
}

describe('BaseMailbox', () => {
  describe('Constructor', () => {
    it('should create instance with valid config', () => {
      const config: MailboxConfig = {
        type: 'smtp',
      };

      const mailbox = new TestMailbox(config);

      expect(mailbox).toBeInstanceOf(BaseMailbox);
      expect(mailbox.isConnected()).toBe(false);
    });

    it('should throw error if type is missing', () => {
      const config = {} as MailboxConfig;

      expect(() => new TestMailbox(config)).toThrow(EmailError);
      expect(() => new TestMailbox(config)).toThrow('Mailbox type is required');
    });

    it('should accept optional database', () => {
      const config: MailboxConfig = {
        type: 'smtp',
        db: {} as never, // Mock database
      };

      const mailbox = new TestMailbox(config);

      expect(mailbox).toBeInstanceOf(BaseMailbox);
    });

    it('should accept debug flag', () => {
      const config: MailboxConfig = {
        type: 'smtp',
        debug: true,
      };

      const mailbox = new TestMailbox(config);

      expect(mailbox).toBeInstanceOf(BaseMailbox);
    });
  });

  describe('Connection Management', () => {
    it('should track connection state', async () => {
      const config: MailboxConfig = { type: 'smtp' };
      const mailbox = new TestMailbox(config);

      expect(mailbox.isConnected()).toBe(false);

      await mailbox.connect();
      expect(mailbox.isConnected()).toBe(true);

      await mailbox.disconnect();
      expect(mailbox.isConnected()).toBe(false);
    });
  });

  describe('Email Validation', () => {
    let mailbox: TestMailbox;

    beforeEach(() => {
      mailbox = new TestMailbox({ type: 'smtp' });
    });

    it('should validate valid email address', () => {
      const email: EmailAddress = {
        address: 'user@example.com',
        name: 'User Name',
      };

      expect(() => mailbox.testValidateEmail(email)).not.toThrow();
    });

    it('should validate email without name', () => {
      const email: EmailAddress = {
        address: 'user@example.com',
      };

      expect(() => mailbox.testValidateEmail(email)).not.toThrow();
    });

    it('should reject empty email address', () => {
      const email: EmailAddress = {
        address: '',
      };

      expect(() => mailbox.testValidateEmail(email)).toThrow(
        InvalidMessageError,
      );
      expect(() => mailbox.testValidateEmail(email)).toThrow(
        'Email address is required',
      );
    });

    it('should reject malformed email addresses', () => {
      const invalidEmails = [
        { address: 'invalid' },
        { address: 'invalid@' },
        { address: '@example.com' },
        { address: 'invalid @example.com' },
        { address: 'invalid@example' },
      ];

      for (const email of invalidEmails) {
        expect(() => mailbox.testValidateEmail(email)).toThrow(
          InvalidMessageError,
        );
        expect(() => mailbox.testValidateEmail(email)).toThrow(
          `Invalid email address: ${email.address}`,
        );
      }
    });

    it('should accept various valid email formats', () => {
      const validEmails = [
        { address: 'user@example.com' },
        { address: 'user.name@example.com' },
        { address: 'user+tag@example.com' },
        { address: 'user_name@example.co.uk' },
        { address: '123@example.com' },
        { address: 'user@sub.example.com' },
      ];

      for (const email of validEmails) {
        expect(() => mailbox.testValidateEmail(email)).not.toThrow();
      }
    });
  });

  describe('Message Validation', () => {
    let mailbox: TestMailbox;

    beforeEach(() => {
      mailbox = new TestMailbox({ type: 'smtp' });
    });

    it('should validate valid message', () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Test body',
      };

      expect(() => mailbox.testValidateMessage(message)).not.toThrow();
    });

    it('should validate message with HTML content', () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        html: '<p>HTML body</p>',
      };

      expect(() => mailbox.testValidateMessage(message)).not.toThrow();
    });

    it('should validate message with both text and HTML', () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Plain text',
        html: '<p>HTML body</p>',
      };

      expect(() => mailbox.testValidateMessage(message)).not.toThrow();
    });

    it('should validate message with CC recipients', () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        cc: [{ address: 'cc@example.com' }],
        subject: 'Test',
        text: 'Test body',
      };

      expect(() => mailbox.testValidateMessage(message)).not.toThrow();
    });

    it('should validate message with BCC recipients', () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        bcc: [{ address: 'bcc@example.com' }],
        subject: 'Test',
        text: 'Test body',
      };

      expect(() => mailbox.testValidateMessage(message)).not.toThrow();
    });

    it('should reject message without from address', () => {
      const message = {
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Test body',
      } as EmailMessage;

      expect(() => mailbox.testValidateMessage(message)).toThrow(
        InvalidMessageError,
      );
      expect(() => mailbox.testValidateMessage(message)).toThrow(
        'Message must have a sender (from)',
      );
    });

    it('should reject message with invalid from address', () => {
      const message: EmailMessage = {
        from: { address: 'invalid@' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Test body',
      };

      expect(() => mailbox.testValidateMessage(message)).toThrow(
        InvalidMessageError,
      );
    });

    it('should reject message without to recipients', () => {
      const message = {
        from: { address: 'sender@example.com' },
        to: [],
        subject: 'Test',
        text: 'Test body',
      } as EmailMessage;

      expect(() => mailbox.testValidateMessage(message)).toThrow(
        InvalidMessageError,
      );
      expect(() => mailbox.testValidateMessage(message)).toThrow(
        'Message must have at least one recipient (to)',
      );
    });

    it('should reject message with invalid to recipient', () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'invalid@' }],
        subject: 'Test',
        text: 'Test body',
      };

      expect(() => mailbox.testValidateMessage(message)).toThrow(
        InvalidMessageError,
      );
    });

    it('should reject message with invalid CC recipient', () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        cc: [{ address: 'invalid@' }],
        subject: 'Test',
        text: 'Test body',
      };

      expect(() => mailbox.testValidateMessage(message)).toThrow(
        InvalidMessageError,
      );
    });

    it('should reject message with invalid BCC recipient', () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        bcc: [{ address: 'invalid@' }],
        subject: 'Test',
        text: 'Test body',
      };

      expect(() => mailbox.testValidateMessage(message)).toThrow(
        InvalidMessageError,
      );
    });

    it('should reject message without subject', () => {
      const message = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: '',
        text: 'Test body',
      } as EmailMessage;

      expect(() => mailbox.testValidateMessage(message)).toThrow(
        InvalidMessageError,
      );
      expect(() => mailbox.testValidateMessage(message)).toThrow(
        'Message must have a subject',
      );
    });

    it('should reject message without content', () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
      };

      expect(() => mailbox.testValidateMessage(message)).toThrow(
        InvalidMessageError,
      );
      expect(() => mailbox.testValidateMessage(message)).toThrow(
        'Message must have either text or HTML content',
      );
    });
  });

  describe('Error Mapping', () => {
    let mailbox: TestMailbox;

    beforeEach(() => {
      mailbox = new TestMailbox({ type: 'smtp' });
    });

    it('should pass through EmailError', () => {
      const originalError = new EmailError('Test error', 'TEST_CODE', 'smtp');
      const mapped = mailbox.testMapError(originalError);

      expect(mapped).toBe(originalError);
      expect(mapped.code).toBe('TEST_CODE');
      expect(mapped.provider).toBe('smtp');
    });

    it('should wrap generic Error', () => {
      const originalError = new Error('Generic error');
      const mapped = mailbox.testMapError(originalError);

      expect(mapped).toBeInstanceOf(EmailError);
      expect(mapped.message).toBe('Generic error');
      expect(mapped.code).toBe('UNKNOWN_ERROR');
      expect(mapped.cause).toBe(originalError);
    });

    it('should wrap string errors', () => {
      const mapped = mailbox.testMapError('String error');

      expect(mapped).toBeInstanceOf(EmailError);
      expect(mapped.message).toBe('String error');
      expect(mapped.code).toBe('UNKNOWN_ERROR');
    });

    it('should wrap null/undefined errors', () => {
      const mappedNull = mailbox.testMapError(null);
      const mappedUndefined = mailbox.testMapError(undefined);

      expect(mappedNull).toBeInstanceOf(EmailError);
      expect(mappedUndefined).toBeInstanceOf(EmailError);
    });
  });

  describe('Utility Methods', () => {
    let mailbox: TestMailbox;

    beforeEach(() => {
      mailbox = new TestMailbox({ type: 'smtp' });
    });

    it('should normalize single message ID to array', () => {
      const result = mailbox.testNormalizeMessageIds('msg-123');

      expect(result).toEqual(['msg-123']);
    });

    it('should pass through array of message IDs', () => {
      const ids = ['msg-1', 'msg-2', 'msg-3'];
      const result = mailbox.testNormalizeMessageIds(ids);

      expect(result).toEqual(ids);
      expect(result).toBe(ids); // Returns same array reference for efficiency
    });

    it('should handle empty array', () => {
      const result = mailbox.testNormalizeMessageIds([]);

      expect(result).toEqual([]);
    });
  });

  describe('Sync Operation', () => {
    it('should throw error if database not configured', async () => {
      const mailbox = new TestMailbox({ type: 'smtp' });

      await expect(mailbox.sync()).rejects.toThrow(EmailError);
      await expect(mailbox.sync()).rejects.toThrow(
        'Database not configured for sync',
      );
    });

    it('should return sync result with database configured', async () => {
      const db = {} as never; // Mock database
      const mailbox = new TestMailbox({ type: 'smtp', db });

      const result: SyncResult = await mailbox.sync({
        folders: ['INBOX'],
      });

      expect(result).toBeDefined();
      expect(result.folders).toEqual(['INBOX']);
      expect(result.messagesProcessed).toBe(0);
      expect(result.messagesDownloaded).toBe(0);
      expect(result.messagesSkipped).toBe(0);
      expect(result.errors).toEqual([]);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should use INBOX as default folder', async () => {
      const db = {} as never;
      const mailbox = new TestMailbox({ type: 'smtp', db });

      const result = await mailbox.sync();

      expect(result.folders).toEqual(['INBOX']);
    });

    it('should call onProgress callback', async () => {
      const db = {} as never;
      const mailbox = new TestMailbox({ type: 'smtp', db });
      const progressCalls: never[] = [];

      const options: SyncOptions = {
        folders: ['INBOX'],
        onProgress: (progress) => {
          progressCalls.push(progress as never);
        },
      };

      await mailbox.sync(options);

      // Since TestMailbox.fetch() returns empty array, no progress calls expected
      expect(progressCalls).toHaveLength(0);
    });
  });

  describe('Abstract Method Implementation', () => {
    it('should implement send method', async () => {
      const mailbox = new TestMailbox({ type: 'smtp' });
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Test body',
      };

      const result = await mailbox.send(message);

      expect(result).toBeDefined();
      expect(result.messageId).toBe('test-id');
      expect(result.accepted).toEqual(['recipient@example.com']);
    });

    it('should implement fetch method', async () => {
      const mailbox = new TestMailbox({ type: 'smtp' });

      const messages = await mailbox.fetch();

      expect(messages).toEqual([]);
    });

    it('should implement getMessage method', async () => {
      const mailbox = new TestMailbox({ type: 'smtp' });

      const message = await mailbox.getMessage('test-id');

      expect(message).toBeDefined();
      expect(message.id).toBe('test-id');
    });

    it('should implement listFolders method', async () => {
      const mailbox = new TestMailbox({ type: 'smtp' });

      const folders = await mailbox.listFolders();

      expect(folders).toEqual([]);
    });

    it('should implement getCapabilities method', async () => {
      const mailbox = new TestMailbox({ type: 'smtp' });

      const capabilities = await mailbox.getCapabilities();

      expect(capabilities).toBeDefined();
      expect(capabilities.send).toBe(true);
      expect(capabilities.receive).toBe(false);
    });

    it('should implement getAdapter method', () => {
      const mailbox = new TestMailbox({ type: 'smtp' });

      const adapter = mailbox.getAdapter();

      expect(adapter).toBe('smtp');
    });
  });
});
