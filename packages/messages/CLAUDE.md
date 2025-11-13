# @happyvertical/messages

Unified email operations with adapter-based architecture for sending, receiving, and managing email across multiple providers and protocols.

## Overview

`@happyvertical/messages` provides a consistent interface for email operations following the same adapter pattern as `@happyvertical/files` and `@happyvertical/sql`. It supports multiple email protocols (SMTP, IMAP, POP3) and providers (Gmail, Outlook) through a unified `Mailbox` interface.

**Key Features:**
- **Multi-protocol support**: SMTP, IMAP, POP3
- **Provider-specific adapters**: Gmail, Outlook (future)
- **Database synchronization**: Store messages locally using `@happyvertical/sql`
- **Optional encryption**: PGP/S/MIME support when `@happyvertical/encryption` is available
- **Type-safe operations**: Full TypeScript support with strict typing
- **Unified interface**: Same patterns as other SDK packages

## Quick Start

### Installation

```bash
pnpm add @happyvertical/messages

# Optional: for encryption support
pnpm add @happyvertical/encryption
```

### Basic Usage

```typescript
import { getMailbox } from '@happyvertical/messages';

// SMTP for sending
const smtp = await getMailbox({
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
const imap = await getMailbox({
  type: 'imap',
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: {
    user: 'user@gmail.com',
    pass: 'app-password'
  }
});

const messages = await imap.fetch({
  folder: 'INBOX',
  limit: 10,
  unreadOnly: true
});

for (const msg of messages) {
  console.log(`${msg.from.address}: ${msg.subject}`);
}

// Combined Gmail adapter
const gmail = await getMailbox({
  type: 'gmail',
  auth: {
    clientId: 'CLIENT_ID',
    clientSecret: 'CLIENT_SECRET',
    refreshToken: 'REFRESH_TOKEN'
  }
});

// Send and receive with single connection
await gmail.send({ /* ... */ });
const messages = await gmail.fetch({ /* ... */ });
```

### With Database Sync

```typescript
import { getMailbox } from '@happyvertical/messages';
import { getDatabase } from '@happyvertical/sql';

const db = await getDatabase({ type: 'sqlite', url: './email.db' });

const mailbox = await getMailbox({
  type: 'imap',
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: { user: 'user@gmail.com', pass: 'password' },
  db // Enable database sync
});

// Fetch and sync to database
await mailbox.sync({
  folder: 'INBOX',
  since: new Date('2024-01-01')
});

// Query local database
const local = await db.select('messages', {
  where: { is_read: false },
  orderBy: { date: 'desc' },
  limit: 20
});
```

### With Encryption (Optional)

```typescript
import { getMailbox } from '@happyvertical/messages';
import { getEncryption } from '@happyvertical/encryption';

const mailbox = await getMailbox({
  type: 'smtp',
  host: 'smtp.example.com',
  port: 587,
  auth: { user: 'user@example.com', pass: 'password' }
});

const encryption = await getEncryption({
  type: 'pgp',
  publicKey: recipientPublicKey,
  privateKey: myPrivateKey
});

// Encrypt message before sending
const message = {
  from: { address: 'user@example.com' },
  to: [{ address: 'recipient@example.com' }],
  subject: 'Encrypted message',
  text: 'Secret content'
};

const encrypted = await encryption.encryptEmail(message);
await mailbox.send(encrypted);
```

## Core Architecture

### Mailbox Interface

All adapters implement the `Mailbox` interface:

```typescript
interface Mailbox {
  // Send operations
  send(message: EmailMessage, options?: SendOptions): Promise<SendResult>;

  // Receive operations
  fetch(options?: FetchOptions): Promise<EmailMessage[]>;
  getMessage(messageId: string): Promise<EmailMessage>;

  // Mailbox management
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

  // Database synchronization
  sync(options?: SyncOptions): Promise<SyncResult>;

  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  // Adapter info
  getCapabilities(): Promise<MailboxCapabilities>;
  getAdapter(): AdapterType;
}
```

### Factory Pattern

```typescript
// Factory function
async function getMailbox(options: GetMailboxOptions): Promise<Mailbox>;

// Type guard functions
function isSMTPOptions(opts: GetMailboxOptions): opts is SMTPOptions;
function isIMAPOptions(opts: GetMailboxOptions): opts is IMAPOptions;
function isPOP3Options(opts: GetMailboxOptions): opts is POP3Options;
function isGmailOptions(opts: GetMailboxOptions): opts is GmailOptions;
```

### Base Adapter Class

```typescript
abstract class BaseMailbox implements Mailbox {
  protected config: MailboxConfig;
  protected db?: Database;
  protected logger: Logger;

  constructor(options: MailboxOptions) {
    this.config = this.validateConfig(options);
    this.db = options.db;
    this.logger = createLogger('email');
  }

  // Shared validation
  protected validateEmail(email: EmailAddress): void;
  protected validateMessage(message: EmailMessage): void;

  // Error mapping
  protected mapError(error: unknown): EmailError;

  // Database operations
  protected async saveMessage(message: EmailMessage): Promise<void>;
  protected async loadMessage(messageId: string): Promise<EmailMessage>;

  // Abstract methods adapters must implement
  abstract send(message: EmailMessage, options?: SendOptions): Promise<SendResult>;
  abstract fetch(options?: FetchOptions): Promise<EmailMessage[]>;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
}
```

## Adapters

### SMTP Adapter

**Purpose**: Send email via SMTP protocol

**Dependencies**: `nodemailer`

**Configuration**:

```typescript
interface SMTPOptions {
  type: 'smtp';

  // Connection
  host: string;
  port: number;
  secure?: boolean; // true for 465, false for other ports

  // Authentication
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

  // Options
  tls?: {
    rejectUnauthorized?: boolean;
    minVersion?: string;
  };
  connectionTimeout?: number;
  greetingTimeout?: number;
  socketTimeout?: number;
  pool?: boolean; // Use connection pooling
  maxConnections?: number;
  maxMessages?: number;

  // Database
  db?: Database;

  // Logging
  debug?: boolean;
}
```

