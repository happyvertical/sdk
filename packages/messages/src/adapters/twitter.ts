/**
 * Twitter Adapter
 *
 * Implements MessageClient interface for Twitter/X using API v2.
 * Uses OAuth 1.0a signing via node:crypto (no external dependency).
 */

import { createHmac } from 'node:crypto';

import { BaseMessageClient } from '../shared/base.js';
import {
  AuthenticationError,
  MessageNotFoundError,
  RateLimitError,
  SendError,
} from '../shared/errors.js';
import type {
  FetchOptions,
  Message,
  MessageAdapterType,
  MessageClientCapabilities,
  SendOptions,
  SendResult,
  TwitterOptions,
} from '../shared/types.js';

const X_API_URL = 'https://api.twitter.com/2';

export class TwitterAdapter extends BaseMessageClient {
  private apiKey: string;
  private apiSecret: string;
  private accessToken: string;
  private accessSecret: string;
  private userId?: string;

  constructor(options: TwitterOptions) {
    super({ type: 'twitter', debug: options.debug, logger: options.logger });
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.accessToken = options.accessToken;
    this.accessSecret = options.accessSecret;
  }

  async send(message: Message, options?: SendOptions): Promise<SendResult> {
    this.validateMessage(message);

    const body: Record<string, unknown> = {
      text: message.content,
    };

    if (options?.replyTo) {
      body.reply = { in_reply_to_tweet_id: options.replyTo };
    }

    try {
      const response = await this.makeRequest(
        'POST',
        `${X_API_URL}/tweets`,
        body,
      );

      if (!response.ok) {
        await this.handleApiError(response);
      }

      const data = (await response.json()) as {
        data: { id: string; text: string };
      };

      return {
        success: true,
        messageId: data.data.id,
        timestamp: new Date(),
        providerResponse: data as unknown as Record<string, unknown>,
      };
    } catch (error) {
      if (
        error instanceof AuthenticationError ||
        error instanceof RateLimitError ||
        error instanceof SendError
      ) {
        throw error;
      }
      throw new SendError(
        `Failed to send tweet: ${error instanceof Error ? error.message : String(error)}`,
        'twitter',
        error,
      );
    }
  }

  async fetch(options?: FetchOptions): Promise<Message[]> {
    if (!this.userId) {
      await this.resolveUserId();
    }

    const params = new URLSearchParams();
    params.set(
      'tweet.fields',
      'created_at,conversation_id,in_reply_to_user_id',
    );
    if (options?.limit)
      params.set('max_results', String(Math.min(options.limit, 100)));
    if (options?.since) params.set('start_time', options.since.toISOString());
    if (options?.before) params.set('end_time', options.before.toISOString());

    const url = `${X_API_URL}/users/${this.userId}/tweets?${params.toString()}`;
    const response = await this.makeRequest('GET', url);

    if (!response.ok) {
      await this.handleApiError(response);
    }

    const data = (await response.json()) as {
      data?: Array<{
        id: string;
        text: string;
        created_at?: string;
        conversation_id?: string;
      }>;
    };

    return (data.data ?? []).map((tweet) => this.mapTweet(tweet));
  }

  async getMessage(messageId: string): Promise<Message> {
    const url = `${X_API_URL}/tweets/${messageId}?tweet.fields=created_at,conversation_id,in_reply_to_user_id,author_id`;
    const response = await this.makeRequest('GET', url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new MessageNotFoundError(messageId, 'twitter');
      }
      await this.handleApiError(response);
    }

    const data = (await response.json()) as {
      data: {
        id: string;
        text: string;
        created_at?: string;
        conversation_id?: string;
        author_id?: string;
      };
    };

