# @happyvertical/email

Low-level email clients for SMTP, IMAP, POP3, and Gmail. Create an adapter with
`getEmailClient(options)`; the shared `EmailClient` interface provides connection,
sending, receiving, and mailbox operations where supported by the adapter.

## SMTP transport security

`SMTPOptions.secure: true` establishes implicit TLS, commonly on port 465.
For submission using STARTTLS, commonly on port 587, set `secure: false` and
`requireTLS: true`. The SMTP adapter forwards `requireTLS` to Nodemailer: the
connection fails if the server cannot complete the TLS upgrade. A server without
STARTTLS must not receive a fallback plaintext message when this option is true.

```typescript
import { getEmailClient } from '@happyvertical/email';

const client = await getEmailClient({
  type: 'smtp',
  host: process.env.HAVE_EMAIL_SMTP_HOST ?? '',
  port: 587,
  secure: false,
  requireTLS: true,
  tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  debug: false,
});
// Configure SMTP authentication through the SDK environment variables or auth.
// Connect/send as needed, and always disconnect when finished.
```

`requireTLS` is optional. Omitting it or setting it to `false` preserves the
existing opportunistic STARTTLS behavior: transport encryption is not guaranteed
if the server does not offer STARTTLS. Choose `requireTLS: true` when that fallback
is unacceptable. It does not disable certificate validation or change `secure`.
Set `debug: false` for messages containing authentication links or other secrets.

## Package validation

```sh
pnpm exec turbo run build --filter=@happyvertical/email...
pnpm --filter @happyvertical/email test
pnpm --filter @happyvertical/email typecheck
```
