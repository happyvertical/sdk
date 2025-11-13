import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IMAPAdapter } from '../../src/adapters/imap';
import {
  AuthenticationError,
  ConnectionError,
  EmailError,
  FolderExistsError,
  FolderNotFoundError,
  MessageNotFoundError,
  TimeoutError,
} from '../../src/shared/errors';
import type { IMAPOptions } from '../../src/shared/types';

// Mock imapflow
const mockClient = {
  connect: vi.fn(),
  logout: vi.fn(),
  search: vi.fn(),
  fetch: vi.fn(),
  mailboxOpen: vi.fn(),
  mailboxCreate: vi.fn(),
  mailboxDelete: vi.fn(),
  list: vi.fn(),
  messageFlagsAdd: vi.fn(),
  messageFlagsRemove: vi.fn(),
  messageMove: vi.fn(),
  messageCopy: vi.fn(),
  expunge: vi.fn(),
};

vi.mock('imapflow', () => {
  class MockImapFlow {
    constructor() {
      // biome-ignore lint/correctness/noConstructorReturn: Mock needs to return mockClient
      return mockClient as any;
    }
  }

  return {
    // biome-ignore lint/style/useNamingConvention: External API naming convention
    ImapFlow: MockImapFlow,
  };
});

// Mock mailparser
vi.mock('mailparser', () => ({
  simpleParser: vi.fn(async () => ({
    messageId: '<test@example.com>',
    from: {
      value: [{ address: 'sender@example.com', name: 'Sender' }],
    },
    to: {
      value: [{ address: 'recipient@example.com', name: 'Recipient' }],
    },
    subject: 'Test Subject',
    date: new Date('2024-01-01'),
    text: 'Test body',
    html: '<p>Test body</p>',
    headers: new Map([['x-custom', 'value']]),
  })),
}));

