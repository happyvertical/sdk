/**
 * Tests for POP3 adapter
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POP3Adapter } from '../../src/adapters/pop3';
import type { POP3Options } from '../../src/shared/types';
import {
  AuthenticationError,
  ConnectionError,
  EmailError,
  MessageNotFoundError,
  TimeoutError,
} from '../../src/shared/errors';

// Mock node-pop3
const mockClient = {
  connect: vi.fn(),
  QUIT: vi.fn(),
  UIDL: vi.fn(),
  RETR: vi.fn(),
  command: vi.fn(),
};

vi.mock('node-pop3', () => {
  class MockPop3Command {
    constructor() {
      return mockClient as any;
    }
  }
  return { default: MockPop3Command };
});

// Mock mailparser
vi.mock('mailparser', () => ({
  simpleParser: vi.fn(async (data: string) => {
    // Simple mock parser
    return {
      messageId: '<test@example.com>',
      from: {
        value: [
          {
            address: 'sender@example.com',
            name: 'Sender Name',
          },
        ],
      },
      to: {
        value: [
          {
            address: 'recipient@example.com',
            name: 'Recipient Name',
          },
        ],
      },
      subject: 'Test Subject',
      date: new Date('2024-01-01T12:00:00Z'),
      text: 'Test body',
      html: '<p>Test body</p>',
      headers: new Map(),
      attachments: [],
    };
  }),
}));

describe('POP3Adapter', () => {
  let adapter: POP3Adapter;
  let options: POP3Options;

  beforeEach(() => {
    options = {
      type: 'pop3',
      host: 'pop.example.com',
      port: 995,
      secure: true,
      auth: {
        user: 'user@example.com',
        pass: 'password',
      },
    };

    adapter = new POP3Adapter(options);

    // Reset mocks
    vi.clearAllMocks();
    mockClient.connect.mockResolvedValue(undefined);
    mockClient.QUIT.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  describe('Connection', () => {
    it('should connect successfully', async () => {
      await adapter.connect();

      expect(mockClient.connect).toHaveBeenCalled();
      expect(adapter.isConnected()).toBe(true);
    });

    it('should disconnect successfully', async () => {
      await adapter.connect();
      await adapter.disconnect();

      expect(mockClient.QUIT).toHaveBeenCalled();
      expect(adapter.isConnected()).toBe(false);
    });

    it('should handle connection timeout', async () => {
      mockClient.connect.mockRejectedValue(
        Object.assign(new Error('Connection timeout'), {
          code: 'ETIMEDOUT',
        }),
      );

      await expect(adapter.connect()).rejects.toThrow(TimeoutError);
    });

    it('should handle connection refused', async () => {
      mockClient.connect.mockRejectedValue(
        Object.assign(new Error('Connection refused'), {
          code: 'ECONNREFUSED',
        }),
      );

      await expect(adapter.connect()).rejects.toThrow(ConnectionError);
    });

    it('should handle authentication failure', async () => {
      mockClient.connect.mockRejectedValue(
        new Error('-ERR Invalid credentials'),
      );

      await expect(adapter.connect()).rejects.toThrow(AuthenticationError);
    });
  });

  describe('Fetch Messages', () => {
    beforeEach(async () => {
      await adapter.connect();

      // Mock UIDL response
      mockClient.UIDL.mockResolvedValue([
        '+OK\n1 uid-001\n2 uid-002\n3 uid-003\n.',
        null,
      ]);

      // Mock RETR response
      mockClient.RETR.mockResolvedValue([
        'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nBody',
        null,
      ]);
    });

    it('should fetch all messages', async () => {
      const messages = await adapter.fetch();

      expect(messages).toHaveLength(3);
      expect(mockClient.UIDL).toHaveBeenCalled();
      expect(mockClient.RETR).toHaveBeenCalledTimes(3);
    });

    it('should fetch messages with limit', async () => {
      const messages = await adapter.fetch({ limit: 2 });

      expect(messages).toHaveLength(2);
      expect(mockClient.RETR).toHaveBeenCalledTimes(2);
    });

    it('should fetch messages with offset', async () => {
      const messages = await adapter.fetch({ offset: 1, limit: 2 });

      expect(messages).toHaveLength(2);
      expect(mockClient.RETR).toHaveBeenCalledTimes(2);
    });

    it('should return empty array if no messages', async () => {
      mockClient.UIDL.mockResolvedValue(['+OK\n.', null]);

      const messages = await adapter.fetch();

      expect(messages).toHaveLength(0);
    });

    it('should throw error if not connected', async () => {
      await adapter.disconnect();

      await expect(adapter.fetch()).rejects.toThrow(ConnectionError);
      await expect(adapter.fetch()).rejects.toThrow('Not connected');
    });

    it('should delete messages after fetch by default', async () => {
      mockClient.command.mockResolvedValue(['+OK', null]);

      await adapter.fetch({ limit: 1 });

      expect(mockClient.command).toHaveBeenCalledWith('DELE 1');
    });

    it('should not delete messages if leaveOnServer is true', async () => {
      const adapterLeave = new POP3Adapter({
        ...options,
        leaveOnServer: true,
      });
      await adapterLeave.connect();

      mockClient.UIDL.mockResolvedValue(['+OK\n1 uid-001\n.', null]);
      mockClient.RETR.mockResolvedValue([
        'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nBody',
        null,
      ]);

      await adapterLeave.fetch();

      expect(mockClient.command).not.toHaveBeenCalledWith('DELE 1');

      await adapterLeave.disconnect();
    });

    it('should filter messages by date (since)', async () => {
      const { simpleParser } = await import('mailparser');

      // Mock different dates for messages
      (simpleParser as any)
        .mockResolvedValueOnce({
          messageId: '<old@example.com>',
          from: { value: [{ address: 'sender@example.com' }] },
          to: { value: [{ address: 'recipient@example.com' }] },
          subject: 'Old Message',
          date: new Date('2024-01-01T12:00:00Z'),
          text: 'Old',
          headers: new Map(),
          attachments: [],
        })
        .mockResolvedValueOnce({
          messageId: '<new@example.com>',
          from: { value: [{ address: 'sender@example.com' }] },
          to: { value: [{ address: 'recipient@example.com' }] },
          subject: 'New Message',
          date: new Date('2024-02-01T12:00:00Z'),
          text: 'New',
          headers: new Map(),
          attachments: [],
        });

      mockClient.UIDL.mockResolvedValue(['+OK\n1 uid-001\n2 uid-002\n.', null]);

      const messages = await adapter.fetch({
        since: new Date('2024-01-15T00:00:00Z'),
      });

      // Only the new message should be included
      expect(messages).toHaveLength(1);
      expect(messages[0].subject).toBe('New Message');
    });

    it('should filter messages by date (before)', async () => {
      const { simpleParser } = await import('mailparser');

      (simpleParser as any)
        .mockResolvedValueOnce({
          messageId: '<old@example.com>',
          from: { value: [{ address: 'sender@example.com' }] },
          to: { value: [{ address: 'recipient@example.com' }] },
          subject: 'Old Message',
          date: new Date('2024-01-01T12:00:00Z'),
          text: 'Old',
          headers: new Map(),
          attachments: [],
        })
        .mockResolvedValueOnce({
          messageId: '<new@example.com>',
          from: { value: [{ address: 'sender@example.com' }] },
          to: { value: [{ address: 'recipient@example.com' }] },
          subject: 'New Message',
          date: new Date('2024-02-01T12:00:00Z'),
          text: 'New',
          headers: new Map(),
          attachments: [],
        });

      mockClient.UIDL.mockResolvedValue(['+OK\n1 uid-001\n2 uid-002\n.', null]);

      const messages = await adapter.fetch({
        before: new Date('2024-01-15T00:00:00Z'),
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].subject).toBe('Old Message');
    });
  });

  describe('Get Message', () => {
    beforeEach(async () => {
      await adapter.connect();

      mockClient.UIDL.mockResolvedValue([
        '+OK\n1 uid-001\n2 uid-002\n.',
        null,
      ]);
      mockClient.RETR.mockResolvedValue([
        'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nBody',
        null,
      ]);
    });

    it('should get message by UID', async () => {
      // First fetch to populate cache
      await adapter.fetch({ limit: 1 });

      const message = await adapter.getMessage('uid-001');

      expect(message).toBeTruthy();
      expect(message.id).toBe('uid-001');
    });

    it('should throw MessageNotFoundError for nonexistent UID', async () => {
      await expect(adapter.getMessage('nonexistent')).rejects.toThrow(
        MessageNotFoundError,
      );
    });

    it('should refresh UIDL if message not in cache', async () => {
      const message = await adapter.getMessage('uid-001');

      expect(mockClient.UIDL).toHaveBeenCalled();
      expect(message).toBeTruthy();
    });
  });

  describe('Delete Messages', () => {
    beforeEach(async () => {
      await adapter.connect();

      mockClient.UIDL.mockResolvedValue([
        '+OK\n1 uid-001\n2 uid-002\n.',
        null,
      ]);
      mockClient.command.mockResolvedValue(['+OK', null]);
    });

    it('should delete single message', async () => {
      // First fetch to populate cache
      const adapterLeave = new POP3Adapter({
        ...options,
        leaveOnServer: true,
      });
      await adapterLeave.connect();

      mockClient.UIDL.mockResolvedValue([
        '+OK\n1 uid-001\n2 uid-002\n.',
        null,
      ]);
      mockClient.RETR.mockResolvedValue([
        'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nBody',
        null,
      ]);

      await adapterLeave.fetch({ limit: 1 });

      await adapterLeave.delete('uid-001');

      expect(mockClient.command).toHaveBeenCalledWith('DELE 1');

      await adapterLeave.disconnect();
    });

    it('should delete multiple messages', async () => {
      // First fetch to populate cache
      const adapterLeave = new POP3Adapter({
        ...options,
        leaveOnServer: true,
      });
      await adapterLeave.connect();

      mockClient.UIDL.mockResolvedValue([
        '+OK\n1 uid-001\n2 uid-002\n.',
        null,
      ]);
      mockClient.RETR.mockResolvedValue([
        'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nBody',
        null,
      ]);

      await adapterLeave.fetch();

      await adapterLeave.delete(['uid-001', 'uid-002']);

      expect(mockClient.command).toHaveBeenCalledWith('DELE 1');
      expect(mockClient.command).toHaveBeenCalledWith('DELE 2');

      await adapterLeave.disconnect();
    });

    it('should throw MessageNotFoundError for nonexistent message', async () => {
      await expect(adapter.delete('nonexistent')).rejects.toThrow(
        MessageNotFoundError,
      );
    });
  });

  describe('Unsupported Operations', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should throw error for send', async () => {
      await expect(
        adapter.send({
          from: { address: 'sender@example.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Test',
          text: 'Body',
        }),
      ).rejects.toThrow(EmailError);
      await expect(
        adapter.send({
          from: { address: 'sender@example.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Test',
          text: 'Body',
        }),
      ).rejects.toThrow('does not support sending');
    });

    it('should throw error for listFolders', async () => {
      await expect(adapter.listFolders()).rejects.toThrow(EmailError);
      await expect(adapter.listFolders()).rejects.toThrow(
        'does not support folders',
      );
    });

    it('should throw error for selectFolder', async () => {
      await expect(adapter.selectFolder('INBOX')).rejects.toThrow(EmailError);
      await expect(adapter.selectFolder('INBOX')).rejects.toThrow(
        'does not support folders',
      );
    });

    it('should throw error for createFolder', async () => {
      await expect(adapter.createFolder('Test')).rejects.toThrow(EmailError);
      await expect(adapter.createFolder('Test')).rejects.toThrow(
        'does not support folders',
      );
    });

    it('should throw error for deleteFolder', async () => {
      await expect(adapter.deleteFolder('Test')).rejects.toThrow(EmailError);
      await expect(adapter.deleteFolder('Test')).rejects.toThrow(
        'does not support folders',
      );
    });

    it('should throw error for markRead', async () => {
      await expect(adapter.markRead('msg-1')).rejects.toThrow(EmailError);
      await expect(adapter.markRead('msg-1')).rejects.toThrow(
        'does not support marking',
      );
    });

    it('should throw error for markUnread', async () => {
      await expect(adapter.markUnread('msg-1')).rejects.toThrow(EmailError);
      await expect(adapter.markUnread('msg-1')).rejects.toThrow(
        'does not support marking',
      );
    });

    it('should throw error for move', async () => {
      await expect(adapter.move('msg-1', 'Sent')).rejects.toThrow(EmailError);
      await expect(adapter.move('msg-1', 'Sent')).rejects.toThrow(
        'does not support moving',
      );
    });

    it('should throw error for copy', async () => {
      await expect(adapter.copy('msg-1', 'Sent')).rejects.toThrow(EmailError);
      await expect(adapter.copy('msg-1', 'Sent')).rejects.toThrow(
        'does not support copying',
      );
    });

    it('should throw error for search', async () => {
      await expect(adapter.search({ from: 'test@example.com' })).rejects.toThrow(
        EmailError,
      );
      await expect(adapter.search({ from: 'test@example.com' })).rejects.toThrow(
        'does not support server-side search',
      );
    });
  });

  describe('Capabilities', () => {
    it('should return correct capabilities', async () => {
      const capabilities = await adapter.getCapabilities();

      expect(capabilities.send).toBe(false);
      expect(capabilities.receive).toBe(true);
      expect(capabilities.folders).toBe(false);
      expect(capabilities.search).toBe(false);
      expect(capabilities.markRead).toBe(false);
      expect(capabilities.move).toBe(false);
      expect(capabilities.delete).toBe(true);
      expect(capabilities.threads).toBe(false);
      expect(capabilities.oauth).toBe(false);
      expect(capabilities.encryption).toBe(false);
    });

    it('should return correct adapter type', () => {
      expect(adapter.getAdapter()).toBe('pop3');
    });
  });

  describe('Error Mapping', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should map timeout errors', async () => {
      mockClient.UIDL.mockRejectedValue(
        Object.assign(new Error('Operation timeout'), { eventName: 'timeout' }),
      );

      await expect(adapter.fetch()).rejects.toThrow(TimeoutError);
    });

    it('should map connection errors', async () => {
      mockClient.UIDL.mockRejectedValue(
        Object.assign(new Error('Connection lost'), { code: 'ECONNREFUSED' }),
      );

      await expect(adapter.fetch()).rejects.toThrow(ConnectionError);
    });

    it('should map authentication errors', async () => {
      mockClient.UIDL.mockRejectedValue(new Error('-ERR Authentication failed'));

      await expect(adapter.fetch()).rejects.toThrow(AuthenticationError);
    });

    it('should map generic errors', async () => {
      mockClient.UIDL.mockRejectedValue(new Error('Unknown error'));

      await expect(adapter.fetch()).rejects.toThrow(EmailError);
    });
  });
});