**Capabilities**:
- ✅ Send email (plain text, HTML, attachments)
- ✅ Connection pooling
- ✅ OAuth2 authentication
- ✅ DKIM signing
- ❌ Receive email (use IMAP/POP3)
- ❌ Folder operations

**Example**:

```typescript
const smtp = await getMailbox({
  type: 'smtp',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'user@gmail.com',
    pass: 'app-password'
  },
  pool: true,
  maxConnections: 5
});

await smtp.send({
  from: { address: 'user@gmail.com', name: 'User Name' },
  to: [
    { address: 'recipient1@example.com' },
    { address: 'recipient2@example.com', name: 'Recipient 2' }
  ],
  cc: [{ address: 'cc@example.com' }],
  bcc: [{ address: 'bcc@example.com' }],
  subject: 'Hello',
  text: 'Plain text version',
  html: '<h1>HTML version</h1>',
  attachments: [
    {
      filename: 'document.pdf',
      content: buffer,
      contentType: 'application/pdf'
    },
    {
      filename: 'image.png',
      path: '/path/to/image.png',
      cid: 'image001' // For inline images
    }
  ],
  headers: {
    'X-Custom-Header': 'value'
  }
});
```

### IMAP Adapter

**Purpose**: Receive and manage email via IMAP protocol

**Dependencies**: `imapflow`, `mailparser`

**Configuration**:

```typescript
interface IMAPOptions {
  type: 'imap';

  // Connection
  host: string;
  port: number;
  secure?: boolean; // true for 993, false for 143

  // Authentication
  auth: {
    user: string;
    pass: string;
  } | {
    type: 'OAuth2';
    user: string;
    accessToken: string;
  };

  // Options
  tls?: {
    rejectUnauthorized?: boolean;
    minVersion?: string;
  };
  connectionTimeout?: number;
  greetingTimeout?: number;

  // Fetch behavior
  fetchOptions?: {
    bodyParts?: string[]; // Which MIME parts to fetch
    markSeen?: boolean;   // Mark as read when fetching
  };

  // Database
  db?: Database;

  // Logging
  debug?: boolean;
}
```

**Capabilities**:
- ✅ Receive email
- ✅ Folder operations (list, create, delete, rename)
- ✅ Search messages
- ✅ Mark read/unread
- ✅ Move/copy messages
- ✅ IDLE push notifications (optional)
- ❌ Send email (use SMTP)

**Example**:

```typescript
const imap = await getMailbox({
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

// List folders
const folders = await imap.listFolders();
console.log(folders); // ['INBOX', 'Sent', 'Drafts', 'Trash', ...]

// Select folder
await imap.selectFolder('INBOX');

// Fetch recent messages
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
  since: new Date('2024-01-01'),
  unread: true
});

// Mark as read
await imap.markRead(messages[0].id);

// Move to folder
await imap.move(messages[0].id, 'Archive');

await imap.disconnect();
```

### POP3 Adapter

**Purpose**: Simple email retrieval via POP3 protocol

**Dependencies**: `mailpop3`, `mailparser`

**Configuration**:

```typescript
interface POP3Options {
  type: 'pop3';

  // Connection
  host: string;
  port: number;
  secure?: boolean; // true for 995, false for 110

  // Authentication
  auth: {
    user: string;
    pass: string;
  };

  // Options
  tls?: {
    rejectUnauthorized?: boolean;
  };
  connectionTimeout?: number;

  // POP3-specific
  leaveOnServer?: boolean; // Don't delete messages after fetch

  // Database
  db?: Database;

  // Logging
  debug?: boolean;
}
```

**Capabilities**:
- ✅ Receive email
- ✅ Delete messages
- ✅ Leave messages on server (optional)
- ❌ Folder operations (POP3 has no folders)
- ❌ Search (limited to local)
- ❌ Mark read/unread
- ❌ Send email (use SMTP)

**Example**:

```typescript
const pop3 = await getMailbox({
  type: 'pop3',
  host: 'pop.gmail.com',
  port: 995,
  secure: true,
  auth: {
    user: 'user@gmail.com',
    pass: 'app-password'
  },
  leaveOnServer: true // Don't delete after fetching
});

await pop3.connect();

// Fetch all messages
const messages = await pop3.fetch();

// Process messages
for (const msg of messages) {
  console.log(`${msg.from.address}: ${msg.subject}`);
}

// Delete specific message
await pop3.delete(messages[0].id);

await pop3.disconnect();
```

### Gmail Adapter

**Purpose**: Combined send/receive using Gmail API with OAuth2

**Dependencies**: `googleapis`, `mailparser`

**Configuration**:

```typescript
interface GmailOptions {
  type: 'gmail';

  // OAuth2 authentication (required)
  auth: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accessToken?: string; // Optional, will be refreshed if expired
  };

  // Options
  userId?: string; // Default: 'me'

  // Database
  db?: Database;

  // Logging
  debug?: boolean;
}
```

