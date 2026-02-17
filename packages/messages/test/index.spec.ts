/**
 * Tests for @happyvertical/messages package
 */

import { describe, expect, it, vi } from 'vitest';
import type {
  EmailBridgeOptions,
  GetMessageClientOptions,
  Message,
  SlackOptions,
  TwitterOptions,
} from '../src/index.js';
import {
  AuthenticationError,
  ChannelNotFoundError,
  ConnectionError,
  EmailBridgeAdapter,
  getMessageClient,
  InvalidMessageError,
  isEmailBridgeOptions,
  isSlackOptions,
  isTwitterOptions,
  MessageNotFoundError,
  MessagingError,
  RateLimitError,
  SendError,
  SlackAdapter,
  TwitterAdapter,
} from '../src/index.js';

// ============================================================================
// Type Guards
// ============================================================================

describe('Type Guards', () => {
  it('isSlackOptions identifies Slack config', () => {
    const opts: GetMessageClientOptions = {
      type: 'slack',
      botToken: 'xoxb-test',
    };
    expect(isSlackOptions(opts)).toBe(true);
    expect(isTwitterOptions(opts)).toBe(false);
    expect(isEmailBridgeOptions(opts)).toBe(false);
  });

  it('isTwitterOptions identifies Twitter config', () => {
    const opts: GetMessageClientOptions = {
      type: 'twitter',
      apiKey: 'key',
      apiSecret: 'secret',
      accessToken: 'token',
      accessSecret: 'secret',
    };
    expect(isSlackOptions(opts)).toBe(false);
    expect(isTwitterOptions(opts)).toBe(true);
    expect(isEmailBridgeOptions(opts)).toBe(false);
  });

  it('isEmailBridgeOptions identifies Email config', () => {
    const opts: GetMessageClientOptions = {
      type: 'email',
      emailOptions: {
        type: 'smtp',
        host: 'smtp.test.com',
        port: 587,
      },
    };
    expect(isSlackOptions(opts)).toBe(false);
    expect(isTwitterOptions(opts)).toBe(false);
    expect(isEmailBridgeOptions(opts)).toBe(true);
  });
});

// ============================================================================
// Factory
// ============================================================================

describe('getMessageClient', () => {
  it('creates SlackAdapter for slack type', async () => {
    const client = await getMessageClient({
      type: 'slack',
      botToken: 'xoxb-test',
    });
    expect(client).toBeInstanceOf(SlackAdapter);
    expect(client.getAdapter()).toBe('slack');
  });

  it('creates TwitterAdapter for twitter type', async () => {
    const client = await getMessageClient({
      type: 'twitter',
      apiKey: 'key',
      apiSecret: 'secret',
      accessToken: 'token',
      accessSecret: 'secret',
    });
    expect(client).toBeInstanceOf(TwitterAdapter);
    expect(client.getAdapter()).toBe('twitter');
  });

  it('creates EmailBridgeAdapter for email type', async () => {
    const client = await getMessageClient({
      type: 'email',
      emailOptions: {
        type: 'smtp',
        host: 'smtp.test.com',
        port: 587,
      },
    });
    expect(client).toBeInstanceOf(EmailBridgeAdapter);
    expect(client.getAdapter()).toBe('email');
  });

  it('throws for unknown type', async () => {
    await expect(
      getMessageClient({ type: 'unknown' } as GetMessageClientOptions),
    ).rejects.toThrow('Unknown message client type');
  });
});

// ============================================================================
// Error Classes
// ============================================================================

describe('Error Classes', () => {
  it('MessagingError has code and provider', () => {
    const err = new MessagingError('test', 'TEST_CODE', 'slack');
    expect(err.message).toBe('test');
    expect(err.code).toBe('TEST_CODE');
    expect(err.provider).toBe('slack');
    expect(err.name).toBe('MessagingError');
    expect(err).toBeInstanceOf(Error);
  });

  it('ConnectionError has correct code', () => {
    const err = new ConnectionError('conn failed', 'slack');
    expect(err.code).toBe('CONNECTION_ERROR');
    expect(err.name).toBe('ConnectionError');
    expect(err).toBeInstanceOf(MessagingError);
  });

  it('AuthenticationError has correct code', () => {
    const err = new AuthenticationError('auth failed', 'twitter');
    expect(err.code).toBe('AUTHENTICATION_ERROR');
    expect(err.name).toBe('AuthenticationError');
  });

  it('SendError has correct code', () => {
    const err = new SendError('send failed', 'email');
    expect(err.code).toBe('SEND_ERROR');
    expect(err.name).toBe('SendError');
  });

  it('MessageNotFoundError includes messageId', () => {
    const err = new MessageNotFoundError('msg-123', 'slack');
    expect(err.messageId).toBe('msg-123');
    expect(err.code).toBe('MESSAGE_NOT_FOUND');
    expect(err.message).toContain('msg-123');
  });

  it('ChannelNotFoundError includes channelId', () => {
    const err = new ChannelNotFoundError('ch-456', 'slack');
    expect(err.channelId).toBe('ch-456');
    expect(err.code).toBe('CHANNEL_NOT_FOUND');
  });

  it('RateLimitError includes retryAfter', () => {
    const err = new RateLimitError('twitter', 30);
    expect(err.retryAfter).toBe(30);
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.message).toContain('30');
  });

  it('InvalidMessageError has correct code', () => {
    const err = new InvalidMessageError('bad msg', 'email');
    expect(err.code).toBe('INVALID_MESSAGE');
    expect(err.name).toBe('InvalidMessageError');
  });
});