    return this.mapTweet(data.data);
  }

  async getThread(threadId: string): Promise<Message[]> {
    // Twitter threads are tracked via conversation_id
    const params = new URLSearchParams();
    params.set('query', `conversation_id:${threadId}`);
    params.set(
      'tweet.fields',
      'created_at,conversation_id,in_reply_to_user_id,author_id',
    );
    params.set('max_results', '100');

    const url = `${X_API_URL}/tweets/search/recent?${params.toString()}`;
    const response = await this.makeRequest('GET', url);

    if (!response.ok) {
      await this.handleApiError(response);
    }

    const data = (await response.json()) as {
      data?: Array<{
        id: string;
        text: string;
        created_at?: string;
        conversation_id?: string;
        author_id?: string;
      }>;
    };

    return (data.data ?? []).map((tweet) => this.mapTweet(tweet));
  }

  async connect(): Promise<void> {
    try {
      await this.resolveUserId();
      this.connected = true;
      this.debug('Twitter adapter connected');
    } catch (error) {
      throw new AuthenticationError(
        'Failed to authenticate with Twitter',
        'twitter',
        error,
      );
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.debug('Twitter adapter disconnected');
  }

  getCapabilities(): MessageClientCapabilities {
    return {
      send: true,
      receive: true,
      threads: true,
      channels: false,
      reactions: false,
      attachments: false,
      richText: false,
    };
  }

  getAdapter(): MessageAdapterType {
    return 'twitter';
  }

  // ========================================================================
  // OAuth 1.0a
  // ========================================================================

  private generateOAuthSignature(
    method: string,
    url: string,
    params: Record<string, string>,
  ): string {
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: this.apiKey,
      oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: this.accessToken,
      oauth_version: '1.0',
      ...params,
    };

    const sortedParams = Object.keys(oauthParams)
      .sort()
      .map(
        (k) => `${this.percentEncode(k)}=${this.percentEncode(oauthParams[k])}`,
      )
      .join('&');

    const signatureBase = [
      method.toUpperCase(),
      this.percentEncode(url),
      this.percentEncode(sortedParams),
    ].join('&');

    const signingKey = `${this.percentEncode(this.apiSecret)}&${this.percentEncode(this.accessSecret)}`;
    const signature = createHmac('sha1', signingKey)
      .update(signatureBase)
      .digest('base64');

    const authParams: Record<string, string> = {
      ...oauthParams,
      oauth_signature: signature,
    };

    return (
      'OAuth ' +
      Object.keys(authParams)
        .filter((k) => k.startsWith('oauth_'))
        .sort()
        .map(
          (k) =>
            `${this.percentEncode(k)}="${this.percentEncode(authParams[k])}"`,
        )
        .join(', ')
    );
  }

  private percentEncode(str: string): string {
    return encodeURIComponent(str).replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  }

  // ========================================================================
  // HTTP helpers
  // ========================================================================

  private async makeRequest(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<Response> {
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.origin}${urlObj.pathname}`;
    const queryParams: Record<string, string> = {};
    urlObj.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    const authHeader = this.generateOAuthSignature(
      method,
      baseUrl,
      queryParams,
    );

    const options: RequestInit = {
      method,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    return fetch(url, options);
  }

  private async resolveUserId(): Promise<void> {
    if (this.userId) return;

    const response = await this.makeRequest('GET', `${X_API_URL}/users/me`);
    if (!response.ok) {
      throw new AuthenticationError(
        'Failed to resolve Twitter user',
        'twitter',
      );
    }

    const data = (await response.json()) as { data: { id: string } };
    this.userId = data.data.id;
  }

  // ========================================================================
  // Mapping helpers
  // ========================================================================

  private mapTweet(tweet: {
    id: string;
    text: string;
    created_at?: string;
    conversation_id?: string;
    author_id?: string;
  }): Message {
    return {
      id: tweet.id,
      threadId: tweet.conversation_id,
      from: { id: tweet.author_id },
      content: tweet.text,
      timestamp: tweet.created_at ? new Date(tweet.created_at) : undefined,
      metadata: {
        tweetId: tweet.id,
        conversationId: tweet.conversation_id,
      },
    };
  }

  // ========================================================================
  // Error handling
  // ========================================================================

  private async handleApiError(response: Response): Promise<never> {
    const text = await response.text();
    let error: Record<string, unknown>;
    try {
      error = JSON.parse(text) as Record<string, unknown>;
    } catch {
      error = { detail: text };
    }

    if (response.status === 401) {
      throw new AuthenticationError(
        (error.detail as string) ?? 'Unauthorized',
        'twitter',
      );
    }

    if (response.status === 429) {
      const resetTime = response.headers.get('x-rate-limit-reset');
      const retryAfter = resetTime
        ? Number.parseInt(resetTime, 10) - Math.floor(Date.now() / 1000)
        : undefined;
      throw new RateLimitError('twitter', retryAfter);
    }

    throw new SendError(
      (error.detail as string) ??
        (error.title as string) ??
        'API request failed',
      'twitter',
    );
  }
}
