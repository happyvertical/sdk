# @happyvertical/email

Low-level email protocol operations. Factory: `getEmailClient(options): Promise<EmailClient>`.

## Adapters

SMTP (send-only, Nodemailer), IMAP (full folder/message, ImapFlow), POP3 (receive-only, no search), Gmail (combined send/receive, OAuth2).

## Gotchas

- SMTP/IMAP/POP3 need host+port+auth; Gmail needs OAuth2 (clientId/secret/refreshToken)
- POP3 has no folders, no search — only delete or leave-on-server
- Gmail uses labels not folders; has threadId for threading
- `SendResult` returns accepted/rejected arrays — partial failures possible
- Env vars use `HAVE_EMAIL_*` prefix
