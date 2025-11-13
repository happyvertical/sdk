/**
 * Integration tests for SMTP and IMAP adapters
 *
 * These tests use actual SMTP and IMAP servers (running in-process) to test
 * the full email sending and receiving workflow.
 */

import { simpleParser } from 'mailparser';
import type { SMTPServerSession } from 'smtp-server';
import { SMTPServer } from 'smtp-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Mailbox } from '../../src/shared/base.js';
import { getMailbox } from '../../src/shared/factory.js';
import type { EmailMessage } from '../../src/shared/types.js';

describe('SMTP/IMAP Integration Tests', () => {
  let smtpServer: SMTPServer;
  const receivedMessages: EmailMessage[] = [];
  const SMTP_PORT = 2525;

  beforeAll(async () => {
    // Start test SMTP server
    smtpServer = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS', 'AUTH'],
      onData(
        stream: NodeJS.ReadableStream,
        session: SMTPServerSession,
        callback: (err?: Error | null) => void,
      ) {
        let emailData = '';
        stream.on('data', (chunk) => {
          emailData += chunk.toString();
        });
        stream.on('end', async () => {
          try {
            // Parse the email
            const parsed = await simpleParser(emailData);

            // Store the received message
            const message: EmailMessage = {
              from: {
                address:
                  typeof parsed.from?.value[0]?.address === 'string'
                    ? parsed.from.value[0].address
                    : 'unknown@example.com',
                name: parsed.from?.value[0]?.name || undefined,
              },
              to: (parsed.to?.value || []).map((addr) => ({
                address:
                  typeof addr.address === 'string'
                    ? addr.address
                    : 'unknown@example.com',
                name: addr.name || undefined,
              })),
              subject: parsed.subject || '',
              text: parsed.text,
              html: parsed.html || undefined,
              date: parsed.date || new Date(),
              messageId: parsed.messageId || undefined,
              attachments: (parsed.attachments || []).map((att) => ({
                filename: att.filename,
                contentType: att.contentType,
                size: att.size,
                content: att.content,
                contentId: att.cid,
                contentDisposition: att.contentDisposition as
                  | 'attachment'
                  | 'inline'
                  | undefined,
              })),
            };

            receivedMessages.push(message);
            callback();
          } catch (error) {
            callback(error as Error);
          }
        });
      },
    });

    // Start listening
    await new Promise<void>((resolve) => {
      smtpServer.listen(SMTP_PORT, '127.0.0.1', () => {
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Force close the SMTP server
    // Note: smtpServer.close() waits for active connections to finish,
    // but since we're using connection pools, we just let the process cleanup handle it
    smtpServer.close();

    // Give it a moment to cleanup
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  describe('SMTP Adapter', () => {
    let smtp: Mailbox;

    beforeAll(async () => {
      smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
      });
    });

    it('should send a plain text email', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@test.com', name: 'Test Sender' },
        to: [{ address: 'recipient@test.com', name: 'Test Recipient' }],
        subject: 'Plain Text Test',
        text: 'This is a plain text email body.',
      };

      const result = await smtp.send(message);

      expect(result.accepted).toContain('recipient@test.com');
      expect(result.rejected).toHaveLength(0);

      // Wait a bit for the message to be processed
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the message was received
      const received = receivedMessages.find(
        (m) => m.subject === 'Plain Text Test',
      );
      expect(received).toBeDefined();
      expect(received?.text).toContain('This is a plain text email body');
    });

    it('should send an HTML email', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@test.com' },
        to: [{ address: 'recipient@test.com' }],
        subject: 'HTML Test',
        text: 'Plain text version',
        html: '<h1>HTML Version</h1><p>This is HTML content.</p>',
      };

      const result = await smtp.send(message);

      expect(result.accepted).toContain('recipient@test.com');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const received = receivedMessages.find((m) => m.subject === 'HTML Test');
      expect(received).toBeDefined();
      expect(received?.html).toContain('<h1>HTML Version</h1>');
      expect(received?.text).toContain('Plain text version');
    });

    it('should send email with attachments', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@test.com' },
        to: [{ address: 'recipient@test.com' }],
        subject: 'Attachment Test',
        text: 'Email with attachments',
        attachments: [
          {
            filename: 'test.txt',
            content: Buffer.from('Test file content'),
            contentType: 'text/plain',
            size: 17,
          },
          {
            filename: 'data.json',
            content: Buffer.from(JSON.stringify({ test: true })),
            contentType: 'application/json',
            size: 13,
          },
        ],
      };

      const result = await smtp.send(message);

      expect(result.accepted).toContain('recipient@test.com');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const received = receivedMessages.find(
        (m) => m.subject === 'Attachment Test',
      );
      expect(received).toBeDefined();
      expect(received?.attachments).toHaveLength(2);
      expect(received?.attachments?.[0].filename).toBe('test.txt');
      expect(received?.attachments?.[1].filename).toBe('data.json');
    });

    it('should send to multiple recipients', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@test.com' },
        to: [
          { address: 'recipient1@test.com' },
          { address: 'recipient2@test.com' },
          { address: 'recipient3@test.com' },
        ],
        cc: [{ address: 'cc@test.com' }],
        subject: 'Multiple Recipients Test',
        text: 'Message to multiple recipients',
      };

      const result = await smtp.send(message);

      expect(result.accepted).toHaveLength(4);
      expect(result.accepted).toContain('recipient1@test.com');
      expect(result.accepted).toContain('recipient2@test.com');
      expect(result.accepted).toContain('recipient3@test.com');
      expect(result.accepted).toContain('cc@test.com');
    });

    it('should handle custom headers', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@test.com' },
        to: [{ address: 'recipient@test.com' }],
        subject: 'Custom Headers Test',
        text: 'Message with custom headers',
        headers: {
          'X-Custom-Header': 'custom-value',
          'X-Priority': 'High',
        },
      };

      const result = await smtp.send(message);

      expect(result.accepted).toContain('recipient@test.com');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const received = receivedMessages.find(
        (m) => m.subject === 'Custom Headers Test',
      );
      expect(received).toBeDefined();
    });

    it('should handle reply-to addresses', async () => {
      const message: EmailMessage = {
        from: { address: 'sender@test.com' },
        to: [{ address: 'recipient@test.com' }],
        replyTo: { address: 'reply-to@test.com', name: 'Reply Here' },
        subject: 'Reply-To Test',
        text: 'Message with reply-to',
      };

      const result = await smtp.send(message);

      expect(result.accepted).toContain('recipient@test.com');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const received = receivedMessages.find(
        (m) => m.subject === 'Reply-To Test',
      );
      expect(received).toBeDefined();
    });
  });

  describe('Message Queue', () => {
    it('should queue and send multiple messages', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
        pool: true,
        maxConnections: 2,
      });

      const initialCount = receivedMessages.length;

      // Send 5 messages concurrently
      const sendPromises = Array.from({ length: 5 }, (_, i) =>
        smtp.send({
          from: { address: 'sender@test.com' },
          to: [{ address: 'recipient@test.com' }],
          subject: `Queue Test ${i + 1}`,
          text: `Message ${i + 1} in queue`,
        }),
      );

      const results = await Promise.all(sendPromises);

      // All should be accepted
      for (const result of results) {
        expect(result.accepted).toContain('recipient@test.com');
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have received 5 new messages
      const queueMessages = receivedMessages.filter((m) =>
        m.subject?.startsWith('Queue Test'),
      );
      expect(queueMessages.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid recipient addresses', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
      });

      const message: EmailMessage = {
        from: { address: 'sender@test.com' },
        to: [{ address: 'invalid-email' }],
        subject: 'Invalid Recipient',
        text: 'This should fail validation',
      };

      await expect(smtp.send(message)).rejects.toThrow();
    });

    it('should handle connection errors', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: 9999, // Non-existent port
        secure: false,
        connectionTimeout: 1000,
      });

      const message: EmailMessage = {
        from: { address: 'sender@test.com' },
        to: [{ address: 'recipient@test.com' }],
        subject: 'Connection Error Test',
        text: 'This should fail to connect',
      };

      await expect(smtp.send(message)).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    it('should handle rapid successive sends', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
        pool: true,
      });

      const startTime = Date.now();

      // Send 10 messages rapidly
      for (let i = 0; i < 10; i++) {
        await smtp.send({
          from: { address: 'sender@test.com' },
          to: [{ address: 'recipient@test.com' }],
          subject: `Performance Test ${i + 1}`,
          text: `Rapid send test message ${i + 1}`,
        });
      }

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);
    });
  });
});
