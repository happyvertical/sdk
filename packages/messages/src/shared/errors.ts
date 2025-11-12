/**
 * Error classes for @happyvertical/messages package
 */

// ============================================================================
// Base Error
// ============================================================================

export class EmailError extends Error {
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
    this.name = 'EmailError';
    this.code = code;
    this.provider = provider;
    this.cause = cause;
  }
}

// ============================================================================
// Connection Errors
// ============================================================================

export class ConnectionError extends EmailError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'CONNECTION_ERROR', provider, cause);
    this.name = 'ConnectionError';
  }
}

export class TimeoutError extends EmailError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'TIMEOUT_ERROR', provider, cause);
    this.name = 'TimeoutError';
  }
}

// ============================================================================
// Authentication Errors
// ============================================================================

export class AuthenticationError extends EmailError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', provider, cause);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends EmailError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'AUTHORIZATION_ERROR', provider, cause);
    this.name = 'AuthorizationError';
  }
}

// ============================================================================
// Message Errors
// ============================================================================

export class MessageNotFoundError extends EmailError {
  messageId: string;

  constructor(messageId: string, provider?: string) {
    super(`Message not found: ${messageId}`, 'MESSAGE_NOT_FOUND', provider);
    this.name = 'MessageNotFoundError';
    this.messageId = messageId;
  }
}

export class InvalidMessageError extends EmailError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'INVALID_MESSAGE', provider, cause);
    this.name = 'InvalidMessageError';
  }
}

// ============================================================================
// Folder Errors
// ============================================================================

export class FolderNotFoundError extends EmailError {
  folder: string;

  constructor(folder: string, provider?: string) {
    super(`Folder not found: ${folder}`, 'FOLDER_NOT_FOUND', provider);
    this.name = 'FolderNotFoundError';
    this.folder = folder;
  }
}

export class FolderExistsError extends EmailError {
  folder: string;

  constructor(folder: string, provider?: string) {
    super(`Folder already exists: ${folder}`, 'FOLDER_EXISTS', provider);
    this.name = 'FolderExistsError';
    this.folder = folder;
  }
}

// ============================================================================
// Send Errors
// ============================================================================

export class SendError extends EmailError {
  accepted: string[];
  rejected: string[];

  constructor(
    message: string,
    accepted: string[],
    rejected: string[],
    provider?: string,
    cause?: unknown,
  ) {
    super(message, 'SEND_ERROR', provider, cause);
    this.name = 'SendError';
    this.accepted = accepted;
    this.rejected = rejected;
  }
}

// ============================================================================
// Attachment Errors
// ============================================================================

export class AttachmentError extends EmailError {
  filename?: string;

  constructor(
    message: string,
    filename?: string,
    provider?: string,
    cause?: unknown,
  ) {
    super(message, 'ATTACHMENT_ERROR', provider, cause);
    this.name = 'AttachmentError';
    this.filename = filename;
  }
}

// ============================================================================
// Sync Errors
// ============================================================================

export class SyncError extends EmailError {
  folder?: string;

  constructor(
    message: string,
    folder?: string,
    provider?: string,
    cause?: unknown,
  ) {
    super(message, 'SYNC_ERROR', provider, cause);
    this.name = 'SyncError';
    this.folder = folder;
  }
}
