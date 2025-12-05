# @happyvertical/email

Low-level email protocol operations with adapter-based architecture for sending, receiving, and managing email across multiple providers and protocols.

## Overview

`@happyvertical/email` provides a consistent interface for email operations following the same adapter pattern as `@happyvertical/files` and `@happyvertical/sql`. It supports multiple email protocols (SMTP, IMAP, POP3) and providers (Gmail) through a unified `EmailClient` interface.

**Key Features:**
- **Multi-protocol support**: SMTP, IMAP, POP3
- **Provider-specific adapters**: Gmail API
- **Type-safe operations**: Full TypeScript support with strict typing
- **Unified interface**: Same patterns as other SDK packages
- **Protocol-only**: No database dependencies (use `@happyvertical/smrt-messages` for persistence)

## Quick Start

### Installation

```bash
pnpm add @happyvertical/email
```

### Basic Usage

```typescript
import { getEmailClient } from '@happyvertical/email';

// SMTP for sending
const smtp = await getEmailClient({
  type: 'smtp',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'user@gmail.com',
    pass: 'app-password'
  }
});

await smtp.send({
  from: { address: 'user@gmail.com' },
  to: [{ address: 'recipient@example.com' }],
  subject: 'Hello from SDK',
  text: 'Plain text body',
  html: '<p>HTML body</p>'
});

// IMAP for receiving
const imap = await getEmailClient({
  type: 'imap',
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: {
    user: 'user@gmail.com',
    pass: 'app-password'
  }
});

await imap.connect();
const messages = await imap.fetch({
  folder: 'INBOX',
  limit: 10,
  unreadOnly: true
});

for (const msg of messages) {
  console.log(`${msg.from.address}: ${msg.subject}`);
}
await imap.disconnect();

// Combined Gmail adapter
const gmail = await getEmailClient({
  type: 'gmail',
  auth: {
    clientId: 'CLIENT_ID',
    clientSecret: 'CLIENT_SECRET',
    refreshToken: 'REFRESH_TOKEN'
  }
});

// Send and receive with single connection
await gmail.connect();
await gmail.send({ /* ... */ });
const messages = await gmail.fetch({ /* ... */ });
await gmail.disconnect();
```

## Core Architecture

### EmailClient Interface

All adapters implement the `EmailClient` interface:

```typescript
interface EmailClient {
  // Send operations
  send(message: EmailMessage, options?: SendOptions): Promise<SendResult>;

  // Receive operations
  fetch(options?: FetchOptions): Promise<EmailMessage[]>;
  getMessage(messageId: string): Promise<EmailMessage>;

  // Folder management
  listFolders(): Promise<Folder[]>;
  selectFolder(name: string): Promise<FolderInfo>;
  createFolder(name: string): Promise<void>;
  deleteFolder(name: string): Promise<void>;

  // Message operations
  markRead(messageId: string | string[]): Promise<void>;
  markUnread(messageId: string | string[]): Promise<void>;
  move(messageId: string | string[], folder: string): Promise<void>;
  copy(messageId: string | string[], folder: string): Promise<void>;
  delete(messageId: string | string[]): Promise<void>;

  // Search
  search(criteria: SearchCriteria): Promise<EmailMessage[]>;

  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Adapter info
  getCapabilities(): Promise<EmailClientCapabilities>;
  getAdapter(): AdapterType;
}
```

### Factory Pattern

```typescript
import { getEmailClient, isSMTPOptions, isIMAPOptions } from '@happyvertical/email';

// Factory function creates appropriate adapter
const client = await getEmailClient({
  type: 'smtp',
  host: 'smtp.example.com',
  port: 587,
  auth: { user: 'user', pass: 'pass' }
});

// Type guards for conditional handling
function processOptions(opts: GetEmailClientOptions) {
  if (isSMTPOptions(opts)) {
    // Handle SMTP-specific logic
  } else if (isIMAPOptions(opts)) {
    // Handle IMAP-specific logic
  }
}
```

## Adapters

### SMTP Adapter

**Purpose**: Send email via SMTP protocol

**Configuration**:

```typescript
interface SMTPOptions {
  type: 'smtp';
  host: string;
  port: number;
  secure?: boolean; // true for 465, false for other ports
  auth?: {
    user: string;
    pass: string;
  } | {
    type: 'OAuth2';
    user: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accessToken?: string;
  };
  tls?: {
    rejectUnauthorized?: boolean;
    minVersion?: string;
  };
  connectionTimeout?: number;
  greetingTimeout?: number;
  socketTimeout?: number;
  pool?: boolean;
  maxConnections?: number;
  maxMessages?: number;
  debug?: boolean;
}
```

