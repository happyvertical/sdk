# @happyvertical/messages

Unified email operations with adapter-based architecture for sending, receiving, and managing email across multiple providers and protocols.

## Installation

```bash
pnpm add @happyvertical/messages
```

## Quick Start

### Sending Email (SMTP)

```typescript
import { getMailbox } from '@happyvertical/messages';

// Create SMTP adapter
const smtp = await getMailbox({
  type: 'smtp',
  host: 'smtp.gmail.com',
  port: 587,
  auth: {
    user: 'user@gmail.com',
    pass: 'app-password',
  },
});

// Send email
await smtp.send({
  from: { address: 'user@gmail.com' },
  to: [{ address: 'recipient@example.com' }],
  subject: 'Hello from SDK',
  text: 'Plain text body',
  html: '<p>HTML body</p>',
  attachments: [
    {
      filename: 'document.pdf',
      content: buffer,
      contentType: 'application/pdf',
    },
  ],
});
```

### Receiving Email (IMAP)

```typescript
import { getMailbox } from '@happyvertical/messages';

// Create IMAP adapter
const imap = await getMailbox({
  type: 'imap',
  host: 'imap.gmail.com',
  port: 993,
  secure: true,
  auth: {
    user: 'user@gmail.com',
    pass: 'app-password',
  },
});

// Connect and fetch messages
await imap.connect();
const messages = await imap.fetch({
  folder: 'INBOX',
  limit: 10,
  unreadOnly: true,
});

// Process messages
for (const msg of messages) {
  console.log(`${msg.from.address}: ${msg.subject}`);
}

// Mark as read
await imap.markRead(messages[0].id);

await imap.disconnect();
```

## Features

- **Multi-protocol support**: SMTP, IMAP (POP3 and Gmail coming soon)
- **Factory pattern**: Simple, consistent API across all adapters
- **Environment variables**: Configure via `HAVE_MESSAGES_*` env vars
- **Type-safe**: Full TypeScript support with strict typing
- **Error handling**: Specific error types for better error management
- **OAuth2 support**: For providers that require it
- **Database sync**: Optional message storage using `@happyvertical/sql`

## Adapters

### SMTP Adapter

**Purpose**: Send email via SMTP protocol

**Capabilities**:
- ✅ Send plain text and HTML email
- ✅ File and inline attachments
- ✅ Multiple recipients (To, CC, BCC)
- ✅ Connection pooling
- ✅ OAuth2 authentication
- ❌ Receive email (use IMAP)

### IMAP Adapter

**Purpose**: Receive and manage email via IMAP protocol

**Capabilities**:
- ✅ Receive email with filters
- ✅ Folder operations (list, create, delete)
- ✅ Message operations (mark read, move, copy, delete)
- ✅ Search functionality
- ✅ OAuth2 authentication
- ❌ Send email (use SMTP)

## Environment Variables

Configure adapters using environment variables:

```bash
# Common settings
HAVE_MESSAGES_TYPE=smtp
HAVE_MESSAGES_HOST=smtp.example.com
HAVE_MESSAGES_PORT=587
HAVE_MESSAGES_USER=user@example.com
HAVE_MESSAGES_PASSWORD=password

# SMTP-specific
HAVE_MESSAGES_SMTP_HOST=smtp.example.com
HAVE_MESSAGES_SMTP_PORT=587

# IMAP-specific
HAVE_MESSAGES_IMAP_HOST=imap.example.com
HAVE_MESSAGES_IMAP_PORT=993
```

## Documentation

For complete API documentation and examples, see [CLAUDE.md](./CLAUDE.md).

## Testing

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type check
pnpm typecheck
```

## Future Enhancements

- POP3 adapter
- Gmail API adapter
- Optional encryption (PGP/S/MIME) via `@happyvertical/encryption`
- Advanced threading support
- IDLE push notifications (IMAP)

## License

MIT
