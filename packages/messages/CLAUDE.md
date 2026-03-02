# @happyvertical/messages

Multi-channel messaging. Factory: `getMessageClient(options): Promise<MessageClient>`.
Protocol-only — no database persistence (use `@happyvertical/smrt-messages` for that).

## Adapters

Slack (full — threads, channels, message fetch), Twitter (full — OAuth 1.0a via `node:crypto`), Email (bridge to `@happyvertical/email`, limited).

## Gotchas

- Slack messageId is composite `channel:ts` format — both parts needed for retrieval
- Twitter `connect()`/`disconnect()` are no-ops (stateless)
- Email `fetch()` throws "not implemented" — email doesn't support batch fetch
- Email bridge initializes lazily on first use
- ThreadId mapping differs: Slack `thread_ts`, Twitter `in_reply_to_status_id`