**Capabilities**: ✅ Send | ❌ Receive | ❌ Folders | ❌ Search

**Example**:

```typescript
const smtp = await getEmailClient({
  type: 'smtp',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: 'user@gmail.com', pass: 'app-password' },
  pool: true,
  maxConnections: 5
});

await smtp.send({
  from: { address: 'user@gmail.com', name: 'User Name' },
  to: [{ address: 'recipient@example.com' }],
  cc: [{ address: 'cc@example.com' }],
  subject: 'Hello',
  text: 'Plain text version',
  html: '<h1>HTML version</h1>',
  attachments: [
    {
      filename: 'document.pdf',
      content: buffer,
      contentType: 'application/pdf'
    }
  ]
});
```

### IMAP Adapter

**Purpose**: Receive and manage email via IMAP protocol

**Configuration**:

```typescript
interface IMAPOptions {
  type: 'imap';
  host: string;
  port: number;
  secure?: boolean; // true for 993, false for 143
  auth: {
    user: string;
    pass: string;
  } | {
    type: 'OAuth2';
    user: string;
    accessToken: string;
  };
  tls?: {
    rejectUnauthorized?: boolean;
    minVersion?: string;
  };
  connectionTimeout?: number;
  greetingTimeout?: number;
  fetchOptions?: {
    bodyParts?: string[];
    markSeen?: boolean;
  };
  debug?: boolean;
}
```

**Capabilities**: ✅ Receive | ✅ Folders | ✅ Search | ✅ Mark Read | ✅ Move/Copy | ❌ Send

**Example**:

```typescript
const imap = await getEmailClient({
  type: 'imap',
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: { user: 'user@gmail.com', pass: 'app-password' }
});

await imap.connect();

// List folders
const folders = await imap.listFolders();

// Fetch recent unread messages
const messages = await imap.fetch({
  folder: 'INBOX',
  limit: 20,
  unreadOnly: true,
  since: new Date('2024-01-01')
});

// Search messages
const results = await imap.search({
  from: 'sender@example.com',
  subject: 'important',
  unread: true
});

// Mark as read and move
await imap.markRead(messages[0].id);
await imap.move(messages[0].id, 'Archive');

await imap.disconnect();
```

### POP3 Adapter

**Purpose**: Simple email retrieval via POP3 protocol

**Configuration**:

```typescript
interface POP3Options {
  type: 'pop3';
  host: string;
  port: number;
  secure?: boolean; // true for 995, false for 110
  auth: {
    user: string;
    pass: string;
  };
  tls?: {
    rejectUnauthorized?: boolean;
  };
  connectionTimeout?: number;
  leaveOnServer?: boolean; // Don't delete messages after fetch
  debug?: boolean;
}
```

**Capabilities**: ✅ Receive | ✅ Delete | ❌ Folders | ❌ Search | ❌ Mark Read | ❌ Send

**Example**:

```typescript
const pop3 = await getEmailClient({
  type: 'pop3',
  host: 'pop.gmail.com',
  port: 995,
  secure: true,
  auth: { user: 'user@gmail.com', pass: 'app-password' },
  leaveOnServer: true
});

await pop3.connect();
const messages = await pop3.fetch();
await pop3.delete(messages[0].id);
await pop3.disconnect();
```

### Gmail Adapter

**Purpose**: Combined send/receive using Gmail API with OAuth2

**Configuration**:

```typescript
interface GmailOptions {
  type: 'gmail';
  auth: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accessToken?: string;
  };
  userId?: string; // Default: 'me'
  debug?: boolean;
}
```

**Capabilities**: ✅ Send | ✅ Receive | ✅ Labels | ✅ Search | ✅ Threads | ✅ OAuth2

**Example**:

```typescript
const gmail = await getEmailClient({
  type: 'gmail',
  auth: {
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN
  }
});

await gmail.connect();

// Send email
await gmail.send({
  from: { address: 'user@gmail.com' },
  to: [{ address: 'recipient@example.com' }],
  subject: 'Via Gmail API',
  text: 'Sent using Gmail API'
});

// Fetch with Gmail search syntax
const messages = await gmail.fetch({
  q: 'from:sender@example.com subject:important',
  limit: 10
});

await gmail.disconnect();
```

## Type Definitions

### Core Types