describe('IMAP Adapter', () => {
  let adapter: IMAPAdapter;
  let options: IMAPOptions;

  beforeEach(() => {
    vi.clearAllMocks();

    options = {
      type: 'imap',
      host: 'imap.example.com',
      port: 993,
      secure: true,
      auth: { user: 'user@example.com', pass: 'password' },
    };

    adapter = new IMAPAdapter(options);
  });

  afterEach(async () => {
    // Cleanup
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  describe('Constructor', () => {
    it('should create adapter with basic auth', () => {
      expect(adapter).toBeInstanceOf(IMAPAdapter);
      expect(adapter.getAdapter()).toBe('imap');
    });

    it('should create adapter with OAuth2 auth', () => {
      const oauth2Options: IMAPOptions = {
        type: 'imap',
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
          type: 'OAuth2',
          user: 'user@gmail.com',
          accessToken: 'access-token',
        },
      };

      const oauth2Adapter = new IMAPAdapter(oauth2Options);
      expect(oauth2Adapter).toBeInstanceOf(IMAPAdapter);
    });

    it('should create adapter with custom TLS settings', () => {
      const tlsOptions: IMAPOptions = {
        ...options,
        tls: {
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2',
        },
      };

      const tlsAdapter = new IMAPAdapter(tlsOptions);
      expect(tlsAdapter).toBeInstanceOf(IMAPAdapter);
    });

    it('should create adapter with debug enabled', () => {
      const debugOptions: IMAPOptions = {
        ...options,
        debug: true,
      };

      const debugAdapter = new IMAPAdapter(debugOptions);
      expect(debugAdapter).toBeInstanceOf(IMAPAdapter);
    });
  });

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      mockClient.connect.mockResolvedValue(undefined);

      await adapter.connect();

      expect(mockClient.connect).toHaveBeenCalled();
      expect(adapter.isConnected()).toBe(true);
    });

    it('should disconnect successfully', async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.logout.mockResolvedValue(undefined);

      await adapter.connect();
      await adapter.disconnect();

      expect(mockClient.logout).toHaveBeenCalled();
      expect(adapter.isConnected()).toBe(false);
    });

    it('should handle connection failure', async () => {
      mockClient.connect.mockRejectedValue(new Error('Connection refused'));

      await expect(adapter.connect()).rejects.toThrow(ConnectionError);
      expect(adapter.isConnected()).toBe(false);
    });

    it('should handle authentication failure', async () => {
      mockClient.connect.mockRejectedValue(new Error('Authentication failed'));

      await expect(adapter.connect()).rejects.toThrow(AuthenticationError);
    });

    it('should handle timeout during connection', async () => {
      mockClient.connect.mockRejectedValue(new Error('Connection timeout'));

      await expect(adapter.connect()).rejects.toThrow(TimeoutError);
    });
  });

  describe('fetch', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.mailboxOpen.mockResolvedValue({
        exists: 10,
        uidValidity: 1,
        uidNext: 11,
        flags: ['\\Seen', '\\Flagged'],
        permanentFlags: ['\\Seen', '\\Flagged'],
      });
      await adapter.connect();
    });

    it('should fetch messages from INBOX', async () => {
      mockClient.search.mockResolvedValue([1, 2, 3]);
      mockClient.fetch.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            uid: 1,
            flags: new Set(['\\Seen']),
            source: Buffer.from('test'),
          };
        },
      });

      const messages = await adapter.fetch();

      expect(mockClient.mailboxOpen).toHaveBeenCalledWith('INBOX');
      expect(mockClient.search).toHaveBeenCalled();
      expect(messages).toHaveLength(1);
      expect(messages[0].subject).toBe('Test Subject');
    });

    it('should fetch messages from specific folder', async () => {
      mockClient.search.mockResolvedValue([1, 2]);
      mockClient.fetch.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            uid: 1,
            flags: new Set(),
            source: Buffer.from('test'),
          };
        },
      });

      await adapter.fetch({ folder: 'Sent' });

      expect(mockClient.mailboxOpen).toHaveBeenCalledWith('Sent');
    });

    it('should fetch only unread messages', async () => {
      mockClient.search.mockResolvedValue([1, 2]);
      mockClient.fetch.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            uid: 1,
            flags: new Set(),
            source: Buffer.from('test'),
          };
        },
      });

      await adapter.fetch({ unreadOnly: true });

      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({ unseen: true }),
        expect.any(Object),
      );
    });

    it('should fetch messages with date filters', async () => {
      const since = new Date('2024-01-01');
      const before = new Date('2024-12-31');

      mockClient.search.mockResolvedValue([1]);
      mockClient.fetch.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            uid: 1,
            flags: new Set(),
            source: Buffer.from('test'),
          };
        },
      });

      await adapter.fetch({ since, before });

      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({ since, before }),
        expect.any(Object),
      );
    });

    it('should apply limit', async () => {
      mockClient.search.mockResolvedValue([1, 2, 3, 4, 5]);
      mockClient.fetch.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            uid: 1,
            flags: new Set(),
            source: Buffer.from('test'),
          };
          yield {
            uid: 2,
            flags: new Set(),
            source: Buffer.from('test'),
          };
        },
      });

      const messages = await adapter.fetch({ limit: 2 });

      // Fetch should be called with only first 2 UIDs
      expect(messages).toHaveLength(2);
    });

    it('should apply offset and limit', async () => {
      mockClient.search.mockResolvedValue([1, 2, 3, 4, 5]);
      mockClient.fetch.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            uid: 3,
            flags: new Set(),
            source: Buffer.from('test'),
          };
        },
      });

      await adapter.fetch({ offset: 2, limit: 1 });

      // Should fetch UIDs starting from offset
      expect(mockClient.fetch).toHaveBeenCalled();
    });

    it('should mark messages as seen when requested', async () => {
      mockClient.search.mockResolvedValue([1]);
      mockClient.fetch.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            uid: 1,
            flags: new Set(),
            source: Buffer.from('test'),
          };
        },
      });

      await adapter.fetch({ markSeen: true });

      expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith(1, ['\\Seen'], {
        uid: true,
      });
    });

    it('should return empty array when no messages found', async () => {
      mockClient.search.mockResolvedValue([]);

      const messages = await adapter.fetch();

      expect(messages).toEqual([]);
      expect(mockClient.fetch).not.toHaveBeenCalled();
    });

    it('should throw error when not connected', async () => {
      await adapter.disconnect();

      await expect(adapter.fetch()).rejects.toThrow(ConnectionError);
    });
  });

  describe('getMessage', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.mailboxOpen.mockResolvedValue({
        exists: 10,
        uidValidity: 1,
        uidNext: 11,
        flags: [],
        permanentFlags: [],
      });
      await adapter.connect();
    });

    it('should get message by ID', async () => {
      mockClient.search.mockResolvedValue([1]);
      mockClient.fetch.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            uid: 1,
            flags: new Set(),
            source: Buffer.from('test'),
          };
        },
      });

      const message = await adapter.getMessage('<test@example.com>');

      expect(mockClient.search).toHaveBeenCalledWith({
        header: ['message-id', '<test@example.com>'],
      });
      expect(message.messageId).toBe('<test@example.com>');
    });

    it('should throw error when message not found', async () => {
      mockClient.search.mockResolvedValue([]);

      await expect(
        adapter.getMessage('<nonexistent@example.com>'),
      ).rejects.toThrow(MessageNotFoundError);
    });
  });

  describe('Folder Operations', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      await adapter.connect();
    });

    it('should list folders', async () => {
      mockClient.list.mockResolvedValue([
        {
          name: 'INBOX',
          path: 'INBOX',
          delimiter: '/',
          specialUse: '\\Inbox',
          subscribed: true,
        },
        {
          name: 'Sent',
          path: 'Sent',
          delimiter: '/',
          specialUse: '\\Sent',
          subscribed: true,
        },
      ]);

      const folders = await adapter.listFolders();

      expect(folders).toHaveLength(2);
      expect(folders[0].name).toBe('INBOX');
      expect(folders[1].name).toBe('Sent');
    });

    it('should select folder', async () => {
      mockClient.mailboxOpen.mockResolvedValue({
        exists: 10,
        uidValidity: 1,
        uidNext: 11,
        flags: ['\\Seen'],
        permanentFlags: ['\\Seen'],
      });

      const info = await adapter.selectFolder('INBOX');

      expect(mockClient.mailboxOpen).toHaveBeenCalledWith('INBOX');
      expect(info.name).toBe('INBOX');
      expect(info.exists).toBe(10);
    });

    it('should throw error when selecting non-existent folder', async () => {
      mockClient.mailboxOpen.mockRejectedValue(
        new Error('Folder does not exist'),
      );

      await expect(adapter.selectFolder('NonExistent')).rejects.toThrow(
        FolderNotFoundError,
      );
    });

    it('should create folder', async () => {
      mockClient.mailboxCreate.mockResolvedValue(undefined);

      await adapter.createFolder('Archive');

      expect(mockClient.mailboxCreate).toHaveBeenCalledWith('Archive');
    });

    it('should throw error when creating existing folder', async () => {
      mockClient.mailboxCreate.mockRejectedValue(
        new Error('Folder already exists'),
      );

      await expect(adapter.createFolder('INBOX')).rejects.toThrow(
        FolderExistsError,
      );
    });

    it('should delete folder', async () => {
      mockClient.mailboxDelete.mockResolvedValue(undefined);

      await adapter.deleteFolder('OldFolder');

      expect(mockClient.mailboxDelete).toHaveBeenCalledWith('OldFolder');
    });

    it('should throw error when deleting non-existent folder', async () => {
      mockClient.mailboxDelete.mockRejectedValue(
        new Error('Folder does not exist'),
      );

      await expect(adapter.deleteFolder('NonExistent')).rejects.toThrow(
        FolderNotFoundError,
      );
    });
  });

  describe('Message Operations', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.mailboxOpen.mockResolvedValue({
        exists: 10,
        uidValidity: 1,
        uidNext: 11,
        flags: [],
        permanentFlags: [],
      });
      await adapter.connect();
    });

    it('should mark message as read', async () => {
      mockClient.search.mockResolvedValue([1]);
      mockClient.messageFlagsAdd.mockResolvedValue(undefined);

      await adapter.markRead('<test@example.com>');

      expect(mockClient.search).toHaveBeenCalledWith({
        header: ['message-id', '<test@example.com>'],
      });
      expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith(1, ['\\Seen'], {
        uid: true,
      });
    });

    it('should mark multiple messages as read', async () => {
      mockClient.search.mockResolvedValueOnce([1]).mockResolvedValueOnce([2]);
      mockClient.messageFlagsAdd.mockResolvedValue(undefined);

      await adapter.markRead(['<test1@example.com>', '<test2@example.com>']);

      expect(mockClient.messageFlagsAdd).toHaveBeenCalledTimes(2);
    });

    it('should mark message as unread', async () => {
      mockClient.search.mockResolvedValue([1]);
      mockClient.messageFlagsRemove.mockResolvedValue(undefined);

      await adapter.markUnread('<test@example.com>');

      expect(mockClient.messageFlagsRemove).toHaveBeenCalledWith(
        1,
        ['\\Seen'],
        { uid: true },
      );
    });

    it('should move message to folder', async () => {
      mockClient.search.mockResolvedValue([1]);
      mockClient.messageMove.mockResolvedValue(undefined);

      await adapter.move('<test@example.com>', 'Archive');

      expect(mockClient.messageMove).toHaveBeenCalledWith(1, 'Archive', {
        uid: true,
      });
    });

    it('should copy message to folder', async () => {
      mockClient.search.mockResolvedValue([1]);
      mockClient.messageCopy.mockResolvedValue(undefined);

      await adapter.copy('<test@example.com>', 'Archive');

      expect(mockClient.messageCopy).toHaveBeenCalledWith(1, 'Archive', {
        uid: true,
      });
    });

    it('should delete message', async () => {
      mockClient.search.mockResolvedValue([1]);
      mockClient.messageFlagsAdd.mockResolvedValue(undefined);
      mockClient.expunge.mockResolvedValue(undefined);

      await adapter.delete('<test@example.com>');

      expect(mockClient.messageFlagsAdd).toHaveBeenCalledWith(
        1,
        ['\\Deleted'],
        { uid: true },
      );
      expect(mockClient.expunge).toHaveBeenCalled();
    });

    it('should delete multiple messages', async () => {
      mockClient.search.mockResolvedValueOnce([1]).mockResolvedValueOnce([2]);
      mockClient.messageFlagsAdd.mockResolvedValue(undefined);
      mockClient.expunge.mockResolvedValue(undefined);

      await adapter.delete(['<test1@example.com>', '<test2@example.com>']);

      expect(mockClient.messageFlagsAdd).toHaveBeenCalledTimes(2);
      expect(mockClient.expunge).toHaveBeenCalledTimes(1);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      mockClient.mailboxOpen.mockResolvedValue({
        exists: 10,
        uidValidity: 1,
        uidNext: 11,
        flags: [],
        permanentFlags: [],
      });
      await adapter.connect();
    });

    it('should search by from address', async () => {
      mockClient.search.mockResolvedValue([1]);
      mockClient.fetch.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            uid: 1,
            flags: new Set(),
            source: Buffer.from('test'),
          };
        },
      });

      const results = await adapter.search({
        from: 'sender@example.com',
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'sender@example.com' }),
        { uid: true },
      );
      expect(results).toHaveLength(1);
    });

    it('should search by subject', async () => {
      mockClient.search.mockResolvedValue([1]);
      mockClient.fetch.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            uid: 1,
            flags: new Set(),
            source: Buffer.from('test'),
          };
        },
      });

      await adapter.search({ subject: 'important' });

      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({ subject: 'important' }),
        { uid: true },
      );
    });

    it('should search with multiple criteria', async () => {
      mockClient.search.mockResolvedValue([1]);
      mockClient.fetch.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            uid: 1,
            flags: new Set(),
            source: Buffer.from('test'),
          };
        },
      });

      await adapter.search({
        from: 'sender@example.com',
        subject: 'important',
        unread: true,
        since: new Date('2024-01-01'),
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'sender@example.com',
          subject: 'important',
          unseen: true,
          since: expect.any(Date),
        }),
        { uid: true },
      );
    });

    it('should search by size', async () => {
      mockClient.search.mockResolvedValue([1]);
      mockClient.fetch.mockReturnValue({
        [Symbol.asyncIterator]: async function* () {
          yield {
            uid: 1,
            flags: new Set(),
            source: Buffer.from('test'),
          };
        },
      });

      await adapter.search({
        larger: 1000,
        smaller: 10000,
      });

      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          larger: 1000,
          smaller: 10000,
        }),
        { uid: true },
      );
    });

    it('should return empty array when no matches', async () => {
      mockClient.search.mockResolvedValue([]);

      const results = await adapter.search({ from: 'nobody@example.com' });

      expect(results).toEqual([]);
    });
  });

  describe('Capabilities', () => {
    it('should report correct capabilities for basic auth', async () => {
      const capabilities = await adapter.getCapabilities();

      expect(capabilities).toEqual({
        send: false,
        receive: true,
        folders: true,
        search: true,
        markRead: true,
        move: true,
        delete: true,
        threads: false,
        oauth: false,
        encryption: false,
      });
    });

    it('should report OAuth2 capability when using OAuth2', async () => {
      const oauth2Adapter = new IMAPAdapter({
        type: 'imap',
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: {
          type: 'OAuth2',
          user: 'user@gmail.com',
          accessToken: 'token',
        },
      });

      const capabilities = await oauth2Adapter.getCapabilities();

      expect(capabilities.oauth).toBe(true);
    });
  });

  describe('Unsupported Operations', () => {
    it('should throw error when trying to send', async () => {
      await expect(
        adapter.send({
          from: { address: 'sender@example.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Test',
          text: 'Body',
        }),
      ).rejects.toThrow(EmailError);
    });
  });

  describe('Error Mapping', () => {
    beforeEach(async () => {
      mockClient.connect.mockResolvedValue(undefined);
      await adapter.connect();
    });

    it('should map authentication errors', async () => {
      mockClient.mailboxOpen.mockRejectedValue(
        new Error('Authentication failed'),
      );

      await expect(adapter.selectFolder('INBOX')).rejects.toThrow(
        AuthenticationError,
      );
    });

    it('should map connection errors', async () => {
      mockClient.mailboxOpen.mockRejectedValue(
        new Error('Connection refused: ECONNREFUSED'),
      );

      await expect(adapter.selectFolder('INBOX')).rejects.toThrow(
        ConnectionError,
      );
    });

    it('should map timeout errors', async () => {
      mockClient.mailboxOpen.mockRejectedValue(
        new Error('Operation timeout: ETIMEDOUT'),
      );

      await expect(adapter.selectFolder('INBOX')).rejects.toThrow(TimeoutError);
    });

    it('should map generic IMAP errors', async () => {
      mockClient.mailboxOpen.mockRejectedValue(new Error('Unknown error'));

      await expect(adapter.selectFolder('INBOX')).rejects.toThrow(EmailError);
    });
  });
});
