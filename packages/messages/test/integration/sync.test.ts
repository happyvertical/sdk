/**
 * Integration tests for database synchronization
 *
 * Tests the sync functionality that stores emails in a database
 */

import type { Database } from '@happyvertical/sql';
import { getDatabase } from '@happyvertical/sql';
import { simpleParser } from 'mailparser';
import type { SMTPServerSession } from 'smtp-server';
import { SMTPServer } from 'smtp-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Mailbox } from '../../src/shared/base.js';
import { getMailbox } from '../../src/shared/factory.js';
import type { EmailMessage } from '../../src/shared/types.js';

describe('Database Sync Integration Tests', () => {
  let smtpServer: SMTPServer;
  let db: Database;
  const receivedMessages: Map<string, EmailMessage> = new Map();
  const SMTP_PORT = 2526;

  beforeAll(async () => {
    // Create in-memory database
    db = await getDatabase({ type: 'sqlite', url: ':memory:' });

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
            const parsed = await simpleParser(emailData);

            const message: EmailMessage = {
              id: parsed.messageId || `test-${Date.now()}`,
              messageId: parsed.messageId,
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
              attachments: (parsed.attachments || []).map((att) => ({
                filename: att.filename,
                contentType: att.contentType,
                size: att.size,
                content: att.content,
                contentId: att.cid,
              })),
            };

            receivedMessages.set(message.id || '', message);
            callback();
          } catch (error) {
            callback(error as Error);
          }
        });
      },
    });

    await new Promise<void>((resolve) => {
      smtpServer.listen(SMTP_PORT, '127.0.0.1', () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      smtpServer.close(() => resolve());
    });
  });

  beforeEach(() => {
    receivedMessages.clear();
  });

  describe('Basic Sync Operations', () => {
    it('should initialize database tables', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
        db,
      });

      // Check that tables were created
      const tables = await db.query(`
        SELECT name FROM sqlite_master
        WHERE type='table'
        AND name IN ('email_accounts', 'email_folders', 'email_messages', 'email_attachments')
        ORDER BY name
      `);

      expect(tables).toHaveLength(4);
      expect(tables.map((t) => t.name)).toEqual([
        'email_accounts',
        'email_attachments',
        'email_folders',
        'email_messages',
      ]);
    });

    it('should store sent messages in database', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
        db,
      });

      const message: EmailMessage = {
        from: { address: 'sender@test.com' },
        to: [{ address: 'recipient@test.com' }],
        subject: 'Database Sync Test',
        text: 'This message should be stored in database',
      };

      await smtp.send(message);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Query the database
      const messages = await db.select('email_messages', {
        where: { subject: 'Database Sync Test' },
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].from_address).toBe('sender@test.com');
      expect(messages[0].subject).toBe('Database Sync Test');
    });

    it('should store message metadata', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
        db,
      });

      const message: EmailMessage = {
        from: { address: 'sender@test.com', name: 'Test Sender' },
        to: [
          { address: 'recipient1@test.com', name: 'Recipient 1' },
          { address: 'recipient2@test.com', name: 'Recipient 2' },
        ],
        cc: [{ address: 'cc@test.com' }],
        subject: 'Metadata Test',
        text: 'Testing metadata storage',
        date: new Date('2024-01-15T10:30:00Z'),
      };

      await smtp.send(message);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const messages = await db.select('email_messages', {
        where: { subject: 'Metadata Test' },
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].from_name).toBe('Test Sender');

      // Check TO addresses (stored as JSON)
      const toAddresses = JSON.parse(messages[0].to_addresses);
      expect(toAddresses).toHaveLength(2);
      expect(toAddresses[0].address).toBe('recipient1@test.com');

      // Check CC addresses
      const ccAddresses = JSON.parse(messages[0].cc_addresses || '[]');
      expect(ccAddresses).toHaveLength(1);
      expect(ccAddresses[0].address).toBe('cc@test.com');
    });

    it('should store attachments separately', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
        db,
      });

      const message: EmailMessage = {
        from: { address: 'sender@test.com' },
        to: [{ address: 'recipient@test.com' }],
        subject: 'Attachment Storage Test',
        text: 'Message with attachments',
        attachments: [
          {
            filename: 'document.pdf',
            contentType: 'application/pdf',
            size: 1024,
            content: Buffer.from('PDF content'),
          },
          {
            filename: 'image.png',
            contentType: 'image/png',
            size: 2048,
            content: Buffer.from('PNG content'),
          },
        ],
      };

      await smtp.send(message);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get the message
      const messages = await db.select('email_messages', {
        where: { subject: 'Attachment Storage Test' },
      });

      expect(messages).toHaveLength(1);
      expect(messages[0].has_attachments).toBe(1);

      // Get attachments
      const attachments = await db.select('email_attachments', {
        where: { message_id: messages[0].id },
      });

      expect(attachments).toHaveLength(2);
      expect(attachments[0].filename).toBe('document.pdf');
      expect(attachments[0].content_type).toBe('application/pdf');
      expect(attachments[0].size).toBe(1024);
      expect(attachments[1].filename).toBe('image.png');
    });
  });

  describe('Query Operations', () => {
    it('should query messages by date range', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
        db,
      });

      // Send messages with different dates
      const dates = [
        new Date('2024-01-01T10:00:00Z'),
        new Date('2024-01-15T10:00:00Z'),
        new Date('2024-02-01T10:00:00Z'),
      ];

      for (const [i, date] of dates.entries()) {
        await smtp.send({
          from: { address: 'sender@test.com' },
          to: [{ address: 'recipient@test.com' }],
          subject: `Date Range Test ${i + 1}`,
          text: `Message ${i + 1}`,
          date,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Query messages in January
      const januaryMessages = await db.query(
        `
        SELECT * FROM email_messages
        WHERE date >= ? AND date < ?
        ORDER BY date
      `,
        ['2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z'],
      );

      expect(januaryMessages).toHaveLength(2);
    });

    it('should query unread messages', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
        db,
      });

      // Send a message
      await smtp.send({
        from: { address: 'sender@test.com' },
        to: [{ address: 'recipient@test.com' }],
        subject: 'Unread Test',
        text: 'Unread message',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Query unread messages (is_read = 0 by default)
      const unread = await db.select('email_messages', {
        where: { is_read: 0 },
      });

      expect(unread.length).toBeGreaterThan(0);

      // Mark as read
      await db.update(
        'email_messages',
        { is_read: 1 },
        { where: { subject: 'Unread Test' } },
      );

      // Query again
      const stillUnread = await db.select('email_messages', {
        where: { is_read: 0, subject: 'Unread Test' },
      });

      expect(stillUnread).toHaveLength(0);
    });

    it('should search messages by sender', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
        db,
      });

      // Send messages from different senders
      const senders = [
        'alice@test.com',
        'bob@test.com',
        'alice@test.com', // Duplicate sender
      ];

      for (const [i, sender] of senders.entries()) {
        await smtp.send({
          from: { address: sender },
          to: [{ address: 'recipient@test.com' }],
          subject: `Sender Test ${i + 1}`,
          text: `Message from ${sender}`,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Query messages from Alice
      const aliceMessages = await db.select('email_messages', {
        where: { from_address: 'alice@test.com' },
      });

      expect(aliceMessages.length).toBeGreaterThanOrEqual(2);
    });

    it('should count messages with attachments', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
        db,
      });

      // Send message with attachment
      await smtp.send({
        from: { address: 'sender@test.com' },
        to: [{ address: 'recipient@test.com' }],
        subject: 'Attachment Count Test',
        text: 'Message with attachment',
        attachments: [
          {
            filename: 'test.txt',
            contentType: 'text/plain',
            size: 100,
            content: Buffer.from('test'),
          },
        ],
      });

      // Send message without attachment
      await smtp.send({
        from: { address: 'sender@test.com' },
        to: [{ address: 'recipient@test.com' }],
        subject: 'No Attachment Test',
        text: 'Message without attachment',
      });

      await new Promise((resolve) => setTimeout(resolve, 200));

      // Count messages with attachments
      const result = await db.query(`
        SELECT COUNT(*) as count
        FROM email_messages
        WHERE has_attachments = 1
      `);

      expect(result[0].count).toBeGreaterThan(0);
    });
  });

  describe('Statistics', () => {
    it('should calculate message statistics', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
        db,
      });

      // Send multiple messages
      for (let i = 0; i < 5; i++) {
        await smtp.send({
          from: { address: 'sender@test.com' },
          to: [{ address: 'recipient@test.com' }],
          subject: `Stats Test ${i + 1}`,
          text: `Message ${i + 1}`,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      // Get statistics
      const stats = await db.query(`
        SELECT
          COUNT(*) as total_messages,
          COUNT(DISTINCT from_address) as unique_senders,
          SUM(has_attachments) as messages_with_attachments,
          SUM(is_read) as read_messages,
          AVG(size) as avg_size
        FROM email_messages
      `);

      expect(stats[0].total_messages).toBeGreaterThanOrEqual(5);
      expect(stats[0].unique_senders).toBeGreaterThan(0);
    });

    it('should track messages by date', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
        db,
      });

      await smtp.send({
        from: { address: 'sender@test.com' },
        to: [{ address: 'recipient@test.com' }],
        subject: 'Date Stats Test',
        text: 'Message for date stats',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get messages grouped by date
      const dateStats = await db.query(`
        SELECT
          DATE(date) as message_date,
          COUNT(*) as count
        FROM email_messages
        GROUP BY DATE(date)
        ORDER BY message_date DESC
      `);

      expect(dateStats.length).toBeGreaterThan(0);
    });
  });

  describe('Cleanup Operations', () => {
    it('should delete old messages', async () => {
      const smtp = await getMailbox({
        type: 'smtp',
        host: '127.0.0.1',
        port: SMTP_PORT,
        secure: false,
        db,
      });

      // Send a message with old date
      await smtp.send({
        from: { address: 'sender@test.com' },
        to: [{ address: 'recipient@test.com' }],
        subject: 'Old Message',
        text: 'This is an old message',
        date: new Date('2023-01-01T00:00:00Z'),
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Count messages before deletion
      const beforeCount = await db.query(
        'SELECT COUNT(*) as count FROM email_messages WHERE subject = ?',
        ['Old Message'],
      );

      expect(beforeCount[0].count).toBeGreaterThan(0);

      // Delete messages older than 2024
      await db.query(`DELETE FROM email_messages WHERE date < ?`, [
        '2024-01-01T00:00:00Z',
      ]);

      // Count after deletion
      const afterCount = await db.query(
        'SELECT COUNT(*) as count FROM email_messages WHERE subject = ?',
        ['Old Message'],
      );

      expect(afterCount[0].count).toBe(0);
    });
  });
});
