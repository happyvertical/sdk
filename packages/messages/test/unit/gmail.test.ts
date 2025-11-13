/**
 * Tests for Gmail adapter
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GmailAdapter } from '../../src/adapters/gmail';
import type { GmailOptions } from '../../src/shared/types';
import {
  AuthenticationError,
  ConnectionError,
  EmailError,
  FolderExistsError,
  FolderNotFoundError,
  MessageNotFoundError,
  TimeoutError,
} from '../../src/shared/errors';

// Mock googleapis
vi.mock('googleapis', () => {
  const mockSetCredentials = vi.fn();

  class MockOAuth2 {
    setCredentials = mockSetCredentials;
  }

  const mockGmail = {
    users: {
      getProfile: vi.fn(),
      messages: {
        list: vi.fn(),
        get: vi.fn(),
        send: vi.fn(),
        modify: vi.fn(),
        trash: vi.fn(),
      },
      labels: {
        list: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      },
    },
  };

  return {
    google: {
      auth: {
        OAuth2: MockOAuth2,
      },
      gmail: vi.fn(() => mockGmail),
    },
    // Export mocks for test access
    __mockGmail: mockGmail,
    __mockSetCredentials: mockSetCredentials,
  };
});

// Get mock references
const { __mockGmail: mockGmail, __mockSetCredentials: mockSetCredentials } =
  await import('googleapis');

// Mock mailparser
vi.mock('mailparser', () => ({
  simpleParser: vi.fn(async (data: string) => ({
    messageId: '<test@example.com>',
    from: {
      value: [{ address: 'sender@example.com', name: 'Sender' }],
    },
    to: {
      value: [{ address: 'recipient@example.com', name: 'Recipient' }],
    },
    subject: 'Test Subject',
    date: new Date('2024-01-01T12:00:00Z'),
    text: 'Test body',
    html: '<p>Test body</p>',
    headers: new Map(),
    attachments: [],
  })),
}));

describe('GmailAdapter', () => {
  let adapter: GmailAdapter;
  let options: GmailOptions;

  beforeEach(() => {
    options = {
      type: 'gmail',
      auth: {
        clientId: 'client-id',
        clientSecret: 'client-secret',
        refreshToken: 'refresh-token',
        accessToken: 'access-token',
      },
    };

    adapter = new GmailAdapter(options);

    // Reset mocks
    vi.clearAllMocks();
    mockGmail.users.getProfile.mockResolvedValue({
      data: { emailAddress: 'user@gmail.com' },
    });
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  describe('Connection', () => {
    it('should connect successfully', async () => {
      await adapter.connect();

      expect(mockSetCredentials).toHaveBeenCalledWith({
        refresh_token: 'refresh-token',
        access_token: 'access-token',
      });
      expect(mockGmail.users.getProfile).toHaveBeenCalledWith({
        userId: 'me',
      });
      expect(adapter.isConnected()).toBe(true);
    });

    it('should disconnect successfully', async () => {
      await adapter.connect();
      await adapter.disconnect();

      expect(adapter.isConnected()).toBe(false);
    });

    it('should handle authentication failure', async () => {
      mockGmail.users.getProfile.mockRejectedValue(
        Object.assign(new Error('Invalid credentials'), { code: 401 }),
      );

      await expect(adapter.connect()).rejects.toThrow(AuthenticationError);
    });

    it('should handle connection timeout', async () => {
      mockGmail.users.getProfile.mockRejectedValue(
        Object.assign(new Error('Network timeout'), { code: 'ETIMEDOUT' }),
      );

      await expect(adapter.connect()).rejects.toThrow(TimeoutError);
    });

    it('should handle network errors', async () => {
      mockGmail.users.getProfile.mockRejectedValue(
        Object.assign(new Error('Network error'), { code: 'ECONNREFUSED' }),
      );

      await expect(adapter.connect()).rejects.toThrow(ConnectionError);
    });
  });

  describe('Send Messages', () => {
    beforeEach(async () => {
      await adapter.connect();

      mockGmail.users.messages.send.mockResolvedValue({
        data: { id: 'sent-message-id' },
      });
    });

    it('should send plain text email', async () => {
      const result = await adapter.send({
        from: { address: 'sender@gmail.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Test body',
      });

      expect(result.messageId).toBe('sent-message-id');
      expect(result.accepted).toEqual(['recipient@example.com']);
      expect(mockGmail.users.messages.send).toHaveBeenCalled();
    });

    it('should send HTML email', async () => {
      const result = await adapter.send({
        from: { address: 'sender@gmail.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Plain text',
        html: '<p>HTML body</p>',
      });

      expect(result.messageId).toBe('sent-message-id');
      expect(mockGmail.users.messages.send).toHaveBeenCalled();
    });

    it('should send to multiple recipients', async () => {
      const result = await adapter.send({
        from: { address: 'sender@gmail.com' },
        to: [
          { address: 'recipient1@example.com' },
          { address: 'recipient2@example.com' },
        ],
        cc: [{ address: 'cc@example.com' }],
        subject: 'Test',
        text: 'Body',
      });

      expect(result.accepted).toHaveLength(2);
    });

    it('should throw error if not connected', async () => {
      await adapter.disconnect();

      await expect(
        adapter.send({
          from: { address: 'sender@gmail.com' },
          to: [{ address: 'recipient@example.com' }],
          subject: 'Test',
          text: 'Body',
        }),
      ).rejects.toThrow(ConnectionError);
    });
  });

  describe('Fetch Messages', () => {
    beforeEach(async () => {
      await adapter.connect();

      mockGmail.users.messages.list.mockResolvedValue({
        data: {
          messages: [{ id: 'msg-1' }, { id: 'msg-2' }, { id: 'msg-3' }],
        },
      });

      mockGmail.users.messages.get.mockResolvedValue({
        data: {
          id: 'msg-1',
          threadId: 'thread-1',
          labelIds: ['INBOX', 'UNREAD'],
          raw: Buffer.from(
            'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nBody',
          ).toString('base64'),
          sizeEstimate: 1024,
        },
      });
    });

    it('should fetch messages', async () => {
      const messages = await adapter.fetch();

      expect(messages).toHaveLength(3);
      expect(mockGmail.users.messages.list).toHaveBeenCalled();
      expect(mockGmail.users.messages.get).toHaveBeenCalledTimes(3);
    });

    it('should fetch with limit', async () => {
      const messages = await adapter.fetch({ limit: 2 });

      expect(messages).toHaveLength(2);
    });

    it('should fetch with Gmail query', async () => {
      await adapter.fetch({ q: 'from:test@example.com' });

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'from:test@example.com',
        }),
      );
    });

    it('should fetch with label IDs', async () => {
      await adapter.fetch({ labelIds: ['INBOX', 'IMPORTANT'] });

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          labelIds: ['INBOX', 'IMPORTANT'],
        }),
      );
    });

    it('should fetch with date filters', async () => {
      await adapter.fetch({
        since: new Date('2024-01-01'),
        before: new Date('2024-02-01'),
      });

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: expect.stringContaining('after:'),
        }),
      );
    });

    it('should fetch unread only', async () => {
      await adapter.fetch({ unreadOnly: true });

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'is:unread',
        }),
      );
    });

    it('should return empty array if no messages', async () => {
      mockGmail.users.messages.list.mockResolvedValue({ data: {} });

      const messages = await adapter.fetch();

      expect(messages).toHaveLength(0);
    });
  });

  describe('Get Message', () => {
    beforeEach(async () => {
      await adapter.connect();

      mockGmail.users.messages.get.mockResolvedValue({
        data: {
          id: 'msg-1',
          threadId: 'thread-1',
          labelIds: ['INBOX'],
          raw: Buffer.from(
            'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nBody',
          ).toString('base64'),
          sizeEstimate: 1024,
        },
      });
    });

    it('should get message by ID', async () => {
      const message = await adapter.getMessage('msg-1');

      expect(message.id).toBe('msg-1');
      expect(message.threadId).toBe('thread-1');
      expect(message.labels).toEqual(['INBOX']);
      expect(mockGmail.users.messages.get).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg-1',
        format: 'raw',
      });
    });

    it('should throw MessageNotFoundError for missing raw data', async () => {
      mockGmail.users.messages.get.mockResolvedValue({
        data: { id: 'msg-1' },
      });

      await expect(adapter.getMessage('msg-1')).rejects.toThrow(
        MessageNotFoundError,
      );
    });
  });

  describe('Label Operations', () => {
    beforeEach(async () => {
      await adapter.connect();

      mockGmail.users.labels.list.mockResolvedValue({
        data: {
          labels: [
            {
              id: 'INBOX',
              name: 'INBOX',
              type: 'system',
              messagesTotal: 100,
              messagesUnread: 5,
            },
            {
              id: 'label-1',
              name: 'Custom Label',
              type: 'user',
              messagesTotal: 10,
              messagesUnread: 2,
            },
          ],
        },
      });
    });

    it('should list labels', async () => {
      const labels = await adapter.listFolders();

      expect(labels).toHaveLength(2);
      expect(labels[0].name).toBe('INBOX');
      expect(labels[0].messageCount).toBe(100);
      expect(labels[0].unreadCount).toBe(5);
    });

    it('should select label', async () => {
      const info = await adapter.selectFolder('INBOX');

      expect(info.name).toBe('INBOX');
      expect(info.exists).toBe(100);
      expect(info.unseen).toBe(5);
    });

    it('should throw FolderNotFoundError for missing label', async () => {
      await expect(adapter.selectFolder('Nonexistent')).rejects.toThrow(
        FolderNotFoundError,
      );
    });

    it('should create label', async () => {
      mockGmail.users.labels.create.mockResolvedValue({
        data: { id: 'new-label', name: 'New Label' },
      });

      await adapter.createFolder('New Label');

      expect(mockGmail.users.labels.create).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          name: 'New Label',
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });
    });

    it('should throw FolderExistsError for duplicate label', async () => {
      await expect(adapter.createFolder('INBOX')).rejects.toThrow(
        FolderExistsError,
      );
    });

    it('should delete label', async () => {
      await adapter.deleteFolder('Custom Label');

      expect(mockGmail.users.labels.delete).toHaveBeenCalledWith({
        userId: 'me',
        id: 'label-1',
      });
    });

    it('should throw error when deleting system label', async () => {
      await expect(adapter.deleteFolder('INBOX')).rejects.toThrow(EmailError);
    });
  });

  describe('Message Operations', () => {
    beforeEach(async () => {
      await adapter.connect();

      mockGmail.users.messages.modify.mockResolvedValue({
        data: { id: 'msg-1' },
      });
      mockGmail.users.messages.trash.mockResolvedValue({
        data: { id: 'msg-1' },
      });
    });

    it('should mark message as read', async () => {
      await adapter.markRead('msg-1');

      expect(mockGmail.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg-1',
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
    });

    it('should mark multiple messages as read', async () => {
      await adapter.markRead(['msg-1', 'msg-2']);

      expect(mockGmail.users.messages.modify).toHaveBeenCalledTimes(2);
    });

    it('should mark message as unread', async () => {
      await adapter.markUnread('msg-1');

      expect(mockGmail.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg-1',
        requestBody: {
          addLabelIds: ['UNREAD'],
        },
      });
    });

    it('should move message to label', async () => {
      mockGmail.users.labels.list.mockResolvedValue({
        data: {
          labels: [{ id: 'label-1', name: 'Archive', type: 'user' }],
        },
      });

      await adapter.move('msg-1', 'Archive');

      expect(mockGmail.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg-1',
        requestBody: {
          addLabelIds: ['label-1'],
        },
      });
    });

    it('should copy message (same as move for Gmail)', async () => {
      mockGmail.users.labels.list.mockResolvedValue({
        data: {
          labels: [{ id: 'label-1', name: 'Archive', type: 'user' }],
        },
      });

      await adapter.copy('msg-1', 'Archive');

      expect(mockGmail.users.messages.modify).toHaveBeenCalled();
    });

    it('should delete message (move to trash)', async () => {
      await adapter.delete('msg-1');

      expect(mockGmail.users.messages.trash).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg-1',
      });
    });

    it('should delete multiple messages', async () => {
      await adapter.delete(['msg-1', 'msg-2']);

      expect(mockGmail.users.messages.trash).toHaveBeenCalledTimes(2);
    });
  });

  describe('Search', () => {
    beforeEach(async () => {
      await adapter.connect();

      mockGmail.users.messages.list.mockResolvedValue({
        data: {
          messages: [{ id: 'msg-1' }],
        },
      });

      mockGmail.users.messages.get.mockResolvedValue({
        data: {
          id: 'msg-1',
          threadId: 'thread-1',
          labelIds: ['INBOX'],
          raw: Buffer.from(
            'From: sender@example.com\r\nTo: recipient@example.com\r\nSubject: Test\r\n\r\nBody',
          ).toString('base64'),
          sizeEstimate: 1024,
        },
      });
    });

    it('should search with Gmail query', async () => {
      await adapter.search({ q: 'from:test@example.com' });

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'from:test@example.com',
        }),
      );
    });

    it('should search by sender', async () => {
      await adapter.search({ from: 'sender@example.com' });

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'from:sender@example.com',
        }),
      );
    });

    it('should search by recipient', async () => {
      await adapter.search({ to: 'recipient@example.com' });

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'to:recipient@example.com',
        }),
      );
    });

    it('should search by subject', async () => {
      await adapter.search({ subject: 'important' });

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'subject:important',
        }),
      );
    });

    it('should search by date range', async () => {
      await adapter.search({
        since: new Date('2024-01-01'),
        before: new Date('2024-02-01'),
      });

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: expect.stringMatching(/after:\d{4}\/\d{2}\/\d{2} before:\d{4}\/\d{2}\/\d{2}/),
        }),
      );
    });

    it('should search for unread messages', async () => {
      await adapter.search({ unread: true });

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'is:unread',
        }),
      );
    });

    it('should search for flagged messages', async () => {
      await adapter.search({ flagged: true });

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: 'is:starred',
        }),
      );
    });

    it('should search by size', async () => {
      await adapter.search({ larger: 1000000, smaller: 5000000 });

      expect(mockGmail.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: expect.stringMatching(/larger:\d+ smaller:\d+/),
        }),
      );
    });
  });

  describe('Capabilities', () => {
    it('should return correct capabilities', async () => {
      const capabilities = await adapter.getCapabilities();

      expect(capabilities.send).toBe(true);
      expect(capabilities.receive).toBe(true);
      expect(capabilities.folders).toBe(true);
      expect(capabilities.search).toBe(true);
      expect(capabilities.markRead).toBe(true);
      expect(capabilities.move).toBe(true);
      expect(capabilities.delete).toBe(true);
      expect(capabilities.threads).toBe(true);
      expect(capabilities.oauth).toBe(true);
      expect(capabilities.encryption).toBe(false);
    });

    it('should return correct adapter type', () => {
      expect(adapter.getAdapter()).toBe('gmail');
    });
  });

  describe('Error Mapping', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should map timeout errors', async () => {
      mockGmail.users.messages.list.mockRejectedValue(
        Object.assign(new Error('Operation timeout'), { code: 'ETIMEDOUT' }),
      );

      await expect(adapter.fetch()).rejects.toThrow(TimeoutError);
    });

    it('should map connection errors', async () => {
      mockGmail.users.messages.list.mockRejectedValue(
        Object.assign(new Error('Network error'), { code: 'ECONNREFUSED' }),
      );

      await expect(adapter.fetch()).rejects.toThrow(ConnectionError);
    });

    it('should map authentication errors', async () => {
      mockGmail.users.messages.list.mockRejectedValue(
        Object.assign(new Error('Invalid grant'), { code: 401 }),
      );

      await expect(adapter.fetch()).rejects.toThrow(AuthenticationError);
    });

    it('should map generic errors', async () => {
      mockGmail.users.messages.list.mockRejectedValue(
        new Error('Unknown error'),
      );

      await expect(adapter.fetch()).rejects.toThrow(EmailError);
    });
  });
});
