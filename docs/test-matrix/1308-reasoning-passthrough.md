# #1308 Explicit reasoning passthrough

Standard risk: correcting serialization of existing public options; no new API,
persistence, authorization or schema. GPT-6 completion-token shaping belongs to
#1368 / PR #1374, integrated at its actual merge `2675b536`.
Combined Luna chat/stream regressions cover direct OpenAI, LiteLLM and Bifrost
completion-token limits, explicit none effort and omitted temperature.

| Behavior / invariant | Reachable trigger / positive | Negative / edge | Actor / executor | Runtime / external edge | Level / command |
| --- | --- | --- | --- | --- | --- |
| Direct OpenAI preserves explicit effort | Public chat and stream with reasoning effort none/low | Absent reasoning adds no reasoning field; no gateway envelope | Caller; HTTP request, no transaction | Node26 / Chat Completions JSON and SSE | Local HTTP regression: `pnpm --filter @happyvertical/ai exec vitest --config ../../vitest.package.config.ts run reasoning-wire.test.ts` |
| Gateways preserve effort without token cap | LiteLLM top-level effort and Bifrost nested effort, chat/stream | Bifrost cap/thoughts retained; LiteLLM explicit unsupported controls fail before HTTP | Caller; HTTP request | Node26 / compatible provider envelope | Same local HTTP suite |
| Explicit configuration errors remain observable | Upstream rejects unsupported effort/model | Original upstream failure surfaces, no hidden retry | Caller; maxRetries0 | Local HTTP400; no paid endpoint | Same local HTTP suite |
| Omitted/default behavior remains unchanged | No reasoning supplied | No implicit opt-in reasoning; existing token/sampling behavior retained | Caller; request serialization | GPT4/GPT5/GPT6 token behavior separately owned | Full AI suite and existing provider regressions |

Capture baseline regression failure before implementation, then final results.
Full AI suite, documented root CI-scripts/agent/type/lint/build gates, and an actual
published-entry local HTTP probe apply. Live providers are excluded by the explicit
no-paid-inference instruction; credentials are removed from test process environment.
Auth/tenant/dialects/rollback: N/A, no storage or authority change. Unknown effort
values are provider-validated; the adapter must preserve upstream error behavior.

PR #1383 round2: strict local LiteLLM endpoint rejects nested `reasoning` on
Chat Completions, following its documented protocol. Baseline17fail/20pass;
cover effort-only chat/stream, omitted controls, explicit budget0/32 and thoughts
true/false rejection with zero HTTP requests, legacy thoughts, and image-to-chat
normalization without mistaking inferred budgets for explicit caller controls.
LiteLLM v1.103 PR36363 translates Responses reasoning only; it does not make a
nested Chat Completions envelope supported. Bifrost and direct OpenAI are unchanged.