// ============================================================================
// SlackAdapter
// ============================================================================

describe('SlackAdapter', () => {
  it('reports capabilities', () => {
    const adapter = new SlackAdapter({ type: 'slack', botToken: 'xoxb-test' });
    const caps = adapter.getCapabilities();
    expect(caps.send).toBe(true);
    expect(caps.receive).toBe(true);
    expect(caps.threads).toBe(true);
    expect(caps.channels).toBe(true);
    expect(caps.reactions).toBe(true);
  });

  it('getAdapter returns slack', () => {
    const adapter = new SlackAdapter({ type: 'slack', botToken: 'xoxb-test' });
    expect(adapter.getAdapter()).toBe('slack');
  });

  it('starts disconnected', () => {
    const adapter = new SlackAdapter({ type: 'slack', botToken: 'xoxb-test' });
    expect(adapter.isConnected()).toBe(false);
  });

  it('send requires channelId or to[0].id', async () => {
    const adapter = new SlackAdapter({ type: 'slack', botToken: 'xoxb-test' });
    const message: Message = {
      from: { id: 'bot', name: 'Bot' },
      content: 'Hello',
    };
    await expect(adapter.send(message)).rejects.toThrow(
      'channelId or to[0].id',
    );
  });

  it('validates message has content', async () => {
    const adapter = new SlackAdapter({ type: 'slack', botToken: 'xoxb-test' });
    const message: Message = {
      from: { id: 'bot' },
      content: '',
      channelId: 'C123',
    };
    await expect(adapter.send(message)).rejects.toThrow('content or html');
  });
});

// ============================================================================
// TwitterAdapter
// ============================================================================

describe('TwitterAdapter', () => {
  const twitterOpts: TwitterOptions = {
    type: 'twitter',
    apiKey: 'key',
    apiSecret: 'secret',
    accessToken: 'token',
    accessSecret: 'secret',
  };

  it('reports capabilities', () => {
    const adapter = new TwitterAdapter(twitterOpts);
    const caps = adapter.getCapabilities();
    expect(caps.send).toBe(true);
    expect(caps.receive).toBe(true);
    expect(caps.threads).toBe(true);
    expect(caps.channels).toBe(false);
    expect(caps.reactions).toBe(false);
  });

  it('getAdapter returns twitter', () => {
    const adapter = new TwitterAdapter(twitterOpts);
    expect(adapter.getAdapter()).toBe('twitter');
  });

  it('starts disconnected', () => {
    const adapter = new TwitterAdapter(twitterOpts);
    expect(adapter.isConnected()).toBe(false);
  });

  it('validates message has content', async () => {
    const adapter = new TwitterAdapter(twitterOpts);
    const message: Message = {
      from: { id: 'user' },
      content: '',
    };
    await expect(adapter.send(message)).rejects.toThrow('content or html');
  });
});

// ============================================================================
// EmailBridgeAdapter
// ============================================================================

describe('EmailBridgeAdapter', () => {
  const emailOpts: EmailBridgeOptions = {
    type: 'email',
    emailOptions: {
      type: 'smtp',
      host: 'smtp.test.com',
      port: 587,
    },
  };

  it('reports capabilities', () => {
    const adapter = new EmailBridgeAdapter(emailOpts);
    const caps = adapter.getCapabilities();
    expect(caps.send).toBe(true);
    expect(caps.receive).toBe(true);
    expect(caps.threads).toBe(false);
    expect(caps.channels).toBe(true);
    expect(caps.attachments).toBe(true);
    expect(caps.richText).toBe(true);
  });

  it('getAdapter returns email', () => {
    const adapter = new EmailBridgeAdapter(emailOpts);
    expect(adapter.getAdapter()).toBe('email');
  });

  it('starts disconnected', () => {
    const adapter = new EmailBridgeAdapter(emailOpts);
    expect(adapter.isConnected()).toBe(false);
  });

  it('validates message has content', async () => {
    const adapter = new EmailBridgeAdapter(emailOpts);
    const message: Message = {
      from: { name: 'Test', address: 'test@test.com' },
      content: '',
    };
    await expect(adapter.send(message)).rejects.toThrow('content or html');
  });
});
