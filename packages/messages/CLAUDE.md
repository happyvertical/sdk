# @happyvertical/messages

Unified multi-channel messaging with adapter-based architecture. Protocol-only — no database persistence (use `@happyvertical/smrt-messages` for that).

## Architecture

```
getMessageClient({ type: 'slack', botToken: '...' })
  → SlackAdapter (WebClient)

getMessageClient({ type: 'twitter', apiKey: '...', ... })
  → TwitterAdapter (OAuth 1.0a + fetch)

getMessageClient({ type: 'email', emailOptions: { type: 'smtp', ... } })
  → EmailBridgeAdapter → @happyvertical/email
```

## Quick Start

```typescript
import { getMessageClient } from '@happyvertical/messages';

// Slack
const slack = await getMessageClient({ type: 'slack', botToken: 'xoxb-...' });
await slack.connect();
await slack.send({
  from: { name: 'Bot' },
  channelId: 'C12345',
  content: 'Hello from SMRT!',
});

// Twitter
const twitter = await getMessageClient({
  type: 'twitter',
  apiKey: 'key', apiSecret: 'secret',
  accessToken: 'token', accessSecret: 'secret',
});
await twitter.send({ from: { id: 'me' }, content: 'Hello world!' });

// Email (bridged from @happyvertical/email)
const email = await getMessageClient({
  type: 'email',
  emailOptions: { type: 'smtp', host: 'smtp.gmail.com', port: 587, auth: { user: 'x', pass: 'y' } },
});
await email.send({
  from: { name: 'Me', address: 'me@example.com' },
  to: [{ address: 'you@example.com' }],
  subject: 'Test',
  content: 'Hello!',
});
```

## Adapters

| Adapter | Protocol | External Dep |
|---------|----------|-------------|
| `SlackAdapter` | Slack Web API | `@slack/web-api` |
| `TwitterAdapter` | Twitter API v2, OAuth 1.0a | None (node:crypto) |
| `EmailBridgeAdapter` | SMTP/IMAP/POP3/Gmail | `@happyvertical/email` |

## Unified MessageClient Interface

All adapters implement:
- `send(message, options?)` → `SendResult`
- `fetch(options?)` → `Message[]`
- `getMessage(messageId)` → `Message`
- `getThread(threadId)` → `Message[]`
- `listChannels?()` → `Channel[]`
- `connect()` / `disconnect()` / `isConnected()`
- `getCapabilities()` / `getAdapter()`

## Error Hierarchy

```
MessagingError (base)
├── ConnectionError
├── AuthenticationError
├── SendError
├── MessageNotFoundError
├── ChannelNotFoundError
├── RateLimitError
└── InvalidMessageError
```

## Re-exports from @happyvertical/email

For convenience: `getEmailClient`, `EmailClient`, `EmailMessage`, `EmailSendResult`, `GetEmailClientOptions`.
