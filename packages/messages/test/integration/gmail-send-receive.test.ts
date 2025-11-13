import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getMailbox } from '../../src/index.js';
import type { EmailMessage, Mailbox } from '../../src/shared/types.js';

// Gmail OAuth2 credentials from environment
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const GMAIL_EMAIL = process.env.GMAIL_EMAIL; // User's Gmail address for send/receive tests

// Skip tests if credentials not provided or running in CI
const hasCredentials =
  GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN && GMAIL_EMAIL;
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const shouldSkip = !hasCredentials || isCI;

describe.skipIf(shouldSkip)('Gmail Send & Receive Integration Test', () => {
  let mailbox: Mailbox;
  let userEmail: string;

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

    // Use email from environment variable
    userEmail = GMAIL_EMAIL!;
    console.log(`\nUsing email address: ${userEmail}\n`);
  }, 30000);

  afterAll(async () => {
    if (mailbox) {
      await mailbox.disconnect();
    }
  });

  it('should send an email and receive it in the inbox', async () => {
    const timestamp = new Date().toISOString();
    const uniqueSubject = `Gmail Integration Test - ${timestamp}`;

    // Step 1: Send email to self
    console.log('📤 Sending test email...');
    const testEmail: EmailMessage = {
      from: {
        address: userEmail,
        name: 'Test Sender',
      },
      to: [
        {
          address: userEmail,
          name: 'Test Recipient',
        },
      ],
      subject: uniqueSubject,
      text: `This is a test email sent via Gmail API integration test.\n\nTimestamp: ${timestamp}\n\nIf you see this, the send functionality is working correctly!`,
      html: `<html><body>
            <h2>Gmail Integration Test</h2>
            <p>This is a test email sent via Gmail API integration test.</p>
            <p><strong>Timestamp:</strong> ${timestamp}</p>
            <p>If you see this, the send functionality is working correctly!</p>
          </body></html>`,
      date: new Date(),
    };

    const sendResult = await mailbox.send(testEmail);

    expect(sendResult).toBeDefined();
    expect(sendResult.messageId).toBeDefined();
    expect(sendResult.accepted).toContain(userEmail);
    expect(sendResult.rejected).toHaveLength(0);

    console.log(`✅ Email sent successfully (ID: ${sendResult.messageId})`);

    // Step 2: Wait for email to arrive (Gmail delivery can take a few seconds)
    console.log('⏳ Waiting for email delivery (20 seconds)...');
    await new Promise((resolve) => setTimeout(resolve, 20000));

    // Step 3: Search for the sent email in INBOX
    console.log('🔍 Searching for sent email in INBOX...');
    let receivedMessage: EmailMessage | undefined;
    let attempts = 0;
    const maxAttempts = 8; // Increased from 5

    // Try multiple times in case there's a delay
    while (!receivedMessage && attempts < maxAttempts) {
      attempts++;
      console.log(`   Attempt ${attempts}/${maxAttempts}...`);

      const searchResults = await mailbox.search({
        subject: uniqueSubject,
      });

      console.log(`   Found ${searchResults.length} messages matching subject`);

      if (searchResults.length > 0) {
        // Get the full message details
        try {
          receivedMessage = await mailbox.getMessage(searchResults[0].id!);
          console.log(
            `   Successfully retrieved message with ID: ${searchResults[0].id}`,
          );
        } catch (error) {
          console.log(
            `   Failed to get message: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        if (receivedMessage) break;
      }

      if (attempts < maxAttempts) {
        console.log('   Waiting 6 seconds before next attempt...');
        await new Promise((resolve) => setTimeout(resolve, 6000)); // Increased from 5000
      }
    }

    // Step 4: Verify the received message
    expect(receivedMessage).toBeDefined();
    console.log('✅ Email received successfully');

    if (receivedMessage) {
      expect(receivedMessage.subject).toBe(uniqueSubject);
      expect(receivedMessage.from.address).toBe(userEmail);
      expect(receivedMessage.to[0]?.address).toBe(userEmail);
      expect(receivedMessage.text).toContain(timestamp);
      expect(receivedMessage.html).toContain(timestamp);
      expect(receivedMessage.html).toContain('Gmail Integration Test');

      console.log('\n📧 Message verification complete:');
      console.log(`   Subject: ${receivedMessage.subject}`);
      console.log(`   From: ${receivedMessage.from.address}`);
      console.log(`   To: ${receivedMessage.to[0]?.address}`);
      console.log(`   Message ID: ${receivedMessage.messageId}`);
      console.log(`   Labels: ${receivedMessage.labels?.join(', ') || 'none'}`);

      // Step 5: Clean up - delete the test message
      console.log('\n🗑️  Cleaning up test message...');
      await mailbox.delete(receivedMessage.id!);
      console.log('✅ Test message deleted');
    }
  }, 120000); // 2 minute timeout for full send/receive cycle

  it('should send an email with attachment and receive it', async () => {
    const timestamp = new Date().toISOString();
    const uniqueSubject = `Gmail Attachment Test - ${timestamp}`;

    // Step 1: Send email with attachment
    console.log('📤 Sending email with attachment...');
    const testEmail: EmailMessage = {
      from: {
        address: userEmail,
        name: 'Test Sender',
      },
      to: [
        {
          address: userEmail,
          name: 'Test Recipient',
        },
      ],
      subject: uniqueSubject,
      text: 'This email has a test attachment.',
      attachments: [
        {
          filename: 'test-file.txt',
          contentType: 'text/plain',
          content: Buffer.from(
            `Test attachment content\nTimestamp: ${timestamp}`,
          ),
          size: 50,
        },
      ],
      date: new Date(),
    };

    const sendResult = await mailbox.send(testEmail);

    expect(sendResult).toBeDefined();
    expect(sendResult.messageId).toBeDefined();
    console.log(`✅ Email with attachment sent (ID: ${sendResult.messageId})`);

    // Step 2: Wait for delivery
    console.log('⏳ Waiting for email delivery (15 seconds)...');
    await new Promise((resolve) => setTimeout(resolve, 15000));

    // Step 3: Search for the email
    console.log('🔍 Searching for email with attachment...');
    let receivedMessage: EmailMessage | undefined;
    let attempts = 0;
    const maxAttempts = 5;

    while (!receivedMessage && attempts < maxAttempts) {
      attempts++;
      console.log(`   Attempt ${attempts}/${maxAttempts}...`);

      // Search by subject (attachment indexing may take longer)
      const searchResults = await mailbox.search({
        subject: uniqueSubject,
      });

      if (searchResults.length > 0) {
        receivedMessage = await mailbox.getMessage(searchResults[0].id!);
        // Verify it has attachments before breaking
        if (
          receivedMessage.attachments &&
          receivedMessage.attachments.length > 0
        ) {
          break;
        }
        // If no attachments yet, keep trying
        receivedMessage = undefined;
      }

      if (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    // Step 4: Verify the received message and attachment
    expect(receivedMessage).toBeDefined();
    console.log('✅ Email with attachment received');

    if (receivedMessage) {
      expect(receivedMessage.subject).toBe(uniqueSubject);
      expect(receivedMessage.attachments).toBeDefined();
      expect(receivedMessage.attachments?.length).toBeGreaterThan(0);

      const attachment = receivedMessage.attachments?.[0];
      expect(attachment?.filename).toBe('test-file.txt');
      expect(attachment?.contentType).toContain('text/plain');
      expect(attachment?.size).toBeGreaterThan(0);

      // Verify attachment content if available
      if (attachment?.content) {
        const content = attachment.content.toString('utf-8');
        expect(content).toContain(timestamp);
      }

      console.log('\n📎 Attachment verification complete:');
      console.log(`   Filename: ${attachment?.filename}`);
      console.log(`   Content-Type: ${attachment?.contentType}`);
      console.log(`   Size: ${attachment?.size} bytes`);

      // Step 5: Clean up
      console.log('\n🗑️  Cleaning up test message...');
      await mailbox.delete(receivedMessage.id!);
      console.log('✅ Test message deleted');
    }
  }, 120000);
});

// If tests skipped, show helpful message
if (shouldSkip) {
  if (isCI) {
    console.log(
      '\n⚠️  Gmail send/receive integration tests skipped (CI environment)',
    );
  } else if (!hasCredentials) {
    console.log('\n⚠️  Gmail send/receive integration tests skipped');
    console.log('To run these tests, set environment variables:');
    console.log('  - GMAIL_CLIENT_ID');
    console.log('  - GMAIL_CLIENT_SECRET');
    console.log('  - GMAIL_REFRESH_TOKEN');
    console.log('  - GMAIL_EMAIL (your Gmail address, e.g., user@gmail.com)\n');
  }
}
