import { describe, expect, it } from 'vitest';
import {
  AttachmentError,
  AuthenticationError,
  AuthorizationError,
  ConnectionError,
  EmailError,
  FolderExistsError,
  FolderNotFoundError,
  InvalidMessageError,
  MessageNotFoundError,
  SendError,
  SyncError,
  TimeoutError,
} from '../../src/shared/errors';

describe('EmailError', () => {
  it('should create basic error with message and code', () => {
    const error = new EmailError('Test error', 'TEST_CODE');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('EmailError');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.provider).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it('should create error with provider', () => {
    const error = new EmailError('Test error', 'TEST_CODE', 'smtp');

    expect(error.provider).toBe('smtp');
  });

  it('should create error with cause', () => {
    const cause = new Error('Original error');
    const error = new EmailError('Test error', 'TEST_CODE', 'smtp', cause);

    expect(error.cause).toBe(cause);
  });

  it('should preserve error stack', () => {
    const error = new EmailError('Test error', 'TEST_CODE');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('EmailError');
  });
});

describe('ConnectionError', () => {
  it('should extend EmailError', () => {
    const error = new ConnectionError('Connection failed');

    expect(error).toBeInstanceOf(EmailError);
    expect(error).toBeInstanceOf(Error);
  });

  it('should have correct name and code', () => {
    const error = new ConnectionError('Connection failed', 'smtp');

    expect(error.name).toBe('ConnectionError');
    expect(error.code).toBe('CONNECTION_ERROR');
    expect(error.message).toBe('Connection failed');
    expect(error.provider).toBe('smtp');
  });

  it('should preserve cause', () => {
    const cause = new Error('Network error');
    const error = new ConnectionError('Connection failed', 'smtp', cause);

    expect(error.cause).toBe(cause);
  });
});

describe('TimeoutError', () => {
  it('should extend EmailError', () => {
    const error = new TimeoutError('Request timeout');

    expect(error).toBeInstanceOf(EmailError);
  });

  it('should have correct name and code', () => {
    const error = new TimeoutError('Request timeout', 'imap');

    expect(error.name).toBe('TimeoutError');
    expect(error.code).toBe('TIMEOUT_ERROR');
    expect(error.message).toBe('Request timeout');
    expect(error.provider).toBe('imap');
  });
});

describe('AuthenticationError', () => {
  it('should extend EmailError', () => {
    const error = new AuthenticationError('Invalid credentials');

    expect(error).toBeInstanceOf(EmailError);
  });

  it('should have correct name and code', () => {
    const error = new AuthenticationError('Invalid credentials', 'imap');

    expect(error.name).toBe('AuthenticationError');
    expect(error.code).toBe('AUTHENTICATION_ERROR');
    expect(error.message).toBe('Invalid credentials');
    expect(error.provider).toBe('imap');
  });
});

describe('AuthorizationError', () => {
  it('should extend EmailError', () => {
    const error = new AuthorizationError('Access denied');

    expect(error).toBeInstanceOf(EmailError);
  });

  it('should have correct name and code', () => {
    const error = new AuthorizationError('Access denied', 'gmail');

    expect(error.name).toBe('AuthorizationError');
    expect(error.code).toBe('AUTHORIZATION_ERROR');
    expect(error.message).toBe('Access denied');
    expect(error.provider).toBe('gmail');
  });
});

describe('MessageNotFoundError', () => {
  it('should extend EmailError', () => {
    const error = new MessageNotFoundError('msg-123');

    expect(error).toBeInstanceOf(EmailError);
  });

  it('should have correct name, code, and messageId', () => {
    const error = new MessageNotFoundError('msg-123', 'imap');

    expect(error.name).toBe('MessageNotFoundError');
    expect(error.code).toBe('MESSAGE_NOT_FOUND');
    expect(error.message).toBe('Message not found: msg-123');
    expect(error.messageId).toBe('msg-123');
    expect(error.provider).toBe('imap');
  });

  it('should include messageId in error message', () => {
    const error = new MessageNotFoundError('test-id-456');

    expect(error.message).toContain('test-id-456');
  });
});

describe('InvalidMessageError', () => {
  it('should extend EmailError', () => {
    const error = new InvalidMessageError('Invalid format');

    expect(error).toBeInstanceOf(EmailError);
  });

  it('should have correct name and code', () => {
    const error = new InvalidMessageError('Invalid format', 'smtp');

    expect(error.name).toBe('InvalidMessageError');
    expect(error.code).toBe('INVALID_MESSAGE');
    expect(error.message).toBe('Invalid format');
    expect(error.provider).toBe('smtp');
  });
});

describe('FolderNotFoundError', () => {
  it('should extend EmailError', () => {
    const error = new FolderNotFoundError('Archive');

    expect(error).toBeInstanceOf(EmailError);
  });

  it('should have correct name, code, and folder', () => {
    const error = new FolderNotFoundError('Archive', 'imap');

    expect(error.name).toBe('FolderNotFoundError');
    expect(error.code).toBe('FOLDER_NOT_FOUND');
    expect(error.message).toBe('Folder not found: Archive');
    expect(error.folder).toBe('Archive');
    expect(error.provider).toBe('imap');
  });

  it('should include folder name in error message', () => {
    const error = new FolderNotFoundError('Sent Items');

    expect(error.message).toContain('Sent Items');
  });
});

describe('FolderExistsError', () => {
  it('should extend EmailError', () => {
    const error = new FolderExistsError('Archive');

    expect(error).toBeInstanceOf(EmailError);
  });

  it('should have correct name, code, and folder', () => {
    const error = new FolderExistsError('Archive', 'imap');

    expect(error.name).toBe('FolderExistsError');
    expect(error.code).toBe('FOLDER_EXISTS');
    expect(error.message).toBe('Folder already exists: Archive');
    expect(error.folder).toBe('Archive');
    expect(error.provider).toBe('imap');
  });
});

describe('SendError', () => {
  it('should extend EmailError', () => {
    const error = new SendError('Send failed', [], []);

    expect(error).toBeInstanceOf(EmailError);
  });

  it('should have correct name, code, accepted, and rejected', () => {
    const accepted = ['valid@example.com'];
    const rejected = ['invalid@'];
    const error = new SendError(
      'Partial send failure',
      accepted,
      rejected,
      'smtp',
    );

    expect(error.name).toBe('SendError');
    expect(error.code).toBe('SEND_ERROR');
    expect(error.message).toBe('Partial send failure');
    expect(error.accepted).toEqual(accepted);
    expect(error.rejected).toEqual(rejected);
    expect(error.provider).toBe('smtp');
  });

  it('should handle empty accepted list', () => {
    const error = new SendError(
      'All rejected',
      [],
      ['invalid1@', 'invalid2@'],
    );

    expect(error.accepted).toEqual([]);
    expect(error.rejected).toHaveLength(2);
  });

  it('should handle empty rejected list', () => {
    const error = new SendError('All accepted', ['valid@example.com'], []);

    expect(error.accepted).toHaveLength(1);
    expect(error.rejected).toEqual([]);
  });
});

describe('AttachmentError', () => {
  it('should extend EmailError', () => {
    const error = new AttachmentError('Attachment failed');

    expect(error).toBeInstanceOf(EmailError);
  });

  it('should have correct name and code', () => {
    const error = new AttachmentError('Attachment failed', 'document.pdf');

    expect(error.name).toBe('AttachmentError');
    expect(error.code).toBe('ATTACHMENT_ERROR');
    expect(error.message).toBe('Attachment failed');
    expect(error.filename).toBe('document.pdf');
  });

  it('should work without filename', () => {
    const error = new AttachmentError('Attachment failed');

    expect(error.filename).toBeUndefined();
  });

  it('should include provider and cause', () => {
    const cause = new Error('File not found');
    const error = new AttachmentError(
      'Attachment failed',
      'image.png',
      'smtp',
      cause,
    );

    expect(error.filename).toBe('image.png');
    expect(error.provider).toBe('smtp');
    expect(error.cause).toBe(cause);
  });
});

describe('SyncError', () => {
  it('should extend EmailError', () => {
    const error = new SyncError('Sync failed');

    expect(error).toBeInstanceOf(EmailError);
  });

  it('should have correct name and code', () => {
    const error = new SyncError('Sync failed', 'INBOX', 'imap');

    expect(error.name).toBe('SyncError');
    expect(error.code).toBe('SYNC_ERROR');
    expect(error.message).toBe('Sync failed');
    expect(error.folder).toBe('INBOX');
    expect(error.provider).toBe('imap');
  });

  it('should work without folder', () => {
    const error = new SyncError('Sync failed');

    expect(error.folder).toBeUndefined();
  });

  it('should include provider and cause', () => {
    const cause = new Error('Database error');
    const error = new SyncError('Sync failed', 'Sent', 'imap', cause);

    expect(error.folder).toBe('Sent');
    expect(error.provider).toBe('imap');
    expect(error.cause).toBe(cause);
  });
});

describe('Error Inheritance Chain', () => {
  it('should maintain proper inheritance for all error classes', () => {
    const errors = [
      new EmailError('test', 'CODE'),
      new ConnectionError('test'),
      new TimeoutError('test'),
      new AuthenticationError('test'),
      new AuthorizationError('test'),
      new MessageNotFoundError('id'),
      new InvalidMessageError('test'),
      new FolderNotFoundError('folder'),
      new FolderExistsError('folder'),
      new SendError('test', [], []),
      new AttachmentError('test'),
      new SyncError('test'),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(EmailError);
      expect(error.message).toBeDefined();
      expect(error.code).toBeDefined();
      expect(error.name).toBeDefined();
      expect(error.stack).toBeDefined();
    }
  });
});
