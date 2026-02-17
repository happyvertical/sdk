/**
 * Email Bridge Adapter
 *
 * Thin wrapper that adapts @happyvertical/email EmailClient
 * to the unified MessageClient interface.
 */

import {
  type EmailClient,
  type EmailMessage,
  getEmailClient,
} from '@happyvertical/email';

import { BaseMessageClient } from '../shared/base.js';
import { MessageNotFoundError, SendError } from '../shared/errors.js';
import type {
  EmailBridgeOptions,
  FetchOptions,
  Message,
  MessageAdapterType,
  MessageAttachment,
  MessageClientCapabilities,
  MessageRecipient,
  SendOptions,
  SendResult,
} from '../shared/types.js';

export class EmailBridgeAdapter extends BaseMessageClient {
  private emailClient: EmailClient | null = null;
  private emailOptions: EmailBridgeOptions['emailOptions'];

  constructor(options: EmailBridgeOptions) {
    super({ type: 'email', debug: options.debug, logger: options.logger });
    this.emailOptions = options.emailOptions;
  }

  async send(message: Message, _options?: SendOptions): Promise<SendResult> {
    this.validateMessage(message);
    const client = await this.getClient();

    const emailMessage = this.toEmailMessage(message);

    try {
      const result = await client.send(emailMessage);

      return {
        success: true,
        messageId: result.messageId,
        timestamp: new Date(),
        providerResponse: {
          accepted: result.accepted,
          rejected: result.rejected,
          response: result.response,
        },
      };
    } catch (error) {
      throw new SendError(
        `Failed to send email: ${error instanceof Error ? error.message : String(error)}`,
        'email',
        error,
      );
    }
  }

  async fetch(options?: FetchOptions): Promise<Message[]> {
    const client = await this.getClient();

    const emails = await client.fetch({
      folder: options?.channelId,
      limit: options?.limit,
      unreadOnly: options?.unreadOnly,
      since: options?.since,
      before: options?.before,
    });

    return emails.map((email) => this.fromEmailMessage(email));
  }

  async getMessage(messageId: string): Promise<Message> {
    const client = await this.getClient();

    try {
      const email = await client.getMessage(messageId);
      return this.fromEmailMessage(email);
    } catch (error) {
      throw new MessageNotFoundError(messageId, 'email', error);
    }
  }

  async getThread(threadId: string): Promise<Message[]> {
    // Email threads are tracked by References/In-Reply-To headers.
    // Fetch by thread ID isn't natively supported across all email adapters,
    // so we fetch the root message and return it as a single-item thread.
    const message = await this.getMessage(threadId);
    return [message];
  }

  async connect(): Promise<void> {
    const client = await this.getClient();
    await client.connect();
    this.connected = true;
    this.debug('Email bridge adapter connected');
  }

  async disconnect(): Promise<void> {
    if (this.emailClient) {
      await this.emailClient.disconnect();
      this.emailClient = null;
    }
    this.connected = false;
    this.debug('Email bridge adapter disconnected');
  }

  getCapabilities(): MessageClientCapabilities {
    return {
      send: true,
      receive: true,
      threads: false,
      channels: true,
      reactions: false,
      attachments: true,
      richText: true,
    };
  }

  getAdapter(): MessageAdapterType {
    return 'email';
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  private async getClient(): Promise<EmailClient> {
    if (!this.emailClient) {
      this.emailClient = await getEmailClient(this.emailOptions);
    }
    return this.emailClient;
  }

  private toEmailMessage(message: Message): EmailMessage {
    const to: Array<{ name?: string; address: string }> = (
      message.to ?? []
    ).map((r) => ({
      name: r.name,
      address: r.address ?? r.id ?? '',
    }));

    return {
      from: {
        name: message.from.name,
        address: message.from.address ?? message.from.id ?? '',
      },
      to,
      subject: message.subject ?? '',
      text: message.content,
      html: message.html,
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        content: a.content,
        path: a.url,
      })),
    };
  }

  private fromEmailMessage(email: EmailMessage): Message {
    const attachments: MessageAttachment[] | undefined = email.attachments?.map(
      (a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        content: a.content,
        url: a.path,
      }),
    );

    const to: MessageRecipient[] | undefined = email.to?.map((r) => ({
      name: r.name,
      address: r.address,
    }));

    return {
      id: email.id ?? email.messageId,
      threadId: email.threadId,
      from: {
        name: email.from.name,
        address: email.from.address,
      },
      to,
      subject: email.subject,
      content: email.text ?? '',
      html: email.html,
      attachments,
      timestamp: email.date,
      metadata: {
        messageId: email.messageId,
        inReplyTo: email.inReplyTo,
        folder: email.folder,
        labels: email.labels,
        flags: email.flags,
      },
    };
  }
}
