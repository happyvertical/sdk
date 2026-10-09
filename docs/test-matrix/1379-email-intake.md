# Email retrieval and reply provenance (#1379)

Patch repair; public API and authentication behavior are unchanged. IMAP searches return UIDs, so every subsequent fetch must explicitly interpret its range as UIDs. POP3 must retain available parsed reply identities before downstream consumers acknowledge messages. No database executor, transaction, tenant context, or mutation is involved.

| Behavior | Trigger and positive case | Negative case | Actor/context and executor | Runtime/external edge | Test level and command |
| --- | --- | --- | --- | --- | --- |
| IMAP getMessage/fetch/search use UID ranges | UID42 occupies sequence1; each public path returns correct identity, reply headers and attachment bytes | No search results; upstream fetch failure | Configured client; mocked protocol transport, real MIME parser; transaction N/A (read only) | Supported Node; ImapFlow third fetch argument versus query fields | Transport-boundary regression; `pnpm --filter @happyvertical/email test` |
| POP3 preserves optional reply metadata | Single reference becomes array; multiple references retain order; inReplyTo preserved | Absent optional headers remain undefined; unknown UIDL cannot retrieve another message; upstream RETR failure | Configured client; mocked POP3 transport, real MIME parser; transaction N/A (read only) | Supported Node; mailparser string/array contract, unchanged attachment bytes | Transport-boundary regression; same command |

These tests replace only protocol transports and use the public factory/connect/read/disconnect surface. No private adapter state, live account credentials, or provider quality claim. Unknown enum values are N/A: the patch introduces no enum. Malformed MIME handling remains mailparser-owned; no parser policy changes. Retry/atomicity is N/A for this read-only repair.

Base regression: 5 failed / 9 passed, covering all three UID paths and both populated POP3 reply cases. Fixed provider run: 14 passed. The absent-header and error cases passed on both revisions. Full command outputs and hashes are retained in the implementation evidence. Downstream consumers must consume the normally released SDK; no dependency override or consumer workaround is part of this repair.
