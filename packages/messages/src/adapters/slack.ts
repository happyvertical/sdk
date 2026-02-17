/**
 * Slack Adapter
 *
 * Implements MessageClient interface for Slack using @slack/web-api.
 */

import { WebClient } from '@slack/web-api';

import { BaseMessageClient } from '../shared/base.js';
import {
  AuthenticationError,
  ChannelNotFoundError,
  MessageNotFoundError,
  RateLimitError,
  SendError,
} from '../shared/errors.js';
import type {
  Channel,
  FetchOptions,
  Message,
  MessageAdapterType,
  MessageClientCapabilities,
  MessageSender,
  SendOptions,
  SendResult,
  SlackOptions,
} from '../shared/types.js';

export class SlackAdapter extends BaseMessageClient {
  private client: WebClient;
  private botToken: string;

  constructor(options: SlackOptions) {
    super({ type: 'slack', debug: options.debug, logger: options.logger });
    this.botToken = options.botToken;
    this.client = new WebClient(options.botToken);
  }

  async send(message: Message, options?: SendOptions): Promise<SendResult> {
    this.validateMessage(message);

    const channelId = message.channelId || message.to?.[0]?.id;
    if (!channelId) {
      throw new SendError(
        'Slack message requires channelId or to[0].id',
        'slack',
      );
    }

    try {
      const result = await this.client.chat.postMessage({
        channel: channelId,
        text: message.content,
        thread_ts: options?.replyTo,
        mrkdwn: true,
      });

      return {
        success: result.ok ?? false,
        messageId: result.ts,
        timestamp: new Date(),
        providerResponse: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      throw this.handleSlackError(error);
    }
  }

  async fetch(options?: FetchOptions): Promise<Message[]> {
    const channelId = options?.channelId;
    if (!channelId) {
      throw new ChannelNotFoundError('(none)', 'slack');
    }

    try {
      const result = await this.client.conversations.history({
        channel: channelId,
        limit: options?.limit ?? 20,
        oldest: options?.since
          ? String(options.since.getTime() / 1000)
          : undefined,
        latest: options?.before
          ? String(options.before.getTime() / 1000)
          : undefined,
      });

      return (result.messages ?? []).map((msg) =>
        this.mapSlackMessage(msg, channelId),
      );
    } catch (error) {
      throw this.handleSlackError(error);
    }
  }

  async getMessage(messageId: string): Promise<Message> {
    // Slack getMessage requires channel + ts. Use conversations.history with
    // latest=ts, inclusive=true, limit=1. We need the channel from the messageId
    // which should be in format "channel:ts"
    const [channelId, ts] = messageId.includes(':')
      ? messageId.split(':')
      : ['', messageId];

    if (!channelId) {
      throw new MessageNotFoundError(messageId, 'slack');
    }

    try {
      const result = await this.client.conversations.history({
        channel: channelId,
        latest: ts,
        inclusive: true,
        limit: 1,
      });

      const msg = result.messages?.[0];
      if (!msg) {
        throw new MessageNotFoundError(messageId, 'slack');
      }

      return this.mapSlackMessage(msg, channelId);
    } catch (error) {
      if (error instanceof MessageNotFoundError) throw error;
      throw this.handleSlackError(error);
    }
  }

  async getThread(threadId: string): Promise<Message[]> {
    const [channelId, ts] = threadId.includes(':')
      ? threadId.split(':')
      : ['', threadId];

    if (!channelId) {
      throw new MessageNotFoundError(threadId, 'slack');
    }

    try {
      const result = await this.client.conversations.replies({
        channel: channelId,
        ts,
      });

      return (result.messages ?? []).map((msg) =>
        this.mapSlackMessage(msg, channelId),
      );
    } catch (error) {
      throw this.handleSlackError(error);
    }
  }

  async listChannels(): Promise<Channel[]> {
    try {
      const result = await this.client.conversations.list({
        types: 'public_channel,private_channel,im,mpim',
        limit: 200,
      });

      return (result.channels ?? []).map((ch) => ({
        id: ch.id ?? '',
        name: ch.name ?? ch.id ?? '',
        type: ch.is_im
          ? ('dm' as const)
          : ch.is_mpim
            ? ('group' as const)
            : ('channel' as const),
        memberCount: ch.num_members,
      }));
    } catch (error) {
      throw this.handleSlackError(error);
    }
  }

  async connect(): Promise<void> {
    try {
      await this.client.auth.test();
      this.connected = true;
      this.debug('Slack adapter connected');
    } catch (error) {
      throw new AuthenticationError(
        'Failed to authenticate with Slack',
        'slack',
        error,
      );
    }
  }

  async disconnect(): Promise<void> {
    // WebClient is stateless — no persistent connection to close
    this.connected = false;
    this.debug('Slack adapter disconnected');
  }

  getCapabilities(): MessageClientCapabilities {
    return {
      send: true,
      receive: true,
      threads: true,
      channels: true,
      reactions: true,
      attachments: true,
      richText: true,
    };
  }

  getAdapter(): MessageAdapterType {
    return 'slack';
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapSlackMessage(msg: any, channelId: string): Message {
    const user = msg.user as string | undefined;
    const text = msg.text as string | undefined;
    const ts = msg.ts as string | undefined;
    const threadTs = msg.thread_ts as string | undefined;

    const from: MessageSender = {
      id: user,
      name: user,
    };

    return {
      id: ts ? `${channelId}:${ts}` : undefined,
      channelId,
      threadId: threadTs ? `${channelId}:${threadTs}` : undefined,
      from,
      content: text ?? '',
      timestamp: ts ? new Date(Number.parseFloat(ts) * 1000) : undefined,
      metadata: {
        slackTs: ts,
        slackThreadTs: threadTs,
      },
    };
  }

  private handleSlackError(error: unknown): never {
    const err = error as Record<string, unknown>;
    const code = err?.code as string | undefined;

    if (code === 'slack_webapi_platform_error') {
      const data = err.data as Record<string, unknown> | undefined;
      const slackError = data?.error as string | undefined;

      if (slackError === 'channel_not_found') {
        throw new ChannelNotFoundError('(unknown)', 'slack');
      }
      if (
        slackError === 'not_authed' ||
        slackError === 'invalid_auth' ||
        slackError === 'token_revoked'
      ) {
        throw new AuthenticationError(
          `Slack auth error: ${slackError}`,
          'slack',
          error,
        );
      }
      if (slackError === 'ratelimited') {
        const retryAfter = data?.headers as Record<string, string> | undefined;
        throw new RateLimitError(
          'slack',
          retryAfter?.['retry-after']
            ? Number.parseInt(retryAfter['retry-after'], 10)
            : undefined,
        );
      }
    }

    throw this.mapError(error);
  }
}
