---
"@happyvertical/messages": minor
---

Add new @happyvertical/messages package for unified email operations

New package providing adapter-based email operations with support for multiple protocols:

**Features:**
- SMTP adapter for sending email (nodemailer)
- IMAP adapter for receiving email (imapflow)
- Unified Mailbox interface for consistent API
- Factory pattern with environment variable support
- Comprehensive error handling with specific error types
- Full TypeScript support with strict typing
- Database synchronization support (optional)
- OAuth2 authentication support

**SMTP Capabilities:**
- Plain text and HTML email
- File and inline attachments
- Multiple recipients (To, CC, BCC)
- Connection pooling
- Custom headers and options

**IMAP Capabilities:**
- Fetch messages with filters
- Folder operations (list, create, delete)
- Message operations (mark read, move, copy, delete)
- Search functionality
- OAuth2 authentication

**Future Enhancements:**
- POP3 adapter (mailpop3)
- Gmail API adapter (googleapis)
- Optional encryption (PGP/S/MIME) when @happyvertical/encryption is available
