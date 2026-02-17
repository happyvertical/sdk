/**
 * Core types for @happyvertical/messages package
 *
 * Unified, protocol-agnostic messaging types for Slack, Twitter, and Email.
 * No database dependencies — use @happyvertical/smrt-messages for persistence.
 */

import type { GetEmailClientOptions } from '@happyvertical/email';
import type { Logger } from '@happyvertical/logger';

// ============================================================================
// Message Types
// ============================================================================

export interface Message {
  id?: string;
  channelId?: string;
  threadId?: string;
  from: MessageSender;
  to?: MessageRecipient[];
  subject?: string;
  content: string;
  html?: string;
  attachments?: MessageAttachment[];
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

export interface MessageSender {
  id?: string;
  name?: string;
  address?: string;
}

export interface MessageRecipient {
  id?: string;
  name?: string;
  address?: string;
}

export interface MessageAttachment {
  filename?: string;
  contentType: string;
  size: number;
  content?: Buffer;
  url?: string;
}

// ============================================================================
// Send Result
// ============================================================================

export interface SendResult {
  success: boolean;
  messageId?: string;
  timestamp: Date;
  providerResponse?: Record<string, unknown>;
  error?: string;
}

// ============================================================================
// Options
// ============================================================================

export interface SendOptions {
  /** Reply to a specific message */
  replyTo?: string;
  /** Additional headers/metadata */
  headers?: Record<string, string>;
  /** Priority level */
  priority?: 'high' | 'normal' | 'low';
}

export interface FetchOptions {
  /** Channel or folder to fetch from */
  channelId?: string;
  /** Maximum messages to return */
  limit?: number;
  /** Fetch only unread */
  unreadOnly?: boolean;
  /** Fetch messages after this date */
  since?: Date;
  /** Fetch messages before this date */
  before?: Date;
}

// ============================================================================
// Channel / Conversation
// ============================================================================

export interface Channel {
  id: string;
  name: string;
  type: 'channel' | 'dm' | 'group';
  memberCount?: number;
}

// ============================================================================
// MessageClient Interface
// ============================================================================

export interface MessageClient {
  send(message: Message, options?: SendOptions): Promise<SendResult>;
  fetch(options?: FetchOptions): Promise<Message[]>;
  getMessage(messageId: string): Promise<Message>;
  getThread(threadId: string): Promise<Message[]>;
  listChannels?(): Promise<Channel[]>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getCapabilities(): MessageClientCapabilities;
  getAdapter(): MessageAdapterType;
}

export interface MessageClientCapabilities {
  send: boolean;
  receive: boolean;
  threads: boolean;
  channels: boolean;
  reactions: boolean;
  attachments: boolean;
  richText: boolean;
}

export type MessageAdapterType = 'email' | 'slack' | 'twitter';

// ============================================================================
// Adapter Configuration (Discriminated Union)
// ============================================================================

export interface SlackOptions {
  type: 'slack';
  botToken: string;
  appToken?: string;
  teamId?: string;
  debug?: boolean;
  logger?: Logger;
}

export interface TwitterOptions {
  type: 'twitter';
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
  debug?: boolean;
  logger?: Logger;
}

export interface EmailBridgeOptions {
  type: 'email';
  emailOptions: GetEmailClientOptions;
  debug?: boolean;
  logger?: Logger;
}

export type GetMessageClientOptions =
  | SlackOptions
  | TwitterOptions
  | EmailBridgeOptions;

// ============================================================================
// Base Configuration
// ============================================================================

export interface MessageClientConfig {
  type: MessageAdapterType;
  debug?: boolean;
  logger?: Logger;
}
