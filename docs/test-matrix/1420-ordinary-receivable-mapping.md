# SDK1420 test design
High risk: financial external contract/authority. Existing retained API bytes must be preserved. All tests are Node26 Vitest, public QuickBooks provider or pure request contract, controlled HTTP only. No SDK database/transaction boundary exists; durable workflow/rollback is host Commerce responsibility and tested there.

|Behavior|Trigger/actor|Positive|Negative/failure|Executor/runtime/edge|Evidence|
|---|---|---|---|---|---|
|Ordinary mapping|Reviewed ordinary AR/cash customer scope|Verify only real AR/cash; application no cash|Unknown kind, retained/release fields, duplicate refs, unsupported timing/currency, missing cash rejected|Node pureprepare+fakeHTTPmetadata, noSQL|focused receivable-transfer test|
|Money directions|Ordinary application/refund/reversal|Exactminor lines, source/customer/currency, no banksettlementclaim|Withhold/release reject beforeIO; changed input/hash/readback rejected|Node publicprovider/fakeHTTP|same|
|Scope/current capacity|Ordinary source/customer/realm|Matching reviewed provider metadata passes|Foreign realm/customer/currency/inactive account/overcapacity reject with0POST|Node publicprovider/fakeHTTP|same|
|Retry/unknown|Provider missing/malformed success|Exact retained request identity and read by externalID, no repeatedPOST|Unknown outcome never accepted|Node publicprovider/fakeHTTP, existing retained regressions +ordinarycase|same|
|Compatibility|Existing retained consumers|Base-produced request descriptor snapshot/hash unchanged|Retained mapping still requires actualretainedaccount+hostduedates|Node pureprepare baseline snapshot|same|

Command: pnpm --filter @happyvertical/accounting test src/providers/quickbooks/receivable-transfer.test.ts. Baseline run before production edits establishes new ordinary positives fail; existing retained descriptor snapshot generated only on base. Scoped TypeScript/build/export gates after fix; required repository CI remains mandatory beforemerge.
