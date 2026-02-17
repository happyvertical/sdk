/**
 * Base message client adapter class
 */

import { createLogger, type Logger } from '@happyvertical/logger';
import { InvalidMessageError, MessagingError } from './errors.js';
import type {
  Channel,
  FetchOptions,
  Message,
  MessageAdapterType,
  MessageClient,
  MessageClientCapabilities,
  MessageClientConfig,
  SendOptions,
  SendResult,
} from './types.js';

/**
 * Base adapter class providing shared functionality.
 *
 * All adapter implementations should extend this class.
 * Protocol-only — no database persistence.
 */
export abstract class BaseMessageClient implements MessageClient {
  protected config: MessageClientConfig;
  protected logger: Logger;
  protected connected = false;

  constructor(config: MessageClientConfig) {
    this.config = config;
    this.logger = config.logger || createLogger({ level: 'info' });
  }

  // ========================================================================
  // Abstract methods that adapters must implement
  // ========================================================================

  abstract send(message: Message, options?: SendOptions): Promise<SendResult>;
  abstract fetch(options?: FetchOptions): Promise<Message[]>;
  abstract getMessage(messageId: string): Promise<Message>;
  abstract getThread(threadId: string): Promise<Message[]>;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract getCapabilities(): MessageClientCapabilities;
  abstract getAdapter(): MessageAdapterType;

  // ========================================================================
  // Optional methods (default to unsupported)
  // ========================================================================

  async listChannels(): Promise<Channel[]> {
    throw new MessagingError(
      'listChannels not supported by this adapter',
      'NOT_SUPPORTED',
      this.getAdapter(),
    );
  }

  // ========================================================================
  // Connection management
  // ========================================================================

  isConnected(): boolean {
    return this.connected;
  }

  // ========================================================================
  // Validation helpers
  // ========================================================================

  protected validateMessage(message: Message): void {
    if (!message.content && !message.html) {
      throw new InvalidMessageError(
        'Message must have content or html',
        this.getAdapter(),
      );
    }

    if (!message.from) {
      throw new InvalidMessageError(
        'Message must have a sender (from)',
        this.getAdapter(),
      );
    }
  }

  // ========================================================================
  // Error mapping
  // ========================================================================

  protected mapError(error: unknown): MessagingError {
    if (error instanceof MessagingError) {
      return error;
    }

    if (error instanceof Error) {
      return new MessagingError(
        error.message,
        'UNKNOWN_ERROR',
        this.getAdapter(),
        error,
      );
    }

    return new MessagingError(
      String(error),
      'UNKNOWN_ERROR',
      this.getAdapter(),
    );
  }

  // ========================================================================
  // Utility methods
  // ========================================================================

  protected debug(message: string, data?: unknown): void {
    if (this.config.debug) {
      this.logger.debug(message, data as Record<string, unknown> | undefined);
    }
  }
}
