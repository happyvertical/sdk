# Issue 1510 test design

All cases use untrusted local bytes and a single caller, without persistence,
transactions, authentication, services, or retries (N/A: pure parsing/profiling
and in-memory serialization). Runtime target: Node and browser Web APIs.
Command for every row: `pnpm --filter @happyvertical/spreadsheets test`.

| Behavior / reachable trigger | Positive case | Failure case | Level / external edge |
| --- | --- | --- | --- |
| Factory called with options | xlsx/csv, optional limits | unknown type, invalid limits | unit / open adapter options |
| XLSX ZIP bytes | classic stored/deflated archives | bombs, forged size, traversal, truncation, encryption, ZIP64, multidisk, counts | unit / untrusted ZIP |
| XML parts | namespaces, escaped Unicode, rich text | DTD/entities, malformed tags, excessive depth/text/nodes | unit / untrusted XML |
| Workbook read | shared/array formulas, names, tables, validation, dates, states, panes | bad relationships, bounds, missing parts, limits | integration / OOXML |
| XLSX output | multiple sheets, typed values, styles, formulas, widths/header | invalid models and output limits | round trip / OOXML consumers |
| CSV bytes | quoting, multiline, BOM, delimiters, conservative types and originals | malformed quotes, oversized fields/rows/cells | unit / RFC 4180 |
| Profiling | business workbook regions/stats/patterns/dependencies/lookups/aggregates/overlaps | sparse/ragged/empty sheets, strings resembling formulas | unit / facts only |
| Browser root import | browser bundle loads with Web APIs | transitive Node builtin imports | bundle smoke / browser module graph |

The suite includes three unmodified, licensed producer files from readxl (Excel,
LibreOffice and Google Sheets; provenance in `test/fixtures/README.md`). All three
read and round-trip. Browser coverage bundles the entire root, rejects Node
builtin imports, and executes XLSX/CSV and profiling in a VM with browser Web
APIs. It is not a real browser-engine run. Opening exports in the actual three
applications was not performed. Base-regression comparison is N/A: this package
does not exist on the base revision.

Initial implementation validation: all 26 package tests passed; package build and typecheck passed.
Root `pnpm test:ci-scripts` passed all 85 tests; `pnpm agent:check` passed.
Root `pnpm build`, `pnpm typecheck`, and `pnpm lint` passed with
`--filter=@happyvertical/spreadsheets... --filter=@happyvertical/sdk-mcp...`.
The affected build graph contains spreadsheets, sdk-mcp, ai, files and utils;
Turbo executes only tasks those packages define. `pnpm install` and
`pnpm install --frozen-lockfile` passed. Workspace consistency, a built-root
consumer smoke, `git diff --check`, and a control-byte scan of changed text and
the new package's dist output also passed.

Self-review covered the full change, including shared ZIP policy,
actual inflation bounds, descriptor/CRC checks, XML rejection and resource limits,
formula handling, serialization, profiling, and the browser import graph.
Independent integrated review and publication belong to the coordinating session;
this implementation worker did not change claims, push or open a PR.

## Coordinator feedback test additions

| Behavior / trigger | Positive case | Negative case | Runtime / level / command |
| --- | --- | --- | --- |
| Shared files archive entry | built subpath bundles and executes with Web APIs, signed/unsigned descriptors (including CRC/signature collision) | missing/misplaced/tampered descriptor, conflicting local metadata, overlap/path attacks | Node + browser-like VM / package integration / `pnpm --filter @happyvertical/files test` |
| Spreadsheet shared archive import | all existing producer and root browser tests | existing hostile archive cases | Node + browser-like VM / integration / `pnpm --filter @happyvertical/spreadsheets test` |

Actor/executor remain a single caller and in-memory bytes; authentication,
persistence and transactions are N/A. The browser check resolves the published
subpath after building files, rather than importing source directly.

| Compression behavior / trigger | Positive case | Negative case | Runtime / command |
| --- | --- | --- | --- |
| Writer's deflated worksheet above ratio floor | 200,000 repetitive cells read back with defaults; independent ratio/floor overrides; valid small worksheet above 200:1 | low ratio above floor fails with typed error | Node / `pnpm --filter @happyvertical/spreadsheets test` |
| Untrusted DEFLATE stream with understated ZIP sizes | ordinary deflated producer fixtures | real compressed bomb exceeds actual per-entry or total cap despite forged size and permissive ratio | Node / same command |

The primary protection is the actual inflated-byte count checked on every output
chunk. Ratio enforcement uses actual inflated bytes per entry only above an
8 MiB default floor, with a secondary default ratio of 1,000:1; both are options.

Coordinator-feedback validation: 29 spreadsheet tests pass, including the
200,000-cell compressed workbook, valid XML above 200:1, configurable ratio/floor,
and forged-size bombs hitting actual per-entry and aggregate caps. Files' 83
archive/browser tests and 210 tests excluding loopback/MinIO suites pass. Both
package builds and typechecks pass. Root CI-script tests (85), agent context,
affected-graph build/typecheck/lint, workspace consistency and built-root smoke
pass. A scan of 86 changed/generated text files found no stray control bytes.
The loopback suites await clarification of the earlier no-network-services
constraint; MinIO tests require containers and remain outside the allowed run.