```typescript
interface EmailMessage {
  id?: string;
  messageId?: string;       // RFC 822 Message-ID
  threadId?: string;
  inReplyTo?: string;
  references?: string[];
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  date?: Date;
  text?: string;
  html?: string;
  attachments?: Attachment[];
  folder?: string;
  labels?: string[];
  flags?: MessageFlag[];
  headers?: Record<string, string | string[]>;
  raw?: string;
  size?: number;
}

interface EmailAddress {
  name?: string;
  address: string;
}

interface Attachment {
  filename?: string;
  contentType: string;
  size: number;
  content?: Buffer;
  contentId?: string;
  contentDisposition?: 'attachment' | 'inline';
  path?: string;
}

interface Folder {
  name: string;
  path: string;
  delimiter: string;
  specialUse?: FolderSpecialUse;
  subscribed?: boolean;
  messageCount?: number;
  unreadCount?: number;
}

type FolderSpecialUse =
  | '\\Inbox'
  | '\\Sent'
  | '\\Drafts'
  | '\\Trash'
  | '\\Junk'
  | '\\Archive'
  | '\\All';
```

### Options Types

```typescript
interface FetchOptions {
  folder?: string;
  labelIds?: string[];      // Gmail labels
  messageIds?: string[];
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  since?: Date;
  before?: Date;
  bodyParts?: string[];
  markSeen?: boolean;
  q?: string;               // Gmail search query
  maxResults?: number;
}

interface SearchCriteria {
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  since?: Date;
  before?: Date;
  unread?: boolean;
  flagged?: boolean;
  larger?: number;
  smaller?: number;
  q?: string;               // Raw query (Gmail)
}

interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
}
```

## Error Handling

```typescript
import {
  getEmailClient,
  ConnectionError,
  AuthenticationError,
  SendError,
  MessageNotFoundError
} from '@happyvertical/email';

try {
  const client = await getEmailClient({ /* ... */ });
  await client.connect();
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid credentials:', error.message);
  } else if (error instanceof ConnectionError) {
    console.error('Cannot connect:', error.message);
  }
}

try {
  await client.send(message);
} catch (error) {
  if (error instanceof SendError) {
    console.log('Accepted:', error.accepted);
    console.log('Rejected:', error.rejected);
  }
}
```

### Error Classes

- `EmailError` - Base error class
- `ConnectionError` - Server connection failures
- `TimeoutError` - Operation timeouts
- `AuthenticationError` - Invalid credentials
- `AuthorizationError` - Insufficient permissions
- `MessageNotFoundError` - Message not found
- `InvalidMessageError` - Invalid message format
- `FolderNotFoundError` - Folder/label not found
- `FolderExistsError` - Folder already exists
- `SendError` - Send failures (includes accepted/rejected recipients)
- `AttachmentError` - Attachment processing errors

## Environment Variables

```bash
# Common settings
HAVE_EMAIL_TYPE=imap
HAVE_EMAIL_HOST=imap.example.com
HAVE_EMAIL_PORT=993
HAVE_EMAIL_SECURE=true
HAVE_EMAIL_USER=user@example.com
HAVE_EMAIL_PASSWORD=secret

# SMTP-specific
HAVE_EMAIL_SMTP_HOST=smtp.example.com
HAVE_EMAIL_SMTP_PORT=587
HAVE_EMAIL_SMTP_SECURE=false

# IMAP-specific
HAVE_EMAIL_IMAP_HOST=imap.example.com
HAVE_EMAIL_IMAP_PORT=993
HAVE_EMAIL_IMAP_SECURE=true

# Gmail OAuth2
HAVE_EMAIL_GMAIL_CLIENT_ID=client-id
HAVE_EMAIL_GMAIL_CLIENT_SECRET=client-secret
HAVE_EMAIL_GMAIL_REFRESH_TOKEN=refresh-token

# Debug
HAVE_EMAIL_DEBUG=true
```

## Dependencies

```json
{
  "dependencies": {
    "@happyvertical/logger": "workspace:*",
    "@happyvertical/utils": "workspace:*",
    "google-auth-library": "^10.5.0",
    "googleapis": "^131.0.0",
    "imapflow": "^1.1.1",
    "mailparser": "^3.9.0",
    "node-pop3": "^0.10.0",
    "nodemailer": "^6.9.8"
  }
}
```

Note: This package has **no** `@happyvertical/sql` dependency. For database persistence and AI features, use `@happyvertical/smrt-messages` in the SMRT repo.

## Related Packages

- **@happyvertical/smrt-messages** (SMRT repo) - SMRT-based email persistence with AI integration
- **@happyvertical/logger** - Logging infrastructure
- **@happyvertical/utils** - Shared utilities

## License

MIT License
