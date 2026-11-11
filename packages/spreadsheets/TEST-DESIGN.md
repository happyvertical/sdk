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

## F2: bounded processing of hostile workbook structure

One untrusted local-byte caller; pure in-memory parsing/profiling. Authentication,
transactions and services are N/A. Node execution plus the existing browser-root
bundle check cover the runtime boundary. Command: package `pnpm test`.

| Invariant / reachable trigger | Positive | Negative | Level / external edge |
| --- | --- | --- | --- |
| Name/table resolution uses workbook indexes | scoped names and contextual table columns preserve existing evidence | 100k names × 100k named formulas finish or typed limit | hostile integration / OOXML + model |
| Structural metadata and part references are bounded | ordinary names/tables/validations/merges | configured limits and duplicate tablePart references | unit + hostile ZIP |
| Formula tokenization is linear and cached | quoted sheets, calls, arguments, references and normalized patterns reuse one scan | 8192-char nested calls and unclosed brackets/quotes across cells | hostile integration / formula text |
| Profile inner work is bounded | business workbook evidence unchanged | wide cross-sheet overlaps, disconnected regions, many totals and large shared values | unit + hostile model |
| CSV/format processing cannot amplify shared strings | ordinary conservative CSV types and format kinds | long fields/formats and sparse dense expansion stop within budget | unit / text + model |

Each hostile case records processing wall time and asserts under 5 seconds.
Regressions are checked with deterministic limit assertions as well as timings;
the new inner-work limits do not exist on the reviewed base.

F2 validation (processing times exclude fixture/model construction):

| Hostile processing case | Wall time (ms) |
| --- | ---: |
| 100k names × 100k formulas / defaults | 473.52 |
| 100k names × 100k formulas / indexed read + profile | 972.99 |
| 8192-char nested calls × 1000 cells | 394.23 |
| 8192-char unclosed brackets × 1000 cells | 285.31 |
| 8192-char unclosed quotes × 1000 cells | 283.72 |
| 100k duplicate tablePart references / default | 105.10 |
| 100k duplicate tablePart references / one parsed table | 137.14 |
| 16,384 × 16,384 overlap columns | 108.12 |
| 100k disconnected regions | 374.93 |
| 8192-char shared formula × 5000 followers | 36.40 |
| 1000 shared 1M-character values | 3.12 |
| 100k-char number format × 10k cells | 38.81 |
| 500k-character hostile CSV field | 18.50 |
| CSV repeated 1M-character values | 0.39 |

All timed cases assert less than 5,000 ms. The raised-name-limit case completes
both reading and profiling with all 100,000 names and formula cells; duplicate
parts with a raised reference limit produce exactly one table. Default limits
and the work/depth guards return `SpreadsheetError` / `LIMIT_EXCEEDED`.

Safe base regression: source from reviewed revision `7653a6c3` accepted two
names with `maxDefinedNames: 1`; the same bytes on this revision throw typed
`LIMIT_EXCEEDED` with `limit: maxDefinedNames`. The old large quadratic probe was
not run; the index and timing tests exercise the full large case on this fix.

Final commands: package `pnpm build`, `pnpm test` (40 passed), `pnpm typecheck`,
`pnpm lint`, root `pnpm install --frozen-lockfile`, and `pnpm agent:check` passed.
The lockfile was verified unchanged. The original 29 feature/interoperability
checks, including the 200,000-cell compressed export and browser entry check,
remain green. No container/network-service suites were needed for this fix.
