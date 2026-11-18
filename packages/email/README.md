# @happyvertical/email

Low-level email clients for SMTP, IMAP, POP3, Gmail, and JMAP. Create an adapter with
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

## JMAP and the incremental change feed

The `jmap` adapter speaks JMAP (RFC 8620 core, RFC 8621 mail) and works with any
JMAP server, such as Stalwart or Fastmail. Pass the server origin; the session
is discovered at `/.well-known/jmap`. Credentials come from the caller: Basic
with an app password, or a bearer token.

```typescript
import { getEmailClient, isResyncRequired } from '@happyvertical/email';

const client = await getEmailClient({
  type: 'jmap',
  url: 'https://mail.example.com',
  auth: { user: 'me@example.com', pass: appPassword }, // or { type: 'bearer', token }
});

// Keep a mailbox in step. The cursor is opaque: persist it only after the
// batch is applied, and apply batches idempotently (key on message `id`).
let cursor: string | undefined = loadCursor();
for (;;) {
  const result = await client.getChanges?.({ cursor, limit: 100 });
  if (!result) break; // adapter has no change feed (see getCapabilities().changeFeed)
  if (isResyncRequired(result)) {
    cursor = undefined; // start the initial pass again
    continue;
  }
  apply(result.added, result.changed, result.removed, result.folders);
  cursor = result.cursor;
  saveCursor(cursor);
  if (!result.hasMore) break;
}
```

`getChanges()` is part of the protocol-neutral `EmailClient` contract
(`changeFeed` capability). Omit `cursor` for the initial pass; it is paged and
resumable like any later batch, and mail that arrives during it is reported by
the first incremental batch. A cursor the server can no longer continue from
(JMAP `cannotCalculateChanges`), that is malformed, or that belongs to another
account returns `{ status: 'resync-required' }` instead of throwing.
`subscribeChanges()` (`push` capability) is an optional EventSource hint that
tells you when to call `getChanges()`; it carries no data.

## Triage write-back and submission

Optional `EmailClient` methods, advertised by `getCapabilities().writeBack`
(absent or `false` means unsupported, the method is `undefined`; IMAP, Gmail
and the other adapters do not implement them yet). The JMAP adapter implements
all of them:

- `updateFlags(ids, { add, remove })`: `\\Seen`, `\\Flagged`, `\\Answered` or any
  keyword (`$junk`, `$phishing`, custom). `\\Draft`/`\\Deleted` are rejected.
- `updateLabels(ids, { add, remove })`: mailbox membership by name, path, id or `\\Role`.
- `archive(ids)` (inbox to Archive), `markSpam(ids, spam = true)` (Junk plus `$junk`/`$notjunk`).
- `createDraft`, `updateDraft` (replaces the draft, so the id changes), `deleteDraft`.
  Only messages carrying `$draft` are touched.
- `listIdentities()` and `send()`. `send()` uses `EmailSubmission/set`; the
  From address must belong to one of the account's identities (wildcards such
  as `*@example.com` supported) or nothing is created or sent. `identityId`,
  `draftId` (draft-then-submit) and `saveToSent` are `SendOptions`. Attachments
  must reference an already uploaded blob (`Attachment.id`).

Per-message outcomes are returned (`WriteBackResult { updated, failed, state,
oldState }`), not thrown, and every operation is idempotent, so a replay after
a crash is safe. Submission and write-back use the same trusted-origin and
https checks as the rest of the adapter.

## Package validation

```sh
pnpm exec turbo run build --filter=@happyvertical/email...
pnpm --filter @happyvertical/email test
pnpm --filter @happyvertical/email typecheck
```