**Capabilities**:
- ✅ Send email
- ✅ Receive email
- ✅ Label operations (Gmail uses labels, not folders)
- ✅ Search messages (Gmail's powerful search syntax)
- ✅ Mark read/unread
- ✅ Move/copy messages between labels
- ✅ Thread support
- ✅ Native OAuth2

**Example**:

```typescript
const gmail = await getMailbox({
  type: 'gmail',
  auth: {
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN
  }
});

// Send email
await gmail.send({
  from: { address: 'user@gmail.com' },
  to: [{ address: 'recipient@example.com' }],
  subject: 'Via Gmail API',
  text: 'Sent using Gmail API'
});

// Fetch with Gmail-specific options
const messages = await gmail.fetch({
  labelIds: ['INBOX', 'UNREAD'],
  maxResults: 10,
  q: 'from:sender@example.com subject:important' // Gmail search syntax
});

// Label operations
const labels = await gmail.listFolders(); // Returns Gmail labels
await gmail.addLabel(messages[0].id, 'Important');
await gmail.removeLabel(messages[0].id, 'UNREAD');

// Thread support
const thread = await gmail.getThread(messages[0].threadId);
```

## Type Definitions

### Core Types

```typescript
interface EmailMessage {
  // Identity
  id?: string;              // Provider-specific message ID
  messageId?: string;       // RFC 822 Message-ID header
  threadId?: string;        // Thread ID (Gmail)
  inReplyTo?: string;       // In-Reply-To header
  references?: string[];    // References header

  // Headers
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  date?: Date;

  // Content
  text?: string;            // Plain text body
  html?: string;            // HTML body
  attachments?: Attachment[];

  // Metadata
  folder?: string;          // Current folder/label
  labels?: string[];        // Gmail labels
  flags?: MessageFlag[];    // IMAP flags
  headers?: Record<string, string | string[]>;

  // Raw data
  raw?: string;             // Original RFC 822 message
  size?: number;            // Size in bytes
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
  contentId?: string;       // For inline images (<img src="cid:...">)
  contentDisposition?: 'attachment' | 'inline';
  path?: string;            // File path (alternative to content)
}

type MessageFlag =
  | '\\Seen'       // Read
  | '\\Answered'   // Replied
  | '\\Flagged'    // Starred/Important
  | '\\Deleted'    // Marked for deletion
  | '\\Draft'      // Draft message
  | '\\Recent'     // Recent message
  | string;        // Custom flags

interface Folder {
  name: string;
  path: string;             // Full path (e.g., 'INBOX/Archive/2024')
  delimiter: string;        // Hierarchy delimiter (e.g., '/')
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

interface FolderInfo {
  name: string;
  exists: number;           // Total messages
  recent: number;           // Recent messages
  unseen: number;           // Unread messages
  uidValidity: number;      // IMAP UID validity
  uidNext: number;          // Next UID
  flags: string[];          // Available flags
  permanentFlags: string[]; // Permanent flags
}
```

### Options Types

```typescript
interface SendOptions {
  // Delivery options
  envelope?: {
    from?: string;
    to?: string | string[];
  };

  // Encoding
  encoding?: string;
  textEncoding?: 'quoted-printable' | 'base64';

  // Headers
  headers?: Record<string, string | string[]>;
  messageId?: string;       // Custom Message-ID
  date?: Date;              // Custom Date

  // Tracking
  dsn?: {                   // Delivery Status Notification
    notify?: 'never' | 'success' | 'failure' | 'delay';
    ret?: 'full' | 'hdrs';
  };

  // Priority
  priority?: 'high' | 'normal' | 'low';
}

interface FetchOptions {
  // Folder selection
  folder?: string;          // Default: 'INBOX'
  labelIds?: string[];      // Gmail labels

  // Message selection
  messageIds?: string[];    // Specific message IDs
  limit?: number;
  offset?: number;

  // Filters
  unreadOnly?: boolean;
  since?: Date;
  before?: Date;

  // Content options
  bodyParts?: string[];     // Which MIME parts to fetch
  markSeen?: boolean;       // Mark as read when fetching

  // Gmail-specific
  q?: string;               // Gmail search query
  maxResults?: number;      // Gmail result limit
}

interface SearchCriteria {
  // Basic search
  from?: string;
  to?: string;
  subject?: string;
  body?: string;

  // Date range
  since?: Date;
  before?: Date;
  sentSince?: Date;
  sentBefore?: Date;

  // Flags
  unread?: boolean;
  flagged?: boolean;
  answered?: boolean;
  draft?: boolean;
  deleted?: boolean;

  // Size
  larger?: number;          // Bytes
  smaller?: number;         // Bytes

  // Headers
  header?: Record<string, string>;

  // Gmail-specific
  q?: string;               // Raw Gmail search query
}

interface SyncOptions {
  // Folder selection
  folders?: string[];       // Default: ['INBOX']

  // Date range
  since?: Date;
  before?: Date;

  // Sync behavior
  fullSync?: boolean;       // Sync all messages (vs incremental)
  deleteRemoved?: boolean;  // Delete local messages removed from server

  // Content options
  downloadAttachments?: boolean;
  maxAttachmentSize?: number; // Skip large attachments

  // Performance
  batchSize?: number;       // Messages per batch
  maxConcurrency?: number;  // Parallel operations

  // Callbacks
  onProgress?: (stats: SyncProgress) => void;
  onError?: (error: Error, message?: EmailMessage) => void;
}

interface SyncProgress {
  folder: string;
  processed: number;
  total: number;
  downloaded: number;
  skipped: number;
  errors: number;
}

interface SyncResult {
  folders: string[];
  messagesProcessed: number;
  messagesDownloaded: number;
  messagesSkipped: number;
  errors: EmailError[];
  duration: number;         // Milliseconds
}

interface SendResult {
  messageId: string;
  accepted: string[];       // Accepted recipients
  rejected: string[];       // Rejected recipients
  response: string;         // Server response
}
```

### Adapter Configuration

```typescript
type GetMailboxOptions =
  | SMTPOptions
  | IMAPOptions
  | POP3Options
  | GmailOptions;

type AdapterType = 'smtp' | 'imap' | 'pop3' | 'gmail';

interface MailboxCapabilities {
  send: boolean;
  receive: boolean;
  folders: boolean;
  search: boolean;
  markRead: boolean;
  move: boolean;
  delete: boolean;
  threads: boolean;
  oauth: boolean;
  encryption: boolean;      // If @happyvertical/encryption available
}
```

## Database Schema

When `db` option is provided, messages are synchronized to the database using these tables:

### Tables

```sql
-- Email accounts
CREATE TABLE IF NOT EXISTS email_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  provider_type TEXT NOT NULL, -- 'smtp', 'imap', 'pop3', 'gmail'

  -- Connection settings (encrypted)
  settings TEXT NOT NULL,      -- JSON with host, port, auth, etc.

  -- Metadata
  last_sync_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Folders/Labels
CREATE TABLE IF NOT EXISTS email_folders (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  delimiter TEXT DEFAULT '/',
  special_use TEXT,            -- '\\Inbox', '\\Sent', etc.

  -- Statistics
  message_count INTEGER DEFAULT 0,
  unread_count INTEGER DEFAULT 0,

  -- Metadata
  subscribed INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
  UNIQUE (account_id, path)
);

-- Messages
CREATE TABLE IF NOT EXISTS email_messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  message_id TEXT NOT NULL,    -- RFC 822 Message-ID
  thread_id TEXT,
  in_reply_to TEXT,

  -- Headers
  from_address TEXT NOT NULL,
  from_name TEXT,
  to_addresses TEXT NOT NULL,  -- JSON array
  cc_addresses TEXT,           -- JSON array
  bcc_addresses TEXT,          -- JSON array
  reply_to_address TEXT,
  reply_to_name TEXT,
  subject TEXT NOT NULL,
  date TEXT NOT NULL,          -- ISO 8601

  -- Content
  text_body TEXT,
  html_body TEXT,

  -- Location
  folder_id TEXT,
  folder_path TEXT,
  labels TEXT,                 -- JSON array (Gmail)

  -- Flags
  flags TEXT,                  -- JSON array
  is_read INTEGER DEFAULT 0,
  is_flagged INTEGER DEFAULT 0,
  is_answered INTEGER DEFAULT 0,
  is_draft INTEGER DEFAULT 0,

  -- Metadata
  has_attachments INTEGER DEFAULT 0,
  size INTEGER,
  raw_message TEXT,            -- Full RFC 822 (optional)
  headers TEXT,                -- JSON object

  -- Timestamps
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES email_folders(id) ON DELETE SET NULL,
  UNIQUE (account_id, message_id)
);

-- Attachments
CREATE TABLE IF NOT EXISTS email_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  filename TEXT,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  content_id TEXT,
  content_disposition TEXT,    -- 'attachment' or 'inline'

  -- Content storage
  content BLOB,                -- Binary data (optional)
  file_path TEXT,              -- External file path (alternative)

  -- Metadata
  created_at TEXT NOT NULL,

  FOREIGN KEY (message_id) REFERENCES email_messages(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_account_folder
  ON email_messages(account_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_messages_date
  ON email_messages(date DESC);
CREATE INDEX IF NOT EXISTS idx_messages_read
  ON email_messages(is_read);
CREATE INDEX IF NOT EXISTS idx_messages_thread
  ON email_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_attachments_message
  ON email_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_folders_account
  ON email_folders(account_id);

-- Full-text search (SQLite)
CREATE VIRTUAL TABLE IF NOT EXISTS email_messages_fts USING fts5(
  subject,
  text_body,
  from_address,
  content='email_messages',
  content_rowid='rowid'
);
```

### Database Operations

```typescript
// Save message to database
await mailbox.sync({ folders: ['INBOX'] });

// Query local messages
const db = mailbox.getDatabase();
const messages = await db.select('email_messages', {
  where: {
    account_id: accountId,
    is_read: false
  },
  orderBy: { date: 'desc' },
  limit: 20
});

// Full-text search
const results = await db.query(`
  SELECT m.* FROM email_messages m
  JOIN email_messages_fts fts ON m.rowid = fts.rowid
  WHERE fts MATCH ?
  ORDER BY rank
  LIMIT 20
`, ['important project']);

// Statistics
const stats = await db.query(`
  SELECT
    f.name,
    COUNT(*) as total,
    SUM(CASE WHEN m.is_read = 0 THEN 1 ELSE 0 END) as unread
  FROM email_messages m
  JOIN email_folders f ON m.folder_id = f.id
  WHERE m.account_id = ?
  GROUP BY f.id
`, [accountId]);
```

## Encryption Integration

The `@happyvertical/messages` package integrates with `@happyvertical/encryption` to provide PGP email encryption and digital signatures. Encryption is available as an optional peer dependency.

### Prerequisites

```bash
pnpm add @happyvertical/encryption
```

### Email-Specific Encryption

The encryption package provides `encryptEmail()` and `decryptEmail()` methods specifically designed for email:

```typescript
import { getMailbox } from '@happyvertical/messages';
import { getEncryption } from '@happyvertical/encryption';

// Setup encryption
const encryption = await getEncryption({
  type: 'pgp',
  publicKey: recipientPublicKeyArmored,
  privateKey: myPrivateKeyArmored,
  passphrase: 'my-key-passphrase'
});

// Setup mailbox
const mailbox = await getMailbox({
  type: 'smtp',
  host: 'smtp.example.com',
  port: 587,
  auth: { user: 'user@example.com', pass: 'password' }
});

// Encrypt and send
const message = {
  from: { address: 'user@example.com' },
  to: [{ address: 'recipient@example.com' }],
  subject: 'Confidential',
  text: 'This will be encrypted'
};

const encrypted = await encryption.encryptEmail(message, {
  sign: true,  // Also sign with my private key
  armor: true  // ASCII-armored output
});

await mailbox.send(encrypted);

// Receive and decrypt
const imap = await getMailbox({ type: 'imap', /* ... */ });
const received = await imap.fetch({ limit: 1 });
const decrypted = await encryption.decryptEmail(received[0], {
  verify: true  // Verify signature
});

console.log(decrypted.text); // Original plain text
console.log(decrypted.verified); // Signature valid
```

### Encryption Capabilities

The `@happyvertical/encryption` package provides the following email encryption capabilities:

1. **PGP Encryption** (via OpenPGP.js):
   - `encryptEmail(message, options)` - Encrypt email message
   - `decryptEmail(message, options)` - Decrypt email message
   - `signEmail(message, options)` - Sign email message
   - `verifyEmail(message, options)` - Verify email signature
   - Key management (generate, import, export)

2. **Key Management**:
   - Generate RSA and ECC keypairs
   - Import/export keys (armored format)
   - Keyring management
   - Passphrase protection

3. **Additional Features**:
   - Attachment encryption
   - PGP/MIME format support
   - Signature verification
   - Multiple recipient encryption

4. **Future Enhancements**:
   - S/MIME support for certificate-based encryption
   - X.509 certificate management

### Encryption API

```typescript
// Email encryption interface provided by @happyvertical/encryption
interface EmailEncryption {
  encryptEmail(
    message: EmailMessage,
    options: EncryptEmailOptions
  ): Promise<EmailMessage>;

  decryptEmail(
    message: EmailMessage,
    options: DecryptEmailOptions
  ): Promise<DecryptedEmail>;

  signEmail(
    message: EmailMessage,
    options: SignEmailOptions
  ): Promise<EmailMessage>;

  verifyEmail(
    message: EmailMessage,
    options: VerifyEmailOptions
  ): Promise<VerificationResult>;
}

interface EncryptEmailOptions {
  publicKey?: string;        // Recipient public key (armored)
  publicKeys?: string[];     // Multiple recipients
  sign?: boolean;            // Also sign with private key
  armor?: boolean;           // ASCII-armored output (default: true)
  compression?: boolean;     // Compress before encrypting
}

interface DecryptEmailOptions {
  privateKey: string;        // Private key (armored)
  passphrase?: string;       // Key passphrase
  verify?: boolean;          // Verify signature if present
}

interface DecryptedEmail extends EmailMessage {
  encrypted: boolean;        // Was encrypted
  signed: boolean;           // Was signed
  verified?: boolean;        // Signature verification result
  signerKeyId?: string;      // Signer's key ID
}

interface SignEmailOptions {
  privateKey: string;
  passphrase?: string;
  detached?: boolean;        // Detached signature
  armor?: boolean;
}

interface VerificationResult {
  valid: boolean;
  keyId: string;
  keyFingerprint: string;
  timestamp: Date;
  message?: string;
}
```

### Working Examples

Based on integration tests demonstrating actual encryption functionality:

#### Complete Encryption/Decryption Workflow

```typescript
import { getEncryption } from '@happyvertical/encryption';
import { getMailbox } from '@happyvertical/messages';
import type { EmailMessage } from '@happyvertical/messages';

// Generate keypairs for sender and recipient
const pgp = await getEncryption({ type: 'pgp' });

const senderKeys = await pgp.generateKeyPair({
  name: 'Alice Sender',
  email: 'alice@example.com',
  passphrase: 'sender-passphrase',
  type: 'rsa',
  keySize: 4096
});

const recipientKeys = await pgp.generateKeyPair({
  name: 'Bob Recipient',
  email: 'bob@example.com',
  passphrase: 'recipient-passphrase',
  type: 'rsa',
  keySize: 4096
});

// Setup encryption for sender
const senderEncryption = await getEncryption({
  type: 'pgp',
  publicKey: recipientKeys.publicKey,
  privateKey: senderKeys.privateKey,
  passphrase: 'sender-passphrase'
});

// Create message
const message: EmailMessage = {
  from: { address: 'alice@example.com', name: 'Alice Sender' },
  to: [{ address: 'bob@example.com', name: 'Bob Recipient' }],
  subject: 'Confidential Information',
  text: 'This is secret data that should be encrypted',
  html: '<p>This is <strong>secret data</strong> that should be encrypted</p>'
};

// Encrypt and sign the message
const encrypted = await senderEncryption.encryptEmail(message, {
  sign: true,
  armor: true
});

// Verify encrypted content
console.log(encrypted.text.includes('-----BEGIN PGP MESSAGE-----')); // true
console.log(encrypted.text.includes('This is secret data')); // false

// Send via SMTP
const smtp = await getMailbox({
  type: 'smtp',
  host: 'smtp.example.com',
  port: 587,
  auth: { user: 'alice@example.com', pass: 'password' }
});
await smtp.send(encrypted);

// --- On recipient side ---

// Setup encryption for recipient
const recipientEncryption = await getEncryption({
  type: 'pgp',
  publicKey: senderKeys.publicKey,
  privateKey: recipientKeys.privateKey,
  passphrase: 'recipient-passphrase'
});

// Receive via IMAP
const imap = await getMailbox({
  type: 'imap',
  host: 'imap.example.com',
  port: 993,
  secure: true,
  auth: { user: 'bob@example.com', pass: 'password' }
});

await imap.connect();
const messages = await imap.fetch({ limit: 1 });
await imap.disconnect();

// Decrypt and verify
const decrypted = await recipientEncryption.decryptEmail(messages[0], {
  verify: true
});

// Access decrypted content
console.log(decrypted.text); // "This is secret data that should be encrypted"
console.log(decrypted.html); // "<p>This is <strong>secret data</strong>...</p>"
console.log(decrypted.subject); // "Confidential Information"
console.log(decrypted.encrypted); // true
console.log(decrypted.signed); // true
console.log(decrypted.verified); // true
```

#### Encrypting Messages with Attachments

```typescript
const message: EmailMessage = {
  from: { address: 'sender@example.com' },
  to: [{ address: 'recipient@example.com' }],
  subject: 'Confidential Document',
  text: 'Please review the attached document',
  attachments: [
    {
      filename: 'confidential.pdf',
      contentType: 'application/pdf',
      size: 102400,
      content: pdfBuffer
    },
    {
      filename: 'report.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 51200,
      content: xlsxBuffer
    }
  ]
};

// Encrypt message including attachments
const encrypted = await encryption.encryptEmail(message, {
  sign: true
});

// All attachments are encrypted
console.log(encrypted.attachments); // Encrypted attachment data

// After decryption, attachments are restored
const decrypted = await recipientEncryption.decryptEmail(encrypted);
console.log(decrypted.attachments[0].filename); // "confidential.pdf"
console.log(decrypted.attachments[0].content); // Original PDF buffer
```

#### Detecting Invalid Signatures

```typescript
// Encrypt and sign with sender's keys
const encrypted = await senderEncryption.encryptEmail(message, {
  sign: true
});

// Try to verify with wrong public key
const wrongKeys = await pgp.generateKeyPair({
  name: 'Attacker',
  email: 'attacker@example.com',
  passphrase: 'wrong-pass',
  type: 'rsa',
  keySize: 2048
});

const maliciousEncryption = await getEncryption({
  type: 'pgp',
  publicKey: wrongKeys.publicKey,  // Wrong sender key
  privateKey: recipientKeys.privateKey,
  passphrase: 'recipient-passphrase'
});

const decrypted = await maliciousEncryption.decryptEmail(encrypted, {
  verify: true
});

// Signature verification fails
console.log(decrypted.verified); // false
console.log(decrypted.verificationError); // Error message
```

#### Checking Encryption Availability

```typescript
import { hasEncryption } from '@happyvertical/messages/encryption';

if (hasEncryption()) {
  console.log('Encryption is available');
  const { getEncryption } = await import('@happyvertical/encryption');
  const encryption = await getEncryption({ type: 'pgp', ... });
  // Use encryption features
} else {
  console.warn('Encryption package not installed');
  // Fallback to unencrypted communication or show warning
}
```

## Error Handling

### Error Classes

```typescript
// Base error
class EmailError extends Error {
  code: string;
  provider?: string;
  cause?: unknown;

  constructor(message: string, code: string, provider?: string, cause?: unknown) {
    super(message);
    this.name = 'EmailError';
    this.code = code;
    this.provider = provider;
    this.cause = cause;
  }
}

// Connection errors
class ConnectionError extends EmailError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'CONNECTION_ERROR', provider, cause);
    this.name = 'ConnectionError';
  }
}

class TimeoutError extends EmailError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'TIMEOUT_ERROR', provider, cause);
    this.name = 'TimeoutError';
  }
}

// Authentication errors
class AuthenticationError extends EmailError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', provider, cause);
    this.name = 'AuthenticationError';
  }
}

class AuthorizationError extends EmailError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'AUTHORIZATION_ERROR', provider, cause);
    this.name = 'AuthorizationError';
  }
}

// Message errors
class MessageNotFoundError extends EmailError {
  messageId: string;

  constructor(messageId: string, provider?: string) {
    super(`Message not found: ${messageId}`, 'MESSAGE_NOT_FOUND', provider);
    this.name = 'MessageNotFoundError';
    this.messageId = messageId;
  }
}

class InvalidMessageError extends EmailError {
  constructor(message: string, provider?: string, cause?: unknown) {
    super(message, 'INVALID_MESSAGE', provider, cause);
    this.name = 'InvalidMessageError';
  }
}

// Folder errors
class FolderNotFoundError extends EmailError {
  folder: string;

  constructor(folder: string, provider?: string) {
    super(`Folder not found: ${folder}`, 'FOLDER_NOT_FOUND', provider);
    this.name = 'FolderNotFoundError';
    this.folder = folder;
  }
}

class FolderExistsError extends EmailError {
  folder: string;

  constructor(folder: string, provider?: string) {
    super(`Folder already exists: ${folder}`, 'FOLDER_EXISTS', provider);
    this.name = 'FolderExistsError';
    this.folder = folder;
  }
}

// Send errors
class SendError extends EmailError {
  accepted: string[];
  rejected: string[];

  constructor(
    message: string,
    accepted: string[],
    rejected: string[],
    provider?: string,
    cause?: unknown
  ) {
    super(message, 'SEND_ERROR', provider, cause);
    this.name = 'SendError';
    this.accepted = accepted;
    this.rejected = rejected;
  }
}

// Attachment errors
class AttachmentError extends EmailError {
  filename?: string;

  constructor(message: string, filename?: string, provider?: string, cause?: unknown) {
    super(message, 'ATTACHMENT_ERROR', provider, cause);
    this.name = 'AttachmentError';
    this.filename = filename;
  }
}

// Sync errors
class SyncError extends EmailError {
  folder?: string;

  constructor(message: string, folder?: string, provider?: string, cause?: unknown) {
    super(message, 'SYNC_ERROR', provider, cause);
    this.name = 'SyncError';
    this.folder = folder;
  }
}
```

### Error Handling Examples

```typescript
import {
  getMailbox,
  ConnectionError,
  AuthenticationError,
  SendError,
  MessageNotFoundError
} from '@happyvertical/messages';

try {
  const mailbox = await getMailbox({
    type: 'imap',
    host: 'imap.example.com',
    port: 993,
    secure: true,
    auth: { user: 'user@example.com', pass: 'wrong-password' }
  });
  await mailbox.connect();
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid credentials:', error.message);
  } else if (error instanceof ConnectionError) {
    console.error('Cannot connect to server:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}

// Send with error handling
try {
  await mailbox.send({
    from: { address: 'sender@example.com' },
    to: [
      { address: 'valid@example.com' },
      { address: 'invalid@' }
    ],
    subject: 'Test',
    text: 'Body'
  });
} catch (error) {
  if (error instanceof SendError) {
    console.log('Accepted:', error.accepted);
    console.log('Rejected:', error.rejected);
  }
}

// Fetch with error handling
try {
  const message = await mailbox.getMessage('nonexistent-id');
} catch (error) {
  if (error instanceof MessageNotFoundError) {
    console.error('Message not found:', error.messageId);
  }
}
```

## Environment Variables

The package supports environment variables following the `HAVE_MESSAGES_*` pattern:

```bash
# Common settings
HAVE_MESSAGES_TYPE=imap                    # Adapter type
HAVE_MESSAGES_HOST=imap.example.com       # Server host
HAVE_MESSAGES_PORT=993                    # Server port
HAVE_MESSAGES_SECURE=true                 # Use TLS/SSL
HAVE_MESSAGES_USER=user@example.com       # Username
HAVE_MESSAGES_PASSWORD=secret             # Password

# SMTP-specific
HAVE_MESSAGES_SMTP_HOST=smtp.example.com
HAVE_MESSAGES_SMTP_PORT=587
HAVE_MESSAGES_SMTP_SECURE=false

# IMAP-specific
HAVE_MESSAGES_IMAP_HOST=imap.example.com
HAVE_MESSAGES_IMAP_PORT=993
HAVE_MESSAGES_IMAP_SECURE=true

# Gmail OAuth2
HAVE_MESSAGES_GMAIL_CLIENT_ID=client-id
HAVE_MESSAGES_GMAIL_CLIENT_SECRET=client-secret
HAVE_MESSAGES_GMAIL_REFRESH_TOKEN=refresh-token

# Database
HAVE_MESSAGES_DB_TYPE=sqlite
HAVE_MESSAGES_DB_URL=./email.db

# Encryption (when @happyvertical/encryption installed)
HAVE_MESSAGES_ENCRYPTION_TYPE=pgp
HAVE_MESSAGES_ENCRYPTION_PUBLIC_KEY=/path/to/public.asc
HAVE_MESSAGES_ENCRYPTION_PRIVATE_KEY=/path/to/private.asc
HAVE_MESSAGES_ENCRYPTION_PASSPHRASE=key-passphrase

# Debug
HAVE_MESSAGES_DEBUG=true
```

Load from environment:

```typescript
import { getMailbox } from '@happyvertical/messages';

// Automatically loads from environment variables
const mailbox = await getMailbox({
  type: process.env.HAVE_MESSAGES_TYPE as any || 'imap'
  // Other options loaded automatically
});
```

## Testing

### Unit Tests

Test each adapter independently:

```typescript
// smtp.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getMailbox } from '../src';

describe('SMTP Adapter', () => {
  let smtp: Mailbox;

  beforeEach(async () => {
    smtp = await getMailbox({
      type: 'smtp',
      host: 'localhost',
      port: 1025, // Test SMTP server
      secure: false
    });
  });

  it('should send plain text email', async () => {
    const result = await smtp.send({
      from: { address: 'sender@test.com' },
      to: [{ address: 'recipient@test.com' }],
      subject: 'Test',
      text: 'Test body'
    });

    expect(result.accepted).toEqual(['recipient@test.com']);
    expect(result.rejected).toEqual([]);
  });

  it('should send HTML email with attachments', async () => {
    const result = await smtp.send({
      from: { address: 'sender@test.com' },
      to: [{ address: 'recipient@test.com' }],
      subject: 'Test',
      html: '<p>HTML body</p>',
      attachments: [
        {
          filename: 'test.txt',
          content: Buffer.from('Test content'),
          contentType: 'text/plain'
        }
      ]
    });

    expect(result.accepted.length).toBeGreaterThan(0);
  });

  it('should handle invalid recipients', async () => {
    await expect(
      smtp.send({
        from: { address: 'sender@test.com' },
        to: [{ address: 'invalid@' }],
        subject: 'Test',
        text: 'Body'
      })
    ).rejects.toThrow(SendError);
  });
});
```

### Integration Tests

Test full workflows:

```typescript
// integration.test.ts
import { describe, it, expect } from 'vitest';
import { getMailbox } from '../src';
import { getDatabase } from '@happyvertical/sql';

describe('Email Integration', () => {
  it('should send and receive email', async () => {
    // Setup SMTP
    const smtp = await getMailbox({
      type: 'smtp',
      host: 'localhost',
      port: 1025,
      secure: false
    });

    // Setup IMAP
    const imap = await getMailbox({
      type: 'imap',
      host: 'localhost',
      port: 1143,
      secure: false,
      auth: { user: 'test@localhost', pass: 'password' }
    });

    // Send email
    await smtp.send({
      from: { address: 'sender@localhost' },
      to: [{ address: 'test@localhost' }],
      subject: 'Integration Test',
      text: 'Test body'
    });

    // Wait for delivery
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Fetch email
    await imap.connect();
    const messages = await imap.fetch({ limit: 1 });
    await imap.disconnect();

    expect(messages.length).toBe(1);
    expect(messages[0].subject).toBe('Integration Test');
    expect(messages[0].text).toContain('Test body');
  });

  it('should sync to database', async () => {
    const db = await getDatabase({ type: 'sqlite', url: ':memory:' });

    const imap = await getMailbox({
      type: 'imap',
      host: 'localhost',
      port: 1143,
      secure: false,
      auth: { user: 'test@localhost', pass: 'password' },
      db
    });

    await imap.connect();
    const result = await imap.sync({ folders: ['INBOX'] });
    await imap.disconnect();

    expect(result.messagesDownloaded).toBeGreaterThan(0);

    // Query database
    const messages = await db.select('email_messages', {
      where: { folder_path: 'INBOX' }
    });

    expect(messages.length).toBeGreaterThan(0);
  });
});
```

### Test Utilities

Provide test helpers:

```typescript
// test/helpers.ts
export async function createTestMailbox(type: AdapterType = 'smtp') {
  return await getMailbox({
    type,
    host: 'localhost',
    port: type === 'smtp' ? 1025 : 1143,
    secure: false,
    auth: type !== 'smtp' ? { user: 'test@localhost', pass: 'password' } : undefined
  });
}

export function createTestMessage(overrides?: Partial<EmailMessage>): EmailMessage {
  return {
    from: { address: 'sender@test.com', name: 'Test Sender' },
    to: [{ address: 'recipient@test.com', name: 'Test Recipient' }],
    subject: 'Test Subject',
    text: 'Test body',
    date: new Date(),
    ...overrides
  };
}

export async function waitForDelivery(ms: number = 1000): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## Implementation Phases

### Phase 1: Core Foundation (Week 1-2)
- [ ] Package setup (package.json, tsconfig.json, vite.config.ts)
- [ ] Core types and interfaces (`EmailMessage`, `Mailbox`, etc.)
- [ ] Factory pattern (`getMailbox()` with type guards)
- [ ] Error classes hierarchy
- [ ] Base adapter class with shared functionality
- [ ] Environment variable support
- [ ] Basic unit tests

### Phase 2: SMTP Adapter (Week 2-3)
- [ ] SMTP adapter implementation (Nodemailer wrapper)
- [ ] Send plain text and HTML
- [ ] Attachments support (files, inline images)
- [ ] Multiple recipients (To, CC, BCC)
- [ ] Connection pooling
- [ ] OAuth2 authentication support
- [ ] Unit tests for SMTP
- [ ] Integration tests (send)

### Phase 3: IMAP Adapter (Week 3-4)
- [ ] IMAP adapter implementation (ImapFlow wrapper)
- [ ] Connect/disconnect operations
- [ ] Fetch messages with filters
- [ ] Folder operations (list, create, delete)
- [ ] Message operations (mark read, move, delete)
- [ ] Search functionality
- [ ] OAuth2 authentication support
- [ ] Unit tests for IMAP
- [ ] Integration tests (receive)

### Phase 4: Message Parsing (Week 4-5)
- [ ] Mailparser integration
- [ ] Multipart message handling
- [ ] Attachment extraction
- [ ] Encoding support (UTF-8, Base64, etc.)
- [ ] Header parsing
- [ ] HTML to text conversion
- [ ] Unit tests for parsing

### Phase 5: Database Synchronization (Week 5-6)
- [ ] Database schema implementation
- [ ] Sync operations (fetch → store)
- [ ] Incremental sync support
- [ ] Full-text search setup
- [ ] Statistics tracking
- [ ] Attachment storage strategy
- [ ] Unit tests for sync
- [ ] Integration tests (sync)

### Phase 6: POP3 Adapter (Week 6-7)
- [ ] POP3 adapter implementation (mailpop3 wrapper)
- [ ] Fetch messages
- [ ] Delete operations
- [ ] Leave-on-server option
- [ ] Unit tests for POP3
- [ ] Integration tests

### Phase 7: Gmail Adapter (Week 7-8)
- [ ] Gmail API integration (googleapis)
- [ ] OAuth2 flow implementation
- [ ] Send via Gmail API
- [ ] Receive via Gmail API
- [ ] Label operations
- [ ] Thread support
- [ ] Gmail search syntax
- [ ] Unit tests for Gmail
- [ ] Integration tests (OAuth2)

### Phase 8: Encryption Integration (Week 8-9)
- [ ] Define encryption interface for email
- [ ] Document encryption package requirements
- [ ] Optional encryption detection
- [ ] Email encryption/decryption examples
- [ ] PGP/MIME format support
- [ ] Integration tests with mock encryption

### Phase 9: Documentation & Polish (Week 9-10)
- [ ] Complete CLAUDE.md documentation
- [ ] API reference generation (TypeDoc)
- [ ] Usage examples and tutorials
- [ ] Migration guide (if applicable)
- [ ] Performance optimization
- [ ] Error message improvements
- [ ] Code cleanup and refactoring

### Phase 10: Advanced Features (Future)
- [ ] IDLE/push notifications (IMAP)
- [ ] Streaming large attachments
- [ ] S/MIME support
- [ ] Outlook/Exchange adapter
- [ ] Rate limiting and quota management
- [ ] Retry logic with exponential backoff
- [ ] Connection keep-alive
- [ ] Message caching layer
- [ ] Webhook notifications

## Dependencies

### Runtime Dependencies

```json
{
  "dependencies": {
    "nodemailer": "^6.9.8",
    "imapflow": "^1.0.156",
    "mailpop3": "^1.0.1",
    "mailparser": "^3.6.6",
    "googleapis": "^131.0.0",
    "@happyvertical/utils": "workspace:*",
    "@happyvertical/logger": "workspace:*",
    "@happyvertical/sql": "workspace:*"
  },
  "peerDependencies": {
    "@happyvertical/encryption": "*"
  },
  "peerDependenciesMeta": {
    "@happyvertical/encryption": {
      "optional": true
    }
  },
  "devDependencies": {
    "@types/node": "^20.11.5",
    "@types/nodemailer": "^6.4.14",
    "typescript": "^5.3.3",
    "vite": "^5.0.11",
    "vite-plugin-dts": "^3.7.1",
    "vitest": "^1.2.1"
  }
}
```

### Development Dependencies

- Test SMTP server: `smtp-server` or use Mailhog/MailCatcher
- Test IMAP server: `imap-server` or use Dovecot
- OAuth2 mock server for Gmail testing

## Package Structure

```
packages/messages/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
├── CLAUDE.md                     # This file
├── BRAINSTORM.md                 # Original brainstorm notes
├── src/
│   ├── index.ts                  # Main exports
│   ├── shared/
│   │   ├── types.ts             # Core interfaces and types
│   │   ├── factory.ts           # getMailbox() factory
│   │   ├── base.ts              # BaseMailbox abstract class
│   │   ├── errors.ts            # Error classes
│   │   └── utils.ts             # Shared utilities
│   ├── adapters/
│   │   ├── smtp.ts              # SMTP adapter
│   │   ├── imap.ts              # IMAP adapter
│   │   ├── pop3.ts              # POP3 adapter
│   │   └── gmail.ts             # Gmail API adapter
│   ├── parser/
│   │   ├── index.ts             # Email parser
│   │   └── mime.ts              # MIME handling
│   ├── sync/
│   │   ├── index.ts             # Database sync
│   │   ├── schema.ts            # Database schema
│   │   └── operations.ts        # Sync operations
│   └── encryption/
│       └── integration.ts       # Encryption package integration
└── test/
    ├── unit/
    │   ├── smtp.test.ts
    │   ├── imap.test.ts
    │   ├── pop3.test.ts
    │   └── gmail.test.ts
    ├── integration/
    │   ├── send-receive.test.ts
    │   ├── sync.test.ts
    │   └── encryption.test.ts
    └── helpers/
        ├── fixtures.ts
        └── test-servers.ts
```

## Related Packages

- **@happyvertical/sql** - Database operations for message storage
- **@happyvertical/utils** - Shared utilities (ID generation, logging)
- **@happyvertical/logger** - Logging infrastructure
- **@happyvertical/encryption** - Encryption adapters (PGP, S/MIME) - *to be created*

## Future Enhancements

1. **Additional Providers**:
   - Microsoft Exchange (EWS)
   - Microsoft Graph API (Office 365)
   - AWS SES
   - SendGrid
   - Mailgun
   - Postmark

2. **Advanced Features**:
   - Real-time notifications (IMAP IDLE, Gmail push)
   - Message threading
   - Conversation grouping
   - Smart filters and rules
   - Spam detection
   - Email templates
   - Scheduled sending

3. **Performance**:
   - Message streaming for large attachments
   - Connection pooling for IMAP
   - Caching layer (Redis)
   - Batch operations
   - Worker threads for parsing

4. **Security**:
   - DMARC validation
   - SPF/DKIM verification
   - Virus scanning integration
   - Content security policies
   - PII detection and redaction

## Contributing

See root [CONTRIBUTING.md](../../CONTRIBUTING.md) for general guidelines.

### Email Package Specific Guidelines

1. **Adding New Adapters**:
   - Extend `BaseMailbox` class
   - Implement all required `Mailbox` interface methods
   - Add comprehensive unit tests
   - Update this documentation

2. **Testing**:
   - Use local test servers (Mailhog, Dovecot)
   - Mock external APIs (Gmail, Outlook)
   - Test with real email providers in CI/CD
   - Include edge cases (large attachments, malformed emails)

3. **Error Handling**:
   - Use specific error classes
   - Include provider information in errors
   - Provide actionable error messages
   - Log errors appropriately

## License

MIT License - see [LICENSE](../../LICENSE)
