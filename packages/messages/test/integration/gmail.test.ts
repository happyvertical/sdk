import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getMailbox } from '../../src/index.js';
import type { EmailMessage, Mailbox } from '../../src/shared/types.js';

// Gmail OAuth2 credentials from environment
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

// Skip tests if credentials not provided
const hasCredentials =
  GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN;

describe.skipIf(!hasCredentials)('Gmail Integration Tests', () => {
  let mailbox: Mailbox;

  beforeAll(async () => {
    if (!hasCredentials) return;

    mailbox = await getMailbox({
      type: 'gmail',
      auth: {
        clientId: GMAIL_CLIENT_ID!,
        clientSecret: GMAIL_CLIENT_SECRET!,
        refreshToken: GMAIL_REFRESH_TOKEN!,
      },
    });

    await mailbox.connect();
  }, 30000); // Allow 30s for authentication

  afterAll(async () => {
    if (mailbox) {
      await mailbox.disconnect();
    }
  });

  describe('Connection Management', () => {
    it('should successfully connect and authenticate', async () => {
      expect(mailbox.isConnected()).toBe(true);
    });

    it('should handle reconnection', async () => {
      await mailbox.disconnect();
      expect(mailbox.isConnected()).toBe(false);

      await mailbox.connect();
      expect(mailbox.isConnected()).toBe(true);
    });
  });

  describe('Folder Operations', () => {
    it('should list folders', async () => {
      const folders = await mailbox.listFolders();

      expect(folders).toBeDefined();
      expect(Array.isArray(folders)).toBe(true);
      expect(folders.length).toBeGreaterThan(0);

      // Gmail should have standard labels
      const folderNames = folders.map((f) => f.name.toLowerCase());
      expect(folderNames).toContain('inbox');
    });

    it('should select folder by name', async () => {
      const inbox = await mailbox.selectFolder('INBOX');

      expect(inbox).toBeDefined();
      expect(inbox.name).toBeDefined();
      expect(inbox.exists).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Message Retrieval', () => {
    it('should fetch messages from INBOX', async () => {
      const messages = await mailbox.fetch({ folder: 'INBOX', limit: 10 });

      expect(messages).toBeDefined();
      expect(Array.isArray(messages)).toBe(true);

      // If there are messages, validate structure
      if (messages.length > 0) {
        const message = messages[0];
        expect(message.id).toBeDefined();
        expect(message.messageId).toBeDefined();
        expect(message.subject).toBeDefined();
        expect(message.from).toBeDefined();
      }
    }, 30000); // Allow 30s for message retrieval

    it('should get full message details', async () => {
      const messages = await mailbox.fetch({ folder: 'INBOX', limit: 1 });

      if (messages.length === 0) {
        console.log('No messages in INBOX, skipping full message test');
        return;
      }

      const fullMessage = await mailbox.getMessage(messages[0].id!);

      expect(fullMessage).toBeDefined();
      expect(fullMessage.id).toBe(messages[0].id);
      expect(fullMessage.messageId).toBeDefined();
      expect(fullMessage.subject).toBeDefined();
      expect(fullMessage.from).toBeDefined();
      expect(fullMessage.to).toBeDefined();
      expect(fullMessage.date).toBeInstanceOf(Date);

      // At least one of html or text should be present
      expect(fullMessage.html || fullMessage.text).toBeDefined();
    }, 30000);

    it('should handle message with attachments', async () => {
      // Search for messages with attachments
      const messages = await mailbox.search({
        q: 'has:attachment',
      });

      if (messages.length === 0) {
        console.log('No messages with attachments, skipping attachment test');
        return;
      }

      const fullMessage = await mailbox.getMessage(messages[0].id!);

      expect(fullMessage).toBeDefined();
      expect(fullMessage.attachments).toBeDefined();
      expect(Array.isArray(fullMessage.attachments)).toBe(true);

      if (fullMessage.attachments && fullMessage.attachments.length > 0) {
        // Validate attachment structure
        const attachment = fullMessage.attachments[0];
        expect(attachment.filename).toBeDefined();
        expect(attachment.contentType).toBeDefined();
        expect(attachment.size).toBeGreaterThan(0);
      }
    }, 45000);
  });

  describe('Message Search', () => {
    it('should search messages by sender', async () => {
      const allMessages = await mailbox.fetch({ folder: 'INBOX', limit: 10 });

      if (allMessages.length === 0) {
        console.log('No messages in INBOX, skipping search test');
        return;
      }

      // Get a real sender from existing messages
      const senderEmail = allMessages[0].from.address;
      const searchResults = await mailbox.search({
        from: senderEmail,
      });

      expect(searchResults).toBeDefined();
      expect(Array.isArray(searchResults)).toBe(true);
      expect(searchResults.length).toBeGreaterThan(0);

      // All results should be from the specified sender
      for (const message of searchResults) {
        expect(message.from.address).toBe(senderEmail);
      }
    }, 30000);

    it('should search messages by date range', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const results = await mailbox.search({
        since: yesterday,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);

      // If there are results, they should all be from after yesterday
      for (const message of results) {
        if (message.date) {
          expect(message.date.getTime()).toBeGreaterThanOrEqual(
            yesterday.getTime(),
          );
        }
      }
    }, 30000);

    it('should search unread messages', async () => {
      const unreadMessages = await mailbox.search({
        unread: true,
      });

      expect(unreadMessages).toBeDefined();
      expect(Array.isArray(unreadMessages)).toBe(true);

      // Gmail uses labels instead of IMAP flags
      // All results should have UNREAD label (not \\Seen flag)
      for (const message of unreadMessages) {
        expect(message.labels).toBeDefined();
        expect(message.labels?.includes('UNREAD')).toBe(true);
      }
    }, 30000);
  });

  describe('Message Operations', () => {
    it('should mark message as read', async () => {
      // Find an unread message
      const unreadMessages = await mailbox.search({
        unread: true,
      });

      if (unreadMessages.length === 0) {
        console.log('No unread messages, skipping mark as read test');
        return;
      }

      const messageId = unreadMessages[0].id!;
      await mailbox.markRead(messageId);

      // Verify message is now read (UNREAD label removed)
      const updatedMessage = await mailbox.getMessage(messageId);
      expect(updatedMessage.labels?.includes('UNREAD')).toBe(false);
    }, 30000);

    it('should mark message as unread', async () => {
      // Find a read message
      const readMessages = await mailbox.search({
        unread: false,
      });

      if (readMessages.length === 0) {
        console.log('No read messages, skipping mark as unread test');
        return;
      }

      const messageId = readMessages[0].id!;
      await mailbox.markUnread(messageId);

      // Verify message is now unread (UNREAD label added)
      const updatedMessage = await mailbox.getMessage(messageId);
      expect(updatedMessage.labels?.includes('UNREAD')).toBe(true);
    }, 30000);

    it('should move message to folder', async () => {
      const messages = await mailbox.fetch({ folder: 'INBOX', limit: 1 });

      if (messages.length === 0) {
        console.log('No messages in INBOX, skipping move test');
        return;
      }

      const messageId = messages[0].id!;

      // Add TRASH label (Gmail doesn't remove INBOX label automatically)
      await mailbox.move(messageId, 'TRASH');

      // Wait for label update
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify message has TRASH label
      const updatedMessage = await mailbox.getMessage(messageId);
      expect(updatedMessage.labels).toBeDefined();
      expect(updatedMessage.labels?.includes('TRASH')).toBe(true);

      // Move back to INBOX
      await mailbox.move(messageId, 'INBOX');
    }, 45000);

    it('should delete message', async () => {
      // Create a test message by sending to self (if possible)
      // Or use an existing message in Trash
      const trashMessages = await mailbox.fetch({ folder: 'TRASH', limit: 1 });

      if (trashMessages.length === 0) {
        console.log('No messages in Trash, skipping delete test');
        return;
      }

      const messageId = trashMessages[0].id!;
      await mailbox.delete(messageId);

      // Verify message is deleted (moved to trash or permanently deleted)
      // Note: Gmail's delete moves to trash, so we can't easily verify permanent deletion
    }, 30000);
  });

  describe('Message Sending', () => {
    it.skip('should send a plain text email', async () => {
      // Skipped: Gmail API 'me' identifier doesn't work with email validation
      // To test sending, provide a real email address in from/to fields
    });

    it.skip('should send an email with HTML content', async () => {
      // Skipped: Gmail API 'me' identifier doesn't work with email validation
      // To test sending, provide a real email address in from/to fields
    });

    it.skip('should send an email with attachment', async () => {
      // Skipped: Gmail API 'me' identifier doesn't work with email validation
      // To test sending, provide a real email address in from/to fields
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid folder name', async () => {
      // Gmail returns empty results for non-existent labels instead of throwing
      const results = await mailbox.fetch({ folder: 'NONEXISTENT_FOLDER' });
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should handle invalid message ID', async () => {
      await expect(mailbox.getMessage('invalid-message-id')).rejects.toThrow();
    });

    it('should handle search with no results', async () => {
      const results = await mailbox.search({
        subject: 'NONEXISTENT_SUBJECT_12345',
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });
});

// If credentials not provided, show helpful message
if (!hasCredentials) {
  console.log('\n⚠️  Gmail integration tests skipped');
  console.log(
    'To run Gmail integration tests, set these environment variables:',
  );
  console.log('  - GMAIL_CLIENT_ID');
  console.log('  - GMAIL_CLIENT_SECRET');
  console.log('  - GMAIL_REFRESH_TOKEN');
  console.log(
    '\nSee test/integration/gmail.test.ts for details on obtaining credentials.\n',
  );
}
