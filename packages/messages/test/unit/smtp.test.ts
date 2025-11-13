import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SMTPAdapter } from '../../src/adapters/smtp';
import {
  AuthenticationError,
  ConnectionError,
  EmailError,
  SendError,
  TimeoutError,
} from '../../src/shared/errors';
import type { EmailMessage, SMTPOptions } from '../../src/shared/types';

// Mock nodemailer
vi.mock('nodemailer', () => {
  const mockTransporter = {
    sendMail: vi.fn(),
    verify: vi.fn(),
    close: vi.fn(),
  };

  return {
    default: {
      createTransport: vi.fn(() => mockTransporter),
    },
  };
});

describe('SMTPAdapter', () => {
  let adapter: SMTPAdapter;
  let mockTransporter: {
    sendMail: ReturnType<typeof vi.fn>;
    verify: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get reference to the mock transporter
    const nodemailer = await import('nodemailer');
    const transport = nodemailer.default.createTransport({});
    mockTransporter = transport as never;

    // Reset mocks
    mockTransporter.sendMail.mockResolvedValue({
      messageId: '<test@example.com>',
      accepted: ['recipient@example.com'],
      rejected: [],
      response: '250 OK',
    });
    mockTransporter.verify.mockResolvedValue(true);
  });

  describe('Constructor', () => {
    it('should create SMTP adapter with basic auth', () => {
      const options: SMTPOptions = {
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'user@example.com',
          pass: 'password',
        },
      };

      adapter = new SMTPAdapter(options);

      expect(adapter).toBeInstanceOf(SMTPAdapter);
      expect(adapter.getAdapter()).toBe('smtp');
      expect(adapter.isConnected()).toBe(false);
    });

    it('should create SMTP adapter with OAuth2', () => {
      const options: SMTPOptions = {
        type: 'smtp',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          type: 'OAuth2',
          user: 'user@gmail.com',
          clientId: 'client-id',
          clientSecret: 'client-secret',
          refreshToken: 'refresh-token',
          accessToken: 'access-token',
        },
      };

      adapter = new SMTPAdapter(options);

      expect(adapter).toBeInstanceOf(SMTPAdapter);
      expect(adapter.getAdapter()).toBe('smtp');
    });

    it('should create adapter with connection pooling', () => {
      const options: SMTPOptions = {
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
      };

      adapter = new SMTPAdapter(options);

      expect(adapter).toBeInstanceOf(SMTPAdapter);
    });

    it('should create adapter with TLS options', () => {
      const options: SMTPOptions = {
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        tls: {
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2',
        },
      };

      adapter = new SMTPAdapter(options);

      expect(adapter).toBeInstanceOf(SMTPAdapter);
    });

    it('should create adapter with timeouts', () => {
      const options: SMTPOptions = {
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 10000,
      };

      adapter = new SMTPAdapter(options);

      expect(adapter).toBeInstanceOf(SMTPAdapter);
    });
  });

  describe('send', () => {
    beforeEach(() => {
      adapter = new SMTPAdapter({
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user@example.com', pass: 'password' },
      });
    });

    it('should send plain text email', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Email',
        text: 'This is a test email',
      };

      const result = await adapter.send(message);

      expect(result).toEqual({
        messageId: '<test@example.com>',
        accepted: ['recipient@example.com'],
        rejected: [],
        response: '250 OK',
      });

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'sender@example.com',
          to: ['recipient@example.com'],
          subject: 'Test Email',
          text: 'This is a test email',
        }),
      );
    });

    it('should send HTML email', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Email',
        html: '<h1>Test Email</h1><p>This is HTML</p>',
      };

      await adapter.send(message);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<h1>Test Email</h1><p>This is HTML</p>',
        }),
      );
    });

    it('should send email with both text and HTML', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Email',
        text: 'Plain text version',
        html: '<p>HTML version</p>',
      };

      await adapter.send(message);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Plain text version',
          html: '<p>HTML version</p>',
        }),
      );
    });

    it('should send email with attachments', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Email',
        text: 'Email with attachments',
        attachments: [
          {
            filename: 'document.pdf',
            content: Buffer.from('PDF content'),
            contentType: 'application/pdf',
            size: 11,
          },
          {
            filename: 'image.png',
            path: '/path/to/image.png',
            contentType: 'image/png',
            contentId: 'image001',
            contentDisposition: 'inline',
            size: 1024,
          },
        ],
      };

      await adapter.send(message);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            {
              filename: 'document.pdf',
              content: expect.any(Buffer),
              contentType: 'application/pdf',
              path: undefined,
              cid: undefined,
              contentDisposition: undefined,
            },
            {
              filename: 'image.png',
              path: '/path/to/image.png',
              contentType: 'image/png',
              cid: 'image001',
              contentDisposition: 'inline',
              content: undefined,
            },
          ],
        }),
      );
    });

    it('should send email with multiple recipients', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com', name: 'Sender Name' },
        to: [
          { address: 'recipient1@example.com', name: 'Recipient 1' },
          { address: 'recipient2@example.com' },
        ],
        cc: [{ address: 'cc@example.com', name: 'CC Person' }],
        bcc: [{ address: 'bcc@example.com' }],
        subject: 'Test Email',
        text: 'Email with multiple recipients',
      };

      await adapter.send(message);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Sender Name" <sender@example.com>',
          to: [
            '"Recipient 1" <recipient1@example.com>',
            'recipient2@example.com',
          ],
          cc: ['"CC Person" <cc@example.com>'],
          bcc: ['bcc@example.com'],
        }),
      );
    });

    it('should send email with replyTo', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        replyTo: { address: 'reply@example.com', name: 'Reply Address' },
        subject: 'Test Email',
        text: 'Email with reply-to',
      };

      await adapter.send(message);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: '"Reply Address" <reply@example.com>',
        }),
      );
    });

    it('should send email with custom headers', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Email',
        text: 'Email with custom headers',
        headers: {
          'X-Custom-Header': 'custom-value',
          'X-Priority': '1',
        },
      };

      await adapter.send(message);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'X-Custom-Header': 'custom-value',
            'X-Priority': '1',
          },
        }),
      );
    });

    it('should send email with message threading headers', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Re: Original Subject',
        text: 'Reply to message',
        inReplyTo: '<original@example.com>',
        references: ['<original@example.com>', '<previous@example.com>'],
      };

      await adapter.send(message);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: '<original@example.com>',
          references: ['<original@example.com>', '<previous@example.com>'],
        }),
      );
    });

    it('should send email with send options', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Email',
        text: 'Email with options',
      };

      await adapter.send(message, {
        priority: 'high',
        encoding: 'utf-8',
        textEncoding: 'base64',
        envelope: {
          from: 'envelope-from@example.com',
          to: 'envelope-to@example.com',
        },
      });

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          priority: 'high',
          encoding: 'utf-8',
          textEncoding: 'base64',
          envelope: {
            from: 'envelope-from@example.com',
            to: 'envelope-to@example.com',
          },
        }),
      );
    });

    it('should handle names with quotes correctly', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com', name: 'Name with "quotes"' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Email',
        text: 'Test',
      };

      await adapter.send(message);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Name with \\"quotes\\"" <sender@example.com>',
        }),
      );
    });

    it('should reject message without from address', async () => {
      const message = {
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Email',
        text: 'Test',
      } as EmailMessage;

      await expect(adapter.send(message)).rejects.toThrow(
        'Message must have a sender (from)',
      );
    });

    it('should reject message without to recipients', async () => {
      const message = {
        from: { address: 'sender@example.com' },
        to: [],
        subject: 'Test Email',
        text: 'Test',
      } as EmailMessage;

      await expect(adapter.send(message)).rejects.toThrow(
        'Message must have at least one recipient (to)',
      );
    });

    it('should reject message without subject', async () => {
      const message = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: '',
        text: 'Test',
      } as EmailMessage;

      await expect(adapter.send(message)).rejects.toThrow(
        'Message must have a subject',
      );
    });

    it('should reject message without content', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test Email',
      };

      await expect(adapter.send(message)).rejects.toThrow(
        'Message must have either text or HTML content',
      );
    });

    it('should handle partial send failures', async () => {
      // Mock a server-side rejection after passing validation
      const sendError = new Error('Some recipients were rejected by server');
      Object.assign(sendError, {
        accepted: ['recipient1@example.com'],
        rejected: ['blocked@example.com'],
      });
      mockTransporter.sendMail.mockRejectedValue(sendError);

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [
          { address: 'recipient1@example.com' },
          { address: 'blocked@example.com' }, // Valid format but rejected by server
        ],
        subject: 'Test Email',
        text: 'Test',
      };

      await expect(adapter.send(message)).rejects.toThrow(SendError);
    });
  });

  describe('Error Mapping', () => {
    beforeEach(() => {
      adapter = new SMTPAdapter({
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user@example.com', pass: 'password' },
      });
    });

    it('should map authentication errors', async () => {
      mockTransporter.sendMail.mockRejectedValue(
        new Error('535 Authentication failed'),
      );

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Test',
      };

      await expect(adapter.send(message)).rejects.toThrow(AuthenticationError);
    });

    it('should map connection errors', async () => {
      mockTransporter.sendMail.mockRejectedValue(
        new Error('ECONNREFUSED: Connection refused'),
      );

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Test',
      };

      await expect(adapter.send(message)).rejects.toThrow(ConnectionError);
    });

    it('should map timeout errors', async () => {
      mockTransporter.sendMail.mockRejectedValue(
        new Error('ETIMEDOUT: Connection timeout'),
      );

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Test',
      };

      await expect(adapter.send(message)).rejects.toThrow(TimeoutError);
    });

    it('should map ENOTFOUND errors to connection error', async () => {
      mockTransporter.sendMail.mockRejectedValue(
        new Error('ENOTFOUND: getaddrinfo failed'),
      );

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Test',
      };

      await expect(adapter.send(message)).rejects.toThrow(ConnectionError);
    });

    it('should wrap unknown errors', async () => {
      mockTransporter.sendMail.mockRejectedValue(
        new Error('Unknown SMTP error'),
      );

      const message: EmailMessage = {
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Test',
      };

      await expect(adapter.send(message)).rejects.toThrow(EmailError);
    });
  });

  describe('Connection Management', () => {
    beforeEach(() => {
      adapter = new SMTPAdapter({
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user@example.com', pass: 'password' },
      });
    });

    it('should connect successfully', async () => {
      expect(adapter.isConnected()).toBe(false);

      await adapter.connect();

      expect(adapter.isConnected()).toBe(true);
      expect(mockTransporter.verify).toHaveBeenCalled();
    });

    it('should handle connection failures', async () => {
      mockTransporter.verify.mockRejectedValue(new Error('Connection failed'));

      await expect(adapter.connect()).rejects.toThrow(EmailError);
      expect(adapter.isConnected()).toBe(false);
    });

    it('should disconnect', async () => {
      await adapter.connect();
      expect(adapter.isConnected()).toBe(true);

      await adapter.disconnect();

      expect(adapter.isConnected()).toBe(false);
      expect(mockTransporter.close).toHaveBeenCalled();
    });
  });

  describe('Capabilities', () => {
    it('should report capabilities for basic auth', async () => {
      adapter = new SMTPAdapter({
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user@example.com', pass: 'password' },
      });

      const capabilities = await adapter.getCapabilities();

      expect(capabilities).toEqual({
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
      });
    });

    it('should report OAuth2 capability', async () => {
      adapter = new SMTPAdapter({
        type: 'smtp',
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          type: 'OAuth2',
          user: 'user@gmail.com',
          clientId: 'client-id',
          clientSecret: 'client-secret',
          refreshToken: 'refresh-token',
        },
      });

      const capabilities = await adapter.getCapabilities();

      expect(capabilities.oauth).toBe(true);
    });
  });

  describe('Unsupported Operations', () => {
    beforeEach(() => {
      adapter = new SMTPAdapter({
        type: 'smtp',
        host: 'smtp.example.com',
        port: 587,
        auth: { user: 'user@example.com', pass: 'password' },
      });
    });

    it('should throw error for fetch', async () => {
      await expect(adapter.fetch()).rejects.toThrow(
        'SMTP does not support receiving messages',
      );
    });

    it('should throw error for getMessage', async () => {
      await expect(adapter.getMessage('msg-123')).rejects.toThrow(
        'SMTP does not support receiving messages',
      );
    });

    it('should throw error for listFolders', async () => {
      await expect(adapter.listFolders()).rejects.toThrow(
        'SMTP does not support folder operations',
      );
    });

    it('should throw error for selectFolder', async () => {
      await expect(adapter.selectFolder('INBOX')).rejects.toThrow(
        'SMTP does not support folder operations',
      );
    });

    it('should throw error for createFolder', async () => {
      await expect(adapter.createFolder('Archive')).rejects.toThrow(
        'SMTP does not support folder operations',
      );
    });

    it('should throw error for deleteFolder', async () => {
      await expect(adapter.deleteFolder('Archive')).rejects.toThrow(
        'SMTP does not support folder operations',
      );
    });

    it('should throw error for markRead', async () => {
      await expect(adapter.markRead('msg-123')).rejects.toThrow(
        'SMTP does not support message operations',
      );
    });

    it('should throw error for markUnread', async () => {
      await expect(adapter.markUnread('msg-123')).rejects.toThrow(
        'SMTP does not support message operations',
      );
    });

    it('should throw error for move', async () => {
      await expect(adapter.move('msg-123', 'Archive')).rejects.toThrow(
        'SMTP does not support message operations',
      );
    });

    it('should throw error for copy', async () => {
      await expect(adapter.copy('msg-123', 'Archive')).rejects.toThrow(
        'SMTP does not support message operations',
      );
    });

    it('should throw error for delete', async () => {
      await expect(adapter.delete('msg-123')).rejects.toThrow(
        'SMTP does not support message operations',
      );
    });

    it('should throw error for search', async () => {
      await expect(
        adapter.search({ from: 'test@example.com' }),
      ).rejects.toThrow('SMTP does not support search operations');
    });
  });
});
