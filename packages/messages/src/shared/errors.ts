/**
 * Error classes for @happyvertical/messages package
 */

// ============================================================================
// Base Error
// ============================================================================

export class MessagingError extends Error {
  code: string;
  provider?: string;
  cause?: unknown;

  constructor(
    message: string,
    code: string,
    provider?: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'MessagingError';
    this.code = code;
    this.provider = provider;
    this.cause = cause;
  }
}

// ============================================================================
// Connection Errors
// ============================================================================

export class ConnectionError extends MessagingError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'CONNECTION_ERROR', provider, cause);
    this.name = 'ConnectionError';
  }
}

// ============================================================================
// Authentication Errors
// ============================================================================

export class AuthenticationError extends MessagingError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', provider, cause);
    this.name = 'AuthenticationError';
  }
}

// ============================================================================
// Send Errors
// ============================================================================

export class SendError extends MessagingError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'SEND_ERROR', provider, cause);
    this.name = 'SendError';
  }
}

// ============================================================================
// Message Errors
// ============================================================================

export class MessageNotFoundError extends MessagingError {
  messageId: string;

  constructor(messageId: string, provider?: string) {
    super(`Message not found: ${messageId}`, 'MESSAGE_NOT_FOUND', provider);
    this.name = 'MessageNotFoundError';
    this.messageId = messageId;
  }
}

// ============================================================================
// Channel Errors
// ============================================================================

export class ChannelNotFoundError extends MessagingError {
  channelId: string;

  constructor(channelId: string, provider?: string) {
    super(`Channel not found: ${channelId}`, 'CHANNEL_NOT_FOUND', provider);
    this.name = 'ChannelNotFoundError';
    this.channelId = channelId;
  }
}

// ============================================================================
// Rate Limit Errors
// ============================================================================

export class RateLimitError extends MessagingError {
  retryAfter?: number;

  constructor(provider?: string, retryAfter?: number) {
    super(
      `Rate limit exceeded${retryAfter ? ` (retry after ${retryAfter}s)` : ''}`,
      'RATE_LIMIT',
      provider,
    );
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

export class InvalidMessageError extends MessagingError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'INVALID_MESSAGE', provider, cause);
    this.name = 'InvalidMessageError';
  }
}
